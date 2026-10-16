// Scheduled-report rules shared by the Schedule dialog and the job (pure).

export const FREQUENCY_OPTIONS = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

export const WEEKDAY_OPTIONS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map(
  (label, i) => ({ value: String(i), label }),
);

export const MONTH_DAY_OPTIONS = Array.from({ length: 28 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }));

export const SCHEDULE_STATUS_MAP = {
  Active: { label: "Active", variant: "success", dotClass: "bg-emerald-400" },
  Paused: { label: "Paused", variant: "neutral", dotClass: "bg-zinc-500" },
};

export const RUN_STATUS_MAP = {
  sent: { label: "Sent", variant: "success", dotClass: "bg-emerald-400" },
  partial: { label: "Partly sent", variant: "warning", dotClass: "bg-amber-400" },
  not_configured: { label: "Email not configured", variant: "warning", dotClass: "bg-amber-400" },
  failed: { label: "Failed", variant: "danger", dotClass: "bg-red-400" },
};

const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

// "a@x.com, b@y.com; c@z.com" → { valid: [...unique], invalid: [...] }.
export function parseRecipients(text) {
  const parts = String(text || "").split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
  const valid = [...new Set(parts.filter((p) => EMAIL.test(p)).map((p) => p.toLowerCase()))];
  return { valid, invalid: parts.filter((p) => !EMAIL.test(p)) };
}

export function scheduleLabel(s) {
  if (s.frequency === "daily") return "Every day";
  if (s.frequency === "weekly") return `Every ${WEEKDAY_OPTIONS[Number(s.dayOfWeek) || 0]?.label || "Monday"}`;
  return `Monthly on day ${Math.min(Math.max(Number(s.dayOfMonth) || 1, 1), 28)}`;
}

// Is a schedule due on `now`'s UTC day?
export function isDue(s, now = new Date()) {
  if (s.status && s.status !== "Active") return false;
  if (s.frequency === "daily") return true;
  if (s.frequency === "weekly") return now.getUTCDay() === (Number(s.dayOfWeek) || 0);
  return now.getUTCDate() === Math.min(Math.max(Number(s.dayOfMonth) || 1, 1), 28);
}

// One send per period: the UTC day (daily / weekly) or month (monthly).
export const periodKeyFor = (s, now = new Date()) =>
  s.frequency === "monthly" ? now.toISOString().slice(0, 7) : now.toISOString().slice(0, 10);
