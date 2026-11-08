import { addDays, addMonths, addPeriods, dueDateFor, isoDate, periodOf, round2 } from "./periods";

// Recurring charge frequencies (CORE-03): the one list both charge screens and the billing job use; pure.

export const FREQUENCIES = Object.freeze([
  { value: "Weekly", label: "Weekly", days: 7, perYear: 52 },
  { value: "Biweekly", label: "Every 2 weeks", days: 14, perYear: 26 },
  { value: "Monthly", label: "Monthly", months: 1, perYear: 12 },
  { value: "Quarterly", label: "Quarterly", months: 3, perYear: 4 },
  { value: "Semi-annually", label: "Semi-annually", months: 6, perYear: 2 },
  { value: "Annually", label: "Annually", months: 12, perYear: 1 },
  { value: "One-time", label: "One-time", once: true, perYear: 0 },
]);

export const FREQUENCY_OPTIONS = FREQUENCIES.map(({ value, label }) => ({ value, label }));

const ALIASES = {
  "bi-weekly": "Biweekly",
  fortnightly: "Biweekly",
  "every 2 weeks": "Biweekly",
  "semi-annual": "Semi-annually",
  semiannual: "Semi-annually",
  semiannually: "Semi-annually",
  "twice a year": "Semi-annually",
  annual: "Annually",
  yearly: "Annually",
  "one time": "One-time",
  once: "One-time",
};

// A frequency entry by value, label or common alias; blank is Monthly (the column default); unknown is null.
export function frequencyOf(name) {
  const raw = String(name ?? "").trim();
  if (!raw) return FREQUENCIES[2];
  const key = raw.toLowerCase();
  const value = ALIASES[key] || raw;
  return FREQUENCIES.find((f) => f.value.toLowerCase() === value.toLowerCase() || f.label.toLowerCase() === key) || null;
}

export const frequencyLabel = (name) => frequencyOf(name)?.label || String(name || "");

// Monthly charges billed with rent post on the rent due date.
export const billsWithRent = (frequency, billWithRent) => frequencyOf(frequency)?.months === 1 && billWithRent !== false;

// The occurrence after `date`: +7/+14 days, +n months on the anchor day, or (Monthly billed with rent) the next period's due date; null for One-time.
export function nextOccurrence(date, frequency, { dueDay = 1, billWithRent = false, anchorDay } = {}) {
  const f = frequencyOf(frequency);
  const d = isoDate(date);
  if (!f || f.once || !d) return null;
  if (f.days) return addDays(d, f.days);
  if (f.months === 1 && billWithRent) return dueDateFor(addPeriods(periodOf(d), 1), dueDay);
  return addMonths(d, f.months, anchorDay);
}

// A charge's monthly equivalent (one-time charges don't recur).
export function monthlyEquivalent(amount, frequency) {
  const f = frequencyOf(frequency);
  return f ? round2(((Number(amount) || 0) * f.perYear) / 12) : 0;
}
