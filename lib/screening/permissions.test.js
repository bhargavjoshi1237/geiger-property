import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { permissionKeys } from "@geiger/rbac";

import rbacConfig, { SENSITIVE_KEYS, isSensitiveKey, parentKeyOf, sectionKeyOf } from "@/geiger-rbac.config";
import { makeAuthorizer, navPermissionKey, planRoleSync } from "@/lib/rbac";
import { DECISION_META_KEYS, SCREENING_META_KEYS, SCREENING_PERMISSIONS } from "./permissions";
import { buildScreeningReport } from "./report";

// RISK-03: screening keys, deny-by-default for sensitive keys, and the database gates on applications and criteria.

const ALL_KEYS = permissionKeys(rbacConfig);
const APPLICATIONS = navPermissionKey("Applications");
const SETTINGS = "property.settings.manage";
const { order, viewReports, decide, adverseAction, fraudReview, criteria } = SCREENING_PERMISSIONS;
const SCREENING_KEYS = Object.values(SCREENING_PERMISSIONS);
const system = (key) => rbacConfig.systemRoles.find((r) => r.key === key);
const role = (id, permissions, extra = {}) => ({ id, key: id, name: id, permissions, ...extra });
const grant = (roleId) => ({ id: `g-${roleId}`, roleId, status: "active" });
const before = ALL_KEYS.filter((k) => !SCREENING_KEYS.includes(k));

test("catalog: the six screening keys in one group, with their parents", () => {
  for (const key of SCREENING_KEYS) {
    const p = rbacConfig.byKey.get(key);
    assert.ok(p, `${key} is in the catalog`);
    assert.equal(p.group, "Screening controls", key);
  }
  assert.equal(parentKeyOf(order), APPLICATIONS);
  assert.equal(parentKeyOf(decide), APPLICATIONS);
  assert.equal(parentKeyOf(adverseAction), decide);
  assert.equal(parentKeyOf(fraudReview), decide);
  assert.equal(parentKeyOf(criteria), SETTINGS);
  assert.equal(parentKeyOf(viewReports), null, "a sensitive key never inherits");
  // Parents precede their children, so a sync resolves decide before adverse_action and fraud_review.
  assert.ok(ALL_KEYS.indexOf(decide) < ALL_KEYS.indexOf(adverseAction) && ALL_KEYS.indexOf(decide) < ALL_KEYS.indexOf(fraudReview));
});

test("sensitive: only view_reports, and no system role holds a sensitive key except through Owner's *", () => {
  assert.deepEqual([...SENSITIVE_KEYS], [viewReports]);
  assert.equal(isSensitiveKey(viewReports), true);
  assert.equal(isSensitiveKey(order), false);
  for (const r of rbacConfig.systemRoles) {
    if (r.key === "owner") assert.deepEqual(r.permissions, ["*"]);
    else for (const k of SENSITIVE_KEYS) assert.ok(!r.permissions.includes(k), `${r.key} holds ${k}`);
  }
});

test("system roles: who holds which screening key", () => {
  const holds = (key) => SCREENING_KEYS.filter((k) => system(key).permissions.includes(k));
  assert.deepEqual(holds("admin"), [order, decide, adverseAction, fraudReview, criteria]);
  assert.deepEqual(holds("manager"), [order, decide, adverseAction, fraudReview, criteria]);
  assert.deepEqual(holds("leasing_agent"), [order, decide, adverseAction]);
  assert.deepEqual(holds("maintenance_tech"), []);
  assert.deepEqual(holds("accountant"), []);
});

test("authorizer: * grants everything; without an explicit grant view_reports is denied", () => {
  const roles = [
    role("owner", ["*"]),
    role("manager", system("manager").permissions),
    role("leasing_agent", system("leasing_agent").permissions),
    role("reviewer", [APPLICATIONS, order, viewReports]),
  ];
  const as = (id) => makeAuthorizer({ config: rbacConfig, roles, grants: [grant(id)] });
  for (const key of SCREENING_KEYS) assert.equal(as("owner").can(key), true, `owner ${key}`);
  assert.equal(as("manager").can(viewReports), false);
  assert.equal(as("manager").can(decide), true);
  assert.equal(as("leasing_agent").can(viewReports), false);
  assert.equal(as("leasing_agent").can(order), true);
  assert.equal(as("leasing_agent").can(criteria), false);
  assert.equal(as("reviewer").can(viewReports), true, "an explicit tick grants it");
  assert.equal(as("reviewer").can(decide), false);
});

test("sync: roles saved before RISK-03 inherit the screening keys but never view_reports", () => {
  const known = { propertyKnown: before };
  const seeded = rbacConfig.systemRoles.map((r) => role(r.key, r.permissions.filter((k) => !SCREENING_KEYS.includes(k)), known));
  const custom = role("front_desk", [navPermissionKey("Marketing & Leads"), APPLICATIONS], known);
  const office = role("office_admin", [APPLICATIONS, SETTINGS], known);
  const { inserts, updates } = planRoleSync([...seeded, custom, office], rbacConfig, parentKeyOf, sectionKeyOf, isSensitiveKey);
  assert.equal(inserts.length, 0);
  const gained = (id) => SCREENING_KEYS.filter((k) => updates.find((u) => u.id === id)?.permissions.includes(k));
  assert.deepEqual(gained("front_desk"), [order, decide, adverseAction, fraudReview]);
  assert.deepEqual(gained("office_admin"), [order, decide, adverseAction, fraudReview, criteria]);
  assert.deepEqual(gained("manager"), [order, decide, adverseAction, fraudReview, criteria]);
  assert.deepEqual(gained("leasing_agent"), [order, decide, adverseAction]);
  assert.deepEqual(gained("maintenance_tech"), []);
  for (const u of updates) {
    assert.ok(!u.permissions.includes(viewReports), `${u.id} gained view_reports`);
    assert.equal(u.propertyKnown.length, ALL_KEYS.length, `${u.id} decided the whole catalog`);
  }
  // The skip is the guard: even a parent that would grant it is ignored for sensitive keys.
  const leaky = (k) => (k === viewReports ? APPLICATIONS : parentKeyOf(k));
  const guarded = planRoleSync([custom], rbacConfig, leaky, sectionKeyOf, isSensitiveKey).updates[0];
  assert.ok(!guarded.permissions.includes(viewReports));
  const unguarded = planRoleSync([custom], rbacConfig, leaky, sectionKeyOf).updates[0];
  assert.ok(unguarded.permissions.includes(viewReports), "without the sensitive check the leaky parent would grant it");
});

test("sync: a fresh project's seeded roles hold view_reports only through Owner's *", () => {
  const { inserts } = planRoleSync([], rbacConfig, parentKeyOf, sectionKeyOf, isSensitiveKey);
  for (const r of inserts) assert.equal(r.permissions.includes(viewReports), false, r.key);
  const roles = inserts.map((r) => role(r.key, r.permissions));
  assert.equal(makeAuthorizer({ config: rbacConfig, roles, grants: [grant("owner")] }).can(viewReports), true);
  assert.equal(makeAuthorizer({ config: rbacConfig, roles, grants: [grant("admin")] }).can(viewReports), false);
});

// The newest @up definition of a property function, comments stripped and whitespace collapsed.
const DIR = path.resolve("supabase/migrations");
const ups = () =>
  readdirSync(DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => {
      const sql = readFileSync(path.join(DIR, f), "utf8");
      const up = sql.includes("-- @up") ? sql.split("-- @up")[1].split("-- @down")[0] : sql;
      return { name: f, up: up.replace(/--[^\n]*/g, "").replace(/\s+/g, " ").toLowerCase() };
    });
function latest(fn) {
  let found = null;
  for (const m of ups()) {
    const at = m.up.lastIndexOf(`create or replace function property.${fn}(`);
    if (at >= 0) found = { name: m.name, body: m.up.slice(at, m.up.indexOf("$$;", m.up.indexOf("$$", at) + 2) + 3) };
  }
  return found;
}

test("database gates: decisions need screening.decide and screening records screening.order, for client writes", () => {
  const guard = latest("guard_application_screening");
  assert.ok(guard, "guard_application_screening is defined");
  assert.match(guard.body, /security invoker/);
  assert.match(guard.body, /current_user not in \('anon', 'authenticated'\)/);
  assert.match(guard.body, /property\.rbac_allows\('property\.screening\.decide', new\.project_id\)/);
  assert.match(guard.body, /property\.rbac_allows\('property\.screening\.order', new\.project_id\)/);
  // The metadata the trigger watches is the metadata the app treats as screening and decision records.
  const arrays = [...guard.body.matchAll(/foreach v_key in array array\[([^\]]*)\]/g)].map((m) => [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]));
  assert.deepEqual(arrays, [DECISION_META_KEYS.map((k) => k.toLowerCase()), SCREENING_META_KEYS.map((k) => k.toLowerCase())]);
  const all = ups();
  const at = all.findIndex((m) => m.up.includes("create or replace trigger applications_screening_gate before insert or update on property.applications"));
  assert.ok(at >= 0, "applications_screening_gate is created");
  assert.ok(!all.slice(at + 1).some((m) => /drop trigger (if exists )?applications_screening_gate/.test(m.up)), "no later migration drops it");
});

test("database gates: the screening_criteria setting needs screening.criteria", () => {
  const def = latest("settings_write_permission");
  assert.match(def.body, /when p_key = 'screening_criteria' then 'property\.screening\.criteria'/, `${def.name} reopens screening_criteria`);
  assert.ok(!/in \('onboarding', 'screening_criteria'\) then null/.test(def.body));
});

test("ui keys: every SCREENING_PERMISSIONS value is a catalog key", () => {
  for (const key of SCREENING_KEYS) assert.ok(ALL_KEYS.includes(key), key);
});

test("report: the recorded checks, findings and co-applicants", () => {
  const app = {
    id: "a1",
    name: "Andre Mitchell",
    status: "Screening",
    metadata: {
      screeningVendor: "Manual review",
      screeningReference: "MR-2210",
      screeningConsent: true,
      screeningConsentOn: "2026-10-17",
      screening: { credit: { status: "Complete", result: "Meets criteria", score: 712, notes: "" }, income: { status: "In progress", notes: "Second pay stub due." } },
    },
  };
  const r = buildScreeningReport(app, [{ id: "c1", name: "Laura", status: "Requested", metadata: { role: "tenant", screeningNotes: "Pending" } }]);
  assert.equal(r.reference, "MR-2210");
  assert.equal(r.consent, true);
  assert.deepEqual(r.checks.map((c) => c.key), ["background", "credit", "eviction", "income"]);
  const credit = r.checks.find((c) => c.key === "credit");
  assert.deepEqual([credit.status, credit.result, credit.score], ["Complete", "Meets criteria", 712]);
  assert.equal(r.checks.find((c) => c.key === "income").findings, "Second pay stub due.");
  assert.equal(r.checks.find((c) => c.key === "background").status, "Not started");
  assert.equal(r.checks.find((c) => c.key === "eviction").score, null, "unscored checks carry no score");
  assert.deepEqual(r.coApplicants, [{ id: "c1", name: "Laura", role: "tenant", status: "Requested", findings: "Pending" }]);
  assert.equal(buildScreeningReport({ id: "a2", metadata: {} }).consent, false);
});
