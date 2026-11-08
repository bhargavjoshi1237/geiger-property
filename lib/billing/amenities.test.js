import { test } from "node:test";
import assert from "node:assert/strict";

import {
  amenityKey,
  amenityKeys,
  amenityKindOf,
  amenityLedger,
  cancelPlan,
  chargeOnOf,
  freeCancelUntil,
  insideFreeWindow,
  isChargeDue,
  ledgerStatusOf,
  planSettlement,
} from "./amenities_math";
import { summarizeDepositLines } from "./deposits_math";
import { buildCharge, buildOtherDepositCharge, buildOtherDepositForfeit, buildOtherDepositRelease, indexAccounts } from "@/lib/ledger/postings";

const ACCT = indexAccounts(
  [
    ["ar", "accounts_receivable", "1200", "Asset", "receivable"],
    ["sd", "security_deposits", "2100", "Liability", "deposits"],
    ["od", "other_deposits", "2120", "Liability", "deposits"],
    ["oi", "other_income", "4100", "Income", "income"],
    ["amen", "", "4150", "Income", "income"],
  ].map(([id, systemKey, number, accountType, subtype]) => ({ id, systemKey, number, accountType, subtype, name: systemKey || "Amenity income" })),
);
const sides = (built) => built.lines.map((l) => `${l.debit ? "Dr" : "Cr"} ${ACCT.byId.get(l.glAccountId).number} ${l.debit || l.credit}`);
const entry = (kind, total, status = "posted", id = `${kind}-1`) => ({ id, idempotency_key: amenityKey("R", kind), total, status, entry_date: "2026-11-08" });

test("amenity keys follow the file 1 registry", () => {
  assert.equal(amenityKey("R", "fee"), "amenity:R:fee");
  assert.deepEqual(amenityKeys("R"), ["amenity:R:fee", "amenity:R:deposit", "amenity:R:release", "amenity:R:forfeit"]);
  assert.equal(amenityKindOf("amenity:R:deposit", "R"), "deposit");
  assert.equal(amenityKindOf("amenity:S:deposit", "R"), "");
  assert.equal(amenityKindOf("amenity:R:other", "R"), "");
  assert.equal(amenityKindOf("deposit:R:charge", "R"), "");
});

test("charge timing: approval by default; reservation charges a request too; closed bookings never", () => {
  assert.equal(chargeOnOf({}), "approval");
  assert.equal(chargeOnOf({ metadata: { chargeOn: "reservation" } }), "reservation");
  assert.equal(chargeOnOf({ chargeOn: "reservation" }), "reservation");
  assert.equal(isChargeDue("approval", "requested"), false);
  assert.equal(isChargeDue("approval", "approved"), true);
  assert.equal(isChargeDue("reservation", "requested"), true);
  assert.equal(isChargeDue("reservation", "cancelled"), false);
  assert.equal(isChargeDue("approval", "declined"), false);
});

test("free-cancel window: start less cancelHours; an unscheduled booking is always free", () => {
  const startsAt = "2026-11-20T18:00:00.000Z";
  assert.equal(freeCancelUntil(startsAt, 72), "2026-11-17T18:00:00.000Z");
  assert.equal(freeCancelUntil(startsAt, 0), startsAt);
  assert.equal(insideFreeWindow({ startsAt, cancelHours: 72, at: "2026-11-17T17:59:00.000Z" }), true);
  assert.equal(insideFreeWindow({ startsAt, cancelHours: 72, at: "2026-11-18T09:00:00.000Z" }), false);
  assert.equal(insideFreeWindow({ startsAt: "", cancelHours: 72, at: "2026-11-18T09:00:00.000Z" }), true);
});

test("ledger state from keyed entries: held, released, partly forfeited, reversed", () => {
  assert.equal(amenityLedger([], "R").status, "not_charged");
  const charged = amenityLedger([entry("fee", 50), entry("deposit", 200)], "R");
  assert.equal(charged.held, 200);
  assert.equal(charged.status, "deposit_held");
  assert.equal(amenityLedger([entry("fee", 50)], "R").status, "charged");
  assert.equal(amenityLedger([entry("fee", 50), entry("deposit", 200), entry("release", 200)], "R").status, "released");
  const split = amenityLedger([entry("deposit", 200), entry("forfeit", 80), entry("release", 120)], "R");
  assert.equal(split.held, 0);
  assert.equal(split.status, "forfeited");
  assert.equal(amenityLedger([entry("fee", 50, "void"), entry("deposit", 200, "void")], "R").status, "reversed");
  // Another reservation's keys and soft-deleted rows don't count.
  const other = { ...entry("deposit", 200), idempotency_key: amenityKey("S", "deposit") };
  assert.equal(amenityLedger([other, { ...entry("fee", 50), deleted_at: "2026-11-08" }], "R").status, "not_charged");
  assert.equal(ledgerStatusOf({ fee: null, deposit: null }), "not_charged");
});

test("settlement: forfeit all by default, part with the rest released, never more than held", () => {
  assert.deepEqual(planSettlement(200), { forfeit: 200, release: 0 });
  assert.deepEqual(planSettlement(200, 80), { forfeit: 80, release: 120 });
  assert.deepEqual(planSettlement(200, "0"), { forfeit: 0, release: 200 });
  assert.ok(planSettlement(200, 250).error);
  assert.ok(planSettlement(0, 10).error);
  assert.ok(planSettlement(200, -5).error);
});

test("cancel: inside the window (or a decline) voids the fee and an unsettled deposit; outside keeps both", () => {
  const l = amenityLedger([entry("fee", 50), entry("deposit", 200)], "R");
  assert.deepEqual(cancelPlan(l, { inside: true }), { voidFee: true, voidDeposit: true, keepsFee: false, keepsDeposit: false });
  assert.deepEqual(cancelPlan(l, { inside: false }), { voidFee: false, voidDeposit: false, keepsFee: true, keepsDeposit: true });
  assert.deepEqual(cancelPlan(l, { inside: false, decline: true }), { voidFee: true, voidDeposit: true, keepsFee: false, keepsDeposit: false });
  const released = amenityLedger([entry("fee", 50), entry("deposit", 200), entry("release", 200)], "R");
  assert.equal(cancelPlan(released, { inside: true }).voidDeposit, false);
  const voided = amenityLedger([entry("fee", 50, "void"), entry("deposit", 200, "void")], "R");
  assert.deepEqual(cancelPlan(voided, { inside: true }), { voidFee: false, voidDeposit: false, keepsFee: false, keepsDeposit: false });
});

test("journal lines: fee, deposit into 2120, release as an AR credit, forfeit to 4100", () => {
  const fee = buildCharge({ amount: 50, glAccountId: "amen", incomeKey: "other_income", date: "2026-11-08", tenantId: "T" }, ACCT);
  assert.deepEqual(sides(fee), ["Dr 1200 50", "Cr 4150 50"]);
  assert.equal(fee.entry.sourceType, "charge");
  assert.deepEqual(sides(buildCharge({ amount: 50, glAccountId: "missing", incomeKey: "other_income", date: "2026-11-08" }, ACCT)), ["Dr 1200 50", "Cr 4100 50"]);
  const dep = buildOtherDepositCharge({ amount: 200, date: "2026-11-08", leaseId: "L" }, ACCT);
  assert.deepEqual(sides(dep), ["Dr 1200 200", "Cr 2120 200"]);
  assert.equal(dep.entry.sourceType, "deposit_held");
  assert.equal(dep.entry.leaseId, "L");
  const rel = buildOtherDepositRelease({ amount: 200, allocations: [{ entryId: "dep", amount: 80 }], date: "2026-11-08" }, ACCT);
  assert.deepEqual(sides(rel), ["Dr 2120 200", "Cr 1200 80", "Cr 1200 120"]);
  assert.equal(rel.lines[1].appliesToEntryId, "dep");
  assert.equal(rel.entry.sourceType, "deposit_return");
  assert.ok(buildOtherDepositRelease({ amount: 100, allocations: [{ entryId: "dep", amount: 150 }] }, ACCT).error);
  const forfeit = buildOtherDepositForfeit({ amount: 200, date: "2026-11-08" }, ACCT);
  assert.deepEqual(sides(forfeit), ["Dr 2120 200", "Cr 4100 200"]);
  assert.equal(forfeit.entry.sourceType, "deposit_return");
  assert.ok(buildOtherDepositCharge({ amount: 0 }, ACCT).error);
});

test("security-deposit interest ignores 2120: amenity deposit lines never count as held", () => {
  const dep = buildOtherDepositCharge({ amount: 200, date: "2026-11-08" }, ACCT);
  // Even tagged with a deposit id, a 2120 line holds nothing for CORE-04's interest base.
  const lines = dep.lines.map((l) => ({ ...l, gl_account_id: l.glAccountId, entry_date: "2026-11-08", metadata: { depositId: "D" } }));
  assert.deepEqual(summarizeDepositLines(lines, ACCT).get("D"), { held: 0, interest: 0, cash: 0 });
  assert.equal(summarizeDepositLines(dep.lines.map((l) => ({ ...l, gl_account_id: l.glAccountId })), ACCT).size, 0);
});
