import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { permissionKeys } from "@geiger/rbac";

import rbacConfig, { parentKeyOf } from "@/geiger-rbac.config";
import { POLICY_DEFAULTS, policiesFor } from "@/lib/policies";
import {
  SCREENING_GATED_KEYS,
  SCREENING_POLICY_KEYS,
  canonicalCriteria,
  criteriaHash,
  describeScreeningCriteria,
  formatCriterion,
  incomeRatio,
  legacyScreeningPolicies,
  qualifyingRent,
  resolveScreeningCriteria,
  screeningCriteriaValues,
} from "./criteria_policy";

const prop = (id, overrides = {}) => ({ id, metadata: { policyOverrides: overrides } });

test("criteria: every screening key is a company/property policy with a default", () => {
  assert.ok(SCREENING_POLICY_KEYS.length >= 17);
  const companyKeys = policiesFor("company", "screening").map((p) => p.key);
  assert.deepEqual(companyKeys, SCREENING_POLICY_KEYS);
  assert.deepEqual(policiesFor("property", "screening").map((p) => p.key), SCREENING_POLICY_KEYS);
  assert.equal(policiesFor("lease", "screening").length, 0, "leases never override screening");
  for (const k of SCREENING_POLICY_KEYS) assert.ok(k in POLICY_DEFAULTS, k);
  assert.equal(POLICY_DEFAULTS.incomeMultiple, 3);
  assert.equal(POLICY_DEFAULTS.screeningPackage, "manual");
  assert.equal(POLICY_DEFAULTS.minCreditScore, "", "blank: no minimum");
  assert.equal(POLICY_DEFAULTS.evictionLookbackYears, 7);
  assert.equal(POLICY_DEFAULTS.evictionJudgmentsOnly, true);
});

test("criteria: defaults resolve as company values with no settings at all", () => {
  const r = resolveScreeningCriteria();
  assert.deepEqual(r.incomeMultiple, { value: 3, source: "company" });
  assert.deepEqual(r.conditionalOptions, { value: ["extra_deposit", "guarantor"], source: "company" });
  assert.equal(Object.keys(r).length, SCREENING_POLICY_KEYS.length);
});

test("criteria: the old screening_criteria setting shows up as company values", () => {
  const legacy = { incomeMultiple: 2.5, minCreditScore: 640, countCoApplicantIncome: false, allowCosigner: false, evictionLookbackYears: 5, criteriaNotes: "Written criteria" };
  const r = resolveScreeningCriteria({ company: {}, legacy });
  assert.deepEqual(r.incomeMultiple, { value: 2.5, source: "company" });
  assert.deepEqual(r.minCreditScore, { value: 640, source: "company" });
  assert.deepEqual(r.countCoApplicantIncome, { value: false, source: "company" });
  assert.deepEqual(r.allowGuarantorToQualify, { value: false, source: "company" });
  assert.deepEqual(r.evictionLookbackYears, { value: 5, source: "company" });
  assert.deepEqual(r.publishedCriteriaText, { value: "Written criteria", source: "company" });
  // The old dialog saved a blank minimum as 0.
  assert.equal(legacyScreeningPolicies({ minCreditScore: 0 }).minCreditScore, "");
  // A key saved in fees_policies wins over the old setting; a property override wins over both.
  const both = resolveScreeningCriteria({ company: { incomeMultiple: 2.8 }, legacy, property: prop("p1", { incomeMultiple: 2 }) });
  assert.deepEqual(both.incomeMultiple, { value: 2, source: "property" });
  assert.equal(resolveScreeningCriteria({ company: { incomeMultiple: 2.8 }, legacy }).incomeMultiple.value, 2.8);
});

test("criteria: a property override changes that property only", () => {
  const company = { incomeMultiple: 3 };
  const p1 = resolveScreeningCriteria({ company, property: prop("p1", { incomeMultiple: "2.5" }) });
  const p2 = resolveScreeningCriteria({ company, property: prop("p2", { graceDays: 3 }) });
  assert.deepEqual(p1.incomeMultiple, { value: 2.5, source: "property" }, "typed values are normalized");
  assert.deepEqual(p2.incomeMultiple, { value: 3, source: "company" });
  assert.equal(p1.minCreditScore.source, "company");
});

test("criteriaHash: stable for the same criteria, different when any value changes", async () => {
  const base = resolveScreeningCriteria({ company: { incomeMultiple: 3, minCreditScore: 600 } });
  const h = await criteriaHash(base);
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.equal(h, createHash("sha256").update(canonicalCriteria(base)).digest("hex"), "SHA-256 of the canonical JSON");
  // Same criteria in another shape: flat values, shuffled keys, numbers as text, list order, extra keys, other sources.
  const flat = screeningCriteriaValues(base);
  const shuffled = Object.fromEntries(Object.entries(flat).reverse());
  assert.equal(await criteriaHash(flat), h);
  assert.equal(await criteriaHash({ ...shuffled, incomeMultiple: "3", conditionalOptions: ["guarantor", "extra_deposit"], graceDays: 9 }), h);
  const sameValueOnProperty = resolveScreeningCriteria({ company: { minCreditScore: 600 }, property: prop("p", { incomeMultiple: 3 }) });
  assert.equal(await criteriaHash(sameValueOnProperty), h, "the hash covers values, not where they come from");
  // Any single change moves the hash.
  const changed = {
    screeningPackage: "vendor_basic",
    screeningPayer: "company",
    incomeMultiple: 2.5,
    countCoApplicantIncome: false,
    allowGuarantorToQualify: false,
    guarantorIncomeMultiple: 4,
    voucherIncomeBasis: "full_rent",
    minCreditScore: 601,
    noScorePolicy: "deny",
    evictionLookbackYears: 6,
    evictionJudgmentsOnly: false,
    criminalPolicy: "none",
    criminalLookbackYears: 3,
    requireIdVerification: true,
    requireIncomeVerification: false,
    conditionalOptions: ["extra_deposit"],
    publishedCriteriaText: "Updated",
  };
  assert.deepEqual(Object.keys(changed).sort(), [...SCREENING_POLICY_KEYS].sort(), "every key is exercised");
  const seen = new Set([h]);
  for (const [k, v] of Object.entries(changed)) {
    const next = await criteriaHash({ ...flat, [k]: v });
    assert.ok(!seen.has(next), `changing ${k} changes the hash`);
    seen.add(next);
  }
});

test("qualifyingRent: voucher holders are tested on their share unless the basis is full rent", () => {
  const voucher = (amount) => ({ metadata: { voucher: true, voucherAmount: amount } });
  // RISK-06's example: $600 share of $2,000 rent.
  assert.deepEqual(qualifyingRent(2000, voucher(1400), { voucherIncomeBasis: "tenant_portion" }), { rent: 600, fullRent: 2000, voucher: 1400, tenantPortion: true });
  // HOUS-12's example: rent 1,500, voucher 1,100 → 400.
  assert.equal(qualifyingRent(1500, voucher(1100), resolveScreeningCriteria()).rent, 400, "the default basis is the tenant's share");
  assert.equal(qualifyingRent(1500, voucher(1100), { voucherIncomeBasis: "full_rent" }).rent, 1500);
  assert.equal(qualifyingRent(1500, { metadata: { voucher: false, voucherAmount: 1100 } }, {}).rent, 1500, "voucher switched off");
  assert.equal(qualifyingRent(1000, voucher(1200), {}).rent, 0, "a voucher never exceeds the rent");
});

test("incomeRatio: the property's multiple sets the badge; overrides, vouchers and guarantors", () => {
  const company = { incomeMultiple: 3 };
  const app = { metadata: {} };
  const at = (property) => resolveScreeningCriteria({ company, property });
  // 2.7× rent: below the company 3×, meets a property's 2.5×.
  const below = incomeRatio({ rent: 2000, income: { total: 5400 }, application: app, criteria: at(prop("p2")) });
  const meets = incomeRatio({ rent: 2000, income: { total: 5400 }, application: app, criteria: at(prop("p1", { incomeMultiple: 2.5 })) });
  assert.deepEqual([below.threshold, below.pass], [3, false]);
  assert.deepEqual([meets.threshold, meets.pass], [2.5, true]);
  assert.equal(incomeRatio({ rent: 2000, income: { total: 5400 }, application: { metadata: { incomeMultipleOverride: 2.7 } }, criteria: at(null) }).pass, true, "the application's own override wins");
  // RISK-06's voucher example: $1,900 income passes 3× on a $600 share of $2,000.
  const voucher = { metadata: { voucher: true, voucherAmount: 1400 } };
  assert.equal(incomeRatio({ rent: 2000, income: { total: 1900 }, application: voucher, criteria: at(null) }).pass, true);
  assert.equal(incomeRatio({ rent: 2000, income: { total: 1900 }, application: voucher, criteria: { ...screeningCriteriaValues(at(null)), voucherIncomeBasis: "full_rent" } }).pass, false);
  assert.equal(incomeRatio({ rent: 1000, income: { total: 0 }, application: { metadata: { voucher: true, voucherAmount: 1000 } }, criteria: at(null) }).covered, true);
  // A guarantor at the guarantor multiple qualifies an applicant below it, only where the criteria allow it.
  const g = incomeRatio({ rent: 2000, income: { total: 4000, guarantor: 8000 }, application: app, criteria: { incomeMultiple: 3, allowGuarantorToQualify: true, guarantorIncomeMultiple: 4 } });
  assert.deepEqual([g.pass, g.viaGuarantor], [true, true]);
  assert.equal(incomeRatio({ rent: 2000, income: { total: 4000, guarantor: 8000 }, application: app, criteria: { incomeMultiple: 3, allowGuarantorToQualify: false } }).pass, false);
  assert.equal(incomeRatio({ rent: 0, income: { total: 4000 }, application: app, criteria: {} }).pass, false, "no rent linked");
});

test("describe: display rows carry their source and hide follow-ups that don't apply", () => {
  const r = resolveScreeningCriteria({ company: { allowGuarantorToQualify: false, criminalPolicy: "none" }, property: prop("p", { minCreditScore: 650 }) });
  const rows = describeScreeningCriteria(r);
  const by = Object.fromEntries(rows.map((x) => [x.key, x]));
  assert.equal(by.minCreditScore.value, "650");
  assert.equal(by.minCreditScore.source, "property");
  assert.equal(by.incomeMultiple.value, "3× rent");
  assert.equal(by.incomeMultiple.source, "company");
  assert.ok(!("guarantorIncomeMultiple" in by) && !("criminalLookbackYears" in by) && !("publishedCriteriaText" in by));
  assert.equal(formatCriterion("minCreditScore", ""), "No minimum");
  assert.equal(formatCriterion("evictionLookbackYears", 1), "1 year");
  assert.equal(formatCriterion("evictionJudgmentsOnly", true), "Judgments only");
  assert.equal(formatCriterion("voucherIncomeBasis", "tenant_portion"), "Tenant's share of rent");
  assert.equal(formatCriterion("conditionalOptions", []), "None");
});

test("permissions: screening.criteria follows settings.manage; the leasing agent doesn't hold it", () => {
  const key = "property.screening.criteria";
  assert.ok(permissionKeys(rbacConfig).includes(key));
  assert.equal(parentKeyOf(key), "property.settings.manage");
  const role = (k) => rbacConfig.systemRoles.find((r) => r.key === k).permissions;
  assert.ok(role("manager").includes(key));
  assert.ok(role("admin").includes(key));
  assert.ok(!role("leasing_agent").includes(key));
});

// The newest @up definition of property.screening_criteria_keys() lists exactly SCREENING_GATED_KEYS.
test("database gate: property.screening_criteria_keys() matches the screening policy keys", () => {
  const dir = path.resolve("supabase/migrations");
  let body = null;
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
    const sql = readFileSync(path.join(dir, f), "utf8");
    const up = sql.includes("-- @up") ? sql.split("-- @up")[1].split("-- @down")[0] : sql;
    const at = up.lastIndexOf("create or replace function property.screening_criteria_keys()");
    if (at >= 0) body = up.slice(at, up.indexOf("$$;", up.indexOf("$$", at) + 2));
  }
  assert.ok(body, "a migration defines property.screening_criteria_keys()");
  const listed = [...body.matchAll(/'([A-Za-z]+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(listed, SCREENING_GATED_KEYS);
});
