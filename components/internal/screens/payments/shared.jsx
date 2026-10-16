import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";

import { cn } from "@/lib/utils";

// Shared bits for the Online Payments area: formatters (re-exported from
// Accounting so money reads the same everywhere) and an inline notice banner.

export { currency, formatDate, money } from "@/components/internal/screens/accounting/shared";

const TONES = {
  info: { icon: Info, className: "border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-400" },
  success: { icon: CheckCircle2, className: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
  warning: { icon: AlertTriangle, className: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  danger: { icon: XCircle, className: "border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400" },
};

export function Notice({ tone = "info", title, children, action, className }) {
  const t = TONES[tone] || TONES.info;
  const Icon = t.icon;
  return (
    <div className={cn("flex items-start gap-3 rounded-lg border px-4 py-3 text-sm", t.className, className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">
        {title ? <p className="font-medium">{title}</p> : null}
        {children ? <div className={cn(title && "mt-0.5", "opacity-90")}>{children}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export const dateTime = (v) =>
  v ? new Date(v).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "—";
