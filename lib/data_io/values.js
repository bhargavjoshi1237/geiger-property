// Strict cell parsers for imports (PLAT-03): each returns { ok, value } or { ok: false, error } — never a silent guess.

const str = (v) => (v === null || v === undefined ? "" : String(v)).trim();
const ok = (value) => ({ ok: true, value });
const bad = (error) => ({ ok: false, error });

// Lower-case alphanumerics only: header and enum matching ignore case, spaces and punctuation.
export const normKey = (v) => str(v).toLowerCase().replace(/[^a-z0-9]+/g, "");
// Lower-case words: names and labels compare without case or extra spaces.
export const normName = (v) => str(v).toLowerCase().replace(/[^a-z0-9#&]+/g, " ").trim();

const round2 = (n) => Math.round(n * 100) / 100;
const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const pad = (n) => String(n).padStart(2, "0");

// "2026-10-31", "10/31/2026", "10/31/26", "10-31-2026" (US month first) → YYYY-MM-DD; "13/31/2026" fails.
export function parseDateStrict(v) {
  const s = str(v);
  if (!s) return ok("");
  let y;
  let m;
  let d;
  let hit = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  if (hit) [, y, m, d] = hit.map(Number);
  else {
    hit = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
    if (!hit) return bad(`"${s}" isn't a date — use MM/DD/YYYY or YYYY-MM-DD.`);
    [, m, d, y] = hit.map(Number);
    if (hit[3].length === 2) y += 2000;
  }
  if (m < 1 || m > 12) return bad(`"${s}" isn't a date — the month must be 1 to 12 (MM/DD/YYYY).`);
  if (d < 1 || d > daysIn(y, m)) return bad(`"${s}" isn't a date — that month has ${daysIn(y, m)} days.`);
  if (y < 1900 || y > 2200) return bad(`"${s}" has an unlikely year.`);
  return ok(`${y}-${pad(m)}-${pad(d)}`);
}

// "$1,234.50", "(1,234.50)", "-12", "12-", "1234" → number (cents); "$1,2.00", "12.345" and "abc" fail.
export function parseMoneyStrict(v) {
  let s = str(v);
  if (!s) return ok(null);
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1).trim();
  }
  if (s.endsWith("-")) {
    neg = !neg;
    s = s.slice(0, -1).trim();
  }
  // "-$12" and "$-12" are both negative.
  const minus = () => {
    neg = !neg;
    return "";
  };
  s = s.replace(/^-\s*/, minus).replace(/^\$\s*/, "").replace(/^-\s*/, minus);
  const grouped = /^\d{1,3}(,\d{3})+(\.\d{1,2})?$/;
  const plain = /^\d+(\.\d{1,2})?$|^\.\d{1,2}$/;
  if (!grouped.test(s) && !plain.test(s)) return bad(`"${str(v)}" isn't an amount — use 1234.50 or $1,234.50.`);
  const n = round2(Number(s.replace(/,/g, "")));
  return ok(neg ? -n : n);
}

// Whole numbers ("1,200" allowed).
export function parseIntegerStrict(v) {
  const s = str(v);
  if (!s) return ok(null);
  if (!/^-?\d{1,3}(,\d{3})*$|^-?\d+$/.test(s)) return bad(`"${s}" isn't a whole number.`);
  return ok(Number(s.replace(/,/g, "")));
}

export function parseNumberStrict(v) {
  const s = str(v);
  if (!s) return ok(null);
  if (!/^-?(\d{1,3}(,\d{3})+|\d+)?(\.\d+)?$/.test(s) || s === "-" || s === ".") return bad(`"${s}" isn't a number.`);
  return ok(Number(s.replace(/,/g, "")));
}

// "8", "8%", "8.5 %" → 8 (percent points, 0–100).
export function parsePercentStrict(v) {
  const s = str(v).replace(/\s*%$/, "");
  if (!s) return ok(null);
  const n = parseNumberStrict(s);
  if (!n.ok) return bad(`"${str(v)}" isn't a percentage.`);
  if (n.value < 0 || n.value > 100) return bad(`"${str(v)}" should be between 0 and 100%.`);
  return n;
}

const TRUE = new Set(["yes", "y", "true", "t", "1", "x", "on"]);
const FALSE = new Set(["no", "n", "false", "f", "0", "off"]);
export function parseBooleanStrict(v) {
  const s = str(v).toLowerCase();
  if (!s) return ok(null);
  if (TRUE.has(s)) return ok(true);
  if (FALSE.has(s)) return ok(false);
  return bad(`"${str(v)}" isn't yes or no.`);
}

// Every address in a cell ("a@x.com; b@y.com", "Jane <a@x.com>") in order, lower-cased.
export const splitEmails = (v) => (str(v).match(/[^\s@,;<>()"]+@[^\s@,;<>()"]+\.[a-z]{2,}/gi) || []).map((e) => e.toLowerCase());
export function parseEmailStrict(v) {
  const s = str(v);
  if (!s) return ok("");
  const list = splitEmails(s);
  if (!list.length) return bad(`"${s}" isn't an email address.`);
  return { ok: true, value: list[0], others: list.slice(1) };
}

// Phone numbers in a cell ("Mobile: (207) 555-0142, Home: 555-0199") → the first, as written.
export const splitPhones = (v) => (str(v).match(/\+?\(?\d[\d\s().-]{5,}\d(\s*(x|ext\.?)\s*\d+)?/gi) || []).map((p) => p.trim());
export function parsePhoneStrict(v) {
  const s = str(v);
  if (!s) return ok("");
  const list = splitPhones(s);
  if (!list.length || list[0].replace(/\D/g, "").length < 7) return bad(`"${s}" isn't a phone number.`);
  return { ok: true, value: list[0], others: list.slice(1) };
}

// An enum value by case/punctuation-insensitive match ("month to month" → "Month-to-month").
export function matchEnum(v, values) {
  const s = str(v);
  if (!s) return ok("");
  const k = normKey(s);
  const hit = (values || []).find((x) => normKey(x) === k);
  return hit ? ok(hit) : bad(`"${s}" isn't one of: ${(values || []).join(", ")}.`);
}

// "Doe, Jane" → "Jane Doe"; anything else unchanged.
export const flipName = (v) => {
  const s = str(v);
  const m = s.match(/^([^,]+),\s*([^,]+)$/);
  return m ? `${m[2].trim()} ${m[1].trim()}` : s;
};

// Typed value for a catalogue type: { ok, value, others? } or { ok:false, error }.
export function parseTyped(type, v, field = {}) {
  switch (type) {
    case "date":
      return parseDateStrict(v);
    case "money":
      return parseMoneyStrict(v);
    case "integer":
      return parseIntegerStrict(v);
    case "number":
      return parseNumberStrict(v);
    case "percent":
      return parsePercentStrict(v);
    case "boolean":
      return parseBooleanStrict(v);
    case "email":
      return parseEmailStrict(v);
    case "phone":
      return parsePhoneStrict(v);
    case "enum":
      return matchEnum(v, field.enum);
    default:
      return ok(str(v));
  }
}
