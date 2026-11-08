import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { BUILDERS, buildBankDeposit, buildCharge, buildPayment, buildReturnedDeposit, indexAccounts, round2, toRpcArgs } from "@/lib/ledger/postings";
import { getTrigger } from "@/lib/automations/catalog";
import { POLICIES } from "@/lib/policies";
import { STAFF_ROUTES } from "@/lib/auth/route_permissions";
import { paymentRestrictions } from "./payment_rules";
import {
  RETURN_REASONS,
  isOnlinePayment,
  moneyLocation,
  nsfBankKey,
  nsfKey,
  postingDate,
  reachesCertified,
  reasonLabel,
  reopenedCharges,
  returnBlocker,
  returnDateProblem,
  returnedPaymentsOf,
} from "./returns_rules";

const ACCT = indexAccounts([
  { id: "und", number: "1050", name: "Undeposited Funds", accountType: "Asset", subtype: "cash", isTrust: true, systemKey: "undeposited_funds" },
  { id: "trust", number: "1010", name: "Trust Cash", accountType: "Asset", subtype: "cash", isTrust: true, systemKey: "trust_cash" },
  { id: "ar", number: "1200", name: "Accounts Receivable", accountType: "Asset", subtype: "receivable", systemKey: "accounts_receivable" },
  { id: "rent", number: "4000", name: "Rental Income", accountType: "Income", subtype: "income", systemKey: "rent_income" },
  { id: "other", number: "4100", name: "Other Income", accountType: "Income", subtype: "income", systemKey: "other_income" },
]);
const PAY = "3f2a9c1e-77aa-4b1c-9d2e-0123456789ab";

test("keys and reasons: nsf:<payment>, nsf-bank:<payment>, three reasons", () => {
  assert.equal(nsfKey(PAY), `nsf:${PAY}`);
  assert.equal(nsfBankKey(PAY), `nsf-bank:${PAY}`);
  assert.deepEqual(RETURN_REASONS.map((r) => r.value), ["nsf", "account_closed", "stop_payment"]);
  assert.equal(reasonLabel("stop_payment"), "Stop payment");
});

test("tenant count: returnedPayments, the old nsfCount until the first return, and the certified threshold", () => {
  assert.equal(returnedPaymentsOf({ metadata: { returnedPayments: 2, nsfCount: 5 } }), 2);
  assert.equal(returnedPaymentsOf({ metadata: { nsfCount: "1" } }), 1);
  assert.equal(returnedPaymentsOf({ metadata: {} }), 0);
  assert.equal(returnedPaymentsOf(null), 0);
  assert.equal(reachesCertified(2, 2), true);
  assert.equal(reachesCertified(1, 2), false);
  assert.equal(reachesCertified(9, 0), false);
});

test("eligibility: a live office payment only; online payments come back through the webhook", () => {
  const office = { source_type: "payment", status: "posted", metadata: { manual: true } };
  assert.equal(returnBlocker(office), "");
  assert.equal(returnBlocker({ ...office, metadata: { reference: "1001" } }), "", "older office payments carry no manual flag");
  assert.match(returnBlocker({ ...office, status: "void" }), /already void/);
  assert.match(returnBlocker({ ...office, metadata: { onlinePaymentId: "x" } }), /Online payments/);
  assert.match(returnBlocker({ ...office, idempotency_key: "stripe:pi_1" }), /Online payments/);
  assert.match(returnBlocker({ ...office, source_type: "charge" }), /Only a payment/);
  assert.match(returnBlocker({ ...office, reversal_of: "e1" }), /Only a payment/);
  assert.equal(isOnlinePayment({ idempotencyKey: "stripe:pi_9", metadata: {} }), true);
});

test("where the money is: 1050, inside a posted deposit, or straight to a bank", () => {
  const und = { gl_account_id: "und", debit: 1000, bank_deposit_id: null };
  assert.deepEqual(moneyLocation({ cashLine: und, undepositedGlId: "und" }), { kind: "undeposited", bankAccountId: null, bankDepositId: null });
  const deposited = { ...und, bank_deposit_id: "D1" };
  assert.deepEqual(moneyLocation({ cashLine: deposited, undepositedGlId: "und", deposit: { status: "Posted", bank_account_id: "B1" } }), { kind: "deposited", bankAccountId: "B1", bankDepositId: "D1" });
  assert.equal(moneyLocation({ cashLine: deposited, undepositedGlId: "und", deposit: { status: "Void" } }).kind, "undeposited");
  assert.deepEqual(moneyLocation({ cashLine: { gl_account_id: "trust", bank_account_id: "B2" }, undepositedGlId: "und" }), { kind: "bank", bankAccountId: "B2", bankDepositId: null });
});

test("dates: not before the payment or its deposit, not in the future; closed periods move the posting", () => {
  const base = { paymentDate: "2026-11-02", depositDate: "2026-11-04", today: "2026-11-08" };
  assert.equal(returnDateProblem({ ...base, returnedOn: "2026-11-06" }), "");
  assert.match(returnDateProblem({ ...base, returnedOn: "2026-11-01" }), /before it was received/);
  assert.match(returnDateProblem({ ...base, returnedOn: "2026-11-03" }), /before it was deposited/);
  assert.match(returnDateProblem({ ...base, returnedOn: "2026-11-09" }), /future/);
  assert.match(returnDateProblem({ ...base, returnedOn: "" }), /Enter the date/);
  assert.equal(postingDate("2026-10-20", "2026-10-31"), "2026-11-01");
  assert.equal(postingDate("2026-11-06", "2026-10-31"), "2026-11-06");
  assert.equal(postingDate("2026-11-06", null), "2026-11-06");
});

test("re-opened charges: the payment's AR credits that applied to charges", () => {
  const built = buildPayment({ amount: 1000, date: "2026-11-02", cashGlAccountId: "und", allocations: [{ entryId: "oct", amount: 300 }, { entryId: "nov", amount: 600 }] }, ACCT);
  const lines = toRpcArgs(built).p_lines;
  assert.deepEqual(reopenedCharges(lines, ["ar"]), [{ entryId: "oct", amount: 300 }, { entryId: "nov", amount: 600 }]);
});

test("builder: Dr 1050 on the payment's dims / Cr the deposit bank on the property, server-only", () => {
  const built = buildReturnedDeposit({ amount: 1000, date: "2026-11-06", bankGlAccountId: "trust", bankAccountId: "B1", leaseId: "L1", tenantId: "T1", unitId: "U1", propertyId: "P1", paymentEntryId: PAY, bankDepositId: "D1", sourceId: PAY }, ACCT);
  assert.equal(built.entry.sourceType, "adjustment");
  const [und, bank] = built.lines;
  assert.deepEqual([und.glAccountId, und.debit, und.leaseId, und.tenantId, und.unitId, und.propertyId], ["und", 1000, "L1", "T1", "U1", "P1"]);
  assert.deepEqual(und.metadata, { paymentEntryId: PAY, bankDepositId: "D1" });
  assert.deepEqual([bank.glAccountId, bank.credit, bank.bankAccountId, bank.leaseId, bank.tenantId, bank.propertyId], ["trust", 1000, "B1", null, null, "P1"]);
  assert.match(buildReturnedDeposit({ amount: 1000, bankGlAccountId: "und" }, ACCT).error, /no cash GL/);
  assert.match(buildReturnedDeposit({ amount: 0, bankGlAccountId: "trust" }, ACCT).error, /greater than zero/);
  assert.equal(Object.values(BUILDERS).includes(buildReturnedDeposit), false);
});

// Net balance per account over built entries (a void mirrors its lines).
const net = (entries) => {
  const out = {};
  for (const lines of entries) for (const l of lines) out[l.glAccountId] = round2((out[l.glAccountId] || 0) + (Number(l.debit) || 0) - (Number(l.credit) || 0));
  return out;
};
const mirror = (lines) => lines.map((l) => ({ ...l, debit: l.credit || 0, credit: l.debit || 0 }));

test("acceptance math: a deposited 1,000 check comes back → AR +1,035, bank −1,000, 1050 nets to 0", () => {
  const rent = buildCharge({ amount: 1000, date: "2026-11-01" }, ACCT);
  const pay = buildPayment({ amount: 1000, date: "2026-11-02", cashGlAccountId: "und", allocations: [{ entryId: "rent", amount: 1000 }] }, ACCT);
  const dep = buildBankDeposit({ bankGlAccountId: "trust", bankAccountId: "B1", date: "2026-11-04", items: [{ lineId: "l1", entryId: "pay", amount: 1000, propertyId: "P1" }] }, ACCT);
  const before = net([rent.lines, pay.lines, dep.lines]);
  assert.deepEqual([before.ar, before.und, before.trust], [0, 0, 1000]);
  const fix = buildReturnedDeposit({ amount: 1000, bankGlAccountId: "trust", bankAccountId: "B1", propertyId: "P1" }, ACCT);
  const fee = buildCharge({ amount: 35, incomeKey: "other_income", date: "2026-11-06" }, ACCT);
  const after = net([rent.lines, pay.lines, dep.lines, mirror(pay.lines), fix.lines, fee.lines]);
  assert.equal(after.ar, 1035);
  assert.equal(after.und, 0);
  assert.equal(round2(after.trust - before.trust), -1000);
  assert.equal(after.other, -35);
  // Still in 1050: the void alone nets it out and the bank never moves.
  const undeposited = net([rent.lines, pay.lines, mirror(pay.lines)]);
  assert.deepEqual([undeposited.ar, undeposited.und, undeposited.trust || 0], [1000, 0, 0]);
});

test("threshold blocking reuses CORE-11: a flagged tenant's next personal check is refused", () => {
  const tenant = { metadata: { returnedPayments: 2, restrictCertifiedOnly: true } };
  assert.deepEqual(paymentRestrictions({ tenant, method: "Check", amount: 100 }).map((r) => r.key), ["certified_only"]);
  assert.deepEqual(paymentRestrictions({ tenant, method: "Money order", amount: 100 }), []);
});

test("wiring: route gated by accounting.void, payment.returned trigger, NSF hint, tenant field read-only, shared helpers", () => {
  assert.equal(STAFF_ROUTES["POST billing/payments/[entryId]/return"], "property.accounting.void");
  assert.deepEqual(STAFF_ROUTES["GET billing/payments/[entryId]/return"], { anyOf: ["property.accounting.void", "property.accounting.view"] });
  assert.equal(getTrigger("payment.returned")?.group, "Rent & payments");
  assert.match(POLICIES.find((p) => p.key === "nsfFee").hint, /cap/);
  const tenants = readFileSync("components/internal/screens/tenants/shared.js", "utf8");
  assert.doesNotMatch(tenants, /nsfCount/);
  assert.match(tenants, /key: "returnedPayments",\s*label: "Returned payments",\s*type: "readonly"/);
  const online = readFileSync("lib/payments/posting.js", "utf8");
  assert.doesNotMatch(online, /export async function (postNsfFee|flagTenantReturn)/);
  assert.match(readFileSync("lib/payments/fulfill.js", "utf8"), /from "@\/lib\/billing\/returns"/);
});
