import { effectivePolicies } from "@/lib/policies";
import { indexAccounts, normalizeGlAccount, round2 } from "@/lib/ledger/postings";
import { addDays } from "@/lib/ledger/periods";
import { forProject } from "@/lib/supabase/scope";

// Month-end close checklist (CORE-40): each check runs for one period and returns { key, label, ok, count, link, detail }.
// Works with the browser client (RLS) and the service role alike; the close wizard and the month-end playbook both run it.

const PAGE = 1000;
const CHUNK = 150;
// A statement that cuts a few days before month end still reconciles the month.
export const STATEMENT_GRACE_DAYS = 7;

// key → label and the screen (nav title) that fixes it.
export const CLOSE_CHECKS = [
  { key: "unbalanced", label: "Every entry balances", link: "General Ledger" },
  { key: "missing_gl", label: "Every line has a GL account", link: "Chart of Accounts" },
  { key: "trust_negative", label: "No trust account is overdrawn", link: "Bank Accounts" },
  { key: "bank_reconciled", label: "Bank accounts reconciled through the period end", link: "Bank Reconciliation" },
  { key: "bills_pending", label: "No bills in the period wait for approval", link: "Bills & Payables" },
  { key: "management_fees", label: "Management fees posted for the month", link: "General Ledger" },
  { key: "recurring_posted", label: "Recurring charges posted", link: "Recurring Charges" },
  { key: "undeposited_funds", label: "Undeposited funds deposited", link: "Bank Accounts" },
];

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const usd = (n) => `$${(Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const OPEN_BANK = (b) => !["closed", "inactive"].includes(String(b.status || "").toLowerCase());

// Pure: the checklist from loaded data (see loadCloseCheckData) for { start, end, key }.
export function evaluateCloseChecks(data, period) {
  const acct = data.accounts || indexAccounts([]);
  const results = {};

  results.unbalanced = { count: data.unbalanced.length, detail: data.unbalanced.length ? `${plural(data.unbalanced.length, "entry", "entries")} on or before ${period.end} don't balance.` : "" };

  const missing = data.periodLines.filter((l) => !l.gl_account_id || !acct.byId.has(l.gl_account_id));
  results.missing_gl = { count: missing.length, detail: missing.length ? `${plural(missing.length, "line")} in the period point at no live GL account.` : "" };

  // Trust cash per account × property as of the period end (diagnose's granularity).
  const trust = new Map();
  for (const l of data.balanceLines) {
    const a = acct.byId.get(l.gl_account_id);
    if (!a || !a.isTrust || a.subtype !== "cash") continue;
    const key = `${a.id}|${l.property_id || ""}`;
    trust.set(key, round2((trust.get(key) || 0) + Number(l.debit || 0) - Number(l.credit || 0)));
  }
  const overdrawn = [...trust.values()].filter((b) => b < -0.004);
  results.trust_negative = { count: overdrawn.length, detail: overdrawn.length ? `${plural(overdrawn.length, "trust position")} below zero, ${usd(-overdrawn.reduce((s, b) => s + b, 0))} short.` : "" };

  const cutoff = addDays(period.end, -STATEMENT_GRACE_DAYS);
  const unreconciled = data.banks
    .filter((b) => OPEN_BANK(b) && data.bankActivity.has(b.id))
    .filter((b) => !data.reconciliations.some((r) => r.bank_account_id === b.id && String(r.status) === "Finalized" && String(r.statement_date || "") >= cutoff));
  results.bank_reconciled = { count: unreconciled.length, detail: unreconciled.length ? `Not reconciled through ${period.end}: ${unreconciled.map((b) => b.name || "Bank account").join(", ")}.` : "" };

  const pending = data.bills.filter((b) => b.approval_status === "Pending" && String(b.status || "") !== "Void" && (!b.bill_date || b.bill_date <= period.end));
  results.bills_pending = { count: pending.length, detail: pending.length ? `${plural(pending.length, "bill")} totalling ${usd(pending.reduce((s, b) => s + (Number(b.amount) || 0), 0))} still wait for approval.` : "" };

  const feesDue = data.fees.expected.filter((f) => !data.fees.posted.has(f.key));
  results.management_fees = { count: feesDue.length, detail: feesDue.length ? `${plural(feesDue.length, "property", "properties")} collected rent in ${period.key} without a management fee. Run the Management fees job.` : "" };

  const due = data.recurring.filter((r) => Number(r.amount) > 0 && r.next_date && r.next_date <= period.end && (!r.ends_on || r.ends_on >= r.next_date));
  results.recurring_posted = { count: due.length, detail: due.length ? `${plural(due.length, "recurring charge")} due by ${period.end} haven't posted. Run the Bill rent & charges job.` : "" };

  const undeposited = round2(data.undeposited);
  results.undeposited_funds = { count: Math.abs(undeposited) > 0.004 ? 1 : 0, detail: Math.abs(undeposited) > 0.004 ? `${usd(undeposited)} sits in Undeposited Funds at ${period.end}.` : "" };

  return CLOSE_CHECKS.map((c) => ({ key: c.key, label: c.label, link: c.link, ok: results[c.key].count === 0, count: results[c.key].count, detail: results[c.key].detail }));
}

async function allRows(build) {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().order("id").range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < PAGE) return out;
  }
}

const must = ({ data, error }, what) => {
  if (error) throw new Error(`${what}: ${error.message}`);
  return data || [];
};

// Expected mgmt:<property>:<YYYY-MM> keys from the period's collected rent (cash lines of payments) × the fee policy, as the job computes them.
async function managementFees(sb, projectId, period, acct, company) {
  const payments = await allRows(() =>
    forProject(sb.from("ledger_entries").select("id").is("deleted_at", null).eq("source_type", "payment").gte("entry_date", period.start).lte("entry_date", period.end), projectId),
  );
  const collected = new Map();
  for (let i = 0; i < payments.length; i += CHUNK) {
    const ids = payments.slice(i, i + CHUNK).map((p) => p.id);
    const lines = must(await forProject(sb.from("ledger_lines").select("gl_account_id, property_id, debit, credit").in("entry_id", ids).is("deleted_at", null), projectId), "payment lines");
    for (const l of lines) {
      if (!l.property_id || acct.byId.get(l.gl_account_id)?.subtype !== "cash") continue;
      collected.set(l.property_id, (collected.get(l.property_id) || 0) + Number(l.debit || 0) - Number(l.credit || 0));
    }
  }
  const ids = [...collected.keys()];
  const properties = new Map();
  for (let i = 0; i < ids.length; i += CHUNK) {
    for (const p of must(await forProject(sb.from("properties").select("id, metadata").in("id", ids.slice(i, i + CHUNK)), projectId), "properties")) properties.set(p.id, p);
  }
  const expected = [];
  for (const [propertyId, amount] of collected) {
    const policies = effectivePolicies({ company, property: properties.get(propertyId) || null });
    const fee = amount > 0 ? round2(Math.max((amount * (Number(policies.managementFeePct) || 0)) / 100, Number(policies.managementFeeMin) || 0)) : 0;
    if (fee > 0) expected.push({ propertyId, key: `mgmt:${propertyId}:${period.key}` });
  }
  const posted = new Set();
  for (let i = 0; i < expected.length; i += CHUNK) {
    const keys = expected.slice(i, i + CHUNK).map((f) => f.key);
    for (const e of must(await forProject(sb.from("ledger_entries").select("idempotency_key").in("idempotency_key", keys).is("deleted_at", null), projectId), "management fees")) posted.add(e.idempotency_key);
  }
  return { expected, posted };
}

// Everything evaluateCloseChecks reads for one project and period ({ start, end, key }).
export async function loadCloseCheckData(sb, projectId, period) {
  const scoped = (table, cols = "*") => forProject(sb.from(table).select(cols).is("deleted_at", null), projectId);
  const [accountRows, unbalanced, periodLines, banks, reconciliations, bills, recurring, settings] = await Promise.all([
    scoped("gl_accounts").then((r) => must(r, "accounts")),
    forProject(sb.from("ledger_unbalanced_entries").select("entry_id").lte("entry_date", period.end), projectId).then((r) => must(r, "unbalanced entries")),
    allRows(() => scoped("ledger_lines", "id, gl_account_id").gte("entry_date", period.start).lte("entry_date", period.end)),
    scoped("bank_accounts", "id, name, status").then((r) => must(r, "bank accounts")),
    scoped("bank_reconciliations", "id, bank_account_id, statement_date, status").eq("status", "Finalized").then((r) => must(r, "reconciliations")),
    scoped("bills", "id, amount, bill_date, status, approval_status").eq("approval_status", "Pending").then((r) => must(r, "bills")),
    scoped("recurring_charges", "id, amount, next_date, ends_on, status").eq("status", "Active").lte("next_date", period.end).then((r) => must(r, "recurring charges")),
    scoped("settings", "value").eq("key", "fees_policies").limit(1).then((r) => must(r, "settings")),
  ]);
  const accounts = indexAccounts(accountRows.map(normalizeGlAccount));
  const trustIds = accounts.list.filter((a) => a.isTrust && a.subtype === "cash").map((a) => a.id);
  const undepositedId = accounts.byKey.get("undeposited_funds")?.id || null;
  const balanceIds = [...new Set([...trustIds, undepositedId].filter(Boolean))];
  const balanceLines = balanceIds.length
    ? await allRows(() => scoped("ledger_lines", "id, gl_account_id, property_id, debit, credit").in("gl_account_id", balanceIds).lte("entry_date", period.end))
    : [];
  const undeposited = balanceLines.filter((l) => l.gl_account_id === undepositedId).reduce((s, l) => s + Number(l.debit || 0) - Number(l.credit || 0), 0);
  // Banks with any ledger activity by the period end are the ones that need a reconciliation.
  const bankActivity = new Set();
  for (const b of banks.filter(OPEN_BANK)) {
    const hit = must(await scoped("ledger_lines", "id").eq("bank_account_id", b.id).lte("entry_date", period.end).limit(1), "bank activity");
    if (hit.length) bankActivity.add(b.id);
  }
  const fees = await managementFees(sb, projectId, period, accounts, settings[0]?.value || {});
  return { accounts, unbalanced, periodLines, balanceLines, banks, bankActivity, reconciliations, bills, recurring, fees, undeposited };
}

// Run the checklist for one project and period ({ start, end, key }) → [{ key, label, ok, count, link, detail }].
export async function runCloseChecks(sb, projectId, period) {
  return evaluateCloseChecks(await loadCloseCheckData(sb, projectId, period), period);
}

// The checklist snapshot the close RPC stores: failing checks carry their override note.
export function checklistSnapshot(results, notes = {}) {
  return results.map((r) => ({ key: r.key, label: r.label, ok: r.ok, count: r.count, ...(r.ok ? {} : { note: String(notes[r.key] || "").trim() }) }));
}

// Failing checks still missing an override note.
export const missingOverrides = (results, notes = {}) => results.filter((r) => !r.ok && !String(notes[r.key] || "").trim());
