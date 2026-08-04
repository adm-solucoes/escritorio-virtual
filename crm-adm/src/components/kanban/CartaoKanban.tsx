"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CheckSquare, MessageSquare, CalendarClock, AlignLeft, Paperclip } from "lucide-react";
import Avatar from "@/components/Avatar";
import { classeEtiqueta, type KanbanCartao } from "@/lib/types";

function rotuloPrazo(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

export default function CartaoKanban({
  cartao,
  onClick,
}: {
  cartao: KanbanCartao;
  onClick: () => void;
}) {
  // useSortable (e não useDraggable): é ele que permite reordenar DENTRO da
  // própria lista, não só jogar de uma coluna pra outra. O `data` viaja junto
  // no evento de arrastar e é o que deixa a página saber de qual lista o
  // cartão saiu sem precisar procurar no estado.
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: cartao.id,
    data: { tipo: "cartao", listaId: cartao.lista_id },
  });

  const atrasado = cartao.prazo && !cartao.prazo_concluido && new Date(cartao.prazo) < new Date();
  const temChecklist = (cartao.totalItens ?? 0) > 0;
  const checklistCompleto = temChecklist && cartao.itensConcluidos === cartao.totalItens;

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={onClick}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 50 : undefined,
      }}
      className={`bg-white rounded-lg border border-navy/15 p-2.5 flex flex-col gap-1.5 cursor-grab active:cursor-grabbing hover:border-navy/35 transition-colors ${
        isDragging ? "opacity-50 shadow-lg" : ""
      }`}
    >
      {(cartao.etiquetas?.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-1">
          {cartao.etiquetas!.map((e) => (
            <span
              key={e.id}
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${classeEtiqueta(e.cor)}`}
            >
              {e.nome}
            </span>
          ))}
        </div>
      )}

      <p className="text-sm text-navy font-medium leading-snug">{cartao.titulo}</p>

      <div className="flex items-center gap-2 flex-wrap">
        {cartao.prazo && (
          <span
            className={`text-[11px] font-semibold px-1.5 py-0.5 rounded flex items-center gap-1 ${
              cartao.prazo_concluido
                ? "bg-success-bg text-success"
                : atrasado
                  ? "bg-danger-bg text-danger"
                  : "bg-navy/8 text-navy/70"
            }`}
            title={atrasado ? "Prazo vencido" : undefined}
          >
            <CalendarClock size={11} />
            {rotuloPrazo(cartao.prazo)}
          </span>
        )}

        {cartao.descricao && <AlignLeft size={13} className="text-navy/35" aria-label="Tem descrição" />}

        {temChecklist && (
          <span
            className={`text-[11px] font-semibold flex items-center gap-1 ${
              checklistCompleto ? "text-success" : "text-navy/50"
            }`}
          >
            <CheckSquare size={12} />
            {cartao.itensConcluidos}/{cartao.totalItens}
          </span>
        )}

        {(cartao.totalComentarios ?? 0) > 0 && (
          <span className="text-[11px] font-semibold text-navy/50 flex items-center gap-1">
            <MessageSquare size={12} />
            {cartao.totalComentarios}
          </span>
        )}

        {(cartao.totalAnexos ?? 0) > 0 && (
          <span className="text-[11px] font-semibold text-navy/50 flex items-center gap-1">
            <Paperclip size={12} />
            {cartao.totalAnexos}
          </span>
        )}

        {(cartao.membros?.length ?? 0) > 0 && (
          <div className="flex -space-x-1.5 ml-auto">
            {cartao.membros!.slice(0, 3).map((m) => (
              <Avatar key={m.id} nome={m.nome} fotoUrl={m.foto_url} tamanho="sm" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
