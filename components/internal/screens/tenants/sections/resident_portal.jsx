"use client";

import { Smartphone } from "lucide-react";
import { toast } from "sonner";

import { Switch } from "@/components/ui/switch";
import { tenantsData } from "@/lib/supabase/tenants";

const fmt = (v) =>
  v
    ? new Date(v).toLocaleString("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "Never";

// Tenants · Resident Portal section — toggles the tenant's portal access
// (`portal_enabled` / `portal_last_seen` on `property.tenants`). Persists
// immediately through the tenants data layer.
export function ResidentPortalSection({ item, onCommit }) {
  const toggle = async (enabled) => {
    const patch = {
      ...item,
      portalEnabled: enabled,
      portalLastSeen: enabled ? new Date().toISOString() : item.portalLastSeen,
    };
    onCommit?.(patch); // optimistic local patch + persist via updateTenant
    const saved = await tenantsData.update(item.id, {
      portalEnabled: enabled,
      ...(enabled ? { portalLastSeen: patch.portalLastSeen } : {}),
    });
    if (!saved) toast.error("Couldn't update portal access.");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-xl border border-border bg-surface-subtle px-4 py-3">
        <div>
          <p className="font-medium text-foreground">Portal access</p>
          <p className="text-xs text-text-secondary">
            {item.portalEnabled
              ? "Enabled — resident can sign in"
              : "Disabled"}
          </p>
        </div>
        <Switch
          checked={Boolean(item.portalEnabled)}
          onCheckedChange={toggle}
        />
      </div>

      <div className="rounded-xl border border-border bg-surface-subtle px-4 py-3">
        <p className="text-xs uppercase tracking-wider text-text-tertiary">
          Last seen
        </p>
        <p className="mt-1 text-sm text-foreground">
          {fmt(item.portalLastSeen)}
        </p>
      </div>
    </div>
  );
}

export default ResidentPortalSection;
