import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

// PLAT-01b/01h: no read falls back to project-less rows. Only these reads may ask for `project_id is null`, each for rows that
// belong to no project by design; a new one fails here until it is justified and listed.
const ALLOWED = {
  "lib/supabase/scope.js": { lines: 1, why: "scopeReference: the global legal_* reference rows" },
  "lib/billing/late_fees.js": { lines: 1, why: "late-fee guidance: global legal_* reference rows" },
  "lib/billing/move_out.js": { lines: 1, why: "deposit-return guidance: global legal_* reference rows" },
  "lib/screening/jurisdictions.js": { lines: 1, why: "loadScreeningRules: the shared screening_rules catalog plus the project's own rules (RISK-05)" },
  "lib/jobs/execute.js": { lines: 2, why: "the scheduler's own cross-project parent rows and their legacy review items" },
  "lib/jobs/alerts.js": { lines: 1, why: "operator alert dedupe on the scheduler's parent rows" },
  "lib/jobs/status.js": { lines: 1, why: "scheduler liveness from its parent cron rows" },
  "lib/orchestration/review.js": { lines: 1, why: "byKey: legacy project-less job_run review items" },
  "lib/orchestration/housekeeping.js": { lines: 1, why: "wakes snoozed legacy project-less job_run review items" },
  "lib/operator/events.js": { lines: 1, why: "the operator view of the scheduler's failed parent runs" },
};

const NULL_PROJECT = /project_id\.is\.null|\.is\(\s*["']project_id["']\s*,\s*null\s*\)/;
const ROOTS = ["app", "components", "context", "lib"];

function files(rel, out = []) {
  for (const name of readdirSync(rel)) {
    const p = path.join(rel, name);
    if (statSync(p).isDirectory()) files(p, out);
    else if (/\.(js|jsx|mjs)$/.test(name) && !/\.test\.m?js$/.test(name)) out.push(p.split(path.sep).join("/"));
  }
  return out;
}

// file → number of code lines (comments stripped) that read project-less rows.
function nullProjectReads() {
  const out = {};
  for (const file of ROOTS.flatMap((r) => files(r))) {
    const code = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").split(/\r?\n/).map((l) => l.replace(/\/\/.*$/, ""));
    const n = code.filter((l) => NULL_PROJECT.test(l)).length;
    if (n) out[file] = n;
  }
  return out;
}

test("null project: only the listed, justified reads ask for project-less rows", () => {
  const found = nullProjectReads();
  const extra = Object.entries(found).filter(([f, n]) => !ALLOWED[f] || n > ALLOWED[f].lines).map(([f, n]) => `${f}: ${n}`);
  assert.deepEqual(extra, [], "a new project-less read: scope it with forProject/scopeQuery, or justify it in ALLOWED");
  const stale = Object.keys(ALLOWED).filter((f) => !found[f]);
  assert.deepEqual(stale, [], "ALLOWED lists a file that no longer reads project-less rows");
});
