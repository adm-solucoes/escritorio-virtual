"use client";

import type { TipoNoAutomacao } from "@/lib/types";
import { DEFINICOES_NOS, type CategoriaNo } from "@/lib/automacoes-nos";

const TITULO_CATEGORIA: Record<CategoriaNo, string> = {
  gatilho: "Gatilhos",
  condicao: "Condição",
  acao: "Ações",
  espera: "Espera",
};

export default function PaletaNos({ onAdicionar }: { onAdicionar: (tipo: TipoNoAutomacao) => void }) {
  const categorias: CategoriaNo[] = ["gatilho", "condicao", "acao", "espera"];

  return (
    <div className="w-64 shrink-0 border-r border-navy/10 bg-white overflow-y-auto">
      <div className="px-4 py-3 border-b border-navy/10">
        <h2 className="font-bold text-sm text-navy">Nós disponíveis</h2>
        <p className="text-xs text-navy/50">Clique pra adicionar ao canvas</p>
      </div>
      {categorias.map((categoria) => (
        <div key={categoria} className="px-3 py-2 border-b border-navy/5">
          <p className="text-[11px] font-bold text-navy/40 uppercase tracking-wide px-1 mb-1">{TITULO_CATEGORIA[categoria]}</p>
          {DEFINICOES_NOS.filter((d) => d.categoria === categoria).map((definicao) => (
            <button
              key={definicao.tipo}
              onClick={() => onAdicionar(definicao.tipo)}
              className="w-full text-left px-2 py-2 rounded-md hover:bg-navy/[0.04] transition-colors"
            >
              <div className="text-xs font-semibold text-navy">{definicao.label}</div>
              <div className="text-[11px] text-navy/50">{definicao.descricao}</div>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
