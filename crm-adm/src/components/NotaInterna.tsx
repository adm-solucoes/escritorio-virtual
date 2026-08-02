"use client";

import { StickyNote, X } from "lucide-react";

/** Bolha de "nota interna" na timeline de mensagens (WhatsApp/Instagram) —
 * visível só no CRM, nunca enviada ao cliente. Extraído porque as duas
 * páginas tinham o mesmo bloco copiado com paleta âmbar solta. */
export function NotaInternaBubble({
  autor,
  conteudo,
  criadoEm,
}: {
  autor?: string | null;
  conteudo: string;
  criadoEm: string;
}) {
  return (
    <div className="flex justify-center">
      <div className="max-w-[80%] rounded-lg px-3 py-2 text-sm bg-warning-bg border border-warning/25 text-warning">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold mb-0.5">
          <StickyNote size={12} /> Nota interna {autor ? `· ${autor}` : ""}
        </div>
        <div className="whitespace-pre-wrap break-words text-navy">{conteudo}</div>
        <div className="text-[10px] mt-1">
          {new Date(criadoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>
    </div>
  );
}

/** Item de menu que abre o modal de nota interna. */
export function NotaInternaMenuItem({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-warning hover:bg-warning-bg"
    >
      <StickyNote size={14} /> Nota interna
    </button>
  );
}

/** Modal de composição da nota interna. */
export function NotaInternaModal({
  texto,
  onTextoChange,
  onCancelar,
  onSalvar,
}: {
  texto: string;
  onTextoChange: (v: string) => void;
  onCancelar: () => void;
  onSalvar: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-navy/40 flex items-center justify-center p-4" onClick={onCancelar}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-navy flex items-center gap-2">
            <StickyNote size={16} className="text-warning" /> Nota interna
          </h2>
          <button onClick={onCancelar} className="text-navy/40 hover:text-navy p-1" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        <p className="text-xs text-navy/50 mb-3">
          Visível só aqui no CRM, para o time. O cliente nunca recebe isso no WhatsApp/Instagram.
        </p>
        <textarea
          className="input w-full min-h-[100px] resize-none"
          placeholder="Ex: cliente pediu desconto, confirmar com o financeiro..."
          value={texto}
          onChange={(e) => onTextoChange(e.target.value)}
          autoFocus
        />
        <div className="flex justify-end gap-2 mt-3">
          <button onClick={onCancelar} className="btn-secondary">
            Cancelar
          </button>
          <button onClick={onSalvar} disabled={!texto.trim()} className="btn-primary">
            Salvar nota
          </button>
        </div>
      </div>
    </div>
  );
}
