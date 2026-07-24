import { supabase } from "./supabase";
import type { EtapaFunil } from "./types";

export async function criarTarefaAutomaticaSeConfigurada(
  oportunidade: { id: string; empresa_id: string; gc_responsavel_id: string | null },
  etapa: EtapaFunil
) {
  const { data } = await supabase
    .from("etapas_funil")
    .select("tarefa_padrao")
    .eq("nome", etapa)
    .maybeSingle();

  const tarefaPadrao = (data as { tarefa_padrao: string | null } | null)?.tarefa_padrao;
  if (!tarefaPadrao) return;

  const prazo = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);

  await supabase.from("atividades").insert({
    empresa_id: oportunidade.empresa_id,
    oportunidade_id: oportunidade.id,
    tipo_atividade: tarefaPadrao,
    responsavel_id: oportunidade.gc_responsavel_id,
    status: "Pendente",
    prazo,
    alerta_disparado: true,
  });
}
