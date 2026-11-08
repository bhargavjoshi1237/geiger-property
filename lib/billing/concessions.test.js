import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildConcessionCredit,
  buildConcessionReversal,
  concAdjKey,
  concKey,
  concOnceKey,
  concessionCredits,
  concessionRange,
  concessionSchedule,
  concessionSummary,
  creditedPeriods,
  leaseTermMonths,
  moveInCredits,
  parseConcessionKey,
  planLeaseConcessions,
  renewalConcession,
  specialIsActive,
  specialToConcession,
  summarizeConcessionEntries,
} from "./concessions";
import { indexAccounts } from "@/lib/ledger/postings";

const LEASE = { id: "L1", project_id: "P", status: "Active", rent: 2000, term_start: "2027-01-01", term_end: "2027-12-31", metadata: {} };
let seq = 0;
const conc = (type, over = {}) => {
  const { metadata, ...rest } = over;
  seq += 1;
  return { id: `C${seq}`, owner_id: "L1", kind: "concession", name: type, status: "Active", amount: 0, starts_on: "2027-01-01", created_at: `2026-12-01T00:00:${String(seq).padStart(2, "0")}Z`, ...rest, metadata: { concessionType: type, ...(metadata || {}) } };
};
const rent = (entries) => new Map(Object.entries(entries));
const slots = (plan, id) => Object.fromEntries([...plan.get(id).slots.entries()].map(([p, s]) => [p, s.amount]));
const ACCT = indexAccounts([
  { id: "ar", systemKey: "accounts_receivable", subtype: "receivable", accountType: "Asset" },
  { id: "c4050", systemKey: "concessions", subtype: "contra_income", accountType: "Income" },
  { id: "r4000", systemKey: "rent_income", subtype: "income", accountType: "Income" },
]);

test("free month: full billed rent for the period; capped; fractional months", () => {
  const free = conc("free_month", { metadata: { months: 1 } });
  assert.equal(concessionCredits(free, "2027-01", 2000, LEASE), 2000);
  assert.equal(concessionCredits(free, "2027-02", 2000, LEASE), 0);
  const plan = planLeaseConcessions([free], LEASE, rent({ "2027-01": 2000, "2027-02": 2000 }));
  assert.deepEqual(slots(plan, free.id), { "2027-01": 2000 });
  assert.equal(plan.get(free.id).waiting, false);
  const half = conc("free_month", { metadata: { months: 1.5 } });
  assert.deepEqual(slots(planLeaseConcessions([half], LEASE, rent({ "2027-01": 2000, "2027-02": 2000, "2027-03": 2000 })), half.id), { "2027-01": 2000, "2027-02": 1000 });
  const listed = conc("free_month", { metadata: { periods: ["2027-03", "2027-01"] } });
  assert.deepEqual(concessionRange(listed, LEASE).periods, ["2027-01", "2027-03"]);
  assert.deepEqual(slots(planLeaseConcessions([listed], LEASE, rent({ "2027-01": 2000, "2027-02": 2000, "2027-03": 1900 })), listed.id), { "2027-01": 2000, "2027-03": 1900 });
});

test("percent off: 10% for 3 months is three credits of 200; amount off is capped at rent", () => {
  const pct = conc("percent_off", { amount: 10, metadata: { months: 3 } });
  const billed = rent({ "2027-01": 2000, "2027-02": 2000, "2027-03": 2000, "2027-04": 2000 });
  assert.deepEqual(slots(planLeaseConcessions([pct], LEASE, billed), pct.id), { "2027-01": 200, "2027-02": 200, "2027-03": 200 });
  assert.equal(concessionCredits(pct, "2027-02", 1333.33, LEASE), 133.33);
  const off = conc("amount_off", { amount: 2500, metadata: { months: 2 } });
  assert.deepEqual(slots(planLeaseConcessions([off], LEASE, billed), off.id), { "2027-01": 2000, "2027-02": 2000 });
  // No end, no months: through the lease term; month-to-month leases stay open-ended.
  const term = conc("amount_off", { amount: 50 });
  assert.equal(concessionRange(term, LEASE).last, "2027-12");
  assert.equal(concessionRange(term, { ...LEASE, term_end: null }).periods, null);
  assert.equal(planLeaseConcessions([term], { ...LEASE, term_end: null }, billed).get(term.id).waiting, true);
});

test("one-time credit posts once; over a month's rent it carries to the next billed periods", () => {
  const once = conc("one_time", { amount: 250 });
  const plan = planLeaseConcessions([once], LEASE, rent({ "2027-01": 2000, "2027-02": 2000 }));
  assert.deepEqual([...plan.get(once.id).slots.entries()], [["2027-01", { amount: 250, once: true }]]);
  assert.equal(plan.get(once.id).waiting, false);
  const big = conc("one_time", { amount: 2769.23 });
  const carry = planLeaseConcessions([big], LEASE, rent({ "2027-01": 2000 }));
  assert.deepEqual(slots(carry, big.id), { "2027-01": 2000 });
  assert.equal(carry.get(big.id).pending, 769.23);
  assert.equal(carry.get(big.id).waiting, true);
  assert.deepEqual(slots(planLeaseConcessions([big], LEASE, rent({ "2027-01": 2000, "2027-02": 2000 })), big.id), { "2027-01": 2000, "2027-02": 769.23 });
  // Not before its start; a start before the lease clamps to the lease start; move-in when it has no date.
  const later = conc("one_time", { amount: 100, starts_on: "2027-02-15" });
  assert.deepEqual(slots(planLeaseConcessions([later], LEASE, rent({ "2027-01": 2000 })), later.id), {});
  const early = conc("one_time", { amount: 100, starts_on: "2026-11-01" });
  assert.equal(concessionRange(early, LEASE).first, "2027-01");
  const movein = conc("one_time", { amount: 100, starts_on: null });
  assert.equal(concessionRange(movein, { ...LEASE, term_start: null, move_in_date: "2027-03-10" }).first, "2027-03");
});

test("credits on a period never exceed its billed rent across concessions (oldest first)", () => {
  const free = conc("free_month", { metadata: { months: 1 } });
  const once = conc("one_time", { amount: 250 });
  const plan = planLeaseConcessions([once, free], LEASE, rent({ "2027-01": 2000, "2027-02": 2000 }));
  assert.deepEqual(slots(plan, free.id), { "2027-01": 2000 });
  assert.deepEqual(slots(plan, once.id), { "2027-02": 250 });
  assert.equal(plan.get(once.id).slots.get("2027-02").once, true);
});

test("voucher lease: credits come off the tenant's billed share only", () => {
  const voucher = { ...LEASE, rent: 1500, metadata: { subsidized: true, hapAmount: 1100 } };
  const free = conc("free_month", { metadata: { months: 1 } });
  const pct = conc("percent_off", { amount: 10, metadata: { months: 1 } });
  const plan = planLeaseConcessions([free, pct], voucher, rent({ "2027-01": 400 }));
  assert.deepEqual(slots(plan, free.id), { "2027-01": 400 });
  assert.deepEqual(slots(plan, pct.id), {});
  assert.equal(concessionCredits(pct, "2027-01", 400, voucher), 40);
  assert.equal(concessionCredits(conc("amount_off", { amount: 500, metadata: { months: 1 } }), "2027-01", 400, voucher), 400);
  // A spread of free months values them at the tenant's share.
  const spread = conc("free_month", { metadata: { months: 1, spread: true } });
  assert.equal(concessionCredits(spread, "2027-01", 400, voucher), 33.33);
  assert.equal(concessionCredits(spread, "2027-12", 400, voucher), 33.37);
});

test("spread: total ÷ term months, the last period takes the rounding", () => {
  const spread = conc("one_time", { amount: 1000, metadata: { spread: true } });
  assert.equal(leaseTermMonths(LEASE), 12);
  assert.equal(concessionRange(spread, LEASE).count, 12);
  assert.equal(concessionCredits(spread, "2027-01", 2000, LEASE), 83.33);
  assert.equal(concessionCredits(spread, "2027-12", 2000, LEASE), 83.37);
  assert.equal(concessionCredits(spread, "2028-01", 2000, LEASE), 0);
  assert.equal(leaseTermMonths({ ...LEASE, term_start: "2027-01-15", term_end: "2028-02-14" }), 13);
  assert.equal(leaseTermMonths({ ...LEASE, term_end: null }), null);
  assert.equal(concessionRange(spread, { ...LEASE, term_end: null }).count, 12);
});

test("billing start and Expired: nothing before go-live; an Expired concession keeps only what it posted", () => {
  const pct = conc("percent_off", { amount: 10, metadata: { months: 3 } });
  const billed = rent({ "2027-01": 2000, "2027-02": 2000, "2027-03": 2000 });
  assert.deepEqual(slots(planLeaseConcessions([pct], LEASE, billed, { floor: "2027-02-01" }), pct.id), { "2027-02": 200, "2027-03": 200 });
  const once = conc("one_time", { amount: 300 });
  const handled = planLeaseConcessions([once], LEASE, billed, { floor: "2027-02-01" }).get(once.id);
  assert.equal(handled.slots.size, 0);
  assert.equal(handled.waiting, false);
  const expired = conc("percent_off", { amount: 10, status: "Expired", metadata: { months: 3 } });
  const plan = planLeaseConcessions([expired], LEASE, billed, { posted: new Map([[expired.id, new Set(["2027-01"])]]) });
  assert.deepEqual(slots(plan, expired.id), { "2027-01": 200 });
});

test("keys and posted credits: once, period and signed true-ups; voids keep their key", () => {
  assert.equal(concKey("C1", "2027-01"), "conc:C1:2027-01");
  assert.equal(concOnceKey("C1"), "conc:C1:once");
  assert.equal(concAdjKey("C1", "2027-01", 2), "conc-adj:C1:2027-01:2");
  assert.deepEqual(parseConcessionKey("conc-adj:C1:2027-01:2"), { kind: "adj", concessionId: "C1", period: "2027-01", n: 2 });
  assert.equal(parseConcessionKey("conc:C1:2027"), null);
  assert.equal(parseConcessionKey("rent:C1:2027-01"), null);
  const rows = [
    { id: "e1", idempotency_key: "conc:C1:2027-01", status: "posted", total: 2000, credit: 2000, entry_date: "2027-01-01" },
    { id: "e2", idempotency_key: "conc-adj:C1:2027-01:1", status: "posted", total: 500, credit: -500, entry_date: "2027-01-20" },
    { id: "e3", idempotency_key: "conc-adj:C1:2027-01:2", status: "void", total: 100, credit: 100, entry_date: "2027-01-21" },
    { id: "e4", idempotency_key: "conc:C2:once", status: "posted", total: 250, credit: 250, period: "2027-01", entry_date: "2027-01-05" },
  ];
  const sum = summarizeConcessionEntries(rows);
  const s1 = sum.get("C1").slots.get("2027-01");
  assert.equal(s1.total, 1500);
  assert.equal(s1.mainKeyTaken, true);
  assert.equal(s1.maxAdj, 2);
  assert.equal(s1.entries.length, 2);
  assert.equal(sum.get("C2").onceTaken, true);
  assert.equal(sum.get("C2").slots.get("2027-01").total, 250);
  assert.deepEqual([...creditedPeriods(sum).get("C2")], ["2027-01"]);
});

test("builders: Dr 4050 / Cr AR applied to the rent; a reversal re-opens it", () => {
  const credit = buildConcessionCredit({ date: "2027-01-01", amount: 2000, leaseId: "L1", allocations: [{ entryId: "rent1", amount: 1500 }], memo: "Concession" }, ACCT);
  assert.equal(credit.entry.sourceType, "concession");
  assert.deepEqual(credit.lines.map((l) => [l.glAccountId, l.debit || 0, l.credit || 0, l.appliesToEntryId || ""]), [
    ["c4050", 2000, 0, ""],
    ["ar", 0, 1500, "rent1"],
    ["ar", 0, 500, ""],
  ]);
  const rev = buildConcessionReversal({ date: "2027-01-20", amount: 500, leaseId: "L1", tenantId: "T", allocations: [{ entryId: "adj1", amount: 300 }] }, ACCT);
  assert.equal(rev.entry.sourceType, "concession");
  assert.equal(rev.entry.leaseId, "L1");
  assert.deepEqual(rev.lines.map((l) => [l.glAccountId, l.debit || 0, l.credit || 0, l.appliesToEntryId || ""]), [
    ["ar", 300, 0, "adj1"],
    ["ar", 200, 0, ""],
    ["c4050", 0, 500, ""],
  ]);
  assert.match(buildConcessionReversal({ amount: 0 }, ACCT).error, /greater than zero/);
});

test("listing specials map to lease concessions; inactive, unmapped and short terms are left out", () => {
  const sp = (type, amount, metadata = {}, over = {}) => ({ id: `S-${type}`, owner_id: "LST", name: `${type} special`, status: "Active", amount, metadata: { specialType: type, ...metadata }, ...over });
  const months = specialToConcession(sp("Months free", 1), LEASE).values;
  assert.deepEqual(months.metadata, { sourceSpecialId: "S-Months free", sourceListingId: "LST", reason: "Listing special", concessionType: "free_month", months: 1 });
  assert.equal(months.startsOn, "2027-01-01");
  const weeks = specialToConcession(sp("Weeks free", 6), LEASE).values;
  assert.equal(weeks.amount, 2769.23);
  assert.equal(weeks.metadata.concessionType, "one_time");
  assert.equal(weeks.metadata.spread, undefined);
  assert.equal(specialToConcession(sp("Weeks free", 6, { spread: true }), LEASE).values.metadata.spread, true);
  assert.equal(specialToConcession(sp("Dollars off", 500), LEASE).values.amount, 500);
  const pct = specialToConcession(sp("Percent off", 5), LEASE).values;
  assert.equal(pct.metadata.concessionType, "percent_off");
  assert.equal(pct.endsOn, "2027-12-31");
  assert.match(specialToConcession(sp("Weeks free", 6, { minTermMonths: 13 }), LEASE).skip, /13-month term/);
  assert.equal(specialToConcession(sp("Gift card", 200), LEASE), null);
  assert.equal(specialIsActive(sp("Months free", 1, {}, { ends_on: "2026-11-01" }), "2026-11-08"), false);
  assert.equal(specialIsActive(sp("Months free", 1, {}, { status: "Inactive" }), "2026-11-08"), false);
  assert.equal(specialIsActive(sp("Months free", 1, {}, { starts_on: "2026-11-01", ends_on: "2026-11-30" }), "2026-11-08"), true);
});

test("renewal incentive: structured fields become the renewed lease's concession", () => {
  const renewed = { ...LEASE, id: "L2", term_start: "2028-01-01", term_end: "2028-12-31" };
  const v = renewalConcession({ id: "R1", metadata: { concessionType: "percent_off", concessionAmount: 5, concessionMonths: 3, concession: "" } }, renewed);
  assert.equal(v.name, "5% off for 3 months");
  assert.equal(v.startsOn, "2028-01-01");
  assert.deepEqual(v.metadata, { concessionType: "percent_off", months: 3, reason: "Renewal incentive", sourceRenewalId: "R1" });
  assert.equal(renewalConcession({ id: "R1", metadata: { concessionType: "free_month", concessionMonths: 1, concession: "Free January" } }, renewed).name, "Free January");
  assert.equal(renewalConcession({ id: "R1", metadata: { concession: "Free carpet cleaning" } }, renewed), null);
  assert.equal(renewalConcession({ id: "R1", metadata: { concessionType: "amount_off" } }, renewed), null);
  assert.equal(concessionSummary({ id: "x", amount: 250, metadata: { concessionType: "one_time" } }), "$250.00 one-time credit");
});

test("move-in credits and the schedule use the same plan", () => {
  const mid = { ...LEASE, term_start: "2027-01-16" };
  const once = conc("one_time", { amount: 250, starts_on: null });
  const free = conc("free_month", { metadata: { months: 1 }, starts_on: null });
  // The older one-time credit comes first; together they never pass the month's rent.
  assert.deepEqual(moveInCredits([free, once], mid, "2027-01", 1032.26).map((c) => c.amount), [782.26, 250]);
  assert.deepEqual(moveInCredits([once], mid, "2027-01", 1032.26).map((c) => c.amount), [250]);
  const pct = conc("percent_off", { amount: 10, metadata: { months: 3 } });
  const ledger = summarizeConcessionEntries([{ id: "e1", idempotency_key: concKey(pct.id, "2027-01"), status: "posted", total: 200, credit: 200 }]);
  const rows = concessionSchedule([pct], LEASE, {
    billed: rent({ "2027-01": 2000, "2027-02": 2000 }),
    projected: rent({ "2027-03": 2000, "2027-04": 2000 }),
    ledger,
  });
  assert.deepEqual(rows.map((r) => [r.period, r.credit, r.state]), [
    ["2027-01", 200, "posted"],
    ["2027-02", 200, "due"],
    ["2027-03", 200, "scheduled"],
  ]);
});
