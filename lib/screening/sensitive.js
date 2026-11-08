// Screening data protection (RISK-02), pure and isomorphic: which keys are protected, how the protected detail is shaped,
// and the deny-list every export, report source, automation field and activity entry passes through.

// Application metadata kept in property.screening_details instead (mirrors split_screening_detail in the RISK-02 migration).
export const IDENTITY_KEYS = Object.freeze(["dateOfBirth", "idType", "idLast4", "evictedBefore", "felonyDisclosed", "disclosureNotes"]);
export const REPORT_KEYS = Object.freeze(["screeningReference"]);
// Each check's findings (screening.<check>.notes) are stored as detail.findings.<check>.
export const FINDINGS_KEY = "findings";
// A co-applicant's (record_items kind co_applicant) protected keys.
export const PARTY_KEYS = Object.freeze(["dateOfBirth", "screeningNotes"]);
export const PRIMARY = "primary";
// Record types whose documents are screening files (private bucket, opened through /api/screening/files).
export const isScreeningOwner = (ownerType) => ownerType === "application";

// What each read scope returns, and the access-log object type it is recorded as.
export const DETAIL_SCOPES = Object.freeze({
  identity: { primary: [...IDENTITY_KEYS], party: ["dateOfBirth"] },
  report: { primary: [...REPORT_KEYS, FINDINGS_KEY], party: ["screeningNotes"] },
});
export const isDetailScope = (s) => Object.hasOwn(DETAIL_SCOPES, s);

// Writing these also needs property.screening.order (recording screening, as RISK-03's gate).
export const ORDER_KEYS = Object.freeze([...REPORT_KEYS, FINDINGS_KEY, "screeningNotes"]);

// Deny-list: never exported, merged, logged, matched by automations or sent out (tenant copies of screening results included).
export const SENSITIVE_KEYS = Object.freeze([
  ...new Set([...IDENTITY_KEYS, ...REPORT_KEYS, ...PARTY_KEYS, "ssn", "ssnLast4", "creditScore", "backgroundStatus", "evictionHistory", "screeningDecision"]),
]);
const SENSITIVE = new Set(SENSITIVE_KEYS);
export const isSensitiveKey = (key) => SENSITIVE.has(key);

const isPlain = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);

// A copy of a row (or view model) without sensitive keys, at the top level, in metadata, and each check's findings.
export function redactSensitive(row) {
  if (!isPlain(row)) return row;
  const out = {};
  for (const [k, v] of Object.entries(row)) if (!SENSITIVE.has(k)) out[k] = v;
  if (isPlain(out.metadata)) out.metadata = redactSensitive(out.metadata);
  if (isPlain(out.screening)) {
    out.screening = Object.fromEntries(
      Object.entries(out.screening).map(([k, v]) => [k, isPlain(v) && "notes" in v ? Object.fromEntries(Object.entries(v).filter(([n]) => n !== "notes")) : v]),
    );
  }
  return out;
}

// An activity entry's { field: [before, after] } with sensitive values replaced; the field names stay.
export function redactChanges(changes) {
  if (!isPlain(changes)) return changes;
  return Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, SENSITIVE.has(k) ? ["(protected)", "(protected)"] : v]));
}

// One party's stored detail limited to a scope's keys.
export function pickScope(detail, scope, party = false) {
  const keys = DETAIL_SCOPES[scope]?.[party ? "party" : "primary"] || [];
  const d = isPlain(detail) ? detail : {};
  return Object.fromEntries(keys.filter((k) => k in d).map((k) => [k, d[k]]));
}

// Stored rows [{ party_ref, detail }] → { primary, parties: { [recordId]: … } } for one scope.
export function detailView(rows, scope) {
  const out = { primary: {}, parties: {} };
  for (const r of rows || []) {
    if (r.party_ref === PRIMARY) out.primary = pickScope(r.detail, scope);
    else out.parties[r.party_ref] = pickScope(r.detail, scope, true);
  }
  return out;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ID_TYPES = ["Driver's license", "State ID", "Passport", "Other"];
const text = (v, max) => String(v ?? "").trim().slice(0, max);

// Validate a detail patch for one party → { patch } or { error }; `checks` are the screening check keys findings may name.
export function cleanDetailPatch(input, { party = false, checks = [] } = {}) {
  if (!isPlain(input)) return { error: "Nothing to save." };
  const allowed = party ? PARTY_KEYS : [...IDENTITY_KEYS, ...REPORT_KEYS, FINDINGS_KEY];
  const patch = {};
  for (const [k, v] of Object.entries(input)) {
    if (!allowed.includes(k)) return { error: `${k} can't be saved here.` };
    if (k === "dateOfBirth") {
      const d = text(v, 10);
      if (d && !DATE.test(d)) return { error: "Enter the date of birth as a date." };
      patch[k] = d;
    } else if (k === "idLast4") {
      const s = text(v, 64).replace(/\s+/g, "");
      if (!/^[0-9A-Za-z]{0,4}$/.test(s)) return { error: "Enter only the last 4 characters of the ID. Never store a full ID or SSN." };
      patch[k] = s;
    } else if (k === "idType") {
      const s = text(v, 40);
      if (s && !ID_TYPES.includes(s)) return { error: "Choose an ID type from the list." };
      patch[k] = s;
    } else if (k === "evictedBefore" || k === "felonyDisclosed") {
      patch[k] = Boolean(v);
    } else if (k === FINDINGS_KEY) {
      if (!isPlain(v)) return { error: "Findings must name a check." };
      const findings = {};
      for (const [check, note] of Object.entries(v)) {
        if (!checks.includes(check)) return { error: `${check} isn't a screening check.` };
        findings[check] = text(note, 4000);
      }
      patch[k] = findings;
    } else {
      patch[k] = text(v, k === "screeningReference" ? 200 : 4000);
    }
  }
  return Object.keys(patch).length ? { patch } : { error: "Nothing to save." };
}

// Stored detail with a patch applied (findings merge per check).
export function mergeDetail(stored, patch) {
  const base = isPlain(stored) ? stored : {};
  const next = { ...base, ...patch };
  if (isPlain(patch?.[FINDINGS_KEY])) next[FINDINGS_KEY] = { ...(isPlain(base[FINDINGS_KEY]) ? base[FINDINGS_KEY] : {}), ...patch[FINDINGS_KEY] };
  return next;
}
