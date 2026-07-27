"use client";

import { KIBBLE_PER_SERVING } from "./dogMachine";

interface Props {
  /** Quantidade de ração restante (0 = vazia). */
  kibble: number;
  /** `true` durante a animação de ração caindo. */
  filling: boolean;
  /** Desabilita o clique (durante a intro e depois do login). */
  disabled: boolean;
  onFill: () => void;
}

/** Posições fixas dos grãos dentro da cumbuca, do fundo pro topo. */
const GRAOS: Array<{ cx: number; cy: number; r: number }> = [
  { cx: 60, cy: 45, r: 14 },
  { cx: 47, cy: 43, r: -22 },
  { cx: 73, cy: 43, r: 32 },
  { cx: 53, cy: 39, r: 8 },
  { cx: 68, cy: 39, r: -40 },
  { cx: 60, cy: 36, r: 20 },
];

/**
 * Cumbuca de ração clicável. Serve {@link KIBBLE_PER_SERVING} grãos por clique
 * e mostra quantos ainda restam — o mascote come um a cada mordida.
 */
export default function FoodBowl({ kibble, filling, disabled, onFill }: Props) {
  const cheia = kibble >= KIBBLE_PER_SERVING;

  return (
    <button
      type="button"
      className="dog-bowl"
      onClick={onFill}
      disabled={disabled}
      aria-label={
        cheia
          ? "Cumbuca cheia. Clique para servir mais ração ao mascote."
          : "Servir ração para o mascote"
      }
      title="Servir ração"
    >
      <svg className="dog-bowl-svg" viewBox="0 0 120 84" role="presentation" focusable="false">
        <ellipse cx="60" cy="76" rx="40" ry="6" fill="#150638" opacity="0.12" />

        {/* Corpo da cumbuca */}
        <path d="M19 42 q 41 17 82 0 l -9 26 q -32 12 -64 0 Z" fill="#c81e1e" />
        <path d="M23 52 q 37 13 74 0 l -2 6 q -35 12 -70 0 Z" fill="#fbf3e7" opacity="0.85" />
        <ellipse cx="60" cy="42" rx="41" ry="11" fill="#e6ded2" />
        <ellipse cx="60" cy="43" rx="34" ry="7.5" fill="#2a1508" opacity="0.28" />

        {/* Grãos dentro da cumbuca (desenhados por cima do fundo) */}
        {GRAOS.slice(0, Math.max(0, Math.min(kibble, GRAOS.length))).map((g, i) => (
          <ellipse
            key={`${g.cx}-${g.cy}`}
            cx={g.cx}
            cy={g.cy}
            rx="6"
            ry="4.6"
            fill={i % 2 === 0 ? "#7a4a1f" : "#8d5827"}
            transform={`rotate(${g.r} ${g.cx} ${g.cy})`}
          />
        ))}

        {/* Grãos caindo do alto quando a cumbuca é reabastecida */}
        {filling && (
          <g>
            <ellipse className="kibble-drop" cx="52" cy="40" rx="6" ry="4.6" fill="#7a4a1f" />
            <ellipse className="kibble-drop kibble-drop--2" cx="62" cy="38" rx="6" ry="4.6" fill="#8d5827" />
            <ellipse className="kibble-drop kibble-drop--3" cx="70" cy="41" rx="6" ry="4.6" fill="#6b3f19" />
          </g>
        )}
      </svg>
      <span className="dog-bowl-label" aria-hidden="true">
        {kibble > 0 ? `Ração: ${kibble}` : "Dar ração"}
      </span>
    </button>
  );
}
