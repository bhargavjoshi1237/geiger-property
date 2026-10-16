"use client";

import { createClient } from "./client";
import { isSupabaseConfigured } from "@/supabase/components/property-client";
import { getActiveProjectId, scopeQuery } from "./project_scope";
import { getUser } from "./user";
import { bankAccountsLayer } from "./bank_accounts";
import { propertyOwnersLayer } from "./property_owners";
import {
  BUILDERS,
  DIMENSIONS,
  allocateOldestFirst,
  diagnose,
  indexAccounts,
  normalizeEntry,
  normalizeLine,
  openItems,
  summarize,
} from "@/lib/ledger/postings";
import { ensureChart, fetchAccounts, loadAccountIndex, postBuilt, voidPosted } from "@/lib/ledger/store";

// Data-access layer for the double-entry general ledger (owns
// `property.ledger_entries` + `property.ledger_lines`). Every posting goes
// through the balanced `property.ledger_post` RPC; voids post a reversal via
// `property.ledger_void`. Pure: null / [] / false on failure, console.error,
// never throw or toast — the last failure reason is readable through
// ledgerErrorMessage() so a screen can show it.

const PAGE = 1000;
let lastError = "";

const fail = (tag, e) => {
  lastError = e?.message || String(e || "Unknown error");
  console.error(`[ledger.${tag}]`, lastError);
  return null;
};

// Human-readable reason for the last failed ledger call ("" when none).
export const ledgerErrorMessage = () => lastError;

// --- Accounts -----------------------------------------------------------------

let accountCache = { projectId: undefined, at: 0, idx: null };
const ACCOUNT_TTL = 30 * 1000;

export function invalidateLedgerAccounts() {
  accountCache = { projectId: undefined, at: 0, idx: null };
}

// Account index ({ byId, byKey, list }), seeding the default chart if needed.
export async function getLedgerAccounts({ fresh = false } = {}) {
  if (!isSupabaseConfigured()) return null;
  const projectId = getActiveProjectId();
  const now = Date.now();
  if (!fresh && accountCache.idx && accountCache.projectId === projectId && now - accountCache.at < ACCOUNT_TTL) {
    return accountCache.idx;
  }
  try {
    const idx = await loadAccountIndex(createClient(), projectId || undefined);
    accountCache = { projectId, at: now, idx };
    return idx;
  } catch (e) {
    return fail("accounts", e);
  }
}

// Plain account index without seeding (for read-only screens).
export async function listLedgerAccounts() {
  if (!isSupabaseConfigured()) return null;
  try {
    return indexAccounts(await fetchAccounts(createClient(), getActiveProjectId() || undefined));
  } catch (e) {
    return fail("listAccounts", e);
  }
}

// Seed the project's default chart of accounts (idempotent) → accounts inserted.
export async function ensureDefaultChart() {
  if (!isSupabaseConfigured()) return null;
  try {
    const n = await ensureChart(createClient(), getActiveProjectId());
    invalidateLedgerAccounts();
    return n;
  } catch (e) {
    return fail("ensureChart", e);
  }
}

// --- Reads ----------------------------------------------------------------------

// Filters: { leaseId, tenantId, ownerId, vendorId, propertyId, unitId,
// bankAccountId, jobId, glAccountId, entryId, reconciliationId, hasJob, from, to }.
function applyLineFilters(q, f = {}) {
  for (const [k, col] of Object.entries(DIMENSIONS)) if (f[k]) q = q.eq(col, f[k]);
  if (f.hasJob) q = q.not("job_id", "is", null);
  if (f.glAccountId) q = q.eq("gl_account_id", f.glAccountId);
  if (f.entryId) q = q.eq("entry_id", f.entryId);
  if (f.reconciliationId) q = q.eq("reconciliation_id", f.reconciliationId);
  if (f.from) q = q.gte("entry_date", f.from);
  if (f.to) q = q.lte("entry_date", f.to);
  return q;
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

async function fetchLines(sb, filters) {
  const rows = await fetchAll(() =>
    applyLineFilters(scopeQuery(sb.from("ledger_lines").select("*").is("deleted_at", null)), filters)
      .order("entry_date", { ascending: true })
      .order("created_at", { ascending: true })
      .order("line_no", { ascending: true }),
  );
  return rows.map(normalizeLine);
}

async function fetchEntriesByIds(sb, ids) {
  const out = [];
  const unique = [...new Set(ids.filter(Boolean))];
  for (let i = 0; i < unique.length; i += 150) {
    const { data, error } = await sb.from("ledger_entries").select("*").in("id", unique.slice(i, i + 150));
    if (error) throw new Error(error.message);
    out.push(...(data || []));
  }
  return out.map(normalizeEntry);
}

// Lines enriched with their entry (status, memo, source) and account.
async function linesWithEntries(sb, filters) {
  const lines = await fetchLines(sb, filters);
  const entries = await fetchEntriesByIds(sb, lines.map((l) => l.entryId));
  const byId = new Map(entries.map((e) => [e.id, e]));
  return lines.map((l) => ({ ...l, entry: byId.get(l.entryId) || null }));
}

// Ledger lines for a scope, each with `entry` + `account` attached, oldest first.
export async function listLedger(filters = {}) {
  if (!isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const [lines, accounts] = await Promise.all([linesWithEntries(sb, filters), listLedgerAccounts()]);
    return lines.map((l) => ({ ...l, account: accounts?.byId.get(l.glAccountId) || null }));
  } catch (e) {
    return fail("list", e);
  }
}

// Entries (newest first) with their lines. Filters: { from, to, sourceType,
// sourceId, status, propertyId, leaseId, tenantId, ownerId, vendorId, limit }.
export async function listLedgerEntries(filters = {}) {
  if (!isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    let q = scopeQuery(sb.from("ledger_entries").select("*").is("deleted_at", null));
    for (const k of ["propertyId", "unitId", "leaseId", "tenantId", "ownerId", "vendorId"]) {
      if (filters[k]) q = q.eq(DIMENSIONS[k], filters[k]);
    }
    if (filters.sourceType) q = q.eq("source_type", filters.sourceType);
    if (filters.sourceId) q = q.eq("source_id", filters.sourceId);
    if (filters.status) q = q.eq("status", filters.status);
    if (filters.from) q = q.gte("entry_date", filters.from);
    if (filters.to) q = q.lte("entry_date", filters.to);
    q = q.order("entry_date", { ascending: false }).order("created_at", { ascending: false });
    const { data, error } = await q.limit(filters.limit || 500);
    if (error) throw new Error(error.message);
    const entries = (data || []).map(normalizeEntry);
    const lines = [];
    const ids = entries.map((e) => e.id);
    for (let i = 0; i < ids.length; i += 150) {
      const res = await sb.from("ledger_lines").select("*").in("entry_id", ids.slice(i, i + 150)).is("deleted_at", null);
      if (res.error) throw new Error(res.error.message);
      lines.push(...(res.data || []).map(normalizeLine));
    }
    const byEntry = new Map();
    for (const l of lines) byEntry.set(l.entryId, [...(byEntry.get(l.entryId) || []), l]);
    return entries.map((e) => ({ ...e, lines: (byEntry.get(e.id) || []).sort((a, b) => a.lineNo - b.lineNo) }));
  } catch (e) {
    return fail("entries", e);
  }
}

export async function getLedgerEntry(id) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const { data, error } = await sb.from("ledger_entries").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const res = await sb.from("ledger_lines").select("*").eq("entry_id", id).is("deleted_at", null).order("line_no");
    if (res.error) throw new Error(res.error.message);
    return { ...normalizeEntry(data), lines: (res.data || []).map(normalizeLine) };
  } catch (e) {
    return fail("get", e);
  }
}

// Balances for a scope (same filters as listLedger; `asOf` caps the date):
// { receivable, payable, depositsHeld, prepaid, trustCash, operatingCash, cash,
//   income, expense, net, contributions, distributions, byAccount[] }.
export async function ledgerBalances(filters = {}) {
  if (!isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const [lines, accounts] = await Promise.all([
      fetchLines(sb, { ...filters, to: filters.asOf || filters.to }),
      listLedgerAccounts(),
    ]);
    return summarize(lines, accounts || indexAccounts([]));
  } catch (e) {
    return fail("balances", e);
  }
}
export const balances = ledgerBalances;

// Receivable balance per lease (or tenant) across the project: Map id → amount.
export async function receivableByParty(dimension = "leaseId") {
  if (!isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const accounts = await listLedgerAccounts();
    const ar = (accounts?.list || []).filter((a) => a.subtype === "receivable").map((a) => a.id);
    if (!ar.length) return new Map();
    const col = DIMENSIONS[dimension];
    const rows = await fetchAll(() =>
      scopeQuery(sb.from("ledger_lines").select(`${col}, debit, credit`).is("deleted_at", null))
        .in("gl_account_id", ar)
        .not(col, "is", null),
    );
    const out = new Map();
    for (const r of rows) out.set(r[col], (out.get(r[col]) || 0) + (Number(r.debit) || 0) - (Number(r.credit) || 0));
    for (const [k, v] of out) out.set(k, Math.round(v * 100) / 100);
    return out;
  } catch (e) {
    return fail("receivableByParty", e);
  }
}

// Open receivable items for a lease (or tenant), oldest first:
// [{ entryId, date, memo, sourceType, amount, paid, open }].
export async function listOpenCharges({ leaseId, tenantId } = {}) {
  if (!isSupabaseConfigured() || (!leaseId && !tenantId)) return null;
  try {
    const sb = createClient();
    const [lines, accounts] = await Promise.all([
      linesWithEntries(sb, leaseId ? { leaseId } : { tenantId }),
      listLedgerAccounts(),
    ]);
    return openItems(lines, accounts || indexAccounts([]), "receivable");
  } catch (e) {
    return fail("openCharges", e);
  }
}

// Open payable items (unpaid bill entries) for a vendor or one bill source.
export async function listOpenBills({ vendorId, billId } = {}) {
  if (!isSupabaseConfigured() || (!vendorId && !billId)) return null;
  try {
    const sb = createClient();
    const [lines, accounts] = await Promise.all([
      linesWithEntries(sb, vendorId ? { vendorId } : {}),
      listLedgerAccounts(),
    ]);
    const scoped = billId ? lines.filter((l) => l.entry?.sourceId === billId || l.appliesToEntryId) : lines;
    const items = openItems(scoped, accounts || indexAccounts([]), "payable");
    return billId ? items.filter((i) => i.sourceId === billId) : items;
  } catch (e) {
    return fail("openBills", e);
  }
}

// Ledger health: unbalanced entries, lines without a valid GL account, and
// trust cash positions (account × owner × property) that went negative.
export async function ledgerHealth(filters = {}) {
  if (!isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const [lines, accounts] = await Promise.all([fetchLines(sb, filters), listLedgerAccounts()]);
    const entries = await fetchAll(() =>
      scopeQuery(sb.from("ledger_entries").select("*").is("deleted_at", null)).order("entry_date"),
    );
    return diagnose(entries.map(normalizeEntry), lines, accounts || indexAccounts([]));
  } catch (e) {
    return fail("health", e);
  }
}

// --- Writes ----------------------------------------------------------------------

const ownerCache = new Map();

// Primary (else first) owner of a property, cached for the session.
async function ownerOfProperty(propertyId) {
  if (!propertyId) return "";
  if (ownerCache.has(propertyId)) return ownerCache.get(propertyId);
  const rows = (await propertyOwnersLayer.list({ propertyId })) || [];
  const owner = (rows.find((r) => r.isPrimary) || rows[0])?.ownerId || "";
  ownerCache.set(propertyId, owner);
  return owner;
}

const BANK_TYPE_KEY = { Trust: "trust_cash", "Security deposit": "deposit_cash", Operating: "operating_cash", Reserve: "operating_cash" };

// Cash GL for a bank account: its linked GL, else the system account for its type.
async function cashAccountFor(bankAccountId, accounts) {
  if (!bankAccountId) return "";
  const bank = await bankAccountsLayer.get(bankAccountId);
  if (!bank) return "";
  if (bank.glAccountId && accounts.byId.has(bank.glAccountId)) return bank.glAccountId;
  return accounts.byKey.get(BANK_TYPE_KEY[bank.accountType] || "operating_cash")?.id || "";
}

// Shared posting pipeline: resolve accounts/owner/cash, build, post.
async function post(type, input) {
  if (!isSupabaseConfigured()) return null;
  try {
    lastError = "";
    const accounts = await getLedgerAccounts();
    if (!accounts) return null;
    const enriched = { date: new Date().toISOString().slice(0, 10), ...input };
    if (!enriched.ownerId && enriched.propertyId) enriched.ownerId = await ownerOfProperty(enriched.propertyId);
    if (enriched.bankAccountId && !enriched.cashGlAccountId) {
      enriched.cashGlAccountId = await cashAccountFor(enriched.bankAccountId, accounts);
    }
    if (enriched.toBankAccountId && !enriched.toCashGlAccountId) {
      enriched.toCashGlAccountId = await cashAccountFor(enriched.toBankAccountId, accounts);
    }
    const built = BUILDERS[type](enriched, accounts);
    if (built.error) return fail(type, built.error);
    const user = await getUser();
    const entryId = await postBuilt(createClient(), built, { projectId: getActiveProjectId(), createdBy: user?.id });
    return { entryId, allocations: built.allocations || [], unapplied: built.unapplied || 0 };
  } catch (e) {
    return fail(type, e);
  }
}

// Allocate oldest-first unless the caller passed explicit allocations.
async function withAllocations(input) {
  if (Array.isArray(input.allocations)) return input;
  const items = (await listOpenCharges({ leaseId: input.leaseId, tenantId: input.leaseId ? "" : input.tenantId })) || [];
  return { ...input, allocations: allocateOldestFirst(items, input.amount).allocations };
}

// Generic: post any builder type ("charge", "payment", …, "adjustment").
export const postEntry = (type, input) => (BUILDERS[type] ? post(type, input) : Promise.resolve(fail("post", `Unknown posting type ${type}`)));

// Charge → Dr AR / Cr income (glAccountId, default Rental Income).
export const postCharge = (input) => post("charge", input);
// Late fee → Dr AR / Cr Late Fee Income.
export const postLateFee = (input) => post("late_fee", input);
// Payment → Dr cash / Cr AR, allocated oldest-first (or input.allocations).
export async function postPayment(input) {
  if (!isSupabaseConfigured()) return null;
  return post("payment", await withAllocations(input));
}
// Credit → Dr concessions (or glAccountId) / Cr AR, allocated like a payment.
export async function postCredit(input) {
  if (!isSupabaseConfigured()) return null;
  return post("credit", input.appliesToEntryId
    ? { ...input, allocations: [{ entryId: input.appliesToEntryId, amount: input.amount }] }
    : await withAllocations(input));
}
// Bill → Dr expense line(s) / Cr AP.
export const postBill = (input) => post("bill", input);
// Bill payment → Dr AP (applied to billEntryId) / Cr cash.
export const payBill = (input) => post("bill_payment", input);
export const postDistribution = (input) => post("distribution", input);
export const postContribution = (input) => post("contribution", input);
export const postManagementFee = (input) => post("management_fee", input);
export const postDepositHeld = (input) => post("deposit_held", input);
export const postDepositReturn = (input) => post("deposit_return", input);
export const postDepositInterest = (input) => post("deposit_interest", input);
// Cash-basis income/expense/transfer: { direction: "in"|"out"|"transfer",
// amount, glAccountId, bankAccountId, toBankAccountId, … }.
export const postCashTransaction = (input) => post("cash", input);
// Manual journal entry: { date, memo, lines: [{ glAccountId, debit, credit, memo, …dims }] }.
export const postJournal = (input) => post("adjustment", input);

// Void an entry (posts its reversal) → { entryId: reversalId } or null.
export async function voidEntry(id, { date, memo } = {}) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    lastError = "";
    const reversal = await voidPosted(createClient(), id, { date, memo });
    return { entryId: reversal };
  } catch (e) {
    return fail("void", e);
  }
}

// Mark lines cleared/uncleared for bank reconciliation → true / false.
export async function setLinesCleared(lineIds, { cleared = true, clearedOn = null, reconciliationId = null } = {}) {
  if (!lineIds?.length || !isSupabaseConfigured()) return false;
  try {
    const sb = createClient();
    for (let i = 0; i < lineIds.length; i += 150) {
      const { error } = await sb
        .from("ledger_lines")
        .update({
          cleared,
          cleared_on: cleared ? clearedOn || new Date().toISOString().slice(0, 10) : null,
          reconciliation_id: cleared ? reconciliationId : null,
        })
        .in("id", lineIds.slice(i, i + 150));
      if (error) throw new Error(error.message);
    }
    return true;
  } catch (e) {
    fail("cleared", e);
    return false;
  }
}
