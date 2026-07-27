"use client";

import {
  useEffect,
  useImperativeHandle,
  useReducer,
  useRef,
  type CSSProperties,
  type ReactNode,
  type Ref,
} from "react";
import "./mascot.css";
import DogMascot from "./DogMascot";
import FoodBowl from "./FoodBowl";
import IntroStage from "./IntroStage";
import usePrefersReducedMotion from "./usePrefersReducedMotion";
import {
  DUR,
  INTRO_MS,
  anchorToCss,
  dogReducer,
  initialState,
  type FocusField,
  type Reaction,
} from "./dogMachine";

/** API imperativa exposta para a página de login. */
export interface DogMascotHandle {
  /** Dispara a reação ao resultado do login. */
  react: (kind: Reaction) => void;
  /** Informa qual campo do formulário está em foco. */
  setFocusField: (campo: FocusField) => void;
}

interface Props {
  /** Formulário (ou tela de recuperação) que o cachorro traz e posiciona. */
  children: ReactNode;
  /** Login concluído: o formulário some e sobra o cachorro comemorando. */
  success: boolean;
  ref?: Ref<DogMascotHandle>;
}

/**
 * Palco do login: máquina de estados do mascote + cumbuca + slot do formulário.
 *
 * Fluxo geral:
 *   intro (enter → sniff → leave → gap → carry → drop → celebrate) → idle
 *   idle ⇄ watching / coveringEyes            (conforme o foco nos campos)
 *   idle → running → eating                   (clique na cumbuca)
 *   qualquer → running → barking | happy      (resultado do login interrompe)
 *   barking | happy → eating (se sobrou ração) | idle
 *
 * Todos os timers vivem em `useEffect` com cleanup, então interromper uma
 * transição no meio (pular a intro, submeter enquanto ele come) nunca deixa
 * `setTimeout` órfão.
 */
export default function LoginDogMascot({ children, success, ref }: Props) {
  const [m, dispatch] = useReducer(dogReducer, initialState);
  const movimentoReduzido = usePrefersReducedMotion();
  const dogRef = useRef<HTMLDivElement | null>(null);
  const introDisparada = useRef(false);

  useImperativeHandle(
    ref,
    () => ({
      react: (kind: Reaction) => dispatch({ type: "react", kind }),
      setFocusField: (campo: FocusField) => dispatch({ type: "focus", field: campo }),
    }),
    []
  );

  /* --- Intro: só começa depois de sabermos a preferência de movimento ----- */
  useEffect(() => {
    if (movimentoReduzido === null || introDisparada.current) return;
    introDisparada.current = true;
    if (!movimentoReduzido) dispatch({ type: "playIntro" });
  }, [movimentoReduzido]);

  /* --- Avanço automático das fases da intro ------------------------------ */
  useEffect(() => {
    if (m.intro === "done") return;
    const id = window.setTimeout(() => dispatch({ type: "introAdvance" }), INTRO_MS[m.intro]);
    return () => window.clearTimeout(id);
  }, [m.intro]);

  /* --- Chegada ao fim de uma corrida ------------------------------------- */
  useEffect(() => {
    if (m.dog !== "running" || m.intro !== "done") return;
    const id = window.setTimeout(() => dispatch({ type: "arrived" }), m.moveMs);
    return () => window.clearTimeout(id);
  }, [m.dog, m.intro, m.moveMs, m.moveToken]);

  /* --- Mastigação: uma mordida por vez ----------------------------------- */
  useEffect(() => {
    if (m.dog !== "eating") return;
    const id = window.setInterval(() => dispatch({ type: "bite" }), DUR.bite);
    return () => window.clearInterval(id);
  }, [m.dog]);

  /* --- Fim da reação (latido / comemoração) ------------------------------ */
  useEffect(() => {
    if (m.intro !== "done" || m.finished) return;
    if (m.dog !== "barking" && m.dog !== "happy") return;
    const espera = m.dog === "barking" ? DUR.bark : DUR.happy;
    const id = window.setTimeout(() => dispatch({ type: "reactionEnd" }), espera);
    return () => window.clearTimeout(id);
  }, [m.dog, m.intro, m.finished]);

  /* --- Animação da ração caindo ------------------------------------------ */
  useEffect(() => {
    if (!m.filling) return;
    const id = window.setTimeout(() => dispatch({ type: "fillEnd" }), DUR.fill);
    return () => window.clearTimeout(id);
  }, [m.filling]);

  /* --- Shake da tela a cada senha errada --------------------------------- */
  useEffect(() => {
    if (!m.shaking) return;
    const id = window.setTimeout(() => dispatch({ type: "shakeEnd" }), DUR.shake);
    return () => window.clearTimeout(id);
  }, [m.shaking]);

  /* --- Login concluído ---------------------------------------------------- */
  useEffect(() => {
    if (success) dispatch({ type: "finish" });
  }, [success]);

  /* --- Olhos seguindo o cursor ------------------------------------------- */
  useEffect(() => {
    if (movimentoReduzido !== false) return;

    let frame = 0;
    let ponteiro: { x: number; y: number } | null = null;

    const aplicar = () => {
      frame = 0;
      const el = dogRef.current;
      if (!el || !ponteiro) return;
      const r = el.getBoundingClientRect();
      if (!r.width) return;
      // Centro aproximado da cabeça dentro do viewBox 240x200.
      const cx = r.left + r.width * (170 / 240);
      const cy = r.top + r.height * (64 / 200);
      const dx = ponteiro.x - cx;
      const dy = ponteiro.y - cy;
      const dist = Math.hypot(dx, dy) || 1;
      const intensidade = Math.min(1, dist / 240) * 3.4;
      el.style.setProperty("--eye-x", `${((dx / dist) * intensidade).toFixed(2)}px`);
      el.style.setProperty("--eye-y", `${((dy / dist) * intensidade).toFixed(2)}px`);
    };

    const onMove = (e: PointerEvent) => {
      ponteiro = { x: e.clientX, y: e.clientY };
      if (!frame) frame = window.requestAnimationFrame(aplicar);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [movimentoReduzido]);

  const x = anchorToCss(m.anchor);
  // `intro` é o estado "fora de cena"; visualmente ele se comporta como idle.
  const estadoVisual = m.dog === "intro" ? "idle" : m.dog;

  return (
    <div className={`dog-stage${m.shaking ? " dog-stage--shake" : ""}`}>
      <IntroStage
        phase={m.intro}
        x={x}
        moveMs={m.moveMs}
        finished={m.finished}
        onSkip={() => dispatch({ type: "skipIntro" })}
      >
        {children}
      </IntroStage>

      <DogMascot
        state={estadoVisual}
        x={x}
        facing={m.facing}
        moveMs={m.moveMs}
        containerRef={dogRef}
      />

      {m.dog === "barking" && (
        <div className="dog-bubble" style={{ "--x": x } as CSSProperties} aria-hidden="true">
          AU! AU!
        </div>
      )}

      {!m.finished && (
        <FoodBowl
          kibble={m.kibble}
          filling={m.filling}
          disabled={m.intro !== "done"}
          onFill={() => dispatch({ type: "fillBowl" })}
        />
      )}

      {m.finished && (
        <p className="absolute left-1/2 -translate-x-1/2 bottom-16 text-center font-extrabold text-navy text-lg">
          Bem-vindo de volta!
        </p>
      )}
    </div>
  );
}
