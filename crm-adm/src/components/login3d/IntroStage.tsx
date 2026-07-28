"use client";

import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import type { Group } from "three";
import DogModel from "./DogModel";
import { ESCALA_MODELO } from "./constants";
import { CENAS, DURACAO_CENA, easeInOutCubic, indiceDaCena, type Cena } from "./introTimeline";

/**
 * Orquestra a intro cinematográfica (Etapa 3): posição do cachorro e o
 * "painel" (placeholder — vira o formulário de verdade na Etapa 4) sendo
 * carregado e posicionado.
 *
 * ⚠️ O modelo ADMSOLUÇÕES.glb não tem NENHUM clipe de animação — então, por
 * enquanto, as cenas de corrida/andar só deslocam a posição do grupo; o
 * cachorro "desliza" na pose de repouso, sem ciclo de pernas. Escrever esse
 * ciclo de marcha em código é o próximo passo, ainda não feito — é trabalho
 * arriscado de acertar sem conseguir renderizar, então fica separado desta
 * mudança (troca de modelo) em vez de ser tentado no mesmo passo.
 *
 * ⚠️ Todas as posições/durações abaixo são um primeiro palpite, não uma
 * medição — este ambiente não renderiza 3D, então os números certos só saem
 * testando em `/mascote` e ajustando. É por isso que a prévia tem um seletor
 * de cena: dá pra pular direto pra qualquer uma em vez de assistir a
 * sequência toda pra achar o que ajustar.
 */

/** Posição X do cachorro no início/fim de cada cena (fora da tela = ±9). A
 * posição final da intro (cena "idle") é -1.3 pra sobrar espaço à direita
 * pro painel — ajustar quando o formulário de verdade entrar (Etapa 4). */
const POS_X_INICIO: Record<Cena, number> = {
  vazio: -9,
  correndoEntrada: -9,
  farejando: 0,
  correndoSaida: 0,
  retornandoComPainel: 9,
  posicionando: -1.1,
  empurrando: -1.3,
  soltando: -1.3,
  comemorando: -1.3,
  idle: -1.3,
};
const POS_X_FIM: Record<Cena, number> = {
  vazio: -9,
  correndoEntrada: 0,
  farejando: 0,
  correndoSaida: 9,
  retornandoComPainel: -1.1,
  posicionando: -1.3,
  empurrando: -1.3,
  soltando: -1.3,
  comemorando: -1.3,
  idle: -1.3,
};

/** Offset do painel em relação à cabeça do cachorro enquanto ele "carrega"
 * (cenas 5-7). A partir de "soltando" o painel ganha posição própria, fixa. */
const OFFSET_PAINEL_NO_FOCINHO: [number, number, number] = [0.9, 1.15, 0.5];
const POS_PAINEL_FINAL: [number, number, number] = [1.6, 1.2, 0];
const CENAS_COM_PAINEL_PRESO: Cena[] = ["retornandoComPainel", "posicionando", "empurrando"];

function PainelPlaceholder() {
  return (
    <div
      className="rounded-2xl border border-white/40 bg-white/70 shadow-xl backdrop-blur-md"
      style={{ width: 220, height: 130 }}
    />
  );
}

interface Props {
  /** Quando definida, trava nessa cena (mostra o estado FINAL dela, sem avançar
   * sozinho) — usado pelo seletor de cena da página de prévia. */
  cenaForcada?: Cena;
  onCenaChange?: (cena: Cena) => void;
  onFinish?: () => void;
}

export default function IntroStage({ cenaForcada, onCenaChange, onFinish }: Props) {
  const grupo = useRef<Group>(null);
  const painelRef = useRef<Group>(null);
  const indice = useRef(0);
  const tempoNaCena = useRef(0);
  const avisouFim = useRef(false);

  const modoDebug = cenaForcada !== undefined;
  const [cenaAuto, setCenaAuto] = useState<Cena>("vazio");
  const cena = modoDebug ? cenaForcada! : cenaAuto;

  useFrame((_state, delta) => {
    if (!grupo.current) return;

    let progresso: number;
    let cenaEfetiva: Cena;

    if (modoDebug) {
      cenaEfetiva = cenaForcada!;
      progresso = 1; // sempre o estado final da cena escolhida
    } else {
      tempoNaCena.current += delta;
      cenaEfetiva = CENAS[indice.current];
      const duracao = DURACAO_CENA[cenaEfetiva];
      progresso = duracao === Infinity ? 1 : Math.min(tempoNaCena.current / duracao, 1);

      if (progresso >= 1 && indice.current < CENAS.length - 1) {
        indice.current += 1;
        tempoNaCena.current = 0;
        cenaEfetiva = CENAS[indice.current];
        progresso = 0;
        setCenaAuto(cenaEfetiva);
        onCenaChange?.(cenaEfetiva);
        if (cenaEfetiva === "idle" && !avisouFim.current) {
          avisouFim.current = true;
          onFinish?.();
        }
      }
    }

    const suave = easeInOutCubic(progresso);
    const x = POS_X_INICIO[cenaEfetiva] + (POS_X_FIM[cenaEfetiva] - POS_X_INICIO[cenaEfetiva]) * suave;
    grupo.current.position.x = x;

    if (painelRef.current) {
      if (CENAS_COM_PAINEL_PRESO.includes(cenaEfetiva)) {
        painelRef.current.position.set(
          x + OFFSET_PAINEL_NO_FOCINHO[0],
          OFFSET_PAINEL_NO_FOCINHO[1],
          OFFSET_PAINEL_NO_FOCINHO[2]
        );
      } else if (cenaEfetiva === "soltando" || cenaEfetiva === "comemorando" || cenaEfetiva === "idle") {
        painelRef.current.position.set(...POS_PAINEL_FINAL);
      }
    }
  });

  const mostrarPainel = indiceDaCena(cena) >= indiceDaCena("retornandoComPainel");
  const suspenderOcioso = cena !== "idle" && cena !== "vazio";

  return (
    <>
      <group ref={grupo}>
        <group scale={ESCALA_MODELO}>
          <DogModel suspenderComportamentoOcioso={suspenderOcioso} />
        </group>
      </group>
      {mostrarPainel && (
        <group ref={painelRef} position={POS_PAINEL_FINAL}>
          <Html transform distanceFactor={6} center>
            <PainelPlaceholder />
          </Html>
        </group>
      )}
    </>
  );
}
