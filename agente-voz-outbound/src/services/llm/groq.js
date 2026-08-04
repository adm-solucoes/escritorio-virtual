import { config } from "../../config.js";

const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

/**
 * A API da Groq é compatível com o formato da OpenAI (mesmo endpoint shape,
 * SSE de streaming, `choices[0].delta.content`). Por isso não precisa de SDK
 * própria — um `fetch` com parsing de SSE manual já resolve, e mantém a
 * dependência do projeto menor.
 *
 * IMPORTANTE: o modelo "llama-3.1-70b" pedido originalmente foi APOSENTADO
 * pela Groq. O substituto direto é "llama-3.3-70b-versatile" (mesma classe de
 * qualidade/latência), já configurado como padrão em `config.js`. Se quiser
 * confirmar os modelos disponíveis na sua conta: GET /openai/v1/models.
 */
export async function chatGroq(mensagens, { onToken, temperatura = 0.6, jsonMode = false } = {}) {
  if (!config.llm.groq.apiKey) {
    throw new Error("GROQ_API_KEY ausente no .env");
  }

  const corpo = {
    model: config.llm.groq.modelo,
    messages: mensagens,
    temperature: temperatura,
    stream: Boolean(onToken),
  };
  if (jsonMode) corpo.response_format = { type: "json_object" };

  const resposta = await pedirComRetry(corpo);

  if (!onToken) {
    const json = await resposta.json();
    const texto = json.choices?.[0]?.message?.content ?? "";
    return {
      texto,
      tokensEntrada: json.usage?.prompt_tokens ?? estimarTokens(mensagens),
      tokensSaida: json.usage?.completion_tokens ?? estimarTokens([{ content: texto }]),
    };
  }

  // Streaming: lê o corpo como SSE, linha por linha.
  let textoCompleto = "";
  let usage = null;
  const leitor = resposta.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await leitor.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const linhas = buffer.split("\n");
    buffer = linhas.pop(); // última linha pode estar incompleta

    for (const linha of linhas) {
      const l = linha.trim();
      if (!l.startsWith("data:")) continue;
      const dados = l.slice(5).trim();
      if (dados === "[DONE]") continue;

      let evento;
      try {
        evento = JSON.parse(dados);
      } catch {
        continue; // linha parcial/corrompida — ignora, o próximo chunk completa
      }

      const pedaco = evento.choices?.[0]?.delta?.content;
      if (pedaco) {
        textoCompleto += pedaco;
        onToken(pedaco);
      }
      // Groq inclui uso de tokens no chunk final sob "x_groq.usage".
      if (evento.x_groq?.usage) usage = evento.x_groq.usage;
    }
  }

  return {
    texto: textoCompleto,
    tokensEntrada: usage?.prompt_tokens ?? estimarTokens(mensagens),
    tokensSaida: usage?.completion_tokens ?? estimarTokens([{ content: textoCompleto }]),
  };
}

/**
 * Faz a chamada tratando 429 (rate limit) e 5xx com retry.
 *
 * Isto NÃO é zelo teórico: o plano gratuito da Groq limita por TOKENS POR
 * MINUTO (medido na prática: 12.000 TPM), não por dia. Como cada turno
 * reenvia o system prompt inteiro + histórico, uma ligação de poucos minutos
 * estoura esse teto no meio da conversa. Antes deste retry, o erro subia,
 * o turno morria, e se um barge-in tivesse acontecido junto o agente não
 * falava NADA — ficava mudo até o fim da ligação, sem nenhuma explicação
 * audível pro lead. Esperar ~2s e repetir é quase sempre suficiente, porque
 * a janela de tokens da Groq reenche continuamente.
 */
async function pedirComRetry(corpo) {
  const TENTATIVAS = 3;
  let ultimoErro = null;

  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
    const resposta = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.llm.groq.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(corpo),
    });

    if (resposta.ok) return resposta;

    const detalhe = await resposta.text().catch(() => "");
    ultimoErro = new Error(`Groq respondeu ${resposta.status}: ${detalhe.slice(0, 500)}`);

    const valeRetentar = resposta.status === 429 || resposta.status >= 500;
    if (!valeRetentar || tentativa === TENTATIVAS) break;

    // A Groq manda quanto esperar; se não mandar, usa backoff progressivo.
    const cabecalho = resposta.headers.get("retry-after");
    const esperaMs = cabecalho
      ? Math.min(Number(cabecalho) * 1000 || 2000, 8000)
      : Math.min(1500 * tentativa, 6000);

    console.warn(
      `[groq] ${resposta.status} (tentativa ${tentativa}/${TENTATIVAS}) — repetindo em ${esperaMs}ms.` +
        (resposta.status === 429 ? " Rate limit de tokens/minuto do plano gratuito." : "")
    );
    await new Promise((r) => setTimeout(r, esperaMs));
  }

  throw ultimoErro;
}

/** Estimativa grosseira (≈4 caracteres por token) — só usada se a API não devolver uso real. */
function estimarTokens(mensagens) {
  const chars = mensagens.reduce((acc, m) => acc + (m.content?.length ?? 0), 0);
  return Math.ceil(chars / 4);
}
