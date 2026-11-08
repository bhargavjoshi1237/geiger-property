import { IMPORT_ENTITIES, SOURCE_LABELS, SOURCE_SYSTEMS, importLabel } from "@/lib/data_io/import_spec";

// Lookups for Settings › Import & Export (PLAT-03).

export const IMPORT_KEY = "property.data.import";
export const NO_IMPORT = "Your role can't import data (Import data permission).";

export const ENTITY_OPTIONS = IMPORT_ENTITIES.map((value) => ({ value, label: importLabel(value) }));
export const SOURCE_OPTIONS = SOURCE_SYSTEMS.map((value) => ({ value, label: SOURCE_LABELS[value] }));

// The order a migration runs in: each import only refers to records the ones before it brought in.
export const MIGRATION_STEPS = [
  { entity: "properties", from: "Property directory" },
  { entity: "units", from: "Unit directory, or a rent roll" },
  { entity: "owners", from: "Owner directory with ownership %" },
  { entity: "vendors", from: "Vendor directory" },
  { entity: "leases", from: "Rent roll, then the tenant directory" },
  { entity: "open_balances", from: "Delinquency / aged receivables, deposit register, owner balances" },
  { entity: "gl_opening", from: "Trial balance as of the day before cutover" },
];

export const JOB_STATUS_MAP = {
  uploaded: { label: "Uploaded", variant: "neutral" },
  mapped: { label: "Mapped", variant: "neutral" },
  validated: { label: "Not imported", variant: "neutral" },
  committing: { label: "Importing", variant: "info" },
  committed: { label: "Imported", variant: "success" },
  failed: { label: "Stopped", variant: "danger" },
  rolled_back: { label: "Rolled back", variant: "outline" },
};

export const ROW_STATUS_MAP = {
  pending: { label: "Pending", variant: "neutral" },
  valid: { label: "Ready", variant: "success" },
  warning: { label: "Warning", variant: "warning" },
  error: { label: "Error", variant: "danger" },
  skipped: { label: "Skipped", variant: "neutral" },
  created: { label: "Created", variant: "success" },
  updated: { label: "Updated", variant: "info" },
  rolled_back: { label: "Rolled back", variant: "outline" },
};

export const ROW_FILTERS = [
  { value: "all", label: "All" },
  { value: "error", label: "Errors" },
  { value: "warning", label: "Warnings" },
  { value: "valid", label: "Ready" },
  { value: "skipped", label: "Skipped" },
];

export const DEDUPE_OPTIONS = [
  { value: "skip", label: "Skip records already in Geiger" },
  { value: "update", label: "Update them with the file's values" },
];

export const BALANCE_MODES = [
  { value: "forward", label: "Balance forward — one balance per lease (aging buckets kept)" },
  { value: "itemized", label: "Itemized — one open charge per row, with its date" },
];

// Table names → plural nouns for "creates 5 units, 4 tenants".
export const TABLE_NOUNS = {
  properties: ["property", "properties"],
  units: ["unit", "units"],
  owners: ["owner", "owners"],
  property_owners: ["ownership", "ownerships"],
  vendors: ["vendor", "vendors"],
  tenants: ["tenant", "tenants"],
  leases: ["lease", "leases"],
  lease_parties: ["lease party", "lease parties"],
  gl_accounts: ["account", "accounts"],
  conversion_lines: ["opening balance", "opening balances"],
};

export const countNoun = (table, n) => `${n.toLocaleString("en-US")} ${(TABLE_NOUNS[table] || [table, table])[n === 1 ? 0 : 1]}`;

// "creates 5 units and 4 tenants · updates 1 unit" from { [table]: { create, update } }.
export function writesSummary(writes = {}) {
  const make = Object.entries(writes).filter(([, w]) => w.create).map(([t, w]) => countNoun(t, w.create));
  const change = Object.entries(writes).filter(([, w]) => w.update).map(([t, w]) => countNoun(t, w.update));
  return [make.length ? `creates ${make.join(", ")}` : "", change.length ? `updates ${change.join(", ")}` : ""].filter(Boolean).join(" · ");
}
