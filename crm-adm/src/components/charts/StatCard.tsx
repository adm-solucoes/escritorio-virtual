import type { LucideIcon } from "lucide-react";

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
  icon: Icon,
}: {
  label: string;
  value: string;
  delta?: number | null;
  deltaGoodDirection?: "up" | "down";
  sub?: string;
  destaque?: boolean;
  icon?: LucideIcon;
}) {
  const temDelta = delta != null && Number.isFinite(delta);
  const subiu = temDelta && delta! > 0;
  const bom = temDelta && (deltaGoodDirection === "up" ? delta! >= 0 : delta! <= 0);

  return (
    <div
      className={`relative overflow-hidden rounded-xl p-4 transition-shadow duration-150 ${
        destaque
          ? "bg-navy text-cream shadow-elevated"
          : "bg-white border border-navy/[0.07] shadow-sm hover:shadow-elevated"
      }`}
    >
      {destaque && (
        <div
          className="absolute -top-10 -right-10 w-28 h-28 rounded-full opacity-25 blur-2xl pointer-events-none"
          style={{ background: "radial-gradient(circle, var(--adm-red), transparent 70%)" }}
        />
      )}

      <div className="relative flex items-start justify-between gap-2">
        <p className={`text-xs font-semibold uppercase tracking-wide ${destaque ? "text-cream/60" : "text-navy/45"}`}>
          {label}
        </p>
        {Icon && (
          <span
            className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center ${
              destaque ? "bg-white/10 text-cream" : "bg-navy/[0.05] text-navy/55"
            }`}
          >
            <Icon size={14} />
          </span>
        )}
      </div>

      <div className="relative flex items-baseline gap-2 mt-2 flex-wrap">
        <p className={`text-2xl font-extrabold tracking-tight ${destaque ? "text-cream" : "text-navy"}`}>{value}</p>
        {temDelta && (
          <span
            className="text-[11px] font-bold flex items-center gap-0.5 px-1.5 py-0.5 rounded-full"
            style={{
              color: bom ? COR_BOA : COR_RUIM,
              backgroundColor: bom ? "rgb(12 163 12 / 0.1)" : "rgb(227 73 72 / 0.1)",
            }}
          >
            {subiu ? "↑" : delta === 0 ? "" : "↓"}
            {Math.abs(delta!).toFixed(0)}%
          </span>
        )}
      </div>
      {sub && <p className={`relative text-[11px] mt-1 ${destaque ? "text-cream/45" : "text-navy/40"}`}>{sub}</p>}
    </div>
  );
}
