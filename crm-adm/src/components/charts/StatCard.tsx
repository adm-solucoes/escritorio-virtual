import type { LucideIcon } from "lucide-react";

const COR_BOA = "var(--adm-success)";
const COR_RUIM = "var(--adm-danger)";

// Card de estatística — número grande é o protagonista. Sem ícone-em-caixa
// (padrão gasto de dashboard genérico); a barra de acento à esquerda é o
// único elemento decorativo, sempre presente (não só quando "destaque").
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
      className={`relative overflow-hidden rounded-lg border-l-[3px] p-4 transition-shadow duration-150 ${
        destaque
          ? "bg-navy border-l-red text-cream shadow-elevated"
          : "bg-white border-l-navy border-y border-r border-navy/15 shadow-sm hover:shadow-elevated"
      }`}
    >
      {destaque && (
        <div
          className="absolute -top-10 -right-10 w-28 h-28 rounded-full opacity-25 blur-2xl pointer-events-none"
          style={{ background: "radial-gradient(circle, var(--adm-red), transparent 70%)" }}
        />
      )}

      <div className="relative flex items-center gap-1.5">
        {Icon && <Icon size={13} className={destaque ? "text-cream/60" : "text-navy/45"} />}
        <p className={`text-xs font-semibold uppercase tracking-wide ${destaque ? "text-cream/60" : "text-navy/45"}`}>
          {label}
        </p>
      </div>

      <div className="relative flex items-baseline gap-2 mt-2 flex-wrap">
        <p className={`text-3xl font-extrabold tracking-tight tabular-nums ${destaque ? "text-cream" : "text-navy"}`}>
          {value}
        </p>
        {temDelta && (
          <span
            className="text-[11px] font-bold flex items-center gap-0.5 px-1.5 py-0.5 rounded-full"
            style={{
              color: bom ? COR_BOA : COR_RUIM,
              backgroundColor: bom ? "var(--adm-success-bg)" : "var(--adm-danger-bg)",
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
