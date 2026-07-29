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
    participantesEmails: { type: "array" as const, items: { type: "string" as const } },
    assunto: { type: ["string", "null"] as const },
    dataISO: { type: ["string", "null"] as const },
    hora: { type: ["string", "null"] as const },
    duracaoMinutos: { type: ["number", "null"] as const },
  },
  required: ["agendamento", "participanteNome", "participantesEmails", "assunto", "dataISO", "hora", "duracaoMinutos"],
  additionalProperties: false,
};

export interface DeteccaoAgendamento {
  agendamento: boolean;
  participanteNome: string | null;
  /** Pode ter mais de um convidado (ex: "marca com a Isabelle e a Catarina"). */
  participantesEmails: string[];
  assunto: string | null;
  dataISO: string | null;
  hora: string | null;
  duracaoMinutos: number | null;
}

export interface MembroEquipe {
  nome: string;
  email: string;
}

export async function detectarPedidoDeAgendamento(
  mensagem: string,
  membrosEquipe: MembroEquipe[] = []
): Promise<DeteccaoAgendamento | null> {
  const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }); // YYYY-MM-DD

  const listaEquipe = membrosEquipe.map((m) => `${m.nome} <${m.email}>`).join("\n");

  const system = `Você identifica se uma mensagem de chat é um pedido pra marcar uma reunião/compromisso na agenda. Hoje é ${hoje} (formato YYYY-MM-DD), fuso de Brasília.

Marque "agendamento": true só quando a pessoa claramente quer marcar algo (ex: "marca uma reunião com fulano às 14h", "agenda um call amanhã com o cliente"). Perguntas sobre o pipeline, empresas, relatórios etc. são "agendamento": false.

Extraia o que estiver disponível no texto (não invente o que não está lá):
- "participanteNome": nome da pessoa (ou pessoas, junte num texto só tipo "Isabelle e Catarina"), se mencionado.
- "participantesEmails": lista de e-mails dos convidados. Se o texto mencionar o nome de alguém que está na EQUIPE INTERNA abaixo, preencha automaticamente com o e-mail dessa pessoa da lista — não precisa a pessoa ter digitado o e-mail. Se mencionar alguém que NÃO está na lista, só inclua o e-mail se estiver literalmente escrito no texto. Pode ter vários convidados. Se não conseguir resolver nenhum e-mail, devolva lista vazia [].
- "assunto": um TÍTULO curto e profissional pra reunião — nunca copie a frase literal do usuário. Reescreva sempre num tom formal de agenda corporativa (ex: usuário escreveu "reuniao pra falar da bagunça do financeiro" → assunto vira "Alinhamento financeiro"; "call rápida sobre o projeto do cliente X" → "Alinhamento — Projeto Cliente X"). Se o usuário não disser do que é a reunião, use "Reunião" mesmo.
- "dataISO": resolvendo "hoje"/"amanhã"/dias da semana relativos a hoje, formato YYYY-MM-DD. Se não houver data mas houver hora, assuma hoje.
- "hora": formato HH:mm (24h) — "às 14h" vira "14:00", "14h30" vira "14:30".
- "duracaoMinutos": só se mencionado explicitamente (ex: "reunião de 1 hora" = 60). Senão null.

Se "agendamento" for false, os outros campos ficam null (participantesEmails vira []).

EQUIPE INTERNA (nome <e-mail>) — use pra resolver e-mail automaticamente quando o nome for mencionado:
${listaEquipe || "(nenhuma pessoa cadastrada)"}`;

  const resultado = await chamarClaude({
    tarefa: "extrair",
    system,
    mensagem,
    maxTokens: 300,
    outputSchema: SCHEMA,
  });

  return parseJsonIA<DeteccaoAgendamento>(resultado);
}
