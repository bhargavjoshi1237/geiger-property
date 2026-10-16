"use client";

import { Info } from "lucide-react";

import { Switch } from "@/components/ui/switch";

const fmt = (v) =>
  v
    ? new Date(v).toLocaleString("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "Never";

// Tenants · Resident Portal section — tracks the tenant's portal access
// (`portal_enabled` / `portal_last_seen`); onCommit persists via the engine.
export function ResidentPortalSection({ item, onCommit }) {
  const toggle = (enabled) =>
    onCommit({
      portalEnabled: enabled,
      ...(enabled ? { portalLastSeen: new Date().toISOString() } : {}),
    });

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl border border-border bg-surface-subtle px-4 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-text-tertiary" />
        <p className="text-sm text-text-secondary">
          Portal access is tracked here; the resident app isn&apos;t live yet, so
          enabling access doesn&apos;t send an invite or create a login.
        </p>
      </div>

      <div className="flex items-center justify-between rounded-xl border border-border bg-surface-subtle px-4 py-3">
        <div>
          <p className="font-medium text-foreground">Portal access</p>
          <p className="text-xs text-text-secondary">
            {item.portalEnabled ? "Enabled for this resident" : "Disabled"}
          </p>
        </div>
        <Switch
          checked={Boolean(item.portalEnabled)}
          onCheckedChange={toggle}
          aria-label="Portal access"
        />
      </div>

      <div className="rounded-xl border border-border bg-surface-subtle px-4 py-3">
        <p className="text-xs uppercase tracking-wider text-text-tertiary">
          Access last enabled
        </p>
        <p className="mt-1 text-sm text-foreground">
          {fmt(item.portalLastSeen)}
        </p>
      </div>
    </div>
  );
}

export default ResidentPortalSection;
