// Generates the demo project seed (supabase/seeds/demo_project/*.sql) from the
// playground portfolio plus areas/*.mjs, validated against the live schema.
//
//   node --import ./supabase/seeds/demo_project/generate/loader.mjs \
//        supabase/seeds/demo_project/generate/index.mjs [--check] [--out <dir>]
//
// --check validates and prints the report without writing; --out writes elsewhere.
// Reads the schema over STRING_URI (read-only), then `npm run db:seed -- demo_project`.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";
import { buildDataset, finalize, remap } from "./build.mjs";
import { loadSchema, validate } from "./schema.mjs";
import { emitFiles } from "./emit.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../../..");
const args = process.argv.slice(2);
const check = args.includes("--check");
const outDir = args.includes("--out") ? path.resolve(args[args.indexOf("--out") + 1]) : path.resolve(HERE, "..");

dotenv.config({ path: path.join(ROOT, ".env"), quiet: true });
dotenv.config({ path: path.join(ROOT, ".env.local"), override: true, quiet: true });

const client = new pg.Client({ connectionString: process.env.STRING_URI, ssl: { rejectUnauthorized: false } });
await client.connect();
const schema = await loadSchema(client).finally(() => client.end());

const db = remap(finalize(await buildDataset(), schema));
const { errors, warnings } = validate(db, schema);
const { files, unplaced } = emitFiles(db, schema);
for (const t of unplaced) errors.push(`${t}: has rows but no slot in config FILES`);

const counts = [...db].filter(([, r]) => r.length).map(([t, r]) => `${t} ${r.length}`);
console.log(`${counts.length} tables, ${files.reduce((s, f) => s + f.count, 0)} rows\n  ${counts.join(" · ")}`);
for (const w of warnings) console.log(`warn  ${w}`);
for (const e of errors) console.log(`ERROR ${e}`);
if (errors.length) {
  console.log(`\n${errors.length} error(s) — nothing written.`);
  process.exit(1);
}
if (check) {
  console.log("\nCheck passed (nothing written).");
} else {
  fs.mkdirSync(outDir, { recursive: true });
  for (const f of files) fs.writeFileSync(path.join(outDir, f.name), f.sql);
  console.log(`\nWrote ${files.map((f) => f.name).join(", ")} → ${path.relative(ROOT, outDir) || outDir}`);
}
