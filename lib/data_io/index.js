import { normKey, normName } from "./values";

// Lookup index for an import (PLAT-03): the project's existing records keyed the ways a file refers to them (names, unit
// labels within a property, emails, old-system ids), plus whatever earlier rows of the same pass plan to create.
// Entry: { id, table, row (snake_case), job (importJobId), rowNo (importRowNo), planned (not in the database yet) }.

const metaOf = (r) => (r?.metadata && typeof r.metadata === "object" ? r.metadata : {});
const lower = (v) => String(v || "").trim().toLowerCase();
const extKeys = (r) => Object.entries(metaOf(r).externalIds || {}).map(([src, id]) => `${src}:${lower(id)}`);

export const extKey = (source, id) => (id ? `${source || "generic"}:${lower(id)}` : "");

const KEYS = {
  properties: { name: (r) => normName(r.name), address: (r) => normName(r.address), ext: extKeys },
  units: { label: (r) => (r.property_id ? `${r.property_id}|${normName(r.label)}` : ""), ext: extKeys },
  owners: { email: (r) => lower(r.email), name: (r) => normName(r.name), ext: extKeys },
  vendors: { email: (r) => lower(r.email), name: (r) => normName(r.name), ext: extKeys },
  tenants: { email: (r) => lower(r.email), nameUnit: (r) => `${normName(r.name)}|${r.unit_id || ""}`, name: (r) => normName(r.name), ext: extKeys },
  leases: { unitStart: (r) => (r.unit_id && r.term_start ? `${r.unit_id}|${String(r.term_start).slice(0, 10)}` : ""), unit: (r) => r.unit_id || "", tenant: (r) => r.tenant_id || "", name: (r) => normName(r.name), ext: extKeys },
  property_owners: { pair: (r) => `${r.owner_id}|${r.property_id}`, property: (r) => r.property_id || "" },
  lease_parties: { pair: (r) => `${r.lease_id}|${r.tenant_id || normName(r.name)}`, lease: (r) => r.lease_id || "" },
  portfolios: { name: (r) => normName(r.name) },
  buildings: { name: (r) => normName(r.name), scoped: (r) => `${r.property_id || ""}|${normName(r.name)}` },
  unit_types: { name: (r) => normName(r.name) },
  floor_plans: { name: (r) => normName(r.name) },
  gl_accounts: { number: (r) => normKey(r.number), name: (r) => normName(r.name), key: (r) => r.system_key || "" },
  bank_accounts: { name: (r) => normName(r.name), last4: (r) => String(r.last4 || metaOf(r).last4 || "").trim() },
};

export const INDEX_TABLES = Object.keys(KEYS);

function store(table, keyFns) {
  const maps = Object.fromEntries(Object.keys(keyFns).map((k) => [k, new Map()]));
  const byId = new Map();
  const s = {
    table,
    byId,
    all: () => [...byId.values()],
    add(entry) {
      const prev = byId.get(entry.id);
      if (prev) s.remove(prev);
      byId.set(entry.id, entry);
      for (const [k, fn] of Object.entries(keyFns)) {
        for (const key of [fn(entry.row)].flat()) {
          if (!key) continue;
          if (!maps[k].has(key)) maps[k].set(key, []);
          maps[k].get(key).push(entry);
        }
      }
      return entry;
    },
    remove(entry) {
      byId.delete(entry.id);
      for (const m of Object.values(maps)) for (const [key, list] of m) m.set(key, list.filter((e) => e !== entry));
    },
    find: (k, key) => (key ? maps[k]?.get(key) || [] : []),
    first: (k, key) => (key ? maps[k]?.get(key)?.[0] || null : null),
    get: (id) => (id ? byId.get(id) || null : null),
  };
  return s;
}

// Index over { [table]: rows } (snake_case rows, soft-deleted ones already left out).
export function buildIndex(existing = {}) {
  const ix = {};
  for (const [table, keys] of Object.entries(KEYS)) {
    ix[table] = store(table, keys);
    for (const row of existing[table] || []) {
      const m = metaOf(row);
      ix[table].add({ id: row.id, table, row, job: m.importJobId || null, rowNo: m.importRowNo ?? null, planned: false });
    }
  }
  return ix;
}

// Add a planned record (the row this pass will insert) so later rows resolve against it.
export const planEntry = (ix, table, row, { job, rowNo }) => ix[table].add({ id: row.id, table, row, job, rowNo, planned: true });
