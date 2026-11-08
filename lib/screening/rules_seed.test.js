import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { JURISDICTION_CODE, RULE_STATUSES, RULE_TOPICS, normalizeScreeningRule, validateEffects } from "./rules_schema";
import { jurisdictionCodesFor, mergeEffects, withShadowing } from "./jurisdictions";
import { feeWarnings, hiddenApplicantFields, packageChecks } from "./rules_enforcement";

// The shared catalog seed (supabase/seeds/screening_rules): every row sourced and well-formed, and the acceptance cases hold.

const DIR = path.resolve("supabase/seeds/screening_rules");

// SQL literals of one "(...)" tuple: 'text' (with '' escapes), null, and 'json'::jsonb.
function tuple(line) {
  const out = [];
  let i = line.indexOf("(") + 1;
  while (i < line.length) {
    while (line[i] === " " || line[i] === ",") i += 1;
    if (line[i] === ")") break;
    if (line.startsWith("null", i)) {
      out.push(null);
      i += 4;
      continue;
    }
    assert.equal(line[i], "'", `unexpected token at ${i}: ${line.slice(i, i + 20)}`);
    let j = i + 1;
    let s = "";
    while (j < line.length) {
      if (line[j] === "'" && line[j + 1] === "'") {
        s += "'";
        j += 2;
      } else if (line[j] === "'") break;
      else s += line[j++];
    }
    i = j + 1;
    if (line.startsWith("::jsonb", i)) {
      out.push(JSON.parse(s));
      i += 7;
    } else out.push(s);
  }
  return out;
}

function seedRows() {
  const rows = [];
  for (const file of readdirSync(DIR).filter((f) => f.endsWith(".sql"))) {
    const sql = readFileSync(path.join(DIR, file), "utf8");
    const cols = sql.match(/insert into property\.screening_rules \(([^)]+)\) values/)[1].split(",").map((c) => c.trim());
    for (const line of sql.split("\n").filter((l) => l.startsWith("  ('"))) {
      const vals = tuple(line);
      assert.equal(vals.length, cols.length, `column count in ${line.slice(0, 80)}`);
      rows.push(Object.fromEntries(cols.map((c, k) => [c, vals[k]])));
    }
  }
  return rows;
}

const ROWS = seedRows();
const CATALOG = ROWS.map(normalizeScreeningRule);
const AS_OF = "2026-11-08";
const at = (property) => {
  const codes = jurisdictionCodesFor(property);
  return mergeEffects(withShadowing(CATALOG.filter((r) => codes.includes(r.jurisdictionCode))), { asOf: AS_OF });
};

test("seed: every shared rule is well-formed, unique and sourced", () => {
  assert.ok(ROWS.length >= 25, `${ROWS.length} rows`);
  const ids = new Set();
  const keys = new Set();
  for (const r of ROWS) {
    const name = `${r.jurisdiction_code}/${r.rule_key}`;
    assert.ok(!ids.has(r.id), `duplicate id ${name}`);
    assert.ok(!keys.has(name), `duplicate key ${name}`);
    ids.add(r.id);
    keys.add(name);
    assert.match(r.jurisdiction_code, JURISDICTION_CODE, name);
    assert.ok(RULE_TOPICS.includes(r.topic), name);
    assert.ok(RULE_STATUSES.includes(r.status), name);
    assert.equal(r.enforcement, "warn", `${name}: the catalog only warns`);
    assert.deepEqual(validateEffects(r.effects).problems, [], name);
    assert.match(r.source_url || "", /^https:\/\//, `${name}: source link`);
    assert.match(r.verified_on || "", /^\d{4}-\d{2}-\d{2}$/, `${name}: date checked`);
    assert.ok(["verified", "checked", "unverifiable"].includes(r.verification), name);
    assert.ok(r.citation, `${name}: citation`);
    assert.ok(Array.isArray(r.metadata.read) && r.metadata.read.length, `${name}: what was read`);
  }
});

test("seed: Oakland excludes criminal checks from every package and hides the conviction question", () => {
  const oakland = at({ city: "Oakland", state: "CA", county: "Alameda" });
  assert.equal(oakland.values.criminal.allowed, false);
  assert.deepEqual(packageChecks(oakland).excluded.map((x) => x.key), ["background"]);
  assert.ok(hiddenApplicantFields(oakland).some((h) => h.key === "felonyDisclosed"));
  assert.ok(oakland.fields["criminal.allowed"].sources.some((s) => s.jurisdictionCode === "US-CA-OAKLAND" && s.wins));
});

test("seed: NYC criminal history waits for a conditional offer", () => {
  const nyc = at({ city: "Brooklyn", state: "NY", zip: "11201" });
  assert.equal(nyc.values.criminal.timing, "after_conditional_offer");
  assert.deepEqual(packageChecks(nyc).deferred.map((x) => x.key), ["background"]);
});

test("seed: a California application fee above the cap is flagged", () => {
  const ca = at({ city: "Fresno", state: "CA" });
  const cap = ca.values.fees.cap;
  assert.equal(typeof cap, "number");
  assert.equal(feeWarnings(cap + 10, ca).filter((w) => w.severity === "warn").length, 1);
  assert.equal(feeWarnings(cap, ca).filter((w) => w.severity === "warn").length, 0);
});

test("seed: HUD's withdrawn criminal-records guidance shows as withdrawn and changes no outcome", () => {
  const hud = CATALOG.find((r) => r.ruleKey === "hud_ogc_criminal_records_guidance");
  assert.equal(hud.status, "withdrawn");
  const property = { city: "Tacoma", state: "WA", county: "Pierce" };
  const withIt = at(property);
  const codes = jurisdictionCodesFor(property);
  const without = mergeEffects(CATALOG.filter((r) => codes.includes(r.jurisdictionCode) && r.id !== hud.id), { asOf: AS_OF });
  assert.deepEqual(withIt.values, without.values);
  assert.ok(withIt.ignored.some((x) => x.id === hud.id && x.reason === "withdrawn"));
});
