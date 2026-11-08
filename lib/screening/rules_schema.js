// Location-specific screening rules (RISK-05): the shape of property.screening_rules rows and their `effects`, how each effect
// field merges ("most protective wins"), and display text. Pure and alias-free; safe in the browser, on the server and in tests.

export const RULE_SCOPES = ["federal", "state", "county", "city"];
export const RULE_STATUSES = ["active", "pending", "enjoined", "repealed", "withdrawn"];
export const RULE_VERIFICATION = ["verified", "checked", "unverifiable"];
export const RULE_ENFORCEMENT = ["warn", "block"];
export const RULE_TOPICS = ["criminal", "eviction", "credit", "income", "source_of_income", "fees", "process", "notices", "portable_report"];
export const JURISDICTION_CODE = /^US(-[A-Z0-9_]+){0,2}$/;

export const TOPIC_LABELS = {
  criminal: "Criminal history",
  eviction: "Eviction history",
  credit: "Credit",
  income: "Income",
  source_of_income: "Source of income",
  fees: "Fees",
  process: "Process",
  notices: "Notices",
  portable_report: "Portable reports",
};

export const SCOPE_LABELS = { federal: "Federal", state: "State", county: "County", city: "City" };

export const STATUS_MAP = {
  active: { label: "In force", variant: "success" },
  pending: { label: "Pending", variant: "info" },
  enjoined: { label: "Enjoined", variant: "warning" },
  repealed: { label: "Repealed", variant: "neutral" },
  withdrawn: { label: "Withdrawn", variant: "neutral" },
};

export const VERIFICATION_MAP = {
  verified: { label: "Verified", variant: "success", note: "Checked against the primary text on the date shown." },
  checked: { label: "Checked", variant: "outline", note: "Opened during research; part of it rests on a secondary source. Re-check before relying on it." },
  unverifiable: { label: "Unverified", variant: "warning", note: "The publisher blocks automated checks. The link points to the official source." },
};

// Every effect field, its type and how rules combine on it. merge: falseWins (a ban beats an allowance), trueWins, min, max,
// union (lists), rank (the later option in `rank` wins), feeType (banned, else the type of the lowest cap).
export const EFFECT_FIELDS = [
  { path: "criminal.allowed", type: "boolean", merge: "falseWins", label: "Criminal history", text: ["May be considered", "May not be considered"] },
  {
    path: "criminal.timing",
    type: "enum",
    merge: "rank",
    rank: ["any", "after_prequalification", "after_conditional_offer"],
    label: "When criminal history is checked",
    options: { any: "Any time", after_prequalification: "Only once the applicant otherwise qualifies", after_conditional_offer: "Only after a conditional offer" },
  },
  { path: "criminal.lookbackYears.misdemeanor", type: "number", merge: "min", unit: "years", label: "Misdemeanor look-back" },
  { path: "criminal.lookbackYears.felony", type: "number", merge: "min", unit: "years", label: "Felony look-back" },
  { path: "criminal.excluded", type: "list", merge: "union", label: "Records that may not be considered" },
  { path: "criminal.individualizedAssessment", type: "boolean", merge: "trueWins", label: "Individualized assessment", text: ["Required", "Not required"] },
  { path: "criminal.responseDays", type: "number", merge: "max", unit: "days", label: "Applicant response window" },
  { path: "criminal.mustAttachDocs", type: "boolean", merge: "trueWins", label: "Copies of records to the applicant", text: ["Required", "Not required"] },
  { path: "preOfferInquiryBanned", type: "list", merge: "union", label: "Questions barred before a conditional offer", options: { criminal: "Criminal history", eviction: "Eviction history" } },
  { path: "eviction.allowed", type: "boolean", merge: "falseWins", label: "Eviction history", text: ["May be considered", "May not be a basis to deny"] },
  { path: "eviction.lookbackYearsMax", type: "number", merge: "min", unit: "years", label: "Eviction look-back limit" },
  { path: "eviction.excludeDismissed", type: "boolean", merge: "trueWins", label: "Dismissed cases", text: ["Excluded", "May be considered"] },
  { path: "eviction.excludeSealed", type: "boolean", merge: "trueWins", label: "Sealed or masked cases", text: ["Excluded", "May be considered"] },
  { path: "income.maxMultiple", type: "number", merge: "min", unit: "multiple", label: "Highest income multiple allowed" },
  { path: "income.tenantPortionForVoucher", type: "boolean", merge: "trueWins", label: "Voucher holders' income test", text: ["Tenant's share of rent only", "Full rent"] },
  { path: "sourceOfIncome.protected", type: "boolean", merge: "trueWins", label: "Source of income", text: ["Protected", "Not protected"] },
  { path: "sourceOfIncome.includesVouchers", type: "boolean", merge: "trueWins", label: "Housing vouchers", text: ["Protected", "Not named"] },
  { path: "credit.voucherHolderLimits", type: "boolean", merge: "trueWins", label: "Credit checks for voucher holders", text: ["Limited", "Not limited"] },
  { path: "fees.capType", type: "enum", merge: "feeType", rank: ["actual_cost", "cpi", "fixed", "banned"], label: "Application fee rule", options: { actual_cost: "Actual cost only", cpi: "Capped (adjusted yearly)", fixed: "Capped", banned: "Not allowed" } },
  { path: "fees.cap", type: "number", merge: "min", unit: "dollars", label: "Application fee cap" },
  { path: "fees.actualCostLimit", type: "boolean", merge: "trueWins", label: "Fee limited to actual cost", text: ["Yes", "No"] },
  { path: "fees.receiptRequired", type: "boolean", merge: "trueWins", label: "Receipt for the fee", text: ["Required", "Not required"] },
  { path: "fees.refundIfNotScreened", type: "boolean", merge: "trueWins", label: "Refund if not screened", text: ["Required", "Not required"] },
  { path: "fees.refundDays", type: "number", merge: "min", unit: "days", label: "Refund deadline" },
  { path: "fees.noFeeIfNoUnit", type: "boolean", merge: "trueWins", label: "No fee when no unit is available", text: ["Required", "Not required"] },
  { path: "fees.portableReport", type: "enum", merge: "rank", rank: ["may", "must"], label: "Portable screening reports", options: { may: "May be accepted", must: "Must be accepted" } },
  { path: "process.firstInTime", type: "boolean", merge: "trueWins", label: "First-in-time processing", text: ["Required", "Not required"] },
  { path: "process.criteriaDisclosureBeforeFee", type: "boolean", merge: "trueWins", label: "Written criteria before a fee", text: ["Required", "Not required"] },
  { path: "process.writtenDenialRequired", type: "boolean", merge: "trueWins", label: "Reasons for a denial in writing", text: ["Required", "Not required"] },
  { path: "notices.extraContent", type: "list", merge: "union", label: "Required notice content" },
];

export const EFFECT_FIELD_BY_PATH = new Map(EFFECT_FIELDS.map((f) => [f.path, f]));

// Plain-language names for list values (criminal.excluded, notices.extraContent); unknown keys read as words.
export const LIST_VALUE_LABELS = {
  arrests_without_conviction: "Arrests without a conviction",
  arrests_without_charges: "Arrests that led to no charges",
  sealed_expunged: "Sealed or expunged records",
  juvenile: "Juvenile records",
  diversion: "Diversion",
  dismissed: "Dismissed charges",
  pardoned: "Pardons",
  decriminalized: "Decriminalized conduct",
  infractions: "Infractions",
  criminal: "Criminal history",
  eviction: "Eviction history",
};

const isObject = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);

export function getPath(obj, path) {
  return path.split(".").reduce((o, k) => (isObject(o) ? o[k] : undefined), obj);
}

export function setPath(obj, path, value) {
  const keys = path.split(".");
  let o = obj;
  for (const k of keys.slice(0, -1)) o = isObject(o[k]) ? o[k] : (o[k] = {});
  o[keys[keys.length - 1]] = value;
  return obj;
}

// Every leaf path in an effects object, so unknown keys can be reported.
function leafPaths(obj, prefix = "") {
  const out = [];
  for (const [k, v] of Object.entries(isObject(obj) ? obj : {})) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (isObject(v) && !EFFECT_FIELD_BY_PATH.has(p)) out.push(...leafPaths(v, p));
    else out.push(p);
  }
  return out;
}

// One field's value in its declared type, or undefined when it can't be read as one.
function coerce(field, raw) {
  if (raw === undefined || raw === null || raw === "") return undefined;
  if (field.type === "boolean") return raw === true || raw === "true" ? true : raw === false || raw === "false" ? false : undefined;
  if (field.type === "number") {
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  }
  if (field.type === "enum") return field.rank.includes(raw) ? raw : undefined;
  if (field.type === "list") {
    if (!Array.isArray(raw)) return undefined;
    const list = [...new Set(raw.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim()))].sort();
    if (field.options && list.some((x) => !(x in field.options))) return undefined;
    return list;
  }
  return undefined;
}

// Effects in the documented shape: known fields only, typed → { effects, problems: [message] }.
export function validateEffects(input) {
  const effects = {};
  const problems = [];
  if (!isObject(input)) return { effects, problems: input == null ? [] : ["Effects must be a JSON object."] };
  for (const path of leafPaths(input)) if (!EFFECT_FIELD_BY_PATH.has(path)) problems.push(`Unknown field "${path}".`);
  for (const field of EFFECT_FIELDS) {
    const raw = getPath(input, field.path);
    const value = coerce(field, raw);
    if (value === undefined) {
      if (raw !== undefined && raw !== null && raw !== "") problems.push(`"${field.path}" must be ${describeType(field)}.`);
      continue;
    }
    setPath(effects, field.path, value);
  }
  return { effects, problems };
}

export const normalizeEffects = (input) => validateEffects(input).effects;

function describeType(field) {
  if (field.type === "boolean") return "true or false";
  if (field.type === "number") return "a number of 0 or more";
  if (field.type === "enum") return `one of ${field.rank.map((x) => `"${x}"`).join(", ")}`;
  return field.options ? `a list of ${Object.keys(field.options).map((x) => `"${x}"`).join(", ")}` : "a list of text values";
}

// Every field a rule sets, as [{ path, value }].
export const effectEntries = (effects) =>
  EFFECT_FIELDS.map((f) => ({ path: f.path, value: getPath(effects, f.path) })).filter((e) => e.value !== undefined);

// --- Rows ----------------------------------------------------------------------------------

const dateOnly = (v) => (v ? String(v).slice(0, 10) : "");

// A property.screening_rules row as the view model (camelCase, effects normalized; a project_id row is a custom rule).
export function normalizeScreeningRule(row) {
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.project_id ?? null,
    custom: Boolean(row.project_id),
    jurisdictionCode: row.jurisdiction_code ?? "",
    scope: row.scope ?? "state",
    locality: row.locality ?? "",
    ruleKey: row.rule_key ?? "",
    title: row.title ?? "",
    topic: row.topic ?? "process",
    effects: normalizeEffects(row.effects),
    effectiveFrom: dateOnly(row.effective_from),
    effectiveTo: dateOnly(row.effective_to),
    status: row.status ?? "active",
    enforcement: row.enforcement ?? "warn",
    citation: row.citation ?? "",
    sourceUrl: row.source_url ?? "",
    legalResourceId: row.legal_resource_id ?? null,
    verification: row.verification ?? "checked",
    verifiedOn: dateOnly(row.verified_on),
    notes: row.notes ?? "",
    metadata: isObject(row.metadata) ? row.metadata : {},
    updatedAt: row.updated_at ?? null,
  };
}

const COLUMNS = {
  jurisdictionCode: "jurisdiction_code",
  scope: "scope",
  locality: "locality",
  ruleKey: "rule_key",
  title: "title",
  topic: "topic",
  status: "status",
  enforcement: "enforcement",
  citation: "citation",
  sourceUrl: "source_url",
  legalResourceId: "legal_resource_id",
  verification: "verification",
  notes: "notes",
  metadata: "metadata",
};

// camelCase patch → columns, only the keys present (blank dates and text become null).
export function toScreeningRuleRow(input) {
  const row = {};
  for (const [key, col] of Object.entries(COLUMNS)) if (key in input) row[col] = input[key] === "" ? null : input[key];
  if ("jurisdictionCode" in input) row.jurisdiction_code = String(input.jurisdictionCode || "").trim().toUpperCase();
  if ("title" in input) row.title = String(input.title || "").trim();
  if ("effects" in input) row.effects = normalizeEffects(input.effects);
  for (const [key, col] of [["effectiveFrom", "effective_from"], ["effectiveTo", "effective_to"], ["verifiedOn", "verified_on"]]) {
    if (key in input) row[col] = input[key] || null;
  }
  return row;
}

// Problems that would stop a custom rule saving (mirrors the table's checks).
export function ruleProblems(rule) {
  const problems = [];
  if (!JURISDICTION_CODE.test(String(rule.jurisdictionCode || "").trim().toUpperCase())) problems.push("Use a jurisdiction code like US, US-CA, US-IL-COOK or US-NY-NYC.");
  if (!String(rule.ruleKey || "").trim()) problems.push("Give the rule a key.");
  if (!String(rule.title || "").trim()) problems.push("Give the rule a title.");
  if (!RULE_TOPICS.includes(rule.topic)) problems.push("Pick a topic.");
  if (!RULE_STATUSES.includes(rule.status)) problems.push("Pick a status.");
  if (rule.status === "active" && (!String(rule.sourceUrl || "").trim() || !rule.verifiedOn)) problems.push("A rule in force needs a source link and the date it was verified.");
  if (rule.effectiveFrom && rule.effectiveTo && rule.effectiveTo < rule.effectiveFrom) problems.push("The end date is before the start date.");
  return problems;
}

// --- Display -------------------------------------------------------------------------------

const words = (s) => String(s).replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
export const listValueLabel = (field, v) => field?.options?.[v] || LIST_VALUE_LABELS[v] || words(v);

// One effect value as text ("3 years", "2.5× rent", "$62.02", "May not be considered").
export function formatEffect(path, value) {
  const f = EFFECT_FIELD_BY_PATH.get(path);
  if (!f || value === undefined || value === null) return "—";
  if (f.type === "boolean") return (f.text || ["Yes", "No"])[value ? 0 : 1];
  if (f.type === "enum") return f.options?.[value] || words(value);
  if (f.type === "list") return value.length ? value.map((v) => listValueLabel(f, v)).join(", ") : "None";
  if (f.unit === "years") return `${value} ${value === 1 ? "year" : "years"}`;
  if (f.unit === "days") return `${value} ${value === 1 ? "day" : "days"}`;
  if (f.unit === "multiple") return `${value}× rent`;
  if (f.unit === "dollars") return `$${Number(value).toFixed(2).replace(/\.00$/, "")}`;
  return String(value);
}
