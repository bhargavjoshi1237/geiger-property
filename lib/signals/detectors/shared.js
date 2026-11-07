import { money, money0 } from "@/lib/reports/format";
import { dayOf, daysBetweenIso, parseIso } from "@/lib/reports/periods";

// Small helpers for detectors (pure). A detector is
//   { key, label, area, category, description, sources, detect(src, ctx) → { findings, examined, skipped, note } }
// and a finding is { key, title, why, urgency, propertyId?, records: [{ type, id, label, amount? }],
//   actions: [launcher actions], impact (dollars) | null, grain: "record" | "summary", metadata? }.

export { money, money0, dayOf, daysBetweenIso };

export const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

export const names = (rows, pick, max = 3) => {
  const list = rows.map(pick).filter(Boolean);
  const head = list.slice(0, max).join(", ");
  return list.length > max ? `${head} and ${list.length - max} more` : head;
};

export const hoursSince = (iso, now) => {
  const d = parseIso(iso);
  return d ? (now.getTime() - d.getTime()) / 3600000 : null;
};

export const fmtDay = (iso) => {
  const d = parseIso(iso);
  return d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
};

export const dailyRent = (monthly) => ((Number(monthly) || 0) * 12) / 365;

// "3 of 41 leases have no end date and were skipped." (empty when nothing was skipped)
export const skipNote = (skipped, examined, noun, reason) =>
  skipped ? `${skipped} of ${examined} ${noun} ${skipped === 1 ? "has" : "have"} ${reason} and ${skipped === 1 ? "was" : "were"} skipped.` : "";

export const tab = (label, tabTitle, itemId, section) => ({ type: "tab", label, tab: tabTitle, ...(itemId ? { itemId } : {}), ...(section ? { section } : {}) });
export const report = (label, title) => ({ type: "report", label, key: title, tab: title });
export const playbook = (key, label, recordType, recordIds) => ({ type: "playbook", key, label, recordType, recordIds });
export const workflow = (label, recordType, recordIds) => ({ type: "workflow", label, recordType, recordIds });
export const caseAction = (label = "Work through it") => ({ type: "case", label });
