// Listing pricing shared by the listing editor and the public site (LEAS-01): which specials count and effective rent.

const pad = (n) => String(n).padStart(2, "0");

// Local YYYY-MM-DD for `d` (default now).
export const todayISO = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const isPast = (iso, today) => Boolean(iso) && String(iso).slice(0, 10) < today;

export const specialTypeOf = (s) => s?.metadata?.specialType || s?.specialType || "";

// A special counts until it's switched off or its expiry passes.
export const isSpecialActive = (s, today = todayISO()) => s?.status !== "Inactive" && !(s?.endsOn && isPast(s.endsOn, today));

// Effective monthly rent over a term after active specials.
export function effectiveRent(rent, specials, termMonths = 12, today = todayISO()) {
  const r = Number(rent) || 0;
  if (!r) return 0;
  let concession = 0;
  for (const s of specials || []) {
    if (!isSpecialActive(s, today)) continue;
    const v = Number(s.amount) || 0;
    const type = specialTypeOf(s);
    if (type === "Weeks free") concession += (r * 12 * v) / 52;
    else if (type === "Months free") concession += r * v;
    else if (type === "Dollars off") concession += v;
    else if (type === "Percent off") concession += (r * termMonths * v) / 100;
  }
  return Math.max(0, r - concession / termMonths);
}
