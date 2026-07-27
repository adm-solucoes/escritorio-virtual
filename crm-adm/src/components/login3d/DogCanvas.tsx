"use client";

import { Component, Suspense, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import { ContactShadows, OrbitControls } from "@react-three/drei";
import DogModel from "./DogModel";
import IntroStage from "./IntroStage";
import type { Cena } from "./introTimeline";

/**
 * Palco 3D do mascote.
 *
 * Medidas vindas da inspeção do .glb: o modelo tem os pés em Y=0, mede ~3,9
 * unidades de comprimento por ~3,2 de altura, e o focinho aponta pro +Z — ou
 * seja, ele já nasce de frente pra câmera padrão.
 *
 * Regra que vale pro projeto todo: **o 3D nunca pode impedir alguém de usar a
 * tela**. Se o WebGL não existir ou o Canvas explodir, cai no `fallback` e a
 * página segue funcionando.
 */

function temWebGL() {
  if (typeof window === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      window.WebGLRenderingContext &&
        (canvas.getContext("webgl") || canvas.getContext("experimental-webgl"))
    );
  } catch {
    return false;
  }
}

/** Se qualquer coisa dentro do Canvas quebrar, mostra o fallback em vez da tela branca. */
class LimiteDeErro extends Component<
  { children: ReactNode; fallback: ReactNode },
  { quebrou: boolean }
> {
  state = { quebrou: false };

  static getDerivedStateFromError() {
    return { quebrou: true };
  }

  componentDidCatch(erro: unknown) {
    console.error("[mascote 3D] falhou, usando fallback:", erro);
  }

  render() {
    return this.state.quebrou ? this.props.fallback : this.props.children;
  }
}

interface Props {
  /** Mostra controles de órbita — útil pra revisar o modelo, desligado no login. */
  permitirOrbita?: boolean;
  /**
   * Mantém o buffer de desenho após o frame ser apresentado, o que permite
   * `canvas.toDataURL()` capturar o que está na tela. Custa um pouco de
   * desempenho, então fica desligado no login e ligado só na página de prévia.
   */
  capturavel?: boolean;
  /** O que aparece se o 3D não puder rodar. */
  fallback?: ReactNode;
  className?: string;
  /** "idle": só o cachorro parado/seguindo o cursor (Etapas 1-2, comportamento
   * default). "intro": roda a sequência cinematográfica da Etapa 3. */
  modo?: "idle" | "intro";
  /** Trava a intro numa cena específica (não avança sozinha) — usado pelo
   * seletor de cena da prévia, pra inspecionar uma cena isolada. */
  cenaForcada?: Cena;
  onCenaChange?: (cena: Cena) => void;
  onFinishIntro?: () => void;
}

export default function DogCanvas({
  permitirOrbita = false,
  capturavel = false,
  fallback = null,
  className,
  modo = "idle",
  cenaForcada,
  onCenaChange,
  onFinishIntro,
}: Props) {
  if (!temWebGL()) return <>{fallback}</>;

  return (
    <LimiteDeErro fallback={fallback}>
      <Canvas
        className={className}
        shadows
        // Trava o devicePixelRatio em 2: acima disso o ganho visual é nulo e o
        // custo de preenchimento no celular é alto.
        dpr={[1, 2]}
        gl={{ preserveDrawingBuffer: capturavel }}
        camera={{ position: [0, 2.4, 8.5], fov: 35 }}
      >
        <color attach="background" args={["#fbf3e7"]} />

        {/* Luz ambiente quente + chave vinda de cima/frente/esquerda, que é a
            que gera a sombra, + uma de trás pra descolar o cachorro do fundo. */}
        <hemisphereLight args={["#fff6e8", "#c9b79c", 1.1]} />
        <directionalLight
          position={[4, 7, 5]}
          intensity={2.1}
          castShadow
          shadow-mapSize={[1024, 1024]}
          shadow-camera-left={-6}
          shadow-camera-right={6}
          shadow-camera-top={6}
          shadow-camera-bottom={-6}
        />
        <directionalLight position={[-5, 3, -4]} intensity={0.5} color="#ffd9a8" />

        <Suspense fallback={null}>
          <group position={[0, 0, 0]}>
            {modo === "intro" ? (
              <IntroStage cenaForcada={cenaForcada} onCenaChange={onCenaChange} onFinish={onFinishIntro} />
            ) : (
              <DogModel />
            )}
          </group>
          <ContactShadows
            position={[0, 0.01, 0]}
            opacity={0.45}
            scale={12}
            blur={2.4}
            far={5}
            color="#150638"
          />
        </Suspense>

        {permitirOrbita && <OrbitControls target={[0, 1.4, 0]} enablePan={false} />}
      </Canvas>
    </LimiteDeErro>
  );
}
