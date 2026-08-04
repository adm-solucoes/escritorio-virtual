import { config } from "../../config.js";
import { CartesiaTtsSession } from "./cartesia.js";
import { ElevenLabsTtsSession } from "./elevenlabs.js";

/**
 * Interface do provedor de TTS — mesmo padrão de `services/llm/index.js`:
 * o resto do sistema (ConversationSession) só conhece este contrato,
 * nunca fala com a Cartesia (ou qualquer outro provedor) diretamente.
 *
 * Uma "sessão" de TTS dura a ligação inteira e expõe:
 *   sessao.falar(texto, { onAudioChunk }) => { contextId, aguardar, cancelar }
 *   sessao.fechar()
 *
 * `onAudioChunk` recebe Buffers já no formato que o Twilio espera de volta
 * (mulaw/8000). Se um provedor novo não conseguir devolver nesse formato
 * direto, a conversão fica dentro da implementação dele, não aqui.
 *
 * "cartesia" (padrão) ou "elevenlabs" — troque via TTS_PROVIDER no .env,
 * sem mexer em mais nada. Deepgram tem TTS próprio (Aura), mas o Aura ainda
 * não fala português (só o Speech-to-Text deles tem PT-BR, checado em 2026).
 */
export function criarSessaoTts(callId) {
  switch (config.tts.provedor) {
    case "cartesia":
      return new CartesiaTtsSession(callId);
    case "elevenlabs":
      return new ElevenLabsTtsSession(callId);
    default:
      throw new Error(`TTS_PROVIDER desconhecido: "${config.tts.provedor}" (esperado: "cartesia" ou "elevenlabs")`);
  }
}
