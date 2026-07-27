"use client";

import Image from "next/image";
import type { CSSProperties, RefObject } from "react";
import type { DogState } from "./dogMachine";
import cachorroFoto from "../../../public/mascote/cachorro.jpg";

interface Props {
  /** Estado visual atual (vira a classe `dog--<estado>`). */
  state: DogState;
  /** Posição horizontal já convertida em valor CSS (ex.: `var(--x-form)`). */
  x: string;
  /** 1 = normal, -1 = espelhado (efeito quase imperceptível numa foto de frente). */
  facing: 1 | -1;
  /** Duração da transição de posição, em ms. */
  moveMs: number;
  /** Container externo — recebe as vars `--gaze-x` / `--gaze-y` do rastreio do cursor. */
  containerRef?: RefObject<HTMLDivElement | null>;
}

/**
 * Mascote: foto real da pelúcia (Rhodesian Ridgeback) animada só com CSS
 * transform/opacity — nada de vetor desenhado à mão. Cada estado aplica uma
 * combinação de: inclinação/tremor no `dog-photo-wrap`, patas de pelúcia
 * sobrepostas na hora de cobrir os olhos, e uma sombra elíptica no chão.
 */
export default function DogMascot({ state, x, facing, moveMs, containerRef }: Props) {
  const style = {
    "--x": x,
    "--move-ms": `${moveMs}ms`,
    "--facing": String(facing),
  } as CSSProperties;

  return (
    <div ref={containerRef} className={`dog dog--${state}`} style={style} aria-hidden="true">
      <div className="dog-flip">
        <div className="dog-shadow" />
        <div className="dog-photo-wrap">
          <Image
            src={cachorroFoto}
            alt=""
            className="dog-photo"
            priority
            sizes="200px"
          />
          <div className="dog-paw-cover dog-paw-cover--l" />
          <div className="dog-paw-cover dog-paw-cover--r" />
        </div>
      </div>
    </div>
  );
}
