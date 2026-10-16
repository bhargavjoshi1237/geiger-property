"use client";

import { listProperties } from "./properties";
import { listUnits } from "./units";
import { listingsLayer } from "./listings";
import { prospectsLayer } from "./prospects";
import { applicationsLayer } from "./applications";
import { teamMembersLayer } from "./team_members";

// Option loaders for the Marketing & Leads relation pickers. Each returns
// [{ value, label, patch }] where `patch` keeps denormalized display columns in sync.

const money = (n) => `$${Math.round(Number(n) || 0).toLocaleString("en-US")}`;

// Units with rent + status in the label; patch carries unit/property names.
export async function marketingUnitOptions() {
  const [units, props] = await Promise.all([listUnits(), listProperties()]);
  const propsById = new Map((props ?? []).map((p) => [p.id, p]));
  return (units ?? []).map((u) => {
    const prop = propsById.get(u.propertyId);
    const name = prop?.name ? `${prop.name} · ${u.label}` : u.label || "Unit";
    const extra = [u.rent ? `${money(u.rent)}/mo` : null, u.status].filter(Boolean).join(" · ");
    return {
      value: u.id,
      label: extra ? `${name} — ${extra}` : name,
      patch: { unit: name, propertyId: u.propertyId || "", propertyName: prop?.name || "" },
      unit: u,
    };
  });
}

// Listings; `withUnit` also patches the listing's unit/property (applications, showings).
export async function listingOptions({ withUnit = false } = {}) {
  const rows = (await listingsLayer.list()) ?? [];
  return rows
    .filter((l) => l.status !== "Archived")
    .map((l) => ({
      value: l.id,
      label: [l.name || "Listing", l.rent ? `${money(l.rent)}/mo` : null, l.status].filter(Boolean).join(" · "),
      patch: withUnit
        ? {
            listingName: l.name || "",
            unitId: l.unitId || "",
            unit: l.unit || "",
            propertyId: l.propertyId || "",
            propertyName: l.propertyName || "",
          }
        : { listingName: l.name || "" },
    }));
}

export const listingOptionsWithUnit = () => listingOptions({ withUnit: true });

// Prospects; picking one prefills the contact (applications, waitlist, showings).
export async function prospectContactOptions() {
  const rows = (await prospectsLayer.list()) ?? [];
  return rows.map((p) => ({
    value: p.id,
    label: [p.name || "Prospect", p.email].filter(Boolean).join(" · "),
    patch: { prospectName: p.name || "", prospectContact: p.email || p.phone || "" },
  }));
}

export async function applicationOptions() {
  const rows = (await applicationsLayer.list()) ?? [];
  return rows.map((a) => ({
    value: a.id,
    label: [a.name || "Application", a.unit, a.status].filter(Boolean).join(" · "),
    patch: {},
  }));
}

// Team members as leasing agents; the value is the display name (agent is a text column).
export async function agentOptions() {
  const rows = (await teamMembersLayer.list()) ?? [];
  return rows
    .filter((m) => m.name && m.status !== "Removed")
    .map((m) => ({ value: m.name, label: m.role ? `${m.name} · ${m.role}` : m.name, patch: {} }));
}
