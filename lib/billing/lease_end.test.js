import { test } from "node:test";
import assert from "node:assert/strict";

import { round2 } from "./periods";
import { billablePeriods, billingEndOf, billingWindow, billsWithin, rentForPeriod } from "./rent";
import { closeOutSummary, finalRent, holdoverOf } from "./lease_end";
import { endAdjustments, occurrenceAt } from "./charge_plan";
import { splitPeriod } from "@/lib/housing/hap";

// CORE-02: billing stops at move-out (final-month proration), ended leases true up, holdovers roll or flag.

const lease = (over = {}) => ({ id: "L1", project_id: "P", status: "Active", term_start: "2026-01-01", term_end: "2026-12-31", rent: 1500, ...over });
const STEPS = [{ id: "s1", lease_id: "L1", effective_date: "2026-01-01", amount: 1500, status: "active" }];
const ACTUAL = { prorationMethod: "actual", prorateFirstMonth: true, prorateLastMonth: true, rentDueDay: "1" };
const dec = (over) => rentForPeriod(STEPS, "2026-12", billingWindow(lease(over)), ACTUAL).total;

test("billing window: Draft and Pending never bill; live statuses bill open-ended; eviction keeps billing", () => {
  for (const status of ["Draft", "Pending"]) assert.equal(billingWindow(lease({ status })).billable, false, status);
  for (const status of ["Active", "Expiring soon", "Month-to-month", "Notice given", "Eviction"]) {
    assert.deepEqual(billingWindow(lease({ status })), { start: "2026-01-01", end: null, billable: true }, status);
  }
  assert.equal(billingWindow(lease({ status: "Pending", renewal_of_id: "L0", metadata: { renewalAcceptedOn: "2025-12-20" } })).billable, true);
});

test("billing window: the move-out date ends any status; Ended / Terminated use it, else metadata.endedOn", () => {
  assert.equal(billingWindow(lease({ status: "Notice given", move_out_date: "2026-12-10" })).end, "2026-12-10");
  assert.equal(billingWindow(lease({ status: "Eviction", move_out_date: "2026-12-10" })).end, "2026-12-10");
  assert.deepEqual(billingWindow(lease({ status: "Ended", move_out_date: "2026-12-10" })), { start: "2026-01-01", end: "2026-12-10", billable: true });
  assert.deepEqual(billingWindow(lease({ status: "Terminated", move_out_date: "2026-09-25" })), { start: "2026-01-01", end: "2026-09-25", billable: true });
  assert.deepEqual(billingWindow(lease({ status: "Ended", metadata: { endedOn: "2026-12-03" } })), { start: "2026-01-01", end: "2026-12-03", billable: true });
  // No end at all (legacy): nothing more bills.
  assert.equal(billingWindow(lease({ status: "Ended" })).billable, false);
  // A lease that never went live doesn't start billing when it's terminated.
  assert.equal(billingWindow(lease({ status: "Terminated", move_out_date: "2026-12-10", metadata: { endedFrom: "Pending" } })).billable, false);
  assert.equal(billingWindow(lease({ status: "Terminated", move_out_date: "2026-12-10", metadata: { endedFrom: "Pending", renewalAcceptedOn: "2025-12-20" } })).billable, true);
  assert.equal(billingWindow(lease({ status: "Ended", move_out_date: "2026-12-10", metadata: { endedFrom: "Active" } })).billable, true);
  // A move-out before the start bills nothing.
  assert.equal(billingWindow(lease({ status: "Ended", move_out_date: "2025-12-10" })).billable, false);
});

test("billing window: a Renewed lease ends at its handoff, which also caps any other status", () => {
  const renewed = lease({ status: "Renewed", term_end: "2026-11-30", move_out_date: "2026-10-15", metadata: { billingEndsOn: "2026-11-30" } });
  assert.equal(billingEndOf(renewed), "2026-11-30");
  assert.equal(billingEndOf(lease({ status: "Renewed", term_end: "2026-11-30" })), "2026-11-30");
  assert.equal(billingEndOf(lease({ status: "Ended", move_out_date: "2027-01-20", metadata: { billingEndsOn: "2026-12-31" } })), "2026-12-31");
});

test("billsWithin: Ended / Terminated leases drop out three months after their move-out", () => {
  assert.equal(billsWithin(lease({ status: "Ended", move_out_date: "2026-09-15" }), "2026-11-08"), true);
  assert.equal(billsWithin(lease({ status: "Ended", move_out_date: "2026-08-07" }), "2026-11-08"), false);
  assert.equal(billsWithin(lease({ status: "Active", move_out_date: "2026-01-31" }), "2026-11-08"), true);
  assert.equal(billsWithin(lease({ status: "Draft" }), "2026-11-08"), false);
});

test("final month: move-out Dec 10 bills 483.87, a credit of 1,016.13 against a full December; Dec 31 credits nothing", () => {
  assert.equal(dec({ move_out_date: "2026-12-10" }), 483.87);
  assert.equal(round2(dec({ move_out_date: "2026-12-10" }) - 1500), -1016.13);
  assert.equal(dec({ move_out_date: "2026-12-31" }), 1500);
  // Moving the move-out to Dec 20 bills 483.87 more.
  assert.equal(round2(dec({ move_out_date: "2026-12-20" }) - dec({ move_out_date: "2026-12-10" })), 483.87);
  // prorateLastMonth off bills the whole month.
  assert.equal(rentForPeriod(STEPS, "2026-12", billingWindow(lease({ move_out_date: "2026-12-10" })), { ...ACTUAL, prorateLastMonth: false }).total, 1500);
  // No January rent, and January isn't a billable period.
  const w = billingWindow(lease({ status: "Ended", move_out_date: "2026-12-10" }));
  assert.equal(rentForPeriod(STEPS, "2027-01", w, ACTUAL).total, 0);
  assert.deepEqual(billablePeriods({ window: w, today: "2027-01-05", billingStartsOn: "2026-11-01" }), ["2026-11", "2026-12"]);
  assert.deepEqual(finalRent(STEPS, w, ACTUAL), { period: "2026-12", amount: 483.87, from: "2026-12-01", to: "2026-12-10", prorated: true });
});

test("final month: a 100/month prorated parking charge billed for December credits 67.74 at a Dec 10 move-out", () => {
  const charge = { id: "C1", amount: 100, frequency: "Monthly", prorate: true, bill_with_rent: true, next_date: "2026-12-01" };
  const occ = { ...occurrenceAt(charge, "2026-12-01", { window: { start: "2026-01-01" } }), prorate: true, method: "actual" };
  const posted = [{ date: "2026-12-01", entryId: "E1", occ, billed: 100, maxAdj: 0 }];
  const [adj] = endAdjustments(charge, posted, { end: "2026-12-10" });
  assert.equal(adj.delta, -67.74);
  assert.equal(adj.key, "rc-adj:C1:2026-12-01:1");
  assert.deepEqual(endAdjustments(charge, posted, { end: "2026-12-31" }), []);
});

test("final month: a voucher lease splits the prorated month between tenant and housing authority", () => {
  const v = lease({ move_out_date: "2026-12-10", metadata: { subsidized: true, hapAmount: 1100 } });
  const split = splitPeriod(v, rentForPeriod(STEPS, "2026-12", billingWindow(v), ACTUAL), "2026-12", { frozenRate: 1100 });
  assert.equal(split.hap, 354.84);
  assert.equal(split.tenant, 129.03);
  assert.equal(round2(split.hap - 1100 + split.tenant - 400), -1016.13);
});

test("renewal: the old lease bills through its handoff, the new lease from its start, no period twice", () => {
  const old = lease({ status: "Renewed", term_end: "2026-11-30", metadata: { billingEndsOn: "2026-11-30" } });
  const next = { id: "L2", status: "Pending", renewal_of_id: "L1", term_start: "2026-12-01", term_end: "2027-11-30", metadata: { renewalAcceptedOn: "2026-11-20" } };
  const nextSteps = [{ id: "s2", lease_id: "L2", effective_date: "2026-12-01", amount: 1600, status: "active" }];
  const oldPeriods = billablePeriods({ window: billingWindow(old), today: "2026-12-05", billingStartsOn: "2026-11-01" });
  const newPeriods = billablePeriods({ window: billingWindow(next), today: "2026-12-05", billingStartsOn: "2026-11-01" });
  assert.deepEqual(oldPeriods, ["2026-11"]);
  assert.deepEqual(newPeriods, ["2026-12"]);
  assert.equal(rentForPeriod(STEPS, "2026-12", billingWindow(old), ACTUAL).total, 0);
  assert.equal(rentForPeriod(nextSteps, "2026-12", billingWindow(next), ACTUAL).total, 1600);
});

test("holdover: a fixed lease past its term rolls to month-to-month by policy, else it's flagged", () => {
  const past = { term_end: "2026-10-31" };
  const on = { autoMonthToMonth: true, mtmPremium: 50 };
  assert.deepEqual(holdoverOf(lease(past), { today: "2026-11-01", policies: on }), { since: "2026-11-01", termEnd: "2026-10-31", convert: true, premium: 50 });
  // The lease's own premium wins over the policy's.
  assert.equal(holdoverOf(lease({ ...past, metadata: { mtmPremium: 100 } }), { today: "2026-11-01", policies: on }).premium, 100);
  // The lease's switch wins over the policy, both ways.
  assert.equal(holdoverOf(lease({ ...past, metadata: { autoMtm: false } }), { today: "2026-11-01", policies: on }).convert, false);
  assert.equal(holdoverOf(lease(past), { today: "2026-11-01", policies: { autoMonthToMonth: false } }).convert, false);
  assert.equal(holdoverOf(lease({ ...past, metadata: { autoMtm: true } }), { today: "2026-11-01", policies: { autoMonthToMonth: false } }).convert, true);
  // Notice given, eviction, a move-out date or "Do not renew" only flag.
  assert.deepEqual(holdoverOf(lease({ ...past, status: "Notice given", move_out_date: "2026-11-15" }), { today: "2026-11-01", policies: on }), { since: "2026-11-01", termEnd: "2026-10-31", convert: false, premium: 0 });
  assert.equal(holdoverOf(lease({ ...past, status: "Eviction" }), { today: "2026-11-01", policies: on }).convert, false);
  assert.equal(holdoverOf(lease({ ...past, metadata: { renewalOption: "Do not renew" } }), { today: "2026-11-01", policies: on }).convert, false);
  // Not a holdover: renewed, already month-to-month, term not over, ended, a handoff, or no term end.
  assert.equal(holdoverOf(lease(past), { today: "2026-11-01", policies: on, renewed: true }), null);
  assert.equal(holdoverOf(lease({ ...past, term_type: "mtm" }), { today: "2026-11-01", policies: on }), null);
  assert.equal(holdoverOf(lease({ ...past, status: "Month-to-month" }), { today: "2026-11-01", policies: on }), null);
  assert.equal(holdoverOf(lease(past), { today: "2026-10-31", policies: on }), null);
  assert.equal(holdoverOf(lease({ ...past, status: "Ended" }), { today: "2026-11-01", policies: on }), null);
  assert.equal(holdoverOf(lease({ ...past, metadata: { billingEndsOn: "2026-10-31" } }), { today: "2026-11-01", policies: on }), null);
  assert.equal(holdoverOf(lease({ term_end: null }), { today: "2026-11-01", policies: on }), null);
});

test("close-out summary: planned deltas and posted entries become signed lines with credit and charge totals", () => {
  const planned = closeOutSummary(
    [{ period: "2026-12", planned: { tenant: -270.97, hap: -745.16 } }, { period: "2027-01", planned: { tenant: -400, hap: 0 } }],
    [{ name: "Parking", date: "2026-12-12", amount: -67.74, key: "rc-adj:C1:2026-12-01:1" }],
  );
  assert.equal(planned.credit, 1483.87);
  assert.equal(planned.charge, 0);
  assert.deepEqual(planned.lines.map((l) => [l.kind, l.amount]), [["hap", -745.16], ["rent", -270.97], ["rent", -400], ["charge", -67.74]]);
  const posted = closeOutSummary([{ period: "2026-12", entries: [{ key: "rent-adj:L1:2026-12:2", amount: 483.87, kind: "charge" }] }]);
  assert.deepEqual(posted, { credit: 0, charge: 483.87, lines: [{ kind: "rent", label: "Rent · December 2026", amount: 483.87, key: "rent-adj:L1:2026-12:2" }] });
});
