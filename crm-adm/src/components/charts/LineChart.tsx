"use client";

import { useRef, useState } from "react";
import { TINTA } from "./chart-colors";

export interface LineSeries {
  name: string;
  color: string;
  valores: number[];
}

function niceCeil(v: number): number {
  if (v <= 0) return 1;
  const exp = Math.floor(Math.log10(v));
  const base = Math.pow(10, exp);
  const f = v / base;
  const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nf * base;
}

// Gráfico de linhas em SVG com grade, eixo Y, marcadores, legenda e tooltip
// com crosshair no hover. Escala 100% na largura do cartão; o mapeamento do
// mouse -> índice é feito pela largura do container (independe do scaling).
export function LineChart({
  series,
  categorias,
  formatValue,
  formatTick,
  altura = 240,
}: {
  series: LineSeries[];
  categorias: string[];
  formatValue?: (n: number) => string;
  formatTick?: (n: number) => string;
  altura?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const n = categorias.length;
  const fmt = formatValue ?? ((v: number) => v.toLocaleString("pt-BR"));
  const tick = formatTick ?? ((v: number) => v.toLocaleString("pt-BR"));

  const maxVal = Math.max(1, ...series.flatMap((s) => s.valores));
  const topo = niceCeil(maxVal);

  const W = 640;
  const H = altura;
  const padL = 60;
  const padR = 18;
  const padT = 16;
  const padB = 30;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const x = (i: number) => (n <= 1 ? padL + plotW / 2 : padL + (i / (n - 1)) * plotW);
  const y = (v: number) => padT + plotH - (v / topo) * plotH;

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * topo);

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect || n === 0) return;
    const frac = (e.clientX - rect.left) / rect.width;
    const vbX = frac * W;
    const t = (vbX - padL) / plotW;
    const i = Math.max(0, Math.min(n - 1, Math.round(t * (n - 1))));
    setHover(i);
  }

  const leftPct = hover != null ? Math.max(6, Math.min(94, (x(hover) / W) * 100)) : 0;

  return (
    <div className="w-full">
      <div
        ref={ref}
        className="relative w-full"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
          {/* grade + ticks do eixo Y */}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} y1={y(t)} x2={W - padR} y2={y(t)} stroke={TINTA.grade} strokeWidth={1} />
              <text x={padL - 8} y={y(t) + 3} textAnchor="end" fontSize={10} fill={TINTA.muted}>
                {tick(t)}
              </text>
            </g>
          ))}

          {/* labels do eixo X */}
          {categorias.map((cat, i) => (
            <text key={cat + i} x={x(i)} y={H - 10} textAnchor="middle" fontSize={10} fill={TINTA.muted}>
              {cat}
            </text>
          ))}

          {/* crosshair */}
          {hover != null && (
            <line x1={x(hover)} y1={padT} x2={x(hover)} y2={padT + plotH} stroke={TINTA.eixo} strokeWidth={1} strokeDasharray="3 3" />
          )}

          {/* linhas + marcadores */}
          {series.map((s) => {
            const d = s.valores
              .map((v, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`)
              .join(" ");
            return (
              <g key={s.name}>
                {n > 1 && <path d={d} fill="none" stroke={s.color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />}
                {s.valores.map((v, i) => (
                  <circle
                    key={i}
                    cx={x(i)}
                    cy={y(v)}
                    r={hover === i ? 5 : 3.5}
                    fill="#fff"
                    stroke={s.color}
                    strokeWidth={hover === i ? 3 : 2}
                  />
                ))}
              </g>
            );
          })}
        </svg>

        {/* tooltip */}
        {hover != null && (
          <div
            className="absolute -translate-x-1/2 pointer-events-none z-10"
            style={{ left: `${leftPct}%`, top: 4 }}
          >
            <div className="rounded-lg bg-navy text-cream shadow-lg px-3 py-2 text-xs min-w-max">
              <p className="font-bold mb-1">{categorias[hover]}</p>
              {series.map((s) => (
                <p key={s.name} className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                  <span className="text-cream/70">{s.name}:</span>
                  <span className="font-semibold tabular-nums">{fmt(s.valores[hover] ?? 0)}</span>
                </p>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* legenda */}
      {series.length > 1 && (
        <div className="flex items-center gap-4 mt-2 pl-14">
          {series.map((s) => (
            <span key={s.name} className="flex items-center gap-1.5 text-xs text-navy/60">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
