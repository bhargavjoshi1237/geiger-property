import { test } from "node:test";
import assert from "node:assert/strict";

import { addDays } from "./periods";
import {
  emptyLateHistory,
  late2Key,
  lateFeeMonths,
  lateFeeWarnings,
  parseLate2Key,
  parseLateKey,
  planLateFees,
  secondFeePolicy,
  summarizeLateEntries,
} from "./late_fee_rules";
import { classifyEntry, mergeInheritedLateFees, summarizeReceivable } from "./ar_summary";
import { indexAccounts } from "@/lib/ledger/postings";

// CORE-19: the second late fee, the combined cap and the late-fee count.

const FLAT = { lateFeeType: "flat", lateFeeAmount: 50, graceDays: 5, maxLateFee: "", rentDueDay: "1", lateFeeMinBalance: 0, lateFee2Enabled: true, lateFee2DaysLate: 15, lateFee2Type: "flat", lateFee2Amount: 25 };
const DAILY = { ...FLAT, lateFeeType: "daily", dailyLateFee: 10, maxLateFee: 150 };
const LEASE = { id: "L1", status: "Active", project_id: "P" };
const rent = (open, over = {}) => ({ entryId: "r-nov", kind: "rent", period: "2026-11", date: "2026-11-01", amount: 1000, paid: 1000 - open, open, ...over });
const billed = new Map([["2026-11", 1000]]);
const range = (from, to) => {
  const list = [];
  for (let d = from; d <= to; d = addDays(d, 1)) list.push(d);
  return list;
};
const plan = (over = {}) => planLateFees({ leaseId: "L1", lease: LEASE, policies: FLAT, receivable: { items: [rent(1000)] }, billed, today: "2026-11-16", ...over }).periods[0];

// Run day by day, "posting" both fees into the history like assessLateFees does.
function simulate(days, { policies = FLAT, payOn = null } = {}) {
  const history = {};
  const out = {};
  for (const today of days) {
    const items = payOn && today >= payOn ? [] : [rent(1000)];
    const p = planLateFees({ leaseId: "L1", lease: LEASE, policies, receivable: { items, credit: 0, lateFees: history }, billed, today }).periods.find((x) => x.period === "2026-11");
    out[today] = p;
    if (!p) continue;
    const h = (history[p.period] ||= emptyLateHistory());
    if (p.delta > 0) {
      h.own += p.delta;
      h.posted = h.own;
      h.keys.push(p.key);
    }
    if (p.second?.delta > 0) {
      const s = (h.second ||= emptyLateHistory());
      s.own += p.second.delta;
      s.posted = s.own;
      s.keys.push(p.second.key);
    }
  }
  const total = (h) => (h ? h.posted + (h.second?.posted || 0) : 0);
  return { out, history, total: total(history["2026-11"]) };
}

test("late2 keys: one per lease and rent month, never read as a first fee", () => {
  assert.equal(late2Key("L1", "2026-11"), "late2:L1:2026-11");
  assert.deepEqual(parseLate2Key("late2:L1:2026-11"), { owner: "L1", period: "2026-11" });
  assert.equal(parseLate2Key("late:L1:2026-11"), null);
  assert.equal(parseLate2Key("late2:L1:2026-11:2026-11-16"), null);
  assert.equal(parseLateKey("late2:L1:2026-11"), null);
});

test("second fee: nothing through day 15, one 25 under late2: on day 16 (15 days late), re-runs post nothing", () => {
  const { out, history } = simulate(range("2026-11-06", "2026-11-20"));
  for (const d of range("2026-11-06", "2026-11-15")) assert.equal(out[d].second.delta, 0, d);
  assert.equal(out["2026-11-15"].second.status, "waiting");
  assert.equal(out["2026-11-15"].second.target, 25, "shows what's coming");
  assert.deepEqual([out["2026-11-16"].second.delta, out["2026-11-16"].second.key, out["2026-11-16"].second.status], [25, "late2:L1:2026-11", "due"]);
  for (const d of range("2026-11-17", "2026-11-20")) assert.deepEqual([out[d].second.delta, out[d].second.status], [0, "posted"], d);
  assert.deepEqual(history["2026-11"].second.keys, ["late2:L1:2026-11"]);
  assert.equal(history["2026-11"].posted, 50, "the first fee is unchanged");
});

test("rent paid before day 15: no second fee", () => {
  const { out, history } = simulate(range("2026-11-06", "2026-11-20"), { payOn: "2026-11-14" });
  assert.equal(history["2026-11"].second, undefined);
  assert.equal(out["2026-11-16"].second.status, "paid");
});

test("percent second fee is on the month's billed rent; off by default", () => {
  assert.equal(plan({ policies: { ...FLAT, lateFee2Type: "percent", lateFee2Amount: 2 } }).second.delta, 20);
  assert.equal(plan({ policies: { ...FLAT, lateFee2Enabled: false } }).second, null);
  assert.equal(secondFeePolicy({ lateFeeType: "flat", lateFee2Enabled: true }).daysLate, 15);
  assert.equal(secondFeePolicy({ lateFeeType: "flat", lateFee2Enabled: true }).counts, true);
  assert.equal(secondFeePolicy({ lateFeeType: "flat", lateFee2Enabled: true, lateFee2CountsTowardTotal: false }).counts, false);
  assert.equal(secondFeePolicy({ lateFeeType: "none", lateFee2Enabled: true }), null, "No late fee turns both off");
});

test("combined cap: 50 + 25 under a 60 cap posts a 10 second fee, then nothing", () => {
  const { out, total } = simulate(range("2026-11-06", "2026-11-20"), { policies: { ...FLAT, maxLateFeeTotal: 60 } });
  assert.equal(out["2026-11-16"].second.delta, 10);
  assert.equal(total, 60);
  // With the first fee already at the cap the second has no room.
  const full = simulate(range("2026-11-06", "2026-11-20"), { policies: { ...FLAT, lateFeeAmount: 60, maxLateFeeTotal: 60 } });
  assert.equal(full.total, 60);
  assert.equal(full.out["2026-11-16"].second.status, "capped");
});

test("combined cap with a daily fee: the second fee's share limits the first fee's later growth", () => {
  // 50 + 10/day from day 7; second 25 at 8 days late; cap 100 → 50, 60, 70 + 25, then +5, then nothing.
  const { out, total, history } = simulate(range("2026-11-06", "2026-11-25"), { policies: { ...DAILY, lateFee2DaysLate: 8, maxLateFeeTotal: 100 } });
  assert.equal(out["2026-11-09"].second.delta, 25);
  assert.equal(out["2026-11-10"].delta, 5);
  assert.equal(out["2026-11-11"].status, "capped");
  assert.equal(history["2026-11"].posted, 75);
  assert.equal(total, 100);
  // A daily fee that reaches the cap first leaves no room: the second fee is capped at 0.
  const late = simulate(range("2026-11-06", "2026-11-25"), { policies: { ...DAILY, maxLateFeeTotal: 120 } });
  assert.equal(late.total, 120);
  assert.equal(late.out["2026-11-16"].second.status, "capped");
});

test("second fee stops: payment plan, exempt, eviction, waived month, voided second fee", () => {
  assert.equal(plan({ plan: { status: "Active", inGoodStanding: true } }).second.status, "payment_plan");
  // With lateFeeOnInstallments a plan lease still accrues on installments, never the second fee.
  const installment = rent(300, { entryId: "i1", kind: "installment", amount: 300 });
  const onPlan = plan({ policies: { ...FLAT, lateFeeOnInstallments: true }, plan: { status: "Active", inGoodStanding: true }, receivable: { items: [rent(1000), installment] } });
  assert.deepEqual([onPlan.delta > 0, onPlan.second.status], [true, "payment_plan"]);
  assert.equal(plan({ tenant: { metadata: { lateFeeExempt: true } } }).second.status, "exempt");
  assert.equal(plan({ lease: { ...LEASE, status: "Eviction" } }).second.status, "eviction");
  const waived = { "2026-11": { ...emptyLateHistory(), waived: true, keys: ["late:L1:2026-11"] } };
  assert.equal(plan({ receivable: { items: [rent(1000)], lateFees: waived } }).second.status, "waived");
  const voided = { "2026-11": { ...emptyLateHistory(), posted: 50, own: 50, keys: ["late:L1:2026-11"], second: { ...emptyLateHistory(), waived: true, keys: ["late2:L1:2026-11"] } } };
  const p = plan({ receivable: { items: [rent(1000)], lateFees: voided } });
  assert.deepEqual([p.second.status, p.second.delta], ["waived", 0]);
});

test("carried rent: a second fee the old lease charged counts as posted on the renewal", () => {
  const carried = rent(1000, { entryId: "x1", carried: true, fromLeaseId: "OLD" });
  const old = { posted: 50, waived: false, second: { posted: 25, waived: false } };
  const lateFees = mergeInheritedLateFees({}, { "2026-11": [old] });
  assert.equal(lateFees["2026-11"].second.posted, 25);
  const p = planLateFees({ leaseId: "NEW", lease: { ...LEASE, id: "NEW" }, policies: FLAT, receivable: { items: [carried], lateFees }, billed, today: "2026-11-17" }).periods[0];
  assert.deepEqual([p.delta, p.second.status, p.second.delta], [0, "posted", 0]);
});

test("history: late2 entries sit under the month's `second`, soft-deleted keys stay reserved", () => {
  const map = summarizeLateEntries([
    { id: "1", leaseId: "L1", idempotencyKey: "late:L1:2026-11", status: "posted", total: 50 },
    { id: "2", leaseId: "L1", idempotencyKey: "late2:L1:2026-11", status: "posted", total: 25 },
    { id: "3", leaseId: "L1", idempotencyKey: "late2:L1:2026-10", status: "posted", total: 25, deletedAt: "2026-11-01" },
    { id: "4", leaseId: "L2", idempotencyKey: "late2:L1:2026-11", status: "posted", total: 99 },
  ]);
  const h = map.get("L1");
  assert.equal(h["2026-11"].posted, 50);
  assert.equal(h["2026-11"].second.posted, 25);
  assert.deepEqual(h["2026-10"].second.keys, ["late2:L1:2026-10"]);
  assert.equal(h["2026-10"].second.posted, 0);
  assert.equal(map.has("L2"), false);
});

test("receivable: a second fee is a late_fee item of its rent month, and lateFeesPosted adds both fees", () => {
  const acct = indexAccounts([{ id: "ar", subtype: "receivable" }]);
  const e = (id, key, date) => ({ id, sourceType: "late_fee", idempotencyKey: key, date, status: "posted", reversalOf: "", metadata: {} });
  const second = e("s1", "late2:L1:2026-10", "2026-11-03");
  assert.deepEqual(classifyEntry(second), { kind: "late_fee", period: "2026-10" });
  const lines = [{ entryId: "s1", glAccountId: "ar", debit: 25, credit: 0, date: second.date, appliesToEntryId: "", metadata: {}, entry: second }];
  const lateFees = summarizeLateEntries([
    { id: "f1", leaseId: "L1", idempotencyKey: "late:L1:2026-10", status: "posted", total: 50 },
    { ...second, leaseId: "L1", total: 25 },
  ]).get("L1");
  const r = summarizeReceivable(lines, acct, { lateFees });
  assert.deepEqual(r.items.map((i) => [i.kind, i.period]), [["late_fee", "2026-10"]]);
  assert.deepEqual(r.lateFeesPosted, { "2026-10": 75 });
});

test("late-fee count: distinct rent months in the window with a live fee", () => {
  const e = (id, key, over = {}) => ({ id, leaseId: "L1", idempotencyKey: key, status: "posted", reversalOf: "", metadata: {}, ...over });
  const entries = [
    e("1", "late:L1:2026-09"),
    e("2", "late:L1:2026-09:2026-09-08"),
    e("3", "late:L1:2026-10"),
    e("4", "late2:L1:2026-10"),
    e("5", "late2:L1:2026-11"), // a month with only a second fee counts
    e("6", "late:L1:2025-11"), // 12 months back from 2026-11 is 2025-12
    e("7", "late:L1:2026-08", { status: "void" }),
    e("8", "rev", { reversalOf: "7" }),
    e("9", "late:L9:2026-07"), // another lease's key
    e("10", "late2:L1:2026-06", { metadata: { lateFee: { countsTowardTotal: false } } }),
  ];
  assert.deepEqual(lateFeeMonths(entries, { from: "2025-12", to: "2026-11" }), { count: 3, periods: ["2026-09", "2026-10", "2026-11"] });
  assert.equal(lateFeeMonths(entries, { from: "2025-11", to: "2026-11" }).count, 4);
  assert.equal(lateFeeMonths([e("1", "late2:L1:2026-11", { metadata: { lateFee: { countsTowardTotal: false } } })]).count, 0);
});

test("warnings: a second fee with no combined cap, and user rules (warn only, none ship)", () => {
  assert.match(lateFeeWarnings(FLAT).join(" "), /combined maximum/);
  assert.equal(lateFeeWarnings({ ...FLAT, maxLateFeeTotal: 60 }).length, 0);
  const rules = [{ oncePerPeriod: true, maxAmount: 50, minGraceDays: 7, citation: "Test § 1" }];
  const w = lateFeeWarnings({ ...FLAT, maxLateFeeTotal: 60 }, { rules });
  assert.equal(w.length, 3);
  assert.match(w[0], /one late fee per rent month/);
  assert.match(w[1], /\$50\.00/);
  assert.match(w[2], /7-day grace/);
  assert.equal(lateFeeWarnings({ ...FLAT, lateFee2Enabled: false, maxLateFee: 40, graceDays: 7 }, { rules }).length, 0);
});
