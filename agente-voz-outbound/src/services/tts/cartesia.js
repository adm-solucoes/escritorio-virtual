import WebSocket from "ws";
import { randomUUID } from "node:crypto";
import { promises as fsPromises } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../../config.js";

const VERSAO_API = process.env.CARTESIA_VERSION || "2024-11-13";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARQUIVO_LOG = path.join(__dirname, "..", "..", "..", "logs", "tts-diagnostico.log");

// Se o streaming da Cartesia parar de mandar chunk sem nunca mandar "done"
// nem "error" (visto na prática — "a fala da Fernanda parou no meio"), sem
// isso a Promise de `aguardar()` nunca resolve nem rejeita, e a ligação fica
// muda pro resto do turno sem NENHUM log ou erro. Esse timeout garante que um
// engasgo desses vira um evento visível em vez de um silêncio sem explicação.
const TIMEOUT_SEM_CHUNK_MS = 8000;

/** Log em arquivo (não só console) pra dar pra investigar depois, sem precisar
 * estar olhando o terminal no momento exato em que o engasgo aconteceu. */
async function logDiagnostico(evento) {
  try {
    const linha = { ts: new Date().toISOString(), ...evento };
    await fsPromises.mkdir(path.dirname(ARQUIVO_LOG), { recursive: true });
    await fsPromises.appendFile(ARQUIVO_LOG, JSON.stringify(linha) + "\n", "utf8");
  } catch {
    // log é diagnóstico, nunca pode derrubar a ligação por falha de disco etc.
  }
}

/**
 * Sessão de TTS via WebSocket da Cartesia — uma conexão por ligação, reusada
 * pra cada fala do agente (menos overhead de handshake que abrir/fechar a
 * cada frase).
 *
 * Formato de saída pedido direto em pcm_mulaw/8000/raw: é o MESMO formato que
 * o Twilio Media Streams espera de volta, então o áudio que chega aqui vai
 * reto pro WebSocket do Twilio sem nenhuma transcodificação.
 *
 * Autenticação: X-API-Key (uso server-to-server, não o access_token de
 * cliente/browser).
 */
export class CartesiaTtsSession {
  #ws;
  #pronto;
  #callId;
  #pendentes = new Map(); // contextId -> { onChunk, onDone, onErro, watchdog, primeiroChunkEm, iniciadoEm }

  constructor(callId) {
    this.#callId = callId ?? "desconhecido";
    this.#pronto = new Promise((resolve, reject) => {
      this.#ws = new WebSocket(`wss://api.cartesia.ai/tts/websocket?cartesia_version=${VERSAO_API}`, {
        headers: { "X-API-Key": config.tts.cartesia.apiKey },
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
      const pendente = this.#pendentes.get(evento.context_id);
      if (!pendente) return; // contexto já cancelado/concluído — ignora

      if (evento.type === "chunk" && evento.data) {
        this.#reiniciarWatchdog(evento.context_id, pendente);
        if (!pendente.primeiroChunkEm) {
          pendente.primeiroChunkEm = Date.now();
          logDiagnostico({
            callId: this.#callId,
            contextId: evento.context_id,
            evento: "primeiro_chunk",
            latenciaMs: pendente.primeiroChunkEm - pendente.iniciadoEm,
          });
        }
        pendente.onChunk(Buffer.from(evento.data, "base64"));
        if (evento.done) {
          clearTimeout(pendente.watchdog);
          this.#pendentes.delete(evento.context_id);
          logDiagnostico({ callId: this.#callId, contextId: evento.context_id, evento: "concluido" });
          pendente.onDone();
        }
      } else if (evento.type === "done") {
        clearTimeout(pendente.watchdog);
        this.#pendentes.delete(evento.context_id);
        logDiagnostico({ callId: this.#callId, contextId: evento.context_id, evento: "concluido" });
        pendente.onDone();
      } else if (evento.type === "error") {
        clearTimeout(pendente.watchdog);
        this.#pendentes.delete(evento.context_id);
        logDiagnostico({
          callId: this.#callId,
          contextId: evento.context_id,
          evento: "erro_cartesia",
          detalhe: evento.error,
        });
        pendente.onErro(new Error(evento.error || "erro desconhecido da Cartesia"));
      }
    });

    this.#ws.on("close", () => {
      logDiagnostico({ callId: this.#callId, evento: "conexao_fechou", pendentes: this.#pendentes.size });
      for (const p of this.#pendentes.values()) {
        clearTimeout(p.watchdog);
        p.onErro(new Error("conexão com a Cartesia fechou"));
      }
      this.#pendentes.clear();
    });

    this.#ws.on("error", (err) => {
      console.error("[cartesia] erro na conexão:", err.message);
    });
  }

  /** Reagenda o timeout de silêncio toda vez que um chunk novo chega — só
   * dispara se ficar `TIMEOUT_SEM_CHUNK_MS` sem NENHUM evento nesse contexto. */
  #reiniciarWatchdog(contextId, pendente) {
    clearTimeout(pendente.watchdog);
    pendente.watchdog = setTimeout(() => {
      if (!this.#pendentes.has(contextId)) return; // já concluiu enquanto o timer esperava
      this.#pendentes.delete(contextId);
      logDiagnostico({
        callId: this.#callId,
        contextId,
        evento: "ENGASGO_SEM_CHUNK",
        detalhe: `sem nenhum evento da Cartesia por ${TIMEOUT_SEM_CHUNK_MS}ms — fala interrompida no meio`,
      });
      pendente.onErro(new Error(`Cartesia parou de mandar áudio (sem chunk por ${TIMEOUT_SEM_CHUNK_MS}ms)`));
    }, TIMEOUT_SEM_CHUNK_MS);
  }

  /**
   * Sintetiza um trecho de texto, streaming de verdade: `onAudioChunk` é
   * chamado a cada pedaço de áudio (Buffer já em mulaw/8000, pronto pro
   * Twilio) conforme chega, sem esperar a fala inteira terminar.
   *
   * Retorna `{ contextId, aguardar, cancelar }`:
   *  - `aguardar()` resolve quando a fala termina normalmente
   *  - `cancelar()` interrompe (usado no barge-in, quando o usuário fala por
   *    cima do agente)
   */
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
      // Watchdog já ativo antes do primeiro chunk também — se a Cartesia
      // nunca responder nada pra esse contexto, isso pega esse caso também,
      // não só um engasgo no meio do streaming.
      this.#reiniciarWatchdog(contextId, pendente);
    });

    logDiagnostico({ callId: this.#callId, contextId, evento: "enviado", tamanhoTexto: texto.length });

    // Se o `send` falhar (socket já fechado, etc), a promise acima ficaria
    // pendente pra sempre e travaria quem estiver esperando a fala terminar.
    try {
      this.#ws.send(
        JSON.stringify({
          model_id: config.tts.cartesia.modelo,
          transcript: texto,
          voice: { mode: "id", id: config.tts.cartesia.vozId },
          language: "pt",
          output_format: { container: "raw", encoding: "pcm_mulaw", sample_rate: 8000 },
          context_id: contextId,
          continue: false,
        })
      );
    } catch (err) {
      const pendente = this.#pendentes.get(contextId);
      if (pendente) {
        clearTimeout(pendente.watchdog);
        this.#pendentes.delete(contextId);
        logDiagnostico({ callId: this.#callId, contextId, evento: "falha_envio", detalhe: err.message });
        pendente.onErro(new Error(`falha ao enviar texto pra Cartesia: ${err.message}`));
      }
    }

    // Cancelamento (barge-in): tem que RESOLVER a promise, não só remover o
    // contexto do mapa. Sem isso, `aguardar()` nunca resolve nem rejeita e
    // quem estiver no `await` trava pra sempre — o que, no caminho de
    // encerramento da ligação (`while (processando ...)` em
    // ConversationSession), vira loop infinito e a ligação nunca desliga.
    const cancelar = () => {
      cancelado = true;
      const pendente = this.#pendentes.get(contextId);
      if (!pendente) return;
      clearTimeout(pendente.watchdog);
      this.#pendentes.delete(contextId);
      try {
        this.#ws.send(JSON.stringify({ context_id: contextId, cancel: true }));
      } catch {
        // socket já caiu — o cancelamento local abaixo é o que importa
      }
      logDiagnostico({ callId: this.#callId, contextId, evento: "cancelado_barge_in" });
      pendente.onDone(); // interrupção é fim normal da fala, não erro
    };

    return { contextId, aguardar: () => aguardar, cancelar };
  }

  fechar() {
    // Resolve qualquer fala ainda pendente ANTES de fechar o socket: se o
    // socket já estiver em CLOSING/CLOSED, o evento "close" (que é quem
    // normalmente libera as pendentes) pode não disparar de novo, e quem
    // estiver no `await aguardar()` travaria pra sempre.
    for (const [contextId, pendente] of this.#pendentes) {
      clearTimeout(pendente.watchdog);
      logDiagnostico({ callId: this.#callId, contextId, evento: "encerrado_com_fala_pendente" });
      pendente.onErro(new Error("sessão de TTS encerrada com fala ainda em andamento"));
    }
    this.#pendentes.clear();

    // `ws.close()` pode lançar SINCRONAMENTE se o socket já estiver num
    // estado inconsistente (ex: erro de handshake concorrente com uma chave
    // de API inválida) — visto na prática ao testar. Sem este try/catch, uma
    // única ligação com problema na conexão da Cartesia derruba o processo
    // Node inteiro, junto com QUALQUER outra ligação em andamento no lote.
    try {
      if (this.#ws.readyState === WebSocket.OPEN || this.#ws.readyState === WebSocket.CONNECTING) {
        this.#ws.close();
      }
    } catch (err) {
      console.error("[cartesia] erro ao fechar conexão (ignorado):", err.message);
    }
  }
}
