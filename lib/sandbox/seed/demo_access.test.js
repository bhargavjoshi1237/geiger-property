import { test } from "node:test";
import assert from "node:assert/strict";

import rbacConfig from "@/geiger-rbac.config";
import { accessFile, demoRoles } from "@/supabase/seeds/demo_project/generate/access.mjs";
import { TARGET } from "@/supabase/seeds/demo_project/generate/config.mjs";

// PLAT-01h: the demo seed emits public.roles (every system role plus Regional manager) and mints grants through rbac_ensure_membership.

test("demo access: every system role and the Regional manager, on demo ids, with catalog keys only", () => {
  const roles = demoRoles();
  assert.deepEqual(roles.map((r) => r.key), [...rbacConfig.systemRoles.map((r) => r.key), "regional_manager"]);
  assert.ok(roles.every((r) => r.id.startsWith(TARGET.idPrefix)));
  assert.deepEqual(roles.find((r) => r.key === "owner").permissions, ["*"]);
  assert.ok(roles.find((r) => r.key === "viewer").permissions.every((k) => k.endsWith(".view")));
  assert.throws(() => demoRoles([{ ...roles[2], permissions: ["property.nope.view"] }]), /not in the catalog/);
});

test("demo access: shared roles keep other products' keys; grants go through rbac_ensure_membership per org member", () => {
  const { name, sql, count } = accessFile();
  assert.equal(name, "06_access.sql");
  assert.equal(count, demoRoles().length);
  assert.match(sql, /insert into public\.roles as r \(project_id, key, name/);
  assert.match(sql, /on conflict \(project_id, key\) where key is not null and deleted_at is null do update set/);
  assert.match(sql, /where p not like 'property\.%'/, "only Property's keys are replaced");
  assert.doesNotMatch(sql, /set name =|name = excluded/, "a shared role keeps its name");
  assert.ok(sql.includes(`property.rbac_ensure_membership('${TARGET.projectId}'::uuid)`));
  assert.ok(sql.includes(`public.organization_users ou where ou.organization = '${TARGET.organizationId}'`));
  assert.match(sql, /set_config\('request\.jwt\.claims', '', true\)/, "claims are cleared afterwards");
  assert.doesNotMatch(sql, /insert into property\.settings[^;]*'roles'/);
});
