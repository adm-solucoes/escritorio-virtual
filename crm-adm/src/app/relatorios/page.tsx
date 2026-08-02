"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Mail } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { exportarCSV } from "@/lib/csv";
import type { Empresa, Gc, Oportunidade, OportunidadeHistoricoEtapa, PipelineSnapshot } from "@/lib/types";
import {
  evolucaoPipeline,
  evolucaoValorPipeline,
  relatorioMensal,
  relatorioPerdas,
  relatorioPorOrigem,
  relatorioPorResponsavel,
  tempoMedioPorEtapa,
} from "@/lib/relatorios";

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function RelatoriosPage() {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [oportunidades, setOportunidades] = useState<Oportunidade[]>([]);
  const [gcs, setGcs] = useState<Gc[]>([]);
  const [historico, setHistorico] = useState<OportunidadeHistoricoEtapa[]>([]);
  const [snapshots, setSnapshots] = useState<PipelineSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    Promise.all([
      supabase.from("empresas").select("*"),
      supabase.from("oportunidades").select("*"),
      supabase.from("gcs").select("*"),
      supabase.from("oportunidade_historico_etapa").select("*"),
      supabase.from("pipeline_snapshot").select("*").order("data"),
    ]).then(([{ data: empData }, { data: opsData }, { data: gcsData }, { data: histData }, { data: snapData }]) => {
      if (cancelado) return;
      setEmpresas(empData ?? []);
      setOportunidades(opsData ?? []);
      setGcs(gcsData ?? []);
      setHistorico((histData as OportunidadeHistoricoEtapa[]) ?? []);
      setSnapshots((snapData as PipelineSnapshot[]) ?? []);
      setLoading(false);
    });
    return () => {
      cancelado = true;
    };
  }, []);

  const mensal = useMemo(() => relatorioMensal(oportunidades), [oportunidades]);
  const perdas = useMemo(() => relatorioPerdas(oportunidades), [oportunidades]);
  const origem = useMemo(() => relatorioPorOrigem(empresas, oportunidades), [empresas, oportunidades]);
  const responsavel = useMemo(() => relatorioPorResponsavel(oportunidades, gcs), [oportunidades, gcs]);
  const evolucao = useMemo(() => evolucaoPipeline(empresas, oportunidades), [empresas, oportunidades]);
  const tempoPorEtapa = useMemo(() => tempoMedioPorEtapa(historico), [historico]);
  const evolucaoValor = useMemo(() => evolucaoValorPipeline(snapshots, "comercial"), [snapshots]);

  async function enviarPorEmail() {
    setEnviando(true);
    setEnviado(null);
    try {
      const res = await fetch("/api/relatorios/enviar", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao enviar");
      setEnviado("E-mail enviado com sucesso!");
    } catch (e) {
      setEnviado("Erro ao enviar: " + (e instanceof Error ? e.message : "desconhecido"));
    } finally {
      setEnviando(false);
    }
  }

  if (loading) {
    return <p className="p-6 text-sm text-navy/50">Carregando...</p>;
  }

  return (
    <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="titulo-pagina">Relatórios</h1>
          <p className="text-sm text-navy/60">Vendas, perdas, origem de lead, responsáveis e evolução</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button onClick={enviarPorEmail} disabled={enviando} className="btn-primary whitespace-nowrap">
            <Mail size={16} /> {enviando ? "Enviando..." : "Enviar por e-mail"}
          </button>
          {enviado && <span className="text-xs text-navy/60">{enviado}</span>}
        </div>
      </div>

      <Secao
        titulo="Relatório mensal de vendas"
        arquivo="relatorio-mensal-vendas"
        colunas={["Mês", "Ganhas", "Valor ganho", "Perdidas", "Valor perdido"]}
        linhas={mensal.map((m) => [m.label, m.qtdGanhas.toString(), moeda(m.valorGanho), m.qtdPerdidas.toString(), moeda(m.valorPerdido)])}
      >
        <Tabela
          colunas={["Mês", "Ganhas", "Valor ganho", "Perdidas", "Valor perdido"]}
          linhas={mensal.map((m) => [m.label, m.qtdGanhas.toString(), moeda(m.valorGanho), m.qtdPerdidas.toString(), moeda(m.valorPerdido)])}
          vazio="Sem oportunidades ganhas ou perdidas ainda."
        />
      </Secao>

      <Secao
        titulo="Relatório de perdas por motivo"
        arquivo="relatorio-perdas"
        colunas={["Motivo", "Qtd", "Valor"]}
        linhas={perdas.map((p) => [p.motivo, p.qtd.toString(), moeda(p.valor)])}
      >
        <Tabela
          colunas={["Motivo", "Qtd", "Valor"]}
          linhas={perdas.map((p) => [p.motivo, p.qtd.toString(), moeda(p.valor)])}
          vazio="Nenhuma oportunidade perdida ainda."
        />
      </Secao>

      <Secao
        titulo="Relatório por origem de lead"
        arquivo="relatorio-origem"
        colunas={["Origem", "Leads", "Oportunidades", "Valor ganho"]}
        linhas={origem.map((o) => [o.origem, o.leads.toString(), o.oportunidades.toString(), moeda(o.valorGanho)])}
      >
        <Tabela
          colunas={["Origem", "Leads", "Oportunidades", "Valor ganho"]}
          linhas={origem.map((o) => [o.origem, o.leads.toString(), o.oportunidades.toString(), moeda(o.valorGanho)])}
          vazio="Sem dados de origem."
        />
      </Secao>

      <Secao
        titulo="Relatório por responsável"
        arquivo="relatorio-responsavel"
        colunas={["GC", "Em aberto", "Ganhas", "Perdidas", "Pipeline aberto", "Valor ganho", "Conversão"]}
        linhas={responsavel.map((r) => [
          r.nome,
          r.abertas.toString(),
          r.ganhas.toString(),
          r.perdidas.toString(),
          moeda(r.valorPipeline),
          moeda(r.valorGanho),
          `${r.taxaConversao.toFixed(0)}%`,
        ])}
      >
        <Tabela
          colunas={["GC", "Em aberto", "Ganhas", "Perdidas", "Pipeline aberto", "Valor ganho", "Conversão"]}
          linhas={responsavel.map((r) => [
            r.nome,
            r.abertas.toString(),
            r.ganhas.toString(),
            r.perdidas.toString(),
            moeda(r.valorPipeline),
            moeda(r.valorGanho),
            `${r.taxaConversao.toFixed(0)}%`,
          ])}
          vazio="Sem oportunidades cadastradas."
        />
      </Secao>

      <Secao
        titulo="Evolução do pipeline (novos leads e oportunidades por mês)"
        arquivo="evolucao-pipeline"
        colunas={["Mês", "Novas empresas", "Novas oportunidades"]}
        linhas={evolucao.map((e) => [e.label, e.novasEmpresas.toString(), e.novasOportunidades.toString()])}
      >
        <Tabela
          colunas={["Mês", "Novas empresas", "Novas oportunidades"]}
          linhas={evolucao.map((e) => [e.label, e.novasEmpresas.toString(), e.novasOportunidades.toString()])}
          vazio="Sem dados suficientes."
        />
      </Secao>

      <Secao
        titulo="Tempo médio por etapa (ciclo de vendas)"
        arquivo="tempo-medio-por-etapa"
        colunas={["Etapa", "Dias médios", "Amostras"]}
        linhas={tempoPorEtapa.map((t) => [t.etapa, t.diasMedios.toString(), t.amostras.toString()])}
      >
        <Tabela
          colunas={["Etapa", "Dias médios", "Amostras"]}
          linhas={tempoPorEtapa.map((t) => [t.etapa, t.diasMedios.toString(), t.amostras.toString()])}
          vazio="Ainda sem histórico suficiente — vai se acumulando conforme oportunidades mudam de etapa."
        />
      </Secao>

      <Secao
        titulo="Evolução do valor do pipeline comercial (foto diária)"
        arquivo="evolucao-valor-pipeline"
        colunas={["Data", "Valor em pipeline", "Valor ponderado", "Qtd. oportunidades"]}
        linhas={evolucaoValor.map((e) => [
          new Date(e.data).toLocaleDateString("pt-BR"),
          moeda(e.valorTotal),
          moeda(e.valorPonderado),
          e.qtd.toString(),
        ])}
      >
        <Tabela
          colunas={["Data", "Valor em pipeline", "Valor ponderado", "Qtd. oportunidades"]}
          linhas={evolucaoValor.map((e) => [
            new Date(e.data).toLocaleDateString("pt-BR"),
            moeda(e.valorTotal),
            moeda(e.valorPonderado),
            e.qtd.toString(),
          ])}
          vazio="Ainda sem fotos do pipeline — a primeira roda no próximo dia útil (cron diário)."
        />
      </Secao>
    </div>
  );
}

function Secao({
  titulo,
  arquivo,
  colunas,
  linhas,
  children,
}: {
  titulo: string;
  arquivo: string;
  colunas: string[];
  linhas: string[][];
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-navy/15 overflow-x-auto shadow-sm">
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <h2 className="text-sm font-bold text-navy">{titulo}</h2>
        {linhas.length > 0 && (
          <button
            onClick={() => exportarCSV(arquivo, colunas, linhas)}
            className="flex items-center gap-1 text-xs font-semibold text-blue hover:underline shrink-0"
          >
            <Download size={13} /> Exportar CSV
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function Tabela({ colunas, linhas, vazio }: { colunas: string[]; linhas: string[][]; vazio: string }) {
  if (linhas.length === 0) {
    return <p className="px-4 pb-4 text-sm text-navy/50">{vazio}</p>;
  }
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-navy/50 border-b border-navy/15 bg-navy/[0.03]">
          {colunas.map((c) => (
            <th key={c} className="px-4 py-2 font-semibold whitespace-nowrap">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {linhas.map((linha, i) => (
          <tr key={i} className="border-b border-navy/5 last:border-0">
            {linha.map((valor, j) => (
              <td key={j} className={`px-4 py-2 whitespace-nowrap ${j === 0 ? "font-medium text-navy" : "text-navy/70"}`}>
                {valor}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
