// Geração de notificações in-app — reaproveita as MESMAS detecções que já existem
// (atividade atrasada, alerta de follow-up por etapa configurado em Configurações → Funil).
// Não duplica lógica de detecção: só adiciona o canal in-app onde ela já roda.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Atividade, Empresa, EtapaFunilConfig, Oportunidade, TipoLinkNotificacao } from "./types";

interface OpcoesNotificacao {
  gcId: string | null;
  tipo: string;
  mensagem: string;
  linkTipo: TipoLinkNotificacao | null;
  linkId: string | null;
}

/** Insere a notificação só se não existir uma igual (mesmo gc+tipo+registro) ainda não lida. */
export async function criarNotificacaoSeNaoExiste(client: SupabaseClient, opcoes: OpcoesNotificacao) {
  if (!opcoes.gcId) return;

  let query = client
    .from("notificacoes")
    .select("id")
    .eq("gc_id", opcoes.gcId)
    .eq("tipo", opcoes.tipo)
    .eq("lida", false);
  query = opcoes.linkId ? query.eq("link_id", opcoes.linkId) : query.is("link_id", null);

  const { data: existente } = await query.maybeSingle();
  if (existente) return;

  await client.from("notificacoes").insert({
    gc_id: opcoes.gcId,
    tipo: opcoes.tipo,
    mensagem: opcoes.mensagem,
    link_tipo: opcoes.linkTipo,
    link_id: opcoes.linkId,
  });
}

/** Mesma consulta usada pelo alerta semanal por e-mail (api/atividades/alertar) — reaproveitada, não duplicada. */
export async function buscarAtividadesAtrasadas(client: SupabaseClient): Promise<Atividade[]> {
  const hoje = new Date().toISOString().slice(0, 10);
  const { data } = await client
    .from("atividades")
    .select("*, empresas(nome_empresa)")
    .neq("status", "Concluído")
    .lt("prazo", hoje)
    .order("prazo");
  return (data as Atividade[]) ?? [];
}

export async function gerarNotificacoesAtividadesAtrasadas(client: SupabaseClient) {
  const atividades = await buscarAtividadesAtrasadas(client);
  for (const a of atividades) {
    const dias = a.prazo ? Math.floor((Date.now() - new Date(a.prazo).getTime()) / 86400000) : 0;
    await criarNotificacaoSeNaoExiste(client, {
      gcId: a.responsavel_id,
      tipo: "atividade_atrasada",
      mensagem: `${a.tipo_atividade} atrasada (${dias}d) — ${a.empresas?.nome_empresa ?? "empresa"}`,
      linkTipo: a.oportunidade_id ? "oportunidade" : a.empresa_id ? "empresa" : null,
      linkId: a.oportunidade_id ?? a.empresa_id ?? null,
    });
  }
}

/** Consome o campo dias_alerta_followup configurado em Configurações → Funil, que até
 * agora era salvo mas nunca usado por nada — aqui é onde ele passa a gerar alerta de fato. */
export async function gerarNotificacoesFollowupEtapa(client: SupabaseClient) {
  const [{ data: etapasData }, { data: oportunidadesData }] = await Promise.all([
    client.from("etapas_funil").select("*"),
    client.from("oportunidades").select("*, empresas(nome_empresa)").not("ultima_interacao", "is", null),
  ]);

  const limiarPorEtapa = new Map(
    ((etapasData as EtapaFunilConfig[]) ?? []).filter((e) => e.dias_alerta_followup > 0).map((e) => [e.nome, e.dias_alerta_followup])
  );

  const agora = Date.now();
  for (const o of (oportunidadesData as (Oportunidade & { empresas?: Empresa })[]) ?? []) {
    if (o.etapa_atual === "Perdido" || o.etapa_atual === "Contrato Fechado") continue;
    const limiar = limiarPorEtapa.get(o.etapa_atual);
    if (!limiar || !o.ultima_interacao) continue;

    const dias = Math.floor((agora - new Date(o.ultima_interacao).getTime()) / 86400000);
    if (dias < limiar) continue;

    await criarNotificacaoSeNaoExiste(client, {
      gcId: o.gc_responsavel_id,
      tipo: "follow_up_etapa",
      mensagem: `${o.empresas?.nome_empresa ?? "Empresa"} está há ${dias}d sem interação na etapa ${o.etapa_atual}`,
      linkTipo: "oportunidade",
      linkId: o.id,
    });
  }
}
