import { test } from "node:test";
import assert from "node:assert/strict";
import { permissionKeys } from "@geiger/rbac";

import rbacConfig, { parentKeyOf } from "@/geiger-rbac.config";
import { workspaceNav } from "@/components/internal/sidebar/sidebar_nav";
import {
  LEGACY_PERMISSION_KEYS,
  heldByWildcard,
  makeAuthorizer,
  navPermissionKey,
  normalizeRoleId,
  planRoleSync,
  productKeysOf,
  toPermissionKey,
  withProductKeys,
} from "./rbac";

const ALL_KEYS = permissionKeys(rbacConfig);
const titles = workspaceNav.flatMap((item) => [item.title, ...(item.subItems || []).map((s) => s.title)]);
const system = (key) => rbacConfig.systemRoles.find((r) => r.key === key);
const role = (id, permissions, extra = {}) => ({ id, key: id, name: id, permissions, ...extra });
const grant = (roleId, extra = {}) => ({ id: `g-${roleId}`, roleId, status: "active", ...extra });

test("keys: legacy short keys and view.<slug> translate to catalog keys", () => {
  assert.equal(toPermissionKey("team.assign_roles"), "property.team.assign");
  assert.equal(toPermissionKey("records.delete"), "property.record.delete");
  assert.equal(toPermissionKey("automations.manage"), "property.automation.manage");
  assert.equal(toPermissionKey("view.accounting"), "property.accounting.view");
  assert.equal(toPermissionKey("view.1099_summary"), "property.page_1099_summary.view");
  assert.equal(toPermissionKey("property.accounting.post"), "property.accounting.post");
  assert.equal(toPermissionKey("*"), "*");
  assert.equal(navPermissionKey("Move-ins & Move-outs"), "property.move_ins_move_outs.view");
});

test("catalog: every legacy key and every nav page resolves to a catalog key", () => {
  for (const legacy of Object.keys(LEGACY_PERMISSION_KEYS)) assert.ok(ALL_KEYS.includes(toPermissionKey(legacy)), legacy);
  for (const title of titles) {
    assert.ok(ALL_KEYS.includes(navPermissionKey(title)), title);
    assert.ok(ALL_KEYS.includes(toPermissionKey(`view.${normalizeRoleId(title)}`)), title);
  }
  for (const key of ["property.data.import", "property.audit.view", "property.api_key.manage", "property.payment.refund", "property.privacy.manage"]) {
    assert.ok(ALL_KEYS.includes(key), key);
  }
  assert.equal(new Set(ALL_KEYS).size, ALL_KEYS.length);
});

test("catalog: pages inherit their section, pre-01a actions their view", () => {
  assert.equal(parentKeyOf(navPermissionKey("Units")), navPermissionKey("Property"));
  assert.equal(parentKeyOf(navPermissionKey("Overview")), null);
  assert.equal(parentKeyOf("property.review.resolve"), navPermissionKey("Review Queue"));
  assert.equal(parentKeyOf("property.api_key.manage"), null);
  // Parents precede children in catalog order, which planRoleSync relies on.
  for (const key of ALL_KEYS) {
    const parent = parentKeyOf(key);
    if (parent) assert.ok(ALL_KEYS.indexOf(parent) < ALL_KEYS.indexOf(key), key);
  }
});

test("system roles: the five defaults carry today's grants, orchestrator keys included", () => {
  assert.deepEqual(rbacConfig.systemRoles.map((r) => r.key), ["owner", "manager", "leasing_agent", "maintenance_tech", "accountant"]);
  assert.deepEqual(system("owner").permissions, ["*"]);
  const manager = system("manager").permissions;
  for (const k of ["property.billing.manage", "property.role.manage", navPermissionKey("Roles & Permissions"), "property.api_key.manage", "property.privacy.manage"]) {
    assert.ok(!manager.includes(k), k);
  }
  for (const k of ["property.team.assign", "property.accounting.post", "property.automation.manage", "property.review.resolve", "property.message.send"]) {
    assert.ok(manager.includes(k), k);
  }
  const accountant = system("accountant").permissions;
  for (const k of ["property.accounting.post", "property.accounting.void", "property.payment.collect", "property.payment.refund", "property.automation.run"]) {
    assert.ok(accountant.includes(k), k);
  }
  const tech = system("maintenance_tech").permissions;
  assert.ok(tech.includes(navPermissionKey("Work Orders")) && tech.includes("property.review.resolve"));
  assert.ok(!tech.includes(navPermissionKey("Accounting")) && !tech.includes("property.accounting.post"));
  assert.ok(system("leasing_agent").permissions.includes("property.message.send"));
});

test("authorizer: fails closed without grants, legacy keys included", () => {
  const authz = makeAuthorizer({ config: rbacConfig, roles: [role("manager", system("manager").permissions)], grants: [] });
  assert.equal(authz.can("view.overview"), false);
  assert.equal(authz.can("accounting.post"), false);
  assert.equal(authz.decide("property.accounting.post").code, "no_grants");
  assert.equal(authz.isOwner, false);
});

test("authorizer: decides from the held roles; owner-grade wildcards; inactive grants ignored", () => {
  const roles = [role("owner", ["*"]), role("manager", system("manager").permissions), role("accountant", system("accountant").permissions)];
  const manager = makeAuthorizer({ config: rbacConfig, roles, grants: [grant("manager")] });
  assert.equal(manager.can("accounting.post"), true);
  assert.equal(manager.can("property.billing.manage"), false);
  assert.equal(manager.can("property.not_a.key"), false);
  assert.equal(manager.roles[0].key, "manager");

  const owner = makeAuthorizer({ config: rbacConfig, roles, grants: [grant("owner")] });
  assert.equal(owner.isOwner, true);
  assert.equal(owner.can("billing.manage"), true);

  const disabled = makeAuthorizer({ config: rbacConfig, roles, grants: [grant("accountant", { status: "inactive" })] });
  assert.equal(disabled.can("accounting.post"), false);
  assert.equal(disabled.roles.length, 0);
});

test("sync: an empty project gets the five system roles", () => {
  const { inserts, updates } = planRoleSync([], rbacConfig, parentKeyOf);
  assert.deepEqual(inserts.map((r) => r.key), ["owner", "manager", "leasing_agent", "maintenance_tech", "accountant"]);
  assert.ok(inserts.every((r) => r.isSystem && r.propertyKnown.length === ALL_KEYS.length));
  assert.equal(updates.length, 0);
});

test("sync: shared roles get Property keys merged in; other products' keys and undecided foreign roles are left alone", () => {
  const roles = [
    role("owner", ["*"]),
    role("manager", ["events.overview.view", "assets.asset.edit"]),
    role("writer", ["content.entry.edit"]),
  ];
  const { inserts, updates } = planRoleSync(roles, rbacConfig, parentKeyOf);
  assert.deepEqual(inserts.map((r) => r.key), ["leasing_agent", "maintenance_tech", "accountant"]);
  const manager = updates.find((u) => u.id === "manager");
  assert.ok(manager.permissions.includes("events.overview.view") && manager.permissions.includes("assets.asset.edit"));
  assert.deepEqual(productKeysOf(manager.permissions).sort(), [...system("manager").permissions].sort());
  assert.deepEqual(updates.find((u) => u.id === "owner").permissions, ["*"]);
  assert.equal(updates.some((u) => u.id === "writer"), false);
});

test("sync: decided keys stick, and catalog growth is inherited", () => {
  const seeded = rbacConfig.systemRoles.map((r) => role(r.key, [...r.permissions], { propertyKnown: ALL_KEYS }));
  const trimmed = seeded.map((r) => (r.key === "manager" ? { ...r, permissions: r.permissions.filter((k) => k !== "property.accounting.void") } : r));
  assert.deepEqual(planRoleSync(trimmed, rbacConfig, parentKeyOf), { inserts: [], updates: [] });

  // A custom role decided before Units and review.resolve existed inherits them from what it holds.
  const units = navPermissionKey("Units");
  const known = ALL_KEYS.filter((k) => k !== units && k !== "property.review.resolve" && k !== navPermissionKey("Leases"));
  const custom = role("regional", [navPermissionKey("Property"), navPermissionKey("Review Queue")], { propertyKnown: known });
  const [update] = planRoleSync([custom, ...seeded], rbacConfig, parentKeyOf).updates;
  assert.ok(update.permissions.includes(units));
  assert.ok(update.permissions.includes("property.review.resolve"));
  assert.ok(!update.permissions.includes(navPermissionKey("Leases")));
  assert.equal(update.propertyKnown.length, ALL_KEYS.length);
});

test("role edits: only Property's part of a shared role changes", () => {
  const shared = ["events.overview.view", "property.units.view", "property.accounting.*", "*"];
  assert.deepEqual(withProductKeys(shared, ["property.leases.view"]), ["events.overview.view", "property.accounting.*", "*", "property.leases.view"]);
  assert.deepEqual(productKeysOf(shared), ["property.units.view"]);
  assert.equal(heldByWildcard(["property.accounting.*"], "property.accounting.post"), true);
  assert.equal(heldByWildcard(["property.accounting.post"], "property.accounting.post"), false);
});
