import { describeScreeningCriteria, screeningCriteriaValues } from "@/lib/screening/criteria_policy";
import { publicCriteriaLimits } from "@/lib/screening/rules_enforcement";

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

// Criteria rows a location rule replaces (RISK-05): the history it bars or defers, said plainly instead of the landlord's setting.
const LIMITED_ROWS = {
  criminal: { keys: ["criminalPolicy", "criminalLookbackYears"], label: "Criminal history" },
  eviction: { keys: ["evictionLookbackYears", "evictionJudgmentsOnly"], label: "Eviction history" },
};
const LIMIT_TEXT = {
  not_considered: "Not considered at this property",
  after_offer: "Reviewed only once the rest of the application qualifies, with an individualized assessment",
};

function withRuleLimits(rows, merged) {
  if (!merged) return rows;
  const limits = publicCriteriaLimits(merged);
  let out = rows;
  for (const [topic, { keys, label }] of Object.entries(LIMITED_ROWS)) {
    if (!limits[topic]) continue;
    const at = out.findIndex((r) => keys.includes(r.key));
    out = out.filter((r) => !keys.includes(r.key));
    out.splice(at < 0 ? out.length : at, 0, { key: keys[0], label, value: LIMIT_TEXT[limits[topic]] });
  }
  return out;
}

// Resolved criteria → { text, rows: [{ key, label, value }], note }: the landlord's written criteria plus the public rows;
// `merged` screening rules (RISK-05) restate a history the location bars or defers.
export function publicCriteria(resolved, merged = null) {
  const values = screeningCriteriaValues(resolved);
  return {
    text: typeof values.publishedCriteriaText === "string" ? values.publishedCriteriaText.trim() : "",
    rows: withRuleLimits(
      describeScreeningCriteria(resolved)
        .filter((r) => PUBLIC_CRITERIA_KEYS.has(r.key))
        .map(({ key, label, value }) => ({ key, label, value })),
      merged,
    ),
    note: "Every application is measured against the same written criteria. If you need a reasonable accommodation to apply, contact us.",
  };
}
