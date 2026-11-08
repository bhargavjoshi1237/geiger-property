import { fetchAccounts } from "@/lib/ledger/store";
import { indexAccounts, normalizeEntry, normalizeLine } from "@/lib/ledger/postings";
import { ownershipIndex } from "@/lib/ledger/ownership";
import { forProject } from "@/lib/supabase/scope";
import { cashGrain, cashRow, openingLines, ownerTotals, totalsParams, totalsRow, windowParams } from "./aggregates";
import { dayBefore, dayOf } from "./periods";
import { fiscalYearRange, normalizeStartMonth } from "@/lib/ledger/periods";

// Ledger loaders for report sources (CORE-41), shared by the browser (signed-in client, active project) and the server (service
// role): the same calls, so the screen and a scheduled run read identical data. Each throws on failure; callers degrade.

const PAGE = 1000;
const TOTALS_ORDER = ["period", "gl_account_id", "property_id", "owner_id", "bank_account_id"];
const BALANCES_ORDER = ["gl_account_id", "property_id", "owner_id", "bank_account_id"];

const rpcError = (error) => Object.assign(new Error(error.message), { code: error.code });

// Every row of a set-returning RPC, page by page (PostgREST caps one response at 1000 rows).
export async function rpcAll(sb, fn, args, order = []) {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    let q = sb.rpc(fn, args);
    for (const col of order) q = q.order(col, { ascending: true, nullsFirst: false });
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) throw rpcError(error);
    out.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return out;
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

// Does the project have any live ledger line? Keeps "no ledger activity yet" distinct from an empty window.
export async function hasLedgerLines(sb, projectId) {
  const { data, error } = await forProject(sb.from("ledger_lines").select("id").is("deleted_at", null), projectId).limit(1);
  if (error) throw new Error(error.message);
  return Boolean(data?.length);
}

const totalsArgs = (projectId, p) => ({ p_project_id: projectId, p_property_ids: p.propertyIds });

// ledgerTotals source → { params, accounts, any, opening, period, cash }: opening = balances before `from` per account × property ×
// owner tag × bank; period = totals per period at the grain; cash = cash-flow rows when params.cash (not for an owner).
// With ownerId: that owner's whole-cent share (ownership.js), split per day then summed.
export async function loadLedgerTotals(sb, projectId, params = {}) {
  if (!projectId) throw new Error("A project is required for ledger totals.");
  const p = totalsParams(params);
  const base = totalsArgs(projectId, p);
  const totals = async () => {
    if (p.ownerId) {
      const [rows, owners] = await Promise.all([
        rpcAll(sb, "ledger_period_totals", { ...base, p_from: null, p_to: p.to, p_grain: "day", p_owner_id: p.ownerId }, TOTALS_ORDER),
        fetchAll(() => forProject(sb.from("property_owners").select("*").is("deleted_at", null), projectId).order("id")),
      ]);
      return ownerTotals(rows.map(totalsRow), p, ownershipIndex(owners));
    }
    const [opening, period] = await Promise.all([
      p.from ? rpcAll(sb, "ledger_balances_as_of", { ...base, p_as_of: dayBefore(p.from), p_owner_id: null }, BALANCES_ORDER) : [],
      rpcAll(sb, "ledger_period_totals", { ...base, p_from: p.from, p_to: p.to, p_grain: p.grain, p_owner_id: null }, TOTALS_ORDER),
    ]);
    return { opening: opening.map(totalsRow), period: period.map(totalsRow) };
  };
  const cash = p.cash && !p.ownerId ? rpcAll(sb, "ledger_cash_flow_totals", { ...base, p_from: p.from, p_to: p.to, p_grain: cashGrain(p.grain) }, ["period", "source_type"]) : null;
  const yearOf = dayOf(params.yearOf) && !p.ownerId ? dayOf(params.yearOf) : null;
  const [rows, accounts, any, cashRows, fiscal] = await Promise.all([totals(), fetchAccounts(sb, projectId), hasLedgerLines(sb, projectId), cash, yearOf ? fiscalYear(sb, projectId, base, yearOf) : null]);
  return { params: p, accounts: indexAccounts(accounts), any, opening: rows.opening, period: rows.period, cash: cashRows ? cashRows.map(cashRow) : null, ...(fiscal || {}) };
}

// The company fiscal-year start month (CORE-40: accounting_settings.fiscalYearStartMonth, January when unset); one year for every portfolio.
export async function loadFiscalStartMonth(sb, projectId) {
  const { data, error } = await forProject(sb.from("settings").select("value").eq("key", "accounting_settings").is("deleted_at", null), projectId).limit(1);
  if (error) throw new Error(error.message);
  return normalizeStartMonth(data?.[0]?.value?.fiscalYearStartMonth);
}

// Fiscal year of `yearOf` (CORE-40, params.yearOf): { fyStartMonth, yearStart, yearOpening } with the balances the day before the
// year starts, so the statements can roll earlier years into retained earnings (fiscalTotalsLines).
async function fiscalYear(sb, projectId, base, yearOf) {
  const fyStartMonth = await loadFiscalStartMonth(sb, projectId);
  const yearStart = fiscalYearRange(yearOf, fyStartMonth).start;
  const opening = await rpcAll(sb, "ledger_balances_as_of", { ...base, p_as_of: dayBefore(yearStart), p_owner_id: null }, BALANCES_ORDER);
  return { fyStartMonth, yearStart, yearOpening: opening.map(totalsRow) };
}

// Lines with their entry (live entries only) and account, oldest first (date, posting order, then id so ties never reorder).
async function windowLines(sb, projectId, p, glIds, accounts) {
  if ((p.propertyIds && !p.propertyIds.length) || (glIds && !glIds.length)) return [];
  const rows = await fetchAll(() => {
    let q = forProject(sb.from("ledger_lines").select("*").is("deleted_at", null), projectId);
    if (p.from) q = q.gte("entry_date", p.from);
    if (p.to) q = q.lte("entry_date", p.to);
    if (p.propertyIds) q = q.in("property_id", p.propertyIds);
    if (glIds) q = q.in("gl_account_id", glIds);
    return q.order("entry_date", { ascending: true }).order("created_at", { ascending: true }).order("line_no", { ascending: true }).order("id", { ascending: true });
  });
  const lines = rows.map(normalizeLine);
  const entryIds = [...new Set(lines.map((l) => l.entryId).filter(Boolean))];
  const entries = new Map();
  for (let i = 0; i < entryIds.length; i += 150) {
    const { data, error } = await sb.from("ledger_entries").select("*").in("id", entryIds.slice(i, i + 150)).is("deleted_at", null);
    if (error) throw new Error(error.message);
    for (const e of data || []) entries.set(e.id, normalizeEntry(e));
  }
  return lines.map((l) => ({ ...l, entry: entries.get(l.entryId) || null, account: accounts.byId.get(l.glAccountId) || null }));
}

// Bounded `ledger` source → { lines, accounts, any, params }: the lines dated in [from, to] (optionally on some properties or account
// subtypes) plus, with `opening`, synthetic opening lines (balances before `from`) so openings and running balances stay exact.
export async function loadLedgerWindow(sb, projectId, params = {}) {
  if (!projectId) throw new Error("A project is required for the ledger.");
  const p = windowParams(params);
  const accounts = indexAccounts(await fetchAccounts(sb, projectId));
  const glIds = p.subtypes ? accounts.list.filter((a) => p.subtypes.includes(a.subtype)).map((a) => a.id) : null;
  const inScope = (r) => !glIds || glIds.includes(r.glAccountId);
  const [lines, any, opening] = await Promise.all([
    windowLines(sb, projectId, p, glIds, accounts),
    hasLedgerLines(sb, projectId),
    p.opening && p.from ? rpcAll(sb, "ledger_balances_as_of", { ...totalsArgs(projectId, p), p_as_of: dayBefore(p.from), p_owner_id: null }, BALANCES_ORDER) : [],
  ]);
  return { lines: [...openingLines(opening.map(totalsRow).filter(inScope), p.from, accounts), ...lines], accounts, any, params: p };
}
