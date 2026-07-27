"use client";

/**
 * Sobreposição mostrada em cima do cartão enquanto a autenticação acontece.
 * Fica dentro do cartão (que é `relative`), então some junto com o formulário
 * quando o login é concluído.
 */
export default function LoadingScreen({ texto }: { texto: string }) {
  return (
    <div className="dog-loading" role="status" aria-live="polite">
      <div className="dog-paw-track" aria-hidden="true">
        <span className="dog-paw" />
        <span className="dog-paw dog-paw--2" />
        <span className="dog-paw dog-paw--3" />
        <span className="dog-paw dog-paw--4" />
      </div>
      <p className="text-sm font-semibold text-navy/70">{texto}</p>
    </div>
  );
}
