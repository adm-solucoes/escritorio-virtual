"use client";

import { X } from "lucide-react";

/** Shell padrão de modal (overlay + painel + cabeçalho com fechar) — extraído
 * do markup que já se repetia em AtividadeModal/EmpresaModal/etc, pra novos
 * modais não reimplementarem isso do zero. Migração dos modais existentes é
 * incremental, não em bloco. */
export default function ModalShell({
  title,
  onClose,
  maxWidth = "max-w-lg",
  children,
}: {
  title: string;
  onClose: () => void;
  maxWidth?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-30 bg-navy/50 flex items-center justify-center p-4">
      <div className={`bg-white rounded-xl shadow-xl w-full ${maxWidth} max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-navy/15 sticky top-0 bg-white">
          <h2 className="font-extrabold text-lg text-navy">{title}</h2>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-navy/5 text-navy/60" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
