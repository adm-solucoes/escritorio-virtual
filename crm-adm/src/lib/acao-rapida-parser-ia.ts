// Fallback com IA (Claude Haiku) pro comando da Ação Rápida — só entra em ação quando o
// parser determinístico (acao-rapida-parser.ts) não conseguiu entender o texto. A confirmação
// manual antes de disparar qualquer ação (calendário/e-mail/WhatsApp) continua obrigatória,
// então um erro de interpretação da IA nunca dispara nada sozinho.

import Anthropic from "@anthropic-ai/sdk";
import type { ComandoParseado } from "./acao-rapida-parser";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SCHEMA = {
  type: "object" as const,
  properties: {
    entendido: { type: "boolean" as const },
    hora: { type: ["string", "null"] as const },
    nome: { type: ["string", "null"] as const },
    email: { type: ["string", "null"] as const },
    telefone: { type: ["string", "null"] as const },
    dataISO: { type: ["string", "null"] as const },
  },
  required: ["entendido", "hora", "nome", "email", "telefone", "dataISO"],
  additionalProperties: false,
};

export async function interpretarComandoIA(texto: string): Promise<ComandoParseado | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;

  const hoje = new Date().toISOString().slice(0, 10);

  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 300,
    system: `Você extrai dados de um comando de agendamento de reunião em português. Hoje é ${hoje} (formato YYYY-MM-DD). Se o texto não descrever claramente uma reunião com horário e nome de contato, responda "entendido": false. "hora" deve ser HH:mm (24h). "dataISO" deve ser YYYY-MM-DD, resolvendo "hoje"/"amanhã"/dias da semana relativos a hoje. Não invente e-mail ou telefone se não estiverem no texto — deixe null.`,
    messages: [{ role: "user", content: texto }],
    output_config: { format: { type: "json_schema", schema: SCHEMA } },
  });

  const bloco = response.content.find((b) => b.type === "text");
  if (!bloco || bloco.type !== "text") return null;

  let dados: {
    entendido: boolean;
    hora: string | null;
    nome: string | null;
    email: string | null;
    telefone: string | null;
    dataISO: string | null;
  };
  try {
    dados = JSON.parse(bloco.text);
  } catch {
    return null;
  }

  if (!dados.entendido || !dados.hora || !dados.nome || !dados.dataISO) return null;

  return {
    hora: dados.hora,
    nome: dados.nome,
    email: dados.email,
    telefone: dados.telefone,
    dataISO: dados.dataISO,
  };
}
