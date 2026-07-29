import { criarEventoReuniao } from "@/lib/google-calendar";

export const dynamic = "force-dynamic";

interface CorpoConfirmacao {
  gcId: string;
  participanteNome: string | null;
  participantesEmails: string[];
  assunto: string;
  dataISO: string;
  hora: string;
  duracaoMinutos: number;
}

export async function POST(request: Request) {
  try {
    const corpo = (await request.json()) as CorpoConfirmacao;
    const { gcId, participanteNome, participantesEmails, assunto, dataISO, hora, duracaoMinutos } = corpo;

    if (!gcId || !dataISO || !hora) {
      return Response.json({ error: "Faltam campos obrigatórios." }, { status: 400 });
    }

    // Fuso de Brasília fixo (sem horário de verão desde 2019) — sem isso, o
    // servidor (Vercel roda em UTC) interpretaria "14:00" como 14h UTC, e o
    // evento ficaria com 3 horas de diferença do que o usuário pediu.
    const inicio = new Date(`${dataISO}T${hora}:00-03:00`);
    if (Number.isNaN(inicio.getTime())) {
      return Response.json({ error: "Data ou hora inválida." }, { status: 400 });
    }
    const fim = new Date(inicio.getTime() + (duracaoMinutos || 30) * 60_000);

    const titulo = participanteNome ? `${assunto} — ${participanteNome}` : assunto;

    const resultado = await criarEventoReuniao({
      gcId,
      titulo,
      participantesEmails: (participantesEmails ?? []).filter(Boolean),
      inicioISO: inicio.toISOString(),
      fimISO: fim.toISOString(),
    });

    if (!resultado.ok) {
      return Response.json({ error: resultado.error }, { status: 400 });
    }

    return Response.json({
      ok: true,
      dataHoraFormatada: inicio.toLocaleString("pt-BR", { dateStyle: "full", timeStyle: "short", timeZone: "America/Sao_Paulo" }),
      linkEvento: resultado.linkEvento,
      linkChamada: resultado.linkChamada,
    });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Erro desconhecido" }, { status: 500 });
  }
}
