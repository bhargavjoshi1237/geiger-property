import { test } from "node:test";
import assert from "node:assert/strict";

import { indexAccounts, normalizeGlAccount } from "@/lib/ledger/postings";
import { getNotification } from "@/lib/email/catalog";
import { getJob } from "@/lib/jobs/registry";
import { getReport, runReport } from "@/lib/reports/catalog";
import { AGING_LABELS, statementMath, statementSections, statementStats } from "./statement_math";
import { statementEmailData, statementHtml, statementsBatchHtml } from "./statement_html";
import {
  audienceOf,
  audienceSettings,
  channelsOf,
  lastMonth,
  normalizeStatementSettings,
  statementKey,
  statementPeriods,
  statementPrintKey,
  statementRange,
  statementRecipients,
  statementSelected,
} from "./statement_rules";

const ACCTS = indexAccounts(
  [
    { id: "ar", number: "1200", name: "Accounts Receivable", account_type: "Asset", subtype: "receivable", system_key: "accounts_receivable" },
    { id: "dep", number: "2100", name: "Security Deposits Held", account_type: "Liability", subtype: "deposits", system_key: "security_deposits" },
    { id: "cash", number: "1010", name: "Trust cash", account_type: "Asset", subtype: "cash", system_key: "trust_cash" },
  ].map(normalizeGlAccount),
);
const L = "lease-1";
let n = 0;
// One AR line with its entry.
function ar(entryId, date, { debit = 0, credit = 0, sourceType = "charge", key = "", appliesTo = "", status = "posted", reversalOf = "", memo = "" } = {}) {
  n += 1;
  return { id: `l${n}`, entryId, date, glAccountId: "ar", debit, credit, leaseId: L, tenantId: "t1", appliesToEntryId: appliesTo, metadata: {}, entry: { id: entryId, date, sourceType, idempotencyKey: key, status, reversalOf, memo, metadata: {}, createdAt: `${date}T0${n % 10}:00:00Z` } };
}
const dep = (entryId, date, credit) => ({ id: `d${entryId}`, entryId, date, glAccountId: "dep", debit: 0, credit, leaseId: L, metadata: {}, entry: { id: entryId, sourceType: "deposit_held", status: "posted", metadata: {} } });

// Aug–Nov rent 1,200; Sep paid; Oct 700 paid against Sep, a 100 unapplied credit, a 50 late fee voided inside October; Nov rent after the period.
const LINES = [
  ar("aug", "2026-08-01", { debit: 1200, key: `rent:${L}:2026-08` }),
  ar("sep", "2026-09-01", { debit: 1200, key: `rent:${L}:2026-09` }),
  ar("p1", "2026-09-05", { credit: 1200, sourceType: "payment", appliesTo: "aug", memo: "Payment · Check" }),
  ar("oct", "2026-10-01", { debit: 1200, key: `rent:${L}:2026-10` }),
  ar("late", "2026-10-06", { debit: 50, sourceType: "late_fee", key: `late:${L}:2026-10`, status: "void" }),
  ar("p2", "2026-10-10", { credit: 700, sourceType: "payment", appliesTo: "sep" }),
  ar("late-rev", "2026-10-12", { credit: 50, sourceType: "late_fee", reversalOf: "late" }),
  ar("cr", "2026-10-15", { credit: 100, sourceType: "credit", memo: "Courtesy credit" }),
  ar("nov", "2026-11-01", { debit: 1200, key: `rent:${L}:2026-11` }),
  dep("d1", "2026-07-20", 1500),
];
const OCT = { from: "2026-10-01", to: "2026-10-31" };

test("math: opening + charges − payments − credits = closing; the void inside the month is left off", () => {
  const st = statementMath({ lines: LINES, accounts: ACCTS, leaseId: L, ...OCT, receipts: new Map([["p2", "RCT-000007"]]) });
  assert.equal(st.opening, 1200);
  assert.deepEqual([st.charges, st.payments, st.credits, st.closing], [1200, 700, 100, 1600]);
  assert.equal(Math.round((st.opening + st.charges - st.payments - st.credits) * 100) / 100, st.closing);
  assert.deepEqual(st.activity.map((r) => r.entryId), ["oct", "p2", "cr"], "the late fee and its reversal both fall in October");
  assert.deepEqual(st.activity.map((r) => r.balance), [2400, 1700, 1600], "running balance from the opening");
  assert.equal(st.activity[0].description, "Rent · October 2026");
  assert.equal(st.activity[1].reference, "RCT-000007");
  assert.equal(st.amountDue, 1600);
  assert.equal(st.depositsHeld, 1500);
});

test("math: aging takes the unapplied credit off the oldest bucket, so the buckets sum to the closing balance", () => {
  const st = statementMath({ lines: LINES, accounts: ACCTS, leaseId: L, ...OCT });
  // Open on Oct 31: Sep 500 (60 days) and Oct 1,200 (30 days); the 100 credit comes off September.
  assert.deepEqual({ b0: st.aging.b0, b31: st.aging.b31, b61: st.aging.b61, b91: st.aging.b91 }, { b0: 1200, b31: 400, b61: 0, b91: 0 });
  assert.equal(st.aging.b0 + st.aging.b31 + st.aging.b61 + st.aging.b91, st.closing);
  assert.equal(st.aging.total, 1600);
});

test("math: a credit balance has no aging and reads as credit on account", () => {
  const lines = [ar("c1", "2026-10-01", { debit: 1000 }), ar("c2", "2026-10-03", { credit: 1250, sourceType: "payment", appliesTo: "c1" })];
  const st = statementMath({ lines, accounts: ACCTS, leaseId: L, ...OCT });
  assert.deepEqual([st.closing, st.credit, st.amountDue, st.aging], [-250, 250, 0, null]);
  const html = statementHtml({ ...st, ...OCT, period: "2026-10", generatedOn: "2026-11-05", dueDate: "2026-11-01" });
  assert.match(html, /Credit on account/);
  assert.match(html, /\$250\.00 credit on account/);
});

test("math: a void and reversal across months stay listed, and the months still chain", () => {
  const lines = [ar("x", "2026-09-20", { debit: 80, status: "void" }), ar("xr", "2026-10-02", { credit: 80, reversalOf: "x" })];
  const sep = statementMath({ lines, accounts: ACCTS, leaseId: L, from: "2026-09-01", to: "2026-09-30" });
  const oct = statementMath({ lines, accounts: ACCTS, leaseId: L, ...OCT });
  assert.equal(sep.closing, 80);
  assert.equal(oct.opening, sep.closing);
  assert.equal(oct.closing, 0);
  assert.match(oct.activity[0].description, /^Reversal · /);
});

test("sections, stats and the page carry the same figures; HTML is escaped", () => {
  const math = statementMath({ lines: LINES, accounts: ACCTS, leaseId: L, ...OCT });
  const st = { ...math, ...OCT, period: "2026-10", generatedOn: "2026-11-05", dueDate: "2026-11-01", resident: { name: "Ana <Diaz>", names: ["Ana <Diaz>"] }, company: { name: "Harbor & Pine" }, portalUrl: "https://example.test/portal" };
  const [summary, aging, activity] = statementSections(st);
  assert.equal(summary.totals.amount, 1600);
  assert.deepEqual(aging.columns.map((c) => c.header), [...Object.values(AGING_LABELS), "Total"]);
  assert.equal(activity.totals.balance, 1600);
  assert.deepEqual(statementStats(st).map((s) => s.value), ["$1,200.00", "$1,200.00", "$800.00", "$1,600.00", "$1,600.00"]);
  const html = statementHtml(st);
  assert.ok(html.includes("Ana &lt;Diaz&gt;") && !html.includes("Ana <Diaz>"));
  assert.ok(html.includes("Harbor &amp; Pine") && html.includes("October 2026") && html.includes("https://example.test/portal"));
  assert.ok(html.includes("—"), "empty money cells read as a dash");
  const batch = statementsBatchHtml([st, st]);
  assert.equal((batch.match(/class="page"/g) || []).length, 2);
  const email = statementEmailData(st, { name: "Ana Diaz" });
  assert.deepEqual([email.recipientName, email.period, email.opening, email.charges, email.payments, email.closing, email.amountDue, email.dueDate, email.ctaUrl], ["Ana", "October 2026", "$1,200.00", "$1,200.00", "$800.00", "$1,600.00", "$1,600.00", "Nov 1, 2026", "https://example.test/portal"]);
});

test("recipients: the primary tenant always, flagged parties and contacts, deduped; delivery picks the channels", () => {
  const tenants = new Map([
    ["t1", { id: "t1", name: "Ana", email: "Ana@Example.com", metadata: {} }],
    ["t2", { id: "t2", name: "Ben", email: "ben@example.com", metadata: { statementDelivery: "Mail" } }],
    ["t3", { id: "t3", name: "Cy", email: "cy@example.com", metadata: { statementDelivery: "None" } }],
  ]);
  const parties = [
    { tenantId: "t1", name: "Ana", role: "tenant", isPrimary: true, metadata: { receivesStatements: true } },
    { tenantId: "t2", name: "Ben", role: "tenant", metadata: { receivesStatements: true } },
    { tenantId: "t3", name: "Cy", role: "tenant", metadata: {} },
    { name: "Gus Guarantor", email: "gus@example.com", role: "guarantor", metadata: { receivesStatements: true } },
    { name: "Ola", email: "ola@example.com", role: "occupant", metadata: { receivesStatements: true } },
  ];
  const contacts = [
    { id: "k1", ownerId: "t1", name: "Mom", metadata: { email: "mom@example.com", receivesStatements: true } },
    { id: "k2", ownerId: "t1", name: "Dup", metadata: { email: "ana@example.com", receivesStatements: true } },
    { id: "k3", ownerId: "t1", name: "No", metadata: { email: "no@example.com" } },
  ];
  const list = statementRecipients({ lease: { id: L, tenantId: "t1" }, tenants, parties, contacts });
  assert.deepEqual(list.map((r) => [r.name, r.email, r.delivery]), [
    ["Ana", "ana@example.com", "email"],
    ["Ben", "ben@example.com", "mail"],
    ["Gus Guarantor", "gus@example.com", "email"],
    ["Mom", "mom@example.com", "email"],
  ]);
  assert.deepEqual(channelsOf(list[1]), ["print"]);
  assert.deepEqual(channelsOf({ delivery: "both" }), ["email", "print"]);
  assert.deepEqual(channelsOf({ delivery: "none" }), []);
  assert.deepEqual(channelsOf({ delivery: "email", dnc: true }), [], "do not contact gets neither email nor paper");
  const none = statementRecipients({ lease: { id: L, tenantId: "t3" }, tenants, parties: [], contacts: [] });
  assert.deepEqual(none.map((r) => r.delivery), ["none"], "a primary tenant set to None stays listed, excluded");
  const bare = statementRecipients({ lease: { id: L, tenantId: "", tenantName: "Walk-in" } });
  assert.deepEqual(bare.map((r) => [r.name, r.email]), [["Walk-in", ""]]);
});

test("settings: defaults, clamped day, audience round trip and selection", () => {
  assert.deepEqual(normalizeStatementSettings(null), { enabled: false, day: 5, onlyWithBalance: true, includeZero: false });
  assert.equal(normalizeStatementSettings({ day: 31 }).day, 28);
  assert.equal(normalizeStatementSettings({ day: 0 }).day, 5);
  for (const a of ["owing", "activity", "all"]) assert.equal(audienceOf(normalizeStatementSettings(audienceSettings(a))), a);
  const owing = { closing: 10, activity: [] };
  const credit = { closing: -5, activity: [] };
  const quiet = { closing: 0, activity: [] };
  assert.deepEqual([owing, credit, quiet].map((s) => statementSelected(s, {})), [true, false, false]);
  assert.deepEqual([owing, credit, quiet].map((s) => statementSelected(s, audienceSettings("activity"))), [true, true, false]);
  assert.deepEqual([owing, credit, quiet].map((s) => statementSelected(s, audienceSettings("all"))), [true, true, true]);
});

test("periods and keys: last month, the current month to date, no future months; one key per lease, month and address", () => {
  assert.equal(lastMonth("2026-01-05"), "2025-12");
  assert.deepEqual(statementRange("2026-10", "2026-11-08"), { period: "2026-10", from: "2026-10-01", to: "2026-10-31", toDate: false });
  assert.deepEqual(statementRange("2026-11", "2026-11-08"), { period: "2026-11", from: "2026-11-01", to: "2026-11-08", toDate: true });
  assert.equal(statementRange("2026-12", "2026-11-08"), null);
  assert.equal(statementRange("2026-13", "2026-11-08"), null);
  assert.deepEqual(statementPeriods("2026-08-15", "2026-11-08"), ["2026-11", "2026-10", "2026-09", "2026-08"]);
  assert.equal(statementKey(L, "2026-10", " Ana@Example.com "), `stmt:${L}:2026-10:ana@example.com`);
  assert.match(statementKey(L, "2026-10", "a@b.co", "2026-11-08T10:00:00Z"), /:resend:2026-11-08T10:00:00Z$/);
  assert.equal(statementPrintKey(L, "2026-10", "tenant:t2"), `stmt:${L}:2026-10:print:tenant:t2`);
});

test("wiring: catalog email, the scheduled job and the report", () => {
  const email = getNotification("resident_statement");
  assert.deepEqual([email.group, email.live, email.template], ["rent", true, "property.resident_statement"]);
  const job = getJob("resident-statements");
  assert.equal(job.schedule, "30 12 * * *");
  const def = getReport("resident_statement");
  assert.equal(def.category, "Receivables");
  const data = {
    ledger: { lines: LINES, accounts: ACCTS },
    leases: [{ id: L, name: "Lease 4B", tenantName: "Ana", unit: "4B", status: "Active" }],
    units: [],
    tenants: [],
    properties: [],
  };
  const out = runReport(def, data, { ...OCT, leaseId: L, preset: "custom" });
  assert.deepEqual(out.stats.map((s) => s.value), ["$1,200.00", "$1,200.00", "$800.00", "$1,600.00"]);
  assert.equal(out.sections.find((s) => s.key === "summary").description, "October 2026");
});

// A fake service-role client: `handler(q)` answers each query; every query (table, op, payload, filters) is kept.
function fakeDb(handler) {
  const queries = [];
  const from = (table) => {
    const q = { table, op: "select", payload: null, filters: [] };
    queries.push(q);
    const builder = new Proxy(
      {},
      {
        get(_, prop) {
          if (prop === "then") return (ok, fail) => Promise.resolve(handler(q) || { data: [], error: null }).then(ok, fail);
          return (...args) => {
            if (["insert", "update", "upsert"].includes(prop)) [q.op, q.payload] = [prop, args[0]];
            else if (!["select", "order", "limit", "maybeSingle", "single"].includes(prop)) q.filters.push([prop, ...args]);
            return builder;
          };
        },
      },
    );
    return builder;
  };
  return { queries, from };
}

test("settings save: merges statements into billing_settings inside the project and leaves jobsPaused alone", async () => {
  const { saveStatementSettings } = await import("./statements");
  const db = fakeDb((q) => (q.op === "select" ? { data: [{ id: "s1", value: { jobsPaused: true, autoBillRent: true, statements: { day: 9 } }, deleted_at: null }], error: null } : { data: [{ id: "s1" }], error: null }));
  const saved = await saveStatementSettings(db, "p1", { enabled: true });
  assert.deepEqual(saved, { enabled: true, day: 9, onlyWithBalance: true, includeZero: false });
  const update = db.queries.find((q) => q.op === "update");
  assert.deepEqual(update.payload.value, { jobsPaused: true, autoBillRent: true, statements: saved });
  assert.ok(db.queries.every((q) => q.filters.some((f) => f[0] === "eq" && f[1] === "project_id" && f[2] === "p1")), "every read and write is narrowed to the project");
});
