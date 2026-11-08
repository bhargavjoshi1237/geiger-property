import { test } from "node:test";
import assert from "node:assert/strict";

import { BUILDERS } from "@/lib/ledger/postings";
import { TABLE_RECORD_TYPE, RECORD_TYPES } from "@/lib/automations/catalog";
import { getNotification } from "@/lib/email/catalog";
import {
  CERTIFIED_METHODS,
  PAYMENT_METHODS,
  cashRoute,
  chargeLabel,
  isUuid,
  payKey,
  paymentRestrictions,
  planAllocations,
  receiptDedupeKey,
  receiptRequirement,
  stateCodeOf,
} from "./payment_rules";
import { balanceText, receiptEmailData, receiptHtml } from "./receipt_html";

const ID = "3f2a9c1e-77aa-4b1c-9d2e-0123456789ab";
const items = [
  { entryId: "oct", date: "2026-10-01", open: 200 },
  { entryId: "nov", date: "2026-11-01", open: 1000 },
];

test("keys: pay:<requestId>, receipt dedupe per address and resend", () => {
  assert.equal(payKey(ID), `pay:${ID}`);
  assert.equal(receiptDedupeKey(ID, " Ana@Example.com "), `receipt:${ID}:ana@example.com`);
  assert.equal(receiptDedupeKey(ID, "ana@example.com", "2026-11-08T10:00:00.000Z"), `receipt:${ID}:ana@example.com:resend:2026-11-08T10:00:00.000Z`);
  assert.ok(isUuid(ID));
  assert.ok(!isUuid("pay-1"));
});

test("restrictions: certified funds only blocks a personal check, allows money order and cashier's check", () => {
  const tenant = { metadata: { restrictCertifiedOnly: true } };
  const check = paymentRestrictions({ tenant, method: "Check", amount: 1200 });
  assert.deepEqual(check.map((r) => r.key), ["certified_only"]);
  for (const m of CERTIFIED_METHODS) assert.deepEqual(paymentRestrictions({ tenant, method: m, amount: 1200 }), [], m);
  assert.deepEqual(paymentRestrictions({ tenant: {}, policies: { certifiedFundsOnly: true }, method: "ACH", amount: 1 }).map((r) => r.key), ["certified_only"]);
  assert.ok(PAYMENT_METHODS.includes("Cashier's check"));
});

test("restrictions: no checks, eviction (unless the policy allows it), no partial, never for the housing authority", () => {
  assert.deepEqual(paymentRestrictions({ tenant: { metadata: { restrictNoChecks: true } }, method: "Check", amount: 5 }).map((r) => r.key), ["no_checks"]);
  assert.deepEqual(paymentRestrictions({ tenant: { metadata: { restrictNoChecks: true } }, method: "Money order", amount: 5 }), []);
  const evicting = { status: "Active", metadata: { evictionActive: true } };
  assert.deepEqual(paymentRestrictions({ lease: evicting, method: "Cash", amount: 5 }).map((r) => r.key), ["eviction"]);
  assert.deepEqual(paymentRestrictions({ lease: { status: "Eviction" }, method: "Cash", amount: 5 }).map((r) => r.key), ["eviction"]);
  assert.deepEqual(paymentRestrictions({ lease: evicting, policies: { blockAfterEviction: false }, method: "Cash", amount: 5 }), []);
  assert.deepEqual(paymentRestrictions({ tenant: { metadata: { restrictNoPartial: true } }, method: "Cash", amount: 500, balance: 1200 }).map((r) => r.key), ["no_partial"]);
  assert.deepEqual(paymentRestrictions({ policies: { allowPartialPayments: false }, method: "Cash", amount: 1200, balance: 1200 }), []);
  const all = { tenant: { metadata: { restrictCertifiedOnly: true, restrictNoChecks: true } }, lease: evicting, method: "Check", amount: 1 };
  assert.equal(paymentRestrictions(all).length, 3);
  assert.deepEqual(paymentRestrictions({ ...all, payer: "housing_authority" }), []);
});

test("cash route: chosen bank, default trust cash, 1050 when asked or once CORE-16's setting is on for paper", () => {
  assert.deepEqual(cashRoute({ method: "Check", bankAccountId: "b1" }), { bankAccountId: "b1" });
  assert.deepEqual(cashRoute({ method: "Check" }), { systemKey: "trust_cash" });
  assert.deepEqual(cashRoute({ method: "ACH", undeposited: true }), { systemKey: "undeposited_funds" });
  assert.deepEqual(cashRoute({ method: "Money order", bankAccountId: "b1", useUndepositedFunds: true }), { systemKey: "undeposited_funds" });
  assert.deepEqual(cashRoute({ method: "Wire", bankAccountId: "b1", useUndepositedFunds: true }), { bankAccountId: "b1" });
});

test("allocations: oldest first by default; explicit ones must be open, within the charge and the payment", () => {
  assert.deepEqual(planAllocations(items, 1200), { allocations: [{ entryId: "oct", amount: 200 }, { entryId: "nov", amount: 1000 }], unapplied: 0 });
  assert.deepEqual(planAllocations(items, 1500).unapplied, 300);
  assert.deepEqual(planAllocations(items, 300, [{ entryId: "nov", amount: 100 }, { entryId: "nov", amount: 50 }]), { allocations: [{ entryId: "nov", amount: 150 }], unapplied: 150 });
  assert.match(planAllocations(items, 300, [{ entryId: "x", amount: 10 }]).error, /isn't open/);
  assert.match(planAllocations(items, 300, [{ entryId: "oct", amount: 250 }]).error, /open amount/);
  assert.match(planAllocations(items, 100, [{ entryId: "nov", amount: 150 }]).error, /exceed/);
  assert.deepEqual(planAllocations(items, 100, []), { allocations: [], unapplied: 100 });
});

test("receipt laws: cash always, New York everything but a personal check, citations where verified", () => {
  assert.equal(receiptRequirement({ state: "TX", method: "Cash" }).required, true);
  assert.equal(receiptRequirement({ state: "TX", method: "Cash" }).citation, "");
  assert.equal(receiptRequirement({ state: "TX", method: "Money order" }).required, false);
  const ny = receiptRequirement({ state: "New York", method: "Money order" });
  assert.equal(ny.required, true);
  assert.match(ny.citation, /235-e/);
  assert.equal(receiptRequirement({ state: "NY", method: "Check" }).required, false);
  assert.match(receiptRequirement({ state: "wa", method: "Cash" }).citation, /59\.18\.063/);
  assert.equal(stateCodeOf("Maryland"), "MD");
  assert.equal(stateCodeOf(" ca. "), "CA");
});

test("charge labels name the rent month", () => {
  assert.equal(chargeLabel({ kind: "rent", period: "2026-11" }), "Rent · November 2026");
  assert.equal(chargeLabel({ kind: "late_fee", period: "2026-10" }), "Late fee · October 2026");
  assert.equal(chargeLabel({ kind: "deposit_held", memo: "Security deposit" }), "Security deposit");
});

const receipt = {
  entryId: ID,
  receiptNo: "RCT-000042",
  date: "2026-11-08",
  amount: 1200,
  method: "Check",
  reference: "1042",
  memo: "Payment · Check",
  status: "posted",
  online: false,
  payer: { kind: "tenant", name: "Ana <Lopez>", email: "ana@example.com" },
  lease: { id: "L", name: "Unit 4B lease" },
  unit: { label: "4B" },
  property: { name: "Harbor & Pine", address: "1 Main St", state: "NY" },
  company: { name: "Harbor Property Co", address: "", phone: "" },
  allocations: [{ entryId: "oct", date: "2026-10-01", label: "Rent · October 2026", amount: 200 }, { entryId: "nov", date: "2026-11-01", label: "Rent · November 2026", amount: 900 }],
  unapplied: 100,
  balanceAfter: -100,
  receivedBy: "Sam Staff",
  requirement: { required: false },
};

test("receipt HTML: escaped, numbered, allocations, credit, signature, VOID", () => {
  const html = receiptHtml(receipt);
  assert.match(html, /<title>Receipt RCT-000042<\/title>/);
  assert.ok(html.includes("Ana &lt;Lopez&gt;"));
  assert.ok(!html.includes("Ana <Lopez>"));
  assert.ok(html.includes("Rent · October 2026") && html.includes("Rent · November 2026"));
  assert.ok(html.includes("Credit on account"));
  assert.ok(html.includes("$100.00 credit on account"));
  assert.ok(html.includes("Signature"));
  assert.ok(!html.includes("VOID"));
  assert.ok(receiptHtml({ ...receipt, status: "void" }).includes("VOID"));
  assert.ok(!receiptHtml({ ...receipt, online: true }).includes("Signature"));
  assert.ok(!receiptHtml(receipt, { printButton: false }).includes("window.print"));
  assert.match(receiptHtml({ ...receipt, requirement: { required: true, citation: "N.Y. Real Prop. Law § 235-e" } }), /issued under N\.Y\. Real Prop\. Law § 235-e/);
  assert.equal(balanceText(250), "$250.00");
  assert.equal(balanceText(null), "");
});

test("receipt email: the rent_receipt template's fields plus the receipt number", () => {
  const data = receiptEmailData(receipt, { appUrl: "https://app.example" });
  assert.equal(data.recipientName, "Ana");
  assert.equal(data.amount, "$1,200.00");
  assert.equal(data.method, "Check #1042");
  assert.equal(data.reference, "RCT-000042");
  assert.equal(data.balance, "$0.00");
  assert.equal(data.credit, "$100.00");
  assert.equal(data.unitLabel, "4B");
  assert.match(data.appliedTo, /Rent · October 2026: \$200\.00/);
});

test("wiring: no browser payment builder, payment.received resolves ledger entries read-only, receipts are live", () => {
  assert.equal(BUILDERS.payment, undefined);
  assert.equal(TABLE_RECORD_TYPE.ledger_entries, "ledger_payment");
  assert.equal(RECORD_TYPES.ledger_payment.readOnly, true);
  assert.equal(getNotification("rent_receipt").live, true);
});
