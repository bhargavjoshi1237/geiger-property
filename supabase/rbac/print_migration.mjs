// Writes a migration body that regenerates the SQL copy of the system roles from geiger-rbac.config.js.
// Usage: npm run db:new -- rbac_system_roles, then npm run rbac:sql -- supabase/migrations/<that file> (no path: stdout).
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import rbacConfig from "@/geiger-rbac.config";
import { latestSystemRolesSql, systemRolesMigration } from "@/lib/rbac_sql";

const dir = path.resolve("supabase/migrations");
const target = process.argv[2] ? path.resolve(process.argv[2]) : null;
const files = readdirSync(dir, { recursive: true })
  .filter((f) => String(f).endsWith(".sql") && path.resolve(dir, String(f)) !== target)
  .map((f) => ({ name: path.basename(String(f)), sql: readFileSync(path.join(dir, String(f)), "utf8") }));
const body = systemRolesMigration(rbacConfig, latestSystemRolesSql(files));
if (target) writeFileSync(target, body);
else process.stdout.write(body);
