import { normKey } from "./values";
import { presetOf, valueTransform } from "./presets";

// Column mapping (PLAT-03): file headers → import fields. A mapping is { [fieldKey]: header } (by header text, so a saved
// mapping fits the next export of the same report). Auto-map order: saved mapping, vendor preset, exact label, alias, fuzzy.

const SCORE = { saved: 100, preset: 95, exact: 90, alias: 85 };
const tokens = (s) => String(s || "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

function bigrams(s) {
  const k = normKey(s);
  const out = new Map();
  for (let i = 0; i < k.length - 1; i += 1) out.set(k.slice(i, i + 2), (out.get(k.slice(i, i + 2)) || 0) + 1);
  return out;
}

// Dice similarity of two strings' bigrams (0–1).
export function similarity(a, b) {
  const x = bigrams(a);
  const y = bigrams(b);
  let both = 0;
  let total = 0;
  for (const [g, n] of x) {
    both += Math.min(n, y.get(g) || 0);
    total += n;
  }
  for (const n of y.values()) total += n;
  return total ? (2 * both) / total : 0;
}

// Fuzzy score of a header against a field's names: every word of a two-word-or-longer name inside the header, or near-identical spelling.
function fuzzy(header, names) {
  const ht = new Set(tokens(header));
  let best = 0;
  for (const name of names) {
    const nt = tokens(name);
    if (nt.length >= 2 && nt.every((t) => ht.has(t))) best = Math.max(best, 60 + Math.min(nt.length, 4) * 4 - Math.max(0, ht.size - nt.length) * 3);
    const sim = similarity(header, name);
    if (sim >= 0.8) best = Math.max(best, Math.round(sim * 70));
  }
  return best;
}

// Auto-map headers onto a spec → { mapping, how: { [fieldKey]: "saved" | "preset" | "exact" | "alias" | "fuzzy" } }.
export function autoMap(headers, spec, { source = "generic", saved = null } = {}) {
  const list = (headers || []).filter((h) => h && !h.startsWith("__"));
  const byKey = new Map(list.map((h) => [normKey(h), h]));
  const synonyms = presetOf(source)?.headers?.[spec.key] || {};
  const candidates = [];
  for (const fld of spec.fields) {
    const savedHeader = saved?.[fld.key];
    if (savedHeader && list.includes(savedHeader)) candidates.push({ field: fld.key, header: savedHeader, score: SCORE.saved, how: "saved" });
    for (const s of synonyms[fld.key] || []) if (byKey.has(normKey(s))) candidates.push({ field: fld.key, header: byKey.get(normKey(s)), score: SCORE.preset, how: "preset" });
    // A reference key ("unit_id") never matches by name: "Unit ID" in a file is the old system's id, not the unit.
    for (const s of fld.key.endsWith("_id") ? [fld.label] : [fld.label, fld.key]) if (byKey.has(normKey(s))) candidates.push({ field: fld.key, header: byKey.get(normKey(s)), score: SCORE.exact, how: "exact" });
    for (const s of fld.aliases || []) if (byKey.has(normKey(s))) candidates.push({ field: fld.key, header: byKey.get(normKey(s)), score: SCORE.alias, how: "alias" });
    for (const h of list) {
      const score = fuzzy(h, [fld.label, ...(fld.aliases || [])]);
      if (score >= 60) candidates.push({ field: fld.key, header: h, score, how: "fuzzy" });
    }
  }
  // Highest score first; on a tie a required field wins, then the field listed first.
  const order = new Map(spec.fields.map((x, i) => [x.key, i]));
  const required = new Set(spec.fields.filter((x) => x.required).map((x) => x.key));
  candidates.sort((a, b) => b.score - a.score || Number(required.has(b.field)) - Number(required.has(a.field)) || order.get(a.field) - order.get(b.field));
  const mapping = {};
  const how = {};
  const used = new Set();
  for (const c of candidates) {
    if (mapping[c.field] || used.has(c.header)) continue;
    mapping[c.field] = c.header;
    how[c.field] = c.how;
    used.add(c.header);
  }
  return { mapping, how };
}

// Share of the file's columns the mapping uses → { mapped, total, pct }.
export function mappingCoverage(headers, mapping) {
  const list = (headers || []).filter((h) => h && !h.startsWith("__"));
  const used = new Set(Object.values(mapping || {}).filter(Boolean));
  const mapped = list.filter((h) => used.has(h)).length;
  return { mapped, total: list.length, pct: list.length ? Math.round((mapped / list.length) * 1000) / 10 : 0 };
}

// Required fields the mapping leaves out.
export const unmappedRequired = (spec, mapping) => spec.fields.filter((x) => x.required && !mapping?.[x.key]);

// Fields whose value a group label stands in for when unmapped (AppFolio groups a report's rows under each property).
const GROUP_FIELDS = { units: "property_id", tenants: "property_id", leases: "property_id", open_balances: "property" };

// One raw row → { [fieldKey]: string } under the mapping, with the source's value transforms applied.
export function applyMapping(raw, spec, mapping, { source = "generic" } = {}) {
  const out = {};
  for (const fld of spec.fields) {
    const header = mapping?.[fld.key];
    if (!header) continue;
    let v = raw?.[header];
    v = v === null || v === undefined ? "" : String(v).trim();
    const fn = valueTransform(source, spec.key, fld.key);
    out[fld.key] = fn ? String(fn(v, raw) ?? "").trim() : v;
  }
  const groupField = GROUP_FIELDS[spec.key];
  if (groupField && !mapping?.[groupField] && raw?.__group) out[groupField] = raw.__group;
  return out;
}
