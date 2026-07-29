const COR_BOA = "#0ca30c";
const COR_RUIM = "#e34948";

// Card de estatística com valor grande e badge de variação (à la "Income by
// Last Month" da referência) — a cor da variação segue o sentido do negócio,
// não sempre "alta é boa" (ex: perdas subindo é ruim).
export function StatCard({
  label,
  value,
  delta,
  deltaGoodDirection = "up",
  sub,
  destaque,
}: {
  label: string;
  value: string;
  delta?: number | null;
  deltaGoodDirection?: "up" | "down";
  sub?: string;
  destaque?: boolean;
}) {
  const temDelta = delta != null && Number.isFinite(delta);
  const subiu = temDelta && delta! > 0;
  const bom = temDelta && (deltaGoodDirection === "up" ? delta! >= 0 : delta! <= 0);

  return (
    <div
      className={`rounded-xl border bg-white p-4 shadow-sm ${destaque ? "border-navy/10 border-l-4 border-l-navy" : "border-navy/10"}`}
    >
      <p className="text-xs font-semibold text-navy/50">{label}</p>
      <div className="flex items-baseline gap-2 mt-1 flex-wrap">
        <p className="text-lg font-extrabold text-navy">{value}</p>
        {temDelta && (
          <span
            className="text-xs font-bold flex items-center gap-0.5"
            style={{ color: bom ? COR_BOA : COR_RUIM }}
          >
            {subiu ? "↑" : delta === 0 ? "" : "↓"}
            {Math.abs(delta!).toFixed(0)}%
          </span>
        )}
      </div>
      {sub && <p className="text-[11px] mt-0.5 text-navy/40">{sub}</p>}
    </div>
  );
}
