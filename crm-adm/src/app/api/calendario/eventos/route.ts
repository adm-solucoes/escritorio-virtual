import { createAdminClient } from "@/lib/supabase-admin";
import { exigirSessao } from "@/lib/auth-api";
import { criarEventoReuniao, listarEventosPeriodo } from "@/lib/google-calendar";

export const dynamic = "force-dynamic";

export interface EventoAgendaEquipe {
  id: string;
  gcId: string;
  gcNome: string;
  titulo: string;
  inicio: string;
  fim: string;
  linkChamada: string | null;
  linkEvento: string | null;
}

export interface ParticipanteAgenda {
  gcId: string;
  nome: string;
}

async function participantesCompartilhando(admin: ReturnType<typeof createAdminClient>) {
  const { data } = await admin.from("integracoes_google").select("gc_id, gcs(nome)").eq("compartilhar_agenda", true);
  return (data as unknown as { gc_id: string; gcs: { nome: string } | null }[]) ?? [];
}

export async function GET(request: Request) {
  const sessao = await exigirSessao();
  if ("erro" in sessao) return Response.json({ error: sessao.erro }, { status: sessao.status });

  try {
    const { searchParams } = new URL(request.url);
    const inicioParam = searchParams.get("inicio");
    const fimParam = searchParams.get("fim");
    const agora = new Date();
    const inicioISO = inicioParam ?? agora.toISOString();
    const fimISO = fimParam ?? new Date(agora.getTime() + 7 * 86_400_000).toISOString();

    const admin = createAdminClient();
    const integracoes = await participantesCompartilhando(admin);

    const eventos: EventoAgendaEquipe[] = [];
    const erros: string[] = [];

    for (const integracao of integracoes) {
      const resultado = await listarEventosPeriodo(integracao.gc_id, inicioISO, fimISO);
      if (!resultado.ok) {
        erros.push(`${integracao.gcs?.nome ?? "GC"}: ${resultado.error}`);
        continue;
      }
      for (const evento of resultado.eventos ?? []) {
        eventos.push({ ...evento, gcId: integracao.gc_id, gcNome: integracao.gcs?.nome ?? "—" });
      }
    }

    eventos.sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime());

    const participantes: ParticipanteAgenda[] = integracoes.map((i) => ({
      gcId: i.gc_id,
      nome: i.gcs?.nome ?? "—",
    }));

    return Response.json({ eventos, participantes, totalCompartilhando: integracoes.length, erros });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Erro desconhecido" }, { status: 500 });
  }
}

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Cria um evento novo direto da grade (clique num horário vazio). Pode
 * criar na agenda de qualquer pessoa da equipe (não só a própria) — é o
 * propósito da agenda compartilhada; só exige estar autenticado. */
export async function POST(request: Request) {
  const sessao = await exigirSessao();
  if ("erro" in sessao) return Response.json({ error: sessao.erro }, { status: sessao.status });

  try {
    const body = await request.json();
    const gcId = texto(body.gcId);
    const titulo = texto(body.titulo);
    const inicioISO = texto(body.inicioISO);
    const fimISO = texto(body.fimISO);
    if (!gcId || !titulo || !inicioISO || !fimISO) {
      return Response.json({ error: "gcId, titulo, inicioISO e fimISO são obrigatórios" }, { status: 400 });
    }

    const resultado = await criarEventoReuniao({ gcId, titulo, inicioISO, fimISO });
    if (!resultado.ok) return Response.json({ error: resultado.error }, { status: 400 });

    return Response.json({ ok: true, eventoId: resultado.eventoId, linkEvento: resultado.linkEvento });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Erro desconhecido" }, { status: 500 });
  }
}
