// Pure double-entry helpers shared by the browser data layer (lib/supabase/ledger.js)
// and the server jobs (lib/jobs/financial.js): view-model normalizers, posting
// builders that turn a business event into balanced lines, and the sub-ledger
// math (balances, open charges, oldest-first allocation). No I/O here.

export const SOURCE_TYPES = [
  "charge",
  "payment",
  "credit",
  "bill",
  "bill_payment",
  "distribution",
  "contribution",
  "management_fee",
  "deposit_held",
  "deposit_return",
  "deposit_interest",
  "late_fee",
  "adjustment",
];

export const SOURCE_LABELS = {
  charge: "Charge",
  payment: "Payment",
  credit: "Credit",
  bill: "Bill",
  bill_payment: "Bill payment",
  distribution: "Owner distribution",
  contribution: "Owner contribution",
  management_fee: "Management fee",
  deposit_held: "Deposit received",
  deposit_return: "Deposit returned",
  deposit_interest: "Deposit interest",
  late_fee: "Late fee",
  adjustment: "Journal entry",
};

// Line dimensions (camel ⇄ snake).
export const DIMENSIONS = {
  propertyId: "property_id",
  unitId: "unit_id",
  leaseId: "lease_id",
  tenantId: "tenant_id",
  ownerId: "owner_id",
  vendorId: "vendor_id",
  bankAccountId: "bank_account_id",
  jobId: "job_id",
};

const ENTRY_DIMS = ["propertyId", "unitId", "leaseId", "tenantId", "ownerId", "vendorId"];

export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Normal-debit accounts grow with debits; everything else with credits.
export const isDebitNormal = (accountType) => accountType === "Asset" || accountType === "Expense";

export function normalizeGlAccount(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name ?? "",
    number: row.number ?? "",
    accountType: row.account_type ?? row.accountType ?? "",
    subtype: row.subtype ?? "",
    isTrust: Boolean(row.is_trust ?? row.isTrust),
    isSystem: Boolean(row.is_system ?? row.isSystem),
    systemKey: row.system_key ?? row.systemKey ?? "",
    parentId: row.parent_id ?? row.parentId ?? "",
    status: row.status ?? "Active",
    projectId: row.project_id ?? row.projectId ?? null,
  };
}

export const accountLabel = (a) => (a ? (a.number ? `${a.number} · ${a.name}` : a.name) : "");

export function indexAccounts(accounts) {
  const byId = new Map();
  const byKey = new Map();
  for (const a of accounts || []) {
    byId.set(a.id, a);
    if (a.systemKey) byKey.set(a.systemKey, a);
  }
  return { byId, byKey, list: accounts || [] };
}

export function normalizeEntry(row) {
  if (!row) return null;
  const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    id: row.id,
    projectId: row.project_id ?? null,
    date: row.entry_date ?? "",
    memo: row.memo ?? "",
    sourceType: row.source_type ?? "adjustment",
    sourceId: row.source_id ?? "",
    status: row.status ?? "posted",
    reversalOf: row.reversal_of ?? "",
    voidedAt: row.voided_at ?? null,
    idempotencyKey: row.idempotency_key ?? "",
    total: Number(row.total ?? 0),
    propertyId: row.property_id ?? "",
    unitId: row.unit_id ?? "",
    leaseId: row.lease_id ?? "",
    tenantId: row.tenant_id ?? "",
    ownerId: row.owner_id ?? "",
    vendorId: row.vendor_id ?? "",
    createdAt: row.created_at ?? null,
    metadata: meta,
  };
}

export function normalizeLine(row) {
  if (!row) return null;
  const out = {
    id: row.id,
    entryId: row.entry_id,
    date: row.entry_date ?? "",
    lineNo: Number(row.line_no ?? 0),
    glAccountId: row.gl_account_id ?? "",
    debit: Number(row.debit ?? 0),
    credit: Number(row.credit ?? 0),
    memo: row.memo ?? "",
    appliesToEntryId: row.applies_to_entry_id ?? "",
    cleared: Boolean(row.cleared),
    clearedOn: row.cleared_on ?? "",
    reconciliationId: row.reconciliation_id ?? "",
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
  };
  for (const [k, col] of Object.entries(DIMENSIONS)) out[k] = row[col] ?? "";
  return out;
}

// Built posting ({ entry, lines } in camel) → ledger_post RPC args (snake).
export function toRpcArgs({ entry, lines }, { projectId, createdBy } = {}) {
  const e = {
    id: entry.id || undefined,
    project_id: entry.projectId || projectId || null,
    entry_date: entry.date || null,
    memo: entry.memo || null,
    source_type: entry.sourceType || "adjustment",
    source_id: entry.sourceId || null,
    idempotency_key: entry.idempotencyKey || null,
    metadata: entry.metadata || {},
    created_by: createdBy || null,
  };
  for (const k of ENTRY_DIMS) e[DIMENSIONS[k]] = entry[k] || null;
  const l = lines.map((line) => {
    const out = {
      gl_account_id: line.glAccountId,
      debit: round2(line.debit),
      credit: round2(line.credit),
      memo: line.memo || null,
      applies_to_entry_id: line.appliesToEntryId || null,
      metadata: line.metadata || {},
    };
    // A dimension key present on the line (even null) overrides the entry's.
    for (const [k, col] of Object.entries(DIMENSIONS)) if (k in line) out[col] = line[k] || null;
    return out;
  });
  return { p_entry: e, p_lines: l };
}

// --- Builders ----------------------------------------------------------------
// Each takes the event input + an account index and returns { entry, lines }
// or { error } when the amount or a needed account is missing.

const pickDims = (input) => {
  const out = {};
  for (const k of ENTRY_DIMS) if (input[k]) out[k] = input[k];
  return out;
};

function need(acct, key, label) {
  const a = acct.byKey.get(key);
  return a ? a.id : { error: `No ${label} account in the chart of accounts.` };
}

function resolve(acct, id, fallbackKey, label) {
  if (id && acct.byId.has(id)) return id;
  return need(acct, fallbackKey, label);
}

const isErr = (v) => v && typeof v === "object" && "error" in v;

function baseEntry(input, sourceType, memo) {
  return {
    id: input.entryId || undefined,
    date: input.date,
    memo: input.memo || memo,
    sourceType: input.sourceType || sourceType,
    sourceId: input.sourceId || "",
    idempotencyKey: input.idempotencyKey || "",
    metadata: input.metadata || {},
    ...pickDims(input),
  };
}

function checkAmount(amount) {
  const n = round2(amount);
  return n > 0 ? n : { error: "Enter an amount greater than zero." };
}

// Charge: Dr Accounts Receivable / Cr income (rent by default).
export function buildCharge(input, acct) {
  const amount = checkAmount(input.amount);
  if (isErr(amount)) return amount;
  const ar = need(acct, "accounts_receivable", "Accounts Receivable");
  const key = input.sourceType === "late_fee" ? "late_fee_income" : input.incomeKey || "rent_income";
  const income = resolve(acct, input.glAccountId, key, "income");
  if (isErr(ar)) return ar;
  if (isErr(income)) return income;
  return {
    entry: baseEntry(input, "charge", "Charge"),
    lines: [
      { glAccountId: ar, debit: amount, jobId: input.jobId },
      { glAccountId: income, credit: amount, jobId: input.jobId },
    ],
  };
}

// Payment: Dr cash (trust by default) / Cr AR per allocation, remainder unapplied.
export function buildPayment(input, acct) {
  const amount = checkAmount(input.amount);
  if (isErr(amount)) return amount;
  const ar = need(acct, "accounts_receivable", "Accounts Receivable");
  const cash = resolve(acct, input.cashGlAccountId, input.cashKey || "trust_cash", "trust cash");
  if (isErr(ar)) return ar;
  if (isErr(cash)) return cash;
  const allocations = (input.allocations || []).filter((a) => round2(a.amount) > 0);
  const applied = round2(allocations.reduce((s, a) => s + round2(a.amount), 0));
  if (applied - amount > 0.005) return { error: "Allocations exceed the payment amount." };
  const lines = [{ glAccountId: cash, debit: amount, bankAccountId: input.bankAccountId || null }];
  for (const a of allocations) lines.push({ glAccountId: ar, credit: round2(a.amount), appliesToEntryId: a.entryId });
  const rest = round2(amount - applied);
  if (rest > 0) lines.push({ glAccountId: ar, credit: rest, memo: "Unapplied credit" });
  return {
    entry: baseEntry(input, "payment", input.method ? `Payment · ${input.method}` : "Payment"),
    lines,
    allocations,
    unapplied: rest,
  };
}

// Credit (concession / write-down): Dr concessions / Cr AR, allocated like a payment.
export function buildCredit(input, acct) {
  const amount = checkAmount(input.amount);
  if (isErr(amount)) return amount;
  const ar = need(acct, "accounts_receivable", "Accounts Receivable");
  const contra = resolve(acct, input.glAccountId, "concessions", "concessions");
  if (isErr(ar)) return ar;
  if (isErr(contra)) return contra;
  const allocations = (input.allocations || []).filter((a) => round2(a.amount) > 0);
  const applied = round2(allocations.reduce((s, a) => s + round2(a.amount), 0));
  const lines = [{ glAccountId: contra, debit: amount }];
  for (const a of allocations) lines.push({ glAccountId: ar, credit: round2(a.amount), appliesToEntryId: a.entryId });
  const rest = round2(amount - applied);
  if (rest > 0) lines.push({ glAccountId: ar, credit: rest });
  return { entry: baseEntry(input, "credit", "Credit"), lines, allocations, unapplied: rest };
}

// Bill: Dr expense line(s) / Cr Accounts Payable.
export function buildBill(input, acct) {
  const ap = need(acct, "accounts_payable", "Accounts Payable");
  if (isErr(ap)) return ap;
  const split = Array.isArray(input.lines) && input.lines.length
    ? input.lines
    : [{ glAccountId: input.glAccountId, amount: input.amount, jobId: input.jobId, unitId: input.unitId }];
  const lines = [];
  let total = 0;
  for (const s of split) {
    const amt = round2(s.amount);
    if (amt <= 0) continue;
    const exp = resolve(acct, s.glAccountId, "repairs_maintenance", "expense");
    if (isErr(exp)) return exp;
    lines.push({ glAccountId: exp, debit: amt, memo: s.memo, jobId: s.jobId || input.jobId, ...(s.unitId ? { unitId: s.unitId } : {}) });
    total = round2(total + amt);
  }
  if (total <= 0) return { error: "Enter an amount greater than zero." };
  lines.push({ glAccountId: ap, credit: total });
  return { entry: baseEntry(input, "bill", "Bill"), lines };
}

// Bill payment: Dr AP (settling the bill entry) / Cr cash.
export function buildBillPayment(input, acct) {
  const amount = checkAmount(input.amount);
  if (isErr(amount)) return amount;
  const ap = need(acct, "accounts_payable", "Accounts Payable");
  const cash = resolve(acct, input.cashGlAccountId, input.cashKey || "trust_cash", "cash");
  if (isErr(ap)) return ap;
  if (isErr(cash)) return cash;
  return {
    entry: baseEntry(input, "bill_payment", input.method ? `Bill payment · ${input.method}` : "Bill payment"),
    lines: [
      { glAccountId: ap, debit: amount, appliesToEntryId: input.billEntryId || null },
      { glAccountId: cash, credit: amount, bankAccountId: input.bankAccountId || null },
    ],
  };
}

// Owner distribution: Dr Owner Distributions / Cr trust cash.
export function buildDistribution(input, acct) {
  const amount = checkAmount(input.amount);
  if (isErr(amount)) return amount;
  const dist = need(acct, "owner_distributions", "Owner Distributions");
  const cash = resolve(acct, input.cashGlAccountId, "trust_cash", "trust cash");
  if (isErr(dist)) return dist;
  if (isErr(cash)) return cash;
  return {
    entry: baseEntry(input, "distribution", "Owner distribution"),
    lines: [
      { glAccountId: dist, debit: amount },
      { glAccountId: cash, credit: amount, bankAccountId: input.bankAccountId || null },
    ],
  };
}

// Owner contribution: Dr trust cash / Cr Owner Contributions.
export function buildContribution(input, acct) {
  const amount = checkAmount(input.amount);
  if (isErr(amount)) return amount;
  const contrib = need(acct, "owner_contributions", "Owner Contributions");
  const cash = resolve(acct, input.cashGlAccountId, "trust_cash", "trust cash");
  if (isErr(contrib)) return contrib;
  if (isErr(cash)) return cash;
  return {
    entry: baseEntry(input, "contribution", "Owner contribution"),
    lines: [
      { glAccountId: cash, debit: amount, bankAccountId: input.bankAccountId || null },
      { glAccountId: contrib, credit: amount },
    ],
  };
}

// Management fee: the owner's property pays the fee out of trust (Dr fee
// expense / Cr trust cash); the manager books it (Dr operating cash / Cr fee
// income) on lines without the owner dimension so trust stays separate.
export function buildManagementFee(input, acct) {
  const amount = checkAmount(input.amount);
  if (isErr(amount)) return amount;
  const keys = ["management_fees", "trust_cash", "operating_cash", "management_fee_income"];
  const ids = keys.map((k) => need(acct, k, k.replace(/_/g, " ")));
  const bad = ids.find(isErr);
  if (bad) return bad;
  const [expense, trust, operating, income] = ids;
  return {
    entry: baseEntry(input, "management_fee", "Management fee"),
    lines: [
      { glAccountId: expense, debit: amount },
      { glAccountId: trust, credit: amount },
      { glAccountId: operating, debit: amount, ownerId: null, leaseId: null, tenantId: null },
      { glAccountId: income, credit: amount, ownerId: null, leaseId: null, tenantId: null },
    ],
  };
}

// Deposit received: Dr deposit trust cash / Cr Security Deposits Held.
export function buildDepositHeld(input, acct) {
  const amount = checkAmount(input.amount);
  if (isErr(amount)) return amount;
  const cash = resolve(acct, input.cashGlAccountId, "deposit_cash", "deposit trust cash");
  const liab = need(acct, "security_deposits", "Security Deposits Held");
  if (isErr(cash)) return cash;
  if (isErr(liab)) return liab;
  return {
    entry: baseEntry(input, "deposit_held", "Security deposit received"),
    lines: [
      { glAccountId: cash, debit: amount, bankAccountId: input.bankAccountId || null },
      { glAccountId: liab, credit: amount },
    ],
  };
}

// Deposit return: Dr Security Deposits Held / Cr deposit cash (refund) and/or
// Cr AR (amount withheld against open charges).
export function buildDepositReturn(input, acct) {
  const refund = round2(input.refundAmount ?? input.amount);
  const applied = round2(input.appliedToCharges || 0);
  const total = round2(refund + applied);
  if (total <= 0) return { error: "Enter an amount greater than zero." };
  const liab = need(acct, "security_deposits", "Security Deposits Held");
  const cash = resolve(acct, input.cashGlAccountId, "deposit_cash", "deposit trust cash");
  const ar = need(acct, "accounts_receivable", "Accounts Receivable");
  for (const v of [liab, cash, ar]) if (isErr(v)) return v;
  const lines = [{ glAccountId: liab, debit: total }];
  if (refund > 0) lines.push({ glAccountId: cash, credit: refund, bankAccountId: input.bankAccountId || null });
  for (const a of input.allocations || []) if (round2(a.amount) > 0) lines.push({ glAccountId: ar, credit: round2(a.amount), appliesToEntryId: a.entryId });
  const allocated = round2((input.allocations || []).reduce((s, a) => s + round2(a.amount), 0));
  if (applied - allocated > 0) lines.push({ glAccountId: ar, credit: round2(applied - allocated) });
  return { entry: baseEntry(input, "deposit_return", "Security deposit returned"), lines };
}

// Deposit interest accrual: Dr Deposit Interest Expense / Cr Deposit Interest Payable.
export function buildDepositInterest(input, acct) {
  const amount = checkAmount(input.amount);
  if (isErr(amount)) return amount;
  const exp = need(acct, "deposit_interest", "Deposit Interest Expense");
  const pay = need(acct, "deposit_interest_payable", "Deposit Interest Payable");
  if (isErr(exp)) return exp;
  if (isErr(pay)) return pay;
  return {
    entry: baseEntry(input, "deposit_interest", "Deposit interest accrued"),
    lines: [
      { glAccountId: exp, debit: amount },
      { glAccountId: pay, credit: amount },
    ],
  };
}

// Free-form journal entry: lines [{ glAccountId, debit, credit, memo, …dims }].
export function buildJournal(input) {
  const lines = (input.lines || [])
    .map((l) => ({ ...l, debit: round2(l.debit), credit: round2(l.credit) }))
    .filter((l) => l.debit > 0 || l.credit > 0);
  if (lines.some((l) => !l.glAccountId)) return { error: "Every line needs an account." };
  if (lines.length < 2) return { error: "A journal entry needs at least two lines." };
  const dr = round2(lines.reduce((s, l) => s + l.debit, 0));
  const cr = round2(lines.reduce((s, l) => s + l.credit, 0));
  if (dr !== cr) return { error: `Debits (${dr.toFixed(2)}) and credits (${cr.toFixed(2)}) must match.` };
  return { entry: baseEntry(input, "adjustment", "Journal entry"), lines };
}

// Cash-basis transaction: money in (Dr cash / Cr account), out (Dr account /
// Cr cash) or a transfer between two cash accounts (Dr to / Cr from).
export function buildCashTransaction(input, acct) {
  const amount = checkAmount(input.amount);
  if (isErr(amount)) return amount;
  const cash = resolve(acct, input.cashGlAccountId, "operating_cash", "operating cash");
  if (isErr(cash)) return cash;
  const bank = input.bankAccountId || null;
  if (input.direction === "transfer") {
    const to = resolve(acct, input.toCashGlAccountId, "operating_cash", "operating cash");
    if (isErr(to)) return to;
    if (to === cash) return { error: "Pick two different accounts for a transfer." };
    return {
      entry: baseEntry(input, "adjustment", "Transfer"),
      lines: [
        { glAccountId: to, debit: amount, bankAccountId: input.toBankAccountId || null },
        { glAccountId: cash, credit: amount, bankAccountId: bank },
      ],
    };
  }
  const other = acct.byId.has(input.glAccountId) ? input.glAccountId : null;
  if (!other) return { error: "Pick the income or expense account for this transaction." };
  const inflow = input.direction === "in";
  return {
    entry: baseEntry(input, "adjustment", inflow ? "Income" : "Expense"),
    lines: inflow
      ? [{ glAccountId: cash, debit: amount, bankAccountId: bank }, { glAccountId: other, credit: amount }]
      : [{ glAccountId: other, debit: amount }, { glAccountId: cash, credit: amount, bankAccountId: bank }],
  };
}

export const BUILDERS = {
  charge: buildCharge,
  late_fee: (input, acct) => buildCharge({ ...input, sourceType: "late_fee" }, acct),
  payment: buildPayment,
  credit: buildCredit,
  bill: buildBill,
  bill_payment: buildBillPayment,
  distribution: buildDistribution,
  contribution: buildContribution,
  management_fee: buildManagementFee,
  deposit_held: buildDepositHeld,
  deposit_return: buildDepositReturn,
  deposit_interest: buildDepositInterest,
  adjustment: buildJournal,
  cash: buildCashTransaction,
};

// --- Sub-ledger math ----------------------------------------------------------

// Lines → balances for a scope. `accounts` = index from indexAccounts().
export function summarize(lines, accounts) {
  const out = {
    receivable: 0,
    payable: 0,
    depositsHeld: 0,
    prepaid: 0,
    trustCash: 0,
    operatingCash: 0,
    cash: 0,
    income: 0,
    expense: 0,
    net: 0,
    contributions: 0,
    distributions: 0,
    byAccount: [],
  };
  const per = new Map();
  for (const l of lines) {
    const a = accounts.byId.get(l.glAccountId);
    if (!a) continue;
    const dr = Number(l.debit) || 0;
    const cr = Number(l.credit) || 0;
    const row = per.get(a.id) || { glAccountId: a.id, name: a.name, number: a.number, accountType: a.accountType, subtype: a.subtype, isTrust: a.isTrust, debit: 0, credit: 0, balance: 0 };
    row.debit += dr;
    row.credit += cr;
    per.set(a.id, row);
    if (a.subtype === "receivable") out.receivable += dr - cr;
    else if (a.subtype === "payable") out.payable += cr - dr;
    else if (a.subtype === "deposits") out.depositsHeld += cr - dr;
    else if (a.subtype === "prepaid") out.prepaid += cr - dr;
    else if (a.subtype === "cash") {
      out.cash += dr - cr;
      if (a.isTrust) out.trustCash += dr - cr;
      else out.operatingCash += dr - cr;
    } else if (a.subtype === "contribution") out.contributions += cr - dr;
    else if (a.subtype === "distribution") out.distributions += dr - cr;
    if (a.accountType === "Income") out.income += cr - dr;
    if (a.accountType === "Expense") out.expense += dr - cr;
  }
  for (const row of per.values()) {
    row.debit = round2(row.debit);
    row.credit = round2(row.credit);
    row.balance = round2(isDebitNormal(row.accountType) ? row.debit - row.credit : row.credit - row.debit);
    out.byAccount.push(row);
  }
  out.byAccount.sort((x, y) => String(x.number).localeCompare(String(y.number), undefined, { numeric: true }));
  for (const k of Object.keys(out)) if (typeof out[k] === "number") out[k] = round2(out[k]);
  out.net = round2(out.income - out.expense);
  return out;
}

// Open receivable items: charge-like entries (AR debits not applied to anything)
// less whatever has been applied to them. lines carry `entry` (status/reversal).
export function openItems(lines, accounts, subtype = "receivable") {
  const sign = subtype === "payable" ? -1 : 1;
  const items = new Map();
  const applied = new Map();
  for (const l of lines) {
    const a = accounts.byId.get(l.glAccountId);
    if (!a || a.subtype !== subtype) continue;
    const amt = sign * ((Number(l.debit) || 0) - (Number(l.credit) || 0));
    if (l.appliesToEntryId) {
      applied.set(l.appliesToEntryId, (applied.get(l.appliesToEntryId) || 0) + amt);
      continue;
    }
    const e = l.entry || {};
    if (e.status === "void" || e.reversalOf || amt <= 0) continue;
    const item = items.get(l.entryId) || {
      entryId: l.entryId,
      date: l.date,
      memo: e.memo || l.memo,
      sourceType: e.sourceType || "",
      sourceId: e.sourceId || "",
      amount: 0,
    };
    item.amount += amt;
    items.set(l.entryId, item);
  }
  return [...items.values()]
    .map((i) => {
      const paid = -(applied.get(i.entryId) || 0);
      return { ...i, amount: round2(i.amount), paid: round2(paid), open: round2(i.amount - paid) };
    })
    .filter((i) => i.open > 0.004)
    .sort((x, y) => String(x.date).localeCompare(String(y.date)));
}

// Spread `amount` over open items oldest-first → [{ entryId, amount }] + remainder.
export function allocateOldestFirst(items, amount) {
  let left = round2(amount);
  const allocations = [];
  for (const i of items) {
    if (left <= 0) break;
    const take = round2(Math.min(left, i.open));
    if (take > 0) {
      allocations.push({ entryId: i.entryId, amount: take });
      left = round2(left - take);
    }
  }
  return { allocations, unapplied: left };
}

// Scope → which lines drive its running balance and how they're signed.
export const SCOPE_FOCUS = {
  lease: { subtypes: ["receivable"], sign: 1, label: "Balance owed" },
  tenant: { subtypes: ["receivable"], sign: 1, label: "Balance owed" },
  vendor: { subtypes: ["payable"], sign: -1, label: "Payable" },
  owner: { subtypes: ["cash"], trustOnly: true, sign: 1, label: "Owner funds in trust" },
  property: { subtypes: ["cash"], sign: 1, label: "Cash" },
  bank_account: { subtypes: ["cash"], sign: 1, label: "Book balance" },
  job: { types: ["Expense", "Asset"], sign: 1, label: "Job cost" },
  account: { normal: true, sign: 1, label: "Balance" },
};

// Does a line count toward a scope's running balance?
export function inFocus(scope, line, account) {
  const f = SCOPE_FOCUS[scope];
  if (!f || !account) return false;
  if (f.normal) return true;
  if (f.types) return f.types.includes(account.accountType);
  if (!f.subtypes.includes(account.subtype)) return false;
  return f.trustOnly ? account.isTrust : true;
}

// Signed effect of one line on its scope balance.
export function focusAmount(scope, line, account) {
  const f = SCOPE_FOCUS[scope];
  const net = (Number(line.debit) || 0) - (Number(line.credit) || 0);
  if (f?.normal) return isDebitNormal(account?.accountType) ? net : -net;
  return (f?.sign ?? 1) * net;
}

// Group focus lines per entry, oldest first, with a running balance.
export function runningLedger(scope, lines, accounts) {
  const byEntry = new Map();
  for (const l of lines) {
    const a = accounts.byId.get(l.glAccountId);
    if (!inFocus(scope, l, a)) continue;
    const row = byEntry.get(l.entryId) || {
      entryId: l.entryId,
      date: l.date,
      memo: l.entry?.memo || l.memo,
      sourceType: l.entry?.sourceType || "adjustment",
      sourceId: l.entry?.sourceId || "",
      status: l.entry?.status || "posted",
      reversalOf: l.entry?.reversalOf || "",
      createdAt: l.entry?.createdAt || "",
      accounts: new Set(),
      charge: 0,
      payment: 0,
      amount: 0,
      lines: [],
    };
    const amt = focusAmount(scope, l, a);
    row.amount += amt;
    if (amt >= 0) row.charge += amt;
    else row.payment -= amt;
    row.accounts.add(accountLabel(a));
    row.lines.push(l);
    byEntry.set(l.entryId, row);
  }
  const rows = [...byEntry.values()].sort(
    (x, y) => String(x.date).localeCompare(String(y.date)) || String(x.createdAt).localeCompare(String(y.createdAt)),
  );
  let bal = 0;
  for (const r of rows) {
    r.amount = round2(r.amount);
    r.charge = round2(r.charge);
    r.payment = round2(r.payment);
    bal = round2(bal + r.amount);
    r.balance = bal;
    r.accounts = [...r.accounts].filter(Boolean).join(", ");
  }
  return rows;
}

// Health checks over a set of entries + lines.
export function diagnose(entries, lines, accounts) {
  const sums = new Map();
  const missingGl = [];
  for (const l of lines) {
    const s = sums.get(l.entryId) || { debit: 0, credit: 0, count: 0 };
    s.debit += Number(l.debit) || 0;
    s.credit += Number(l.credit) || 0;
    s.count += 1;
    sums.set(l.entryId, s);
    if (!l.glAccountId || !accounts.byId.has(l.glAccountId)) missingGl.push(l);
  }
  const unbalanced = entries
    .map((e) => ({ ...e, ...(sums.get(e.id) || { debit: 0, credit: 0, count: 0 }) }))
    .filter((e) => round2(e.debit) !== round2(e.credit) || e.count < 2);
  const trust = new Map();
  for (const l of lines) {
    const a = accounts.byId.get(l.glAccountId);
    if (!a || !a.isTrust || a.subtype !== "cash") continue;
    const key = `${a.id}|${l.ownerId || ""}|${l.propertyId || ""}`;
    const t = trust.get(key) || { glAccountId: a.id, accountName: accountLabel(a), ownerId: l.ownerId, propertyId: l.propertyId, balance: 0 };
    t.balance += (Number(l.debit) || 0) - (Number(l.credit) || 0);
    trust.set(key, t);
  }
  const negativeTrust = [...trust.values()]
    .map((t) => ({ ...t, balance: round2(t.balance) }))
    .filter((t) => t.balance < 0);
  return { unbalanced, missingGl, negativeTrust };
}
