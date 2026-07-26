"use client";

import { useEffect, useMemo, useState } from "react";
import { DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { supabase } from "@/lib/supabase";
import { criarTarefaAutomaticaSeConfigurada } from "@/lib/automacoes";
import { ETAPAS_FUNIL, type Empresa, type EtapaFunil, type EtapaFunilConfig, type Gc, type Oportunidade } from "@/lib/types";
import KanbanColumn from "@/components/KanbanColumn";
import OportunidadeModal from "@/components/OportunidadeModal";

export default function PipelinePage() {
  const [oportunidades, setOportunidades] = useState<Oportunidade[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [gcs, setGcs] = useState<Gc[]>([]);
  const [etapas, setEtapas] = useState<EtapaFunilConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<Oportunidade | null>(null);
  const [etapaNova, setEtapaNova] = useState<EtapaFunil>("Prospect");
  const [refreshKey, setRefreshKey] = useState(0);
  const [busca, setBusca] = useState("");
  const [gcFiltro, setGcFiltro] = useState("");
  const [valorMin, setValorMin] = useState("");
  const [valorMax, setValorMax] = useState("");

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
    ]).then(([{ data: opsData }, { data: empData }, { data: etapasData }, { data: gcsData }]) => {
      if (cancelado) return;
      setOportunidades(opsData ?? []);
      setEmpresas(empData ?? []);
      setEtapas((etapasData as EtapaFunilConfig[]) ?? []);
      setGcs(gcsData ?? []);
      setLoading(false);
    });
    return () => {
      cancelado = true;
    };
  }, [refreshKey]);

  const empresasPorId = useMemo(() => new Map(empresas.map((e) => [e.id, e])), [empresas]);
  const probabilidadePorEtapa = useMemo(() => new Map(etapas.map((e) => [e.nome, e.probabilidade])), [etapas]);

  const oportunidadesFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const min = valorMin ? Number(valorMin) : null;
    const max = valorMax ? Number(valorMax) : null;

    return oportunidades.filter((o) => {
      if (termo) {
        const nomeEmpresa = empresasPorId.get(o.empresa_id)?.nome_empresa?.toLowerCase() ?? "";
        if (!nomeEmpresa.includes(termo) && !(o.projeto ?? "").toLowerCase().includes(termo)) return false;
      }
      if (gcFiltro && o.gc_responsavel_id !== gcFiltro) return false;
      if (min !== null && (o.valor_estimado ?? 0) < min) return false;
      if (max !== null && (o.valor_estimado ?? 0) > max) return false;
      return true;
    });
  }, [oportunidades, busca, gcFiltro, valorMin, valorMax, empresasPorId]);

  const porEtapa = useMemo(() => {
    const map = new Map<EtapaFunil, Oportunidade[]>();
    for (const etapa of ETAPAS_FUNIL) map.set(etapa, []);
    for (const o of oportunidadesFiltradas) {
      map.get(o.etapa_atual)?.push(o);
    }
    return map;
  }, [oportunidadesFiltradas]);

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

  function abrirNova(etapa: EtapaFunil) {
    setEditando(null);
    setEtapaNova(etapa);
    setModalAberto(true);
  }

  function abrirEdicao(o: Oportunidade) {
    setEditando(o);
    setModalAberto(true);
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
          <input
            className="input w-full sm:w-56"
            placeholder="Buscar por empresa ou projeto..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          <select className="input" value={gcFiltro} onChange={(e) => setGcFiltro(e.target.value)}>
            <option value="">Todos os GCs</option>
            {gcs.map((gc) => (
              <option key={gc.id} value={gc.id}>
                {gc.nome}
              </option>
            ))}
          </select>
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
        </div>
      </div>

      {loading ? (
        <p className="px-6 text-sm text-navy/50">Carregando...</p>
      ) : (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="flex gap-3 overflow-x-auto px-4 sm:px-6 pb-6 flex-1">
            {ETAPAS_FUNIL.map((etapa) => (
              <KanbanColumn
                key={etapa}
                etapa={etapa}
                probabilidade={probabilidadePorEtapa.get(etapa) ?? null}
                oportunidades={porEtapa.get(etapa) ?? []}
                empresasPorId={empresasPorId}
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
