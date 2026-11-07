// Maintenance keyword rules (isomorphic, pure), shared by email intake (ORCH-10) and the maintenance intake
// playbook (ORCH-07). Stored in the settings key `intake_rules`; defaults below. A rule matches when any of its
// keywords appears as a whole word or phrase in the text (case-insensitive).

export const INTAKE_RULES_KEY = "intake_rules";

export const INTAKE_RULE_DEFAULTS = {
  // Words that make a request Urgent and page on-call.
  emergencyKeywords: [
    "flood", "flooding", "leak", "leaking", "burst", "gas", "smoke", "fire", "sparking", "no heat",
    "no water", "sewage", "overflowing", "carbon monoxide", "locked out", "break-in", "broken window",
  ],
  categories: [
    { category: "Plumbing", keywords: ["leak", "leaking", "toilet", "sink", "drain", "clog", "faucet", "pipe", "water heater", "shower", "sewage"] },
    { category: "Electrical", keywords: ["outlet", "breaker", "light", "lights", "power", "sparking", "switch", "wiring"] },
    { category: "HVAC", keywords: ["heat", "heating", "no heat", "furnace", "ac", "air conditioning", "thermostat", "boiler"] },
    { category: "Appliance", keywords: ["fridge", "refrigerator", "oven", "stove", "dishwasher", "washer", "dryer", "microwave"] },
    { category: "Pest control", keywords: ["mice", "mouse", "rats", "roaches", "cockroach", "bugs", "bed bugs", "ants", "pest"] },
    { category: "Landscaping", keywords: ["tree", "lawn", "snow", "yard", "gutter"] },
  ],
  defaultCategory: "General",
  // Inbound email: create without review only when the sender is known and this is "auto".
  autonomy: "suggest",
};

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const hasPhrase = (text, phrase) => {
  const p = String(phrase || "").trim().toLowerCase();
  return p ? new RegExp(`(^|[^a-z0-9])${escape(p)}([^a-z0-9]|$)`).test(text) : false;
};

export function resolveIntakeRules(stored) {
  const s = stored && typeof stored === "object" ? stored : {};
  return {
    ...INTAKE_RULE_DEFAULTS,
    ...s,
    emergencyKeywords: Array.isArray(s.emergencyKeywords) ? s.emergencyKeywords : INTAKE_RULE_DEFAULTS.emergencyKeywords,
    categories: Array.isArray(s.categories) ? s.categories : INTAKE_RULE_DEFAULTS.categories,
  };
}

// --- Intake addresses ----------------------------------------------------------

// Each project receives mail at <local>+<projectId>@<domain>; the inbound webhook routes it by mailbox.
export const INTAKE_MAILBOXES = {
  maintenance: { local: "maintenance", label: "Maintenance requests", description: "Residents email repairs here; each becomes a maintenance request." },
  bills: { local: "bills", label: "Vendor bills", description: "Vendors send invoices here; each becomes a draft bill with the attachment." },
};

// Public (not secret) so the settings card can show the addresses; the server also accepts INBOUND_EMAIL_DOMAIN.
export const intakeDomain = () => process.env.NEXT_PUBLIC_INBOUND_EMAIL_DOMAIN || process.env.INBOUND_EMAIL_DOMAIN || "";

export function intakeAddress(mailbox, projectId, domain = intakeDomain()) {
  const box = INTAKE_MAILBOXES[mailbox];
  const host = String(domain || "").trim().replace(/^@/, "");
  return box && projectId && host ? `${box.local}+${projectId}@${host}` : "";
}

const INTAKE_ADDRESS = /(maintenance|bills)\+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})@[^\s<>"',;]+/i;

// Recipients (string, list, { email } or a mix) → { mailbox, projectId, address } for the first intake address, else null.
export function parseIntakeAddress(recipients) {
  const list = (Array.isArray(recipients) ? recipients : [recipients]).flatMap((r) =>
    r && typeof r === "object" ? [r.email || r.address || ""] : String(r || "").split(/[,;]/),
  );
  for (const raw of list) {
    const m = String(raw).match(INTAKE_ADDRESS);
    if (m) return { mailbox: m[1].toLowerCase(), projectId: m[2].toLowerCase(), address: m[0].toLowerCase() };
  }
  return null;
}

// --- Invoice text ----------------------------------------------------------------

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const pad = (n) => String(n).padStart(2, "0");
const money = (s) => {
  const n = Number(String(s).replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
};

function toIsoDate(raw) {
  const s = String(raw || "").trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) return `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${pad(m[1])}-${pad(m[2])}`;
  m = s.match(/^([a-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/i);
  const month = m ? MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) : -1;
  return month >= 0 ? `${m[3]}-${pad(month + 1)}-${pad(m[2])}` : null;
}

// Rules-based reading of an emailed invoice (no AI): amount due, invoice number and due date, each null when absent.
export function parseInvoiceText(text) {
  const t = String(text || "");
  let amount = null;
  for (const label of ["amount due", "balance due", "total due", "invoice total", "total"]) {
    const m = t.match(new RegExp(`\\b${label}\\b\\s*[:\\-]?\\s*(?:USD\\s*)?\\$?\\s*([0-9][0-9,]*(?:\\.[0-9]{1,2})?)`, "i"));
    if (m && (amount = money(m[1]))) break;
  }
  if (!amount) {
    const all = [...t.matchAll(/\$\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/g)].map((m) => money(m[1])).filter(Boolean);
    amount = all.length ? Math.max(...all) : null;
  }
  const inv = t.match(/\binvoice\s*(?:#|no\.?|number|num\.?)\s*[:\-]?\s*([A-Z0-9][A-Z0-9-]{1,30})/i) || t.match(/\b(INV[-\s]?[0-9][0-9-]{1,20})\b/i);
  const due = t.match(/\bdue(?:\s+date|\s+on|\s+by)?\s*[:\-]?\s*(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\/\d{1,2}\/\d{2,4}|[A-Za-z]{3,9}\.?\s+\d{1,2},?\s+\d{4})/i);
  return { amount, invoiceNumber: inv ? inv[1].trim() : null, dueDate: due ? toIsoDate(due[1]) : null };
}

// → { category, emergency, priority, matched: { emergency: [..], category: [..] } }
export function classifyMaintenanceText(text, rules = INTAKE_RULE_DEFAULTS) {
  const t = String(text || "").toLowerCase();
  const r = resolveIntakeRules(rules);
  const emergency = r.emergencyKeywords.filter((k) => hasPhrase(t, k));
  let best = null;
  for (const c of r.categories) {
    const hits = (c.keywords || []).filter((k) => hasPhrase(t, k));
    if (hits.length && (!best || hits.length > best.hits.length)) best = { category: c.category, hits };
  }
  return {
    category: best?.category || r.defaultCategory || "General",
    emergency: emergency.length > 0,
    priority: emergency.length ? "Urgent" : "Medium",
    matched: { emergency, category: best?.hits || [] },
  };
}
