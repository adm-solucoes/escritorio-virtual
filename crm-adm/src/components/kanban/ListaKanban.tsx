"use client";

import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Plus, MoreHorizontal, Archive, Pencil, X, Check } from "lucide-react";
import type { KanbanCartao, KanbanLista } from "@/lib/types";
import CartaoKanban from "./CartaoKanban";

export default function ListaKanban({
  lista,
  cartoes,
  onAbrirCartao,
  onCriarCartao,
  onRenomear,
  onArquivar,
}: {
  lista: KanbanLista;
  cartoes: KanbanCartao[];
  onAbrirCartao: (c: KanbanCartao) => void;
  onCriarCartao: (listaId: string, titulo: string) => Promise<void>;
  onRenomear: (listaId: string, nome: string) => Promise<void>;
  onArquivar: (listaId: string) => Promise<void>;
}) {
  // `data.tipo` distingue soltar em cima de uma LISTA (área vazia) de soltar
  // em cima de um CARTÃO — a página precisa dos dois casos pra calcular a
  // posição certa.
  const { setNodeRef, isOver } = useDroppable({ id: lista.id, data: { tipo: "lista" } });
  const [criando, setCriando] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [renomeando, setRenomeando] = useState(false);
  const [nomeNovo, setNomeNovo] = useState(lista.nome);
  const [menuAberto, setMenuAberto] = useState(false);

  async function confirmarCriacao() {
    const t = titulo.trim();
    if (!t) {
      setCriando(false);
      return;
    }
    await onCriarCartao(lista.id, t);
    setTitulo("");
    // Segue no modo de criação: quem está montando a lista costuma
    // adicionar vários cartões seguidos.
  }

  async function confirmarRenome() {
    const n = nomeNovo.trim();
    if (n && n !== lista.nome) await onRenomear(lista.id, n);
    setRenomeando(false);
  }

  return (
    <div
      ref={setNodeRef}
      className={`w-72 shrink-0 flex flex-col rounded-xl border transition-colors ${
        isOver ? "bg-blue/10 border-blue/30" : "bg-navy/[0.04] border-navy/5"
      }`}
    >
      <div className="px-3 py-2.5 flex items-center gap-1.5">
        {renomeando ? (
          <>
            <input
              autoFocus
              value={nomeNovo}
              onChange={(e) => setNomeNovo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmarRenome();
                if (e.key === "Escape") setRenomeando(false);
              }}
              className="flex-1 min-w-0 text-sm font-bold text-navy bg-white border border-navy/20 rounded px-1.5 py-0.5"
            />
            <button onClick={confirmarRenome} className="p-1 text-success" aria-label="Salvar nome">
              <Check size={15} />
            </button>
          </>
        ) : (
          <>
            <h3 className="text-sm font-bold text-navy truncate flex-1 min-w-0">{lista.nome}</h3>
            <span className="text-xs text-navy/40 font-semibold tabular-nums shrink-0">{cartoes.length}</span>
            <div className="relative shrink-0">
              <button
                onClick={() => setMenuAberto((v) => !v)}
                onBlur={() => setTimeout(() => setMenuAberto(false), 150)}
                className="p-1 rounded hover:bg-navy/10 text-navy/40"
                aria-label={`Opções da lista ${lista.nome}`}
              >
                <MoreHorizontal size={15} />
              </button>
              {menuAberto && (
                <div className="absolute right-0 top-full mt-1 z-20 w-44 bg-white rounded-lg shadow-lg border border-navy/15 overflow-hidden">
                  <button
                    onClick={() => {
                      setRenomeando(true);
                      setNomeNovo(lista.nome);
                      setMenuAberto(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-navy/70 hover:bg-navy/5"
                  >
                    <Pencil size={13} /> Renomear
                  </button>
                  <button
                    onClick={() => {
                      setMenuAberto(false);
                      if (confirm(`Arquivar a lista "${lista.nome}" e todos os cartões dela?`)) onArquivar(lista.id);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red hover:bg-red/5"
                  >
                    <Archive size={13} /> Arquivar lista
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <div className="flex flex-col gap-2 px-2 pb-2 min-h-16 flex-1">
        <SortableContext items={cartoes.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {cartoes.map((c) => (
            <CartaoKanban key={c.id} cartao={c} onClick={() => onAbrirCartao(c)} />
          ))}
        </SortableContext>

        {criando ? (
          <div className="flex flex-col gap-1.5">
            <textarea
              autoFocus
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  confirmarCriacao();
                }
                if (e.key === "Escape") {
                  setCriando(false);
                  setTitulo("");
                }
              }}
              placeholder="Título do cartão..."
              rows={2}
              className="text-sm border border-navy/20 rounded-lg px-2 py-1.5 resize-none bg-white"
            />
            <div className="flex items-center gap-1.5">
              <button
                onClick={confirmarCriacao}
                className="text-sm font-semibold bg-navy text-white px-3 py-1 rounded-md"
              >
                Adicionar
              </button>
              <button
                onClick={() => {
                  setCriando(false);
                  setTitulo("");
                }}
                className="p-1.5 text-navy/50 hover:text-navy"
                aria-label="Cancelar"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setCriando(true)}
            className="flex items-center gap-1.5 text-sm text-navy/50 hover:text-navy hover:bg-navy/5 rounded-md px-2 py-1.5 transition-colors"
          >
            <Plus size={15} /> Adicionar cartão
          </button>
        )}
      </div>
    </div>
  );
}
