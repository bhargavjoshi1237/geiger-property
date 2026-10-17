// Shared lookups and formatters for the Documents area (Document Library). Plain
// data — no JSX.

export const formatDate = (v) =>
  v
    ? new Date(v).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";

export function formatBytes(n) {
  const b = Number(n) || 0;
  if (!b) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

// Capitalize a stored kind ("lease" → "Lease") for display.
export const kindLabel = (k) => (k ? String(k).charAt(0).toUpperCase() + String(k).slice(1) : "Other");

// Where a library row came from.
export const DOCUMENT_SOURCES = {
  library: { label: "Library", variant: "neutral" },
  property: { label: "Property records", variant: "neutral" },
  tenant: { label: "Tenant", variant: "neutral" },
  maintenance: { label: "Maintenance", variant: "neutral" },
};

export const SOURCE_FILTER_OPTIONS = [
  { value: "all", label: "All sources" },
  ...Object.entries(DOCUMENT_SOURCES).map(([value, s]) => ({ value, label: s.label })),
];

// Kinds accepted by `property.documents.kind`.
export const DOCUMENT_KIND_OPTIONS = [
  { value: "lease", label: "Lease" },
  { value: "inspection", label: "Inspection" },
  { value: "insurance", label: "Insurance" },
  { value: "invoice", label: "Invoice" },
  { value: "notice", label: "Notice" },
  { value: "other", label: "Other" },
];
