// Stable ids and date helpers for the playground's sample portfolio. Ids are
// valid v4-shaped UUIDs built from a per-table group number, so seed modules can
// cross-reference rows without importing each other's arrays. Dates are relative
// to today so "expiring soon", "overdue" and "this month" always read correctly.

// Group numbers: 1–19 are the core entities (core.js); each area seed module
// owns the block listed beside it so ids never collide.
export const GROUPS = {
  project: 1,
  portfolio: 2,
  property: 3,
  building: 4,
  unitType: 5,
  floorPlan: 6,
  amenity: 7,
  unit: 8,
  tenant: 9,
  lease: 10,
  owner: 11,
  vendor: 12,
  link: 13,
  // marketing.js 20–29 · leasing.js 30–39 · maintenance.js 40–49
  // accounting.js 50–59 · workspace.js 60–79
};

export function sid(group, n) {
  return `5a0d0000-0000-4000-a000-${String(group).padStart(4, "0")}${String(n).padStart(8, "0")}`;
}

export const SANDBOX_PROJECT_ID = sid(GROUPS.project, 1);
export const SANDBOX_ORG_ID = sid(GROUPS.project, 2);

const DAY = 24 * 60 * 60 * 1000;
const pad = (n) => String(n).padStart(2, "0");

// "YYYY-MM-DD" n days from today (negative = past) — for date columns.
export function daysFromNow(n) {
  const d = new Date(Date.now() + n * DAY);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Full ISO timestamp n days from now — for timestamptz columns.
export function isoDaysFromNow(n, hour = 10) {
  const d = new Date(Date.now() + n * DAY);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

// "YYYY-MM" for the month n months from this one — for period columns.
export function monthFromNow(n) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
