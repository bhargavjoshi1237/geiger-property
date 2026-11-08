import { test } from "node:test";
import assert from "node:assert/strict";

import {
  JOURNAL_COLUMNS,
  JOURNAL_EXPORT_COLUMNS,
  amountOf,
  buildReversal,
  copyDraft,
  dateOf,
  entryFingerprint,
  importKey,
  journalEntryInput,
  journalToRows,
  manualJournalInput,
  markDuplicates,
  openingLinesFromRows,
  parseJournalRows,
  previewOpening,
  reversalKey,
  reverseBlock,
  templateCsv,
} from "./journal_io";
import { buildJournal, indexAccounts, round2, toRpcArgs } from "./postings";
import { autoMap, toRecords } from "@/lib/import/mapping";
import { parseDelimited } from "@/lib/import/csv";
import { sheetCsv } from "@/lib/export/list_export";

const A = (systemKey, number, name, accountType, subtype, extra = {}) => ({ id: systemKey, systemKey, number, name, accountType, subtype, isTrust: false, status: "Active", ...extra });
const CHART = [
  A("operating_cash", "1000", "Operating Cash", "Asset", "cash"),
  A("trust_cash", "1010", "Trust Cash", "Asset", "cash", { isTrust: true }),
  A("deposit_cash", "1020", "Security Deposit Trust Cash", "Asset", "cash", { isTrust: true }),
  A("accounts_receivable", "1200", "Accounts Receivable", "Asset", "receivable"),
  A("subsidy_receivable", "1220", "Housing Assistance Receivable", "Asset", "subsidy_receivable"),
  A("capital_improvements", "1500", "Capital Improvements", "Asset", "fixed_asset"),
  A("accounts_payable", "2000", "Accounts Payable", "Liability", "payable"),
  A("security_deposits", "2100", "Security Deposits Held", "Liability", "deposits", { isTrust: true }),
  A("deposit_interest_payable", "2110", "Deposit Interest Payable", "Liability", "deposits", { isTrust: true }),
  A("prepaid_rent", "2200", "Prepaid Rent & Tenant Credits", "Liability", "prepaid"),
  A("owner_equity", "3000", "Owner Equity", "Equity", "equity"),
  A("retained_earnings", "3900", "Retained Earnings", "Equity", "equity"),
  A("rent_income", "4000", "Rental Income", "Income", "income"),
  A("other_income", "4100", "Other Income", "Income", "income"),
  A("repairs_maintenance", "5000", "Repairs & Maintenance", "Expense", "expense"),
  A("utilities", "5100", "Utilities", "Expense", "expense"),
  A("old_expense", "5999", "Old Expense", "Expense", "expense", { status: "Inactive" }),
];
const ACCT = indexAccounts(CHART);
const LOOKUPS = {
  properties: [
    { id: "p-maple", name: "Maple Court" },
    { id: "p-oak", name: "Oak Plaza" },
  ],
  units: [
    { id: "u-2b", label: "2B", propertyId: "p-maple" },
    { id: "u-oak-2b", label: "2B", propertyId: "p-oak" },
    { id: "u-3a", label: "3A", propertyId: "p-maple" },
  ],
  owners: [{ id: "o-pat", name: "Pat Owner", email: "pat@example.com" }],
  vendors: [{ id: "v-acme", name: "Acme Plumbing" }],
  leases: [
    { id: "l-jane", name: "2B — Jane Doe", tenantName: "Jane Doe", tenantId: "t-jane", unitId: "u-2b", propertyId: "p-maple", status: "Active" },
    { id: "l-sam", name: "3A — Sam Lee", tenantName: "Sam Lee", tenantId: "t-sam", unitId: "u-3a", propertyId: "p-maple", status: "Active" },
    { id: "l-old", name: "3A — Sam Lee", tenantName: "Sam Lee", tenantId: "t-sam", unitId: "u-3a", propertyId: "p-maple", status: "Ended" },
  ],
};
const records = (csv) => {
  const rows = parseDelimited(csv);
  return toRecords(rows, autoMap(rows[0], JOURNAL_COLUMNS));
};

test("keys follow the registry: jeimp:<importId>:<ref> and jerev:<entryId>:<date>[:n]", () => {
  assert.equal(importKey("imp-1", "JE-7"), "jeimp:imp-1:JE-7");
  assert.equal(reversalKey("e-1", "2026-11-01"), "jerev:e-1:2026-11-01");
  assert.equal(reversalKey("e-1", "2026-11-01", 2), "jerev:e-1:2026-11-01:2");
});

test("cells: dates in ISO, US, named-month and serial form; amounts with $, commas, parentheses; no fractions of a cent", () => {
  assert.equal(dateOf("2026-10-31"), "2026-10-31");
  assert.equal(dateOf("10/31/2026"), "2026-10-31");
  assert.equal(dateOf("31-Oct-2026"), "2026-10-31");
  assert.equal(dateOf("Oct 31, 2026"), "2026-10-31");
  assert.equal(dateOf(46326), "2026-10-31");
  assert.equal(dateOf("46326"), "2026-10-31");
  assert.equal(dateOf("13/45/2026"), "");
  assert.deepEqual(amountOf("$1,200.50"), { value: 1200.5 });
  assert.deepEqual(amountOf("(75.00)"), { value: -75 });
  assert.deepEqual(amountOf(""), { value: 0 });
  assert.match(amountOf("12.345").error, /fractions of a cent/);
  assert.match(amountOf(1.005).error, /fractions of a cent/);
  assert.match(amountOf("abc").error, /couldn't read/);
});

test("parseJournalRows groups by entry_ref, resolves accounts by number and dimensions by name, and balances each entry", () => {
  const csv = [
    "entry_ref,date,memo,account_number,debit,credit,line_memo,property,unit,owner,vendor,lease",
    "JE-1,2026-10-31,October water,5100,420.00,,Water and sewer,Maple Court,,,Acme Plumbing,",
    "JE-1,2026-10-31,October water,1000,,420.00,,Maple Court,,,,",
    "JE-2,10/31/2026,Rent true-up,1200,100,,,,,,,2B — Jane Doe",
    ",,,4000,,100,,,,,,2B — Jane Doe",
  ].join("\n");
  const { entries, errors, summary } = parseJournalRows(records(csv), ACCT, LOOKUPS);
  assert.deepEqual(errors, []);
  assert.deepEqual(summary, { rows: 4, entries: 2, ready: 2, blocked: 0, duplicates: 0, total: 520 });
  const [je1, je2] = entries;
  assert.deepEqual([je1.ref, je1.rows, je1.date, je1.memo, je1.total, je1.propertyId, je1.status], ["JE-1", [2, 3], "2026-10-31", "October water", 420, "p-maple", "ready"]);
  assert.deepEqual(je1.lines.map((l) => [l.glAccountId, l.debit, l.credit, l.memo, l.propertyId, l.vendorId]), [
    ["utilities", 420, 0, "Water and sewer", "p-maple", "v-acme"],
    ["operating_cash", 0, 420, "", "p-maple", ""],
  ]);
  // A blank ref continues the previous entry; the lease brings its tenant, unit and property.
  assert.deepEqual(je2.rows, [4, 5]);
  assert.deepEqual(je2.lines.map((l) => [l.glAccountId, l.leaseId, l.tenantId, l.unitId, l.propertyId]), [
    ["accounts_receivable", "l-jane", "t-jane", "u-2b", "p-maple"],
    ["rent_income", "l-jane", "t-jane", "u-2b", "p-maple"],
  ]);
});

test("an unbalanced group or an unknown account blocks that group and names the row; other groups stay ready", () => {
  const csv = [
    "entry_ref,date,memo,account_number,debit,credit",
    "OK-1,2026-10-01,Fine,5000,50,",
    "OK-1,2026-10-01,Fine,1000,,50",
    "BAD-1,2026-10-02,Off,5000,100,",
    "BAD-1,2026-10-02,Off,1000,,90",
    "BAD-2,2026-10-03,Unknown,9999,10,",
    "BAD-2,2026-10-03,Unknown,1000,,10",
    "BAD-3,2026-10-04,Inactive,5999,10,",
    "BAD-3,2026-10-04,Inactive,1000,,10",
  ].join("\n");
  const { entries, errors, summary } = parseJournalRows(records(csv), ACCT, LOOKUPS);
  assert.deepEqual(entries.map((e) => e.status), ["ready", "blocked", "blocked", "blocked"]);
  assert.deepEqual(summary.ready, 1);
  assert.deepEqual(errors.map((e) => [e.row, e.ref]), [[4, "BAD-1"], [6, "BAD-2"], [8, "BAD-3"]]);
  assert.match(errors[0].message, /Entry BAD-1 \(rows 4–5\) doesn't balance: debits \$100\.00, credits \$90\.00/);
  assert.equal(errors[1].message, 'Unknown account "9999".');
  assert.match(errors[2].message, /inactive/);
});

test("a row dated in a closed period blocks its entry with the lock message (CORE-40)", () => {
  const csv = ["entry_ref,date,memo,account_number,debit,credit", "OLD,2026-03-15,March fix,5000,10,", "OLD,2026-03-15,March fix,1000,,10", "NEW,2026-04-01,April,5000,10,", "NEW,2026-04-01,April,1000,,10"].join("\n");
  const { entries, errors } = parseJournalRows(records(csv), ACCT, LOOKUPS, { lockedThrough: "2026-03-31" });
  assert.deepEqual(entries.map((e) => e.status), ["blocked", "ready"]);
  assert.equal(errors[0].row, 2);
  assert.match(errors[0].message, /dated Mar 15, 2026, in a closed period\. The books are closed through Mar 31, 2026\. Date it Apr 1, 2026 or later/);
});

test("row problems: different dates in one entry, a unit on another property, ambiguous names, debit and credit on one row", () => {
  const csv = [
    "entry_ref,date,memo,account_number,debit,credit,property,unit,lease",
    "X,2026-10-01,M,5000,10,,Oak Plaza,3A,",
    "X,2026-10-02,M,1000,,10,,,",
    "Y,2026-10-01,M,5000,10,,,2B,",
    "Y,2026-10-01,M,1000,5,5,,,",
    "Z,2026-10-01,M,1200,10,,,,3A — Sam Lee",
    "Z,2026-10-01,M,4000,,10,,,3A — Sam Lee",
  ].join("\n");
  const { entries } = parseJournalRows(records(csv), ACCT, LOOKUPS);
  const msgs = (e) => e.errors.map((x) => `${x.row}: ${x.message}`);
  assert.deepEqual(msgs(entries[0]), [`2: Unit "3A" isn't on that property.`, "3: Its date 2026-10-02 differs from the entry's 2026-10-01."]);
  assert.deepEqual(msgs(entries[1]), ['4: Unit "2B" matches 2 records — use its id.', "5: A line is either a debit or a credit, not both."]);
  // Two leases share the name; the one live lease wins.
  assert.equal(entries[2].status, "ready");
  assert.equal(entries[2].lines[0].leaseId, "l-sam");
});

test("without an entry_ref column consecutive rows with one date and memo form an entry; a signed amount column works; zero rows are skipped", () => {
  const rows = [
    ["Date", "Description", "GL Account", "Amount", "Memo"],
    ["2026-10-05", "Mower repair", "5000", "80.00", ""],
    ["2026-10-05", "Mower repair", "1000", "-80.00", ""],
    ["2026-10-05", "Mower repair", "4100", "0", ""],
    ["2026-10-06", "Fee", "1000", "25", ""],
    ["2026-10-06", "Fee", "4100", "(25)", ""],
  ];
  const map = autoMap(rows[0], JOURNAL_COLUMNS);
  assert.deepEqual(map, { date: 0, account_number: 2, amount: 3, memo: 4, line_memo: 1 });
  const { entries, warnings } = parseJournalRows(toRecords(rows, map), ACCT, LOOKUPS);
  assert.deepEqual(entries.map((e) => [e.ref, e.status, e.total, e.memo]), [["Row 2", "ready", 80, "Journal entry"], ["Row 5", "ready", 25, "Journal entry"]]);
  assert.deepEqual(warnings.map((w) => w.row), [4]);
});

test("fingerprints ignore a line memo equal to the entry memo and change with any amount", () => {
  const a = parseJournalRows(records("entry_ref,date,memo,account_number,debit,credit,line_memo\nR,2026-10-01,M,5000,10,,M\nR,2026-10-01,M,1000,,10,"), ACCT, LOOKUPS).entries[0];
  const b = parseJournalRows(records("entry_ref,date,memo,account_number,debit,credit,line_memo\nR,2026-10-01,M,5000,10,,\nR,2026-10-01,M,1000,,10,"), ACCT, LOOKUPS).entries[0];
  const c = parseJournalRows(records("entry_ref,date,memo,account_number,debit,credit\nR,2026-10-01,M,5000,11,\nR,2026-10-01,M,1000,,11"), ACCT, LOOKUPS).entries[0];
  assert.equal(a.fingerprint, b.fingerprint);
  assert.notEqual(a.fingerprint, c.fingerprint);
  assert.equal(entryFingerprint(a), a.fingerprint);
  assert.match(a.fingerprint, /^2026-10-01:1000:[0-9a-f]{28}$/);
});

test("markDuplicates: a ref that is a ledger entry id or a fingerprint on the ledger stops the entry", () => {
  const id = "0b9a6c62-1111-4a3e-9d2f-1234567890ab";
  const parsed = parseJournalRows(records(`entry_ref,date,memo,account_number,debit,credit\n${id},2026-10-01,M,5000,10,\n${id},2026-10-01,M,1000,,10\nN,2026-10-01,M,5000,5,\nN,2026-10-01,M,1000,,5\nK,2026-10-01,M,5000,7,\nK,2026-10-01,M,1000,,7`), ACCT, LOOKUPS).entries;
  const out = markDuplicates(parsed, { entryIds: new Set([id]), fingerprints: new Map([[parsed[1].fingerprint, { entryId: "e-9", sourceFile: "oct.csv", date: "2026-10-01" }]]) });
  assert.deepEqual(out.map((e) => e.status), ["duplicate", "duplicate", "ready"]);
  assert.match(out[1].note, /Already on the ledger from oct\.csv \(Oct 1, 2026\)/);
});

test("journalEntryInput builds a balanced entry tagged with the import; an owner line makes it owner-specific", () => {
  const e = parseJournalRows(records("entry_ref,date,memo,account_number,debit,credit,owner,property\nO-1,2026-10-01,Owner draw,3000,100,,Pat Owner,Maple Court\nO-1,2026-10-01,Owner draw,1010,,100,Pat Owner,Maple Court"), ACCT, LOOKUPS).entries[0];
  const built = buildJournal({ ...journalEntryInput(e, { importId: "imp-1", fileName: "oct.csv" }), idempotencyKey: importKey("imp-1", e.ref) });
  assert.equal(built.error, undefined);
  assert.deepEqual(built.entry.metadata, { importId: "imp-1", sourceFile: "oct.csv", entryRef: "O-1", importFingerprint: e.fingerprint, ownerExplicit: true });
  const args = toRpcArgs(built, { projectId: "proj" });
  assert.deepEqual(args.p_lines.map((l) => [l.gl_account_id, l.debit, l.credit, l.owner_id, l.property_id]), [
    ["owner_equity", 100, 0, "o-pat", "p-maple"],
    ["trust_cash", 0, 100, "o-pat", "p-maple"],
  ]);
  assert.equal(args.p_entry.idempotency_key, "jeimp:imp-1:O-1");
});

test("journalToRows exports in the template's columns and re-imports to identical lines", () => {
  const src = parseJournalRows(records([
    "entry_ref,date,memo,account_number,debit,credit,line_memo,property,unit,owner,vendor,lease",
    "JE-1,2026-10-31,October water,5100,420.00,,Water and sewer,Maple Court,2B,,Acme Plumbing,",
    "JE-1,2026-10-31,October water,1000,,420.00,,Maple Court,,,,",
    "JE-2,2026-10-31,Rent,1200,100,,,,,,,2B — Jane Doe",
    "JE-2,2026-10-31,Rent,4000,,100,,,,,,2B — Jane Doe",
  ].join("\n")), ACCT, LOOKUPS).entries;
  // As posted: ids, line numbers, the entry memo copied onto blank line memos.
  const posted = src.map((e, i) => ({
    id: `e-${i}`,
    date: e.date,
    memo: e.memo,
    sourceType: "adjustment",
    metadata: { entryRef: e.ref },
    lines: e.lines.map((l, n) => ({ ...l, lineNo: n + 1, memo: l.memo || e.memo })),
  }));
  const rows = journalToRows(posted, ACCT, LOOKUPS);
  assert.deepEqual(rows[0], { entry_ref: "JE-1", date: "2026-10-31", memo: "October water", account_number: "5100", debit: 420, credit: null, line_memo: "Water and sewer", property: "Maple Court", unit: "2B", owner: "", vendor: "Acme Plumbing", lease: "" });
  const csv = sheetCsv({ columns: JOURNAL_EXPORT_COLUMNS, rows });
  assert.equal(csv.split("\r\n")[0], "entry_ref,date,memo,account_number,debit,credit,line_memo,property,unit,owner,vendor,lease");
  const again = parseJournalRows(records(csv), ACCT, LOOKUPS).entries;
  const shape = (list) => list.map((e) => [e.ref, e.date, e.memo, e.fingerprint, e.lines.map((l) => [l.glAccountId, l.debit, l.credit, l.memo, l.propertyId, l.unitId, l.leaseId, l.tenantId, l.vendorId])]);
  assert.deepEqual(shape(again), shape(src));
});

test("templateCsv: the journal template parses as two ready entries; the opening template maps every column", () => {
  const parsed = parseJournalRows(records(templateCsv()), indexAccounts([...CHART, A("landscaping", "5150", "Landscaping", "Expense", "expense")]), { ...LOOKUPS, vendors: [{ id: "v-water", name: "City Water" }] });
  assert.deepEqual(parsed.entries.map((e) => [e.ref, e.status]), [["JE-1001", "ready"], ["JE-1002", "ready"]]);
  assert.deepEqual(Object.keys(autoMap(parseDelimited(templateCsv("opening_balances"))[0], JOURNAL_COLUMNS)), ["date", "memo", "account_number", "debit", "credit", "property", "unit", "owner", "vendor", "lease"]);
});

test("reverseBlock: only posted, manual or imported journal entries reverse on a date", () => {
  const je = { id: "e1", status: "posted", sourceType: "adjustment", idempotencyKey: "", metadata: {} };
  assert.equal(reverseBlock(je), "");
  assert.equal(reverseBlock({ ...je, idempotencyKey: "jeimp:x:JE-1" }), "");
  assert.match(reverseBlock({ ...je, status: "void" }), /void/);
  assert.match(reverseBlock({ ...je, reversalOf: "e0" }), /reverses a void/);
  assert.match(reverseBlock({ ...je, metadata: { reverses: "e0" } }), /itself a reversal/);
  assert.match(reverseBlock({ ...je, sourceType: "charge" }), /Only journal entries/);
  assert.match(reverseBlock({ ...je, idempotencyKey: "conv:b:l" }), /void it instead/);
  assert.match(reverseBlock(null), /isn't in this project/);
});

test("buildReversal mirrors every line on the date, keeps dimensions and applies to the original", () => {
  const entry = {
    id: "e1",
    memo: "Accrue utilities",
    propertyId: "p-maple",
    metadata: { ownerExplicit: true },
    lines: [
      { glAccountId: "utilities", debit: 420, credit: 0, memo: "Water", propertyId: "p-maple", ownerId: "o-pat", appliesToEntryId: "", metadata: {} },
      { glAccountId: "accounts_payable", debit: 0, credit: 420, memo: "Accrue utilities", propertyId: "p-maple", vendorId: "v-acme", bankAccountId: "", metadata: {} },
    ],
  };
  const r = buildReversal(entry, { date: "2026-11-01", closedThrough: "" });
  assert.deepEqual(r.entry, { date: "2026-11-01", memo: "Reversal: Accrue utilities", sourceType: "adjustment", metadata: { reverses: "e1", ownerExplicit: true }, propertyId: "p-maple" });
  assert.deepEqual(r.lines.map((l) => [l.glAccountId, l.debit, l.credit, l.memo, l.ownerId, l.vendorId, l.appliesToEntryId]), [
    ["utilities", 0, 420, "Reversal: Water", "o-pat", null, "e1"],
    ["accounts_payable", 420, 0, "Reversal: Accrue utilities", null, "v-acme", "e1"],
  ]);
  assert.equal(buildJournal({ ...r.entry, lines: r.lines }).error, undefined);
  const moved = buildReversal(entry, { date: "2026-04-01", memo: "Undo", closedThrough: "2026-03-31" });
  assert.deepEqual([moved.entry.memo, moved.entry.metadata.closedThrough, moved.lines[0].memo], ["Undo", "2026-03-31", "Undo"]);
});

test("copyDraft prefills the dialog: amounts as text, line memos only where they differ, owner only on owner-specific entries", () => {
  const entry = {
    memo: "Reclass",
    metadata: {},
    sourceType: "adjustment",
    lines: [
      { glAccountId: "repairs_maintenance", debit: 180, credit: 0, memo: "Reclass", propertyId: "p-maple", unitId: "u-2b", ownerId: "o-pat" },
      { glAccountId: "utilities", debit: 0, credit: 180, memo: "Gutter", propertyId: "p-maple" },
    ],
  };
  const d = copyDraft(entry);
  assert.deepEqual(d.memo, "Reclass");
  assert.equal(d.propertyId, "p-maple");
  assert.deepEqual(d.lines.map((l) => [l.glAccountId, l.debit, l.credit, l.memo, l.unitId, l.ownerId]), [
    ["repairs_maintenance", "180", "", "", "u-2b", ""],
    ["utilities", "", "180", "Gutter", "", ""],
  ]);
  assert.equal(copyDraft({ ...entry, metadata: { ownerExplicit: true } }).lines[0].ownerId, "o-pat");
});

const OPENING = (lines) => {
  const rows = parseDelimited(["date,account_number,debit,credit,memo,property,unit,owner,vendor,lease", ...lines].join("\n"));
  return toRecords(rows, autoMap(rows[0], JOURNAL_COLUMNS));
};
const BANKS = [
  { id: "bank-trust", name: "Trust", account_type: "Trust", status: "Active", gl_account_id: "trust_cash" },
  { id: "bank-dep", name: "Deposits", account_type: "Security deposit", status: "Active", gl_account_id: "deposit_cash" },
  { id: "bank-op", name: "Operating", account_type: "Operating", status: "Active", gl_account_id: "operating_cash" },
];
let seq = 0;
const newId = () => `ln-${(seq += 1)}`;

test("opening balances route each row onto INTL-04's lines and net the cash deposits and credits bring in", () => {
  const recs = OPENING([
    "2026-10-31,1000,25000.00,,Operating cash,,,,,",
    "2026-10-31,1010,18500.00,,Pat's funds,Maple Court,,Pat Owner,,",
    "2026-10-31,1010,600.00,,Prepaid held,,,,,",
    "2026-10-31,1020,1500.00,,Deposits held,,,,,",
    "2026-10-15,1200,1200.00,,October rent,,,,,2B — Jane Doe",
    "2026-10-31,2000,,450.00,INV-1042,Maple Court,,,Acme Plumbing,",
    "2026-10-31,2100,,1500.00,,,,,,2B — Jane Doe",
    "2026-10-31,2200,,600.00,,,,,,3A — Sam Lee",
    "2026-10-31,3000,,44250.00,Owner equity,,,,,",
    "2026-10-31,4100,0,,Nothing,,,,,",
  ]);
  const { lines, errors, notes } = openingLinesFromRows(recs, ACCT, LOOKUPS, { asOf: "2026-10-31", banks: BANKS, newId, batchId: "b1" });
  assert.deepEqual(errors, []);
  assert.deepEqual(lines.map((l) => [l.metadata.row, l.kind, l.amount, l.leaseId || l.ownerId || l.vendorId || l.glAccountId]), [
    [2, "gl_balance", 25000, "operating_cash"],
    [3, "owner_balance", 18500, "o-pat"],
    [6, "tenant_balance", 1200, "l-jane"],
    [7, "bill", 450, "v-acme"],
    [8, "deposit", 1500, "l-jane"],
    [9, "tenant_credit", 600, "l-sam"],
    [10, "gl_balance", -44250, "owner_equity"],
  ]);
  assert.equal(lines.find((l) => l.kind === "tenant_balance").itemDate, "2026-10-15");
  assert.deepEqual(notes.map((n) => n.row).sort(), [11, 4, 5].sort());
  assert.match(notes.find((n) => n.row === 5).message, /\$1,500\.00 of this 1020 · Security Deposit Trust Cash balance comes in with the deposits/);
  const p = previewOpening(recs, ACCT, LOOKUPS, { asOf: "2026-10-31", banks: BANKS, newId, batchId: "b1" });
  assert.equal(p.ready, true, JSON.stringify(p.errors));
  assert.equal(p.clearingNet, 0);
  // The opening trial balance equals the file's balances, account by account.
  const tb = new Map();
  for (const e of p.entries) for (const l of e.built.lines) tb.set(l.glAccountId, round2((tb.get(l.glAccountId) || 0) + (l.debit || 0) - (l.credit || 0)));
  assert.deepEqual(Object.fromEntries([...tb].filter(([, v]) => v)), { operating_cash: 25000, trust_cash: 19100, deposit_cash: 1500, accounts_receivable: 1200, accounts_payable: -450, security_deposits: -1500, prepaid_rent: -600, owner_equity: -44250 });
});

test("opening balances refuse 3950 rows, AR without a lease, a debit AP balance and a month that doesn't end; 3950 must net to zero", () => {
  const recs = OPENING([
    "2026-10-31,3950,,100,,,,,,",
    "2026-10-31,1200,50,,,,,,,",
    "2026-10-31,2000,75,,,,,,Acme Plumbing,",
    "2026-10-31,1000,10,,,,,,,",
  ]);
  const p = previewOpening(recs, ACCT, LOOKUPS, { asOf: "2026-10-31", banks: BANKS, newId });
  assert.equal(p.ready, false);
  assert.deepEqual(p.errors.slice(0, 3).map((e) => e.row), [2, 3, 4]);
  assert.match(p.errors[0].message, /Opening Balance Equity \(3950\) is the other side/);
  assert.match(p.errors[1].message, /opens per lease/);
  assert.match(p.errors[2].message, /debit balance on 2000 · Accounts Payable isn't an unpaid bill/);
  const early = previewOpening(OPENING(["2026-10-20,1000,10,,,,,,,", "2026-10-20,3000,,10,,,,,,"]), ACCT, LOOKUPS, { asOf: "2026-10-30", banks: BANKS, newId });
  assert.deepEqual(early.errors.map((e) => [e.row, e.message]), [[null, "Opening balances are as of a month end — 2026-10-31, not 2026-10-30."]]);
  const late = openingLinesFromRows(OPENING(["2026-11-02,1000,10,,,,,,,"]), ACCT, LOOKUPS, { asOf: "2026-10-31", banks: BANKS, newId });
  assert.match(late.errors[0].message, /dated after the as-of date 2026-10-31/);
  const off = previewOpening(OPENING(["2026-10-31,1000,10,,,,,,,"]), ACCT, LOOKUPS, { asOf: "2026-10-31", banks: BANKS, newId });
  assert.equal(off.ready, false);
  assert.match(off.errors.at(-1).message, /Opening Balance Equity \(3950\) is off by/);
});

test("manualJournalInput: the property default fills bare lines, shared dimensions go on the entry, an owner makes it owner-specific", () => {
  const input = manualJournalInput({
    date: "2026-11-08",
    memo: "  ",
    propertyId: "p-oak",
    lines: [
      { glAccountId: "repairs_maintenance", debit: "120", credit: "", memo: " Gutter ", propertyId: "p-maple", unitId: "u-2b" },
      { glAccountId: "operating_cash", debit: "", credit: "120", memo: "" },
      { glAccountId: "utilities", debit: "", credit: "", memo: "empty line" },
    ],
  });
  assert.equal(input.memo, "Journal entry");
  assert.equal(input.propertyId, undefined);
  assert.deepEqual(input.lines.map((l) => [l.glAccountId, l.memo, l.propertyId, l.unitId]), [
    ["repairs_maintenance", "Gutter", "p-maple", "u-2b"],
    ["operating_cash", undefined, "p-oak", null],
  ]);
  assert.equal(buildJournal(input).error, undefined);
  const owned = manualJournalInput({ date: "2026-11-08", lines: [{ glAccountId: "owner_equity", debit: "5", ownerId: "o-pat", propertyId: "p-maple" }, { glAccountId: "trust_cash", credit: "5", ownerId: "o-pat", propertyId: "p-maple" }] });
  assert.deepEqual([owned.propertyId, owned.ownerId, owned.metadata], ["p-maple", "o-pat", { ownerExplicit: true }]);
  assert.deepEqual(toRpcArgs(buildJournal(owned), { projectId: "x" }).p_lines.map((l) => l.owner_id), ["o-pat", "o-pat"]);
});
