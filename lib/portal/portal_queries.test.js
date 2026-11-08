import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

// PLAT-01e/01h: every service-role query in lib/portal stays inside the member's project — forProject(…), rowsIn({ projectId }),
// a project-id list, or an insert whose row carries project_id. The rest say why with a "Cross-project by design" comment.

const DIR = path.resolve("lib/portal");
const EXCEPTION = /cross-project by design/i;
const CALL = /\b(?:admin|db|ctx\.admin)(?:\.schema\([^)]*\))?\s*\.from\(/;

// One problem per query in `source` that isn't scoped or explained.
export function portalQueryIssues(name, source) {
  const lines = source.split(/\r?\n/);
  const issues = [];
  lines.forEach((line, i) => {
    if (!CALL.test(line) || /^\s*\/\//.test(line)) return;
    const end = lines.findIndex((l, j) => j >= i && l.includes(";"));
    const statement = lines.slice(i, end < 0 ? i + 1 : end + 1).join("\n");
    const before = line.slice(0, line.search(CALL));
    if (before.includes("forProject(")) return;
    if (/\.in\("project_id",/.test(statement)) return;
    if (/\.insert\(/.test(statement) && lines.slice(Math.max(0, i - 40), i).some((l) => /\bproject_id\s*:/.test(l))) return;
    if (lines.slice(Math.max(0, i - 4), i).some((l) => /^\s*\/\//.test(l) && EXCEPTION.test(l))) return;
    issues.push(`${name}:${i + 1} ${line.trim().slice(0, 100)}`);
  });
  return issues;
}

test("portal: every lib/portal query is scoped to the member's project or explains why not", () => {
  const issues = [];
  for (const file of readdirSync(DIR).filter((f) => f.endsWith(".js") && !f.endsWith(".test.js"))) {
    issues.push(...portalQueryIssues(file, readFileSync(path.join(DIR, file), "utf8")));
  }
  assert.deepEqual(issues, []);
});

test("portal: the scan flags an unscoped read and accepts the scoped forms", () => {
  const flagged = portalQueryIssues("x.js", 'const r = await admin.from("tenants").select("*").eq("id", id);');
  assert.equal(flagged.length, 1);
  assert.deepEqual(portalQueryIssues("x.js", 'const r = await forProject(admin.from("tenants").select("*"), projectId).eq("id", id);'), []);
  assert.deepEqual(portalQueryIssues("x.js", 'const q = admin.from("settings").select("*").in("project_id", ids);'), []);
  assert.deepEqual(portalQueryIssues("x.js", 'const row = { project_id: ctx.projectId };\nawait ctx.admin.from("work_orders").insert(row).select("*").single();'), []);
  assert.equal(portalQueryIssues("x.js", 'const row = { name: "x" };\nawait ctx.admin.from("work_orders").insert(row);').length, 1);
  assert.deepEqual(portalQueryIssues("x.js", '// Cross-project by design: sign-in looks up every membership.\nconst m = await admin.from("portal_members").select("*").eq("email", e);'), []);
  assert.deepEqual(portalQueryIssues("x.js", "const bytes = Buffer.from(buf);\nawait admin.storage.from(BUCKET).upload(p, bytes);"), []);
});
