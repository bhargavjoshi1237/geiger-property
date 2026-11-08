// Display helpers for the public leasing pages (LEAS-01). Dates are calendar dates, so they format in UTC.

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const usdCents = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 2 });

export const money = (n) => usd.format(Number(n) || 0);
export const moneyExact = (n) => usdCents.format(Number(n) || 0);

export function formatDate(iso, opts = { month: "short", day: "numeric", year: "numeric" }) {
  if (!iso) return "";
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
}

export const bedsLabel = (n) => (Number(n) > 0 ? `${Number(n)} bed${Number(n) === 1 ? "" : "s"}` : "Studio");
export const bathsLabel = (n) => `${Number(n) || 0} bath${Number(n) === 1 ? "" : "s"}`;
export const sqftLabel = (n) => (Number(n) > 0 ? `${Number(n).toLocaleString("en-US")} sq ft` : "");

export const layoutLabel = (l) => [bedsLabel(l.bedrooms), bathsLabel(l.bathrooms), sqftLabel(l.sqft)].filter(Boolean).join(" · ");

export const availabilityLabel = (l) => (l.availableNow ? "Available now" : `Available ${formatDate(l.availableDate, { month: "short", day: "numeric" })}`);

export const addressLine = (a) => (a ? [a.street, a.city, [a.state, a.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ") : "");

// One-line summary for meta descriptions and cards.
export function listingSummary(l) {
  const where = [l.property?.name, l.property?.address?.city].filter(Boolean).join(", ");
  return [layoutLabel(l), `${money(l.rent)}/mo`, availabilityLabel(l), where].filter(Boolean).join(" · ");
}
