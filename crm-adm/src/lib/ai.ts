// Camada única de chamada de IA do CRM. Toda automação com IA passa por aqui —
// escolha de modelo por tipo de tarefa, timeout e tratamento de erro centralizados.
// Nunca usar o SDK da Anthropic direto em outro arquivo; sempre por chamarClaude().

import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// "extrair": parsing/classificação — tarefas curtas e objetivas (Haiku, rápido e barato).
// "redigir": geração de texto voltado ao cliente ou recomendação comercial (Sonnet, mais qualidade).
export type TarefaIA = "extrair" | "redigir";

const MODELOS: Record<TarefaIA, string> = {
  extrair: "claude-haiku-4-5",
  redigir: "claude-sonnet-5",
};

const TIMEOUT_PADRAO_MS = 15_000;

interface ChamarClaudeOpcoes {
  tarefa: TarefaIA;
  system: string;
  mensagem: string;
  maxTokens?: number;
  /** JSON Schema opcional — quando informado, a resposta vem estruturada (output_config.format). */
  outputSchema?: Record<string, unknown>;
  timeoutMs?: number;
}

export type ResultadoIA = { ok: true; texto: string } | { ok: false; erro: string };

export async function chamarClaude(opcoes: ChamarClaudeOpcoes): Promise<ResultadoIA> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, erro: "IA não configurada (ANTHROPIC_API_KEY ausente)." };
  }

  try {
    const response = await client.messages.create(
      {
        model: MODELOS[opcoes.tarefa],
        max_tokens: opcoes.maxTokens ?? 1000,
        system: opcoes.system,
        messages: [{ role: "user", content: opcoes.mensagem }],
        ...(opcoes.outputSchema
          ? { output_config: { format: { type: "json_schema" as const, schema: opcoes.outputSchema } } }
          : {}),
      },
      { timeout: opcoes.timeoutMs ?? TIMEOUT_PADRAO_MS }
    );

    const bloco = response.content.find((b) => b.type === "text");
    if (!bloco || bloco.type !== "text" || !bloco.text.trim()) {
      return { ok: false, erro: "A IA não retornou texto." };
    }
    return { ok: true, texto: bloco.text };
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) {
      return { ok: false, erro: "IA sobrecarregada no momento — tente de novo em alguns segundos." };
    }
    if (e instanceof Anthropic.APIConnectionTimeoutError) {
      return { ok: false, erro: "A IA demorou demais pra responder." };
    }
    if (e instanceof Anthropic.APIConnectionError) {
      return { ok: false, erro: "Falha de conexão com a IA." };
    }
    if (e instanceof Anthropic.APIError) {
      return { ok: false, erro: `Erro da IA: ${e.message}` };
    }
    return { ok: false, erro: e instanceof Error ? e.message : "Erro desconhecido na IA." };
  }
}

/** Faz o parse do JSON estruturado retornado por chamarClaude() com outputSchema. */
export function parseJsonIA<T>(resultado: ResultadoIA): T | null {
  if (!resultado.ok) return null;
  try {
    return JSON.parse(resultado.texto) as T;
  } catch {
    return null;
  }
}
