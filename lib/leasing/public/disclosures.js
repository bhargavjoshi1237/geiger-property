import { describeScreeningCriteria, screeningCriteriaValues } from "@/lib/screening/criteria_policy";

// Disclosures every public listing page carries (LEAS-01): the Equal Housing Opportunity statement and the published
// screening criteria in force at the listing's property (RISK-04's policy cascade: property → company).

// HUD's Equal Housing Opportunity statement (24 CFR Part 109; Part 110, Appendix I).
export const EHO_STATEMENT =
  "We are pledged to the letter and spirit of U.S. policy for the achievement of equal housing opportunity throughout the Nation. We encourage and support an affirmative advertising and marketing program in which there are no barriers to obtaining housing because of race, color, religion, sex, handicap, familial status, or national origin.";

export const ASSISTANCE_ANIMAL_NOTE = "Assistance animals are not pets — no pet fees apply.";

// Criteria an applicant is measured against; ordering details (package, payer) and the conditions staff may offer stay internal.
export const PUBLIC_CRITERIA_KEYS = new Set([
  "incomeMultiple",
  "countCoApplicantIncome",
  "allowGuarantorToQualify",
  "guarantorIncomeMultiple",
  "voucherIncomeBasis",
  "minCreditScore",
  "noScorePolicy",
  "evictionLookbackYears",
  "evictionJudgmentsOnly",
  "criminalPolicy",
  "criminalLookbackYears",
  "requireIdVerification",
  "requireIncomeVerification",
]);

// Resolved criteria → { text, rows: [{ key, label, value }], note }: the landlord's written criteria plus the public rows.
export function publicCriteria(resolved) {
  const values = screeningCriteriaValues(resolved);
  return {
    text: typeof values.publishedCriteriaText === "string" ? values.publishedCriteriaText.trim() : "",
    rows: describeScreeningCriteria(resolved)
      .filter((r) => PUBLIC_CRITERIA_KEYS.has(r.key))
      .map(({ key, label, value }) => ({ key, label, value })),
    note: "Every application is measured against the same written criteria. If you need a reasonable accommodation to apply, contact us.",
  };
}
