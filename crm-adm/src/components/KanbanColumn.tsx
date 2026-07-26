"use client";

import { useEffect, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import type { Empresa, EtapaFunil, Oportunidade } from "@/lib/types";
import KanbanCard from "./KanbanCard";

export default function KanbanColumn({
  etapa,
  probabilidade,
  oportunidades,
  empresasPorId,
  onCardClick,
  onAddClick,
}: {
  etapa: EtapaFunil;
  probabilidade: number | null;
  oportunidades: Oportunidade[];
  empresasPorId: Map<string, Empresa>;
  onCardClick: (o: Oportunidade) => void;
  onAddClick: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: etapa });
  const chaveColapso = `pipeline-coluna-colapsada:${etapa}`;
  const [colapsada, setColapsada] = useState(false);

  useEffect(() => {
    Promise.resolve().then(() => setColapsada(localStorage.getItem(chaveColapso) === "1"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function alternarColapso() {
    setColapsada((v) => {
      const novo = !v;
      localStorage.setItem(chaveColapso, novo ? "1" : "0");
      return novo;
    });
  }

  const totalValor = oportunidades.reduce((acc, o) => acc + (o.valor_estimado ?? 0), 0);
  const totalPonderado = oportunidades.reduce((acc, o) => acc + (o.receita_ponderada ?? 0), 0);

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col shrink-0 bg-navy/[0.04] rounded-xl border border-navy/5 transition-colors ${
        colapsada ? "w-14" : "w-72"
      } ${isOver ? "bg-blue/10" : ""}`}
    >
      <div className="px-3 py-2.5 flex items-center justify-between gap-2">
        {colapsada ? (
          <button
            onClick={alternarColapso}
            className="flex flex-col items-center gap-1 w-full text-navy/60 hover:text-navy"
            title={`Expandir ${etapa}`}
          >
            <ChevronRight size={14} />
            <span className="text-[10px] font-bold">{oportunidades.length}</span>
          </button>
        ) : (
          <>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <button onClick={alternarColapso} className="text-navy/40 hover:text-navy shrink-0" title="Colapsar coluna">
                  <ChevronDown size={14} />
                </button>
                <h3 className="text-sm font-bold text-navy truncate">{etapa}</h3>
                {probabilidade !== null && (
                  <span className="shrink-0 text-[10px] font-bold text-blue bg-blue/10 rounded-full px-1.5 py-0.5">
                    {Math.round(probabilidade * 100)}%
                  </span>
                )}
              </div>
              <p className="text-xs text-navy/50">
                {oportunidades.length} oportunidade{oportunidades.length === 1 ? "" : "s"}
              </p>
              <p className="text-xs text-navy/70 font-semibold">
                {totalPonderado.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}{" "}
                <span className="font-normal text-navy/40">ponderado</span>
              </p>
              {totalValor > 0 && (
                <p className="text-[11px] text-navy/40">
                  de {totalValor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} em pipeline
                </p>
              )}
            </div>
            <button
              onClick={onAddClick}
              className="p-1 rounded-md hover:bg-navy/10 text-navy/50 shrink-0"
              title="Nova oportunidade nesta etapa"
            >
              <Plus size={16} />
            </button>
          </>
        )}
      </div>
      {!colapsada && (
        <div className="flex flex-col gap-2 p-2 pt-0 min-h-24 flex-1 rounded-b-xl">
          {oportunidades.map((o) => (
            <KanbanCard
              key={o.id}
              oportunidade={o}
              empresa={empresasPorId.get(o.empresa_id)}
              onClick={() => onCardClick(o)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
