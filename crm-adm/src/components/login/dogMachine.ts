/**
 * Máquina de estados do mascote da tela de login.
 *
 * Tudo aqui é puro (reducer sem efeitos colaterais). Quem agenda os timers é o
 * componente `LoginDogMascot`, que lê as durações exportadas abaixo e limpa
 * todos os `setTimeout`/`setInterval` no cleanup dos efeitos.
 */

/** Estados visuais do cachorro. */
export type DogState =
  | "intro"
  | "idle"
  | "watching"
  | "coveringEyes"
  | "barking"
  | "happy"
  | "eating"
  | "running";

/** Passos da animação de introdução (rodam uma única vez). */
export type IntroPhase =
  | "start" // fora da tela, à esquerda
  | "enter" // entra correndo
  | "sniff" // para e farega procurando algo
  | "leave" // sai correndo pela direita
  | "gap" // palco vazio
  | "carry" // volta trazendo o formulário na boca
  | "drop" // empurra o formulário para o lugar
  | "celebrate" // comemora
  | "done"; // intro encerrada, interações liberadas

/** Posições horizontais possíveis (viram variáveis CSS no palco). */
export type Anchor = "offLeft" | "offRight" | "form" | "bowl" | "center";

/** Reações disparadas pelo resultado do login. */
export type Reaction = "barking" | "happy";

export type FocusField = "email" | "senha" | null;

export interface MachineState {
  dog: DogState;
  intro: IntroPhase;
  anchor: Anchor;
  facing: 1 | -1;
  /** Duração da transição de posição atual, em ms (vira `--move-ms`). */
  moveMs: number;
  /** Incrementa a cada movimento para re-disparar o timer de chegada. */
  moveToken: number;
  /** Quantidade de ração na cumbuca. */
  kibble: number;
  /** `true` durante a animação de ração caindo. */
  filling: boolean;
  /** Estado que assume ao terminar de correr. */
  next: DogState | null;
  focus: FocusField;
  /** Login concluído: formulário some e sobra só o cachorro feliz. */
  finished: boolean;
  /** `true` enquanto a tela treme por causa de uma senha errada. */
  shaking: boolean;
}

export type Action =
  | { type: "playIntro" }
  | { type: "introAdvance" }
  | { type: "skipIntro" }
  | { type: "focus"; field: FocusField }
  | { type: "fillBowl" }
  | { type: "fillEnd" }
  | { type: "arrived" }
  | { type: "bite" }
  | { type: "react"; kind: Reaction }
  | { type: "reactionEnd" }
  | { type: "shakeEnd" }
  | { type: "finish" };

/** Durações (ms) usadas tanto pelos timers quanto pelas transições CSS. */
export const DUR = {
  introStart: 80,
  introEnter: 1000,
  introSniff: 620,
  introLeave: 780,
  introGap: 460,
  introCarry: 1250,
  introDrop: 700,
  introCelebrate: 1000,
  run: 850,
  center: 620,
  bark: 1450,
  happy: 1700,
  bite: 820,
  fill: 700,
  shake: 480,
} as const;

/** Quanto tempo cada fase da intro fica no ar antes de avançar sozinha. */
export const INTRO_MS: Record<Exclude<IntroPhase, "done">, number> = {
  start: DUR.introStart,
  enter: DUR.introEnter,
  sniff: DUR.introSniff,
  leave: DUR.introLeave,
  gap: DUR.introGap,
  carry: DUR.introCarry,
  drop: DUR.introDrop,
  celebrate: DUR.introCelebrate,
};

/** Quantidade de ração servida por clique na cumbuca. */
export const KIBBLE_PER_SERVING = 6;

/**
 * Estado inicial: já é o estado final da intro. Isso garante que, no primeiro
 * paint (e para quem tem `prefers-reduced-motion`), o formulário aparece pronto
 * e utilizável. A intro só começa se `playIntro` for despachado.
 */
export const initialState: MachineState = {
  dog: "idle",
  intro: "done",
  anchor: "form",
  facing: 1,
  moveMs: 0,
  moveToken: 0,
  kibble: 0,
  filling: false,
  next: null,
  focus: null,
  finished: false,
  shaking: false,
};

/** Estado de repouso coerente com o campo que está focado no momento. */
function restingState(focus: FocusField): DogState {
  if (focus === "senha") return "coveringEyes";
  if (focus === "email") return "watching";
  return "idle";
}

export function dogReducer(s: MachineState, a: Action): MachineState {
  switch (a.type) {
    case "playIntro": {
      if (s.intro !== "done" || s.finished) return s;
      return {
        ...s,
        dog: "intro",
        intro: "start",
        anchor: "offLeft",
        facing: 1,
        moveMs: 0,
        moveToken: s.moveToken + 1,
      };
    }

    case "introAdvance": {
      switch (s.intro) {
        case "start":
          return {
            ...s,
            intro: "enter",
            dog: "running",
            anchor: "form",
            facing: 1,
            moveMs: DUR.introEnter,
            moveToken: s.moveToken + 1,
          };
        case "enter":
          return { ...s, intro: "sniff", dog: "watching" };
        case "sniff":
          return {
            ...s,
            intro: "leave",
            dog: "running",
            anchor: "offRight",
            facing: 1,
            moveMs: DUR.introLeave,
            moveToken: s.moveToken + 1,
          };
        case "leave":
          return { ...s, intro: "gap", dog: "intro" };
        case "carry":
          // Chegou com o formulário: vira de frente e empurra pro lugar.
          return { ...s, intro: "drop", dog: "idle", facing: 1 };
        case "gap":
          return {
            ...s,
            intro: "carry",
            dog: "running",
            anchor: "form",
            facing: -1,
            moveMs: DUR.introCarry,
            moveToken: s.moveToken + 1,
          };
        case "drop":
          return { ...s, intro: "celebrate", dog: "happy" };
        case "celebrate":
          return { ...s, intro: "done", dog: restingState(s.focus), next: null };
        default:
          return s;
      }
    }

    case "skipIntro": {
      if (s.intro === "done") return s;
      return {
        ...s,
        intro: "done",
        dog: restingState(s.focus),
        anchor: "form",
        facing: 1,
        moveMs: 0,
        moveToken: s.moveToken + 1,
        next: null,
      };
    }

    case "focus": {
      // O foco só muda a pose quando o cachorro está "livre" perto do
      // formulário — comendo, correndo ou reagindo ele ignora.
      const livre = s.dog === "idle" || s.dog === "watching" || s.dog === "coveringEyes";
      if (s.intro !== "done" || s.finished || !livre) {
        return { ...s, focus: a.field };
      }
      return { ...s, focus: a.field, dog: restingState(a.field) };
    }

    case "fillBowl": {
      if (s.intro !== "done" || s.finished) return s;
      // Reagindo a uma senha? Só reabastece; ele volta a comer depois.
      if (s.dog === "barking" || s.dog === "happy") {
        return { ...s, kibble: KIBBLE_PER_SERVING, filling: true };
      }
      // Já está comendo (ou indo comer): repõe a ração sem reiniciar a corrida.
      if (s.dog === "eating" || (s.dog === "running" && s.next === "eating")) {
        return { ...s, kibble: KIBBLE_PER_SERVING, filling: true };
      }
      return {
        ...s,
        kibble: KIBBLE_PER_SERVING,
        filling: true,
        dog: "running",
        anchor: "bowl",
        facing: 1,
        moveMs: DUR.run,
        moveToken: s.moveToken + 1,
        next: "eating",
      };
    }

    case "fillEnd":
      return s.filling ? { ...s, filling: false } : s;

    case "arrived": {
      if (s.dog !== "running" || s.intro !== "done") return s;
      const destino = s.next ?? restingState(s.focus);
      // Chegou pra comer mas a ração acabou no caminho: volta pro formulário.
      if (destino === "eating" && s.kibble <= 0) {
        return {
          ...s,
          dog: "running",
          anchor: "form",
          facing: -1,
          moveMs: DUR.run,
          moveToken: s.moveToken + 1,
          next: null,
        };
      }
      return { ...s, dog: destino, next: null };
    }

    case "bite": {
      if (s.dog !== "eating") return s;
      const restante = s.kibble - 1;
      if (restante > 0) return { ...s, kibble: restante };
      // Acabou a ração: volta trotando pro lado do formulário.
      return {
        ...s,
        kibble: 0,
        dog: "running",
        anchor: "form",
        facing: -1,
        moveMs: DUR.run,
        moveToken: s.moveToken + 1,
        next: restingState(s.focus),
      };
    }

    case "react": {
      if (s.finished) return s;
      const shaking = a.kind === "barking" ? true : s.shaking;
      const longeDoForm =
        s.dog === "eating" || (s.dog === "running" && s.next === "eating");

      // Interrompe o que estiver fazendo e corre pro formulário pra reagir.
      if (longeDoForm) {
        return {
          ...s,
          intro: "done",
          dog: "running",
          anchor: "form",
          facing: -1,
          moveMs: DUR.run,
          moveToken: s.moveToken + 1,
          next: a.kind,
          shaking,
        };
      }

      return {
        ...s,
        intro: "done",
        dog: a.kind,
        anchor: "form",
        facing: 1,
        moveMs: 0,
        moveToken: s.moveToken + 1,
        next: null,
        shaking,
      };
    }

    case "shakeEnd":
      return s.shaking ? { ...s, shaking: false } : s;

    case "reactionEnd": {
      if (s.finished) return s;
      if (s.dog !== "barking" && s.dog !== "happy") return s;
      // Sobrou ração? Volta pra cumbuca. Senão, volta ao repouso.
      if (s.kibble > 0) {
        return {
          ...s,
          dog: "running",
          anchor: "bowl",
          facing: 1,
          moveMs: DUR.run,
          moveToken: s.moveToken + 1,
          next: "eating",
        };
      }
      return { ...s, dog: restingState(s.focus), next: null };
    }

    case "finish": {
      if (s.finished) return s;
      return {
        ...s,
        finished: true,
        intro: "done",
        dog: "happy",
        anchor: "center",
        facing: 1,
        moveMs: DUR.center,
        moveToken: s.moveToken + 1,
        next: null,
        kibble: 0,
        filling: false,
        shaking: false,
      };
    }

    default:
      return s;
  }
}

/** Converte a âncora lógica no valor CSS correspondente. */
export function anchorToCss(anchor: Anchor): string {
  switch (anchor) {
    case "offLeft":
      return "var(--x-off-left)";
    case "offRight":
      return "var(--x-off-right)";
    case "bowl":
      return "var(--x-eat)";
    case "center":
      return "var(--x-center)";
    case "form":
    default:
      return "var(--x-form)";
  }
}
