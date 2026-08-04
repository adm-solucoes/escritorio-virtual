import WebSocket from "ws";
import { randomUUID } from "node:crypto";
import { promises as fsPromises } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../../config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARQUIVO_LOG = path.join(__dirname, "..", "..", "..", "logs", "tts-diagnostico.log");

// Mesma cautela da Cartesia: se o streaming parar de mandar áudio sem nunca
// mandar o final (isFinal), a fala trava pra sempre sem nenhum erro visível.
const TIMEOUT_SEM_CHUNK_MS = 8000;

/** Mesmo arquivo de log da Cartesia — dá pra comparar os dois provedores lado
 * a lado (latência, engasgos) só olhando um arquivo. */
async function logDiagnostico(evento) {
  try {
    const linha = { ts: new Date().toISOString(), provedor: "elevenlabs", ...evento };
    await fsPromises.mkdir(path.dirname(ARQUIVO_LOG), { recursive: true });
    await fsPromises.appendFile(ARQUIVO_LOG, JSON.stringify(linha) + "\n", "utf8");
  } catch {
    // log é diagnóstico, nunca pode derrubar a ligação por falha de disco etc.
  }
}

/**
 * Sessão de TTS via WebSocket "multi-context" da ElevenLabs — uma conexão
 * por ligação, reusada pra cada fala (mesmo padrão da Cartesia). Usa o
 * endpoint multi-stream-input especificamente porque ele suporta múltiplos
 * `context_id` na MESMA conexão, incluindo fechar um contexto individual sem
 * derrubar o socket inteiro — é isso que permite implementar barge-in (mesmo
 * conceito do `cancel` da Cartesia).
 *
 * Formato de saída pedido direto em ulaw_8000 (query param): mesmo formato
 * que o Twilio espera de volta, sem transcodificação — igual à Cartesia.
 *
 * Autenticação: header `xi-api-key` (server-to-server).
 */
export class ElevenLabsTtsSession {
  #ws;
  #pronto;
  #callId;
  #pendentes = new Map(); // contextId -> { onChunk, onDone, onErro, watchdog, primeiroChunkEm, iniciadoEm }

  constructor(callId) {
    this.#callId = callId ?? "desconhecido";

    const params = new URLSearchParams({
      model_id: config.tts.elevenlabs.modelo,
      output_format: "ulaw_8000",
      language_code: "pt",
    });
    const url = `wss://api.elevenlabs.io/v1/text-to-speech/${config.tts.elevenlabs.vozId}/multi-stream-input?${params}`;

    this.#pronto = new Promise((resolve, reject) => {
      this.#ws = new WebSocket(url, {
        headers: { "xi-api-key": config.tts.elevenlabs.apiKey },
      });
      this.#ws.once("open", resolve);
      this.#ws.once("error", reject);
    });

    this.#ws.on("message", (dados) => {
      let evento;
      try {
        evento = JSON.parse(dados.toString());
      } catch {
        return;
      }
      const contextId = evento.contextId;
      const pendente = this.#pendentes.get(contextId);
      if (!pendente) return; // contexto já cancelado/concluído — ignora

      if (evento.audio) {
        this.#reiniciarWatchdog(contextId, pendente);
        if (!pendente.primeiroChunkEm) {
          pendente.primeiroChunkEm = Date.now();
          logDiagnostico({
            callId: this.#callId,
            contextId,
            evento: "primeiro_chunk",
            latenciaMs: pendente.primeiroChunkEm - pendente.iniciadoEm,
          });
        }
        pendente.onChunk(Buffer.from(evento.audio, "base64"));
      }

      if (evento.isFinal) {
        clearTimeout(pendente.watchdog);
        this.#pendentes.delete(contextId);
        logDiagnostico({ callId: this.#callId, contextId, evento: "concluido" });
        pendente.onDone();
      }

      if (evento.error) {
        clearTimeout(pendente.watchdog);
        this.#pendentes.delete(contextId);
        logDiagnostico({ callId: this.#callId, contextId, evento: "erro_elevenlabs", detalhe: evento.error });
        pendente.onErro(new Error(evento.error || "erro desconhecido da ElevenLabs"));
      }
    });

    this.#ws.on("close", () => {
      logDiagnostico({ callId: this.#callId, evento: "conexao_fechou", pendentes: this.#pendentes.size });
      for (const p of this.#pendentes.values()) {
        clearTimeout(p.watchdog);
        p.onErro(new Error("conexão com a ElevenLabs fechou"));
      }
      this.#pendentes.clear();
    });

    this.#ws.on("error", (err) => {
      console.error("[elevenlabs] erro na conexão:", err.message);
    });
  }

  /** Mesmo mecanismo de watchdog da Cartesia — ver comentário lá. */
  #reiniciarWatchdog(contextId, pendente) {
    clearTimeout(pendente.watchdog);
    pendente.watchdog = setTimeout(() => {
      if (!this.#pendentes.has(contextId)) return;
      this.#pendentes.delete(contextId);
      logDiagnostico({
        callId: this.#callId,
        contextId,
        evento: "ENGASGO_SEM_CHUNK",
        detalhe: `sem nenhum evento da ElevenLabs por ${TIMEOUT_SEM_CHUNK_MS}ms — fala interrompida no meio`,
      });
      pendente.onErro(new Error(`ElevenLabs parou de mandar áudio (sem chunk por ${TIMEOUT_SEM_CHUNK_MS}ms)`));
    }, TIMEOUT_SEM_CHUNK_MS);
  }

  /** Mesma assinatura pública da Cartesia — ConversationSession não sabe (e
   * não precisa saber) qual provedor está por trás. */
  async falar(texto, { onAudioChunk }) {
    await this.#pronto;
    const contextId = randomUUID();
    let cancelado = false;

    const aguardar = new Promise((resolve, reject) => {
      const pendente = {
        onChunk: (buf) => {
          if (!cancelado) onAudioChunk(buf);
        },
        onDone: resolve,
        onErro: reject,
        primeiroChunkEm: null,
        iniciadoEm: Date.now(),
        watchdog: null,
      };
      this.#pendentes.set(contextId, pendente);
      this.#reiniciarWatchdog(contextId, pendente);
    });

    logDiagnostico({ callId: this.#callId, contextId, evento: "enviado", tamanhoTexto: texto.length });

    try {
      // Duas mensagens, nesta ordem — confirmado testando contra a API real:
      //  1. o texto com `flush: true` força gerar o áudio já;
      //  2. `close_context` é o que faz a ElevenLabs mandar o `isFinal`.
      // Sem o passo 2 o áudio chega normalmente, mas o `isFinal` NUNCA vem, o
      // contexto fica aberto esperando mais texto, e quem está no
      // `await aguardar()` só sai pelo watchdog — 8 segundos de atraso por
      // fala. Como cada `falar()` já recebe uma frase pronta (o streaming
      // token-a-token acontece antes, do lado do LLM), fechar na hora é
      // correto e não corta áudio nenhum.
      this.#ws.send(JSON.stringify({ text: `${texto} `, context_id: contextId, flush: true }));
      this.#ws.send(JSON.stringify({ context_id: contextId, close_context: true }));
    } catch (err) {
      const pendente = this.#pendentes.get(contextId);
      if (pendente) {
        clearTimeout(pendente.watchdog);
        this.#pendentes.delete(contextId);
        logDiagnostico({ callId: this.#callId, contextId, evento: "falha_envio", detalhe: err.message });
        pendente.onErro(new Error(`falha ao enviar texto pra ElevenLabs: ${err.message}`));
      }
    }

    // Barge-in. Diferença importante em relação à Cartesia: como o contexto
    // já foi fechado no envio (pra conseguir o `isFinal`), a ElevenLabs vai
    // gerar o áudio inteiro de qualquer forma — não dá pra abortar a geração
    // no meio. Na prática o barge-in FUNCIONA mesmo assim, porque o que faz
    // a pessoa parar de ouvir são as duas coisas abaixo: a flag `cancelado`
    // (descarta os chunks que ainda chegarem) e o "clear" que o
    // ConversationSession manda pro Twilio (limpa o áudio já enfileirado lá).
    // O custo é gastar crédito com áudio que ninguém ouve — aceitável no
    // piloto, mas é um ponto a pesar se for pra volume alto.
    // Igual à Cartesia, RESOLVE a promise (não rejeita): interrupção é fim
    // normal da fala, não erro.
    const cancelar = () => {
      cancelado = true;
      const pendente = this.#pendentes.get(contextId);
      if (!pendente) return;
      clearTimeout(pendente.watchdog);
      this.#pendentes.delete(contextId);
      logDiagnostico({ callId: this.#callId, contextId, evento: "cancelado_barge_in" });
      pendente.onDone();
    };

    return { contextId, aguardar: () => aguardar, cancelar };
  }

  fechar() {
    for (const [contextId, pendente] of this.#pendentes) {
      clearTimeout(pendente.watchdog);
      logDiagnostico({ callId: this.#callId, contextId, evento: "encerrado_com_fala_pendente" });
      pendente.onErro(new Error("sessão de TTS encerrada com fala ainda em andamento"));
    }
    this.#pendentes.clear();

    // Mesma cautela da Cartesia: `close()` síncrono pode lançar com o socket
    // num estado inconsistente, e isso não pode derrubar o processo inteiro.
    try {
      if (this.#ws.readyState === WebSocket.OPEN || this.#ws.readyState === WebSocket.CONNECTING) {
        this.#ws.close();
      }
    } catch (err) {
      console.error("[elevenlabs] erro ao fechar conexão (ignorado):", err.message);
    }
  }
}
