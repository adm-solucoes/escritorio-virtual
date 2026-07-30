import { createAdminClient } from "@/lib/supabase-admin";
import type { EtapaFunilConfig, Oportunidade } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function gerarSnapshot() {
  const supabase = createAdminClient();

  const [{ data: oportunidades }, { data: etapas }] = await Promise.all([
    supabase.from("oportunidades").select("*"),
    supabase.from("etapas_funil").select("*"),
  ]);

  const hoje = new Date().toISOString().slice(0, 10);
  const linhas: {
    data: string;
    etapa: string;
    tipo_pipeline: string;
    valor_total: number;
    valor_ponderado: number;
    qtd: number;
  }[] = [];

  for (const etapa of (etapas as EtapaFunilConfig[]) ?? []) {
    const doGrupo = ((oportunidades as Oportunidade[]) ?? []).filter(
      (o) => o.etapa_atual === etapa.nome && o.tipo_pipeline === etapa.tipo_pipeline
    );
    linhas.push({
      data: hoje,
      etapa: etapa.nome,
      tipo_pipeline: etapa.tipo_pipeline,
      valor_total: doGrupo.reduce((acc, o) => acc + (o.valor_estimado ?? 0), 0),
      valor_ponderado: doGrupo.reduce((acc, o) => acc + (o.receita_ponderada ?? 0), 0),
      qtd: doGrupo.length,
    });
  }

  const { error } = await supabase.from("pipeline_snapshot").upsert(linhas, { onConflict: "data,etapa,tipo_pipeline" });
  if (error) throw new Error(error.message);
  return { linhas: linhas.length };
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  try {
    const resultado = await gerarSnapshot();
    return Response.json({ ok: true, ...resultado });
  } catch (e) {
    console.error("Erro ao gerar snapshot do pipeline:", e);
    return Response.json({ error: e instanceof Error ? e.message : "Erro desconhecido" }, { status: 500 });
  }
}
