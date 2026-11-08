// What an import plan writes (PLAT-03), shared by the server engine and the playground's in-memory import: the tables each
// import reads, the order writes go in, and summaries of a plan's results.

// Write order: an entity only refers to ones written before it.
export const WRITE_ORDER = ["gl_accounts", "properties", "units", "owners", "property_owners", "vendors", "tenants", "leases", "lease_parties"];

// The records each import resolves against.
export const IMPORT_NEEDS = {
  properties: ["properties", "portfolios"],
  units: ["properties", "units", "buildings", "unit_types", "floor_plans"],
  owners: ["owners", "properties", "property_owners"],
  vendors: ["vendors"],
  tenants: ["tenants", "units", "properties"],
  leases: ["properties", "units", "tenants", "leases", "lease_parties"],
  open_balances: ["properties", "units", "tenants", "leases", "owners", "gl_accounts", "bank_accounts"],
  gl_opening: ["gl_accounts", "properties", "bank_accounts"],
};

// Planned writes per table → { [table]: { create, update } }.
export function plannedWrites(results) {
  const out = {};
  for (const r of results) {
    if (r.status === "error") continue;
    for (const op of r.ops) {
      const t = (out[op.table] ||= { create: 0, update: 0 });
      t[op.op === "insert" ? "create" : "update"] += 1;
    }
    if (r.lines.length) (out.conversion_lines ||= { create: 0, update: 0 }).create += r.lines.length;
  }
  return out;
}

// A result as the review lists it.
export const rowView = (rec, r) => ({ rowNo: r.rowNo, status: r.status, messages: r.messages, primary: r.primary ? { table: r.primary.table, action: r.primary.action } : null, mapped: rec.mapped });

// A row's status once its writes are made.
export const committedStatus = (r) => {
  if (r.status === "error") return "error";
  if (r.ops.some((o) => o.op === "insert") || r.lines.length || r.primary?.action === "create") return "created";
  if (r.ops.length) return "updated";
  return "skipped";
};
