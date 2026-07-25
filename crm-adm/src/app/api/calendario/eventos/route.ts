import { createAdminClient } from "@/lib/supabase-admin";
import { listarEventosPeriodo } from "@/lib/google-calendar";

export const dynamic = "force-dynamic";

export interface EventoAgendaEquipe {
  id: string;
  gcNome: string;
  titulo: string;
  inicio: string;
  fim: string;
  linkChamada: string | null;
  linkEvento: string | null;
}

export async function GET() {
  try {
    const admin = createAdminClient();
    const { data: integracoes } = await admin
      .from("integracoes_google")
      .select("gc_id, gcs(nome)")
      .eq("compartilhar_agenda", true);

    const eventos: EventoAgendaEquipe[] = [];
    const erros: string[] = [];

    for (const integracao of (integracoes as unknown as { gc_id: string; gcs: { nome: string } | null }[]) ?? []) {
      const resultado = await listarEventosPeriodo(integracao.gc_id, 7);
      if (!resultado.ok) {
        erros.push(`${integracao.gcs?.nome ?? "GC"}: ${resultado.error}`);
        continue;
      }
      for (const evento of resultado.eventos ?? []) {
        eventos.push({ ...evento, gcNome: integracao.gcs?.nome ?? "—" });
      }
    }

    eventos.sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime());

    return Response.json({ eventos, totalCompartilhando: (integracoes ?? []).length, erros });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Erro desconhecido" }, { status: 500 });
  }
}
