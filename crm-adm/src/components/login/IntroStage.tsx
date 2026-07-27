"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import type { IntroPhase } from "./dogMachine";

interface Props {
  phase: IntroPhase;
  /** Mesma âncora horizontal do cachorro — mantém os dois em sincronia. */
  x: string;
  /** Duração da transição de posição vinda da máquina, em ms. */
  moveMs: number;
  /** Login concluído: o formulário some de vez. */
  finished: boolean;
  onSkip: () => void;
  children: ReactNode;
}

/**
 * Invólucro do formulário durante a animação de introdução.
 *
 * Enquanto `phase === "video"`, o vídeo de referência assume a cena por
 * completo (cachorro entra, fareja, sai e volta trazendo o formulário) e o
 * slot do formulário fica oculto. Quando o vídeo termina — ou o usuário pula —
 * a fase vira `done` e o formulário aparece já assentado no lugar final,
 * junto com o mascote em CSS para as interações do dia a dia.
 */
export default function IntroStage({ phase, x, moveMs, finished, onSkip, children }: Props) {
  const introAtiva = phase !== "done" && !finished;

  const modificador = finished
    ? "dog-form-slot--gone"
    : phase === "video"
      ? "dog-form-slot--hidden"
      : "dog-form-slot--settled";

  const style = {
    "--x": x,
    "--move-ms": `${moveMs}ms`,
  } as CSSProperties;

  // Assim que a intro acaba (ou é pulada), devolvemos o foco pro formulário —
  // ele passou a maior parte da animação como `inert`, então o `autoFocus` do
  // primeiro campo não teria efeito.
  const slotRef = useRef<HTMLDivElement | null>(null);
  const introAtivaAntes = useRef(introAtiva);
  useEffect(() => {
    if (introAtivaAntes.current && !introAtiva && !finished) {
      slotRef.current?.querySelector<HTMLElement>("input:not([type='hidden'])")?.focus();
    }
    introAtivaAntes.current = introAtiva;
  }, [introAtiva, finished]);

  return (
    <>
      {phase === "video" && (
        <video
          className="dog-intro-video"
          src="/mascote/intro-cachorro.mp4"
          autoPlay
          muted
          playsInline
          preload="auto"
          onEnded={onSkip}
          aria-hidden="true"
        />
      )}

      {introAtiva && (
        <>
          {/* Botão-tela: qualquer clique (ou Enter/Espaço) pula a introdução. */}
          <button
            type="button"
            onClick={onSkip}
            className="absolute inset-0 z-10 cursor-default"
            aria-label="Pular animação de introdução e ir direto para o formulário"
          />
          <p className="dog-skip-hint">Clique em qualquer lugar para pular</p>
        </>
      )}

      <div
        ref={slotRef}
        className={`dog-form-slot ${modificador}`}
        style={style}
        // Enquanto o formulário está fora de cena (vídeo tocando) ele fica
        // fora da ordem de leitura e de tabulação.
        aria-hidden={phase === "video" || finished}
        inert={phase === "video" || finished}
      >
        {children}
      </div>
    </>
  );
}
