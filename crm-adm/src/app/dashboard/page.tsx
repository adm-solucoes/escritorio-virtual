"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  ETAPAS_FUNIL,
  META_EQUIPE_ID,
  type Empresa,
  type EtapaFunilConfig,
  type Gc,
  type Meta,
  type Oportunidade,
  type OportunidadeHistoricoEtapa,
  type ScoreRule,
} from "@/lib/types";
import { calcularScoreLead, classificarScore } from "@/lib/score";
import { realizadoNoMes } from "@/lib/metas";
import { cicloVendasComercial, funilConversao, tempoMedioPorEtapa } from "@/lib/relatorios";

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function DashboardPage() {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [oportunidades, setOportunidades] = useState<Oportunidade[]>([]);
  const [etapas, setEtapas] = useState<EtapaFunilConfig[]>([]);
  const [gcs, setGcs] = useState<Gc[]>([]);
  const [metas, setMetas] = useState<Meta[]>([]);
  const [regrasScore, setRegrasScore] = useState<ScoreRule[]>([]);
  const [historico, setHistorico] = useState<OportunidadeHistoricoEtapa[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelado = false;
    const agora = new Date();
    Promise.all([
      supabase.from("empresas").select("*"),
      supabase.from("oportunidades").select("*"),
      supabase.from("etapas_funil").select("*").order("ordem"),
      supabase.from("gcs").select("*").order("nome"),
      supabase.from("metas").select("*").eq("mes", agora.getMonth() + 1).eq("ano", agora.getFullYear()),
      supabase.from("score_rules").select("*"),
      supabase.from("oportunidade_historico_etapa").select("*"),
    ]).then(([{ data: empData }, { data: opsData }, { data: etapasData }, { data: gcsData }, { data: metasData }, { data: regrasData }, { data: histData }]) => {
      if (cancelado) return;
      setEmpresas(empData ?? []);
      setOportunidades(opsData ?? []);
      setEtapas((etapasData as EtapaFunilConfig[]) ?? []);
      setGcs(gcsData ?? []);
      setMetas((metasData as Meta[]) ?? []);
      setRegrasScore((regrasData as ScoreRule[]) ?? []);
      setHistorico((histData as OportunidadeHistoricoEtapa[]) ?? []);
      setLoading(false);
    });
    return () => {
      cancelado = true;
    };
  }, []);

  const metaEquipe = useMemo(() => metas.find((m) => m.gc_id === META_EQUIPE_ID), [metas]);
  const mesAtual = useMemo(() => new Date(), []);
  const realizadoEquipe = useMemo(
    () => realizadoNoMes(oportunidades, mesAtual.getMonth() + 1, mesAtual.getFullYear()),
    [oportunidades, mesAtual]
  );

  const metricas = useMemo(() => {
    const ganhas = oportunidades.filter((o) => (o.probabilidade ?? 0) >= 1 && o.etapa_atual !== "Perdido");
    const perdidas = oportunidades.filter((o) => o.etapa_atual === "Perdido");
    const abertas = oportunidades.filter((o) => o.etapa_atual !== "Perdido" && (o.probabilidade ?? 0) < 1);

    const valorPipeline = abertas.reduce((acc, o) => acc + (o.valor_estimado ?? 0), 0);
    const valorPonderado = abertas.reduce((acc, o) => acc + (o.receita_ponderada ?? 0), 0);
    const receitaFechada = ganhas.reduce((acc, o) => acc + (o.valor_estimado ?? 0), 0);
    const comValor = oportunidades.filter((o) => o.valor_estimado);
    const ticketMedio = comValor.length ? comValor.reduce((acc, o) => acc + (o.valor_estimado ?? 0), 0) / comValor.length : 0;
    const totalDecididas = ganhas.length + perdidas.length;
    const taxaConversao = totalDecididas ? (ganhas.length / totalDecididas) * 100 : 0;

    return { valorPipeline, valorPonderado, receitaFechada, ticketMedio, taxaConversao, ganhas: ganhas.length, perdidas: perdidas.length };
  }, [oportunidades]);

  const porTemperatura = useMemo(() => {
    const contagem: Record<string, number> = { Frio: 0, Morno: 0, Quente: 0, "Sem dados": 0 };
    for (const e of empresas) {
      contagem[e.temperatura ?? "Sem dados"] = (contagem[e.temperatura ?? "Sem dados"] ?? 0) + 1;
    }
    return contagem;
  }, [empresas]);

  const porIcp = useMemo(() => {
    const contagem: Record<string, number> = { A: 0, B: 0, C: 0, "Sem dados": 0 };
    for (const e of empresas) {
      contagem[e.icp ?? "Sem dados"] = (contagem[e.icp ?? "Sem dados"] ?? 0) + 1;
    }
    return contagem;
  }, [empresas]);

  const topLeads = useMemo(() => {
    const oportunidadesPorEmpresa = new Map<string, Oportunidade[]>();
    for (const o of oportunidades) {
      const arr = oportunidadesPorEmpresa.get(o.empresa_id) ?? [];
      arr.push(o);
      oportunidadesPorEmpresa.set(o.empresa_id, arr);
    }
    return [...empresas]
      .map((e) => ({ empresa: e, score: calcularScoreLead(e, oportunidadesPorEmpresa.get(e.id) ?? [], regrasScore).pontos }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }, [empresas, oportunidades, regrasScore]);

  const porEtapa = useMemo(() => {
    const map = new Map<string, { count: number; valor: number }>();
    for (const etapa of ETAPAS_FUNIL) map.set(etapa, { count: 0, valor: 0 });
    for (const o of oportunidades) {
      const atual = map.get(o.etapa_atual) ?? { count: 0, valor: 0 };
      atual.count += 1;
      atual.valor += o.valor_estimado ?? 0;
      map.set(o.etapa_atual, atual);
    }
    return map;
  }, [oportunidades]);

  const funil = useMemo(() => funilConversao(oportunidades, historico), [oportunidades, historico]);
  const cicloVendas = useMemo(() => cicloVendasComercial(historico), [historico]);
  const tempoPorEtapa = useMemo(() => tempoMedioPorEtapa(historico), [historico]);

  if (loading) {
    return <p className="p-6 text-sm text-navy/50">Carregando...</p>;
  }

  return (
    <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-extrabold text-navy">Dashboard comercial</h1>
        <p className="text-sm text-navy/60">Visão geral do funil e da carteira de empresas</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card label="Total de leads" value={empresas.length.toString()} />
        <Card label="Oportunidades" value={oportunidades.length.toString()} />
        <Card label="Pipeline aberto" value={moeda(metricas.valorPipeline)} />
        <Card label="Pipeline ponderado" value={moeda(metricas.valorPonderado)} destaque />
        <Card label="Receita fechada" value={moeda(metricas.receitaFechada)} />
        <Card label="Ticket médio" value={moeda(metricas.ticketMedio)} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card label="Taxa de conversão" value={`${metricas.taxaConversao.toFixed(0)}%`} sub={`${metricas.ganhas} ganhas · ${metricas.perdidas} perdidas`} />
        <Card label="Oportunidades ganhas" value={metricas.ganhas.toString()} />
        <Card label="Oportunidades perdidas" value={metricas.perdidas.toString()} />
      </div>

      {(metaEquipe || gcs.length > 0) && (
        <div className="bg-white rounded-xl border border-navy/10 p-4 shadow-sm">
          <h2 className="text-sm font-bold text-navy mb-3">
            Metas de {mesAtual.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
          </h2>
          <div className="flex flex-col gap-3">
            {metaEquipe && (
              <BarraMeta label="Equipe (total)" realizado={realizadoEquipe} meta={metaEquipe.valor_meta} destaque />
            )}
            {gcs.map((gc) => {
              const meta = metas.find((m) => m.gc_id === gc.id);
              if (!meta) return null;
              const realizado = realizadoNoMes(oportunidades, mesAtual.getMonth() + 1, mesAtual.getFullYear(), gc.id);
              return <BarraMeta key={gc.id} label={gc.nome} realizado={realizado} meta={meta.valor_meta} />;
            })}
            {!metaEquipe && gcs.every((gc) => !metas.find((m) => m.gc_id === gc.id)) && (
              <p className="text-xs text-navy/40">
                Nenhuma meta definida para este mês. Configure em Configurações → Metas.
              </p>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-navy/10 p-4 shadow-sm">
          <h2 className="text-sm font-bold text-navy mb-3">Empresas por temperatura</h2>
          <div className="flex flex-col gap-2">
            {Object.entries(porTemperatura)
              .filter(([, v]) => v > 0)
              .map(([temp, v]) => (
                <Barra key={temp} label={temp} valor={v} total={empresas.length} />
              ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-navy/10 p-4 shadow-sm">
          <h2 className="text-sm font-bold text-navy mb-3">Empresas por ICP</h2>
          <div className="flex flex-col gap-2">
            {Object.entries(porIcp)
              .filter(([, v]) => v > 0)
              .map(([icp, v]) => (
                <Barra key={icp} label={icp} valor={v} total={empresas.length} />
              ))}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-navy/10 p-4 shadow-sm">
        <h2 className="text-sm font-bold text-navy mb-3">Top 5 leads (score)</h2>
        <div className="flex flex-col gap-2">
          {topLeads.map(({ empresa, score }) => {
            const classificacao = classificarScore(score);
            return (
              <div key={empresa.id} className="flex items-center justify-between text-sm">
                <span className="text-navy font-medium">{empresa.nome_empresa}</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${classificacao.cor}`}>
                  {score} · {classificacao.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-navy/10 overflow-x-auto shadow-sm">
        <h2 className="text-sm font-bold text-navy px-4 pt-4">Oportunidades por etapa</h2>
        <table className="w-full text-sm mt-2">
          <thead>
            <tr className="text-left text-navy/50 border-b border-navy/10 bg-navy/[0.03]">
              <th className="px-4 py-2 font-semibold">Etapa</th>
              <th className="px-4 py-2 font-semibold">Probabilidade</th>
              <th className="px-4 py-2 font-semibold">Qtd</th>
              <th className="px-4 py-2 font-semibold">Valor</th>
            </tr>
          </thead>
          <tbody>
            {ETAPAS_FUNIL.map((etapa) => {
              const dados = porEtapa.get(etapa) ?? { count: 0, valor: 0 };
              const config = etapas.find((e) => e.nome === etapa);
              return (
                <tr key={etapa} className="border-b border-navy/5 last:border-0">
                  <td className="px-4 py-2 font-medium text-navy">{etapa}</td>
                  <td className="px-4 py-2 text-navy/60">{config ? `${Math.round(config.probabilidade * 100)}%` : "—"}</td>
                  <td className="px-4 py-2 text-navy/60">{dados.count}</td>
                  <td className="px-4 py-2 text-navy/60">{moeda(dados.valor)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-navy/10 p-4 shadow-sm">
          <h2 className="text-sm font-bold text-navy mb-3">Funil de conversão (Comercial)</h2>
          {funil[0]?.qtd === 0 ? (
            <p className="text-xs text-navy/40">Sem oportunidades comerciais suficientes ainda.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {funil.map((f) => (
                <BarraFunil key={f.etapa} {...f} />
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Card
              label="Ciclo médio de vendas"
              value={cicloVendas.amostras ? `${cicloVendas.diasMedios} dias` : "—"}
              sub={cicloVendas.amostras ? `${cicloVendas.amostras} oportunidade${cicloVendas.amostras > 1 ? "s" : ""} fechada${cicloVendas.amostras > 1 ? "s" : ""} · Prospect → Contrato Fechado` : "Ainda sem oportunidades fechadas"}
            />
          </div>
          <div className="bg-white rounded-xl border border-navy/10 overflow-x-auto shadow-sm flex-1">
            <h2 className="text-sm font-bold text-navy px-4 pt-4 pb-1">Tempo médio por etapa</h2>
            {tempoPorEtapa.length === 0 ? (
              <p className="px-4 pb-4 text-xs text-navy/40">Ainda sem histórico suficiente.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-navy/50 border-b border-navy/10 bg-navy/[0.03]">
                    <th className="px-4 py-2 font-semibold">Etapa</th>
                    <th className="px-4 py-2 font-semibold">Dias médios</th>
                    <th className="px-4 py-2 font-semibold">Amostras</th>
                  </tr>
                </thead>
                <tbody>
                  {tempoPorEtapa.map((t) => (
                    <tr key={t.etapa} className="border-b border-navy/5 last:border-0">
                      <td className="px-4 py-2 font-medium text-navy">{t.etapa}</td>
                      <td className="px-4 py-2 text-navy/60">{t.diasMedios}</td>
                      <td className="px-4 py-2 text-navy/60">{t.amostras}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Card({ label, value, sub, destaque }: { label: string; value: string; sub?: string; destaque?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 shadow-sm ${destaque ? "bg-navy border-navy" : "bg-white border-navy/10"}`}>
      <p className={`text-xs font-semibold ${destaque ? "text-cream/60" : "text-navy/50"}`}>{label}</p>
      <p className={`text-lg font-extrabold mt-1 ${destaque ? "text-cream" : "text-navy"}`}>{value}</p>
      {sub && <p className={`text-[11px] mt-0.5 ${destaque ? "text-cream/50" : "text-navy/40"}`}>{sub}</p>}
    </div>
  );
}

function BarraMeta({
  label,
  realizado,
  meta,
  destaque,
}: {
  label: string;
  realizado: number;
  meta: number;
  destaque?: boolean;
}) {
  const pct = meta ? Math.min(Math.round((realizado / meta) * 100), 100) : 0;
  const bateu = meta > 0 && realizado >= meta;
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className={`font-semibold ${destaque ? "text-navy" : "text-navy/70"}`}>{label}</span>
        <span className="text-navy/60">
          {moeda(realizado)} / {moeda(meta)} ({pct}%)
        </span>
      </div>
      <div className="h-2.5 rounded-full bg-navy/5 overflow-hidden">
        <div className={`h-full rounded-full ${bateu ? "bg-green-500" : "bg-red"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function BarraFunil({
  etapa,
  qtd,
  percentualDoTopo,
  percentualEtapaAnterior,
}: {
  etapa: string;
  qtd: number;
  percentualDoTopo: number;
  percentualEtapaAnterior: number | null;
}) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="font-semibold text-navy/70">{etapa}</span>
        <span className="text-navy/60">
          {qtd} · {percentualDoTopo}%{percentualEtapaAnterior !== null ? ` (${percentualEtapaAnterior}% da etapa anterior)` : ""}
        </span>
      </div>
      <div className="h-2.5 rounded-full bg-navy/5 overflow-hidden">
        <div className="h-full rounded-full bg-blue" style={{ width: `${percentualDoTopo}%` }} />
      </div>
    </div>
  );
}

function Barra({ label, valor, total }: { label: string; valor: number; total: number }) {
  const pct = total ? Math.round((valor / total) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-xs text-navy/70 mb-1">
        <span className="font-medium">{label}</span>
        <span>
          {valor} ({pct}%)
        </span>
      </div>
      <div className="h-2 rounded-full bg-navy/5 overflow-hidden">
        <div className="h-full bg-blue rounded-full" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
