// Screening permission keys (RISK-03, geiger-rbac.config.js "Screening controls") for UI gates; routes declare them as literals.
// view_reports is sensitive: only Owner's `*` holds it by default, and role sync never adds it.
export const SCREENING_PERMISSIONS = Object.freeze({
  order: "property.screening.order",
  viewReports: "property.screening.view_reports",
  decide: "property.screening.decide",
  adverseAction: "property.screening.adverse_action",
  fraudReview: "property.screening.fraud_review",
  criteria: "property.screening.criteria",
});

// Application metadata the database gate (applications_screening_gate) ties to screening.order / screening.decide.
export const SCREENING_META_KEYS = Object.freeze(["screening", "screeningRequestedAt", "screeningConsent", "screeningConsentOn", "screeningVendor", "screeningReference"]);
export const DECISION_META_KEYS = Object.freeze(["decidedOn", "decidedBy", "decisionNotes", "decisionConditions", "adverseAction"]);
