import { groupByOwner } from "@/lib/compliance";
import { indexAccounts, normalizeEntry, normalizeLine } from "@/lib/ledger/postings";
import { fetchAccounts } from "@/lib/ledger/store";
import { forProject } from "@/lib/supabase/scope";
import { loadLedgerTotals, loadLedgerWindow } from "./ledger_load";
import { paramsKey } from "./source_params";
import { redactSensitive } from "@/lib/screening/sensitive";

// Server loaders for report sources (service-role client pinned to the
// `property` schema). Rows are camelized with metadata keys spread first, the
// same view-model shape the browser data layers return. One project's rows only; throws on failure or without a project.
// Rows pass the screening deny-list (RISK-02): identity numbers and screening results never reach a report or its exports.
// Every loader is (admin, projectId, params); only ledger and ledgerTotals read params (CORE-41).

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
  (await fetchAll(() => forProject(admin.from(name).select("*").is("deleted_at", null), projectId).order("created_at"))).map((r) => redactSensitive(camelize(r)));

// The whole ledger; with params, the same bounded window the browser loads (ledger_load.js).
async function ledger(admin, projectId, params) {
  if (params) return loadLedgerWindow(admin, projectId, params);
  const [lineRows, entryRows, accountRows] = await Promise.all([
    fetchAll(() => forProject(admin.from("ledger_lines").select("*").is("deleted_at", null), projectId).order("entry_date").order("line_no")),
    fetchAll(() => forProject(admin.from("ledger_entries").select("*").is("deleted_at", null), projectId).order("entry_date")),
    fetchAccounts(admin, projectId),
  ]);
  const entries = new Map(entryRows.map((r) => [r.id, normalizeEntry(r)]));
  const accounts = indexAccounts(accountRows);
  const lines = lineRows.map((r) => {
    const l = normalizeLine(r);
    return { ...l, entry: entries.get(l.entryId) || null, account: accounts.byId.get(l.glAccountId) || null };
  });
  return { lines, accounts };
}

// Automation runs from the last 30 days (signals look for repeat failures).
async function automationRuns(admin, projectId) {
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  return (await fetchAll(() => forProject(admin.from("automation_runs").select("*").is("deleted_at", null).gte("started_at", since), projectId).order("started_at"))).map(camelize);
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
  ledgerTotals: loadLedgerTotals,
  properties: table("properties"),
  portfolios: table("portfolios"),
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
  bills: table("bills"),
  moves: table("moves"),
  unitTurns: table("unit_turns"),
  budgets: table("budgets"),
  budgetLines: table("budget_lines"),
  bankReconciliations: table("bank_reconciliations"),
  rentAccounts: table("rent_accounts"),
  automationRuns,
  compliance,
};

// Load a report's sources for one project; `cache` (a Map) shares loads across several schedules of the same project in one
// job run, keyed by each source's params (`params` is { [sourceKey]: params }, from a definition's sourceParams).
export async function loadServerSources(admin, projectId, keys, cache = new Map(), params = {}) {
  const wanted = [...new Set(["properties", ...keys])];
  const out = {};
  for (const k of wanted) {
    const ck = `${projectId || ""}:${k}:${paramsKey(params[k])}`;
    if (!cache.has(ck)) cache.set(ck, SERVER_SOURCES[k] ? SERVER_SOURCES[k](admin, projectId, params[k]) : Promise.resolve([]));
    out[k] = await cache.get(ck);
  }
  return out;
}
