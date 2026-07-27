"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { DUR, type IntroPhase } from "./dogMachine";

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

/** Fases em que o formulário ainda nem está em cena. */
const ESCONDIDO: IntroPhase[] = ["start", "enter", "sniff", "leave", "gap"];

/**
 * Invólucro do formulário durante a animação de introdução.
 *
 * O truque central: o slot do formulário usa a MESMA variável `--x` e a mesma
 * duração de transição do mascote. Enquanto o cachorro corre de volta com o
 * formulário na boca (fase `carry`), os dois transladam juntos. Na fase `drop`
 * o slot volta para `transform: none` — ou seja, o lugar natural dele no
 * layout — e o formulário "assenta" no centro.
 */
export default function IntroStage({ phase, x, moveMs, finished, onSkip, children }: Props) {
  const introAtiva = phase !== "done" && !finished;

  let modificador: string;
  if (finished) modificador = "dog-form-slot--gone";
  else if (ESCONDIDO.includes(phase)) modificador = "dog-form-slot--hidden";
  else if (phase === "carry") modificador = "dog-form-slot--carried";
  else modificador = "dog-form-slot--settled";

  // O "assentar" tem duração própria; o resto acompanha o mascote.
  const slotMs = phase === "drop" ? DUR.introDrop : moveMs;

  const style = {
    "--x": x,
    "--move-ms": `${slotMs}ms`,
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
        // Enquanto o formulário está "na boca" do cachorro ele fica fora da
        // ordem de leitura e de tabulação.
        aria-hidden={ESCONDIDO.includes(phase) || phase === "carry" || finished}
        inert={ESCONDIDO.includes(phase) || phase === "carry" || finished}
      >
        {children}
      </div>
    </>
  );
}
