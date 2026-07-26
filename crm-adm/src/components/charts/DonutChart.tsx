"use client";

import { useState } from "react";
import { TINTA } from "./chart-colors";

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

// Donut em SVG (técnica de stroke-dasharray): cada fatia é um círculo com o
// traço do tamanho proporcional ao valor. Legenda à direita, total no centro,
// e ao passar o mouse a fatia destaca e o centro mostra o valor dela.
export function DonutChart({
  data,
  formatValue,
  centerTitle = "Total",
}: {
  data: DonutSlice[];
  formatValue?: (n: number) => string;
  centerTitle?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const fmt = formatValue ?? ((n: number) => n.toLocaleString("pt-BR"));

  const fatias = data.filter((d) => d.value > 0);
  const total = fatias.reduce((acc, d) => acc + d.value, 0);

  const size = 168;
  const stroke = 24;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const gap = fatias.length > 1 ? 3 : 0; // px de respiro entre fatias

  const comprimentos = fatias.map((d) => (d.value / total) * c);
  const arcos = fatias.map((d, i) => {
    const len = comprimentos[i];
    const acumuladoAntes = comprimentos.slice(0, i).reduce((acc, v) => acc + v, 0);
    return {
      ...d,
      i,
      dash: `${Math.max(len - gap, 0.1)} ${c - Math.max(len - gap, 0.1)}`,
      offset: -acumuladoAntes,
    };
  });

  const destaque = hover != null ? fatias[hover] : null;

  return (
    <div className="flex flex-col sm:flex-row items-center gap-4">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {total === 0 ? (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={TINTA.grade}
              strokeWidth={stroke}
            />
          ) : (
            <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
              {arcos.map((a) => (
                <circle
                  key={a.label}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  fill="none"
                  stroke={a.color}
                  strokeWidth={hover === a.i ? stroke + 5 : stroke}
                  strokeDasharray={a.dash}
                  strokeDashoffset={a.offset}
                  opacity={hover == null || hover === a.i ? 1 : 0.45}
                  onMouseEnter={() => setHover(a.i)}
                  onMouseLeave={() => setHover(null)}
                  style={{ transition: "stroke-width 0.12s ease, opacity 0.12s ease", cursor: "pointer" }}
                />
              ))}
            </g>
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-6">
          {destaque ? (
            <>
              <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: destaque.color }}>
                {destaque.label}
              </span>
              <span className="text-lg font-extrabold text-navy leading-tight">{fmt(destaque.value)}</span>
              <span className="text-[11px] text-navy/45">{total ? Math.round((destaque.value / total) * 100) : 0}%</span>
            </>
          ) : (
            <>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-navy/40">{centerTitle}</span>
              <span className="text-xl font-extrabold text-navy leading-tight">{fmt(total)}</span>
            </>
          )}
        </div>
      </div>

      <ul className="flex flex-col gap-1.5 w-full min-w-0">
        {data.map((d) => {
          const idx = fatias.findIndex((f) => f.label === d.label);
          const pct = total ? Math.round((d.value / total) * 100) : 0;
          return (
            <li
              key={d.label}
              className="flex items-center justify-between gap-2 text-sm rounded-md px-1.5 py-0.5 cursor-default"
              style={{ background: hover === idx && idx >= 0 ? "rgba(21,6,56,0.04)" : "transparent" }}
              onMouseEnter={() => idx >= 0 && setHover(idx)}
              onMouseLeave={() => setHover(null)}
            >
              <span className="flex items-center gap-2 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                <span className="text-navy/70 truncate">{d.label}</span>
              </span>
              <span className="text-navy/50 tabular-nums shrink-0">
                {fmt(d.value)} <span className="text-navy/35">· {pct}%</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
