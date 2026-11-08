// Pure double-entry helpers shared by the browser data layer (lib/supabase/ledger.js)
// and the server jobs (lib/jobs/financial.js): view-model normalizers, posting
// builders that turn a business event into balanced lines, and the sub-ledger
// math (balances, open charges, oldest-first allocation). No I/O here.

import { isOwnerSpecific } from "./ownership";

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
  "concession",
  "write_off",
  "bank_deposit",
  "payment_plan",
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
  concession: "Concession",
  write_off: "Write-off",
  bank_deposit: "Bank deposit",
  payment_plan: "Payment plan",
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
    bankDepositId: row.bank_deposit_id ?? "",
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
  };
  for (const [k, col] of Object.entries(DIMENSIONS)) out[k] = row[col] ?? "";
  return out;
}

// Built posting ({ entry, lines } in camel) → ledger_post RPC args (snake).
// Owner dimension (CORE-08): owner_id survives only on owner-specific entries; other postings are property-level.
export function toRpcArgs({ entry, lines }, { projectId, createdBy } = {}) {
  const ownerSpecific = isOwnerSpecific(entry);
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
  if (!ownerSpecific) e.owner_id = null;
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
    if (!ownerSpecific && "owner_id" in out) out.owner_id = null;
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

// Receivables a resident posting can hit (input.arKey): tenant AR by default, or the housing-assistance receivable (HOUS-01).
export const AR_KEYS = { accounts_receivable: "Accounts Receivable", subsidy_receivable: "Housing Assistance Receivable" };
export const AR_SUBTYPES = { accounts_receivable: "receivable", subsidy_receivable: "subsidy_receivable" };
export const arSubtypeOf = (arKey) => AR_SUBTYPES[arKey] || "receivable";
const arOf = (acct, input) => {
  const key = AR_KEYS[input.arKey] ? input.arKey : "accounts_receivable";
  return need(acct, key, AR_KEYS[key]);
};

// Charge: Dr Accounts Receivable / Cr income (rent by default; a recurring charge without a GL falls back to Other Income, CORE-03).
export function buildCharge(input, acct) {
  const amount = checkAmount(input.amount);
  if (isErr(amount)) return amount;
  const ar = arOf(acct, input);
  const fallback = input.metadata?.recurringChargeId ? "other_income" : "rent_income";
  const key = input.sourceType === "late_fee" ? "late_fee_income" : input.incomeKey || fallback;
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
  const ar = arOf(acct, input);
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
  const ar = arOf(acct, input);
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

// Rent true-up (CORE-01): above zero Dr AR / Cr rent income; below zero Dr rent income / Cr AR applied via input.allocations (buildCredit).
export function buildRentAdjustment(input, acct) {
  const amount = round2(input.amount);
  if (!amount) return { error: "Nothing to adjust." };
  const income = resolve(acct, input.glAccountId, "rent_income", "Rental Income");
  if (isErr(income)) return income;
  const memo = input.memo || "Rent adjustment";
  if (amount > 0) return buildCharge({ ...input, amount, glAccountId: income, sourceType: "charge", memo }, acct);
  return buildCredit({ ...input, amount: -amount, glAccountId: income, sourceType: "credit", memo }, acct);
}

// HAP charge (HOUS-01): Dr Housing Assistance Receivable / Cr rent income, billed to the housing authority; no tenant or owner on the lines (CORE-08).
export function buildHapCharge(input, acct) {
  const { tenantId: _tenant, ownerId: _owner, ...rest } = input;
  const metadata = {
    ...(input.metadata || {}),
    payer: "housing_authority",
    ...(input.housingAuthorityId ? { housingAuthorityId: input.housingAuthorityId } : {}),
    ...(input.hapContractId ? { hapContractId: input.hapContractId } : {}),
    ...(input.period ? { period: input.period } : {}),
  };
  const built = buildCharge({ ...rest, sourceType: "charge", arKey: "subsidy_receivable", memo: input.memo || "Housing assistance share", metadata }, acct);
  if (built.error) return built;
  return { ...built, lines: built.lines.map((l) => ({ ...l, tenantId: null })) };
}

// HAP true-up: above zero a HAP charge; below zero Dr rent income / Cr Housing Assistance Receivable applied via input.allocations.
export function buildHapAdjustment(input, acct) {
  const amount = round2(input.amount);
  if (!amount) return { error: "Nothing to adjust." };
  const income = resolve(acct, input.glAccountId, "rent_income", "Rental Income");
  if (isErr(income)) return income;
  const memo = input.memo || "Housing assistance adjustment";
  if (amount > 0) return buildHapCharge({ ...input, amount, glAccountId: income, memo }, acct);
  const { tenantId: _tenant, ownerId: _owner, ...rest } = input;
  const built = buildCredit(
    { ...rest, amount: -amount, glAccountId: income, sourceType: "credit", arKey: "subsidy_receivable", memo, metadata: { ...(input.metadata || {}), payer: "housing_authority" } },
    acct,
  );
  if (built.error) return built;
  return { ...built, lines: built.lines.map((l) => ({ ...l, tenantId: null })) };
}

// Move open AR between leases → { entries, uncovered }: each item Dr AR new (originalDate) / Cr AR old applied to it, each credit source Dr AR old applied to it / Cr AR new up to input.credit; keys xfer:<to>:<item> / xfer:<to>:credit:<src>, :<seq> when re-opened.
export function buildArTransfer(input, acct) {
  const ar = need(acct, "accounts_receivable", "Accounts Receivable");
  if (isErr(ar)) return ar;
  const { fromLeaseId, toLeaseId } = input;
  if (!fromLeaseId || !toLeaseId) return { error: "Pick both leases for the transfer." };
  const side = (leaseId, d = {}) => ({ leaseId, tenantId: d.tenantId || null, unitId: d.unitId || null, propertyId: d.propertyId || null });
  const from = side(fromLeaseId, input.from);
  const to = side(toLeaseId, input.to);
  const head = { date: input.date, sourceId: toLeaseId, ...to };
  const keyOf = (base, seq) => (Number(seq) > 1 ? `${base}:${Number(seq)}` : base);
  const entries = [];
  for (const item of input.items || []) {
    const amount = round2(item.open ?? item.amount);
    if (!(amount > 0) || !item.entryId) continue;
    const originalDate = item.originalDate || item.date || "";
    entries.push({
      entry: baseEntry(
        {
          ...head,
          memo: `Carried to the new lease · ${item.memo || "Open charge"}`,
          idempotencyKey: keyOf(`xfer:${toLeaseId}:${item.entryId}`, item.seq),
          metadata: { transfer: true, transferredFrom: fromLeaseId, itemEntryId: item.entryId, originalDate },
        },
        "adjustment",
      ),
      lines: [
        { glAccountId: ar, debit: amount, ...to, metadata: { transferredFrom: fromLeaseId, transferredEntryId: item.entryId, originalDate } },
        { glAccountId: ar, credit: amount, ...from, appliesToEntryId: item.entryId },
      ],
    });
  }
  let left = round2(input.credit);
  for (const src of input.creditSources || []) {
    if (!(left > 0)) break;
    const take = round2(Math.min(left, Number(src.amount) || 0));
    if (!(take > 0) || !src.entryId) continue;
    left = round2(left - take);
    entries.push({
      entry: baseEntry(
        {
          ...head,
          memo: "Unapplied credit carried to the new lease",
          idempotencyKey: keyOf(`xfer:${toLeaseId}:credit:${src.entryId}`, src.seq),
          metadata: { transfer: true, transferredFrom: fromLeaseId, creditEntryId: src.entryId },
        },
        "adjustment",
      ),
      lines: [
        { glAccountId: ar, debit: take, ...from, appliesToEntryId: src.entryId },
        { glAccountId: ar, credit: take, ...to, metadata: { transferredFrom: fromLeaseId, transferredEntryId: src.entryId } },
      ],
    });
  }
  return { entries, uncovered: left > 0 ? left : 0 };
}

// Bill: Dr expense line(s) / Cr Accounts Payable; a deposit refund's lines debit 2100 / 2110 (CORE-04) and carry line metadata.
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
    lines.push({ glAccountId: exp, debit: amt, memo: s.memo, jobId: s.jobId || input.jobId, ...(s.unitId ? { unitId: s.unitId } : {}), ...(s.metadata ? { metadata: s.metadata } : {}) });
    total = round2(total + amt);
  }
  if (total <= 0) return { error: "Enter an amount greater than zero." };
  lines.push({ glAccountId: ap, credit: total, ...(input.apMetadata ? { metadata: input.apMetadata } : {}) });
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

// Management fee: Dr fee expense / Cr trust cash for the property; the manager's Dr operating cash / Cr fee income lines are marked side "manager" (no owner's share).
export function buildManagementFee(input, acct) {
  const amount = checkAmount(input.amount);
  if (isErr(amount)) return amount;
  const keys = ["management_fees", "trust_cash", "operating_cash", "management_fee_income"];
  const ids = keys.map((k) => need(acct, k, k.replace(/_/g, " ")));
  const bad = ids.find(isErr);
  if (bad) return bad;
  const [expense, trust, operating, income] = ids;
  const manager = { ownerId: null, leaseId: null, tenantId: null, metadata: { side: "manager" } };
  return {
    entry: baseEntry(input, "management_fee", "Management fee"),
    lines: [
      { glAccountId: expense, debit: amount },
      { glAccountId: trust, credit: amount },
      { glAccountId: operating, debit: amount, ...manager },
      { glAccountId: income, credit: amount, ...manager },
    ],
  };
}

// Deposit postings (CORE-04) stamp line metadata { depositId } so balances can be read per deposit record.
const depositMeta = (input) => (input.depositId ? { metadata: { depositId: input.depositId } } : {});

// Deposit received outside AR (opening balances, takeovers): Dr the cash it landed in (deposit trust by default) / Cr Security Deposits Held.
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
      { glAccountId: cash, debit: amount, bankAccountId: input.bankAccountId || null, ...depositMeta(input) },
      { glAccountId: liab, credit: amount, ...depositMeta(input) },
    ],
  };
}

// Deposit billed through AR (activation / move-in): Dr Accounts Receivable / Cr Security Deposits Held.
export function buildDepositCharge(input, acct) {
  const amount = checkAmount(input.amount);
  if (isErr(amount)) return amount;
  const ar = need(acct, "accounts_receivable", "Accounts Receivable");
  const liab = need(acct, "security_deposits", "Security Deposits Held");
  if (isErr(ar)) return ar;
  if (isErr(liab)) return liab;
  return {
    entry: baseEntry(input, "deposit_held", "Security deposit"),
    lines: [
      { glAccountId: ar, debit: amount, ...depositMeta(input) },
      { glAccountId: liab, credit: amount, ...depositMeta(input) },
    ],
  };
}

// Apply a deposit (+ interest) to open charges: Dr 2100 heldAmount [+ Dr 2110 interestAmount] / Cr AR per allocation.
export function buildDepositApply(input, acct) {
  const held = round2(input.heldAmount);
  const interest = round2(input.interestAmount);
  const allocations = (input.allocations || []).filter((a) => round2(a.amount) > 0 && a.entryId);
  const applied = round2(allocations.reduce((s, a) => s + round2(a.amount), 0));
  if (!(applied > 0)) return { error: "There are no open charges to apply the deposit to." };
  if (held < 0 || interest < 0 || Math.abs(round2(held + interest) - applied) > 0.004) return { error: "The deposit applied must equal the charges it settles." };
  const ar = need(acct, "accounts_receivable", "Accounts Receivable");
  const liab = need(acct, "security_deposits", "Security Deposits Held");
  const pay = interest > 0 ? need(acct, "deposit_interest_payable", "Deposit Interest Payable") : null;
  for (const v of [ar, liab, pay]) if (isErr(v)) return v;
  const lines = [];
  if (held > 0) lines.push({ glAccountId: liab, debit: held, ...depositMeta(input) });
  if (interest > 0) lines.push({ glAccountId: pay, debit: interest, ...depositMeta(input) });
  for (const a of allocations) lines.push({ glAccountId: ar, credit: round2(a.amount), appliesToEntryId: a.entryId, ...depositMeta(input) });
  return { entry: baseEntry(input, "deposit_return", "Security deposit applied to charges"), lines };
}

// Interest paid as a credit (policy annual_credit): Dr Deposit Interest Payable / Cr AR, allocated like a payment.
export function buildDepositInterestCredit(input, acct) {
  const amount = checkAmount(input.amount);
  if (isErr(amount)) return amount;
  const ar = need(acct, "accounts_receivable", "Accounts Receivable");
  const pay = need(acct, "deposit_interest_payable", "Deposit Interest Payable");
  if (isErr(ar)) return ar;
  if (isErr(pay)) return pay;
  const allocations = (input.allocations || []).filter((a) => round2(a.amount) > 0 && a.entryId);
  const applied = round2(allocations.reduce((s, a) => s + round2(a.amount), 0));
  if (applied - amount > 0.004) return { error: "Allocations exceed the interest credited." };
  const lines = [{ glAccountId: pay, debit: amount, ...depositMeta(input) }];
  for (const a of allocations) lines.push({ glAccountId: ar, credit: round2(a.amount), appliesToEntryId: a.entryId });
  const rest = round2(amount - applied);
  if (rest > 0) lines.push({ glAccountId: ar, credit: rest, memo: "Unapplied credit" });
  return { entry: baseEntry(input, "deposit_return", "Deposit interest credited"), lines };
}

// Move deposit cash between banks (sweep into the deposit bank, release to operating trust): Dr to / Cr from, both tagged.
export function buildDepositTransfer(input, acct) {
  const amount = checkAmount(input.amount);
  if (isErr(amount)) return amount;
  const to = acct.byId.has(input.toGlAccountId) ? input.toGlAccountId : null;
  const from = acct.byId.has(input.fromGlAccountId) ? input.fromGlAccountId : null;
  if (!to || !from) return { error: "Pick both cash accounts for the transfer." };
  if (to === from && (input.toBankAccountId || null) === (input.fromBankAccountId || null)) return { error: "Pick two different accounts for a transfer." };
  return {
    entry: baseEntry(input, "adjustment", "Deposit transfer"),
    lines: [
      { glAccountId: to, debit: amount, bankAccountId: input.toBankAccountId || null, ...depositMeta(input) },
      { glAccountId: from, credit: amount, bankAccountId: input.fromBankAccountId || null, ...depositMeta(input) },
    ],
  };
}

// Legacy deposit return: Dr Security Deposits Held / Cr AR (amount withheld against open charges); refunds go through AP (CORE-04), so a cash refund needs input.legacyCashRefund (demo seed history only).
export function buildDepositReturn(input, acct) {
  const refund = round2(input.refundAmount ?? input.amount);
  const applied = round2(input.appliedToCharges || 0);
  if (refund > 0 && !input.legacyCashRefund) return { error: "Deposit refunds are paid through Accounts Payable — dispose the deposit from its record." };
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
      { glAccountId: pay, credit: amount, ...depositMeta(input) },
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

// Bank deposit (CORE-16): Dr the bank's cash GL once per property / Cr 1050 Undeposited Funds once per payment (on that payment's lease, tenant, unit and property); server-only (not in BUILDERS).
export function buildBankDeposit(input, acct) {
  const und = need(acct, "undeposited_funds", "Undeposited Funds");
  if (isErr(und)) return und;
  const bank = input.bankGlAccountId && acct.byId.has(input.bankGlAccountId) ? input.bankGlAccountId : null;
  if (!bank) return { error: "Pick the bank account this deposit went into." };
  if (bank === und) return { error: "A deposit goes into a bank account, not Undeposited Funds." };
  const items = (input.items || []).map((i) => ({ ...i, amount: round2(i.amount) }));
  if (!items.length) return { error: "Pick at least one payment to deposit." };
  if (items.some((i) => !(i.amount > 0))) return { error: "Every payment in a deposit needs an amount above zero." };
  const byProperty = new Map();
  for (const i of items) byProperty.set(i.propertyId || "", round2((byProperty.get(i.propertyId || "") || 0) + i.amount));
  const total = round2(items.reduce((s, i) => s + i.amount, 0));
  const memo = ["Bank deposit", input.slipNumber ? `Slip ${input.slipNumber}` : "", `${items.length} item${items.length === 1 ? "" : "s"}`, input.memo].filter(Boolean).join(" · ");
  const lines = [...byProperty].map(([propertyId, amount]) => ({ glAccountId: bank, debit: amount, bankAccountId: input.bankAccountId || null, propertyId: propertyId || null, unitId: null, leaseId: null, tenantId: null, memo }));
  for (const i of items) {
    lines.push({
      glAccountId: und,
      credit: i.amount,
      propertyId: i.propertyId || null,
      unitId: i.unitId || null,
      leaseId: i.leaseId || null,
      tenantId: i.tenantId || null,
      memo: i.memo || "Deposited",
      metadata: { itemLineId: i.lineId, paymentEntryId: i.entryId },
    });
  }
  const props = [...byProperty.keys()];
  const entryInput = { ...input, propertyId: props.length === 1 && props[0] ? props[0] : undefined, memo };
  return { entry: baseEntry(entryInput, "bank_deposit", "Bank deposit"), lines, total };
}

// Returned deposited check (CORE-17): Dr 1050 Undeposited Funds on the payment's lease, tenant, unit and property / Cr the deposit bank's cash GL on the property; server-only (not in BUILDERS).
export function buildReturnedDeposit(input, acct) {
  const amount = checkAmount(input.amount);
  if (isErr(amount)) return amount;
  const und = need(acct, "undeposited_funds", "Undeposited Funds");
  if (isErr(und)) return und;
  const bank = input.bankGlAccountId && acct.byId.has(input.bankGlAccountId) ? input.bankGlAccountId : null;
  if (!bank || bank === und) return { error: "The bank account this check was deposited into has no cash GL account." };
  const memo = input.memo || "Returned check";
  const propertyId = input.propertyId || null;
  return {
    entry: baseEntry(input, "adjustment", "Returned check"),
    lines: [
      {
        glAccountId: und,
        debit: amount,
        propertyId,
        unitId: input.unitId || null,
        leaseId: input.leaseId || null,
        tenantId: input.tenantId || null,
        memo,
        metadata: { paymentEntryId: input.paymentEntryId || null, bankDepositId: input.bankDepositId || null },
      },
      { glAccountId: bank, credit: amount, bankAccountId: input.bankAccountId || null, propertyId, unitId: null, leaseId: null, tenantId: null, memo },
    ],
  };
}

// --- Opening balances (INTL-04) -------------------------------------------------
// Each posts against Opening Balance Equity (3950, the conversion's clearing account) unless noted, flags metadata.conversion and keys conv:<batchId>:<lineId>; server-only (not in BUILDERS).

// 3950 Opening Balance Equity: the conversion clears through it (INTL-04) and CORE-46 reuses it; 3900 stays Retained Earnings (CORE-40).
export const OPENING_BALANCE_EQUITY_KEY = "opening_balance_equity";
export const CONVERSION_CLEARING_KEY = OPENING_BALANCE_EQUITY_KEY;
export const conversionKey = (batchId, lineId) => `conv:${batchId}:${lineId}`;

function convEntry(input, sourceType, memo, extra = {}) {
  return baseEntry(
    {
      ...input,
      idempotencyKey: conversionKey(input.batchId, input.lineId),
      sourceId: input.sourceId || input.lineId || "",
      metadata: { ...(input.metadata || {}), ...extra, conversion: true, batchId: input.batchId, lineId: input.lineId },
    },
    sourceType,
    memo,
  );
}

const clearingOf = (acct) => need(acct, CONVERSION_CLEARING_KEY, "Opening Balance Equity");
// Clearing lines stay property-level: no lease, tenant, unit or vendor.
const clearingLine = (glAccountId, side, amount, input) => ({ glAccountId, [side]: amount, leaseId: null, tenantId: null, unitId: null, vendorId: null, propertyId: input.propertyId || null });
const signedAmount = (amount) => {
  const n = round2(amount);
  return n ? n : { error: "Enter an amount other than zero." };
};

// Tenant balance: Dr AR (lease, tenant, unit, property; originalDate for aging) / Cr clearing; metadata.chargeGl = the original charge's account.
export function buildConversionTenantBalance(input, acct) {
  const amount = checkAmount(input.amount);
  if (isErr(amount)) return amount;
  const ar = arOf(acct, input);
  const clearing = clearingOf(acct);
  if (isErr(ar)) return ar;
  if (isErr(clearing)) return clearing;
  const originalDate = input.originalDate || input.date;
  return {
    entry: convEntry(input, "charge", "Opening balance", { chargeGl: input.chargeGlAccountId || null, originalDate }),
    lines: [
      { glAccountId: ar, debit: amount, metadata: { originalDate, ...(input.chargeGlAccountId ? { chargeGl: input.chargeGlAccountId } : {}) } },
      clearingLine(clearing, "credit", amount, input),
    ],
  };
}

// Tenant credit / prepaid rent: Dr trust cash (bank) / Cr Prepaid Rent 2200, both on the lease (no owner: resident money, CORE-08).
export function buildConversionTenantCredit(input, acct) {
  const amount = checkAmount(input.amount);
  if (isErr(amount)) return amount;
  const cash = resolve(acct, input.cashGlAccountId, "trust_cash", "trust cash");
  const prepaid = need(acct, "prepaid_rent", "Prepaid Rent");
  if (isErr(cash)) return cash;
  if (isErr(prepaid)) return prepaid;
  return {
    entry: convEntry(input, "adjustment", "Opening tenant credit"),
    lines: [
      { glAccountId: cash, debit: amount, bankAccountId: input.bankAccountId || null },
      { glAccountId: prepaid, credit: amount },
    ],
  };
}

// Deposit held: Dr the deposit's cash (bank) principal + interest / Cr 2100 principal [+ Cr 2110 interest], tagged with the deposit record.
export function buildConversionDeposit(input, acct) {
  const amount = checkAmount(input.amount);
  if (isErr(amount)) return amount;
  const interest = round2(input.interest);
  if (interest < 0) return { error: "Interest held can't be negative." };
  const cash = resolve(acct, input.cashGlAccountId, "deposit_cash", "deposit trust cash");
  const liab = need(acct, "security_deposits", "Security Deposits Held");
  const pay = interest > 0 ? need(acct, "deposit_interest_payable", "Deposit Interest Payable") : null;
  for (const v of [cash, liab, pay]) if (isErr(v)) return v;
  const tag = depositMeta(input);
  const lines = [
    { glAccountId: cash, debit: round2(amount + interest), bankAccountId: input.bankAccountId || null, ...tag },
    { glAccountId: liab, credit: amount, ...tag },
  ];
  if (interest > 0) lines.push({ glAccountId: pay, credit: interest, ...tag });
  return { entry: convEntry(input, "deposit_held", "Opening security deposit", input.depositId ? { depositId: input.depositId } : {}), lines };
}

// Owner balance (signed): Dr trust cash / Cr clearing, reversed when negative; an owner on the line makes it owner-specific (CORE-08), else it splits by ownership.
export function buildConversionOwnerBalance(input, acct) {
  const amount = signedAmount(input.amount);
  if (isErr(amount)) return amount;
  const cash = resolve(acct, input.cashGlAccountId, "trust_cash", "trust cash");
  const clearing = clearingOf(acct);
  if (isErr(cash)) return cash;
  if (isErr(clearing)) return clearing;
  const abs = Math.abs(amount);
  const cashLine = { glAccountId: cash, [amount > 0 ? "debit" : "credit"]: abs, bankAccountId: input.bankAccountId || null };
  const clear = { glAccountId: clearing, [amount > 0 ? "credit" : "debit"]: abs };
  return {
    entry: convEntry(input, "adjustment", "Opening owner balance", input.ownerId ? { ownerExplicit: true } : {}),
    lines: amount > 0 ? [cashLine, clear] : [clear, cashLine],
  };
}

// Unpaid bill: Dr clearing / Cr AP (vendor, property; originalDate = bill date); the server also writes the bills row.
export function buildConversionBill(input, acct) {
  const amount = checkAmount(input.amount);
  if (isErr(amount)) return amount;
  const ap = need(acct, "accounts_payable", "Accounts Payable");
  const clearing = clearingOf(acct);
  if (isErr(ap)) return ap;
  if (isErr(clearing)) return clearing;
  const originalDate = input.originalDate || input.date;
  const extra = { originalDate, ...(input.dueDate ? { dueDate: input.dueDate } : {}), ...(input.reference ? { reference: input.reference } : {}), ...(input.billId ? { billId: input.billId } : {}) };
  return {
    entry: convEntry(input, "bill", "Opening bill", extra),
    lines: [clearingLine(clearing, "debit", amount, input), { glAccountId: ap, credit: amount, metadata: { originalDate } }],
  };
}

// Any other balance (signed, debit-positive): Dr account / Cr clearing, reversed when negative; cash accounts carry their bank.
export function buildConversionGlBalance(input, acct) {
  const amount = signedAmount(input.amount);
  if (isErr(amount)) return amount;
  const account = acct.byId.get(input.glAccountId);
  if (!account) return { error: "Pick the account for this balance." };
  const clearing = clearingOf(acct);
  if (isErr(clearing)) return clearing;
  if (account.id === clearing) return { error: "Opening Balance Equity (3950) clears the conversion, so it can't take a balance of its own." };
  const abs = Math.abs(amount);
  const line = { glAccountId: account.id, [amount > 0 ? "debit" : "credit"]: abs, ...(account.subtype === "cash" ? { bankAccountId: input.bankAccountId || null } : {}) };
  const clear = clearingLine(clearing, amount > 0 ? "credit" : "debit", abs, input);
  return {
    entry: convEntry(input, "adjustment", "Opening balance", input.ownerId ? { ownerExplicit: true } : {}),
    lines: amount > 0 ? [line, clear] : [clear, line],
  };
}

// Outstanding bank item: two lines on the bank's cash GL that net to zero (per owner when tagged) — the cleared half is in the old statement, the other half is still outstanding.
export function buildConversionOutstanding(input, acct) {
  const amount = checkAmount(input.amount);
  if (isErr(amount)) return amount;
  const type = input.itemType === "deposit" ? "deposit" : input.itemType === "check" ? "check" : "";
  if (!type) return { error: "Pick Check or Deposit for the outstanding item." };
  const cash = resolve(acct, input.cashGlAccountId, "trust_cash", "trust cash");
  if (isErr(cash)) return cash;
  const bank = input.bankAccountId || null;
  const cleared = { glAccountId: cash, [type === "check" ? "debit" : "credit"]: amount, bankAccountId: bank, metadata: { conversionCleared: true } };
  const open = {
    glAccountId: cash,
    [type === "check" ? "credit" : "debit"]: amount,
    bankAccountId: bank,
    metadata: { outstanding: type, ...(input.reference ? { checkNumber: input.reference } : {}) },
  };
  const extra = { outstanding: type, ...(input.ownerId ? { ownerExplicit: true } : {}), ...(input.reference ? { reference: input.reference, ...(type === "check" ? { checkNumber: input.reference } : {}) } : {}) };
  return { entry: convEntry(input, "adjustment", type === "check" ? "Outstanding check" : "Deposit in transit", extra), lines: [cleared, open] };
}

export const CONVERSION_BUILDERS = {
  tenant_balance: buildConversionTenantBalance,
  tenant_credit: buildConversionTenantCredit,
  deposit: buildConversionDeposit,
  owner_balance: buildConversionOwnerBalance,
  bill: buildConversionBill,
  gl_balance: buildConversionGlBalance,
  bank_outstanding: buildConversionOutstanding,
};

export const BUILDERS = {
  charge: buildCharge,
  late_fee: (input, acct) => buildCharge({ ...input, sourceType: "late_fee" }, acct),
  // Payments post only through /api/billing/payments (CORE-11), so no browser path skips restrictions, the event or the receipt.
  credit: buildCredit,
  rent_adjustment: buildRentAdjustment,
  hap_charge: buildHapCharge,
  hap_adjustment: buildHapAdjustment,
  bill: buildBill,
  bill_payment: buildBillPayment,
  distribution: buildDistribution,
  contribution: buildContribution,
  management_fee: buildManagementFee,
  // Deposits post only through /api/billing/deposits (CORE-04), so no browser path posts an untagged deposit.
  adjustment: buildJournal,
  cash: buildCashTransaction,
};

// --- Sub-ledger math ----------------------------------------------------------

// Lines → balances for a scope. `accounts` = index from indexAccounts().
export function summarize(lines, accounts) {
  const out = {
    receivable: 0,
    subsidyReceivable: 0,
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
    else if (a.subtype === "subsidy_receivable") out.subsidyReceivable += dr - cr;
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
// less whatever has been applied to them. lines carry `entry` (status/reversal); carried items keep their age via metadata.originalDate.
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
      date: l.metadata?.originalDate || l.date,
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
  lease_subsidy: { subtypes: ["subsidy_receivable"], sign: 1, label: "Housing authority balance" },
  vendor: { subtypes: ["payable"], sign: -1, label: "Payable" },
  // Owner lines arrive pre-scaled by share (ownerScopedLines); deposit trust is the tenants', not the owner's.
  owner: { subtypes: ["cash"], trustOnly: true, excludeKeys: ["deposit_cash"], sign: 1, label: "Owner funds in trust" },
  property: { subtypes: ["cash"], sign: 1, label: "Cash" },
  bank_account: { subtypes: ["cash"], sign: 1, label: "Book balance" },
  job: { types: ["Expense", "Asset"], sign: 1, label: "Job cost" },
  account: { normal: true, sign: 1, label: "Balance" },
  // One deposit record (CORE-04): the liability it holds (2100 / 2110); its cash moves list as context rows with no balance effect.
  deposit: { subtypes: ["deposits"], context: ["cash"], sign: -1, label: "Deposit held" },
};

// Does a line count toward a scope's running balance?
export function inFocus(scope, line, account) {
  const f = SCOPE_FOCUS[scope];
  if (!f || !account) return false;
  if (f.normal) return true;
  if (f.types) return f.types.includes(account.accountType);
  if (!f.subtypes.includes(account.subtype)) return false;
  if (f.excludeKeys?.includes(account.systemKey)) return false;
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
  const context = SCOPE_FOCUS[scope]?.context || [];
  for (const l of lines) {
    const a = accounts.byId.get(l.glAccountId);
    const focus = inFocus(scope, l, a);
    if (!focus && !context.includes(a?.subtype)) continue;
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
    const amt = focus ? focusAmount(scope, l, a) : 0;
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

// Health checks over a set of entries + lines; negative trust per account × property (owner-level: trustPositions in ledger_math).
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
    const key = `${a.id}|${l.propertyId || ""}`;
    const t = trust.get(key) || { glAccountId: a.id, accountName: accountLabel(a), propertyId: l.propertyId, balance: 0 };
    t.balance += (Number(l.debit) || 0) - (Number(l.credit) || 0);
    trust.set(key, t);
  }
  const negativeTrust = [...trust.values()]
    .map((t) => ({ ...t, balance: round2(t.balance) }))
    .filter((t) => t.balance < 0);
  return { unbalanced, missingGl, negativeTrust };
}
