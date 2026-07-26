"use client";

import { useDraggable } from "@dnd-kit/core";
import { useRouter } from "next/navigation";
import { MessageCircle } from "lucide-react";
import type { Empresa, Oportunidade } from "@/lib/types";
import { obterOuCriarConversaWhatsapp } from "@/lib/whatsapp";
import { probabilidadeAjustada } from "@/lib/relatorios";

const TEMP_COLOR: Record<string, string> = {
  Frio: "border-l-blue",
  Morno: "border-l-amber-400",
  Quente: "border-l-red",
};

export default function KanbanCard({
  oportunidade,
  empresa,
  dataMudancaEtapa,
  mediaDiasEtapa,
  onClick,
}: {
  oportunidade: Oportunidade;
  empresa: Empresa | undefined;
  dataMudancaEtapa?: string;
  mediaDiasEtapa?: number | null;
  onClick: () => void;
}) {
  const router = useRouter();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: oportunidade.id,
  });

  const borderColor = empresa?.temperatura ? TEMP_COLOR[empresa.temperatura] : "border-l-navy/10";

  // relative "days since" display, recomputing per render is intentional
  /* eslint-disable-next-line react-hooks/purity */
  const agora = Date.now();
  const diasSemInteracao = oportunidade.ultima_interacao
    ? Math.floor((agora - new Date(oportunidade.ultima_interacao).getTime()) / 86400000)
    : null;

  const diasNaEtapaAtual = Math.floor(
    (agora - new Date(dataMudancaEtapa ?? oportunidade.atualizado_em).getTime()) / 86400000
  );

  // Probabilidade só pra exibição — reduz visualmente quando a oportunidade está
  // parada bem além da média histórica da etapa. Não altera o valor gravado no banco.
  const probAjustada =
    oportunidade.probabilidade !== null && mediaDiasEtapa
      ? probabilidadeAjustada(oportunidade.probabilidade, diasNaEtapaAtual, mediaDiasEtapa)
      : null;
  const probAjustadaDiferente = probAjustada !== null && Math.round(probAjustada * 100) < Math.round((oportunidade.probabilidade ?? 0) * 100);

  async function abrirConversa(e: React.MouseEvent) {
    e.stopPropagation();
    if (!empresa) return;
    const resultado = await obterOuCriarConversaWhatsapp(empresa.id, empresa.telefone);
    if ("erro" in resultado) {
      alert(resultado.erro);
      return;
    }
    router.push(`/whatsapp?conversa=${resultado.id}`);
  }

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
      className={`bg-white rounded-lg border border-navy/10 border-l-4 ${borderColor} p-3 shadow-sm hover:shadow-md transition-shadow cursor-grab active:cursor-grabbing ${
        isDragging ? "opacity-50" : ""
      }`}
    >
      <div className="font-semibold text-sm text-navy">{empresa?.nome_empresa ?? "—"}</div>
      {oportunidade.projeto && <div className="text-xs text-navy/50 mt-0.5">{oportunidade.projeto}</div>}

      <div className="flex items-center justify-between mt-2">
        <div>
          <span className="text-sm font-bold text-navy">
            {oportunidade.valor_estimado
              ? oportunidade.valor_estimado.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
              : "—"}
          </span>
          {oportunidade.probabilidade !== null && (
            <span className="ml-1.5 text-[10px] font-bold text-blue bg-blue/10 rounded-full px-1.5 py-0.5">
              {Math.round(oportunidade.probabilidade * 100)}%
            </span>
          )}
          {probAjustadaDiferente && (
            <span
              className="ml-1 text-[10px] font-bold text-amber-700 bg-amber-100 rounded-full px-1.5 py-0.5"
              title="Probabilidade ajustada pra baixo: essa oportunidade está parada nesta etapa bem além da média histórica. Só um indicador visual, não muda o valor gravado."
            >
              ~{Math.round((probAjustada ?? 0) * 100)}%
            </span>
          )}
        </div>
        {empresa?.telefone && (
          <button
            onClick={abrirConversa}
            onPointerDown={(e) => e.stopPropagation()}
            className="p-1 rounded-md hover:bg-green-50 text-green-600"
            title="Conversar no WhatsApp (pelo CRM)"
          >
            <MessageCircle size={14} />
          </button>
        )}
      </div>

      {oportunidade.proxima_acao && (
        <div className="mt-1.5 text-[11px] text-navy/60 truncate">→ {oportunidade.proxima_acao}</div>
      )}

      {oportunidade.motivo_perda && (
        <div className="mt-1.5 text-[11px] font-medium text-red bg-red/10 rounded px-1.5 py-0.5 inline-block">
          Perdido: {oportunidade.motivo_perda}
        </div>
      )}

      <div className="flex flex-wrap gap-1 mt-1.5">
        <div className="text-[11px] font-medium text-navy/50 bg-navy/5 rounded px-1.5 py-0.5 inline-block">
          {diasNaEtapaAtual}d nesta etapa
        </div>
        {diasSemInteracao !== null && diasSemInteracao >= 5 && (
          <div className="text-[11px] font-medium text-amber-700 bg-amber-50 rounded px-1.5 py-0.5 inline-block">
            {diasSemInteracao}d sem interação
          </div>
        )}
      </div>
    </div>
  );
}
