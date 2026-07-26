// Fallback com IA (Claude Haiku) pro comando da Ação Rápida — só entra em ação quando o
// parser determinístico (acao-rapida-parser.ts) não conseguiu entender o texto. A confirmação
// manual antes de disparar qualquer ação (calendário/e-mail/WhatsApp) continua obrigatória,
// então um erro de interpretação da IA nunca dispara nada sozinho.

import { chamarClaude, parseJsonIA } from "./ai";
import type { ComandoParseado } from "./acao-rapida-parser";

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

interface RespostaComandoIA {
  entendido: boolean;
  hora: string | null;
  nome: string | null;
  email: string | null;
  telefone: string | null;
  dataISO: string | null;
}

export async function interpretarComandoIA(texto: string): Promise<ComandoParseado | null> {
  const hoje = new Date().toISOString().slice(0, 10);

  const system = `Você extrai dados de um comando de agendamento de reunião em português, escrito de forma informal e com possíveis erros de digitação. Hoje é ${hoje} (formato YYYY-MM-DD).

Marque "entendido": true sempre que o texto tiver um horário (mesmo que só a hora, tipo "as 14" = 14:00) E um jeito de identificar a pessoa (nome, ou e-mail, ou telefone). Não exija que as duas coisas apareçam com palavras-chave explícitas — infira pelo contexto. Só marque "entendido": false se realmente não der pra saber o horário OU não der pra identificar ninguém.

"hora" deve ser HH:mm (24h) — "as 14" vira "14:00", "14h30" vira "14:30".
"dataISO" deve ser YYYY-MM-DD, resolvendo "hoje"/"amanhã"/dias da semana relativos a hoje; se não houver data, use hoje.
"nome" é o nome da pessoa com quem é a reunião.
Extraia e-mail e telefone só se estiverem literalmente no texto (não invente); ignore erros de digitação em palavras como "emial"/"email".

Exemplo: "reunião com o caio as 14 no email caio@x.com" -> entendido true, hora 14:00, nome Caio, email caio@x.com, telefone null, dataISO hoje.`;

  const resultado = await chamarClaude({
    tarefa: "extrair",
    system,
    mensagem: texto,
    maxTokens: 300,
    outputSchema: SCHEMA,
  });

  const dados = parseJsonIA<RespostaComandoIA>(resultado);
  if (!dados || !dados.entendido || !dados.hora || !dados.nome || !dados.dataISO) return null;

  return {
    hora: dados.hora,
    nome: dados.nome,
    email: dados.email,
    telefone: dados.telefone,
    dataISO: dados.dataISO,
  };
}
