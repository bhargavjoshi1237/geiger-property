"use client";

import { leasesLayer } from "@/lib/supabase/leases";
import { bankAccountsLayer } from "@/lib/supabase/bank_accounts";

// Relation-picker loaders for the accounting screens ([{ value, label, patch }]).

// Leases with every id a ledger posting needs (tenant, unit, property).
export async function leaseLinkOptions() {
  const rows = (await leasesLayer.list()) ?? [];
  return rows.map((l) => ({
    value: l.id,
    label: [l.name || "Lease", l.tenantName, l.unit].filter(Boolean).join(" · "),
    patch: {
      leaseName: l.name || "",
      tenantId: l.tenantId || "",
      tenantName: l.tenantName || "",
      unitId: l.unitId || "",
      unit: l.unit || "",
      propertyId: l.propertyId || "",
    },
  }));
}

// Open bank accounts; the patch keeps a display name beside the id.
export async function bankAccountOptions() {
  const rows = (await bankAccountsLayer.list()) ?? [];
  return rows
    .filter((b) => b.status !== "Closed")
    .map((b) => ({ value: b.id, label: [b.name, b.accountType].filter(Boolean).join(" · "), patch: { bankAccountName: b.name } }));
}
