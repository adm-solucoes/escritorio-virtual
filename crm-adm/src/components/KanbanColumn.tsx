"use client";

import { useDroppable } from "@dnd-kit/core";
import { Plus } from "lucide-react";
import type { Empresa, EtapaFunil, Oportunidade } from "@/lib/types";
import KanbanCard from "./KanbanCard";

export default function KanbanColumn({
  etapa,
  oportunidades,
  empresasPorId,
  onCardClick,
  onAddClick,
}: {
  etapa: EtapaFunil;
  oportunidades: Oportunidade[];
  empresasPorId: Map<string, Empresa>;
  onCardClick: (o: Oportunidade) => void;
  onAddClick: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: etapa });

  const total = oportunidades.reduce((acc, o) => acc + (o.valor_estimado ?? 0), 0);

  return (
    <div className="flex flex-col w-72 shrink-0 bg-neutral-100 rounded-xl">
      <div className="px-3 py-2.5 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">{etapa}</h3>
          <p className="text-xs text-black/50">
            {oportunidades.length} · {total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
          </p>
        </div>
        <button
          onClick={onAddClick}
          className="p-1 rounded-md hover:bg-black/10 text-black/50"
          title="Nova oportunidade nesta etapa"
        >
          <Plus size={16} />
        </button>
      </div>
      <div
        ref={setNodeRef}
        className={`flex flex-col gap-2 p-2 pt-0 min-h-24 flex-1 rounded-b-xl transition-colors ${
          isOver ? "bg-black/5" : ""
        }`}
      >
        {oportunidades.map((o) => (
          <KanbanCard
            key={o.id}
            oportunidade={o}
            empresa={empresasPorId.get(o.empresa_id)}
            onClick={() => onCardClick(o)}
          />
        ))}
      </div>
    </div>
  );
}
