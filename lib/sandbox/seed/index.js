import { SANDBOX_PROJECT_ID } from "./ids";
import { coreTables } from "./core";
import { marketingTables } from "./marketing";
import { leasingTables } from "./leasing";
import { maintenanceTables } from "./maintenance";
import { accountingTables } from "./accounting";
import { workspaceTables } from "./workspace";

const MINUTE = 60 * 1000;

// Fill the standard columns every property.* row carries. created_at steps back a
// minute per row so the default "created_at desc" lists keep each seed's order.
function finalize(rows) {
  const base = Date.now();
  return rows.map((row, i) => ({
    metadata: {},
    deleted_at: null,
    created_by: null,
    project_id: SANDBOX_PROJECT_ID,
    created_at: new Date(base - (i + 1) * MINUTE).toISOString(),
    updated_at: new Date(base - (i + 1) * MINUTE).toISOString(),
    ...row,
  }));
}

// The playground's whole in-memory database: table name → rows.
export function buildSeed() {
  const db = new Map();
  for (const tables of [
    coreTables(),
    marketingTables(),
    leasingTables(),
    maintenanceTables(),
    accountingTables(),
    workspaceTables(),
  ]) {
    for (const [table, rows] of Object.entries(tables)) {
      db.set(table, [...(db.get(table) || []), ...finalize(rows)]);
    }
  }
  return db;
}
