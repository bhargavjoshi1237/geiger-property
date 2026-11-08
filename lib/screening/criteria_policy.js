import { POLICIES, resolvePolicies } from "@/lib/policies";
import { rentSplit } from "@/lib/housing/hap";

// Screening criteria per property (RISK-04): the policy cascade's `screening` group, the old `screening_criteria` setting as a
// company fallback, display rows and a stable hash for decision records. Pure; safe in the browser and on the server.

export const SCREENING_POLICIES = POLICIES.filter((p) => p.group === "screening");
export const SCREENING_POLICY_KEYS = SCREENING_POLICIES.map((p) => p.key);
const BY_KEY = new Map(SCREENING_POLICIES.map((p) => [p.key, p]));

// Old `screening_criteria` keys (the Applications header dialog) → policy keys.
export const LEGACY_SCREENING_KEYS = Object.freeze({
  incomeMultiple: "incomeMultiple",
  minCreditScore: "minCreditScore",
  countCoApplicantIncome: "countCoApplicantIncome",
  allowCosigner: "allowGuarantorToQualify",
  evictionLookbackYears: "evictionLookbackYears",
  criteriaNotes: "publishedCriteriaText",
});

// Keys the database gate watches (property.screening_criteria_keys()): the policy keys plus the old setting's.
export const SCREENING_GATED_KEYS = [...new Set([...SCREENING_POLICY_KEYS, ...Object.keys(LEGACY_SCREENING_KEYS)])].sort();

const NUMERIC = new Set(["number", "currency", "percent"]);

// A value in its policy's shape: numbers (blank stays ""), booleans, sorted unique lists, strings.
export function normalizeCriterion(key, value) {
  const p = BY_KEY.get(key);
  if (!p) return value;
  if (NUMERIC.has(p.type)) {
    if (value === "" || value === null || value === undefined) return "";
    const n = Number(value);
    return Number.isFinite(n) ? n : "";
  }
  if (p.type === "switch") return value === true || value === "true";
  if (p.type === "multiselect") return [...new Set((Array.isArray(value) ? value : []).map(String))].sort();
  return value === null || value === undefined ? "" : String(value);
}

// The old setting as policy values; its dialog saved a blank minimum credit score as 0.
export function legacyScreeningPolicies(legacy) {
  const out = {};
  if (!legacy || typeof legacy !== "object") return out;
  for (const [from, to] of Object.entries(LEGACY_SCREENING_KEYS)) {
    const v = legacy[from];
    if (v === undefined || v === null) continue;
    out[to] = from === "minCreditScore" && Number(v) === 0 ? "" : v;
  }
  return out;
}

// Company layer with the old setting under it: keys saved in fees_policies win, the old setting fills the rest.
export function withLegacyScreening(company, legacy) {
  return { ...legacyScreeningPolicies(legacy), ...(company && typeof company === "object" ? company : {}) };
}

// { key: { value, source: "company" | "property" } } for every screening key at a property (none: company only).
export function resolveScreeningCriteria({ company, property = null, legacy } = {}) {
  const all = resolvePolicies({ company: withLegacyScreening(company, legacy), property: property || null });
  return Object.fromEntries(SCREENING_POLICY_KEYS.map((k) => [k, { value: normalizeCriterion(k, all[k].value), source: all[k].source }]));
}

const isResolvedEntry = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v) && "source" in v && "value" in v;

// Flat { key: value } from resolved criteria (flat values pass through).
export const screeningCriteriaValues = (criteria) =>
  Object.fromEntries(Object.entries(criteria || {}).map(([k, v]) => [k, isResolvedEntry(v) ? v.value : v]));

// Sorted, normalized JSON of the screening keys (resolved or flat; other keys ignored, missing ones null).
export function canonicalCriteria(criteria) {
  const flat = screeningCriteriaValues(criteria);
  const keys = [...SCREENING_POLICY_KEYS].sort();
  return JSON.stringify(Object.fromEntries(keys.map((k) => [k, k in flat ? normalizeCriterion(k, flat[k]) : null])));
}

// SHA-256 hex of canonicalCriteria (Web Crypto, in browsers and Node): the version a decision records.
export async function criteriaHash(criteria) {
  const bytes = new TextEncoder().encode(canonicalCriteria(criteria));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

// The rent an income test measures (HOUS-01's split): a voucher holder's share under "tenant_portion", else the full rent.
export function qualifyingRent(rent, application, criteria) {
  const m = application?.metadata || {};
  const split = rentSplit({ rent, metadata: { subsidized: m.voucher ?? application?.voucher, hapAmount: m.voucherAmount ?? application?.voucherAmount } });
  const tenantPortion = screeningCriteriaValues(criteria).voucherIncomeBasis !== "full_rent" && split.hap > 0;
  return { rent: tenantPortion ? split.tenant : split.total, fullRent: split.total, voucher: split.hap, tenantPortion };
}

// Income-to-rent under the criteria (the ratio badge): an application's own multiple override wins; a guarantor meeting
// the guarantor multiple qualifies an applicant below it. income = { total, guarantor? } per month.
export function incomeRatio({ rent, income, application, criteria }) {
  const c = screeningCriteriaValues(criteria);
  const threshold = Number(application?.metadata?.incomeMultipleOverride) || Number(c.incomeMultiple) || 3;
  const basis = qualifyingRent(Number(rent) || 0, application, c);
  const tested = basis.rent;
  const covered = basis.fullRent > 0 && tested === 0;
  const ratio = tested ? (Number(income?.total) || 0) / tested : 0;
  const guarantorMultiple = Number(c.guarantorIncomeMultiple) || threshold;
  const viaGuarantor = Boolean(c.allowGuarantorToQualify) && tested > 0 && ratio < threshold && (Number(income?.guarantor) || 0) >= guarantorMultiple * tested;
  const pass = covered || (tested > 0 && (ratio >= threshold || viaGuarantor));
  return { ratio, threshold, pass, required: tested * threshold, rent: tested, basis, covered, viaGuarantor, guarantorMultiple };
}

// --- Display ------------------------------------------------------------------------------

const SUMMARY_LABEL = {
  screeningPackage: "Package",
  screeningPayer: "Paid by",
  incomeMultiple: "Income multiple",
  countCoApplicantIncome: "Co-applicant income",
  allowGuarantorToQualify: "Guarantors can qualify",
  guarantorIncomeMultiple: "Guarantor multiple",
  voucherIncomeBasis: "Voucher holders tested on",
  minCreditScore: "Minimum credit score",
  noScorePolicy: "No credit score",
  evictionLookbackYears: "Eviction look-back",
  evictionJudgmentsOnly: "Evictions counted",
  criminalPolicy: "Criminal history",
  criminalLookbackYears: "Criminal look-back",
  requireIdVerification: "ID verification",
  requireIncomeVerification: "Income verification",
  conditionalOptions: "Conditions offered",
  publishedCriteriaText: "Published criteria",
};

const SWITCH_TEXT = {
  countCoApplicantIncome: ["Counted", "Not counted"],
  evictionJudgmentsOnly: ["Judgments only", "Filings and judgments"],
  requireIdVerification: ["Required", "Not required"],
  requireIncomeVerification: ["Required", "Not required"],
};

const BLANK_TEXT = {
  incomeMultiple: "No minimum",
  guarantorIncomeMultiple: "Same as the income multiple",
  minCreditScore: "No minimum",
  evictionLookbackYears: "No limit",
  criminalLookbackYears: "No limit",
  publishedCriteriaText: "Not written yet",
};

const MULTIPLE = new Set(["incomeMultiple", "guarantorIncomeMultiple"]);
const YEARS = new Set(["evictionLookbackYears", "criminalLookbackYears"]);
const optionLabel = (p, v) => p.options?.find((o) => o.value === v)?.label || v;

// One criterion as display text ("3× rent", "7 years", "No minimum").
export function formatCriterion(key, value) {
  const p = BY_KEY.get(key);
  const v = normalizeCriterion(key, value);
  if (!p) return String(value ?? "");
  if (p.type === "switch") return (SWITCH_TEXT[key] || ["Yes", "No"])[v ? 0 : 1];
  if (p.type === "multiselect") return v.length ? v.map((x) => optionLabel(p, x)).join(", ") : "None";
  if (v === "" || (v === 0 && MULTIPLE.has(key))) return BLANK_TEXT[key] || "—";
  if (MULTIPLE.has(key)) return `${v}× rent`;
  if (YEARS.has(key)) return `${v} ${v === 1 ? "year" : "years"}`;
  if (p.type === "select") return optionLabel(p, v);
  return String(v);
}

// Display rows for the criteria in force — [{ key, label, value, source }] — skipping hidden follow-ups and the published text.
export function describeScreeningCriteria(criteria) {
  const values = screeningCriteriaValues(criteria);
  return SCREENING_POLICIES.filter((p) => p.key !== "publishedCriteriaText" && (!p.showIf || p.showIf(values))).map((p) => ({
    key: p.key,
    label: SUMMARY_LABEL[p.key] || p.label,
    value: formatCriterion(p.key, values[p.key]),
    source: isResolvedEntry(criteria?.[p.key]) ? criteria[p.key].source : null,
  }));
}
