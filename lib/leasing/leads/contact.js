// Lead contact normalization (LEAS-02, isomorphic, pure). normalizePhone mirrors property.phone_e164() in the
// prospect_contact_keys migration, which fills prospects.phone_e164, so intake matches what the database stores.

const EMAIL = /^[^\s@<>()[\],;:"]+@[^\s@<>()[\],;:"]+\.[a-z]{2,}$/i;
const EXTENSION = /\s*(ext\.?|extension|x|#)\s*\d+\s*$/i;

export const clip = (v, max = 500) => String(v ?? "").trim().slice(0, max);

// "Jane Doe <jane@x.com>" / "jane@x.com" / { email } → "jane@x.com" lower-cased, or "" when it isn't an address.
export function normalizeEmail(raw) {
  const v = raw && typeof raw === "object" ? raw.email || raw.address || "" : String(raw ?? "");
  const inner = v.match(/<([^>]+)>/)?.[1] ?? v;
  const email = inner.trim().toLowerCase();
  return email.length <= 254 && EMAIL.test(email) ? email : "";
}

// E.164 from free text: drops an extension, keeps a +/00 international number of 8-15 digits, else US (10 digits, or 11 starting 1).
export function normalizePhone(raw) {
  const main = String(raw ?? "").trim().replace(EXTENSION, "");
  const digits = main.replace(/\D/g, "");
  if (main.startsWith("+")) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  if (main.startsWith("00")) return digits.length - 2 >= 8 && digits.length - 2 <= 15 ? `+${digits.slice(2)}` : null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

// "+12065550100" → "(206) 555-0100" for display; other numbers stay as given.
export function formatPhone(raw) {
  const e164 = normalizePhone(raw);
  if (e164?.startsWith("+1") && e164.length === 12) return `(${e164.slice(2, 5)}) ${e164.slice(5, 8)}-${e164.slice(8)}`;
  return clip(raw, 40);
}

// A display name from what we have: the given name, else the email's local part, else the phone.
export function contactName({ name, email, phone } = {}) {
  const n = clip(name, 120).replace(/\s+/g, " ");
  if (n) return n;
  if (email) return email.split("@")[0];
  return phone ? formatPhone(phone) : "";
}

const UTM_KEYS = ["source", "medium", "campaign", "term", "content"];

// { utm_source | source, … } → { source, medium, campaign, term, content } with only the keys that have a value.
export function cleanUtm(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const out = {};
  for (const k of UTM_KEYS) {
    const v = clip(r[k] ?? r[`utm_${k}`], 120);
    if (v) out[k] = v;
  }
  return out;
}

// An http(s) URL, clipped, else "" (referrers and landing pages).
export function cleanUrl(raw, max = 500) {
  const v = clip(raw, 2000);
  return /^https?:\/\/[^\s]+$/i.test(v) ? v.slice(0, max) : "";
}
