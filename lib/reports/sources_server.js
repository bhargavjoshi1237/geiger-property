import { groupByOwner } from "@/lib/compliance";
import { indexAccounts, normalizeEntry, normalizeLine } from "@/lib/ledger/postings";
import { fetchAccounts } from "@/lib/ledger/store";

// Server loaders for report sources (service-role client pinned to the
// `property` schema). Rows are camelized with metadata keys spread first, the
// same view-model shape the browser data layers return. Throws on failure.

const PAGE = 1000;

const camel = (k) => k.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());

export function camelize(row) {
  if (!row) return null;
  const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const out = {};
  for (const [k, v] of Object.entries(row)) out[camel(k)] = v;
  out.metadata = meta;
  return { ...meta, ...out };
}

// Project rows plus legacy unscoped ones (mirrors the browser scopeQuery).
const scope = (q, projectId) => (projectId ? q.or(`project_id.eq.${projectId},project_id.is.null`) : q.is("project_id", null));

async function fetchAll(build) {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

const table = (name) => async (admin, projectId) =>
  (await fetchAll(() => scope(admin.from(name).select("*").is("deleted_at", null), projectId).order("created_at"))).map(camelize);

async function ledger(admin, projectId) {
  const [lineRows, entryRows, accountRows] = await Promise.all([
    fetchAll(() => scope(admin.from("ledger_lines").select("*").is("deleted_at", null), projectId).order("entry_date").order("line_no")),
    fetchAll(() => scope(admin.from("ledger_entries").select("*").is("deleted_at", null), projectId).order("entry_date")),
    fetchAccounts(admin, projectId || null),
  ]);
  const entries = new Map(entryRows.map((r) => [r.id, normalizeEntry(r)]));
  const accounts = indexAccounts(accountRows);
  const lines = lineRows.map((r) => {
    const l = normalizeLine(r);
    return { ...l, entry: entries.get(l.entryId) || null, account: accounts.byId.get(l.glAccountId) || null };
  });
  return { lines, accounts };
}

async function compliance(admin, projectId) {
  const rows = (await table("record_items")(admin, projectId)).filter((r) => ["insurance_policy", "license"].includes(r.kind));
  const pick = (ownerType, kind) => groupByOwner(rows.filter((r) => r.ownerType === ownerType && r.kind === kind));
  return {
    tenantInsurance: pick("tenant", "insurance_policy"),
    vendorCoi: pick("vendor", "insurance_policy"),
    vendorLicense: pick("vendor", "license"),
  };
}

export const SERVER_SOURCES = {
  ledger,
  properties: table("properties"),
  units: table("units"),
  leases: table("leases"),
  tenants: table("tenants"),
  owners: table("owners"),
  vendors: table("vendors"),
  propertyOwners: table("property_owners"),
  workOrders: table("work_orders"),
  deposits: table("security_deposits"),
  bankAccounts: table("bank_accounts"),
  prospects: table("prospects"),
  showings: table("showings"),
  applications: table("applications"),
  renewals: table("renewals"),
  compliance,
};

// Load a report's sources for one project; `cache` (a Map) shares loads across
// several schedules of the same project in one job run.
export async function loadServerSources(admin, projectId, keys, cache = new Map()) {
  const wanted = [...new Set(["properties", ...keys])];
  const out = {};
  for (const k of wanted) {
    const ck = `${projectId || ""}:${k}`;
    if (!cache.has(ck)) cache.set(ck, SERVER_SOURCES[k] ? SERVER_SOURCES[k](admin, projectId) : Promise.resolve([]));
    out[k] = await cache.get(ck);
  }
  return out;
}
