"use client";

import type { CSSProperties, RefObject } from "react";
import type { DogState } from "./dogMachine";

interface Props {
  /** Estado visual atual (vira a classe `dog--<estado>`). */
  state: DogState;
  /** Posição horizontal já convertida em valor CSS (ex.: `var(--x-form)`). */
  x: string;
  /** 1 = olhando pra direita, -1 = espelhado. */
  facing: 1 | -1;
  /** Duração da transição de posição, em ms. */
  moveMs: number;
  /** Container externo — recebe as vars `--eye-x` / `--eye-y` do rastreio. */
  containerRef?: RefObject<HTMLDivElement | null>;
}

/* Paleta da pelagem: trigo/caramelo típico do Rhodesian Ridgeback. */
const PELO = "#cf9052";
const PELO_ESCURO = "#b1702f";
const PELO_CLARO = "#e8c79a";
const MASCARA = "#6d462a";
const FOCINHO = "#241209";

/**
 * Mascote: Rhodesian Ridgeback desenhado em SVG puro.
 *
 * O corpo fica de perfil (virado pra direita) e a cabeça de frente, o que
 * permite que as pupilas acompanhem o cursor. Todas as poses são classes CSS
 * em `mascot.css` — este componente só monta a estrutura e o estado.
 */
export default function DogMascot({ state, x, facing, moveMs, containerRef }: Props) {
  const style = {
    "--x": x,
    "--move-ms": `${moveMs}ms`,
    "--facing": String(facing),
  } as CSSProperties;

  return (
    <div
      ref={containerRef}
      className={`dog dog--${state}`}
      style={style}
      aria-hidden="true"
    >
      <div className="dog-flip">
        <svg className="dog-svg" viewBox="0 0 240 200" role="presentation" focusable="false">
          {/* Sombra no chão */}
          <ellipse cx="118" cy="186" rx="66" ry="8" fill="#150638" opacity="0.13" />

          <g className="dog-root">
            {/* Rabo */}
            <g className="dog-tail">
              <path
                d="M62 122 C 36 116 24 94 30 70"
                stroke={PELO_ESCURO}
                strokeWidth="11"
                strokeLinecap="round"
                fill="none"
              />
              <path
                d="M30 72 C 26 62 30 54 36 50"
                stroke={PELO_CLARO}
                strokeWidth="8.5"
                strokeLinecap="round"
                fill="none"
              />
            </g>

            {/* Patas do lado oposto (mais escuras, atrás do corpo) */}
            <g className="dog-leg dog-leg--b">
              <rect x="62" y="120" width="16" height="52" rx="8" fill={PELO_ESCURO} />
              <ellipse cx="70" cy="174" rx="10.5" ry="6" fill={PELO_ESCURO} />
            </g>
            <g className="dog-leg dog-leg--d">
              <rect x="124" y="122" width="16" height="50" rx="8" fill={PELO_ESCURO} />
              <ellipse cx="132" cy="174" rx="10.5" ry="6" fill={PELO_ESCURO} />
            </g>

            {/* Tronco (respira) */}
            <g className="dog-body">
              <ellipse cx="106" cy="126" rx="56" ry="34" fill={PELO} />
              <ellipse cx="112" cy="142" rx="44" ry="17" fill={PELO_CLARO} opacity="0.7" />
              {/* Crista invertida no dorso — marca registrada da raça */}
              <path
                d="M70 102 C 90 88 126 86 150 96"
                stroke={PELO_ESCURO}
                strokeWidth="7"
                strokeLinecap="round"
                fill="none"
              />
              <path
                d="M84 95 l5 -8 M102 90 l4 -9 M120 89 l6 -8 M136 91 l6 -7"
                stroke={PELO_ESCURO}
                strokeWidth="3.5"
                strokeLinecap="round"
                fill="none"
              />
            </g>

            {/* Patas da frente do lado do observador */}
            <g className="dog-leg dog-leg--a">
              <rect x="76" y="124" width="18" height="50" rx="9" fill={PELO} />
              <ellipse cx="85" cy="176" rx="11.5" ry="6.5" fill={PELO_CLARO} />
            </g>
            <g className="dog-leg dog-leg--c">
              <rect x="136" y="126" width="18" height="48" rx="9" fill={PELO} />
              <ellipse cx="145" cy="176" rx="11.5" ry="6.5" fill={PELO_CLARO} />
            </g>

            {/* Pescoço + coleira com pingente */}
            <rect x="146" y="94" width="48" height="46" rx="19" fill={PELO} />
            <rect x="141" y="106" width="58" height="13" rx="6.5" fill="#171717" />
            <circle cx="170" cy="125" r="6.5" fill="#c81e1e" />
            <circle cx="170" cy="125" r="2.4" fill="#fbf3e7" opacity="0.85" />

            {/* Cabeça */}
            <g className="dog-head">
              <g className="dog-head-inner">
                {/* Orelhas caídas */}
                <path
                  className="dog-ear"
                  d="M141 40 C 116 40 108 68 115 92 C 120 110 141 108 145 92 C 150 72 151 52 141 40 Z"
                  fill={PELO_ESCURO}
                />
                <path
                  className="dog-ear"
                  d="M199 40 C 224 40 232 68 225 92 C 220 110 199 108 195 92 C 190 72 189 52 199 40 Z"
                  fill={PELO_ESCURO}
                />

                {/* Crânio */}
                <ellipse cx="170" cy="64" rx="37" ry="34" fill={PELO} />
                <ellipse cx="170" cy="72" rx="30" ry="26" fill="#dda469" opacity="0.5" />

                {/* Sobrancelhas expressivas */}
                <path
                  className="dog-brow dog-brow--l"
                  d="M143 41 q 11 -7 22 -2"
                  stroke="#8f5a28"
                  strokeWidth="5"
                  strokeLinecap="round"
                  fill="none"
                />
                <path
                  className="dog-brow dog-brow--r"
                  d="M175 39 q 11 -5 22 2"
                  stroke="#8f5a28"
                  strokeWidth="5"
                  strokeLinecap="round"
                  fill="none"
                />

                {/* Olhos abertos (pupilas seguem o cursor) */}
                <g className="dog-eyes-open">
                  <ellipse cx="153" cy="60" rx="10.5" ry="11.5" fill="#ffffff" />
                  <ellipse cx="187" cy="59" rx="10.5" ry="11.5" fill="#ffffff" />
                  <g className="dog-pupil">
                    <circle cx="153" cy="61" r="5.8" fill={FOCINHO} />
                    <circle cx="155.4" cy="58.4" r="2.1" fill="#ffffff" opacity="0.9" />
                    <circle cx="187" cy="60" r="5.8" fill={FOCINHO} />
                    <circle cx="189.4" cy="57.4" r="2.1" fill="#ffffff" opacity="0.9" />
                  </g>
                  {/* Pálpebras: piscadas periódicas */}
                  <ellipse className="dog-eyelid" cx="153" cy="60" rx="11.5" ry="13" fill={PELO} />
                  <ellipse className="dog-eyelid" cx="187" cy="59" rx="11.5" ry="13" fill={PELO} />
                </g>

                {/* Olhos felizes (arcos) */}
                <g className="dog-eyes-happy">
                  <path
                    d="M143 63 q 10 -14 21 -1"
                    stroke={FOCINHO}
                    strokeWidth="4.5"
                    strokeLinecap="round"
                    fill="none"
                  />
                  <path
                    d="M177 62 q 10 -14 21 -1"
                    stroke={FOCINHO}
                    strokeWidth="4.5"
                    strokeLinecap="round"
                    fill="none"
                  />
                </g>

                {/* Focinho escuro */}
                <ellipse cx="170" cy="85" rx="27" ry="19" fill={MASCARA} />
                <ellipse cx="170" cy="89" rx="21" ry="13" fill="#89613d" />
                <ellipse cx="170" cy="76" rx="10" ry="7.5" fill={FOCINHO} />
                <ellipse cx="166.5" cy="76" rx="1.7" ry="2.5" fill="#4a2b18" />
                <ellipse cx="173.5" cy="76" rx="1.7" ry="2.5" fill="#4a2b18" />

                {/* Boca fechada */}
                <g className="dog-mouth-closed">
                  <path
                    d="M170 84 v5"
                    stroke={FOCINHO}
                    strokeWidth="2.6"
                    strokeLinecap="round"
                    fill="none"
                  />
                  <path
                    d="M170 89 q -8 8 -15 1"
                    stroke={FOCINHO}
                    strokeWidth="2.6"
                    strokeLinecap="round"
                    fill="none"
                  />
                  <path
                    d="M170 89 q 8 8 15 1"
                    stroke={FOCINHO}
                    strokeWidth="2.6"
                    strokeLinecap="round"
                    fill="none"
                  />
                </g>

                {/* Boca aberta (latido / feliz / comendo) */}
                <g className="dog-mouth-open">
                  <path
                    d="M155 87 q 15 -5 30 0 q -3 22 -15 22 q -12 0 -15 -22 Z"
                    fill="#3a1410"
                  />
                  <path d="M160 88 l4 6 l4 -6 Z" fill="#ffffff" />
                  <path d="M176 88 l4 6 l4 -6 Z" fill="#ffffff" />
                  <ellipse cx="170" cy="104" rx="8" ry="6" fill="#e0716f" />
                </g>

                {/* Gota de nervosismo (senha errada) */}
                <g className="dog-sweat">
                  <path d="M208 30 q 6 9 0 12 q -6 -3 0 -12 Z" fill="#8fc6f0" />
                </g>

                {/* Patas cobrindo os olhos (campo de senha em foco) */}
                <g className="dog-cover-paws">
                  <path
                    d="M138 72 C 126 100 130 132 148 142"
                    stroke={PELO}
                    strokeWidth="15"
                    strokeLinecap="round"
                    fill="none"
                  />
                  <path
                    d="M202 72 C 214 100 210 132 192 142"
                    stroke={PELO}
                    strokeWidth="15"
                    strokeLinecap="round"
                    fill="none"
                  />
                  <ellipse cx="152" cy="60" rx="20" ry="15" fill={PELO} />
                  <ellipse cx="188" cy="60" rx="20" ry="15" fill={PELO} />
                  <ellipse cx="152" cy="66" rx="12" ry="7.5" fill={PELO_CLARO} />
                  <ellipse cx="188" cy="66" rx="12" ry="7.5" fill={PELO_CLARO} />
                  <ellipse cx="144" cy="53" rx="4" ry="3.2" fill={PELO_CLARO} />
                  <ellipse cx="152" cy="50" rx="4" ry="3.2" fill={PELO_CLARO} />
                  <ellipse cx="160" cy="53" rx="4" ry="3.2" fill={PELO_CLARO} />
                  <ellipse cx="180" cy="53" rx="4" ry="3.2" fill={PELO_CLARO} />
                  <ellipse cx="188" cy="50" rx="4" ry="3.2" fill={PELO_CLARO} />
                  <ellipse cx="196" cy="53" rx="4" ry="3.2" fill={PELO_CLARO} />
                </g>
              </g>
            </g>
          </g>
        </svg>
      </div>
    </div>
  );
}
