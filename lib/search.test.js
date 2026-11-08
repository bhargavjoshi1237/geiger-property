import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { navPermissionKey, sectionKeyOf } from "@/geiger-rbac.config";
import { filterNavByAccess } from "@/lib/nav-access";
import { moduleHiddenTitles } from "@/lib/modules";
import { NAV_TREE } from "@/lib/workspace/nav_tree";
import {
  MAX_PER_TYPE,
  RECORD_ENTRY_PREFIX,
  RECORD_TYPES,
  recordItems,
  recordTypesFor,
  searchNeedle,
  searchRecordsIn,
  withoutRecordIds,
} from "./search.js";

const ALL = RECORD_TYPES.map((t) => t.type);
const P = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

// The nav a viewer sees: pages hidden by off modules, then the pages their role can't view.
const navFor = ({ modules = null, denied = [] } = {}) => {
  const hidden = new Set(moduleHiddenTitles(NAV_TREE, modules));
  const onModules = NAV_TREE.filter((i) => !hidden.has(i.title)).map((i) =>
    i.subItems ? { ...i, subItems: i.subItems.filter((s) => !hidden.has(s.title)) } : i,
  );
  return filterNavByAccess(onModules, (title) => !denied.includes(title));
};

test("record types: every type opens a real nav page", () => {
  const titles = new Set(NAV_TREE.flatMap((i) => [i.title, ...(i.subItems || []).map((s) => s.title)]));
  for (const t of RECORD_TYPES) assert.ok(titles.has(t.tab), `${t.type} → ${t.tab}`);
  assert.deepEqual(recordTypesFor(navFor()), ALL);
});

test("record types: a switched-off module hides its record types", () => {
  const types = recordTypesFor(navFor({ modules: { leasing: false } }));
  assert.ok(!types.includes("prospect") && !types.includes("application"));
  assert.ok(types.includes("tenant") && types.includes("lease"));
});

test("record types: pages the role can't view hide their types", () => {
  const types = recordTypesFor(navFor({ denied: ["Owners", "Bills & Payables"] }));
  assert.ok(!types.includes("owner") && !types.includes("bill"));
  assert.deepEqual(recordTypesFor(navFor({ denied: ["People"] })).filter((t) => ["tenant", "owner", "vendor"].includes(t)), []);
  assert.deepEqual(recordTypesFor([]), []);
});

test("needle: trims, needs two characters, and reads phone-shaped queries as digits", () => {
  assert.equal(searchNeedle(" a "), null);
  assert.equal(searchNeedle(null), null);
  assert.equal(searchNeedle("Maya"), "maya");
  assert.equal(searchNeedle("555-1237"), "5551237");
  assert.equal(searchNeedle("(206) 555"), "206555");
  assert.equal(searchNeedle("A-101"), "a-101");
  assert.equal(searchNeedle("12"), "12");
});

test("palette entries: grouped by type, subtitle folded in, opened through onOpen", () => {
  const opened = [];
  const items = recordItems(
    [
      { id: "t1", type: "tenant", title: "Maya Chen", subtitle: "The Marlowe · A-101", keywords: "maya.chen@mail.example" },
      { id: "w1", type: "work_order", title: "Leak", subtitle: null, keywords: "leak" },
      { id: "x1", type: "ledger_line", title: "Hidden" },
      { type: "tenant", title: "No id" },
    ],
    { iconOf: (tab) => `icon:${tab}`, onOpen: (tab, id) => opened.push([tab, id]) },
  );
  assert.deepEqual(
    items.map(({ id, title, group, icon, keywords }) => ({ id, title, group, icon, keywords })),
    [
      { id: `${RECORD_ENTRY_PREFIX}tenant:t1`, title: "Maya Chen · The Marlowe · A-101", group: "Tenants", icon: "icon:Tenants", keywords: "maya.chen@mail.example" },
      { id: `${RECORD_ENTRY_PREFIX}work_order:w1`, title: "Leak", group: "Work orders", icon: "icon:Work Orders", keywords: "leak" },
    ],
  );
  items[0].onSelect();
  assert.deepEqual(opened, [["Tenants", "t1"]]);
  const [withQuery] = recordItems([{ id: "t1", type: "tenant", title: "Maya Chen", keywords: "(206) 555-1237" }], { matched: "206-555-1237" });
  assert.equal(withQuery.keywords, "(206) 555-1237 206-555-1237", "the answered query rides along");
});

test("recents: record entries are dropped, pages kept", () => {
  assert.deepEqual(withoutRecordIds(["Overview", `${RECORD_ENTRY_PREFIX}tenant:t1`, "Reports/Rent Roll"]), ["Overview", "Reports/Rent Roll"]);
  assert.deepEqual(withoutRecordIds(null), []);
});

// --- The playground mirror ----------------------------------------------------------

const TABLES = {
  tenants: [
    { id: "t1", project_id: P, name: "Maya Chen", email: "maya.chen@mail.example", phone: "(206) 555-1237", unit: "The Marlowe · A-101" },
    { id: "t2", project_id: P, name: "Omar Haddad", email: "omar@mail.example", phone: "(206) 555-1422", unit: "The Marlowe · B-102" },
    { id: "t3", project_id: P, name: "Mayer Gone", deleted_at: "2026-01-01T00:00:00Z" },
    { id: "t4", project_id: OTHER, name: "Maya Elsewhere" },
    { id: "t5", project_id: P, name: "Amaya Brooks" },
  ],
  properties: [{ id: "p1", project_id: P, name: "The Marlowe", city: "Seattle", state: "WA" }],
  units: [{ id: "u1", project_id: P, label: "A-101", property_id: "p1", occupant_name: "Maya Chen" }],
  owners: [{ id: "o1", project_id: P, name: "Northwind 50%_Holdings" }],
};
const run = (args) => searchRecordsIn((table) => TABLES[table] || [], { p_project: P, ...args });

test("mirror: project-scoped, live rows only, prefix matches first", () => {
  const rows = run({ p_query: "maya", p_types: ["tenant"] });
  assert.deepEqual(rows.map((r) => r.id), ["t1", "t5"]);
  assert.deepEqual(run({ p_query: "maya", p_project: OTHER, p_types: ["tenant"] }).map((r) => r.id), ["t4"]);
  assert.deepEqual(run({ p_query: "maya", p_project: null }), []);
});

test("mirror: phone digits, email and the unit's property name", () => {
  assert.deepEqual(run({ p_query: "555-1237" }).map((r) => r.id), ["t1"]);
  assert.deepEqual(run({ p_query: "5551237" }).map((r) => r.id), ["t1"]);
  assert.deepEqual(run({ p_query: "omar@mail" }).map((r) => r.id), ["t2"]);
  const [unit] = run({ p_query: "a-101", p_types: ["unit"] });
  assert.deepEqual(unit, { id: "u1", type: "unit", title: "A-101", subtitle: "The Marlowe", keywords: "A-101 Maya Chen" });
  assert.equal(run({ p_query: "the marlowe", p_types: ["property"] })[0].subtitle, "Seattle, WA");
});

test("mirror: types, the per-type cap and literal wildcards", () => {
  assert.deepEqual([...new Set(run({ p_query: "maya" }).map((r) => r.type))], ["tenant", "unit"]);
  assert.equal(run({ p_query: "ma", p_types: ["tenant"], p_limit: 1 }).length, 1);
  assert.equal(run({ p_query: "ma", p_types: ["tenant"], p_limit: 999 }).length, 3);
  assert.ok(MAX_PER_TYPE >= 3);
  assert.deepEqual(run({ p_query: "50%_h" }).map((r) => r.id), ["o1"]);
  assert.deepEqual(run({ p_query: "5%h" }), []);
});

// --- Parity with the migration ----------------------------------------------------

const MIGRATIONS = path.resolve("supabase/migrations");
const searchMigration = () => {
  const file = readdirSync(MIGRATIONS).filter((f) => /_global_record_search\.sql$/.test(f)).sort().at(-1);
  return readFileSync(path.join(MIGRATIONS, file), "utf8").split("-- @up")[1].split("-- @down")[0];
};
// Column order of a haystack expression; the digits-only phone reads as "phone_digits".
const columnsOf = (expr) =>
  [...expr.matchAll(/regexp_replace\(coalesce\((?:t\.)?(\w+)|coalesce\((?:t\.)?(\w+)/g)].map((m) => (m[1] ? `${m[1]}_digits` : m[2]));

test("parity: each table's trigram index and the function's haystack search the same columns as lib/search.js", () => {
  const up = searchMigration();
  const indexes = new Map([...up.matchAll(/create index if not exists \w+ on property\.(\w+) using gin \(\(([\s\S]*?)\) public\.gin_trgm_ops\)/g)].map((m) => [m[1], columnsOf(m[2])]));
  const haystacks = new Map(
    [...up.matchAll(/'(\w+)'::text[\s\S]*?from property\.(\w+) t\b[\s\S]*?cross join lateral \(select([\s\S]*?) as hay\) h/g)].map((m) => [m[1], { table: m[2], cols: columnsOf(m[3]) }]),
  );
  assert.deepEqual([...haystacks.keys()], ALL, "the function searches every type, in catalogue order");
  for (const spec of RECORD_TYPES) {
    assert.deepEqual(indexes.get(spec.table), spec.fields, `${spec.table} index`);
    assert.equal(haystacks.get(spec.type).table, spec.table);
    assert.deepEqual(haystacks.get(spec.type).cols, spec.fields, `${spec.type} haystack`);
  }
});

test("parity: each type checks its page's view key and that page's section key", () => {
  const up = searchMigration();
  for (const spec of RECORD_TYPES) {
    const m = up.match(new RegExp(`'${spec.type}' = any\\(p_types\\)\\)\\s+and property\\.rbac_allows\\('([^']+)', p_project\\)\\s+and property\\.rbac_allows\\('([^']+)', p_project\\)`));
    assert.ok(m, `${spec.type} is gated`);
    const page = navPermissionKey(spec.tab);
    assert.deepEqual([m[1], m[2]], [page, sectionKeyOf(page)], `${spec.type} → ${spec.tab}`);
  }
});
