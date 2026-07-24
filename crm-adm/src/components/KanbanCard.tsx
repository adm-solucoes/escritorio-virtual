"use client";

import { useDraggable } from "@dnd-kit/core";
import { MessageCircle } from "lucide-react";
import type { Empresa, Oportunidade } from "@/lib/types";
import { linkWhatsapp } from "@/lib/whatsapp";

const TEMP_COLOR: Record<string, string> = {
  Frio: "border-l-blue-400",
  Morno: "border-l-amber-400",
  Quente: "border-l-red-400",
};

export default function KanbanCard({
  oportunidade,
  empresa,
  onClick,
}: {
  oportunidade: Oportunidade;
  empresa: Empresa | undefined;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: oportunidade.id,
  });

  const wa = linkWhatsapp(empresa?.telefone);
  const borderColor = empresa?.temperatura ? TEMP_COLOR[empresa.temperatura] : "border-l-black/10";

  // relative "days since" display, recomputing per render is intentional
  /* eslint-disable-next-line react-hooks/purity */
  const agora = Date.now();
  const diasSemInteracao = oportunidade.ultima_interacao
    ? Math.floor((agora - new Date(oportunidade.ultima_interacao).getTime()) / 86400000)
    : null;

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={onClick}
      style={
        transform
          ? { transform: `translate(${transform.x}px, ${transform.y}px)`, zIndex: 50 }
          : undefined
      }
      className={`bg-white rounded-lg border border-black/10 border-l-4 ${borderColor} p-3 shadow-sm hover:shadow-md transition-shadow cursor-grab active:cursor-grabbing ${
        isDragging ? "opacity-50" : ""
      }`}
    >
      <div className="font-medium text-sm">{empresa?.nome_empresa ?? "—"}</div>
      {oportunidade.projeto && <div className="text-xs text-black/50 mt-0.5">{oportunidade.projeto}</div>}

      <div className="flex items-center justify-between mt-2">
        <span className="text-sm font-semibold">
          {oportunidade.valor_estimado
            ? oportunidade.valor_estimado.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
            : "—"}
        </span>
        {wa && (
          <a
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            className="p-1 rounded-md hover:bg-green-50 text-green-600"
            title="Conversar no WhatsApp"
          >
            <MessageCircle size={14} />
          </a>
        )}
      </div>

      {diasSemInteracao !== null && diasSemInteracao >= 5 && (
        <div className="mt-1.5 text-[11px] font-medium text-amber-700 bg-amber-50 rounded px-1.5 py-0.5 inline-block">
          {diasSemInteracao}d sem interação
        </div>
      )}
    </div>
  );
}
