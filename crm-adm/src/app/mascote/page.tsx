"use client";

import dynamic from "next/dynamic";

/**
 * PÁGINA TEMPORÁRIA — só pra revisar o mascote 3D durante o desenvolvimento.
 *
 * Deve ser apagada quando o mascote for integrado na tela de login (Etapa 4+).
 * Não está no menu e não tem nada de negócio aqui.
 *
 * O Canvas é carregado com `ssr: false` porque three.js precisa de `window`.
 */
const DogCanvas = dynamic(() => import("@/components/login3d/DogCanvas"), {
  ssr: false,
  loading: () => <p className="p-6 text-sm text-navy/50">Carregando mascote...</p>,
});

export default function MascotePreviewPage() {
  return (
    <div className="flex flex-col h-dvh">
      <div className="px-4 sm:px-6 py-4 border-b border-navy/10">
        <h1 className="text-xl font-extrabold text-navy">Mascote 3D — prévia</h1>
        <p className="text-sm text-navy/60">
          Etapa 1: só o cachorro. Arraste pra girar e use o scroll pra aproximar.
        </p>
      </div>

      <div className="flex-1 min-h-0">
        <DogCanvas
          permitirOrbita
          capturavel
          className="w-full h-full"
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
