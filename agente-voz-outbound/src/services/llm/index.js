import { config } from "../../config.js";
import { chatGroq } from "./groq.js";

/**
 * Interface do provedor de LLM. Todo provedor implementa a mesma assinatura:
 *
 *   async function chat(mensagens, { onToken, stream }) => { texto, tokensEntrada, tokensSaida }
 *
 * `mensagens` é o formato padrão OpenAI-like: [{role: "system"|"user"|"assistant", content: string}]
 * `onToken(pedaco)` é chamado a cada pedaço de texto durante o streaming (pra
 * já ir mandando frases completas pro TTS sem esperar a resposta inteira).
 *
 * Trocar de provedor = trocar esta função, ou adicionar um novo arquivo
 * (ex: anthropic.js) e mapear aqui. O resto do sistema (ConversationSession,
 * extração estruturada) nunca fala com Groq/Claude/OpenAI diretamente.
 */
export async function chat(mensagens, opcoes = {}) {
  switch (config.llm.provedor) {
    case "groq":
      return chatGroq(mensagens, opcoes);
    default:
      throw new Error(`LLM_PROVIDER desconhecido: "${config.llm.provedor}" (esperado: "groq")`);
  }
}
