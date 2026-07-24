"use client";

import { useEffect, useMemo, useState } from "react";
import { DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { supabase } from "@/lib/supabase";
import { ETAPAS_FUNIL, type Empresa, type EtapaFunil, type Oportunidade } from "@/lib/types";
import KanbanColumn from "@/components/KanbanColumn";
import OportunidadeModal from "@/components/OportunidadeModal";

export default function PipelinePage() {
  const [oportunidades, setOportunidades] = useState<Oportunidade[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<Oportunidade | null>(null);
  const [etapaNova, setEtapaNova] = useState<EtapaFunil>("Prospect");
  const [refreshKey, setRefreshKey] = useState(0);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function carregar() {
    setRefreshKey((k) => k + 1);
  }

  useEffect(() => {
    let cancelado = false;
    Promise.all([
      supabase.from("oportunidades").select("*").order("criado_em", { ascending: false }),
      supabase.from("empresas").select("*").order("nome_empresa"),
    ]).then(([{ data: opsData }, { data: empData }]) => {
      if (cancelado) return;
      setOportunidades(opsData ?? []);
      setEmpresas(empData ?? []);
      setLoading(false);
    });
    return () => {
      cancelado = true;
    };
  }, [refreshKey]);

  const empresasPorId = useMemo(() => new Map(empresas.map((e) => [e.id, e])), [empresas]);

  const porEtapa = useMemo(() => {
    const map = new Map<EtapaFunil, Oportunidade[]>();
    for (const etapa of ETAPAS_FUNIL) map.set(etapa, []);
    for (const o of oportunidades) {
      map.get(o.etapa_atual)?.push(o);
    }
    return map;
  }, [oportunidades]);

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const novaEtapa = over.id as EtapaFunil;
    const oportunidade = oportunidades.find((o) => o.id === active.id);
    if (!oportunidade || oportunidade.etapa_atual === novaEtapa) return;

    setOportunidades((prev) =>
      prev.map((o) => (o.id === oportunidade.id ? { ...o, etapa_atual: novaEtapa } : o))
    );

    const { error } = await supabase
      .from("oportunidades")
      .update({ etapa_atual: novaEtapa })
      .eq("id", oportunidade.id);

    if (error) {
      alert("Erro ao mover oportunidade: " + error.message);
      carregar();
    }
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
      <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-navy">Pipeline</h1>
          <p className="text-sm text-navy/60">{oportunidades.length} oportunidades no funil</p>
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
