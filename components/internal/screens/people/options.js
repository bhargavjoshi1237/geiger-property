"use client";

import { glAccountsLayer } from "@/lib/supabase/gl_accounts";
import { leasesLayer } from "@/lib/supabase/leases";
import { listProperties } from "@/lib/supabase/properties";
import { formatDate } from "./shared";

// Option loaders for People-area pickers that store an id (the shared
// glAccountOptions stores a label, so vendors use their own id-based loader).

export async function glAccountIdOptions() {
  const rows = (await glAccountsLayer.list()) ?? [];
  return rows
    .filter((a) => a.status !== "Inactive")
    .map((a) => {
      const label = a.number ? `${a.number} · ${a.name}` : a.name || "Account";
      return { value: a.id, label, patch: { defaultGlAccountName: label } };
    });
}

export async function propertyNameOptions() {
  const rows = (await listProperties()) ?? [];
  return rows.map((p) => ({ value: p.name || p.id, label: p.name || "Untitled property" }));
}

export async function propertyIdOptions() {
  const rows = (await listProperties()) ?? [];
  return rows.map((p) => ({ value: p.id, label: p.name || "Untitled property", patch: { propertyName: p.name || "" } }));
}

// Leases a tenant can be added to (not ended), labelled with unit + term.
export async function joinableLeaseOptions() {
  const rows = (await leasesLayer.list()) ?? [];
  return rows
    .filter((l) => l.status !== "Ended")
    .map((l) => ({
      value: l.id,
      label: [l.name || "Lease", l.unit, l.termStart ? `from ${formatDate(l.termStart)}` : null]
        .filter(Boolean)
        .join(" · "),
      patch: { leaseName: l.name || "", unit: l.unit || "", unitId: l.unitId || "", propertyId: l.propertyId || "" },
    }));
}
