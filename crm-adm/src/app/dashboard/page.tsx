"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Users,
  Briefcase,
  Wallet,
  Target,
  Trophy,
  Ticket,
  Percent,
  ThumbsUp,
  ThumbsDown,
  TrendingUp,
  PieChart,
  Layers,
  GitBranch,
  Timer,
  Table2,
} from "lucide-react";
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
import { cicloVendasComercial, chaveMes, funilConversao, isGanha, isPerdida, mesAno, tempoMedioPorEtapa } from "@/lib/relatorios";
import { DonutChart } from "@/components/charts/DonutChart";
import { LineChart } from "@/components/charts/LineChart";
import { FunnelChart } from "@/components/charts/FunnelChart";
import { StatCard } from "@/components/charts/StatCard";
import { CORES_ICP, CORES_TEMPERATURA, COR_GANHOS, COR_PERDAS } from "@/components/charts/chart-colors";

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const moedaCompacta = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 });

function variacaoPercentual(atual: number, anterior: number): number | null {
  if (anterior === 0) return atual === 0 ? 0 : null;
  return ((atual - anterior) / anterior) * 100;
}

const MESES_HISTORICO = 6;

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

  // Série mensal (últimos 6 meses, preenchendo meses sem dados com zero) pro
  // gráfico de linha Ganhas x Perdidas.
  const serieMensal = useMemo(() => {
    const meses: { chave: string; label: string; ganho: number; perdido: number }[] = [];
    const hoje = new Date();
    for (let i = MESES_HISTORICO - 1; i >= 0; i--) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      meses.push({ chave: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: mesAno(d.toISOString()), ganho: 0, perdido: 0 });
    }
    const porChave = new Map(meses.map((m) => [m.chave, m]));
    for (const o of oportunidades) {
      if (!isGanha(o) && !isPerdida(o)) continue;
      const chave = chaveMes(o.atualizado_em ?? o.criado_em);
      const m = porChave.get(chave);
      if (!m) continue;
      if (isGanha(o)) m.ganho += o.valor_estimado ?? 0;
      else m.perdido += o.valor_estimado ?? 0;
    }
    return meses;
  }, [oportunidades]);

  const deltaReceita = useMemo(() => {
    const n = serieMensal.length;
    if (n < 2) return null;
    return variacaoPercentual(serieMensal[n - 1].ganho, serieMensal[n - 2].ganho);
  }, [serieMensal]);

  const deltaPerdas = useMemo(() => {
    const n = serieMensal.length;
    if (n < 2) return null;
    return variacaoPercentual(serieMensal[n - 1].perdido, serieMensal[n - 2].perdido);
  }, [serieMensal]);

  if (loading) {
    return <p className="p-6 text-sm text-navy/50">Carregando...</p>;
  }

  return (
    <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 py-7 flex flex-col gap-7">
      <div className="flex items-baseline justify-between gap-3 border-b border-navy/15 pb-5">
        <div>
          <h1 className="titulo-pagina">Dashboard comercial</h1>
          <p className="text-sm text-navy/50 mt-0.5">Visão geral do funil e da carteira de empresas</p>
        </div>
        <p className="text-xs font-semibold text-navy/40 uppercase tracking-wide hidden sm:block">
          {mesAtual.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Total de leads" value={empresas.length.toString()} icon={Users} />
        <StatCard label="Oportunidades" value={oportunidades.length.toString()} icon={Briefcase} />
        <StatCard label="Pipeline aberto" value={moeda(metricas.valorPipeline)} icon={Wallet} />
        <StatCard label="Pipeline ponderado" value={moeda(metricas.valorPonderado)} icon={Target} destaque />
        <StatCard label="Receita fechada" value={moeda(metricas.receitaFechada)} delta={deltaReceita} sub="vs. mês anterior" icon={Trophy} />
        <StatCard label="Ticket médio" value={moeda(metricas.ticketMedio)} icon={Ticket} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard label="Taxa de conversão" value={`${metricas.taxaConversao.toFixed(0)}%`} sub={`${metricas.ganhas} ganhas · ${metricas.perdidas} perdidas`} icon={Percent} />
        <StatCard label="Oportunidades ganhas" value={metricas.ganhas.toString()} icon={ThumbsUp} />
        <StatCard
          label="Oportunidades perdidas"
          value={metricas.perdidas.toString()}
          delta={deltaPerdas}
          deltaGoodDirection="down"
          sub="valor perdido vs. mês anterior"
          icon={ThumbsDown}
        />
      </div>

      {(metaEquipe || gcs.length > 0) && (
        <div className="bg-white rounded-xl border border-navy/15 p-5 shadow-elevated">
          <h2 className="text-sm font-bold text-navy mb-4 flex items-center gap-2">
            <span className="w-6 h-6 rounded-md bg-navy/[0.05] flex items-center justify-center text-navy/60">
              <Target size={13} />
            </span>
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

      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4">
        <div className="bg-white rounded-xl border border-navy/15 p-5 shadow-elevated">
          <h2 className="text-sm font-bold text-navy mb-4 flex items-center gap-2">
            <span className="w-6 h-6 rounded-md bg-navy/[0.05] flex items-center justify-center text-navy/60">
              <TrendingUp size={13} />
            </span>
            Receita por mês — Ganhas × Perdidas
          </h2>
          <LineChart
            series={[
              { name: "Ganhas", color: COR_GANHOS, valores: serieMensal.map((m) => m.ganho) },
              { name: "Perdidas", color: COR_PERDAS, valores: serieMensal.map((m) => m.perdido) },
            ]}
            categorias={serieMensal.map((m) => m.label)}
            formatValue={moeda}
            formatTick={moedaCompacta}
          />
        </div>

        <div className="bg-white rounded-xl border border-navy/15 p-5 shadow-sm flex flex-col">
          <h2 className="text-sm font-bold text-navy mb-3.5 flex items-center gap-2">
            <span className="w-6 h-6 rounded-md bg-navy/[0.05] flex items-center justify-center text-navy/60">
              <Trophy size={13} />
            </span>
            Top 5 leads (score)
          </h2>
          <div className="flex flex-col gap-2.5">
            {topLeads.map(({ empresa, score }) => {
              const classificacao = classificarScore(score);
              return (
                <div key={empresa.id} className="flex items-center justify-between text-sm gap-2">
                  <span className="text-navy font-medium truncate">{empresa.nome_empresa}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold shrink-0 ${classificacao.cor}`}>
                    {score} · {classificacao.label}
                  </span>
                </div>
              );
            })}
            {topLeads.length === 0 && <p className="text-xs text-navy/40">Sem leads cadastrados ainda.</p>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-navy/15 p-5 shadow-sm">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-sm font-bold text-navy flex items-center gap-2">
              <span className="w-6 h-6 rounded-md bg-navy/[0.05] flex items-center justify-center text-navy/60">
                <PieChart size={13} />
              </span>
              Empresas por temperatura
            </h2>
            <span className="text-xs text-navy/40">{empresas.length} no total</span>
          </div>
          <DonutChart
            data={Object.entries(porTemperatura)
              .filter(([, v]) => v > 0)
              .map(([temp, v]) => ({ label: temp, value: v, color: CORES_TEMPERATURA[temp] ?? "#a8a29e" }))}
            centerTitle="Empresas"
          />
        </div>

        <div className="bg-white rounded-xl border border-navy/15 p-5 shadow-sm">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-sm font-bold text-navy flex items-center gap-2">
              <span className="w-6 h-6 rounded-md bg-navy/[0.05] flex items-center justify-center text-navy/60">
                <Layers size={13} />
              </span>
              Empresas por ICP
            </h2>
            <span className="text-xs text-navy/40">{empresas.length} no total</span>
          </div>
          <DonutChart
            data={Object.entries(porIcp)
              .filter(([, v]) => v > 0)
              .map(([icp, v]) => ({ label: icp, value: v, color: CORES_ICP[icp] ?? "#a8a29e" }))}
            centerTitle="Empresas"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-navy/15 overflow-x-auto shadow-sm">
        <h2 className="text-sm font-bold text-navy px-5 pt-5 flex items-center gap-2">
          <span className="w-6 h-6 rounded-md bg-navy/[0.05] flex items-center justify-center text-navy/60">
            <Table2 size={13} />
          </span>
          Oportunidades por etapa
        </h2>
        <table className="w-full text-sm mt-3">
          <thead>
            <tr className="text-left text-navy/50 border-b border-navy/15 bg-navy/[0.03]">
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
        <div className="bg-white rounded-xl border border-navy/15 p-5 shadow-sm">
          <h2 className="text-sm font-bold text-navy mb-3.5 flex items-center gap-2">
            <span className="w-6 h-6 rounded-md bg-navy/[0.05] flex items-center justify-center text-navy/60">
              <GitBranch size={13} />
            </span>
            Funil de conversão (Comercial)
          </h2>
          {funil[0]?.qtd === 0 ? (
            <p className="text-xs text-navy/40">Sem oportunidades comerciais suficientes ainda.</p>
          ) : (
            <FunnelChart data={funil} />
          )}
        </div>

        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              label="Ciclo médio de vendas"
              value={cicloVendas.amostras ? `${cicloVendas.diasMedios} dias` : "—"}
              sub={cicloVendas.amostras ? `${cicloVendas.amostras} oportunidade${cicloVendas.amostras > 1 ? "s" : ""} fechada${cicloVendas.amostras > 1 ? "s" : ""} · Prospect → Contrato Fechado` : "Ainda sem oportunidades fechadas"}
              icon={Timer}
            />
          </div>
          <div className="bg-white rounded-xl border border-navy/15 overflow-x-auto shadow-sm flex-1">
            <h2 className="text-sm font-bold text-navy px-5 pt-5 pb-1 flex items-center gap-2">
              <span className="w-6 h-6 rounded-md bg-navy/[0.05] flex items-center justify-center text-navy/60">
                <Table2 size={13} />
              </span>
              Tempo médio por etapa
            </h2>
            {tempoPorEtapa.length === 0 ? (
              <p className="px-4 pb-4 text-xs text-navy/40">Ainda sem histórico suficiente.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-navy/50 border-b border-navy/15 bg-navy/[0.03]">
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
        <div className={`h-full rounded-full ${bateu ? "bg-success" : "bg-red"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

