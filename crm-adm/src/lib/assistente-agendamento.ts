// Detecção de pedido de agendamento no chat do assistente comercial — passo
// separado (Haiku, tarefa "extrair") que roda ANTES da resposta normal do
// assistente. Se identificar um pedido de reunião com data/hora suficientes,
// a rota devolve uma proposta pro usuário confirmar — nunca cria o evento
// sozinho a partir daqui (mesmo padrão de "IA nunca age sozinha sobre o
// mundo real" usado no resto do CRM: automações, sugestões de IA etc.).

import { chamarClaude, parseJsonIA } from "./ai";

const SCHEMA = {
  type: "object" as const,
  properties: {
    agendamento: { type: "boolean" as const },
    participanteNome: { type: ["string", "null"] as const },
    participanteEmail: { type: ["string", "null"] as const },
    assunto: { type: ["string", "null"] as const },
    dataISO: { type: ["string", "null"] as const },
    hora: { type: ["string", "null"] as const },
    duracaoMinutos: { type: ["number", "null"] as const },
  },
  required: ["agendamento", "participanteNome", "participanteEmail", "assunto", "dataISO", "hora", "duracaoMinutos"],
  additionalProperties: false,
};

export interface DeteccaoAgendamento {
  agendamento: boolean;
  participanteNome: string | null;
  participanteEmail: string | null;
  assunto: string | null;
  dataISO: string | null;
  hora: string | null;
  duracaoMinutos: number | null;
}

export async function detectarPedidoDeAgendamento(mensagem: string): Promise<DeteccaoAgendamento | null> {
  const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }); // YYYY-MM-DD

  const system = `Você identifica se uma mensagem de chat é um pedido pra marcar uma reunião/compromisso na agenda. Hoje é ${hoje} (formato YYYY-MM-DD), fuso de Brasília.

Marque "agendamento": true só quando a pessoa claramente quer marcar algo (ex: "marca uma reunião com fulano às 14h", "agenda um call amanhã com o cliente"). Perguntas sobre o pipeline, empresas, relatórios etc. são "agendamento": false.

Extraia o que estiver disponível no texto (não invente o que não está lá):
- "participanteNome": nome da pessoa, se mencionado.
- "participanteEmail": e-mail, só se estiver literalmente no texto.
- "assunto": do que é a reunião, se mencionado (ex: "alinhamento de proposta").
- "dataISO": resolvendo "hoje"/"amanhã"/dias da semana relativos a hoje, formato YYYY-MM-DD. Se não houver data mas houver hora, assuma hoje.
- "hora": formato HH:mm (24h) — "às 14h" vira "14:00", "14h30" vira "14:30".
- "duracaoMinutos": só se mencionado explicitamente (ex: "reunião de 1 hora" = 60). Senão null.

Se "agendamento" for false, todos os outros campos ficam null.`;

  const resultado = await chamarClaude({
    tarefa: "extrair",
    system,
    mensagem,
    maxTokens: 300,
    outputSchema: SCHEMA,
  });

  return parseJsonIA<DeteccaoAgendamento>(resultado);
}
