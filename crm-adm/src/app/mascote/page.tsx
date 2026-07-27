"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { CENAS, LABEL_CENA, type Cena } from "@/components/login3d/introTimeline";

/**
 * PÁGINA TEMPORÁRIA — só pra revisar o mascote 3D durante o desenvolvimento.
 *
 * Deve ser apagada quando o mascote for integrado na tela de login de vez.
 * Não está no menu e não tem nada de negócio aqui.
 *
 * O Canvas é carregado com `ssr: false` porque three.js precisa de `window`.
 *
 * O seletor de cena existe porque este ambiente de desenvolvimento não
 * renderiza 3D (sem screenshot, sem medição de canvas) — a forma de revisar
 * a intro é abrindo isto num navegador de verdade e clicando cena por cena.
 */
const DogCanvas = dynamic(() => import("@/components/login3d/DogCanvas"), {
  ssr: false,
  loading: () => <p className="p-6 text-sm text-navy/50">Carregando mascote...</p>,
});

export default function MascotePreviewPage() {
  const [aba, setAba] = useState<"idle" | "intro">("idle");
  const [cenaForcada, setCenaForcada] = useState<Cena | undefined>(CENAS[0]);
  const [rodandoAuto, setRodandoAuto] = useState(false);
  const [cenaAtual, setCenaAtual] = useState<Cena>("vazio");

  return (
    <div className="flex flex-col h-dvh">
      <div className="px-4 sm:px-6 py-4 border-b border-navy/10 flex flex-col gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-navy">Mascote 3D — prévia</h1>
          <p className="text-sm text-navy/60">
            Arraste pra girar a câmera, scroll pra aproximar. Use as abas abaixo pra alternar entre
            o comportamento parado (Etapas 1-2) e a intro cinematográfica (Etapa 3).
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setAba("idle")}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold ${aba === "idle" ? "bg-navy text-cream" : "bg-navy/5 text-navy/60 hover:bg-navy/10"}`}
          >
            Parado (Etapa 1-2)
          </button>
          <button
            onClick={() => setAba("intro")}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold ${aba === "intro" ? "bg-navy text-cream" : "bg-navy/5 text-navy/60 hover:bg-navy/10"}`}
          >
            Intro (Etapa 3)
          </button>
        </div>

        {aba === "intro" && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setRodandoAuto(true);
                  setCenaForcada(undefined);
                }}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold ${
                  rodandoAuto ? "bg-red text-white" : "bg-red/10 text-red hover:bg-red/20"
                }`}
              >
                ▶ Rodar sequência completa
              </button>
              {rodandoAuto && <span className="text-xs text-navy/50">Cena atual: {LABEL_CENA[cenaAtual]}</span>}
            </div>
            <div>
              <p className="text-[11px] font-semibold text-navy/40 uppercase tracking-wide mb-1">
                Ou pule direto pra uma cena (mostra o estado final dela, parado):
              </p>
              <div className="flex flex-wrap gap-1.5">
                {CENAS.map((c) => (
                  <button
                    key={c}
                    onClick={() => {
                      setRodandoAuto(false);
                      setCenaForcada(c);
                    }}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium ${
                      !rodandoAuto && cenaForcada === c
                        ? "bg-blue text-white"
                        : "bg-white border border-navy/10 text-navy/70 hover:bg-navy/5"
                    }`}
                  >
                    {LABEL_CENA[c]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0">
        <DogCanvas
          permitirOrbita
          capturavel
          className="w-full h-full"
          modo={aba === "intro" ? "intro" : "idle"}
          cenaForcada={aba === "intro" && !rodandoAuto ? cenaForcada : undefined}
          onCenaChange={setCenaAtual}
          fallback={
            <div className="h-full flex items-center justify-center px-6 text-center">
              <p className="text-sm text-navy/60">
                Seu navegador não conseguiu iniciar o 3D (WebGL). O restante do sistema
                funciona normalmente.
              </p>
            </div>
          }
        />
      </div>
    </div>
  );
}
