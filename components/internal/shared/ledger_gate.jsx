"use client";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@geiger/ui/tooltip";
import { cn } from "@/lib/utils";
import { usePermission } from "@/context/rbac-context";
import { LEDGER_LOCKED, LEDGER_VIEW } from "@/lib/ledger/access";

// Ledger figures for viewers without accounting access (CORE-07): "—" with a tooltip, never a $0 that looks real.

export const useLedgerAccess = () => usePermission(LEDGER_VIEW);

export function LockedFigure({ className }) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} aria-label={LEDGER_LOCKED} className={cn("cursor-help text-text-tertiary", className)}>
            —
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={6}>
          {LEDGER_LOCKED}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Children (a ledger amount) when the viewer can read the ledger, else the locked "—".
export function LedgerFigure({ children, className }) {
  return useLedgerAccess() ? children : <LockedFigure className={className} />;
}
