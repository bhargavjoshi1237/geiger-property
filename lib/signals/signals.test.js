import { test } from "node:test";
import assert from "node:assert/strict";
import { indexAccounts } from "@/lib/ledger/postings";
import { computeMetric, resolveParams } from "@/lib/metrics/index";
import { buildBriefing, localClock } from "./briefing";
import { SIGNAL_DEFAULTS, resolveSignalConfig, scoreOf } from "./config";
import { ALL_AREAS, areasForRole } from "./constants";
import { rentDelinquency } from "./detectors/collections";
import { DETECTORS } from "./detectors";
import { changesSince, rankSignals } from "./rank";

const sig = (o) => ({ status: "open", area: "collections", score: 100, metadata: { grain: "record" }, first_seen_at: "2026-11-01T00:00:00Z", ...o });

test("roles map to areas, with overrides from Notifications", () => {
  assert.deepEqual(areasForRole("Accountant"), ["accounting"]);
  assert.deepEqual(areasForRole("Leasing agent"), ["leasing"]);
  assert.deepEqual(areasForRole({ id: "manager" }), ALL_AREAS);
  assert.deepEqual(areasForRole("Night auditor"), ALL_AREAS);
  assert.deepEqual(areasForRole("Leasing agent", { leasing_agent: ["leasing", "collections"] }), ["leasing", "collections"]);
});

test("ranking collapses records under their summary and filters by area", () => {
  const rows = [
    sig({ id: "a", detector_key: "rent_delinquency", score: 900 }),
    sig({ id: "b", detector_key: "rent_delinquency", score: 2000, metadata: { grain: "summary" } }),
    sig({ id: "c", detector_key: "bills_attention", area: "accounting", score: 500 }),
    sig({ id: "d", detector_key: "vacant_too_long", area: "leasing", score: 700, status: "resolved" }),
  ];
  assert.deepEqual(rankSignals(rows).map((s) => s.id), ["b", "c"]);
  assert.deepEqual(rankSignals(rows, { collapse: false }).map((s) => s.id), ["b", "a", "c"]);
  assert.deepEqual(rankSignals(rows, { areas: ["accounting"] }).map((s) => s.id), ["c"]);
});

test("changes since a moment: new, worse and resolved", () => {
  const since = "2026-11-07T00:00:00Z";
  const rows = [
    sig({ id: "new", first_seen_at: "2026-11-07T06:00:00Z" }),
    sig({ id: "worse", worsened_at: "2026-11-07T06:00:00Z" }),
    sig({ id: "old" }),
    sig({ id: "done", status: "resolved", resolved_at: "2026-11-07T06:00:00Z" }),
  ];
  const c = changesSince(rows, since);
  assert.deepEqual([c.new.map((s) => s.id), c.worse.map((s) => s.id), c.resolved.map((s) => s.id)], [["new"], ["worse"], ["done"]]);
});

test("a briefing only carries the role's areas", () => {
  const rows = [
    sig({ id: "rent", detector_key: "rent_delinquency", area: "collections", score: 900, impact_amount: 900 }),
    sig({ id: "bill", detector_key: "bills_attention", area: "accounting", score: 400, impact_amount: 400 }),
    sig({ id: "lease", detector_key: "renewal_at_risk", area: "leasing", score: 300, impact_amount: 300 }),
  ];
  const accountant = buildBriefing({ signals: rows, areas: areasForRole("Accountant"), since: "2026-10-01T00:00:00Z", reviewOpen: 3, reviewAssigned: 1 });
  assert.deepEqual(accountant.top.map((s) => s.id), ["bill"]);
  assert.equal(accountant.counts.moneyAtStake, 400);
  assert.equal(accountant.counts.reviewAssigned, 1);
  const leasing = buildBriefing({ signals: rows, areas: areasForRole("Leasing agent"), since: "2026-10-01T00:00:00Z" });
  assert.deepEqual(leasing.top.map((s) => s.area), ["leasing"]);
});

test("score = impact × urgency × category, nominal when no money", () => {
  assert.equal(scoreOf({ impactAmount: 1000, urgency: "urgent", category: "risk" }), 4500);
  assert.equal(scoreOf({ impactAmount: null, urgency: "routine", category: "watch" }), SIGNAL_DEFAULTS.nominal);
  assert.equal(resolveSignalConfig({ vacantDays: "45", disabled: ["repeat_repairs"] }).vacantDays, 45);
});

test("local clock follows the company timezone", () => {
  const now = new Date("2026-11-08T14:30:00Z");
  assert.deepEqual(localClock(now, "America/Los_Angeles"), { date: "2026-11-08", time: "06:30" });
  assert.deepEqual(localClock(now, "Not/AZone"), { date: "2026-11-08", time: "14:30" });
});

test("detectors are well-formed", () => {
  const keys = new Set();
  for (const d of DETECTORS) {
    assert.ok(d.key && d.label && d.area && d.category && d.description && typeof d.detect === "function", d.key);
    assert.ok(!keys.has(d.key), `unique ${d.key}`);
    keys.add(d.key);
  }
});

test("rent delinquency signals agree with the delinquent_balance metric", () => {
  const accounts = indexAccounts([
    { id: "ar", accountType: "Asset", subtype: "receivable" },
    { id: "rent", accountType: "Income", subtype: "income" },
  ]);
  const charge = (id, lease, date, amount) => [
    { id: `${id}a`, entryId: id, date, glAccountId: "ar", debit: amount, credit: 0, leaseId: lease, tenantId: `t-${lease}`, propertyId: "p1", entry: { id, sourceType: "charge", date } },
    { id: `${id}b`, entryId: id, date, glAccountId: "rent", debit: 0, credit: amount, leaseId: lease, propertyId: "p1", entry: { id, sourceType: "charge", date } },
  ];
  const src = {
    properties: [{ id: "p1", name: "Harbor Lofts" }],
    units: [],
    tenants: [],
    leases: [
      { id: "l1", tenantId: "t-l1", tenantName: "Maya Patel", propertyId: "p1", status: "Active" },
      { id: "l2", tenantId: "t-l2", tenantName: "Sam Okafor", propertyId: "p1", status: "Active" },
      { id: "l3", tenantId: "t-l3", tenantName: "New Charge", propertyId: "p1", status: "Active" },
    ],
    ledger: { accounts, lines: [...charge("c1", "l1", "2026-09-01", 412), ...charge("c2", "l2", "2026-10-20", 1600), ...charge("c3", "l3", "2026-11-06", 900)] },
  };
  const now = new Date("2026-11-08T12:00:00");
  const ctx = { p: resolveParams({ asOf: "2026-11-08" }, now), now, config: resolveSignalConfig({}), policies: {} };
  const out = rentDelinquency.detect(src, ctx);
  const summary = out.findings.find((f) => f.grain === "summary");
  const tenants = out.findings.filter((f) => f.grain === "record");
  // l3 is inside the 5-day grace: owed (and in the summary total) but not yet a late tenant.
  assert.equal(tenants.length, 2);
  assert.equal(summary.impact, 412 + 1600 + 900);
  assert.equal(computeMetric("delinquent_balance", src, { asOf: "2026-11-08" }).value, 412 + 1600 + 900);
  assert.equal(tenants.find((f) => f.title.startsWith("Maya")).urgency, "urgent");
});
