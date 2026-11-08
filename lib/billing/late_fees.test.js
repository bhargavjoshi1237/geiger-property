import { test } from "node:test";
import assert from "node:assert/strict";

import { addDays } from "./periods";
import { summarizeRentEntries } from "./keys";
import {
  billedRentByPeriod,
  isLateFeeLease,
  lateDayKey,
  lateFeeStop,
  lateFeeWarnings,
  lateKey,
  openRentByPeriod,
  parseLateKey,
  planLateFees,
  summarizeLateEntries,
} from "./late_fee_rules";
import { classifyEntry, mergeInheritedLateFees, summarizeReceivable } from "./ar_summary";
import { indexAccounts } from "@/lib/ledger/postings";

const DAILY = { lateFeeType: "daily", lateFeeAmount: 50, dailyLateFee: 10, graceDays: 5, maxLateFee: 150, rentDueDay: "1", lateFeeMinBalance: 0, lateFeesDuringEviction: false };
const PERCENT = { lateFeeType: "percent", lateFeeAmount: 5, graceDays: 5, maxLateFee: "", rentDueDay: "1", lateFeeMinBalance: 0 };
const LEASE = { id: "L1", status: "Active", project_id: "P" };
const rent = (open, over = {}) => ({ entryId: "r-nov", kind: "rent", period: "2026-11", date: "2026-11-01", amount: 1000, paid: 1000 - open, open, ...over });
const billedOf = (entries) => new Map(Object.entries(entries));

// Run the plan day by day, "posting" each delta into the history like the job does.
function simulate(days, { policies = DAILY, items = [rent(1000)], billed = billedOf({ "2026-11": 1000 }), payOn = null } = {}) {
  const history = {};
  const out = {};
  for (const today of days) {
    const open = payOn && today >= payOn ? [] : items;
    const { periods } = planLateFees({ leaseId: "L1", lease: LEASE, policies, receivable: { items: open, credit: 0, lateFees: history }, billed, today });
    const p = periods.find((x) => x.period === "2026-11");
    out[today] = p ? { delta: p.delta, key: p.key, status: p.status, first: p.first } : null;
    if (p?.delta > 0) {
      const h = (history[p.period] ||= { posted: 0, own: 0, inherited: 0, waived: false, keys: [] });
      h.posted += p.delta;
      h.own += p.delta;
      h.keys.push(p.key);
    }
  }
  return { out, history };
}
const range = (from, to) => {
  const list = [];
  for (let d = from; d <= to; d = addDays(d, 1)) list.push(d);
  return list;
};

test("keys: month key first, then one dated key per business day", () => {
  assert.equal(lateKey("L1", "2026-11"), "late:L1:2026-11");
  assert.equal(lateDayKey("L1", "2026-11", "2026-11-08"), "late:L1:2026-11:2026-11-08");
  assert.deepEqual(parseLateKey("late:L1:2026-11"), { owner: "L1", period: "2026-11", date: null });
  assert.deepEqual(parseLateKey("late:L1:2026-11:2026-11-08"), { owner: "L1", period: "2026-11", date: "2026-11-08" });
  assert.equal(parseLateKey("late2:L1:2026-11"), null);
  assert.equal(parseLateKey("late:L1:nov"), null);
});

test("daily accrual: 0 in grace, 50 on day 6, +10 a day to the 150 cap, then nothing", () => {
  const { out } = simulate(range("2026-11-06", "2026-11-20"));
  assert.equal(out["2026-11-06"].delta, 0);
  assert.equal(out["2026-11-06"].status, "grace");
  assert.deepEqual(out["2026-11-07"], { delta: 50, key: "late:L1:2026-11", status: "due", first: true });
  assert.deepEqual(out["2026-11-08"], { delta: 10, key: "late:L1:2026-11:2026-11-08", status: "due", first: false });
  for (const d of range("2026-11-09", "2026-11-17")) assert.equal(out[d].delta, 10, d);
  const total = Object.values(out).reduce((s, x) => s + x.delta, 0);
  assert.equal(total, 150);
  assert.equal(out["2026-11-18"].delta, 0);
  assert.equal(out["2026-11-18"].status, "capped");
  assert.equal(out["2026-11-20"].delta, 0);
});

test("missed runs catch up: skipping Nov 9–10 posts +30 on Nov 11", () => {
  const { out, history } = simulate(["2026-11-07", "2026-11-08", "2026-11-11", "2026-11-11"]);
  assert.equal(out["2026-11-11"].delta, 0, "the second Nov 11 run posts nothing");
  assert.deepEqual(history["2026-11"].keys, ["late:L1:2026-11", "late:L1:2026-11:2026-11-08", "late:L1:2026-11:2026-11-11"]);
  assert.equal(history["2026-11"].posted, 90);
});

test("rent paid on Nov 12: nothing after", () => {
  const { out, history } = simulate(range("2026-11-07", "2026-11-20"), { payOn: "2026-11-12" });
  assert.equal(history["2026-11"].posted, 90);
  assert.equal(out["2026-11-12"].status, "paid");
  for (const d of range("2026-11-12", "2026-11-20")) assert.equal(out[d].delta, 0, d);
});

test("stops: exempt tenant, eviction (unless the policy allows), no-fee policy, payment plan, not live", () => {
  const exempt = { metadata: { lateFeeExempt: true } };
  assert.equal(lateFeeStop({ lease: LEASE, tenant: exempt, policies: DAILY }), "exempt");
  assert.equal(lateFeeStop({ lease: { ...LEASE, status: "Eviction" }, policies: DAILY }), "eviction");
  assert.equal(lateFeeStop({ lease: { ...LEASE, metadata: { evictionActive: true } }, policies: DAILY }), "eviction");
  assert.equal(lateFeeStop({ lease: { ...LEASE, status: "Eviction" }, policies: { ...DAILY, lateFeesDuringEviction: true } }), null);
  assert.equal(lateFeeStop({ lease: LEASE, policies: { ...DAILY, lateFeeType: "none" } }), "no_fee");
  assert.equal(lateFeeStop({ lease: LEASE, policies: DAILY, plan: { status: "Active", inGoodStanding: true } }), "payment_plan");
  assert.equal(lateFeeStop({ lease: LEASE, policies: DAILY, plan: { status: "Active", inGoodStanding: false } }), null);
  assert.equal(lateFeeStop({ lease: { ...LEASE, status: "Draft" }, policies: DAILY }), "inactive");
  // An exempt or evicted lease shows its months but posts nothing.
  const { periods, stop } = planLateFees({ leaseId: "L1", lease: LEASE, tenant: exempt, policies: DAILY, receivable: { items: [rent(1000)] }, billed: billedOf({ "2026-11": 1000 }), today: "2026-11-10" });
  assert.equal(stop, "exempt");
  assert.deepEqual(periods.map((p) => [p.status, p.delta]), [["exempt", 0]]);
});

test("late-fee leases: live statuses and accepted renewals still Pending", () => {
  assert.equal(isLateFeeLease({ status: "Notice given" }), true);
  assert.equal(isLateFeeLease({ status: "Eviction" }), true);
  assert.equal(isLateFeeLease({ status: "Pending", renewal_of_id: "OLD", metadata: { renewalAcceptedOn: "2026-10-20" } }), true);
  assert.equal(isLateFeeLease({ status: "Pending", renewal_of_id: "OLD", metadata: {} }), false);
  assert.equal(isLateFeeLease({ status: "Renewed" }), false);
});

test("percent fee uses the month's billed rent, mid-month step included", () => {
  // November billed 500 (Nov 1–15 at 1,000) + 600 (Nov 16–30 at 1,200) = 1,100 → 5% = 55, not 5% of today's 1,200.
  const rows = [
    { id: "e1", lease_id: "L1", idempotency_key: "rent:L1:2026-11", source_type: "charge", status: "posted", total: 1000, entry_date: "2026-11-01" },
    { id: "e2", lease_id: "L1", idempotency_key: "rent-adj:L1:2026-11:1", source_type: "credit", status: "posted", total: 400, entry_date: "2026-11-01" },
    { id: "e3", lease_id: "L1", idempotency_key: "rent-adj:L1:2026-11:2", source_type: "charge", status: "posted", total: 500, entry_date: "2026-11-16" },
  ];
  const ledger = summarizeRentEntries(rows, ["L1"]);
  const billed = billedRentByPeriod(ledger, "L1", []);
  assert.equal(billed.get("2026-11"), 1100);
  const { periods } = planLateFees({ leaseId: "L1", lease: LEASE, policies: PERCENT, receivable: { items: [rent(1100)] }, billed, today: "2026-11-07" });
  assert.equal(periods[0].target, 55);
  assert.equal(periods[0].delta, 55);
});

test("voucher lease: the base is the tenant's billed share, never the housing authority's", () => {
  // rent: entries carry the tenant's 400 share of 1,500 (HAP 1,100 sits on its own receivable and never shows up as an item).
  const ledger = summarizeRentEntries([{ id: "e1", lease_id: "L1", idempotency_key: "rent:L1:2026-11", source_type: "charge", status: "posted", total: 400, entry_date: "2026-11-01" }], ["L1"]);
  const { periods } = planLateFees({ leaseId: "L1", lease: LEASE, policies: PERCENT, receivable: { items: [rent(400)] }, billed: billedRentByPeriod(ledger, "L1", []), today: "2026-11-10" });
  assert.equal(periods[0].target, 20);
});

test("carried rent counts by its original month and type, and a fee the old lease charged counts as posted", () => {
  const carried = rent(1000, { entryId: "x1", carried: true, fromLeaseId: "OLD", date: "2026-11-01" });
  const ledger = summarizeRentEntries([{ id: "e1", lease_id: "OLD", idempotency_key: "rent:OLD:2026-11", source_type: "charge", status: "posted", total: 1000, entry_date: "2026-11-01" }], ["OLD", "NEW"]);
  const billed = billedRentByPeriod(ledger, "NEW", [carried]);
  assert.equal(billed.get("2026-11"), 1000);
  const lateFees = mergeInheritedLateFees({}, { "2026-11": [{ posted: 60, waived: false }] });
  const { periods } = planLateFees({ leaseId: "NEW", lease: { ...LEASE, id: "NEW" }, policies: DAILY, receivable: { items: [carried], lateFees }, billed, today: "2026-11-09" });
  assert.equal(periods[0].posted, 60);
  assert.equal(periods[0].target, 70);
  assert.equal(periods[0].delta, 10, "only the day's increment, never a second first fee");
  assert.equal(periods[0].key, "late:NEW:2026-11");
  assert.equal(periods[0].first, false, "the old lease already sent the notice");
  // Day 7 on the new lease after the old one charged 50: nothing more.
  const day7 = planLateFees({ leaseId: "NEW", lease: { ...LEASE, id: "NEW" }, policies: DAILY, receivable: { items: [carried], lateFees: mergeInheritedLateFees({}, { "2026-11": [{ posted: 50 }] }) }, billed, today: "2026-11-07" });
  assert.equal(day7.periods[0].delta, 0);
});

test("minimum balance, unapplied credit, waived months and the first-month due date", () => {
  const plan = (over) => planLateFees({ leaseId: "L1", lease: LEASE, policies: DAILY, billed: billedOf({ "2026-11": 1000 }), today: "2026-11-10", ...over }).periods[0];
  assert.equal(plan({ policies: { ...DAILY, lateFeeMinBalance: 25 }, receivable: { items: [rent(20)] } }).status, "min_balance");
  assert.equal(plan({ policies: { ...DAILY, lateFeeMinBalance: 25 }, receivable: { items: [rent(30)] } }).status, "due");
  // A prepayment sitting as unapplied credit covers the rent: no fee.
  assert.equal(plan({ receivable: { items: [rent(1000)], credit: 1000 } }).status, "paid");
  assert.equal(plan({ receivable: { items: [rent(1000)], credit: 400 } }).open, 600);
  // A voided late fee waives the month.
  assert.equal(plan({ receivable: { items: [rent(1000)], lateFees: { "2026-11": { posted: 0, own: 0, inherited: 0, waived: true, keys: ["late:L1:2026-11"] } } } }).status, "waived");
  // A move-in month's rent posts on move-in day, so grace runs from there.
  const movein = plan({ receivable: { items: [rent(500, { date: "2026-11-08" })] } });
  assert.equal(movein.due, "2026-11-08");
  assert.equal(movein.status, "grace");
});

test("months before billing go-live or past the 3-month catch-up are left alone", () => {
  const items = [rent(1000, { entryId: "a", period: "2026-07", date: "2026-07-01" }), rent(1000, { entryId: "b", period: "2026-10", date: "2026-10-01" }), rent(1000)];
  const billed = billedOf({ "2026-07": 1000, "2026-10": 1000, "2026-11": 1000 });
  const months = (over) => planLateFees({ leaseId: "L1", lease: LEASE, policies: DAILY, receivable: { items }, billed, today: "2026-11-10", ...over }).periods.map((p) => p.period);
  assert.deepEqual(months({}), ["2026-10", "2026-11"]);
  assert.deepEqual(months({ startsOn: "2026-11-01" }), ["2026-11"]);
  assert.deepEqual(months({ catchUpMonths: null }), ["2026-07", "2026-10", "2026-11"]);
});

test("late history: live fees sum per month, a voided one waives it, soft-deleted keys stay reserved", () => {
  const map = summarizeLateEntries([
    { id: "1", leaseId: "L1", idempotencyKey: "late:L1:2026-11", status: "posted", total: 50 },
    { id: "2", leaseId: "L1", idempotencyKey: "late:L1:2026-11:2026-11-08", status: "posted", total: 10 },
    { id: "3", leaseId: "L1", idempotencyKey: "late:L1:2026-10", status: "void", total: 50 },
    { id: "4", leaseId: "L1", idempotencyKey: "late:L1:2026-09", status: "posted", total: 50, deletedAt: "2026-11-01" },
    { id: "5", leaseId: "L2", idempotencyKey: "late:L1:2026-11", status: "posted", total: 99 },
  ]);
  const h = map.get("L1");
  assert.equal(h["2026-11"].posted, 60);
  assert.equal(h["2026-10"].waived, true);
  assert.equal(h["2026-10"].posted, 0);
  assert.equal(h["2026-09"].posted, 0);
  assert.deepEqual(h["2026-09"].keys, ["late:L1:2026-09"]);
  assert.equal(map.has("L2"), false);
});

test("receivable summary: typed open items, carried originals, credit, last payment and late fees posted", () => {
  const acct = indexAccounts([
    { id: "ar", subtype: "receivable" },
    { id: "hap", subtype: "subsidy_receivable" },
    { id: "inc", subtype: "income" },
  ]);
  const e = (id, sourceType, key, date, extra = {}) => ({ id, sourceType, idempotencyKey: key, date, status: "posted", reversalOf: "", metadata: {}, ...extra });
  const line = (entry, glAccountId, debit, credit, extra = {}) => ({ entryId: entry.id, glAccountId, debit, credit, date: entry.date, appliesToEntryId: "", metadata: {}, entry, ...extra });
  const rentNov = e("r11", "charge", "rent:L1:2026-11", "2026-11-01");
  const late = e("f11", "late_fee", "late:L1:2026-11", "2026-11-07");
  const pay = e("p1", "payment", "pay:1", "2026-11-05");
  const xfer = e("x1", "adjustment", "xfer:L1:o1", "2026-11-03", { metadata: { transfer: true, itemEntryId: "o1", originalDate: "2026-10-01" } });
  const hap = e("h11", "charge", "hap:L1:2026-11", "2026-11-01");
  const lines = [
    line(rentNov, "ar", 1000, 0),
    line(late, "ar", 50, 0),
    line(pay, "ar", 0, 300, { appliesToEntryId: "r11" }),
    line(xfer, "ar", 200, 0, { metadata: { originalDate: "2026-10-01" } }),
    line(hap, "hap", 1100, 0),
  ];
  const origins = new Map([["x1", { entryId: "o1", leaseId: "OLD", kind: "rent", period: "2026-10" }]]);
  const lateFees = mergeInheritedLateFees(summarizeLateEntries([{ ...late, leaseId: "L1", total: 50 }]).get("L1"), { "2026-10": [{ posted: 50 }] });
  const r = summarizeReceivable(lines, acct, { origins, lateFees });
  assert.equal(r.balance, 950);
  assert.equal(r.credit, 0);
  assert.equal(r.oldestOpenDate, "2026-10-01");
  assert.equal(r.lastPaymentDate, "2026-11-05");
  assert.deepEqual(
    r.items.map((i) => [i.entryId, i.kind, i.period, i.open, i.fromLeaseId || ""]),
    [
      ["x1", "rent", "2026-10", 200, "OLD"],
      ["r11", "rent", "2026-11", 700, ""],
      ["f11", "late_fee", "2026-11", 50, ""],
    ],
  );
  assert.deepEqual(r.lateFeesPosted, { "2026-11": 50, "2026-10": 50 });
  assert.equal(classifyEntry(e("m", "charge", "movein:L1:rent", "2026-09-15")).period, "2026-09");
  assert.deepEqual(openRentByPeriod(r.items).get("2026-10"), { open: 200, from: "2026-10-01", fromLeaseIds: ["OLD"] });
});

test("warnings: uncapped daily fees and a state with late-fee rules (warn only)", () => {
  assert.equal(lateFeeWarnings({ ...DAILY, maxLateFee: "" }).length, 1);
  assert.equal(lateFeeWarnings(DAILY).length, 0);
  assert.match(lateFeeWarnings(PERCENT, { stateName: "Maryland", sources: 2 })[0], /Maryland/);
  assert.equal(lateFeeWarnings({ lateFeeType: "none" }, { stateName: "Maryland", sources: 2 }).length, 0);
});
