import { normKey } from "../values";
import { appfolio } from "./appfolio";
import { buildium } from "./buildium";
import { rentManager } from "./rent_manager";
import { yardiBreeze } from "./yardi_breeze";

// Source-system presets (PLAT-03): header synonyms, value transforms and report fingerprints per vendor.

export const PRESETS = { appfolio, buildium, rent_manager: rentManager, yardi_breeze: yardiBreeze };
export const presetOf = (source) => PRESETS[source] || null;

// The best-matching vendor report for a header row → { source, report, entity, options, score, matched } or null.
// A report matches when at least 3 of its fingerprint headers (and 60% of them) are present.
export function detectSource(headers) {
  const have = new Set((headers || []).map(normKey));
  let best = null;
  for (const preset of Object.values(PRESETS)) {
    for (const r of preset.reports) {
      const matched = r.fingerprint.filter((h) => have.has(normKey(h))).length;
      const score = matched / r.fingerprint.length;
      if (matched >= 3 && score >= 0.6 && (!best || score > best.score || (score === best.score && matched > best.matched))) {
        best = { source: preset.key, label: `${preset.label} ${r.label}`, report: r.key, entity: r.entity, options: r.options || {}, score, matched };
      }
    }
  }
  return best;
}

// Preset value transform for a field (identity when none).
export function valueTransform(source, entity, fieldKey) {
  return presetOf(source)?.values?.[entity]?.[fieldKey] || null;
}

// Why a recognised column isn't imported in this job, or "".
export const columnNote = (source, entity, header) => {
  const notes = presetOf(source)?.notes?.[entity] || {};
  const hit = Object.keys(notes).find((h) => normKey(h) === normKey(header));
  return hit ? notes[hit] : "";
};
