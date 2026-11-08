import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ENTITY_ORDER, customFields, dependsOn, entityKeys, getEntity, getField, getFields, requiredFields, templateExample, templateHeaders,
} from "./schemas.js";
import { PROPERTY_STATUS_MAP, PROPERTY_TYPE_MAP, UNIT_STATUS_MAP } from "../../components/internal/screens/properties/constants.js";
import { LEASE_STATUS_MAP, LEASE_TYPE_OPTIONS, TERM_TYPE_OPTIONS } from "../../components/internal/screens/leasing/shared.js";

const snapshot = JSON.parse(readFileSync(new URL("./schema_snapshot.json", import.meta.url), "utf8"));

const DB_TYPES = {
  text: ["text"], email: ["text"], phone: ["text"], enum: ["text"], date: ["date"], boolean: ["bool"],
  integer: ["int4", "int8"], number: ["numeric"], money: ["numeric"], percent: ["numeric"], reference: ["uuid"],
};

// Schema columns for a catalogue against a { table: { column: {…} } } map (snapshot or live).
function problems(columns) {
  const out = [];
  for (const key of entityKeys()) {
    const { table, fields } = getEntity(key);
    const cols = columns[table];
    if (!cols) { out.push(`${key}: table ${table} missing`); continue; }
    for (const fld of fields) {
      const c = cols[fld.key];
      if (!c) { out.push(`${key}.${fld.key}: column missing on property.${table}`); continue; }
      if (!DB_TYPES[fld.type].includes(c.type)) out.push(`${key}.${fld.key}: ${fld.type} vs db ${c.type}`);
    }
    for (const [name, c] of Object.entries(cols)) {
      const fld = fields.find((x) => x.key === name);
      const needed = !c.nullable && !c.hasDefault && name !== "project_id";
      if (needed && !fld?.required) out.push(`${key}.${name}: NOT NULL without default but not a required catalogue field`);
    }
  }
  return out;
}

test("every catalogued field exists on the table with a compatible type (snapshot)", () => {
  assert.deepEqual(problems(snapshot), []);
});

test("the checker flags a field missing from the table", () => {
  const broken = structuredClone(snapshot);
  delete broken.units.sqft;
  assert.match(problems(broken).join("\n"), /units\.sqft: column missing/);
});

test("lookup targets and natural keys reference real fields", () => {
  for (const key of entityKeys()) {
    const e = getEntity(key);
    for (const k of e.naturalKey) assert.ok(getField(key, k), `${key} natural key ${k}`);
    for (const fld of e.fields.filter((x) => x.lookup)) {
      assert.equal(fld.type, "reference");
      for (const s of fld.lookup.scope || []) assert.ok(getField(key, s), `${key}.${fld.key} scope ${s}`);
    }
  }
});

test("entities only depend on earlier entities", () => {
  for (const key of ENTITY_ORDER) for (const d of dependsOn(key)) assert.ok(ENTITY_ORDER.indexOf(d) < ENTITY_ORDER.indexOf(key), `${key} -> ${d}`);
  assert.deepEqual(dependsOn("leases"), ["properties", "units", "tenants"]);
});

test("enums match the values the screens use", () => {
  const vals = (m) => Object.keys(m);
  assert.deepEqual(getField("properties", "type").enum, vals(PROPERTY_TYPE_MAP));
  assert.deepEqual(getField("properties", "status").enum, vals(PROPERTY_STATUS_MAP));
  assert.deepEqual(getField("units", "status").enum, vals(UNIT_STATUS_MAP));
  assert.deepEqual(getField("leases", "status").enum, vals(LEASE_STATUS_MAP));
  assert.deepEqual(getField("leases", "lease_type").enum, LEASE_TYPE_OPTIONS.map((o) => o.value));
  assert.deepEqual(getField("leases", "term_type").enum, TERM_TYPE_OPTIONS.map((o) => o.value));
});

test("every enum field has values and every field has label, type and example", () => {
  for (const key of entityKeys()) for (const fld of getFields(key)) {
    assert.ok(fld.label && fld.type && "example" in fld, `${key}.${fld.key}`);
    if (fld.type === "enum") assert.ok(fld.enum?.length, `${key}.${fld.key} enum`);
    if (fld.enum) assert.ok(fld.enum.includes(fld.example) || fld.example === "", `${key}.${fld.key} example in enum`);
  }
});

test("custom fields append as cf_<id> metadata fields", () => {
  const defs = [{ id: "ab12", label: "Gate code", type: "text", required: true }, { id: "cd34", label: "Pet", type: "select", options: ["Dog", "Cat"] }];
  const cf = customFields(defs);
  assert.deepEqual(cf.map((x) => [x.key, x.target, x.type]), [["cf_ab12", "metadata", "text"], ["cf_cd34", "metadata", "enum"]]);
  assert.deepEqual(cf[1].enum, ["Dog", "Cat"]);
  assert.equal(getFields("units", { custom: defs }).length, getFields("units").length + 2);
  assert.ok(requiredFields("units", { custom: defs }).some((x) => x.key === "cf_ab12"));
});

test("templates line up and unknown entities throw", () => {
  assert.equal(templateHeaders("units").length, templateExample("units").length);
  assert.throws(() => getEntity("nope"), /Unknown import entity/);
  assert.equal(getEntity("units").fields.length, getFields("units").length);
});

// Opt-in live check: DATA_IO_LIVE=1 npm test (read-only information_schema query).
test("catalogue matches the live database", { skip: !process.env.DATA_IO_LIVE }, async () => {
  const { default: pg } = await import("pg");
  const uri = readFileSync(new URL("../../.env", import.meta.url), "utf8").match(/^STRING_URI=(.*)$/m)[1].trim().replace(/^["']|["']$/g, "");
  const client = new pg.Client({ connectionString: uri, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const { rows } = await client.query(
      `select table_name, column_name, udt_name as type, is_nullable = 'YES' as nullable, column_default is not null as "hasDefault"
       from information_schema.columns where table_schema = 'property'`);
    const live = {};
    for (const r of rows) (live[r.table_name] ??= {})[r.column_name] = r;
    assert.deepEqual(problems(live), []);
  } finally {
    await client.end();
  }
});
