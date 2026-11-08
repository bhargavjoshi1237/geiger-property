import { csvCell, csvSlug } from "@/lib/reports/csv";
import { ENTITY_ORDER, getEntity, hasEntity } from "./schemas";

// Export serializer (PLAT-04), pure and server-safe: CSV columns for a project table (every column but secrets, metadata keys
// flattened to metadata.<key>, a readable <name>_ref after each known reference) and for a catalogue entity in the import-template
// format (field labels as headers, references as the names PLAT-03 resolves, custom fields), plus the manifest and file names.

export const EXPORT_FORMAT = "geiger-property-export";
export const EXPORT_SCHEMA_VERSION = 1;
// Entity CSVs up to this many rows download at once; bigger ones are built in the background like a full export.
export const ENTITY_SYNC_LIMIT = 5000;
export const LINK_DAYS = 7;
export const LINK_SECONDS = LINK_DAYS * 86400;
// Tables that never leave the database (encrypted provider tokens and webhook signing secrets).
export const EXCLUDED_TABLES = ["integration_secrets"];

const SECRET_WORDS = new Set(["token", "secret", "secrets", "password", "passcode", "passwd", "ciphertext", "credential", "credentials", "otp", "apikey"]);
const SECRET_PAIRS = [
  ["api", "key"],
  ["private", "key"],
  ["access", "key"],
  ["signing", "key"],
];

const wordsOf = (name) =>
  String(name || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

// A column or JSON key that holds a credential: feed_token, linkToken, apiKey, webhook_secret, password… (not dedupe_key or system_key).
export function isSecretKey(name) {
  const words = wordsOf(name);
  if (words.some((w) => SECRET_WORDS.has(w))) return true;
  return words.some((w, i) => SECRET_PAIRS.some(([a, b]) => w === a && words[i + 1] === b));
}

// Signed or tokenised URLs keep their address but lose the credential.
const SIGNED_PARAM = /([?&](?:token|access_token|sig|signature|x-amz-signature|x-amz-credential|x-amz-security-token)=)[^&#\s"']+/gi;
export const scrubString = (s) => (s.includes("=") ? s.replace(SIGNED_PARAM, "$1[removed]") : s);

// A JSON value without secret keys or URL credentials, at any depth.
export function scrub(value) {
  if (typeof value === "string") return scrubString(value);
  if (Array.isArray(value)) return value.map(scrub);
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const [k, v] of Object.entries(value)) if (!isSecretKey(k)) out[k] = scrub(v);
  return out;
}

// One raw cell: strings as stored (URL credentials removed), numbers as numbers, booleans true/false, JSON compact.
export function rawCell(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return scrubString(value);
  if (typeof value === "number" || typeof value === "bigint") return value;
  if (typeof value === "boolean") return value ? "true" : "false";
  return JSON.stringify(scrub(value));
}

// One CSV line (CRLF-terminated); text cells starting with = + - @ are prefixed with ' (formula injection).
export const csvLine = (values) => `${values.map(csvCell).join(",")}\r\n`;

// Reference columns resolved to a readable label, and the tables they point at.
export const REF_TARGETS = {
  property_id: "properties",
  unit_id: "units",
  tenant_id: "tenants",
  lease_id: "leases",
  owner_id: "owners",
  vendor_id: "vendors",
  building_id: "buildings",
  portfolio_id: "portfolios",
  gl_account_id: "gl_accounts",
  bank_account_id: "bank_accounts",
  unit_type_id: "unit_types",
  floor_plan_id: "floor_plans",
  work_order_id: "work_orders",
  listing_id: "listings",
  prospect_id: "prospects",
  application_id: "applications",
  amenity_id: "amenities",
};

// Columns a target's label is built from: units by label, GL accounts by number and name, everything else by name.
const LABEL_COLUMNS = { units: ["label"], gl_accounts: ["number", "name"] };
export const labelColumns = (table) => LABEL_COLUMNS[table] || ["name"];

export function labelOf(table, row) {
  if (!row) return "";
  return labelColumns(table)
    .map((c) => row[c])
    .filter((v) => v !== null && v !== undefined && v !== "")
    .join(" · ");
}

export const refHeader = (column) => `${column.replace(/_id$/, "")}_ref`;

// Columns of one table's CSV: [{ header, get(row, ctx) }]. ctx.row(table, id) returns a looked-up row (or null).
export function tableColumns(columns, { metadataKeys = [], refTables = new Set() } = {}) {
  const names = new Set(columns);
  const out = [];
  for (const col of columns) {
    if (isSecretKey(col)) continue;
    if (col === "metadata") {
      for (const key of metadataKeys) {
        if (isSecretKey(key)) continue;
        out.push({ header: `metadata.${key}`, get: (row) => rawCell(row.metadata?.[key]) });
      }
      continue;
    }
    out.push({ header: col, get: (row) => rawCell(row[col]) });
    const target = REF_TARGETS[col];
    if (target && refTables.has(target) && !names.has(refHeader(col))) {
      out.push({ header: refHeader(col), get: (row, ctx) => (row[col] ? labelOf(target, ctx?.row(target, row[col])) : "") });
    }
  }
  return out;
}

// Columns to fetch for a table: everything the CSV shows (secret columns are never selected).
export const selectColumns = (columns) => columns.filter((c) => !isSecretKey(c));

export const headerLine = (cols) => csvLine(cols.map((c) => c.header));
export const rowLine = (cols, row, ctx) => csvLine(cols.map((c) => c.get(row, ctx)));

// The table a catalogue lookup reads (portfolios, buildings… are plain table names).
export const lookupTable = (entity) => (hasEntity(entity) ? getEntity(entity).table : entity);

// Catalogue entities in import order that are tables of this export.
export const exportEntities = (tables) => ENTITY_ORDER.filter((key) => tables.has(getEntity(key).table));

// Active custom-field definitions for an entity from the project's custom_fields setting.
export const customDefs = (setting, entity) => (Array.isArray(setting?.[entity]) ? setting[entity] : []).filter((d) => d && d.id && d.label && d.active !== false);

// A typed value as the import template writes it.
export function templateValue(field, value) {
  if (value === null || value === undefined || value === "") return "";
  if (Array.isArray(value)) return value.map((v) => templateValue({ type: "text" }, v)).join("; ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(scrub(value));
  if (field.type === "date") return String(value).slice(0, 10);
  if (["money", "number", "integer", "percent"].includes(field.type)) {
    const n = Number(value);
    return Number.isFinite(n) ? n : String(value);
  }
  return typeof value === "string" ? scrubString(value) : value;
}

// The readable value PLAT-03 resolves a reference by: the first `lookup.by` field the target row has.
export function lookupValue(field, id, ctx) {
  if (!id) return "";
  const row = ctx?.row(lookupTable(field.lookup.entity), id);
  if (!row) return "";
  for (const by of field.lookup.by) if (row[by] !== null && row[by] !== undefined && row[by] !== "") return String(row[by]);
  return "";
}

// Columns of an entity's import-format CSV: the catalogue fields (custom fields last, a label already taken gets " (custom)"), then ID.
export function entityColumns(entity, { custom = [] } = {}) {
  const used = new Set();
  const cols = getEntity(entity, { custom }).fields.map((field) => {
    const header = used.has(field.label) ? `${field.label} (custom)` : field.label;
    used.add(header);
    const get =
      field.type === "reference" && field.lookup
        ? (row, ctx) => lookupValue(field, row[field.key], ctx)
        : (row) => templateValue(field, field.target === "metadata" ? row.metadata?.[field.key] : row[field.key]);
    return { header, field, get };
  });
  // The record's own id, so a re-import can match it as the old system's ID.
  cols.push({ header: "ID", get: (row) => row.id || "" });
  return cols;
}

// Columns an entity CSV reads from its own table, and per lookup target the columns its references resolve by.
export function entityNeeds(entity, columns, { custom = [] } = {}) {
  const fields = getEntity(entity, { custom }).fields;
  const own = new Set(["id", "metadata"]);
  const lookups = new Map();
  for (const f of fields) {
    if (f.target === "column") own.add(f.key);
    if (f.type !== "reference" || !f.lookup) continue;
    const target = lookupTable(f.lookup.entity);
    if (!lookups.has(target)) lookups.set(target, new Set(["id"]));
    for (const by of f.lookup.by) lookups.get(target).add(by);
  }
  return { select: [...own].filter((c) => columns.includes(c)), lookups };
}

// File names: property-export-2026-11-08.zip, -part2.zip …; one entity's CSV tenants-2026-11-08.csv.
export const dateStamp = (now = new Date()) => new Date(now).toISOString().slice(0, 10);
export const archiveName = (now, part = 1) => `property-export-${dateStamp(now)}${part > 1 ? `-part${part}` : ""}.zip`;
export const entityFileName = (entity, now) => `${csvSlug(hasEntity(entity) ? getEntity(entity).plural : entity)}-${dateStamp(now)}.csv`;
export const exportPrefix = (projectId, exportId) => `${projectId}/exports/${exportId}`;

// Archive paths: tables/<t>.csv (a table split across parts continues in <t>-2.csv), import/<entity>.csv, documents/<bucket>/<path>.
export const tableEntry = (table, piece = 1) => `tables/${table}${piece > 1 ? `-${piece}` : ""}.csv`;
export const entityEntry = (entity) => `import/${entity}.csv`;
export function documentEntry(projectId, bucket, name) {
  const rest = String(name).startsWith(`${projectId}/`) ? String(name).slice(projectId.length + 1) : String(name);
  return `documents/${bucket}/${rest}`;
}

export const README = [
  "Geiger Property data export",
  "",
  "tables/      one CSV per project table, every row including soft-deleted ones (deleted_at is set on those).",
  "             metadata.<key> columns hold the metadata JSON's top-level keys; <name>_ref columns give a readable label for an id.",
  "import/      properties, units, owners, vendors, tenants and leases in the import-template format: Settings > Import & Export",
  "             reads them as they are (live rows only; import them in the order listed in manifest.json).",
  "documents/   the files stored for the project, by bucket and path (the storage_path columns point at them).",
  "manifest.json  schema version, row counts and SHA-256 checksums for every file, and what was left out.",
  "",
  "Left out on purpose: integration secrets, and any column or JSON key holding a token, password or API key.",
  "Text cells that start with = + - or @ are prefixed with ' so spreadsheets don't run them as formulas.",
  "",
].join("\r\n");

// The manifest: what the archive holds, row counts per table and checksums per file.
export function buildManifest({ exportId, project, createdAt, requestedBy, tables, entities, documents, parts, excludedColumns }) {
  const rows = tables.reduce((n, t) => n + t.rows, 0);
  return {
    format: EXPORT_FORMAT,
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportId,
    project,
    createdAt,
    requestedBy: requestedBy || null,
    totals: {
      tables: tables.length,
      rows,
      deletedRows: tables.reduce((n, t) => n + t.deleted, 0),
      documents: documents.files.length,
      documentBytes: documents.files.reduce((n, f) => n + f.bytes, 0),
      parts: parts.length,
    },
    tables,
    import: { order: entities.map((e) => e.entity), files: entities },
    documents,
    parts,
    excluded: {
      tables: EXCLUDED_TABLES,
      columns: excludedColumns,
      keys: "Metadata and JSON keys named like a token, secret, password, passcode or API key; credentials in signed URLs",
    },
  };
}

// One export row as the Import & Export screen shows it.
export function exportView(row, now = new Date()) {
  if (!row) return null;
  const expired = row.status === "expired" || (row.status === "succeeded" && row.expires_at && new Date(row.expires_at) <= new Date(now));
  return {
    id: row.id,
    kind: row.kind,
    entity: row.entity || null,
    label: row.kind === "entity" && row.entity && hasEntity(row.entity) ? getEntity(row.entity).plural : "Everything",
    status: expired ? "expired" : row.status,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    expiresAt: row.expires_at,
    files: (Array.isArray(row.files) ? row.files : []).map((f) => ({ name: f.name, bytes: Number(f.bytes) || 0 })),
    counts: row.counts || {},
    error: row.error || "",
    requestedBy: row.metadata?.requestedByName || row.metadata?.requestedByEmail || "",
  };
}
