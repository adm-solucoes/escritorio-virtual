/* eslint-disable @next/next/no-img-element */

/** Mark oficial da ADM Soluções — arquivo real extraído do Branding Book
 * (2026.1), não uma recriação. "vermelho" pra fundo claro, "branco" pra
 * fundo escuro (navy). Nunca redesenhar isso à mão de novo — se precisar de
 * outra variante/tamanho, tirar do PDF do branding book. */
export default function MarcaAdm({
  tamanho = 16,
  variante = "vermelho",
  className,
}: {
  tamanho?: number;
  variante?: "vermelho" | "branco";
  className?: string;
}) {
  return (
    <img
      src={variante === "branco" ? "/brand/marca-icone-branco.png" : "/brand/marca-icone-vermelho.png"}
      alt="ADM Soluções"
      width={tamanho}
      height={tamanho}
      className={className}
      style={{ display: "block", width: tamanho, height: tamanho, objectFit: "contain" }}
    />
  );
}
