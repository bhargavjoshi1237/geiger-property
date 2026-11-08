import test from "node:test";
import assert from "node:assert/strict";

import { buildGenericCsv } from "./generic_csv";
import { FORMATS } from "./index";
import { buildIif } from "./iif";
import { buildQboCsv } from "./qbo_csv";
import { buildXeroCsv } from "./xero_csv";

const journals = [
  {
    date: "2026-03-05",
    ref: "GP-E1AAAAAA",
    memo: "March rent, unit 2",
    lines: [
      { accountId: "ar", number: "1200", name: "Accounts Receivable", account: "Accounts Receivable", debit: 1000, credit: 0, className: "Harbor House", memo: "" },
      { accountId: "inc", number: "4000", name: "Rental Income", account: "Rental Income", debit: 0, credit: 1000, className: "Harbor House", memo: 'Rent "March"' },
    ],
  },
  {
    date: "2026-03-10",
    ref: "GP-E2BBBBBB",
    memo: "=cmd|fee",
    lines: [
      { accountId: "op", number: "1000", name: "Operating Cash", account: "Operating Cash", debit: 99.5, credit: 0, className: "", memo: "" },
      { accountId: "fee", number: "4500", name: "Fee Income", account: "Fee Income", debit: 0, credit: 99.5, className: "", memo: "" },
    ],
  },
];

test("QuickBooks Online CSV golden file", () => {
  assert.equal(
    buildQboCsv(journals),
    [
      "﻿*JournalNo,*JournalDate,*AccountName,Debits,Credits,Description,Name,Currency,Location,Class",
      'GP-E1AAAAAA,03/05/2026,Accounts Receivable,1000.00,,"March rent, unit 2",,,,Harbor House',
      'GP-E1AAAAAA,03/05/2026,Rental Income,,1000.00,"Rent ""March""",,,,Harbor House',
      "GP-E2BBBBBB,03/10/2026,Operating Cash,99.50,,'=cmd|fee,,,,",
      "GP-E2BBBBBB,03/10/2026,Fee Income,,99.50,'=cmd|fee,,,,",
      "",
    ].join("\r\n"),
  );
});

test("Xero CSV golden file: debits positive, credits negative, same narration per journal", () => {
  assert.equal(
    buildXeroCsv(journals),
    [
      "﻿*Narration,*Date,Description,*AccountCode,TaxRate,*Amount,TrackingName1,TrackingOption1",
      '"GP-E1AAAAAA March rent, unit 2",05/03/2026,"March rent, unit 2",Accounts Receivable,,1000.00,Property,Harbor House',
      '"GP-E1AAAAAA March rent, unit 2",05/03/2026,"Rent ""March""",Rental Income,,-1000.00,Property,Harbor House',
      "GP-E2BBBBBB =cmd|fee,10/03/2026,'=cmd|fee,Operating Cash,,99.50,,",
      "GP-E2BBBBBB =cmd|fee,10/03/2026,'=cmd|fee,Fee Income,,-99.50,,",
      "",
    ].join("\r\n"),
  );
});

test("IIF golden file: tab-delimited TRNS/SPL/ENDTRNS general journals that sum to zero", () => {
  const out = buildIif(journals);
  assert.equal(
    out,
    [
      "!TRNS\tTRNSID\tTRNSTYPE\tDATE\tACCNT\tNAME\tCLASS\tAMOUNT\tDOCNUM\tMEMO",
      "!SPL\tSPLID\tTRNSTYPE\tDATE\tACCNT\tNAME\tCLASS\tAMOUNT\tDOCNUM\tMEMO",
      "!ENDTRNS",
      "TRNS\t\tGENERAL JOURNAL\t03/05/2026\tAccounts Receivable\t\tHarbor House\t1000.00\tGP-E1AAAAAA\tMarch rent, unit 2",
      'SPL\t\tGENERAL JOURNAL\t03/05/2026\tRental Income\t\tHarbor House\t-1000.00\tGP-E1AAAAAA\tRent "March"',
      "ENDTRNS",
      "TRNS\t\tGENERAL JOURNAL\t03/10/2026\tOperating Cash\t\t\t99.50\tGP-E2BBBBBB\t=cmd|fee",
      "SPL\t\tGENERAL JOURNAL\t03/10/2026\tFee Income\t\t\t-99.50\tGP-E2BBBBBB\t=cmd|fee",
      "ENDTRNS",
      "",
    ].join("\r\n"),
  );
  assert.ok(!out.startsWith("﻿"));
});

test("IIF text fields cannot break the tab layout", () => {
  const j = [{ date: "2026-01-01", ref: "R", memo: "a\tb\nc", lines: [{ account: "X\tY", debit: 1, credit: 0, className: "", memo: "" }, { account: "Z", debit: 0, credit: 1, className: "", memo: "" }] }];
  for (const row of buildIif(j).split("\r\n").filter((r) => r.startsWith("TRNS") || r.startsWith("SPL"))) assert.equal(row.split("\t").length, 10);
});

test("generic CSV golden file", () => {
  assert.equal(
    buildGenericCsv(journals),
    [
      "﻿Date,Reference,Memo,Account Number,Account Name,Mapped Account,Debit,Credit,Class",
      '2026-03-05,GP-E1AAAAAA,"March rent, unit 2",1200,Accounts Receivable,Accounts Receivable,1000.00,,Harbor House',
      '2026-03-05,GP-E1AAAAAA,"Rent ""March""",4000,Rental Income,Rental Income,,1000.00,Harbor House',
      "2026-03-10,GP-E2BBBBBB,'=cmd|fee,1000,Operating Cash,Operating Cash,99.50,,",
      "2026-03-10,GP-E2BBBBBB,'=cmd|fee,4500,Fee Income,Fee Income,,99.50,",
      "",
    ].join("\r\n"),
  );
});

test("date style option and per-format defaults", () => {
  assert.match(buildQboCsv(journals, { dateFormat: "dmy" }), /05\/03\/2026/);
  assert.match(buildXeroCsv(journals, { dateFormat: "ymd" }), /2026-03-05/);
  assert.equal(FORMATS.xero_csv.defaultName({ number: "4000", name: "Rent" }), "4000");
  assert.equal(FORMATS.qbo_csv.defaultName({ number: "4000", name: "Rent" }), "4000 Rent");
});
