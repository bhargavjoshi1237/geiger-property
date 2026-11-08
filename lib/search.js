// Global record search (PLAT-05): the record types ⌘K finds through property.search_records, and how a hit becomes a palette entry.
// No React or Supabase here, so the topbar, the playground sandbox and node tests share it.

export const MIN_QUERY_LENGTH = 2;
export const PER_TYPE_LIMIT = 5;
export const MAX_PER_TYPE = 20;
export const SEARCH_DEBOUNCE_MS = 200;

// Palette entry ids for records start with this, so they can be told apart from nav pages (e.g. in recents).
export const RECORD_ENTRY_PREFIX = "record:";

// `tab` is the nav page whose editor opens the record (its view key gates the type); `fields` is the search text in
// the SQL haystack's order ("phone_digits" is the phone without punctuation). A test pins these to the migration.
export const RECORD_TYPES = [
  {
    type: "tenant",
    tab: "Tenants",
    label: "Tenants",
    table: "tenants",
    fields: ["name", "email", "phone", "phone_digits", "unit"],
    subtitle: (r) => r.unit || null,
  },
  {
    type: "prospect",
    tab: "Prospects",
    label: "Prospects",
    table: "prospects",
    fields: ["name", "email", "phone", "phone_digits", "unit", "property_name"],
    subtitle: (r) => r.unit || r.property_name || null,
  },
  {
    type: "application",
    tab: "Applications",
    label: "Applications",
    table: "applications",
    fields: ["name", "applicant_name", "email", "phone", "phone_digits", "unit", "property_label"],
    subtitle: (r) => r.unit || r.property_label || null,
  },
  {
    type: "owner",
    tab: "Owners",
    label: "Owners",
    table: "owners",
    fields: ["name", "company", "email", "phone", "phone_digits"],
    subtitle: () => null,
  },
  {
    type: "vendor",
    tab: "Vendors",
    label: "Vendors",
    table: "vendors",
    fields: ["name", "contact_name", "email", "phone", "phone_digits", "specialty"],
    subtitle: (r) => r.specialty || null,
  },
  {
    type: "property",
    tab: "Properties",
    label: "Properties",
    table: "properties",
    fields: ["name", "address", "city", "state", "zip"],
    subtitle: (r) => [r.city, r.state].filter(Boolean).join(", ") || null,
  },
  {
    type: "unit",
    tab: "Units",
    label: "Units",
    table: "units",
    titleField: "label",
    fields: ["label", "occupant_name"],
    subtitle: (r, ctx) => ctx.propertyName(r.property_id),
  },
  {
    type: "lease",
    tab: "Leases",
    label: "Leases",
    table: "leases",
    fields: ["name", "unit", "tenant_name"],
    subtitle: (r) => r.status || null,
  },
  {
    type: "work_order",
    tab: "Work Orders",
    label: "Work orders",
    table: "work_orders",
    fields: ["name", "property_label", "tenant_name", "vendor_name", "category"],
    subtitle: (r) => r.property_label || null,
  },
  {
    type: "bill",
    tab: "Bills & Payables",
    label: "Bills",
    table: "bills",
    fields: ["name", "vendor_name", "reference"],
    subtitle: (r) => r.vendor_name || null,
  },
];

const BY_TYPE = new Map(RECORD_TYPES.map((t) => [t.type, t]));

// Record types whose page is in the viewer's nav (modules switched on, view key held), in catalogue order.
export function recordTypesFor(visibleNav) {
  const titles = new Set();
  for (const item of visibleNav || []) {
    titles.add(item.title);
    for (const sub of item.subItems || []) titles.add(sub.title);
  }
  return RECORD_TYPES.filter((t) => titles.has(t.tab)).map((t) => t.type);
}

// What a record's search text must contain, lower-cased: the query as typed, or its digits when it is phone-shaped; null when too short.
export function searchNeedle(query) {
  const q = String(query ?? "").trim();
  if (q.length < MIN_QUERY_LENGTH) return null;
  const digits = q.replace(/[^0-9]/g, "");
  return (/^[0-9()+.\s-]+$/.test(q) && digits.length >= 3 ? digits : q).toLowerCase();
}

// search_records rows → palette entries: grouped by type, the page's icon, the subtitle folded into the title, opened via onOpen(tab, id).
// `matched` (the query the server answered) rides in the keywords so the palette's own fuzzy filter keeps every server hit.
export function recordItems(rows, { iconOf = () => undefined, onOpen, matched = "" } = {}) {
  const items = [];
  for (const row of rows || []) {
    const spec = BY_TYPE.get(row?.type);
    if (!spec || !row.id) continue;
    items.push({
      id: `${RECORD_ENTRY_PREFIX}${row.type}:${row.id}`,
      title: [row.title || "Untitled", row.subtitle].filter(Boolean).join(" · "),
      group: spec.label,
      icon: iconOf(spec.tab),
      keywords: [row.keywords, matched].filter(Boolean).join(" "),
      onSelect: () => onOpen?.(spec.tab, row.id),
    });
  }
  return items;
}

// Recents ids without record entries: the palette only remembers pages, since record hits aren't in its pool on open.
export const withoutRecordIds = (ids) => (Array.isArray(ids) ? ids.filter((id) => !String(id).startsWith(RECORD_ENTRY_PREFIX)) : []);

const digitsOf = (v) => String(v ?? "").replace(/[^0-9]/g, "");
const haystackOf = (spec, r) => spec.fields.map((f) => (f === "phone_digits" ? digitsOf(r.phone) : (r[f] ?? ""))).join(" ");

// The playground's search_records: the SQL's matching over in-memory tables (rowsOf(table) → rows), without RBAC.
export function searchRecordsIn(rowsOf, { p_project, p_query, p_types = null, p_limit = PER_TYPE_LIMIT } = {}) {
  const needle = searchNeedle(p_query);
  if (!p_project || !needle) return [];
  const limit = Math.min(Math.max(Math.trunc(Number(p_limit ?? PER_TYPE_LIMIT)) || 1, 1), MAX_PER_TYPE);
  const live = (table) => (rowsOf(table) || []).filter((r) => String(r.project_id) === String(p_project) && !r.deleted_at);
  const propertyNames = new Map(live("properties").map((p) => [String(p.id), p.name || null]));
  const ctx = { propertyName: (id) => propertyNames.get(String(id)) || null };
  const out = [];
  for (const spec of RECORD_TYPES) {
    if (p_types && !p_types.includes(spec.type)) continue;
    const titleOf = (r) => r[spec.titleField || "name"] ?? null;
    const prefixed = (r) => String(titleOf(r) ?? "").toLowerCase().startsWith(needle);
    const hits = live(spec.table)
      .map((r) => ({ r, hay: haystackOf(spec, r) }))
      .filter(({ hay }) => hay.toLowerCase().includes(needle))
      .sort((a, b) => prefixed(b.r) - prefixed(a.r) || String(titleOf(a.r) ?? "").localeCompare(String(titleOf(b.r) ?? "")))
      .slice(0, limit);
    for (const { r, hay } of hits) {
      out.push({ id: r.id, type: spec.type, title: titleOf(r), subtitle: spec.subtitle(r, ctx), keywords: hay });
    }
  }
  return out;
}
