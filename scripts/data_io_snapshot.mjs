// Refreshes lib/data_io/schema_snapshot.json from information_schema (read-only): node scripts/data_io_snapshot.mjs
import fs from "node:fs";
import pg from "pg";

const env = fs.readFileSync(new URL("../.env", import.meta.url), "utf8");
const uri = env.match(/^STRING_URI=(.*)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "");
if (!uri) throw new Error("STRING_URI missing from .env");

const TABLES = ["properties", "units", "owners", "vendors", "tenants", "leases", "portfolios"];
const client = new pg.Client({ connectionString: uri, ssl: { rejectUnauthorized: false } });
await client.connect();
const { rows } = await client.query(
  `select table_name, column_name, udt_name, is_nullable = 'YES' as nullable, column_default is not null as has_default
   from information_schema.columns where table_schema = 'property' and table_name = any($1)
   order by table_name, ordinal_position`,
  [TABLES],
);
await client.end();

const snap = {};
for (const r of rows) (snap[r.table_name] ??= {})[r.column_name] = { type: r.udt_name, nullable: r.nullable, hasDefault: r.has_default };
fs.writeFileSync(new URL("../lib/data_io/schema_snapshot.json", import.meta.url), JSON.stringify(snap, null, 1) + "\n");
console.log(`wrote ${rows.length} columns for ${Object.keys(snap).length} tables`);
