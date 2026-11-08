import { list } from "./lookups";

// Report property scope (CORE-43, pure): the property filter's value is "all", a property id or "portfolio:<id>". A portfolio resolves
// to its current member properties (properties.portfolio_id) when the report runs, so ledger lines never carry a portfolio and moving
// a property between portfolios changes portfolio reports without rewriting history. Point-in-time membership is not modelled (P3).

export const PORTFOLIO_PREFIX = "portfolio:";

export const portfolioScope = (portfolioId) => `${PORTFOLIO_PREFIX}${portfolioId}`;

// The portfolio id of a scope value, else null.
export const portfolioIdOf = (value) => {
  const v = String(value || "");
  return v.startsWith(PORTFOLIO_PREFIX) && v.length > PORTFOLIO_PREFIX.length ? v.slice(PORTFOLIO_PREFIX.length) : null;
};

export const isPortfolioScope = (value) => Boolean(portfolioIdOf(value));

// A portfolio's current member property ids, sorted so source params stay stable.
export const portfolioPropertyIds = (portfolioId, properties) =>
  list(properties)
    .filter((p) => p?.id && p.portfolioId === portfolioId)
    .map((p) => p.id)
    .sort();

// Report filters → the property ids in scope, or null for every property. A portfolio with no members (or before the properties have
// loaded) is [] — no properties, never all of them.
export function resolvePropertyScope(filters = {}, properties = null) {
  const value = filters?.propertyId;
  if (!value || value === "all") return null;
  const portfolioId = portfolioIdOf(value);
  return portfolioId ? portfolioPropertyIds(portfolioId, properties) : [value];
}

// Is a property in a resolved scope (null = every property)?
export const inPropertyScope = (ids, propertyId) => !ids || ids.includes(propertyId);

// Does a report definition offer the property / portfolio filter?
export const hasPropertyFilter = (def) => Boolean(def?.filters?.some((f) => f.type === "property"));

const byName = (a, b) => String(a.name || "").localeCompare(String(b.name || ""), undefined, { numeric: true, sensitivity: "base" });

// The property filter's options: "All properties", then grouped portfolios and properties (archived portfolios only when selected).
export function scopeOptions(properties, portfolios, value = "all") {
  const props = list(properties).filter((p) => p?.id).sort(byName);
  const ports = list(portfolios)
    .filter((p) => p?.id && (p.status !== "Archived" || portfolioScope(p.id) === value))
    .sort(byName);
  const all = { value: "all", label: "All properties" };
  const propertyOption = (p) => ({ value: p.id, label: p.name || "Untitled property" });
  if (!ports.length) return [all, ...props.map(propertyOption)];
  return [
    all,
    ...ports.map((p) => ({ value: portfolioScope(p.id), label: p.name || "Untitled portfolio", selectedLabel: `${p.name || "Untitled"} portfolio`, group: "Portfolios" })),
    ...props.map((p) => ({ ...propertyOption(p), group: "Properties" })),
  ];
}

// The scope as a subtitle: "<name> portfolio · N properties", the property's name, or "" for every property.
export function scopeLabel(filters = {}, data = {}) {
  const value = filters?.propertyId;
  if (!value || value === "all") return "";
  const portfolioId = portfolioIdOf(value);
  if (!portfolioId) return list(data.properties).find((p) => p.id === value)?.name || "";
  const name = list(data.portfolios).find((p) => p.id === portfolioId)?.name || "Portfolio";
  const n = portfolioPropertyIds(portfolioId, data.properties).length;
  return `${name} portfolio · ${n} propert${n === 1 ? "y" : "ies"}`;
}

// The scope a schedule keeps, as text for the Schedule dialog.
export function scopeSummary(filters = {}, data = {}) {
  const label = scopeLabel(filters, data);
  if (!label) return "All properties";
  return isPortfolioScope(filters.propertyId) ? `${label} — consolidated over the portfolio's members at each send` : label;
}

// Empty state for a portfolio with no member properties (a report on it has nothing to consolidate).
export const EMPTY_PORTFOLIO = {
  title: "No properties in this portfolio",
  description: "Add properties on the portfolio's Properties tab. Portfolio reports follow its current membership.",
};
