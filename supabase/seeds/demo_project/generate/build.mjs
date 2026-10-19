import * as ids from "@/lib/sandbox/seed/ids";
import * as core from "@/lib/sandbox/seed/core";
import { coreTables } from "@/lib/sandbox/seed/core";
import { marketingTables } from "@/lib/sandbox/seed/marketing";
import { leasingTables } from "@/lib/sandbox/seed/leasing";
import { maintenanceTables } from "@/lib/sandbox/seed/maintenance";
import { accountingTables } from "@/lib/sandbox/seed/accounting";
import { workspaceTables } from "@/lib/sandbox/seed/workspace";
import { TARGET, SANDBOX_PREFIX, SKIP_TABLES } from "./config.mjs";
import { AREAS } from "./areas/index.mjs";

const MINUTE = 60 * 1000;

// Raw dataset: the playground portfolio, then each area module's additions and
// patches. Rows stay in sandbox-id space until remap() so areas can use sid().
export async function buildDataset() {
  const db = new Map();
  const rows = (table) => {
    if (!db.has(table)) db.set(table, []);
    return db.get(table);
  };
  for (const tables of [coreTables(), marketingTables(), leasingTables(), maintenanceTables(), accountingTables(), workspaceTables()]) {
    for (const [table, list] of Object.entries(tables)) rows(table).push(...list);
  }

  const ctx = {
    ...ids,
    core,
    db,
    rows,
    byId: (table, id) => rows(table).find((r) => r.id === id) || null,
    projectId: ids.SANDBOX_PROJECT_ID,
    createdBy: TARGET.createdBy,
  };
  for (const area of AREAS) await area.apply(ctx);

  for (const table of SKIP_TABLES) db.delete(table);
  return db;
}

// Standard columns every property.* row carries; created_at steps back a minute
// per row so "created_at desc" lists keep each table's authored order.
export function finalize(db, schema, base = Date.now()) {
  for (const [table, list] of db) {
    const cols = schema.get(table);
    if (!cols) continue;
    db.set(table, list.map((row, i) => {
      const out = {};
      const stamp = new Date(base - (i + 1) * MINUTE).toISOString();
      if (cols.has("metadata")) out.metadata = {};
      if (cols.has("deleted_at")) out.deleted_at = null;
      if (cols.has("created_by")) out.created_by = TARGET.createdBy;
      if (cols.has("project_id")) out.project_id = ids.SANDBOX_PROJECT_ID;
      if (cols.has("created_at")) out.created_at = stamp;
      if (cols.has("updated_at")) out.updated_at = row.created_at || stamp;
      return { ...out, ...row };
    }));
  }
  return db;
}

// Sandbox ids → demo ids (project, organisation, then every sid()-shaped value),
// applied deeply — keys included — so ids inside metadata jsonb follow too.
export function remap(db) {
  const swap = (s) =>
    s
      .replaceAll(ids.SANDBOX_PROJECT_ID, TARGET.projectId)
      .replaceAll(ids.SANDBOX_ORG_ID, TARGET.organizationId)
      .replaceAll(SANDBOX_PREFIX, TARGET.idPrefix);
  const walk = (v) => {
    if (typeof v === "string") return swap(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [swap(k), walk(x)]));
    return v;
  };
  for (const [table, list] of db) db.set(table, list.map(walk));
  return db;
}
