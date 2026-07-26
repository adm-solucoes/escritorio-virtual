"use client";

import { useEffect, useMemo, useState } from "react";
import { DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { Download } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { criarTarefaAutomaticaSeConfigurada } from "@/lib/automacoes";
import { useGcAtual } from "@/lib/useGcAtual";
import { exportarCSV } from "@/lib/csv";
import {
  type Empresa,
  type EtapaFunil,
  type EtapaFunilConfig,
  type Gc,
  type Oportunidade,
  type OportunidadeHistoricoEtapa,
  type TipoPipeline,
} from "@/lib/types";
import KanbanColumn from "@/components/KanbanColumn";
import OportunidadeModal from "@/components/OportunidadeModal";

export default function PipelinePage() {
  const { gc: gcAtual, carregando: carregandoGc } = useGcAtual();
  const [oportunidades, setOportunidades] = useState<Oportunidade[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [gcs, setGcs] = useState<Gc[]>([]);
  const [etapas, setEtapas] = useState<EtapaFunilConfig[]>([]);
  const [historico, setHistorico] = useState<OportunidadeHistoricoEtapa[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<Oportunidade | null>(null);
  const [etapaNova, setEtapaNova] = useState<EtapaFunil>("Prospect");
  const [refreshKey, setRefreshKey] = useState(0);
  const [busca, setBusca] = useState("");
  const [gcFiltro, setGcFiltro] = useState("");
  const [valorMin, setValorMin] = useState("");
  const [valorMax, setValorMax] = useState("");
  const [tipoPipeline, setTipoPipeline] = useState<TipoPipeline>("comercial");

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function carregar() {
    setRefreshKey((k) => k + 1);
  }

  useEffect(() => {
    let cancelado = false;
    Promise.all([
      supabase.from("oportunidades").select("*").order("criado_em", { ascending: false }),
      supabase.from("empresas").select("*").order("nome_empresa"),
      supabase.from("etapas_funil").select("*").order("ordem"),
      supabase.from("gcs").select("*").order("nome"),
      supabase.from("oportunidade_historico_etapa").select("*").order("data_mudanca", { ascending: false }),
    ]).then(([{ data: opsData }, { data: empData }, { data: etapasData }, { data: gcsData }, { data: histData }]) => {
      if (cancelado) return;
      setOportunidades(opsData ?? []);
      setEmpresas(empData ?? []);
      setEtapas((etapasData as EtapaFunilConfig[]) ?? []);
      setGcs(gcsData ?? []);
      setHistorico((histData as OportunidadeHistoricoEtapa[]) ?? []);
      setLoading(false);
    });
    return () => {
      cancelado = true;
    };
  }, [refreshKey]);

  const empresasPorId = useMemo(() => new Map(empresas.map((e) => [e.id, e])), [empresas]);
  const etapasDoTipo = useMemo(() => etapas.filter((e) => e.tipo_pipeline === tipoPipeline).map((e) => e.nome), [etapas, tipoPipeline]);
  const probabilidadePorEtapa = useMemo(() => new Map(etapas.map((e) => [e.nome, e.probabilidade])), [etapas]);

  // data da mudança de etapa mais recente por oportunidade, pra calcular dias reais na etapa atual
  const ultimaMudancaPorOportunidade = useMemo(() => {
    const map = new Map<string, string>();
    for (const h of historico) {
      if (!map.has(h.oportunidade_id)) map.set(h.oportunidade_id, h.data_mudanca);
    }
    return map;
  }, [historico]);

  const souComercial = gcAtual?.role === "comercial";

  const oportunidadesFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const min = valorMin ? Number(valorMin) : null;
    const max = valorMax ? Number(valorMax) : null;

    return oportunidades.filter((o) => {
      if (o.tipo_pipeline !== tipoPipeline) return false;
      // GC comercial só vê a própria carteira; gestor vê tudo
      if (souComercial && gcAtual && o.gc_responsavel_id !== gcAtual.id) return false;
      if (termo) {
        const nomeEmpresa = empresasPorId.get(o.empresa_id)?.nome_empresa?.toLowerCase() ?? "";
        if (!nomeEmpresa.includes(termo) && !(o.projeto ?? "").toLowerCase().includes(termo)) return false;
      }
      if (gcFiltro && o.gc_responsavel_id !== gcFiltro) return false;
      if (min !== null && (o.valor_estimado ?? 0) < min) return false;
      if (max !== null && (o.valor_estimado ?? 0) > max) return false;
      return true;
    });
  }, [oportunidades, busca, gcFiltro, valorMin, valorMax, empresasPorId, tipoPipeline, souComercial, gcAtual]);

  const porEtapa = useMemo(() => {
    const map = new Map<EtapaFunil, Oportunidade[]>();
    for (const etapa of etapasDoTipo) map.set(etapa, []);
    for (const o of oportunidadesFiltradas) {
      map.get(o.etapa_atual)?.push(o);
    }
    return map;
  }, [oportunidadesFiltradas, etapasDoTipo]);

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const novaEtapa = over.id as EtapaFunil;
    const oportunidade = oportunidades.find((o) => o.id === active.id);
    if (!oportunidade || oportunidade.etapa_atual === novaEtapa) return;

    // Perdido exige motivo (obrigatório no modal) — não grava a troca de etapa direto
    // no drag, só abre o modal já com "Perdido" selecionado. Se o usuário cancelar,
    // a oportunidade continua exatamente onde estava.
    if (novaEtapa === "Perdido") {
      abrirEdicao({ ...oportunidade, etapa_atual: novaEtapa });
      return;
    }

    const novaProbabilidade = probabilidadePorEtapa.get(novaEtapa) ?? oportunidade.probabilidade;
    const novaReceitaPonderada = (oportunidade.valor_estimado ?? 0) * (novaProbabilidade ?? 0);

    setOportunidades((prev) =>
      prev.map((o) =>
        o.id === oportunidade.id
          ? { ...o, etapa_atual: novaEtapa, probabilidade: novaProbabilidade, receita_ponderada: novaReceitaPonderada }
          : o
      )
    );

    const { error } = await supabase
      .from("oportunidades")
      .update({ etapa_atual: novaEtapa })
      .eq("id", oportunidade.id);

    if (error) {
      alert("Erro ao mover oportunidade: " + error.message);
      carregar();
      return;
    }

    await criarTarefaAutomaticaSeConfigurada(oportunidade, novaEtapa);
  }

  function exportarCsvPipeline() {
    const gcPorId = new Map(gcs.map((g) => [g.id, g.nome]));
    const colunas = ["Empresa", "Projeto", "Pipeline", "Etapa", "Valor estimado", "Valor ponderado", "GC responsável", "Motivo de perda"];
    const linhas = oportunidadesFiltradas.map((o) => [
      empresasPorId.get(o.empresa_id)?.nome_empresa ?? "",
      o.projeto ?? "",
      o.tipo_pipeline === "cs" ? "Customer Success" : "Comercial",
      o.etapa_atual,
      String(o.valor_estimado ?? 0),
      String(o.receita_ponderada ?? 0),
      o.gc_responsavel_id ? gcPorId.get(o.gc_responsavel_id) ?? "" : "",
      o.motivo_perda ?? "",
    ]);
    exportarCSV(`pipeline-${new Date().toISOString().slice(0, 10)}`, colunas, linhas);
  }

  function abrirNova(etapa: EtapaFunil) {
    setEditando(null);
    setEtapaNova(etapa);
    setModalAberto(true);
  }

  function abrirEdicao(o: Oportunidade) {
    setEditando(o);
    setModalAberto(true);
  }

  if (!carregandoGc && gcAtual?.role === "sem_acesso") {
    return (
      <div className="max-w-2xl mx-auto w-full px-6 py-16 text-center">
        <h1 className="text-lg font-bold text-navy">Acesso restrito</h1>
        <p className="text-sm text-navy/60 mt-2">
          Essa área é exclusiva do time comercial. Fale com seu gestor se acha que isso é um engano.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 w-full">
      <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-navy">Pipeline</h1>
          <p className="text-sm text-navy/60">
            {oportunidadesFiltradas.length} de {oportunidades.length} oportunidades no funil
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex rounded-md border border-navy/15 overflow-hidden">
            <button
              onClick={() => setTipoPipeline("comercial")}
              className={`px-3 py-1.5 text-sm font-semibold ${tipoPipeline === "comercial" ? "bg-navy text-white" : "text-navy/60 hover:bg-navy/5"}`}
            >
              Comercial
            </button>
            <button
              onClick={() => setTipoPipeline("cs")}
              className={`px-3 py-1.5 text-sm font-semibold ${tipoPipeline === "cs" ? "bg-navy text-white" : "text-navy/60 hover:bg-navy/5"}`}
            >
              Customer Success
            </button>
          </div>
          <input
            className="input w-full sm:w-56"
            placeholder="Buscar por empresa ou projeto..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          {!souComercial && (
            <select className="input" value={gcFiltro} onChange={(e) => setGcFiltro(e.target.value)}>
              <option value="">Todos os GCs</option>
              {gcs.map((gc) => (
                <option key={gc.id} value={gc.id}>
                  {gc.nome}
                </option>
              ))}
            </select>
          )}
          <input
            className="input w-24"
            type="number"
            placeholder="Valor min"
            value={valorMin}
            onChange={(e) => setValorMin(e.target.value)}
          />
          <input
            className="input w-24"
            type="number"
            placeholder="Valor máx"
            value={valorMax}
            onChange={(e) => setValorMax(e.target.value)}
          />
          <button
            onClick={exportarCsvPipeline}
            className="px-3 py-2 rounded-md text-sm font-semibold text-navy/70 border border-navy/15 hover:bg-navy/5 whitespace-nowrap flex items-center gap-1.5"
          >
            <Download size={15} /> Exportar CSV
          </button>
        </div>
      </div>

      {loading ? (
        <p className="px-6 text-sm text-navy/50">Carregando...</p>
      ) : (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="flex gap-3 overflow-x-auto px-4 sm:px-6 pb-6 flex-1">
            {etapasDoTipo.map((etapa) => (
              <KanbanColumn
                key={etapa}
                etapa={etapa}
                probabilidade={probabilidadePorEtapa.get(etapa) ?? null}
                oportunidades={porEtapa.get(etapa) ?? []}
                empresasPorId={empresasPorId}
                ultimaMudancaPorOportunidade={ultimaMudancaPorOportunidade}
                onCardClick={abrirEdicao}
                onAddClick={() => abrirNova(etapa)}
              />
            ))}
          </div>
        </DndContext>
      )}

      {modalAberto && (
        <OportunidadeModal
          key={editando?.id ?? `novo-${etapaNova}`}
          oportunidade={editando}
          empresas={empresas}
          gcs={gcs}
          etapaInicial={etapaNova}
          onClose={() => setModalAberto(false)}
          onSaved={() => {
            setModalAberto(false);
            carregar();
          }}
          onDeleted={() => {
            setModalAberto(false);
            carregar();
          }}
        />
      )}
    </div>
  );
}
