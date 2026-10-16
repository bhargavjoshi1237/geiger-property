import { Info } from "lucide-react";

import { cn } from "@/lib/utils";

// Inline info strip for "provider not connected" / not-yet-live features.
export function InfoNotice({ children, className }) {
  return (
    <div className={cn("flex items-start gap-3 rounded-xl border border-border bg-surface-subtle px-4 py-3", className)}>
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-text-tertiary" />
      <p className="text-sm text-text-secondary">{children}</p>
    </div>
  );
}

// Label/value stat used in summary cards.
export function MiniStat({ label, children, className }) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">{label}</p>
      <div className="mt-1 truncate text-sm text-foreground">{children}</div>
    </div>
  );
}

export default InfoNotice;
