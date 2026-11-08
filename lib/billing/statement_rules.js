import { addPeriods, periodBounds, periodOf } from "./periods";

// Resident statement rules (CORE-12), pure and browser-safe: the statements setting, who gets a statement and how, dedupe keys and statement periods.

// billing_settings.statements: off until a company switches it on; sent on `day` for the month before; who gets one follows onlyWithBalance / includeZero.
export const STATEMENT_DEFAULTS = Object.freeze({ enabled: false, day: 5, onlyWithBalance: true, includeZero: false });

export function normalizeStatementSettings(value) {
  const v = value && typeof value === "object" ? value : {};
  return {
    enabled: v.enabled === true,
    day: Math.max(1, Math.min(28, Math.trunc(Number(v.day)) || STATEMENT_DEFAULTS.day)),
    onlyWithBalance: v.onlyWithBalance !== false,
    includeZero: v.includeZero === true,
  };
}

// The settings' audience as one choice for the settings card, and back.
export const STATEMENT_AUDIENCES = [
  { value: "owing", label: "Only residents who owe", hint: "A closing balance above zero." },
  { value: "activity", label: "Residents with activity or a balance", hint: "Any charge or payment in the month, or a balance or credit." },
  { value: "all", label: "Every live lease", hint: "Including leases with nothing to report." },
];
export const audienceOf = (s) => (s.onlyWithBalance ? "owing" : s.includeZero ? "all" : "activity");
export const audienceSettings = (audience) =>
  audience === "all" ? { onlyWithBalance: false, includeZero: true } : audience === "activity" ? { onlyWithBalance: false, includeZero: false } : { onlyWithBalance: true, includeZero: false };

// Does a statement go out under these settings (scheduled runs only; a staff send goes to every lease picked)?
export function statementSelected(st, settings) {
  const s = normalizeStatementSettings(settings);
  if (s.onlyWithBalance) return st.closing > 0.004;
  if (s.includeZero) return true;
  return st.activity.length > 0 || Math.abs(st.closing) > 0.004;
}

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
export const isStatementPeriod = (p) => PERIOD_RE.test(String(p || ""));

// The last complete month before a business date.
export const lastMonth = (today) => addPeriods(periodOf(today), -1);

// A month's statement window: the whole month, or the month so far when it is the current one; null for a bad or future month.
export function statementRange(period, today) {
  if (!isStatementPeriod(period)) return null;
  const { start, end } = periodBounds(period);
  if (today && start > today) return null;
  const toDate = Boolean(today) && end > today;
  return { period, from: start, to: toDate ? today : end, toDate };
}

// Months a resident can open, newest first: the current month back to the first with activity (at most `max`).
export function statementPeriods(firstDate, today, max = 24) {
  if (!today) return [];
  const first = periodOf(firstDate || today);
  const out = [];
  for (let p = periodOf(today); p >= first && out.length < max; p = addPeriods(p, -1)) out.push(p);
  return out;
}

// Tenant statement delivery (Tenants → Communication → Statements): E-delivery (default), Mail, Both or None.
export const STATEMENT_DELIVERY = { "E-delivery": "email", Mail: "mail", Both: "both", None: "none" };
export const deliveryOf = (tenant) => STATEMENT_DELIVERY[tenant?.metadata?.statementDelivery] || "email";

const lower = (v) => String(v || "").trim().toLowerCase();
const meta = (r) => (r?.metadata && typeof r.metadata === "object" ? r.metadata : {});

// Who gets a lease's statement: the primary tenant always, plus lease parties and tenant contacts marked "Receives statements".
// Inputs are camel view models: lease { id, tenantId, tenantName }, tenants Map id → { id, name, email, metadata }, parties [{ tenantId, name, email, role, isPrimary, metadata }], contacts [{ id, ownerId, name, metadata: { email, receivesStatements } }].
// → [{ key, name, email, tenantId, source, delivery: email | mail | both | none, dnc }]; a tenant set to None stays listed with delivery none.
export function statementRecipients({ lease, tenants = new Map(), parties = [], contacts = [] }) {
  const out = [];
  const seenTenants = new Set();
  const seenEmails = new Set();
  const add = (r) => {
    if (r.tenantId && seenTenants.has(r.tenantId)) return;
    if (r.email && seenEmails.has(lower(r.email))) return;
    if (r.tenantId) seenTenants.add(r.tenantId);
    if (r.email) seenEmails.add(lower(r.email));
    out.push(r);
  };
  const fromTenant = (t, source) => ({ key: `tenant:${t.id}`, name: t.name || "", email: lower(t.email), tenantId: t.id, source, delivery: deliveryOf(t), dnc: Boolean(meta(t).doNotContact) });
  const live = (parties || []).filter((p) => p.role !== "occupant");
  const primaryId = lease?.tenantId || live.find((p) => p.role === "tenant" && p.isPrimary && p.tenantId)?.tenantId || live.find((p) => p.role === "tenant" && p.tenantId)?.tenantId || "";
  const primary = primaryId ? tenants.get(primaryId) : null;
  if (primary) add(fromTenant(primary, "primary"));
  else add({ key: `lease:${lease?.id}`, name: lease?.tenantName || "Resident", email: "", tenantId: primaryId || "", source: "primary", delivery: "email", dnc: false });
  for (const p of live) {
    if (meta(p).receivesStatements !== true) continue;
    const t = p.tenantId ? tenants.get(p.tenantId) : null;
    if (t) add(fromTenant(t, "party"));
    else if (p.email || p.name) add({ key: `party:${lower(p.email) || lower(p.name)}`, name: p.name || "", email: lower(p.email), tenantId: "", source: "party", delivery: "email", dnc: false });
  }
  for (const c of contacts || []) {
    const m = meta(c);
    if (m.receivesStatements !== true || !m.email) continue;
    add({ key: `contact:${c.id}`, name: c.name || "", email: lower(m.email), tenantId: "", source: "contact", delivery: "email", dnc: false });
  }
  return out;
}

// How each recipient is reached: email and/or a printed copy ([] for None or do-not-contact).
export function channelsOf(r) {
  if (r.dnc || r.delivery === "none") return [];
  if (r.delivery === "mail") return ["print"];
  if (r.delivery === "both") return ["email", "print"];
  return ["email"];
}

// notification_sends dedupe keys: one email per lease, month and address (a resend adds a timestamp); one print-batch row per recipient.
export const statementKey = (leaseId, period, email, resendAt = "") => `stmt:${leaseId}:${period}:${lower(email)}${resendAt ? `:resend:${resendAt}` : ""}`;
export const statementPrintKey = (leaseId, period, recipientKey) => `stmt:${leaseId}:${period}:print:${recipientKey}`;
export const statementNoAddressKey = (leaseId, period, recipientKey) => `stmt:${leaseId}:${period}:none:${recipientKey}`;

// Send statuses that end a recipient's month (a disabled, unconfigured or failed send retries on the next run).
export const FINAL_SEND_STATUSES = ["sent", "sending", "no_address", "queued"];
