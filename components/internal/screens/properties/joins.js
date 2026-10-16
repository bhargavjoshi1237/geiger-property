import { listProperties } from "@/lib/supabase/properties";
import { listBuildings } from "@/lib/supabase/buildings";
import { listPortfolios } from "@/lib/supabase/portfolios";
import { listUnits } from "@/lib/supabase/units";
import { listUnitTypes } from "@/lib/supabase/unit_types";
import { leasesLayer } from "@/lib/supabase/leases";
import { workOrdersLayer } from "@/lib/supabase/work_orders";
import { ownersLayer } from "@/lib/supabase/owners";
import { bankAccountsLayer } from "@/lib/supabase/bank_accounts";
import { glAccountsLayer } from "@/lib/supabase/gl_accounts";
import { teamMembersLayer } from "@/lib/supabase/team_members";
import { vendorsLayer } from "@/lib/supabase/vendors";
import { daysUntil } from "./constants";

// Cross-area joins for the Properties / Buildings / Portfolios screens: list
// row enrichment, KPI rollups and cached relation-picker loaders.

const OCCUPIED = ["Occupied", "Notice"];
const ACTIVE_LEASE = ["Active", "Expiring soon"];
const CLOSED_WORK = ["Completed", "Rejected", "Converted", "Cancelled", "Closed"];

export const isOccupied = (u) => OCCUPIED.includes(u.status);
export const isActiveLease = (l) => ACTIVE_LEASE.includes(l.status);
export const isOpenWork = (w) => !CLOSED_WORK.includes(w.status);

// Unit / lease / work-order rollup for any scope (property, building, portfolio).
export function computeKpis({ units = [], leases = [], workOrders = [] }) {
  const occupied = units.filter(isOccupied);
  const vacant = units.filter((u) => u.status === "Vacant");
  const activeLeases = leases.filter(isActiveLease);
  const leaseRent = activeLeases.reduce((s, l) => s + (Number(l.rent) || 0), 0);
  const unitRent = occupied.reduce((s, u) => s + (Number(u.rent) || 0), 0);
  const openWork = workOrders.filter(isOpenWork);
  const expiring = activeLeases.filter((l) => {
    const d = daysUntil(l.termEnd);
    return d !== null && d >= 0 && d <= 60;
  });
  const totalRent = units.reduce((s, u) => s + (Number(u.rent) || 0), 0);
  return {
    unitCount: units.length,
    occupied: occupied.length,
    vacant: vacant.length,
    occupancy: units.length ? (occupied.length / units.length) * 100 : 0,
    rentRoll: leaseRent || unitRent,
    avgRent: units.length ? totalRent / units.length : 0,
    vacancyLoss: vacant.reduce((s, u) => s + (Number(u.rent) || 0), 0),
    activeLeases: activeLeases.length,
    expiringLeases: expiring.length,
    openWork: openWork.length,
    urgentWork: openWork.filter((w) => ["Urgent", "High", "Emergency"].includes(w.priority)).length,
  };
}

// Leases tied to a set of properties directly or through one of their units.
export function leasesFor(leases, propertyIds, unitIds) {
  const props = new Set(propertyIds);
  const unitSet = new Set(unitIds);
  return (leases || []).filter((l) => props.has(l.propertyId) || unitSet.has(l.unitId));
}

// Everything a property-scoped rollup needs, fetched once.
export async function loadScopeData() {
  const [units, leases, workOrders] = await Promise.all([
    listUnits(),
    leasesLayer.list(),
    workOrdersLayer.list(),
  ]);
  return { units: units || [], leases: leases || [], workOrders: workOrders || [] };
}

export function scopeKpis(all, { propertyIds = [], buildingId = null }) {
  const props = new Set(propertyIds);
  const units = all.units.filter((u) => (buildingId ? u.buildingId === buildingId : props.has(u.propertyId)));
  const unitIds = units.map((u) => u.id);
  const leases = buildingId ? leasesFor(all.leases, [], unitIds) : leasesFor(all.leases, propertyIds, unitIds);
  const workOrders = all.workOrders.filter((w) =>
    buildingId ? unitIds.includes(w.unitId) : props.has(w.propertyId),
  );
  return { units, leases, workOrders, kpis: computeKpis({ units, leases, workOrders }) };
}

// --- list row loaders ----------------------------------------------------------

export async function loadPropertyRows() {
  const [rows, units, portfolios] = await Promise.all([listProperties(), listUnits(), listPortfolios()]);
  if (!rows) return null;
  const names = Object.fromEntries((portfolios || []).map((p) => [p.id, p.name]));
  return rows.map((r) => {
    const mine = (units || []).filter((u) => u.propertyId === r.id);
    const k = computeKpis({ units: mine });
    return {
      ...r,
      unitCount: mine.length || Number(r.units) || 0,
      occupiedCount: k.occupied,
      occupancy: k.occupancy,
      rentRoll: k.rentRoll,
      portfolioName: names[r.portfolioId] || "",
    };
  });
}

export async function loadBuildingRows() {
  const [rows, units, properties] = await Promise.all([listBuildings(), listUnits(), listProperties()]);
  if (!rows) return null;
  const names = Object.fromEntries((properties || []).map((p) => [p.id, p.name]));
  return rows.map((r) => {
    const mine = (units || []).filter((u) => u.buildingId === r.id);
    const k = computeKpis({ units: mine });
    return {
      ...r,
      unitCount: mine.length,
      occupancy: k.occupancy,
      rentRoll: k.rentRoll,
      propertyName: names[r.propertyId] || "",
    };
  });
}

export async function loadPortfolioRows() {
  const [rows, properties, units] = await Promise.all([listPortfolios(), listProperties(), listUnits()]);
  if (!rows) return null;
  return rows.map((r) => {
    const members = (properties || []).filter((p) => p.portfolioId === r.id);
    const ids = new Set(members.map((p) => p.id));
    const mine = (units || []).filter((u) => ids.has(u.propertyId));
    const k = computeKpis({ units: mine });
    return {
      ...r,
      propertyCount: members.length,
      unitCount: mine.length,
      occupancy: k.occupancy,
      rentRoll: k.rentRoll,
    };
  });
}

// --- cached relation-picker loaders --------------------------------------------

// Reuse one in-flight/recent fetch so a form with many pickers hits the DB once.
function cached(fn, ttl = 15000) {
  let at = 0;
  let promise = null;
  return () => {
    if (!promise || Date.now() - at > ttl) {
      at = Date.now();
      promise = Promise.resolve(fn()).catch(() => []);
    }
    return promise;
  };
}

export const loadPortfolioOptions = cached(async () =>
  ((await listPortfolios()) || []).map((p) => ({ value: p.id, label: p.name || "Untitled portfolio", patch: { portfolioName: p.name } })),
);

export const loadPropertyOptions = cached(async () =>
  ((await listProperties()) || []).map((p) => ({ value: p.id, label: p.name || "Untitled property", patch: { propertyName: p.name } })),
);

export const loadOwnerOptions = cached(async () =>
  ((await ownersLayer.list()) || []).map((o) => ({
    value: o.id,
    label: o.company ? `${o.name} · ${o.company}` : o.name || "Owner",
    patch: { ownerName: o.name },
  })),
);

export const loadUnitTypeOptions = cached(async () =>
  ((await listUnitTypes()) || []).map((t) => ({
    value: t.id,
    label: t.name || "Unit type",
    patch: {
      bedrooms: t.bedrooms,
      bathrooms: t.bathrooms,
      sqft: t.sqft ?? "",
      rent: t.marketRent || "",
      deposit: t.deposit || "",
    },
  })),
);

const bankLabel = (b) =>
  [b.name || "Account", b.bankName || b.bank, b.last4 ? `••${b.last4}` : null].filter(Boolean).join(" · ");

// Bank account picker; `nameKey` is the denormalized label stored next to the id.
export const bankAccountLoader = (nameKey) => {
  const base = cached(async () => (await bankAccountsLayer.list()) || []);
  return async () => (await base()).map((b) => ({ value: b.id, label: bankLabel(b), patch: { [nameKey]: b.name } }));
};

const glAccounts = cached(async () =>
  ((await glAccountsLayer.list()) || []).sort((a, b) => String(a.number).localeCompare(String(b.number))),
);
export const glAccountLoader = (nameKey) => async () =>
  (await glAccounts()).map((g) => ({
    value: g.id,
    label: [g.number, g.name].filter(Boolean).join(" · ") || "GL account",
    patch: { [nameKey]: g.name },
  }));

const team = cached(async () => (await teamMembersLayer.list()) || []);
export const teamLoader = (nameKey) => async () =>
  (await team()).map((m) => ({ value: m.id, label: m.role ? `${m.name} · ${m.role}` : m.name, patch: { [nameKey]: m.name } }));

export const loadVendorOptions = cached(async () =>
  ((await vendorsLayer.list()) || []).map((v) => ({
    value: v.id,
    label: v.specialty ? `${v.name} · ${v.specialty}` : v.name || "Vendor",
    patch: { name: v.name },
  })),
);

export const buildingLoaderFor = (propertyId) => async () =>
  ((await listBuildings()) || [])
    .filter((b) => !propertyId || b.propertyId === propertyId)
    .map((b) => ({ value: b.id, label: b.blockCode ? `${b.name} · ${b.blockCode}` : b.name || "Building" }));
