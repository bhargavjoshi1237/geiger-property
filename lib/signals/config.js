// Signal thresholds, weights and defaults (isomorphic). Stored in the settings key `signal_settings`
// and edited in Automation Settings → Signal thresholds. Score = impact × urgency weight × category
// weight; signals with no money attached use the nominal value so they still rank.

export const SIGNAL_SETTINGS_KEY = "signal_settings";

export const SIGNAL_DEFAULTS = {
  delinquencyGraceDays: 5,
  minDelinquentBalance: 25,
  collectionDropPoints: 5,
  renewalNoReplyDays: 14,
  renewalAtRiskDays: 60,
  expiringNoOfferDays: 90,
  belowMarketPct: 5,
  vacantDays: 30,
  urgentUnassignedHours: 4,
  repeatRepairCount: 3,
  repeatRepairDays: 90,
  complianceWindowDays: 30,
  billApprovalWaitDays: 3,
  depositDueDays: 7,
  unreconciledDays: 35,
  budgetVariancePct: 10,
  applicationPendingHours: 48,
  automationFailures: 3,
  automationWindowDays: 7,
  upcomingMoveDays: 30,
  turnoverMonths: 2,
  expireAfterDays: 14,
  nominal: 250,
  urgencyWeights: { urgent: 3, soon: 2, routine: 1 },
  categoryWeights: { risk: 1.5, trend: 1.2, watch: 1, opportunity: 0.8 },
  disabled: [],
};

// Editable thresholds shown in settings ({ key, label, hint, suffix }).
export const SIGNAL_THRESHOLD_FIELDS = [
  { key: "delinquencyGraceDays", label: "Rent counts as late after", suffix: "days", group: "Collections" },
  { key: "minDelinquentBalance", label: "Ignore balances under", prefix: "$", group: "Collections" },
  { key: "collectionDropPoints", label: "Collection-rate drop that signals", suffix: "points", group: "Collections" },
  { key: "renewalNoReplyDays", label: "Renewal offer with no reply after", suffix: "days", group: "Leasing" },
  { key: "expiringNoOfferDays", label: "Flag leases ending within, with no offer", suffix: "days", group: "Leasing" },
  { key: "belowMarketPct", label: "Below-market rent gap", suffix: "%", group: "Leasing" },
  { key: "vacantDays", label: "Vacant unit alert after", suffix: "days", group: "Leasing" },
  { key: "applicationPendingHours", label: "Application waiting longer than", suffix: "hours", group: "Leasing" },
  { key: "urgentUnassignedHours", label: "Urgent work order unassigned for", suffix: "hours", group: "Maintenance" },
  { key: "repeatRepairCount", label: "Repeat repairs: this many in a unit and category", suffix: "jobs", group: "Maintenance" },
  { key: "complianceWindowDays", label: "Vendor COI / licence expiring within", suffix: "days", group: "Compliance" },
  { key: "billApprovalWaitDays", label: "Bill waiting for approval longer than", suffix: "days", group: "Accounting" },
  { key: "depositDueDays", label: "Deposit return deadline within", suffix: "days", group: "Accounting" },
  { key: "unreconciledDays", label: "Bank account unreconciled for", suffix: "days", group: "Accounting" },
  { key: "budgetVariancePct", label: "Expense budget overrun above", suffix: "%", group: "Accounting" },
  { key: "automationFailures", label: "Workflow failing this many times in 7 days", suffix: "runs", group: "Automation" },
  { key: "nominal", label: "Value of a signal with no money attached", prefix: "$", group: "Scoring" },
  { key: "turnoverMonths", label: "A lost renewal costs", suffix: "months of rent", group: "Scoring" },
];

export function resolveSignalConfig(stored) {
  const s = stored && typeof stored === "object" ? stored : {};
  const num = (k) => (Number.isFinite(Number(s[k])) && s[k] !== "" && s[k] !== null ? Number(s[k]) : SIGNAL_DEFAULTS[k]);
  const out = { ...SIGNAL_DEFAULTS };
  for (const k of Object.keys(SIGNAL_DEFAULTS)) if (typeof SIGNAL_DEFAULTS[k] === "number") out[k] = num(k);
  out.urgencyWeights = { ...SIGNAL_DEFAULTS.urgencyWeights, ...(s.urgencyWeights || {}) };
  out.categoryWeights = { ...SIGNAL_DEFAULTS.categoryWeights, ...(s.categoryWeights || {}) };
  out.disabled = Array.isArray(s.disabled) ? s.disabled : [];
  return out;
}

// The ranking score: money at stake (else the nominal value) × urgency × category.
export function scoreOf({ impactAmount, urgency, category }, config = SIGNAL_DEFAULTS) {
  const base = Number(impactAmount) > 0 ? Number(impactAmount) : config.nominal;
  const u = config.urgencyWeights?.[urgency] ?? 1;
  const c = config.categoryWeights?.[category] ?? 1;
  return Math.round(base * u * c * 100) / 100;
}
