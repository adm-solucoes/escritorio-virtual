// Camada única de chamada de IA do CRM. Toda automação com IA passa por aqui —
// escolha de modelo por tipo de tarefa, timeout e tratamento de erro centralizados.
// Nunca usar o SDK da Anthropic direto em outro arquivo; sempre por chamarClaude().

import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "./supabase-admin";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// "extrair": parsing/classificação — tarefas curtas e objetivas (Haiku, rápido e barato).
// "redigir": geração de texto voltado ao cliente ou recomendação comercial (Sonnet, mais qualidade).
export type TarefaIA = "extrair" | "redigir";

const MODELOS: Record<TarefaIA, string> = {
  extrair: "claude-haiku-4-5",
  redigir: "claude-sonnet-5",
};

// USD por milhão de tokens. Sonnet 5 está em preço promocional (vale até
// 2026-08-31, segundo a Anthropic) — depois disso sobe pra $3/$15. Atualizar
// aqui quando isso mudar; é só pra estimativa de custo interna, não cobrança.
const PRECO_POR_MILHAO: Record<string, { entrada: number; saida: number }> = {
  "claude-haiku-4-5": { entrada: 1.0, saida: 5.0 },
  "claude-sonnet-5": { entrada: 2.0, saida: 10.0 },
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
  /** Liga a ferramenta de busca na web (server-side, sem beta header). O modelo decide sozinho quando usar. */
  permitirBuscaWeb?: boolean;
  /** low | medium | high | xhigh | max — padrão "medium" pra equilibrar custo/latência com qualidade. */
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  /** Rótulo livre de quem chamou (ex: "assistente-chat", "relatorio") — só pra aparecer
   * separado no painel de uso de IA. Opcional, não afeta o comportamento da chamada. */
  origem?: string;
}

/** Grava o custo estimado da chamada pra aparecer no painel de uso de IA
 * (visível só pro gestor). Nunca deixa um erro de log derrubar a chamada de
 * IA em si — é só telemetria. */
async function registrarUsoIA(opcoes: {
  tarefa: TarefaIA;
  origem?: string;
  modelo: string;
  tokensEntrada: number;
  tokensSaida: number;
}) {
  try {
    const preco = PRECO_POR_MILHAO[opcoes.modelo];
    const custoUsd = preco
      ? (opcoes.tokensEntrada / 1_000_000) * preco.entrada + (opcoes.tokensSaida / 1_000_000) * preco.saida
      : 0;

    const admin = createAdminClient();
    await admin.from("ia_uso").insert({
      tarefa: opcoes.tarefa,
      origem: opcoes.origem ?? null,
      modelo: opcoes.modelo,
      tokens_entrada: opcoes.tokensEntrada,
      tokens_saida: opcoes.tokensSaida,
      custo_usd: custoUsd,
    });
  } catch (e) {
    console.error("[ai] falha ao registrar uso de IA (não afeta a resposta):", e);
  }
}

export type ResultadoIA = { ok: true; texto: string } | { ok: false; erro: string };

export async function chamarClaude(opcoes: ChamarClaudeOpcoes): Promise<ResultadoIA> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, erro: "IA não configurada (ANTHROPIC_API_KEY ausente)." };
  }

  // Haiku 4.5 não aceita output_config.effort (erro 400) — o parâmetro só existe
  // pra modelos mais novos como o Sonnet 5, então só entra na tarefa "redigir".
  const outputConfig: Record<string, unknown> = {};
  if (opcoes.tarefa === "redigir") outputConfig.effort = opcoes.effort ?? "medium";
  if (opcoes.outputSchema) outputConfig.format = { type: "json_schema" as const, schema: opcoes.outputSchema };

  try {
    const response = await client.messages.create(
      {
        model: MODELOS[opcoes.tarefa],
        max_tokens: opcoes.maxTokens ?? 1000,
        system: opcoes.system,
        messages: [{ role: "user", content: opcoes.mensagem }],
        ...(Object.keys(outputConfig).length ? { output_config: outputConfig } : {}),
        ...(opcoes.permitirBuscaWeb
          ? { tools: [{ type: "web_search_20260209" as const, name: "web_search" as const, max_uses: 2 }] }
          : {}),
      },
      { timeout: opcoes.timeoutMs ?? TIMEOUT_PADRAO_MS }
    );

    // Com busca na web, a resposta pode ter vários blocos de texto intercalados com
    // chamadas de busca — concatena todos em vez de pegar só o primeiro.
    const texto = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n\n")
      .trim();

    // Fire-and-forget: não espera o insert pra devolver a resposta da IA.
    void registrarUsoIA({
      tarefa: opcoes.tarefa,
      origem: opcoes.origem,
      modelo: MODELOS[opcoes.tarefa],
      tokensEntrada: response.usage.input_tokens,
      tokensSaida: response.usage.output_tokens,
    });

    if (!texto) {
      return { ok: false, erro: "A IA não retornou texto." };
    }
    return { ok: true, texto };
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
