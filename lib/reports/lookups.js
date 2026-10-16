import { ACTIVE_LEASE_STATUSES, DEAD_LEASE_STATUSES } from "./maps";
import { dayOf } from "./periods";

// Small shared helpers for report definitions (pure).

export const list = (v) => (Array.isArray(v) ? v : []);
export const byId = (rows) => new Map(list(rows).map((r) => [r.id, r]));
export const norm = (s) => String(s || "").trim().toLowerCase();
export const sum = (rows, fn) => list(rows).reduce((s, r) => s + (Number(typeof fn === "function" ? fn(r) : r[fn]) || 0), 0);
export const stat = (label, value, footer) => ({ label, value: String(value), footer });

// Id → display-name maps for every dimension a ledger line can carry.
export function nameMaps(data) {
  const name = (rows, fn = (r) => r.name) => new Map(list(rows).map((r) => [r.id, fn(r) || ""]));
  return {
    property: name(data.properties, (p) => p.name || "Untitled property"),
    unit: name(data.units, (u) => u.label || "Unit"),
    lease: name(data.leases, (l) => l.tenantName || l.name || "Lease"),
    tenant: name(data.tenants),
    owner: name(data.owners),
    vendor: name(data.vendors),
    bank: name(data.bankAccounts, (b) => [b.name, b.last4 ? `••${b.last4}` : ""].filter(Boolean).join(" ")),
  };
}

// Payee/payer label for a register or detail row.
export function partyName(row, names) {
  return (
    names.vendor.get(row.vendorId) ||
    names.tenant.get(row.tenantId) ||
    names.lease.get(row.leaseId) ||
    names.owner.get(row.ownerId) ||
    ""
  );
}

// Property of a row: its own propertyId, else through its unit.
export const propertyOf = (row, unitsById) => row?.propertyId || unitsById?.get(row?.unitId)?.propertyId || "";

// Does a lease cover a given day? (non-dead status, started, not ended).
export function leaseCovers(lease, asOf) {
  if (!lease || DEAD_LEASE_STATUSES.includes(lease.status)) return false;
  const start = dayOf(lease.termStart || lease.moveInDate);
  const end = dayOf(lease.moveOutDate || lease.termEnd);
  if (start && start > asOf) return false;
  if (end && end < asOf) return lease.status === "Month-to-month";
  return Boolean(start) || ACTIVE_LEASE_STATUSES.includes(lease.status);
}

// The lease on a unit as of a day: a covering Active one first.
export function leaseForUnit(unitId, leases, asOf) {
  const onUnit = list(leases).filter((l) => l.unitId === unitId && leaseCovers(l, asOf));
  return onUnit.find((l) => l.status === "Active") || onUnit[0] || null;
}

// Owner → [{ propertyId, name, pct }] from property_owners, else the owner's
// legacy Properties & Splits metadata list.
export function ownerHoldings(owner, propertyOwners, properties) {
  const props = byId(properties);
  const links = list(propertyOwners).filter((r) => r.ownerId === owner?.id);
  if (links.length) {
    return links.map((r) => ({
      propertyId: r.propertyId,
      name: props.get(r.propertyId)?.name || r.propertyName || "Property",
      pct: Number(r.ownershipPct) > 0 ? Math.min(Number(r.ownershipPct), 100) : 100,
    }));
  }
  const meta = owner?.metadata || {};
  const rows = [meta.splits, meta.properties, meta.propertySplits].find((v) => Array.isArray(v) && v.length) || [];
  const byName = new Map(list(properties).map((p) => [norm(p.name), p]));
  return rows
    .map((r) => {
      const prop = props.get(r?.propertyId) || byName.get(norm(r?.propertyName || r?.name || r?.label));
      const raw = Number(r?.percent ?? r?.pct ?? r?.ownership ?? r?.share);
      return prop ? { propertyId: prop.id, name: prop.name, pct: raw > 0 ? Math.min(raw, 100) : 100 } : null;
    })
    .filter(Boolean);
}

// Options for a select filter from rows.
export const optionsFrom = (rows, allLabel, labelOf = (r) => r.name) => [
  ...(allLabel ? [{ value: "all", label: allLabel }] : []),
  ...list(rows).map((r) => ({ value: r.id, label: labelOf(r) || "Untitled" })),
];
