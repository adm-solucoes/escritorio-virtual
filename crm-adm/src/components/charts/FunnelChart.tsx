"use client";

import { corDaRampa } from "./chart-colors";

export interface FunilEtapa {
  etapa: string;
  qtd: number;
  percentualDoTopo: number;
  percentualEtapaAnterior: number | null;
}

// Funil de conversão: barras centradas que estreitam etapa a etapa (largura
// proporcional ao % do topo), numa rampa azul ordenada. É a forma correta pra
// uma escala ordenada de etapas — não categorias distintas.
export function FunnelChart({ data }: { data: FunilEtapa[] }) {
  return (
    <div className="flex flex-col gap-2">
      {data.map((f, i) => (
        <div key={f.etapa}>
          <div className="flex justify-between items-baseline text-xs mb-1">
            <span className="font-semibold text-navy/70">{f.etapa}</span>
            <span className="text-navy/50 tabular-nums">
              {f.qtd} · {f.percentualDoTopo}%
              {f.percentualEtapaAnterior !== null && (
                <span className="text-navy/35"> · {f.percentualEtapaAnterior}% da anterior</span>
              )}
            </span>
          </div>
          <div className="h-5 rounded-md bg-navy/[0.04] overflow-hidden">
            <div
              className="h-full rounded-md transition-all"
              style={{ width: `${Math.max(f.percentualDoTopo, 2)}%`, background: corDaRampa(i, data.length) }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
