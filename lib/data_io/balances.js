import { CONVERSION_CLEARING_KEY, accountLabel, indexAccounts, isDebitNormal, normalizeGlAccount, round2 } from "@/lib/ledger/postings";
import { openingDate, planTrialBalance, validateBatch } from "@/lib/ledger/conversion";
import { DEPOSIT_TYPES } from "./import_spec";
import { importRowId } from "./ids";
import { planEntry } from "./index";
import { normKey, normName } from "./values";

// Balance imports (PLAT-03) → INTL-04 conversion lines, never a posting path of their own. Opening balances become tenant
// balances / credits / deposits / owner balances; a trial balance becomes GL balances, with receivables, payables, deposits,
// prepaid and trust cash held back as tie-out targets (the subledger rows fill those accounts). Pure.

const LIVE = ["Active", "Expiring soon", "Month-to-month", "Notice given", "Eviction"];
// Accounts a trial balance only ties out against: INTL-04 fills them from the subledger kinds.
const TIE_OUT_SUBTYPES = { receivable: "tenant balances", subsidy_receivable: "tenant balances", payable: "unpaid bills", deposits: "deposits held", prepaid: "tenant credits" };
const DEFAULT_SUBTYPE = { Asset: "other_asset", Liability: "other_liability", Equity: "equity", Income: "income", Expense: "expense" };
const TYPE_BY_DIGIT = { 1: "Asset", 2: "Liability", 3: "Equity", 4: "Income", 5: "Expense", 6: "Expense", 7: "Expense", 8: "Expense", 9: "Expense" };
// Representative charge dates per aging bucket, days before the opening date, so the aging report reproduces the source's buckets.
const BUCKETS = [
  ["age_0_30", 15, "0–30 days"],
  ["age_31_60", 45, "31–60 days"],
  ["age_61_90", 75, "61–90 days"],
  ["age_90_plus", 105, "over 90 days"],
];

const blank = (v) => v === null || v === undefined || v === "";
const shift = (iso, days) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
export const money = (n) => `${n < 0 ? "-" : ""}$${Math.abs(round2(n)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function line(c, r, kind, values) {
  const n = r.lines.length + 1;
  const l = { id: importRowId(c.jobId, r.rowNo, `line${n}`), kind, property_id: null, unit_id: null, lease_id: null, tenant_id: null, owner_id: null, bank_account_id: null, gl_account_id: null, item_date: null, memo: null, ref: null, ...values, metadata: { importJobId: c.jobId, importRowNo: r.rowNo, ...(values.metadata || {}) } };
  r.lines.push(l);
  return l;
}

// --- Lookups ------------------------------------------------------------------------------------

function resolveLease(c, r, v) {
  const property = v.property ? c.ix.properties.first("name", normName(v.property)) || c.ix.properties.first("address", normName(v.property)) : null;
  if (v.property && !property) {
    r.error(`Property "${v.property}" isn't in Geiger.`, "property");
    return null;
  }
  let units = [];
  if (v.unit) {
    units = property ? c.ix.units.find("label", `${property.id}|${normName(v.unit)}`) : c.ix.units.all().filter((u) => normName(u.row.label) === normName(v.unit));
    if (!units.length) {
      r.error(`Unit "${v.unit}"${property ? ` at ${property.row.name}` : ""} isn't in Geiger — import units and leases first.`, "unit");
      return null;
    }
  }
  const who = normName(v.tenant);
  const tenants = v.tenant ? [...c.ix.tenants.find("email", String(v.tenant).trim().toLowerCase()), ...c.ix.tenants.find("name", who)] : [];
  let pool = units.length ? units.flatMap((u) => c.ix.leases.find("unit", u.id)) : tenants.flatMap((t) => c.ix.leases.find("tenant", t.id));
  if (property) pool = pool.filter((l) => l.row.property_id === property.id);
  if (who && units.length) {
    const named = pool.filter((l) => normName(l.row.tenant_name) === who || normName(l.row.name).includes(who) || tenants.some((t) => t.id === l.row.tenant_id));
    if (named.length) pool = named;
  }
  pool = [...new Map(pool.map((l) => [l.id, l])).values()];
  if (pool.length > 1) {
    const live = pool.filter((l) => LIVE.includes(l.row.status));
    if (live.length === 1) pool = live;
  }
  if (pool.length === 1) return pool[0];
  const label = [v.property, v.unit, v.tenant].filter(Boolean).join(" · ");
  r.error(pool.length ? `More than one lease matches ${label} — add the unit and tenant.` : `No lease matches ${label || "this row"} — import tenants and leases first.`, v.unit ? "unit" : "tenant");
  return null;
}

const resolveAccount = (c, value) => {
  const s = String(value || "").trim();
  if (!s) return null;
  const first = s.split(/[\s·:-]+/)[0];
  return c.ix.gl_accounts.first("number", normKey(s)) || c.ix.gl_accounts.first("name", normName(s)) || (first !== s ? c.ix.gl_accounts.first("number", normKey(first)) : null) || c.ix.gl_accounts.first("name", normName(s.replace(/^[\d.]+\s*[·:-]?\s*/, "")));
};

function resolveBank(c, r, v) {
  if (!v.bank) return null;
  const hit = c.ix.bank_accounts.first("name", normName(v.bank)) || c.ix.bank_accounts.first("last4", String(v.bank).replace(/\D/g, "").slice(-4));
  if (!hit) r.warn(`Bank account "${v.bank}" isn't in Geiger — the usual account for this balance is used.`, "bank");
  return hit;
}

// --- Opening balances ------------------------------------------------------------------------------

function planOpenBalance(c, r, v) {
  const opening = c.opening;
  const kind = v.kind || (v.owner && !v.unit && !v.tenant ? "Owner" : "Tenant");
  const bank = resolveBank(c, r, v);
  if (kind === "Owner") {
    if (!v.owner) return r.error("Owner is required for an owner balance.", "owner");
    const owner = c.ix.owners.first("email", String(v.owner).trim().toLowerCase()) || c.ix.owners.first("name", normName(v.owner));
    if (!owner) return r.error(`Owner "${v.owner}" isn't in Geiger — import owners first.`, "owner");
    const property = v.property ? c.ix.properties.first("name", normName(v.property)) : null;
    if (v.property && !property) return r.error(`Property "${v.property}" isn't in Geiger.`, "property");
    if (blank(v.balance)) return r.error("Balance is required.", "balance");
    if (v.balance < 0) r.warn("This owner is overdrawn (a negative balance).", "balance");
    line(c, r, "owner_balance", { owner_id: owner.id, property_id: property?.id || null, bank_account_id: bank?.id || null, amount: v.balance, memo: v.memo || "Owner balance forward" });
    r.primary = { table: "conversion_lines", id: r.lines[0].id, action: "create" };
    return;
  }

  const buckets = BUCKETS.filter(([k]) => !blank(v[k]) && v[k] !== 0);
  const bucketTotal = round2(buckets.reduce((s, [k]) => s + v[k], 0));
  const balance = blank(v.balance) ? (buckets.length ? bucketTotal : null) : v.balance;
  if (blank(balance) && blank(v.deposit)) return r.error("Add a balance (or aging buckets) or a deposit held.", "balance");
  if (!blank(v.deposit_interest) && blank(v.deposit)) return r.error("Deposit interest needs the deposit it belongs to.", "deposit_interest");
  if (v.deposit < 0) return r.error("A deposit held can't be negative.", "deposit");
  if (v.charge_date && opening && v.charge_date > opening) return r.error(`Charge dates must be on or before ${opening}, the day before cutover.`, "charge_date");
  let chargeGl = null;
  if (v.account) {
    chargeGl = resolveAccount(c, v.account);
    if (!chargeGl) return r.error(`Charge type "${v.account}" isn't an account in your chart.`, "account");
    if (chargeGl.row.account_type !== "Income") return r.error(`${accountLabel(normalizeGlAccount(chargeGl.row))} isn't an income account.`, "account");
  }
  if (buckets.length && Math.abs(bucketTotal - balance) >= 0.005) return r.error(`The aging buckets add up to ${money(bucketTotal)}, not the balance ${money(balance)}.`, "balance");
  const lease = resolveLease(c, r, v);
  if (!lease) return;
  const dims = { lease_id: lease.id, tenant_id: lease.row.tenant_id || null, unit_id: lease.row.unit_id || null, property_id: lease.row.property_id || null };
  const mode = c.options.balanceMode === "itemized" ? "itemized" : "forward";
  if (mode === "forward" && !blank(balance) && balance !== 0) {
    const seen = c.seenLeases.get(lease.id);
    if (seen) return r.error(`Row ${seen} already carries this lease's balance — balance forward takes one row per lease.`, "balance");
    c.seenLeases.set(lease.id, r.rowNo);
  }

  if (!blank(balance) && balance > 0) {
    if (mode === "forward" && buckets.length) {
      for (const [k, days, label] of buckets) {
        if (v[k] < 0) line(c, r, "tenant_credit", { ...dims, bank_account_id: bank?.id || null, amount: -v[k], memo: v.memo || `Credit forward (${label})` });
        else line(c, r, "tenant_balance", { ...dims, gl_account_id: chargeGl?.id || null, item_date: shift(opening, -days), amount: v[k], memo: v.memo || `Balance forward (${label})` });
      }
    } else line(c, r, "tenant_balance", { ...dims, gl_account_id: chargeGl?.id || null, item_date: v.charge_date || opening, amount: balance, memo: v.memo || (mode === "forward" ? "Balance forward" : "Open charge") });
  } else if (!blank(balance) && balance < 0) line(c, r, "tenant_credit", { ...dims, bank_account_id: bank?.id || null, amount: -balance, memo: v.memo || "Prepaid credit forward" });

  if (!blank(v.deposit) && v.deposit > 0) {
    const interest = v.deposit_interest || 0;
    line(c, r, "deposit", { ...dims, bank_account_id: bank?.id || null, amount: v.deposit, memo: "Deposit held", metadata: { kind: v.deposit_kind || DEPOSIT_TYPES[0], interest, interestBearing: interest > 0 } });
  }
  if (!r.lines.length) {
    r.primary = { table: "conversion_lines", id: null, action: "skip" };
    r.info("Nothing owed or held on this row.");
    return;
  }
  r.primary = { table: "conversion_lines", id: r.lines[0].id, action: "create" };
}

// --- Trial balance ---------------------------------------------------------------------------------

function planTrialBalanceRow(c, r, v) {
  let amount = null;
  if (!blank(v.debit) || !blank(v.credit)) amount = round2((v.debit || 0) - (v.credit || 0));
  else if (!blank(v.balance)) amount = v.balance;
  if (amount === null) return r.error("Add a debit, a credit or a balance.", "debit");
  r.tbAmount = amount;
  if (!v.account) return r.error("Account is required.", "account");
  let acct = resolveAccount(c, v.account);
  if (!acct) {
    const s = String(v.account).trim();
    const number = (s.match(/^[\d][\d.-]*/) || [""])[0].replace(/[.-]+$/, "");
    const name = String(v.account_name || s.replace(/^[\d.]+\s*[·:-]?\s*/, "") || s).trim();
    const type = v.account_type || TYPE_BY_DIGIT[number[0]] || "";
    if (!type) return r.error(`Account "${s}" isn't in your chart — add its account type so it can be created.`, "account_type");
    if (!name || name === number) return r.error(`Account "${s}" isn't in your chart — add its name so it can be created.`, "account_name");
    const row = { id: importRowId(c.jobId, r.rowNo, "account"), number: number || null, name, account_type: type, subtype: DEFAULT_SUBTYPE[type], status: "Active", is_trust: false, is_system: false, metadata: { importJobId: c.jobId, importRowNo: r.rowNo } };
    r.ops.push({ op: "insert", table: "gl_accounts", id: row.id, values: row });
    acct = planEntry(c.ix, "gl_accounts", row, { job: c.jobId, rowNo: r.rowNo });
    r.info(`Adds ${number ? `${number} · ` : ""}${name} (${type}) to the chart of accounts.`, "account");
  }
  const a = acct.row;
  const label = accountLabel(normalizeGlAccount(a));
  if (a.system_key === CONVERSION_CLEARING_KEY) {
    if (Math.abs(amount) >= 0.005) r.warn(`${label} clears the conversion and carries no balance of its own — left out.`, "account");
    r.primary = { table: "gl_accounts", id: acct.id, action: "skip" };
    return;
  }
  const ties = TIE_OUT_SUBTYPES[a.subtype] || (a.subtype === "cash" && a.is_trust ? "trust money (owner balances, tenant credits, deposits)" : "");
  if (ties) {
    r.tieOut = { glAccountId: acct.id, amount, label };
    r.primary = { table: "gl_accounts", id: acct.id, action: "tieout" };
    r.info(`${label} ties out against the ${ties} in the batch — it isn't posted from the trial balance.`, "account");
    return;
  }
  if (Math.abs(amount) < 0.005) {
    r.primary = { table: "gl_accounts", id: acct.id, action: "skip" };
    r.info("Zero balance — nothing to bring over.");
    return;
  }
  let property = null;
  if (v.property) {
    property = c.ix.properties.first("name", normName(v.property));
    if (!property) return r.error(`Property "${v.property}" isn't in Geiger.`, "property");
  }
  line(c, r, "gl_balance", { gl_account_id: acct.id, property_id: property?.id || null, amount, memo: v.memo || `Opening balance · ${label}` });
  r.primary = { table: "conversion_lines", id: r.lines[0].id, action: "create" };
}

export function planBalanceRow(c, r, v) {
  if (!c.seenLeases) c.seenLeases = new Map();
  if (c.entity === "gl_opening") planTrialBalanceRow(c, r, v);
  else planOpenBalance(c, r, v);
}

// After every row: a trial balance must balance, or the whole import is refused.
export function finishBalances(results, c) {
  if (c.entity !== "gl_opening") return [];
  const debit = round2(results.reduce((s, r) => s + Math.max(0, r.tbAmount || 0), 0));
  const credit = round2(results.reduce((s, r) => s + Math.max(0, -(r.tbAmount || 0)), 0));
  if (Math.abs(debit - credit) < 0.005) return [];
  const text = `The trial balance doesn't balance: debits ${money(debit)}, credits ${money(credit)} (off by ${money(debit - credit)}). Fix the file and import it again.`;
  for (const r of results) {
    r.messages.push({ level: "error", text });
    r.ops = [];
    r.lines = [];
    r.status = "error";
  }
  return [{ level: "error", text }];
}

// --- Tie-out ----------------------------------------------------------------------------------------

// The batch these lines make (INTL-04's plan) against the trial balance's held-back accounts → { ready, clearingNet, rows, totals, errors }.
// rows: [{ glAccountId, label, tb, batch, diff }] — every tie-out target, plus the subledger accounts the batch fills.
export function tieOut({ lines, accounts, banks = [], batch, targets = [], depositHeldIn = "trust" }) {
  const acct = accounts?.byId ? accounts : indexAccounts((accounts || []).map(normalizeGlAccount));
  const v = validateBatch(lines, acct, { batch, banks, depositHeldIn });
  const tb = planTrialBalance(v.entries, acct);
  const perAccount = new Map(tb.map((row) => [row.glAccountId, round2(row.debit - row.credit)]));
  const want = new Map();
  for (const t of targets) want.set(t.glAccountId, round2((want.get(t.glAccountId) || 0) + t.amount));
  const ids = new Set([...want.keys()]);
  for (const row of tb) {
    const a = acct.byId.get(row.glAccountId);
    if (a && (TIE_OUT_SUBTYPES[a.subtype] || (a.subtype === "cash" && a.isTrust))) ids.add(row.glAccountId);
  }
  const rows = [...ids].map((id) => {
    const a = acct.byId.get(id);
    const batchAmt = perAccount.get(id) || 0;
    const tbAmt = want.has(id) ? want.get(id) : null;
    return { glAccountId: id, label: accountLabel(a) || "Account", number: a?.number || "", tb: tbAmt, batch: batchAmt, diff: tbAmt === null ? null : round2(tbAmt - batchAmt), normal: isDebitNormal(a?.accountType) ? "debit" : "credit" };
  });
  rows.sort((x, y) => String(x.number).localeCompare(String(y.number), undefined, { numeric: true }));
  return { ready: v.ready, clearingNet: v.clearingNet, rows, totals: v.totals, errors: v.errors, warnings: v.warnings, openingDate: openingDate(batch?.cutoverDate || batch?.cutover_date) };
}
