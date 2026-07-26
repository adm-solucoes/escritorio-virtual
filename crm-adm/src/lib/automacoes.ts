import { supabase } from "./supabase";
import type { ChecklistEtapaItem, EtapaFunil } from "./types";

export async function criarTarefaAutomaticaSeConfigurada(
  oportunidade: { id: string; empresa_id: string; gc_responsavel_id: string | null },
  etapa: EtapaFunil
) {
  const { data: checklist } = await supabase
    .from("checklist_etapa_config")
    .select("*")
    .eq("etapa", etapa)
    .order("ordem");

  const itens = (checklist as ChecklistEtapaItem[]) ?? [];

  // Etapa com checklist configurado (Fase F): cria uma atividade por item, cada uma
  // com seu próprio prazo relativo — substitui a tarefa única antiga só pra essa etapa.
  if (itens.length > 0) {
    const linhas = itens.map((item) => ({
      empresa_id: oportunidade.empresa_id,
      oportunidade_id: oportunidade.id,
      tipo_atividade: item.nome_item,
      responsavel_id: oportunidade.gc_responsavel_id,
      status: "Pendente" as const,
      prazo: new Date(Date.now() + item.prazo_dias * 86400000).toISOString().slice(0, 10),
      alerta_disparado: true,
    }));
    await supabase.from("atividades").insert(linhas);
    return;
  }

  // Sem checklist configurado pra essa etapa: mantém o comportamento antigo
  // (tarefa única, via tarefa_padrao em etapas_funil).
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
