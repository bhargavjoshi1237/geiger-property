// Disclosures every public listing page carries (LEAS-01): the Equal Housing Opportunity statement and the published
// screening criteria. RISK-04 replaces the criteria source with its publishedCriteriaText policy (property → company).

// HUD's Equal Housing Opportunity statement (24 CFR Part 109; Part 110, Appendix I).
export const EHO_STATEMENT =
  "We are pledged to the letter and spirit of U.S. policy for the achievement of equal housing opportunity throughout the Nation. We encourage and support an affirmative advertising and marketing program in which there are no barriers to obtaining housing because of race, color, religion, sex, handicap, familial status, or national origin.";

export const ASSISTANCE_ANIMAL_NOTE = "Assistance animals are not pets — no pet fees apply.";

// Same defaults the application screens apply (components/internal/screens/marketing/shared.js).
const DEFAULTS = { incomeMultiple: 3, minCreditScore: 620, countCoApplicantIncome: true, allowCosigner: true, evictionLookbackYears: 7 };

// The company `screening_criteria` setting as plain sentences, in a fixed order.
export function publishedCriteria(stored) {
  const c = { ...DEFAULTS, ...(stored && typeof stored === "object" ? stored : {}) };
  const lines = [];
  const multiple = Number(c.incomeMultiple) || 0;
  if (multiple > 0) {
    lines.push(`Gross monthly income of at least ${multiple}× the monthly rent${c.countCoApplicantIncome ? ", counting the combined income of everyone applying" : ""}.`);
  }
  const score = Number(c.minCreditScore) || 0;
  if (score > 0) lines.push(`A credit score of ${score} or higher.`);
  lines.push(c.allowCosigner ? "A cosigner or guarantor is accepted." : "Cosigners and guarantors aren't accepted.");
  const years = Number(c.evictionLookbackYears) || 0;
  if (years > 0) lines.push(`Rental history: eviction judgments from the past ${years} year${years === 1 ? "" : "s"} are reviewed.`);
  return {
    lines,
    note: "Every application is measured against the same written criteria. If you need a reasonable accommodation to apply, contact us.",
  };
}
