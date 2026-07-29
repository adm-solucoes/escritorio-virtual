import { createAdminClient } from "@/lib/supabase-admin";
import { createClient as createServerClient } from "@/lib/supabase-server";
import { criarEventoReuniao } from "@/lib/google-calendar";

export const dynamic = "force-dynamic";

interface CorpoConfirmacao {
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
    const { participanteNome, participantesEmails, assunto, dataISO, hora, duracaoMinutos } = corpo;

    if (!dataISO || !hora) {
      return Response.json({ error: "Faltam campos obrigatórios." }, { status: 400 });
    }

    // gcId sempre da sessão real, nunca do corpo — ver mesmo comentário em
    // /api/assistente/perguntar. Sem isso, dava pra marcar reunião na
    // agenda de qualquer pessoa só trocando o gcId enviado.
    const supabaseSessao = await createServerClient();
    const {
      data: { user },
    } = await supabaseSessao.auth.getUser();
    if (!user?.email) {
      return Response.json({ error: "Não autenticado." }, { status: 401 });
    }
    const admin = createAdminClient();
    const { data: gcAtual } = await admin.from("gcs").select("id, role").eq("email", user.email).maybeSingle();
    if (!gcAtual || gcAtual.role === "sem_acesso") {
      return Response.json({ error: "Sem acesso a dados comerciais." }, { status: 403 });
    }
    const gcId = gcAtual.id;

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
