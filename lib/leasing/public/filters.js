// Vacancy search filters (LEAS-01): parsed from search params, applied to serialized public listings.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const BED_OPTIONS = [
  { value: "", label: "Any beds" },
  { value: "0", label: "Studio+" },
  { value: "1", label: "1+ bed" },
  { value: "2", label: "2+ beds" },
  { value: "3", label: "3+ beds" },
  { value: "4", label: "4+ beds" },
];

const first = (v) => (Array.isArray(v) ? v[0] : v);
const wholeNumber = (v, max) => {
  const n = Number.parseInt(String(first(v) ?? ""), 10);
  return Number.isFinite(n) && n >= 0 && n <= max ? n : null;
};

// parseListingFilters(searchParams | URLSearchParams) → { propertyId, beds, maxRent, moveInBy, pets }; bad values drop out.
export function parseListingFilters(params) {
  const get = (k) => (params && typeof params.get === "function" ? params.get(k) : params?.[k]);
  const property = String(first(get("property")) ?? "");
  const moveIn = String(first(get("moveInBy")) ?? "");
  const pets = String(first(get("pets")) ?? "");
  return {
    propertyId: UUID.test(property) ? property.toLowerCase() : null,
    beds: wholeNumber(get("beds"), 10),
    maxRent: wholeNumber(get("maxRent"), 1_000_000) || null,
    moveInBy: ISO_DATE.test(moveIn) ? moveIn : null,
    pets: pets === "1" || pets === "true",
  };
}

export const hasFilters = (f) => Boolean(f.propertyId || f.beds !== null || f.maxRent || f.moveInBy || f.pets);

// A listing passes when it meets every filter set; "move in by" keeps homes available on or before that date.
export function matchesListingFilters(l, f) {
  if (f.propertyId && l.property?.id !== f.propertyId) return false;
  if (f.beds !== null && f.beds !== undefined && (Number(l.bedrooms) || 0) < f.beds) return false;
  if (f.maxRent && (Number(l.rent) || 0) > f.maxRent) return false;
  if (f.moveInBy && l.availableDate && l.availableDate > f.moveInBy) return false;
  if (f.pets && !l.pets?.allowed) return false;
  return true;
}

// Filters back to a query string (only the ones set).
export function filtersToQuery(f) {
  const q = new URLSearchParams();
  if (f.propertyId) q.set("property", f.propertyId);
  if (f.beds !== null && f.beds !== undefined) q.set("beds", String(f.beds));
  if (f.maxRent) q.set("maxRent", String(f.maxRent));
  if (f.moveInBy) q.set("moveInBy", f.moveInBy);
  if (f.pets) q.set("pets", "1");
  return q.toString();
}

// Up to `n` other live listings like `ref` ({ slug, propertyId, bedrooms }): same property first, then same bedrooms.
export function similarListings(all, ref, n = 3) {
  const score = (l) => (l.property?.id && l.property.id === ref.propertyId ? 2 : 0) + (Number(l.bedrooms) === Number(ref.bedrooms) ? 1 : 0);
  return (all || [])
    .filter((l) => l.slug !== ref.slug)
    .map((l, i) => ({ l, i, s: score(l) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, n)
    .map((x) => x.l);
}

// Soonest available first, then lowest rent.
export const byAvailability = (a, b) =>
  String(a.availableDate || "").localeCompare(String(b.availableDate || "")) || (Number(a.rent) || 0) - (Number(b.rent) || 0);
