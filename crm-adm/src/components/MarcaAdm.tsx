/** Mark oficial da ADM Soluções: três quadrados arredondados vermelhos em
 * cascata diagonal, crescendo do canto inferior esquerdo pro superior
 * direito. Componente único pra sidebar e login nunca ficarem dessincronizados. */
export default function MarcaAdm({ tamanho = 16, className }: { tamanho?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={tamanho}
      height={tamanho}
      className={className}
      style={{ display: "block" }}
      aria-hidden
    >
      <rect x="0" y="76" width="24" height="24" rx="7" fill="var(--adm-red)" />
      <rect x="16" y="44" width="40" height="40" rx="11" fill="var(--adm-red)" />
      <rect x="34" y="0" width="66" height="66" rx="16" fill="var(--adm-red)" />
    </svg>
  );
}
