import { listBuildings } from "@/lib/supabase/buildings";
import { listUnitTypes } from "@/lib/supabase/unit_types";
import { listFloorPlans } from "@/lib/supabase/floor_plans";
import { listTenants } from "@/lib/supabase/tenants";

// Shared lookups, formatters, and option loaders for the Units area.

export const UNIT_STATUS_MAP = {
  Occupied: { label: "Occupied", variant: "success" },
  Vacant: { label: "Vacant", variant: "info" },
  Notice: { label: "Notice", variant: "warning" },
  "Make-ready": { label: "Make-ready", variant: "purple" },
  Down: { label: "Down", variant: "danger" },
  "Non-revenue": { label: "Non-revenue", variant: "outline" },
  Draft: { label: "Draft", variant: "neutral" },
};

export const filterOptions = (map, allLabel = "All statuses") => [
  { value: "all", label: allLabel },
  ...Object.entries(map).map(([value, v]) => ({ value, label: v.label })),
];

export const selectOptions = (map) =>
  Object.entries(map).map(([value, v]) => ({ value, label: v.label }));

export const toOptions = (labels) => labels.map((l) => ({ value: l, label: l }));

export const currency = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(
    Number(n) || 0,
  );

export const formatDate = (v) => {
  if (!v) return "—";
  const d = new Date(String(v).length <= 10 ? `${v}T00:00:00` : v);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// Whole days from a date until today (null when unset).
export const daysSince = (v) => {
  if (!v) return null;
  const d = new Date(String(v).length <= 10 ? `${v}T00:00:00` : v);
  if (Number.isNaN(d.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
};

// Signed whole days from today until a date (null when unset).
export const daysUntil = (v) => {
  if (!v) return null;
  const d = new Date(String(v).length <= 10 ? `${v}T00:00:00` : v);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
};

export const specs = (u) =>
  [u.bedrooms ? `${u.bedrooms} bd` : null, u.bathrooms ? `${u.bathrooms} ba` : null, u.sqft ? `${u.sqft} sqft` : null]
    .filter(Boolean)
    .join(" · ");

// Live lease statuses (the unit's current occupancy).
export const LIVE_LEASE = ["Active", "Expiring soon", "Notice"];
export const isRevenue = (u) => u.status !== "Non-revenue" && !u.nonRevenue;

// Random 6-digit access code.
export const randomCode = () => String(Math.floor(100000 + Math.random() * 900000));

export const NON_REVENUE_TYPES = toOptions(["Model", "Office", "Down", "Storage", "Employee", "Guest suite"]);
export const DOWN_REASONS = toOptions(["Renovation", "Damage", "Pest treatment", "Legal hold", "Code violation", "Other"]);
export const READY_OPTIONS = toOptions(["Not ready", "In progress", "Ready"]);
export const RENT_REASONS = toOptions(["Market adjustment", "Turnover", "Renovation premium", "Concession ended", "Seasonal", "Other"]);

export const FEATURE_OPTIONS = toOptions([
  "Air conditioning",
  "Dishwasher",
  "In-unit washer/dryer",
  "W/D hookups",
  "Fireplace",
  "Hardwood floors",
  "Balcony / patio",
  "Garage parking",
  "Fenced yard",
  "Walk-in closets",
  "Stainless appliances",
  "Ceiling fans",
  "High ceilings",
  "Smart thermostat",
]);

export const UTILITY_OPTIONS = toOptions(["Water", "Sewer", "Trash", "Gas", "Electric", "Internet", "Cable", "Heat"]);

// Relation-picker loaders → [{ value, label, patch }].
export async function buildingOptions() {
  const rows = (await listBuildings()) ?? [];
  return rows.map((b) => ({
    value: b.id,
    label: b.blockCode ? `${b.name} · ${b.blockCode}` : b.name || "Building",
    patch: {},
  }));
}

export async function unitTypeOptions() {
  const rows = (await listUnitTypes()) ?? [];
  return rows.map((t) => ({ value: t.id, label: t.name || "Unit type", patch: {} }));
}

export async function floorPlanOptions() {
  const rows = (await listFloorPlans()) ?? [];
  return rows.map((p) => ({ value: p.id, label: p.name || "Floor plan", patch: {} }));
}

// Tenant picker writing the unit's occupant_name display column alongside the id.
export async function occupantOptions() {
  const rows = (await listTenants()) ?? [];
  return rows.map((t) => ({ value: t.id, label: t.name || "Tenant", patch: { occupantName: t.name || "" } }));
}
