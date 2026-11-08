// storage-migrate from the command line (PLAT-01g) with the service role from .env. A dry run unless --apply.
//   node --import ./supabase/seeds/demo_project/generate/loader.mjs scripts/storage_migrate.mjs [--project <id>] [--cleanup] [--apply] [--json]
// No --project: every project (dry runs only). --apply needs --project; a copy runs through the job runner (logged in job_runs like Run now);
// --cleanup --apply refuses until 14 days after the project's first copy run and only ever removes products/property/… objects.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { adminClient } from "@/lib/supabase/admin";
import { executeJob } from "@/lib/jobs/execute";
import { runStorageMigrate, storageMigrateJob } from "@/lib/jobs/storage_migrate";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
try {
  process.loadEnvFile(path.join(ROOT, ".env"));
} catch {
  /* env already set */
}

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const projectId = args.includes("--project") ? args[args.indexOf("--project") + 1] : null;
const mode = flag("cleanup") ? "cleanup" : "copy";
const apply = flag("apply");

if (apply && !/^[0-9a-f-]{36}$/i.test(projectId || "")) {
  console.error("--apply needs --project <project id>.");
  process.exit(1);
}
const admin = adminClient({ source: "job:storage-migrate" });
if (!admin) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(1);
}

const result =
  apply && mode === "copy"
    ? await executeJob(storageMigrateJob, { admin, projectId, trigger: "manual" })
    : await runStorageMigrate({ admin, projectId, mode, dryRun: !apply });

if (flag("json")) {
  console.log(JSON.stringify(result, null, 1));
} else {
  console.log(`storage-migrate ${mode}${apply ? "" : " (dry run)"} · ${projectId || "every project"}`);
  for (const r of result.rows || []) {
    const files = (r.copies || r.removes || []).map((c) => (typeof c === "string" ? c : `${c.src} → ${c.bucket}/${c.dest}`));
    console.log(`  ${r.table} ${r.id}${r.deleted ? " (deleted)" : ""}: ${r.status}${files.length ? `\n    ${files.join("\n    ")}` : ""}`);
  }
  for (const u of result.unhandled || []) console.log(`  unhandled ${u.table} ${u.id}: ${u.columns.join(", ")}`);
  for (const m of result.missing || []) console.log(`  missing original ${m.src} (${m.table} ${m.id})`);
  console.log(`processed ${result.processed} · ${mode === "copy" ? "copied" : "removed"} ${result.created} · skipped ${result.skipped} · errors ${result.errors?.length || 0}`);
  for (const e of result.errors || []) console.log(`  error: ${typeof e === "string" ? e : e.message}`);
  if (result.status) console.log(`job run ${result.runId || "-"}: ${result.status}${result.reason ? ` (${result.reason})` : ""}`);
}
process.exit(result.errors?.length ? 1 : 0);
