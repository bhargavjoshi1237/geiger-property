import { CONVERSION_BUILDERS, CONVERSION_CLEARING_KEY, accountLabel, conversionKey, indexAccounts, isDebitNormal, round2 } from "./postings";

// Opening balances (INTL-04), pure and client-importable: line model, validation, posting plan, paste/templates and go-live gates; I/O is in conversion_server.js.

export const CONVERT_KEY = "property.accounting.convert";
// Owner and Admin hold role management; Manager doesn't (OWNER_ONLY), so it marks an admin once the project is live.
export const ADMIN_KEY = "property.role.manage";

// Fixed post order: balance-sheet GL first, then the subledgers, outstanding bank items last.
export const CONVERSION_KINDS = ["gl_balance", "owner_balance", "tenant_balance", "tenant_credit", "deposit", "bill", "bank_outstanding"];
export const KIND_LABELS = {
  tenant_balance: "Tenant balance",
  tenant_credit: "Tenant credit",
  deposit: "Deposit held",
  owner_balance: "Owner balance",
  bill: "Unpaid bill",
  gl_balance: "GL balance",
  bank_outstanding: "Outstanding item",
};
export const BATCH_STATUS_MAP = {
  Draft: { label: "Draft", variant: "neutral" },
  Posted: { label: "Posted", variant: "success" },
  Voided: { label: "Voided", variant: "outline" },
};
export const CLEARING_ACCOUNT = { systemKey: CONVERSION_CLEARING_KEY, number: "3900", name: "Conversion Clearing", accountType: "Equity", subtype: "equity" };
export const DEPOSIT_KINDS = ["Security deposit", "Pet deposit", "Key deposit", "Last month's rent", "Other"];

const LEASE_KINDS = ["tenant_balance", "tenant_credit", "deposit"];
const BANK_KINDS = ["tenant_credit", "deposit", "owner_balance", "bank_outstanding"];
// Sub-ledger accounts a GL balance can't hit → the step that owns them.
const SUBLEDGER_STEP = {
  receivable: "Tenant balances",
  subsidy_receivable: "Tenant balances",
  payable: "Unpaid bills",
  deposits: "Deposits",
  prepaid: "Tenant credits",
};
const BANK_TYPE_KEY = { Trust: "trust_cash", "Security deposit": "deposit_cash", Operating: "operating_cash", Reserve: "operating_cash" };
const VIRTUAL_CLEARING = "conversion-clearing";

// --- Dates ------------------------------------------------------------------------

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const isIsoDate = (v) => DATE_RE.test(String(v || "")) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
export const isMonthStart = (v) => isIsoDate(v) && String(v).slice(8, 10) === "01";
const shiftDay = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
// Balances are as of the close of the day before cutover; that day dates the opening entries.
export const openingDate = (cutover) => (isIsoDate(cutover) ? shiftDay(cutover, -1) : "");
export const monthStartOf = (v) => (isIsoDate(v) ? `${String(v).slice(0, 7)}-01` : "");
export const nextMonthStart = (v) => (isIsoDate(v) ? shiftDay(`${String(v).slice(0, 7)}-28`, 4).slice(0, 7) + "-01" : "");

// --- Line model ---------------------------------------------------------------------

const metaOf = (row) => (row?.metadata && typeof row.metadata === "object" ? row.metadata : {});
const str = (v) => (v === null || v === undefined ? "" : String(v));

// A DB row (snake) or a view model (camel) → the line view model the plan reads.
export function normalizeConversionLine(row) {
  if (!row) return null;
  const pick = (camel, snake) => row[camel] ?? row[snake] ?? "";
  return {
    id: row.id,
    batchId: pick("batchId", "batch_id"),
    kind: row.kind || "",
    propertyId: pick("propertyId", "property_id"),
    unitId: pick("unitId", "unit_id"),
    leaseId: pick("leaseId", "lease_id"),
    tenantId: pick("tenantId", "tenant_id"),
    ownerId: pick("ownerId", "owner_id"),
    vendorId: pick("vendorId", "vendor_id"),
    bankAccountId: pick("bankAccountId", "bank_account_id"),
    glAccountId: pick("glAccountId", "gl_account_id"),
    itemDate: str(row.itemDate ?? row.item_date).slice(0, 10),
    amount: row.amount === "" || row.amount === null || row.amount === undefined ? "" : Number(row.amount),
    memo: str(row.memo),
    ref: str(row.ref),
    postedEntryId: pick("postedEntryId", "posted_entry_id"),
    metadata: metaOf(row),
  };
}

// Bank account row (snake or camel) → { id, name, accountType, status, glAccountId }.
export function normalizeBank(row) {
  return {
    id: row.id,
    name: row.name || "Bank account",
    accountType: row.accountType ?? row.account_type ?? "",
    status: row.status || "Active",
    glAccountId: row.glAccountId ?? row.gl_account_id ?? "",
  };
}

export const liveBanks = (banks) => (banks || []).map(normalizeBank).filter((b) => b.status !== "Closed" && b.status !== "Draft");

// A bank's cash GL: its own linked account, else the system cash account for its type.
export function bankCashGl(bank, acct) {
  if (bank?.glAccountId && acct.byId.has(bank.glAccountId)) return bank.glAccountId;
  return acct.byKey.get(BANK_TYPE_KEY[bank?.accountType] || "operating_cash")?.id || null;
}

// The bank a line lands in when none is picked: deposits in the deposit account (or trust, or operating by policy), resident and owner money in trust.
export function defaultBankFor(kind, banks, { depositHeldIn = "trust" } = {}) {
  const list = liveBanks(banks);
  const of = (type) => list.find((b) => b.accountType === type) || null;
  if (kind === "deposit") return depositHeldIn === "operating" ? of("Operating") || of("Trust") : of("Security deposit") || of("Trust") || of("Operating");
  if (BANK_KINDS.includes(kind)) return of("Trust");
  return null;
}

// Starting points saved on the batch (metadata.banks) → Map bankId → { statementDate, statementBalance }.
export function bankStarts(batch) {
  const list = Array.isArray(batch?.metadata?.banks) ? batch.metadata.banks : [];
  const out = new Map();
  for (const b of list) {
    if (!b?.bankAccountId || b.statementBalance === "" || b.statementBalance === null || b.statementBalance === undefined) continue;
    if (!Number.isFinite(Number(b.statementBalance))) continue;
    out.set(b.bankAccountId, { statementDate: str(b.statementDate).slice(0, 10), statementBalance: round2(b.statementBalance) });
  }
  return out;
}

// The account index with a stand-in Conversion Clearing until the server creates the real one.
export function withClearing(accounts) {
  const acct = accounts?.byId ? accounts : indexAccounts(accounts || []);
  if (acct.byKey.has(CONVERSION_CLEARING_KEY)) return acct;
  return indexAccounts([...acct.list, { id: VIRTUAL_CLEARING, ...CLEARING_ACCOUNT, isSystem: true, status: "Active" }]);
}

const isPnl = (a) => a?.accountType === "Income" || a?.accountType === "Expense";
const cents = (n) => Number.isFinite(n) && Math.abs(Math.round(n * 100) - n * 100) < 1e-6;

// The batch's rent billing start: the cutover month unless staff picked a later month (the old system already billed it).
export const batchBillingStart = (batch) => {
  const picked = monthStartOf(batch?.metadata?.billingStartsOn);
  const cut = batch?.cutoverDate ?? batch?.cutover_date ?? "";
  return picked && picked >= cut ? picked : cut;
};

// --- One line → its posting ---------------------------------------------------------------

// Line + context → { entryDate, bank, input } for its builder, or { error }.
function lineInput(line, ctx) {
  const { batchId, opening, banks, acct, depositHeldIn } = ctx;
  const m = line.metadata || {};
  const known = (id) => banks.find((b) => b.id === id) || null;
  let bank = null;
  if (line.bankAccountId) {
    bank = known(line.bankAccountId);
    if (!bank) return { error: "That bank account isn't open in this project." };
  } else if (BANK_KINDS.includes(line.kind)) bank = defaultBankFor(line.kind, banks, { depositHeldIn });
  const dated = line.itemDate && isIsoDate(line.itemDate) ? line.itemDate : "";
  const base = {
    batchId,
    lineId: line.id,
    date: opening,
    memo: line.memo || "",
    amount: Number(line.amount),
    propertyId: line.propertyId || undefined,
    unitId: line.unitId || undefined,
    leaseId: line.leaseId || undefined,
    tenantId: line.tenantId || undefined,
    ownerId: line.ownerId || undefined,
    vendorId: line.vendorId || undefined,
  };
  const cash = bank ? { cashGlAccountId: bankCashGl(bank, acct), bankAccountId: bank.id } : {};
  switch (line.kind) {
    case "tenant_balance":
      return { bank: null, input: { ...base, originalDate: dated || opening, chargeGlAccountId: line.glAccountId || undefined } };
    case "tenant_credit":
      return { bank, input: { ...base, ...cash } };
    case "deposit":
      return { bank, input: { ...base, ...cash, interest: Number(m.interest) || 0, depositId: m.depositId || line.id, sourceId: m.depositId || line.id } };
    case "owner_balance":
      return { bank, input: { ...base, ...cash } };
    case "bill":
      return { bank: null, input: { ...base, originalDate: dated || opening, dueDate: isIsoDate(m.dueDate) ? m.dueDate : "", reference: line.ref || "", billId: line.id } };
    case "gl_balance": {
      const account = acct.byId.get(line.glAccountId);
      // No bank picked: the one bank posting to this cash account, if there's exactly one.
      const mapped = account?.subtype === "cash" ? banks.filter((b) => bankCashGl(b, acct) === account.id) : [];
      const glBank = account?.subtype === "cash" ? bank || (mapped.length === 1 ? mapped[0] : null) : null;
      if (glBank && bankCashGl(glBank, acct) !== account?.id) return { error: `${glBank.name} posts to a different cash account.` };
      return { bank: glBank, input: { ...base, date: dated || opening, glAccountId: line.glAccountId, bankAccountId: glBank?.id || undefined } };
    }
    case "bank_outstanding":
      return { bank, input: { ...base, ...cash, date: dated || opening, itemType: m.itemType, reference: line.ref || "" } };
    default:
      return { error: "Unknown balance type." };
  }
}

// Line-level checks the builders don't make → an error message, or "".
function lineProblem(line, ctx) {
  const { opening, acct } = ctx;
  if (!CONVERSION_BUILDERS[line.kind]) return "Unknown balance type.";
  const amount = Number(line.amount);
  if (line.amount === "" || !Number.isFinite(amount)) return "Enter an amount.";
  if (!cents(amount)) return "Amounts are in whole cents.";
  if (line.itemDate && !isIsoDate(line.itemDate)) return "Use a YYYY-MM-DD date.";
  if (line.itemDate && opening && line.itemDate > opening) return `Dates must be on or before ${opening}, the day before cutover.`;
  if (LEASE_KINDS.includes(line.kind) && !line.leaseId) return "Pick the lease.";
  if (line.kind === "tenant_balance" && line.glAccountId) {
    const a = acct.byId.get(line.glAccountId);
    if (!a || a.accountType !== "Income") return "The charge type must be an income account.";
  }
  if (line.kind === "deposit") {
    const interest = Number(line.metadata?.interest || 0);
    if (!Number.isFinite(interest) || interest < 0 || !cents(interest)) return "Interest held must be zero or more, in cents.";
  }
  if (line.kind === "owner_balance" && !line.ownerId && !line.propertyId) return "Pick the owner (or the property for a shared balance).";
  if (line.kind === "bill" && !line.vendorId) return "Pick the vendor.";
  if (line.kind === "bill" && line.metadata?.dueDate && !isIsoDate(line.metadata.dueDate)) return "Use a YYYY-MM-DD due date.";
  if (line.kind === "gl_balance") {
    const a = acct.byId.get(line.glAccountId);
    if (!a) return "Pick the account.";
    if (a.systemKey === CONVERSION_CLEARING_KEY) return "Conversion Clearing can't hold an opening balance.";
    if (SUBLEDGER_STEP[a.subtype]) return `${accountLabel(a)} is filled from ${SUBLEDGER_STEP[a.subtype]} — enter it there.`;
  }
  if (line.kind === "bank_outstanding") {
    if (!line.bankAccountId) return "Pick the bank account.";
    if (!["check", "deposit"].includes(line.metadata?.itemType)) return "Pick Check or Deposit.";
  }
  return "";
}

// One line → { lineId, kind, key, date, bankAccountId, built } or { lineId, kind, error }. `overrides` patch the builder input (the server's real deposit id).
export function planLine(line, ctx, overrides = {}) {
  const problem = lineProblem(line, ctx);
  if (problem) return { lineId: line.id, kind: line.kind, error: problem };
  const prepared = lineInput(line, ctx);
  if (prepared.error) return { lineId: line.id, kind: line.kind, error: prepared.error };
  const input = { ...prepared.input, ...overrides };
  const built = CONVERSION_BUILDERS[line.kind](input, ctx.acct);
  if (built.error) return { lineId: line.id, kind: line.kind, error: built.error };
  if (ctx.describe && !line.memo) built.entry.memo = ctx.describe(line, built.entry.memo) || built.entry.memo;
  return { lineId: line.id, kind: line.kind, key: conversionKey(ctx.batchId, line.id), date: built.entry.date, bankAccountId: prepared.bank?.id || "", built };
}

const ordered = (lines) => [...lines].sort((a, b) => CONVERSION_KINDS.indexOf(a.kind) - CONVERSION_KINDS.indexOf(b.kind));

// The context planLine needs, from the batch, the chart and the project's banks.
export function planContext(batch, accounts, { banks = [], depositHeldIn = "trust", describe } = {}) {
  const cutover = batch?.cutoverDate ?? batch?.cutover_date ?? "";
  return { batchId: batch?.id || "", cutover, opening: openingDate(cutover), acct: withClearing(accounts), banks: liveBanks(banks), depositHeldIn, describe };
}

// --- Validation --------------------------------------------------------------------------------

// Lines + chart (+ batch, banks) → { ready, clearingNet, perBank, errors, warnings, totals, entries, openingDate }; Post needs ready.
export function validateBatch(lines, accounts, { batch = {}, banks = [], depositHeldIn = "trust" } = {}) {
  const ctx = planContext(batch, accounts, { banks, depositHeldIn });
  const { acct, opening } = ctx;
  const clearing = acct.byKey.get(CONVERSION_CLEARING_KEY).id;
  const errors = [];
  const warnings = [];
  const issue = (list) => (message, line = null) => list.push({ message, lineId: line?.id || null, kind: line?.kind || null });
  const err = issue(errors);
  const warn = issue(warnings);

  if (!isIsoDate(ctx.cutover)) err("Pick the cutover date.");
  else if (!isMonthStart(ctx.cutover)) err("Cut over on the first day of a month.");

  const live = (lines || []).map(normalizeConversionLine).filter(Boolean);
  if (!live.length) err("Add at least one balance.");
  const entries = [];
  for (const line of ordered(live)) {
    const p = planLine(line, ctx);
    if (p.error) err(p.error, line);
    else {
      entries.push(p);
      if (BANK_KINDS.includes(line.kind) && !p.bankAccountId) warn("No bank account to put this in — add a Trust bank account so it can be reconciled.", line);
      if (line.kind === "owner_balance" && Number(line.amount) < 0) warn("This owner is overdrawn (a negative balance).", line);
      if (line.kind === "gl_balance") {
        const a = acct.byId.get(line.glAccountId);
        if (a?.subtype === "cash" && a.isTrust) warn("Trust cash usually comes in through owner balances and tenant credits; this one has no owner.", line);
        if (isPnl(a) && ctx.cutover && line.itemDate && line.itemDate.slice(0, 4) !== ctx.cutover.slice(0, 4)) warn("Year-to-date lines from an earlier year belong in equity.", line);
      }
    }
  }

  // Two deposits of the same kind on one lease are usually a duplicate row.
  const seen = new Set();
  for (const l of live.filter((x) => x.kind === "deposit")) {
    const k = `${l.leaseId}|${l.metadata?.kind || DEPOSIT_KINDS[0]}`;
    if (seen.has(k)) warn("This lease already has a deposit of this kind in the batch.", l);
    seen.add(k);
  }

  let clearingNet = 0;
  const perBank = new Map();
  const starts = bankStarts(batch);
  const bankRow = (id) => {
    if (!perBank.has(id)) {
      const b = ctx.banks.find((x) => x.id === id);
      perBank.set(id, { bankAccountId: id, name: b?.name || "Bank account", accountType: b?.accountType || "", book: 0, outstandingIn: 0, outstandingOut: 0, lines: 0 });
    }
    return perBank.get(id);
  };
  for (const e of entries) {
    for (const l of e.built.lines) {
      const a = acct.byId.get(l.glAccountId);
      if (l.glAccountId === clearing) clearingNet += (Number(l.debit) || 0) - (Number(l.credit) || 0);
      if (a?.subtype === "cash" && l.bankAccountId) {
        const r = bankRow(l.bankAccountId);
        r.book += (Number(l.debit) || 0) - (Number(l.credit) || 0);
        r.lines += 1;
        if (l.metadata?.outstanding === "check") r.outstandingOut += Number(l.credit) || 0;
        if (l.metadata?.outstanding === "deposit") r.outstandingIn += Number(l.debit) || 0;
      }
    }
  }
  for (const id of starts.keys()) if (ctx.banks.some((b) => b.id === id)) bankRow(id);
  for (const r of perBank.values()) {
    const start = starts.get(r.bankAccountId);
    r.book = round2(r.book);
    r.outstandingIn = round2(r.outstandingIn);
    r.outstandingOut = round2(r.outstandingOut);
    // What the old statement should show: book, plus checks not yet cleared, less deposits not yet credited.
    r.cleared = round2(r.book + r.outstandingOut - r.outstandingIn);
    r.hasStart = Boolean(start);
    r.statement = start ? start.statementBalance : null;
    r.statementDate = start?.statementDate || "";
    r.diff = start ? round2(start.statementBalance - r.cleared) : null;
    if (start && Math.abs(r.diff) >= 0.005) err(`${r.name}: the statement (${fmt(start.statementBalance)}) and the book less outstanding items (${fmt(r.cleared)}) differ by ${fmt(r.diff)}.`);
    if (start && !isIsoDate(start.statementDate)) err(`${r.name}: enter the statement date.`);
    if (start && opening && start.statementDate > opening) warn(`${r.name}: the statement is dated after ${opening}, the day before cutover.`);
    if (!start && r.lines) warn(`${r.name} has no starting point, so its first reconciliation opens at $0.00.`);
  }
  for (const line of live.filter((l) => l.kind === "bank_outstanding")) {
    const start = starts.get(line.bankAccountId);
    if (start?.statementDate && line.itemDate && line.itemDate > start.statementDate) warn("This item is dated after the statement it's outstanding from.", line);
  }
  clearingNet = round2(clearingNet);
  if (Math.abs(clearingNet) >= 0.005) err(`Conversion clearing is off by ${fmt(clearingNet)} — the balances entered don't agree. Post stays off until it's $0.00.`);

  return { ready: errors.length === 0, clearingNet, perBank: Object.fromEntries(perBank), errors, warnings, totals: totalsOf(live, entries, perBank, clearingNet), entries, openingDate: opening };
}

const fmt = (n) => `${n < 0 ? "-" : ""}$${Math.abs(round2(n)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function totalsOf(lines, entries, perBank, clearingNet) {
  const byKind = Object.fromEntries(CONVERSION_KINDS.map((k) => [k, { count: 0, amount: 0 }]));
  let interest = 0;
  for (const l of lines) {
    if (!byKind[l.kind]) continue;
    byKind[l.kind].count += 1;
    byKind[l.kind].amount = round2(byKind[l.kind].amount + (Number(l.amount) || 0));
    if (l.kind === "deposit") interest = round2(interest + (Number(l.metadata?.interest) || 0));
  }
  const banks = [...perBank.values()];
  return {
    lines: lines.length,
    entries: entries.length,
    clearingNet,
    tenantBalances: byKind.tenant_balance.amount,
    tenantCredits: byKind.tenant_credit.amount,
    deposits: byKind.deposit.amount,
    depositInterest: interest,
    ownerBalances: byKind.owner_balance.amount,
    bills: byKind.bill.amount,
    glBalances: byKind.gl_balance.amount,
    outstandingItems: byKind.bank_outstanding.count,
    banksWithStart: banks.filter((b) => b.hasStart).length,
    banksWithoutStart: banks.filter((b) => !b.hasStart && b.lines).length,
    byKind,
  };
}

// Built entries → a trial balance per account ({ glAccountId, debit, credit, balance }), the old system's TB to compare.
export function planTrialBalance(entries, accounts) {
  const acct = withClearing(accounts);
  const per = new Map();
  for (const e of entries || []) {
    for (const l of e.built.lines) {
      const r = per.get(l.glAccountId) || { glAccountId: l.glAccountId, label: accountLabel(acct.byId.get(l.glAccountId)), debit: 0, credit: 0 };
      r.debit = round2(r.debit + (Number(l.debit) || 0));
      r.credit = round2(r.credit + (Number(l.credit) || 0));
      per.set(l.glAccountId, r);
    }
  }
  return [...per.values()]
    .map((r) => {
      const a = acct.byId.get(r.glAccountId);
      return { ...r, number: a?.number || "", balance: round2(isDebitNormal(a?.accountType) ? r.debit - r.credit : r.credit - r.debit) };
    })
    .filter((r) => r.debit || r.credit)
    .sort((x, y) => String(x.number).localeCompare(String(y.number), undefined, { numeric: true }));
}

// Lines a conversion reconciliation clears for one bank: every cash line on it except the outstanding halves.
export const clearedLineFilter = (bankAccountId) => (l) => l.bank_account_id === bankAccountId && !l.metadata?.outstanding;

// --- Go-live gates and status --------------------------------------------------------------

// Who may post: anyone with accounting.convert before go-live; afterwards admins only (null = allowed).
export function postGate({ live = false, isAdmin = false, status = "Draft" } = {}) {
  if (status === "Voided") return { status: 409, message: "This batch was voided — start a new one." };
  if (live && !isAdmin) return { status: 403, message: "The project is live, so only an admin can post opening balances." };
  return null;
}

// Voiding is for mistakes found before go-live; after that, correct with journal entries.
export function voidGate({ live = false, status = "Draft", posted = 0 } = {}) {
  if (status === "Voided") return { status: 409, message: "This batch is already voided." };
  if (live) return { status: 409, message: "The project is live, so opening balances can't be voided — correct them with a journal entry." };
  if (status !== "Posted" && !posted) return { status: 409, message: "Nothing in this batch is on the ledger yet." };
  return null;
}

// Rent billing never reaches back before the cutover: before go-live the project's billingStartsOn moves up to the batch's start (never down); leases in the batch always carry their own.
export function billingCutover({ current = "", start = "", live = false } = {}) {
  if (!isIsoDate(start)) return { project: "", lease: "", warning: "" };
  const cur = isIsoDate(current) ? current : "";
  const project = !live && (!cur || cur < start) ? start : "";
  const warning = cur && cur > start ? `Rent billing already starts on ${cur}, after this cutover, so rent due between ${start} and then won't bill on its own.` : "";
  return { project, lease: start, warning };
}

// Checklist / readiness (INTL-03, INTL-06): done once a batch is posted (posting needs clearing at $0.00).
export function openingBalancesStatus(batches = []) {
  const live = (batches || []).filter((b) => b && !b.deletedAt && !b.deleted_at);
  const posted = live.filter((b) => b.status === "Posted");
  if (!posted.length) {
    const draft = live.some((b) => b.status === "Draft");
    return { done: false, count: 0, banksWithoutStart: 0, detail: draft ? "A draft is in progress — review it and post" : "Post opening balances and clear conversion clearing to $0" };
  }
  const cut = (b) => b.cutoverDate ?? b.cutover_date ?? "";
  const latest = [...posted].sort((a, b) => cut(b).localeCompare(cut(a)))[0];
  const without = Number(latest.totals?.banksWithoutStart) || 0;
  const detail = `Posted for the ${cut(latest)} cutover · clearing $0.00${without ? ` · ${without} bank${without === 1 ? "" : "s"} without a starting reconciliation` : ""}`;
  return { done: true, count: posted.length, banksWithoutStart: without, detail };
}

// --- Paste and templates ---------------------------------------------------------------------

// Template columns per balance type, matched by header to the usual conversion exports (aged receivables, deposit register, owner balances, payable aging, trial balance, outstanding items).
export const TEMPLATE_COLUMNS = {
  tenant_balance: [
    { key: "property", header: "Property", aliases: ["property name", "building"] },
    { key: "unit", header: "Unit", aliases: ["unit #", "unit number", "unit name"] },
    { key: "tenant", header: "Tenant", aliases: ["resident", "tenant name", "resident name", "payer", "name"] },
    { key: "date", header: "Charge date", aliases: ["date", "due date", "transaction date", "post date"] },
    { key: "account", header: "Charge type", aliases: ["gl account", "account", "charge code", "type"] },
    { key: "amount", header: "Amount", aliases: ["balance", "amount due", "open", "open amount", "balance due", "total"] },
    { key: "memo", header: "Memo", aliases: ["description", "notes"] },
  ],
  tenant_credit: [
    { key: "property", header: "Property", aliases: ["property name", "building"] },
    { key: "unit", header: "Unit", aliases: ["unit #", "unit number"] },
    { key: "tenant", header: "Tenant", aliases: ["resident", "tenant name", "resident name", "name"] },
    { key: "amount", header: "Credit", aliases: ["amount", "prepaid", "prepayment", "credit balance"] },
    { key: "bank", header: "Bank account", aliases: ["bank", "cash account"] },
    { key: "memo", header: "Memo", aliases: ["description", "notes"] },
  ],
  deposit: [
    { key: "property", header: "Property", aliases: ["property name", "building"] },
    { key: "unit", header: "Unit", aliases: ["unit #", "unit number"] },
    { key: "tenant", header: "Tenant", aliases: ["resident", "tenant name", "resident name", "name"] },
    { key: "depositKind", header: "Deposit type", aliases: ["type", "deposit kind", "kind"] },
    { key: "amount", header: "Amount held", aliases: ["amount", "deposit", "deposit amount", "balance", "held"] },
    { key: "interest", header: "Interest held", aliases: ["interest", "accrued interest"] },
    { key: "interestBearing", header: "Interest-bearing", aliases: ["interest bearing", "earns interest"] },
    { key: "bank", header: "Bank account", aliases: ["bank", "held at", "cash account"] },
    { key: "memo", header: "Memo", aliases: ["description", "notes"] },
  ],
  owner_balance: [
    { key: "owner", header: "Owner", aliases: ["owner name", "rental owner", "payee"] },
    { key: "property", header: "Property", aliases: ["property name", "building"] },
    { key: "amount", header: "Balance", aliases: ["amount", "owner balance", "cash balance", "funds held"] },
    { key: "bank", header: "Bank account", aliases: ["bank", "cash account"] },
    { key: "memo", header: "Memo", aliases: ["description", "notes"] },
  ],
  bill: [
    { key: "vendor", header: "Vendor", aliases: ["payee", "vendor name", "supplier"] },
    { key: "property", header: "Property", aliases: ["property name", "building"] },
    { key: "ref", header: "Invoice #", aliases: ["invoice", "invoice number", "reference", "ref", "bill #"] },
    { key: "date", header: "Bill date", aliases: ["date", "invoice date"] },
    { key: "dueDate", header: "Due date", aliases: ["due"] },
    { key: "amount", header: "Amount due", aliases: ["amount", "balance", "open", "balance due", "unpaid"] },
    { key: "memo", header: "Memo", aliases: ["description", "notes"] },
  ],
  gl_balance: [
    { key: "account", header: "Account", aliases: ["gl account", "account number", "number", "account name"] },
    { key: "debit", header: "Debit", aliases: ["dr"] },
    { key: "credit", header: "Credit", aliases: ["cr"] },
    { key: "amount", header: "Balance", aliases: ["amount", "net"] },
    { key: "property", header: "Property", aliases: ["property name", "building"] },
    { key: "bank", header: "Bank account", aliases: ["bank"] },
    { key: "date", header: "Date", aliases: ["period", "month", "as of"] },
    { key: "vendor", header: "Vendor", aliases: ["payee"] },
    { key: "memo", header: "Memo", aliases: ["description", "notes"] },
  ],
  bank_outstanding: [
    { key: "bank", header: "Bank account", aliases: ["bank", "account"] },
    { key: "itemType", header: "Type", aliases: ["item type", "kind"] },
    { key: "date", header: "Date", aliases: ["check date", "deposit date"] },
    { key: "ref", header: "Check #", aliases: ["check number", "number", "reference", "ref"] },
    { key: "memo", header: "Payee / memo", aliases: ["payee", "memo", "description"] },
    { key: "owner", header: "Owner", aliases: ["owner name"] },
    { key: "amount", header: "Amount", aliases: ["total"] },
  ],
};

const EXAMPLES = {
  tenant_balance: ["Maple Court", "2B", "Jane Doe", "2026-10-01", "Rental Income", "1200.00", "October rent"],
  tenant_credit: ["Maple Court", "3A", "Sam Lee", "600.00", "Trust account", "Prepaid November rent"],
  deposit: ["Maple Court", "2B", "Jane Doe", "Security deposit", "1500.00", "12.40", "yes", "Deposit account", ""],
  owner_balance: ["Pat Owner", "Maple Court", "18500.00", "Trust account", ""],
  bill: ["Acme Plumbing", "Maple Court", "INV-1042", "2026-10-20", "2026-11-19", "450.00", "Leak repair"],
  gl_balance: ["3000", "", "34550.00", "", "", "", "", "", "Owner equity at cutover"],
  bank_outstanding: ["Trust account", "Check", "2026-10-28", "1042", "Acme Plumbing", "Pat Owner", "450.00"],
};

const csvCell = (v) => {
  const s = str(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// Downloadable template for one balance type: the header row plus one example row.
export function templateCsv(kind) {
  const cols = TEMPLATE_COLUMNS[kind] || [];
  return `${cols.map((c) => csvCell(c.header)).join(",")}\n${(EXAMPLES[kind] || []).map(csvCell).join(",")}\n`;
}

// Pasted spreadsheet text (tab-separated, or CSV) → rows of cells.
export function parseTable(text) {
  const src = str(text).replace(/\r\n?/g, "\n");
  const delim = src.includes("\t") ? "\t" : ",";
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === delim) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ""));
}

const norm = (s) => str(s).toLowerCase().replace(/[^a-z0-9#]+/g, " ").trim();

// "$1,234.50", "(1,234.50)", "-12" → number; "" or junk → NaN.
export function parseMoney(v) {
  let s = str(v).trim();
  if (!s) return Number.NaN;
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  if (s.endsWith("-")) {
    neg = !neg;
    s = s.slice(0, -1);
  }
  s = s.replace(/[$,\s]/g, "").replace(/^(cr|dr)/i, "");
  if (!/^-?\d*\.?\d+$/.test(s)) return Number.NaN;
  const n = round2(Number(s));
  return neg ? -n : n;
}

// "2026-10-31", "10/31/2026", "10/31/26" (US order) → "YYYY-MM-DD", else "".
export function parseDate(v) {
  const s = str(v).trim();
  if (isIsoDate(s.slice(0, 10)) && /^\d{4}-/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (!m) return "";
  const year = m[3].length === 2 ? `20${m[3]}` : m[3];
  const out = `${year}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return isIsoDate(out) ? out : "";
}

const yes = (v) => ["yes", "y", "true", "1", "x"].includes(norm(v));
const itemTypeOf = (v) => {
  const s = norm(v);
  if (/^(chk|check|cheque|withdrawal|payment|debit)/.test(s)) return "check";
  if (/^(dep|deposit|credit|receipt)/.test(s)) return "deposit";
  return "";
};

// Header row → column index per template key, or null when the first row is data (template order then).
function headerMap(row, cols) {
  const out = {};
  let hits = 0;
  row.forEach((cell, i) => {
    const n = norm(cell);
    const col = cols.find((c) => norm(c.header) === n) || cols.find((c) => c.aliases.some((a) => norm(a) === n));
    if (col && out[col.key] === undefined) {
      out[col.key] = i;
      hits += 1;
    }
  });
  return hits ? out : null;
}

// Name lookups the paste resolves against: { leases, owners, vendors, properties, accounts, banks } (view models).
function matcher(lookups = {}) {
  const byName = (list, keyOf = (x) => x.name) => {
    const m = new Map();
    for (const x of list || []) {
      const k = norm(keyOf(x));
      if (k && !m.has(k)) m.set(k, x);
    }
    return m;
  };
  const owners = byName(lookups.owners);
  const vendors = byName(lookups.vendors);
  const properties = byName(lookups.properties);
  const banks = byName(lookups.banks);
  const accountsByNumber = byName(lookups.accounts, (a) => a.number);
  const accountsByName = byName(lookups.accounts);
  const accountsByLabel = byName(lookups.accounts, (a) => accountLabel(a));
  const leases = lookups.leases || [];
  return {
    owner: (v) => owners.get(norm(v)) || null,
    vendor: (v) => vendors.get(norm(v)) || null,
    property: (v) => properties.get(norm(v)) || null,
    bank: (v) => banks.get(norm(v)) || (lookups.banks || []).find((b) => b.last4 && norm(v).endsWith(norm(b.last4))) || null,
    account: (v) => accountsByNumber.get(norm(v)) || accountsByName.get(norm(v)) || accountsByLabel.get(norm(v)) || accountsByNumber.get(norm(str(v).split(/\s/)[0])) || null,
    // A lease by unit + tenant (narrowed by property), else the only lease for that tenant or unit.
    lease: ({ property, unit, tenant }) => {
      const p = property ? properties.get(norm(property)) : null;
      const pool = leases.filter((l) => !p || l.propertyId === p.id);
      const u = norm(unit);
      const t = norm(tenant);
      const both = pool.filter((l) => (!u || norm(l.unit) === u) && (!t || norm(l.tenantName) === t || norm(l.name) === t));
      if (both.length === 1) return both[0];
      const active = both.filter((l) => l.active);
      return active.length === 1 ? active[0] : null;
    },
  };
}

// Pasted rows for one balance type → { lines, issues }: names resolve to ids; anything unmatched stays on the line (metadata.unmatched) for staff to pick.
export function linesFromPaste(text, kind, lookups = {}, { newId = () => crypto.randomUUID(), batchId = "" } = {}) {
  const cols = TEMPLATE_COLUMNS[kind];
  if (!cols) return { lines: [], issues: ["Unknown balance type."] };
  const table = parseTable(text);
  if (!table.length) return { lines: [], issues: ["Nothing to paste."] };
  const header = headerMap(table[0], cols);
  const map = header || Object.fromEntries(cols.map((c, i) => [c.key, i]));
  const body = header ? table.slice(1) : table;
  const find = matcher(lookups);
  const lines = [];
  const issues = [];
  body.forEach((cells, i) => {
    const get = (key) => (map[key] === undefined ? "" : str(cells[map[key]]));
    const n = i + 1;
    const unmatched = {};
    const line = { id: newId(), batchId, kind, propertyId: "", unitId: "", leaseId: "", tenantId: "", ownerId: "", vendorId: "", bankAccountId: "", glAccountId: "", itemDate: "", amount: "", memo: get("memo"), ref: get("ref"), postedEntryId: "", metadata: {} };
    const note = (field, value, label) => {
      if (!value) return;
      unmatched[field] = value;
      issues.push(`Row ${n}: couldn't match ${label} "${value}".`);
    };
    if (LEASE_KINDS.includes(kind)) {
      const lease = find.lease({ property: get("property"), unit: get("unit"), tenant: get("tenant") });
      if (lease) Object.assign(line, { leaseId: lease.id, tenantId: lease.tenantId || "", unitId: lease.unitId || "", propertyId: lease.propertyId || "" });
      else note("lease", [get("property"), get("unit"), get("tenant")].filter(Boolean).join(" · "), "the lease");
    } else if (get("property")) {
      const p = find.property(get("property"));
      if (p) line.propertyId = p.id;
      else note("property", get("property"), "property");
    }
    if (get("owner")) {
      const o = find.owner(get("owner"));
      if (o) line.ownerId = o.id;
      else note("owner", get("owner"), "owner");
    }
    if (get("vendor")) {
      const v = find.vendor(get("vendor"));
      if (v) line.vendorId = v.id;
      else note("vendor", get("vendor"), "vendor");
    }
    if (get("bank")) {
      const b = find.bank(get("bank"));
      if (b) line.bankAccountId = b.id;
      else note("bank", get("bank"), "bank account");
    }
    if (get("account")) {
      const a = find.account(get("account"));
      if (a) line.glAccountId = a.id;
      else note("account", get("account"), "account");
    }
    const date = get("date");
    if (date) {
      line.itemDate = parseDate(date);
      if (!line.itemDate) issues.push(`Row ${n}: couldn't read the date "${date}".`);
    }
    let amount = parseMoney(get("amount"));
    if (kind === "gl_balance" && (get("debit") || get("credit"))) amount = round2((parseMoney(get("debit")) || 0) - (parseMoney(get("credit")) || 0));
    if (!Number.isFinite(amount)) issues.push(`Row ${n}: couldn't read the amount.`);
    else line.amount = amount;
    if (kind === "deposit") {
      const interest = parseMoney(get("interest"));
      const k = DEPOSIT_KINDS.find((x) => norm(x) === norm(get("depositKind")));
      line.metadata = { kind: k || DEPOSIT_KINDS[0], interest: Number.isFinite(interest) ? interest : 0, interestBearing: yes(get("interestBearing")) };
    }
    if (kind === "bill" && get("dueDate")) line.metadata = { dueDate: parseDate(get("dueDate")) };
    if (kind === "bank_outstanding") {
      line.metadata = { itemType: itemTypeOf(get("itemType")) };
      if (!line.metadata.itemType) issues.push(`Row ${n}: the type should be Check or Deposit.`);
    }
    if (Object.keys(unmatched).length) line.metadata = { ...line.metadata, unmatched };
    lines.push(line);
  });
  return { lines, issues };
}
