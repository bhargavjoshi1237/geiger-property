import { TARGET } from "./config.mjs";

// Live column catalog of the property schema: table → Map(column → { type, nullable, hasDefault }).
export async function loadSchema(client) {
  const { rows } = await client.query(`
    select table_name, column_name, udt_name, is_nullable = 'YES' as nullable, column_default is not null as has_default
    from information_schema.columns c
    where table_schema = 'property'
      and exists (select 1 from information_schema.tables t
                  where t.table_schema = 'property' and t.table_name = c.table_name and t.table_type = 'BASE TABLE')
    order by table_name, ordinal_position`);
  const schema = new Map();
  for (const r of rows) {
    if (!schema.has(r.table_name)) schema.set(r.table_name, new Map());
    schema.get(r.table_name).set(r.column_name, { type: r.udt_name, nullable: r.nullable, hasDefault: r.has_default });
  }
  return schema;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function typeError(type, v) {
  if (v === null || v === undefined) return null;
  switch (type) {
    case "uuid": return typeof v === "string" && UUID.test(v) ? null : "not a uuid";
    case "date": return typeof v === "string" && DATE.test(v) ? null : "not YYYY-MM-DD";
    case "timestamptz": return typeof v === "string" && !Number.isNaN(Date.parse(v)) ? null : "not a timestamp";
    case "int4":
    case "int8": return Number.isInteger(v) ? null : "not an integer";
    case "numeric": return typeof v === "number" && Number.isFinite(v) ? null : "not a number";
    case "bool": return typeof v === "boolean" ? null : "not a boolean";
    case "jsonb": return typeof v === "object" ? null : "not an object/array";
    case "_text": return Array.isArray(v) && v.every((x) => typeof x === "string") ? null : "not a string[]";
    case "text": return typeof v === "string" ? null : `not a string (${typeof v})`;
    default: return null;
  }
}

// Value sets enforced by check constraints in the live schema.
const CHECKS = {
  ledger_entries: {
    source_type: ["charge", "payment", "credit", "bill", "bill_payment", "distribution", "contribution", "management_fee", "deposit_held", "deposit_return", "late_fee", "adjustment", "deposit_interest"],
    status: ["posted", "void"],
  },
  portal_members: { role: ["resident", "owner", "vendor"], status: ["invited", "active", "disabled"] },
  report_schedules: { frequency: ["daily", "weekly", "monthly"] },
};

// Unique indexes (beyond the primary key) as row → key (null = not indexed).
const all = (...cols) => (r) => (cols.every((c) => r[c] != null) ? cols.map((c) => r[c]).join("|") : null);
const UNIQUES = {
  settings: [(r) => `${r.project_id ?? ""}|${r.key}`],
  amenity_links: [all("amenity_id", "owner_type", "owner_id")],
  floor_plan_links: [all("floor_plan_id", "owner_type", "owner_id")],
  notification_sends: [all("dedupe_key")],
  announcement_deliveries: [all("announcement_id", "recipient_key")],
  automation_runs: [all("automation_id", "dedupe_key")],
  report_runs: [all("schedule_id", "period_key")],
  gl_accounts: [(r) => (r.system_key ? `${r.project_id ?? ""}|${r.system_key}` : null)],
  ledger_entries: [(r) => (r.idempotency_key ? `${r.project_id ?? ""}|${r.idempotency_key}` : null)],
  online_payments: [all("stripe_payment_intent_id"), all("stripe_session_id"), all("link_token"), all("idempotency_key")],
  autopay_plans: [all("link_token")],
  portal_members: [(r) => `${r.role}|${r.tenant_id ?? r.owner_id ?? r.vendor_id ?? ""}`],
  work_orders: [(r) => (r.pm_schedule_id && r.pm_due_date ? `${r.pm_schedule_id}|${r.pm_due_date}|${r.unit_id ?? ""}` : null)],
};

// Checks the remapped dataset against the live schema. Unknown columns are
// dropped (warning); everything else that would fail the insert is an error.
export function validate(db, schema) {
  const errors = [];
  const warnings = [];
  const allIds = new Set();
  for (const list of db.values()) for (const r of list) if (r.id) allIds.add(r.id);

  for (const [table, list] of db) {
    const cols = schema.get(table);
    if (!cols) {
      errors.push(`${table}: table does not exist in the live schema (${list.length} rows)`);
      continue;
    }
    const dropped = new Map();
    const seen = new Set();
    list.forEach((row, i) => {
      const where = `${table}[${i}]${row.name ? ` "${row.name}"` : ""}`;
      if (!row.id) errors.push(`${where}: missing id`);
      else if (seen.has(row.id)) errors.push(`${where}: duplicate id ${row.id}`);
      seen.add(row.id);
      for (const key of Object.keys(row)) {
        if (!cols.has(key)) {
          dropped.set(key, (dropped.get(key) || 0) + 1);
          delete row[key];
        }
      }
      for (const [col, spec] of cols) {
        const v = row[col];
        if ((v === null || v === undefined) && !spec.nullable && !spec.hasDefault) errors.push(`${where}: ${col} is required`);
        if (v === null && !spec.nullable) errors.push(`${where}: ${col} is NOT NULL but set to null`);
        const bad = typeError(spec.type, v);
        if (bad) errors.push(`${where}: ${col} ${bad} → ${JSON.stringify(v)?.slice(0, 80)}`);
        if (spec.type === "uuid" && col !== "id" && typeof v === "string" && v.startsWith(TARGET.idPrefix) && !allIds.has(v)) {
          errors.push(`${where}: ${col} points at ${v}, which no seeded row has`);
        }
      }
      for (const [col, allowed] of Object.entries(CHECKS[table] || {})) {
        if (row[col] != null && !allowed.includes(row[col])) errors.push(`${where}: ${col} "${row[col]}" not in [${allowed.join(", ")}]`);
      }
    });
    for (const [key, n] of dropped) warnings.push(`${table}: dropped unknown column "${key}" (${n} rows)`);
    for (const keyOf of UNIQUES[table] || []) {
      const hit = new Set();
      for (const row of list) {
        const key = row.deleted_at ? null : keyOf(row);
        if (key == null) continue;
        if (hit.has(key)) errors.push(`${table}: unique index collides on ${key}`);
        hit.add(key);
      }
    }
  }

  // Every ledger entry must balance and have at least two lines.
  const lines = db.get("ledger_lines") || [];
  for (const e of db.get("ledger_entries") || []) {
    const own = lines.filter((l) => l.entry_id === e.id && !l.deleted_at);
    const dr = own.reduce((s, l) => s + Number(l.debit || 0), 0);
    const cr = own.reduce((s, l) => s + Number(l.credit || 0), 0);
    if (own.length < 2 || Math.abs(dr - cr) > 0.004) errors.push(`ledger_entries "${e.memo}": ${own.length} lines, debits ${dr} vs credits ${cr}`);
  }
  return { errors, warnings };
}
