import test from "node:test";
import assert from "node:assert/strict";

import { importSpec, IMPORT_ENTITIES } from "./import_spec";
import { parseDateStrict, parseMoneyStrict, parseEmailStrict, parsePhoneStrict, matchEnum, parsePercentStrict } from "./values";
import { autoMap, applyMapping, mappingCoverage } from "./mapping";
import { detectSource } from "./presets";
import { buildIndex } from "./index";
import { planRows, deriveLeaseStatus } from "./validate";
import { tieOut } from "./balances";
import { stableUuid, importRowId } from "./ids";
import { tableRecords } from "./records";
import { importTemplateCsv, importTemplateWorkbook, templateColumns } from "./templates";
import { normalizeOptions } from "./options";
import { readXlsx } from "@/lib/import/xlsx_read";
import { parseDelimited } from "@/lib/import/csv";

const JOB = "00000000-0000-4000-8000-00000000a001";
const P1 = "00000000-0000-4000-8000-0000000000a1";
const U1 = "00000000-0000-4000-8000-0000000000b1";

function ctx(entity, existing = {}, options = {}) {
  return { jobId: JOB, entity, spec: importSpec(entity), source: options.source || "generic", options: { dedupe: "skip", createMissing: false, billingStartsOn: "2026-12-01", balanceMode: "forward", cutoverDate: "2026-11-01", ...options }, today: "2026-11-08", opening: "2026-10-31", ix: buildIndex(existing) };
}
const run = (entity, rows, existing, options) => planRows(rows.map((mapped, i) => ({ rowNo: i + 2, mapped })), ctx(entity, existing, options));
const texts = (r) => r.messages.map((m) => m.text).join(" | ");

test("strict dates: US and ISO pass, 13/31/2026 and Feb 30 fail", () => {
  assert.equal(parseDateStrict("11/01/2026").value, "2026-11-01");
  assert.equal(parseDateStrict("2026-11-01").value, "2026-11-01");
  assert.equal(parseDateStrict("1/5/26").value, "2026-01-05");
  assert.equal(parseDateStrict("02/29/2028").value, "2028-02-29");
  assert.match(parseDateStrict("13/31/2026").error, /month must be 1 to 12/);
  assert.match(parseDateStrict("02/30/2026").error, /28 days/);
  assert.equal(parseDateStrict("Oct 31").ok, false);
});

test("strict money: grouped commas, parentheses and minus pass; $1,2.00 and three decimals fail", () => {
  assert.equal(parseMoneyStrict("$1,234.50").value, 1234.5);
  assert.equal(parseMoneyStrict("(1,200.00)").value, -1200);
  assert.equal(parseMoneyStrict("-$12").value, -12);
  assert.equal(parseMoneyStrict("45-").value, -45);
  assert.equal(parseMoneyStrict("1850").value, 1850);
  assert.equal(parseMoneyStrict("").value, null);
  assert.match(parseMoneyStrict("$1,2.00").error, /isn't an amount/);
  assert.equal(parseMoneyStrict("12.345").ok, false);
  assert.equal(parseMoneyStrict("1,23,456").ok, false);
});

test("contact lists keep the first address and phone; enums ignore case and punctuation", () => {
  const e = parseEmailStrict("Jane <JANE@x.com>; j2@y.org");
  assert.deepEqual([e.value, e.others], ["jane@x.com", ["j2@y.org"]]);
  assert.equal(parseEmailStrict("not an email").ok, false);
  assert.equal(parsePhoneStrict("Mobile: (207) 555-0142, Home: 207-555-0199").value, "(207) 555-0142");
  assert.equal(matchEnum("month to month", ["Active", "Month-to-month"]).value, "Month-to-month");
  assert.equal(matchEnum("Leased", ["Active"]).ok, false);
  assert.equal(parsePercentStrict("8%").value, 8);
  assert.equal(parsePercentStrict("120").ok, false);
});

const APPFOLIO_DIRECTORY = ["Property Name", "First Name", "Last Name", "Phone Numbers", "Emails", "Lease From", "Lease To", "Move-in", "Move-out", "Rent", "Unit ID", "Tenant ID"];
const APPFOLIO_RENT_ROLL = ["Property", "Unit", "Unit ID", "Tenant", "Status", "Sq. Ft.", "Market Rent", "Rent", "Deposit", "Lease From", "Lease To", "Move-in", "Past Due"];

test("AppFolio exports are detected and auto-map at least 90% of their columns", () => {
  const d = detectSource(APPFOLIO_DIRECTORY);
  assert.deepEqual([d.source, d.report, d.entity], ["appfolio", "tenant_directory", "leases"]);
  const dm = autoMap(APPFOLIO_DIRECTORY, importSpec("leases"), { source: "appfolio" });
  assert.ok(mappingCoverage(APPFOLIO_DIRECTORY, dm.mapping).pct >= 90);
  assert.equal(dm.mapping["unit.external_id"], "Unit ID");
  assert.equal(dm.mapping.term_start, "Lease From");
  const r = detectSource(APPFOLIO_RENT_ROLL);
  assert.deepEqual([r.source, r.report, r.options.createMissing], ["appfolio", "rent_roll", true]);
  const rm = autoMap(APPFOLIO_RENT_ROLL, importSpec("leases"), { source: "appfolio" });
  assert.ok(mappingCoverage(APPFOLIO_RENT_ROLL, rm.mapping).pct >= 90, JSON.stringify(rm.mapping));
  assert.deepEqual([rm.mapping.unit_id, rm.mapping["unit.rent"], rm.mapping.rent, rm.mapping["tenant.name"]], ["Unit", "Market Rent", "Rent", "Tenant"]);
  assert.equal(detectSource(["Amount Receivable", "0-30", "30-60", "60-90", "90+", "Name"]).entity, "open_balances");
});

test("generic headers map by label, alias and fuzzy match; an old-system 'Unit ID' never lands on the unit", () => {
  const { mapping, how } = autoMap(["Tenant Email Address", "Unit ID", "Unit #", "Lease Start Date", "Monthly Rent", "Property"], importSpec("leases"));
  assert.equal(mapping["tenant.email"], "Tenant Email Address");
  assert.equal(how["tenant.email"], "fuzzy");
  assert.equal(mapping.unit_id, "Unit #");
  assert.equal(mapping["unit.external_id"], "Unit ID");
  assert.equal(mapping.term_start, "Lease Start Date");
  const saved = autoMap(["Bldg", "Apt"], importSpec("units"), { saved: { property_id: "Bldg", label: "Apt" } });
  assert.deepEqual(saved.mapping, { property_id: "Bldg", label: "Apt" });
});

test("preset value transforms: AppFolio statuses, VACANT tenants and Last, First names", () => {
  const spec = importSpec("leases");
  const m = { status: "Status", "tenant.name": "Tenant" };
  assert.deepEqual(applyMapping({ Status: "Notice-Unrented", Tenant: "Doe, Jane" }, spec, m, { source: "appfolio" }), { status: "Notice given", "tenant.name": "Jane Doe" });
  assert.deepEqual(applyMapping({ Status: "Vacant-Unrented", Tenant: "VACANT" }, spec, m, { source: "appfolio" }), { status: "", "tenant.name": "" });
  assert.equal(applyMapping({ __group: "Maple Court" }, spec, {}, {}).property_id, "Maple Court");
});

test("records: title rows skipped, group labels carried, totals dropped, row numbers kept", () => {
  const rows = parseDelimited("Rent Roll\nAs of: 11/08/2026\n\nUnit,Tenant,Rent\n-> Maple Court\n2B,Jane Doe,1200\n3A,VACANT,0\nTotal,,1200\n");
  const t = tableRecords(rows);
  assert.deepEqual(t.headers, ["Unit", "Tenant", "Rent"]);
  assert.deepEqual(t.records.map((r) => [r.rowNo, r.raw.Unit, r.raw.__group]), [[6, "2B", "Maple Court"], [7, "3A", "Maple Court"]]);
});

const property = (id, name) => ({ id, name, metadata: {} });
const unit = (id, propertyId, label, extra = {}) => ({ id, property_id: propertyId, label, status: "Vacant", metadata: {}, ...extra });

test("leases: a lease on a missing unit is rejected unless the job creates missing units", () => {
  const existing = { properties: [property(P1, "Maple Court")], units: [unit(U1, P1, "2B")] };
  const row = { property_id: "Maple Court", unit_id: "9Z", "tenant.name": "Ann Ray", term_start: "2026-01-01", rent: "1200" };
  const strict = run("leases", [row], existing).results[0];
  assert.equal(strict.status, "error");
  assert.match(texts(strict), /Unit "9Z" isn't in Geiger at Maple Court/);
  const lenient = run("leases", [row], existing, { createMissing: true }).results[0];
  assert.equal(lenient.status, "valid");
  assert.deepEqual(lenient.ops.filter((o) => o.op === "insert").map((o) => o.table), ["units", "tenants", "leases", "lease_parties"]);
});

test("leases: co-tenants join the first row's lease; a second active lease on a unit is refused; billing starts at the cutover", () => {
  const existing = { properties: [property(P1, "Maple Court")], units: [unit(U1, P1, "2B")] };
  const base = { property_id: "Maple Court", unit_id: "2B", term_start: "2026-01-01", term_end: "2026-12-31", rent: "1200" };
  const { results } = run("leases", [
    { ...base, "tenant.name": "Jane Doe", "tenant.email": "jane@x.com" },
    { ...base, "tenant.name": "John Doe", "tenant.email": "john@x.com" },
    { ...base, term_start: "2026-03-01", "tenant.name": "Zed Roe" },
  ], existing);
  const [a, b, c] = results;
  assert.equal(a.status, "valid");
  const lease = a.ops.find((o) => o.table === "leases");
  assert.equal(lease.values.metadata.billingStartsOn, "2026-12-01");
  assert.equal(lease.values.name, "2B — Jane Doe");
  assert.ok(a.ops.some((o) => o.table === "units" && o.op === "update" && o.values.status === "Occupied" && o.before.status === "Vacant"));
  assert.deepEqual(a.billing, [lease.id]);
  assert.match(texts(b), /Joins the lease on row 2/);
  assert.equal(b.ops.find((o) => o.table === "lease_parties").values.lease_id, lease.id);
  assert.equal(c.status, "error");
  assert.match(texts(c), /already has an active lease \(Jane Doe, from 2026-01-01, row 2\)/);
});

test("leases: re-planning a committed row is a no-op (ids are fixed per job, row and role)", () => {
  const existing = { properties: [property(P1, "Maple Court")], units: [unit(U1, P1, "2B")] };
  const row = { property_id: "Maple Court", unit_id: "2B", "tenant.name": "Jane Doe", term_start: "2026-01-01", rent: "1200" };
  const first = run("leases", [row], existing).results[0];
  // What the first commit wrote, read back as existing records.
  const wrote = (t) => first.ops.filter((o) => o.table === t && o.op === "insert").map((o) => o.values);
  const again = run("leases", [row], { ...existing, tenants: wrote("tenants"), leases: wrote("leases"), lease_parties: wrote("lease_parties"), units: [unit(U1, P1, "2B", { tenant_id: wrote("tenants")[0].id })] }).results[0];
  assert.equal(again.ops.filter((o) => o.op === "insert").length, 0);
  assert.equal(again.primary.action, "create");
  assert.equal(importRowId(JOB, 2, "lease"), first.primary.id);
});

test("tenants: a duplicate email in the file is an error; one already in Geiger is skipped (or updated)", () => {
  const existing = { tenants: [{ id: "t-1", name: "Old Tenant", email: "old@x.com", metadata: {} }] };
  const { results } = run("tenants", [{ name: "Jane", email: "jane@x.com" }, { name: "Janet", email: "JANE@x.com" }, { name: "Old Tenant", email: "old@x.com", phone: "207-555-0100" }], existing);
  assert.deepEqual(results.map((r) => r.status), ["valid", "error", "skipped"]);
  assert.match(texts(results[1]), /Duplicate email jane@x.com — same as row 2/);
  const upd = run("tenants", [{ name: "Old Tenant", email: "old@x.com", phone: "207-555-0100" }], existing, { dedupe: "update" }).results[0];
  assert.deepEqual(upd.ops.map((o) => [o.op, o.values.phone, o.before.phone]), [["update", "207-555-0100", null]]);
});

test("typed problems name the column: a bad date and a bad amount", () => {
  const existing = { properties: [property(P1, "Maple Court")], units: [unit(U1, P1, "2B")] };
  const r = run("leases", [{ property_id: "Maple Court", unit_id: "2B", "tenant.name": "Jane", term_start: "13/31/2026", rent: "$1,2.00" }], existing).results[0];
  assert.equal(r.status, "error");
  assert.match(texts(r), /Lease start: "13\/31\/2026" isn't a date/);
  assert.match(texts(r), /Monthly rent: "\$1,2\.00" isn't an amount/);
  assert.equal(r.ops.length, 0);
});

test("owners: later rows for the same owner add properties; vendors refuse duplicates", () => {
  const existing = { properties: [property(P1, "Maple Court"), property("p2", "Birch Row")] };
  const { results } = run("owners", [
    { name: "Ann Owner", email: "ann@x.com", "ownership.property_id": "Maple Court", "ownership.ownership_pct": "60" },
    { name: "Ann Owner", email: "ann@x.com", "ownership.property_id": "Birch Row" },
  ], existing);
  assert.deepEqual(results.map((r) => r.status), ["valid", "valid"]);
  assert.equal(results[1].ops[0].values.ownership_pct, 100);
  const v = run("vendors", [{ name: "Acme", email: "a@acme.com" }, { name: "Acme Inc", email: "a@acme.com" }]).results;
  assert.deepEqual(v.map((r) => r.status), ["valid", "error"]);
});

const lease = (id, unitId, tenantName, extra = {}) => ({ id, unit_id: unitId, property_id: P1, tenant_id: `t-${id}`, tenant_name: tenantName, name: `2B — ${tenantName}`, term_start: "2026-01-01", status: "Active", metadata: {}, ...extra });
const acct = (id, number, name, accountType, subtype, extra = {}) => ({ id, number, name, account_type: accountType, subtype, status: "Active", is_trust: false, system_key: null, metadata: {}, ...extra });
const CHART = [
  acct("a1000", "1000", "Operating Cash", "Asset", "cash", { system_key: "operating_cash" }),
  acct("a1010", "1010", "Trust Cash", "Asset", "cash", { system_key: "trust_cash", is_trust: true }),
  acct("a1020", "1020", "Security Deposit Trust Cash", "Asset", "cash", { system_key: "deposit_cash", is_trust: true }),
  acct("a1200", "1200", "Accounts Receivable", "Asset", "receivable", { system_key: "accounts_receivable" }),
  acct("a2100", "2100", "Security Deposits Held", "Liability", "deposits", { system_key: "security_deposits" }),
  acct("a2110", "2110", "Deposit Interest Payable", "Liability", "deposits", { system_key: "deposit_interest_payable" }),
  acct("a2200", "2200", "Prepaid Rent", "Liability", "prepaid", { system_key: "prepaid_rent" }),
  acct("a3000", "3000", "Owner Equity", "Equity", "equity", { system_key: "owner_equity" }),
  acct("a4000", "4000", "Rental Income", "Income", "income", { system_key: "rent_income" }),
];
const BANKS = [{ id: "bt", name: "Trust account", account_type: "Trust", status: "Active", gl_account_id: "a1010" }, { id: "bd", name: "Deposit account", account_type: "Security deposit", status: "Active", gl_account_id: "a1020" }];

test("opening balances: aging buckets become dated charges; forward mode takes one row per lease; deposits ride along", () => {
  const existing = { properties: [property(P1, "Maple Court")], units: [unit(U1, P1, "2B"), unit("u2", P1, "3A")], leases: [lease("l1", U1, "Jane Doe"), lease("l2", "u2", "Sam Lee")], tenants: [], gl_accounts: CHART, bank_accounts: BANKS, owners: [{ id: "o1", name: "Ann Owner", metadata: {} }] };
  const { results } = run("open_balances", [
    { property: "Maple Court", unit: "2B", tenant: "Jane Doe", balance: "1,500.00", age_0_30: "1000", age_61_90: "500", deposit: "1200", deposit_interest: "5" },
    { property: "Maple Court", unit: "3A", balance: "(300.00)" },
    { property: "Maple Court", unit: "2B", balance: "10" },
    { owner: "Ann Owner", property: "Maple Court", balance: "5000" },
    { property: "Maple Court", unit: "3A", balance: "100", age_0_30: "40" },
  ], existing);
  const [a, b, c, d, e] = results;
  assert.deepEqual(a.lines.map((l) => [l.kind, l.amount, l.item_date]), [["tenant_balance", 1000, "2026-10-16"], ["tenant_balance", 500, "2026-08-17"], ["deposit", 1200, null]]);
  assert.equal(a.lines[2].metadata.interest, 5);
  assert.deepEqual(b.lines.map((l) => [l.kind, l.amount]), [["tenant_credit", 300]]);
  assert.match(texts(c), /Row 2 already carries this lease's balance/);
  assert.deepEqual(d.lines.map((l) => [l.kind, l.owner_id, l.amount]), [["owner_balance", "o1", 5000]]);
  assert.match(texts(e), /aging buckets add up to \$40\.00, not the balance \$100\.00/);
});

test("trial balance: subledger and trust accounts are held back to tie out; missing accounts are added; an unbalanced file is refused", () => {
  const existing = { gl_accounts: CHART, properties: [] };
  const ok = run("gl_opening", [
    { account: "1000", debit: "25,000.00" },
    { account: "1200 · Accounts Receivable", debit: "1500" },
    { account: "3050", account_name: "Prior Equity", credit: "25000" },
    { account: "2100", credit: "1500" },
  ], existing);
  assert.deepEqual(ok.problems, []);
  const [cash, ar, eq, dep] = ok.results;
  assert.deepEqual(cash.lines.map((l) => [l.kind, l.gl_account_id, l.amount]), [["gl_balance", "a1000", 25000]]);
  assert.deepEqual(ar.tieOut, { glAccountId: "a1200", amount: 1500, label: "1200 · Accounts Receivable" });
  assert.equal(eq.ops[0].table, "gl_accounts");
  assert.deepEqual([eq.ops[0].values.account_type, eq.lines[0].amount], ["Equity", -25000]);
  assert.equal(dep.tieOut.amount, -1500);
  const bad = run("gl_opening", [{ account: "1000", debit: "100" }, { account: "3000", credit: "90" }], existing);
  assert.match(bad.problems[0].text, /doesn't balance: debits \$100\.00, credits \$90\.00/);
  assert.ok(bad.results.every((r) => r.status === "error" && !r.lines.length));
});

test("tie-out: the batch's subledger totals against the trial balance, and Opening Balance Equity", () => {
  const existing = { properties: [property(P1, "Maple Court")], units: [unit(U1, P1, "2B")], leases: [lease("l1", U1, "Jane Doe")], tenants: [], gl_accounts: CHART, bank_accounts: BANKS, owners: [] };
  const bal = run("open_balances", [{ property: "Maple Court", unit: "2B", balance: "1500", deposit: "1200" }], existing).results;
  const tb = run("gl_opening", [{ account: "1200", debit: "1500" }, { account: "1020", debit: "1200" }, { account: "2100", credit: "1200" }, { account: "3000", credit: "1500" }], existing).results;
  const t = tieOut({ lines: [...bal, ...tb].flatMap((r) => r.lines), accounts: CHART, banks: BANKS, batch: { id: "b", cutoverDate: "2026-11-01", metadata: {} }, targets: tb.filter((r) => r.tieOut).map((r) => r.tieOut) });
  assert.equal(t.clearingNet, 0);
  assert.ok(t.ready, JSON.stringify(t.errors));
  assert.deepEqual(t.rows.map((r) => [r.number, r.tb, r.batch, r.diff]), [["1020", 1200, 1200, 0], ["1200", 1500, 1500, 0], ["2100", -1200, -1200, 0]]);
  const off = tieOut({ lines: bal.flatMap((r) => r.lines), accounts: CHART, banks: BANKS, batch: { id: "b", cutoverDate: "2026-11-01" }, targets: [] });
  assert.equal(off.clearingNet, -1500);
  assert.equal(off.ready, false);
});

test("lease status from dates; ids are stable", () => {
  assert.equal(deriveLeaseStatus({ term_start: "2027-01-01" }, "2026-11-08"), "Pending");
  assert.equal(deriveLeaseStatus({ term_start: "2025-01-01", term_end: "2025-12-31" }, "2026-11-08"), "Month-to-month");
  assert.equal(deriveLeaseStatus({ term_start: "2025-01-01", move_out_date: "2026-10-31" }, "2026-11-08"), "Ended");
  assert.equal(stableUuid("a"), stableUuid("a"));
  assert.notEqual(stableUuid("a"), stableUuid("b"));
  assert.match(stableUuid("x"), /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test("templates: every import has CSV and XLSX templates that map back onto themselves", async () => {
  for (const entity of IMPORT_ENTITIES) {
    const spec = importSpec(entity);
    const csv = importTemplateCsv(entity);
    const rows = parseDelimited(csv);
    assert.deepEqual(rows[0], templateColumns(spec).map((c) => c.header), entity);
    const { mapping } = autoMap(rows[0], spec);
    assert.equal(Object.keys(mapping).length, spec.fields.length, `${entity} template maps every column`);
    const { sheets } = await readXlsx(importTemplateWorkbook(entity));
    assert.deepEqual(sheets.map((s) => s.name), [spec.label, "Notes"]);
    assert.deepEqual(sheets[0].rows[0], rows[0]);
  }
});

test("options: dedupe, billing start and cutover defaults", () => {
  assert.deepEqual(normalizeOptions("leases", {}, "2026-11-08"), { dedupe: "skip", createMissing: false, billingStartsOn: "2026-12-01" });
  const b = normalizeOptions("open_balances", { balanceMode: "itemized", cutoverDate: "2026-11-01", dedupe: "nope" });
  assert.deepEqual([b.dedupe, b.balanceMode, b.cutoverDate, b.post], ["skip", "itemized", "2026-11-01", true]);
});
