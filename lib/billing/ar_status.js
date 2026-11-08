import { addDays, daysBetween, round2 } from "./periods";

// Pure AR-driven statuses (CORE-07), safe in the browser: a rent account's collection status and the rent.overdue trigger's gate, both from a lease's tenant AR (loadLeaseReceivables: balance, oldestOpenDate).

// Statuses only staff set and the billing job leaves alone.
export const STICKY_RENT_STATUSES = ["In collections"];

// Current at zero or credit, Due while the oldest open item is within grace, Overdue past it; In collections stays.
export function rentAccountStatus({ balance, oldestOpenDate, today, graceDays = 0, current = "" } = {}) {
  if (STICKY_RENT_STATUSES.includes(current)) return current;
  if (!(round2(balance) > 0)) return "Current";
  if (!oldestOpenDate || !today) return "Due";
  return addDays(oldestOpenDate, Math.max(0, Number(graceDays) || 0)) >= today ? "Due" : "Overdue";
}

// rent.overdue fires when the balance is at least minBalance and the oldest open item is daysOverdue old (oldest + daysOverdue ≤ today) → { balance, oldestOpenDate, daysLate } | null.
export function rentOverdueOf(receivable, { today, daysOverdue = 5, minBalance = 1 } = {}) {
  const balance = round2(receivable?.balance);
  const oldest = receivable?.oldestOpenDate || null;
  if (!oldest || !today || !(balance > 0) || balance < Number(minBalance || 0)) return null;
  const daysLate = daysBetween(oldest, today);
  if (daysLate < Math.max(1, Number(daysOverdue) || 0)) return null;
  return { balance, oldestOpenDate: oldest, daysLate };
}
