import { createClient, LiveTranscriptionEvents } from "@deepgram/sdk";
import { config } from "../../config.js";

/**
 * Sessão de transcrição ao vivo. Recebe os frames de áudio mulaw/8000 direto
 * do Twilio (mesmo formato que o Twilio já manda — Deepgram aceita mulaw
 * nativamente, então não tem transcodificação nenhuma nesse trecho).
 *
 * Dois eventos guiam a detecção de turno:
 *  - `onTranscricaoParcial(texto)`: fala em andamento, útil só pra debug/log.
 *  - `onFalaConcluida(texto)`: Deepgram decidiu (via endpointing/VAD) que a
 *    pessoa parou de falar — É ESTE evento que dispara o turno do LLM.
 *
 * Decisão consciente de latência: disparamos o turno logo depois do
 * `is_final` (~300ms de silêncio, o mínimo que dá pra configurar) em vez de
 * esperar o `UtteranceEnd` (mínimo técnico de ~1s no Deepgram — não dá pra
 * baixar isso).
 *
 * IMPORTANTE (bug real corrigido em 2026-08-03): o Deepgram manda VÁRIOS
 * `is_final` para uma única fala contínua — ele segmenta a frase conforme
 * detecta micro-pausas. Antes, cada `is_final` chamava `onFalaConcluida`
 * direto, e cada chamada dessas abre um turno de LLM novo no
 * ConversationSession. Resultado: dois ou três turnos concorrentes disputando
 * a mesma ligação, se atropelando e deixando o agente MUDO (visto na prática
 * — ligações com 3 e até 5 falas seguidas do lead sem nenhuma resposta).
 * O `bufferFalaAtual` existia pra evitar isso, mas nunca era preenchido:
 * era só lido e zerado, então estava morto.
 *
 * Correção: os `is_final` são acumulados num buffer e só viram um turno
 * depois de `STT_AGRUPAMENTO_MS` sem nenhum segmento novo. Isso agrupa a fala
 * inteira da pessoa num turno só. O custo é esse tempo a mais de latência
 * (padrão 500ms → ~800ms no total), ainda abaixo do UtteranceEnd de 1s.
 */
const AGRUPAMENTO_MS = Number(process.env.STT_AGRUPAMENTO_MS || 500);

export function iniciarTranscricaoAoVivo({ onTranscricaoParcial, onFalaConcluida, onErro }) {
  const cliente = createClient(config.deepgram.apiKey);

  const conexao = cliente.listen.live({
    model: config.deepgram.modelo,
    language: config.deepgram.idioma,
    encoding: "mulaw",
    sample_rate: 8000,
    channels: 1,
    smart_format: true,
    interim_results: true,
    endpointing: 300, // ms de silêncio pra considerar a frase "provavelmente" terminada
    utterance_end_ms: 1000, // ms de silêncio pra confirmar fim de turno (evita cortar pausas curtas)
    vad_events: true,
  });

  let bufferFalaAtual = "";
  let timerAgrupamento = null;
  let encerrado = false;

  /** Fecha o agrupamento atual e entrega a fala inteira como UM turno. */
  function entregarFalaAcumulada() {
    clearTimeout(timerAgrupamento);
    timerAgrupamento = null;
    const texto = bufferFalaAtual.trim();
    bufferFalaAtual = "";
    if (texto && !encerrado) onFalaConcluida(texto);
  }

  // IMPORTANTE: Error/Close ficam registrados FORA do callback de Open, de
  // propósito. Um bug real apareceu em teste — com uma chave de API inválida
  // a conexão nunca chega a abrir, então um listener de erro registrado só
  // dentro do `Open` nunca é anexado, e o erro sobe como `unhandledRejection`
  // / evento sem listener e derruba o processo inteiro. Registrando aqui,
  // qualquer falha (antes ou depois de abrir) sempre tem alguém escutando.
  conexao.on(LiveTranscriptionEvents.Error, (err) => onErro?.(err));
  conexao.on(LiveTranscriptionEvents.Close, () => {
    // Se sobrou fala não entregue (ex: ligação caiu no meio da frase), ainda
    // entrega o que tinha — `entregarFalaAcumulada` já respeita a flag de
    // encerramento, então não dispara turno numa sessão morta.
    entregarFalaAcumulada();
  });

  conexao.on(LiveTranscriptionEvents.Open, () => {
    console.log("[deepgram] conexão aberta, pronta pra receber áudio.");

    conexao.on(LiveTranscriptionEvents.Transcript, (evento) => {
      const texto = evento.channel?.alternatives?.[0]?.transcript ?? "";
      if (!texto) return;
      console.log(`[deepgram] transcript (is_final=${evento.is_final}): "${texto}"`);

      if (evento.is_final) {
        // Acumula em vez de entregar na hora: o Deepgram fatia uma fala só em
        // vários is_final, e entregar cada um vira turno de LLM concorrente.
        bufferFalaAtual = bufferFalaAtual ? `${bufferFalaAtual} ${texto}` : texto;
        clearTimeout(timerAgrupamento);
        timerAgrupamento = setTimeout(entregarFalaAcumulada, AGRUPAMENTO_MS);
      } else {
        onTranscricaoParcial?.(texto);
      }
    });

    // Confirmação de fim de turno do próprio Deepgram: se ela chega, não faz
    // sentido continuar esperando o agrupamento — entrega já.
    conexao.on(LiveTranscriptionEvents.UtteranceEnd, () => {
      console.log(`[deepgram] UtteranceEnd, buffer acumulado: "${bufferFalaAtual}"`);
      entregarFalaAcumulada();
    });
  });

  return {
    /** Envia um frame de áudio (Buffer mulaw/8000 vindo direto do Twilio). */
    enviarAudio(bufferMulaw) {
      if (conexao.getReadyState() === 1 /* OPEN */) conexao.send(bufferMulaw);
    },
    encerrar() {
      // Entrega o que sobrou ANTES de marcar como encerrado, pra não perder a
      // última frase da transcrição; depois trava qualquer entrega tardia
      // (o evento Close chega depois e criaria turno numa sessão já morta).
      entregarFalaAcumulada();
      encerrado = true;
      clearTimeout(timerAgrupamento);

      // Mesma cautela do fechamento da Cartesia: nunca deixar o encerramento
      // de UMA ligação derrubar o processo que serve as outras.
      try {
        conexao.requestClose();
      } catch (err) {
        console.error("[deepgram] erro ao fechar conexão (ignorado):", err.message);
      }
    },
  };
}
