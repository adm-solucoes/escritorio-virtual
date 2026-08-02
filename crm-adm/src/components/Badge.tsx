import type { LucideIcon } from "lucide-react";

export type BadgeVariant = "success" | "warning" | "danger" | "info" | "neutral";

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  success: "bg-success-bg text-success",
  warning: "bg-warning-bg text-warning",
  danger: "bg-danger-bg text-danger",
  info: "bg-blue/10 text-blue",
  neutral: "bg-navy/[0.06] text-navy/60",
};

/** Mesmas classes do Badge, pra elementos que precisam do estilo mas não podem
 * ser um <span> (ex: um <select> de status). Mantém os dois em sincronia. */
export function badgeClasses(variant: BadgeVariant) {
  return VARIANT_CLASSES[variant];
}

export function Badge({
  variant = "neutral",
  icon: Icon,
  children,
}: {
  variant?: BadgeVariant;
  icon?: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2 py-0.5 whitespace-nowrap ${VARIANT_CLASSES[variant]}`}
    >
      {Icon && <Icon size={10} />}
      {children}
    </span>
  );
}
