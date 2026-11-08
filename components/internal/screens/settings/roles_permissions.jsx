"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Lock, Plus, Trash2 } from "lucide-react";
import { groupPermissions, permissionKeys } from "@geiger/rbac";

import { Badge } from "@geiger/ui/badge";
import { Button } from "@geiger/ui/button";
import { Checkbox } from "@geiger/ui/checkbox";
import { Input } from "@geiger/ui/input";
import { SectionCard } from "@/components/internal/shared/screen_kit";
import rbacConfig from "@/geiger-rbac.config";
import { PRODUCT, heldByWildcard, isOwnerGrade, normalizeRoleId, productKeysOf, withProductKeys } from "@/lib/rbac";
import { getActiveProjectId } from "@/lib/supabase/project_scope";
import { createRole, listGrants, listRoles, softDeleteRole, updateRole } from "@/lib/supabase/rbac";
import { notifyRbacChanged, useRbac } from "@/context/rbac-context";
import { SettingsPage } from "./settings_kit";

// Roles & Permissions — the project's shared roles (public.roles) × Property's catalog. Saving rewrites only a role's
// Property keys; other apps' keys and wildcards stay. Who holds which role is set in Team & Members.

const GROUPS = groupPermissions(rbacConfig);
const ALL_KEYS = permissionKeys(rbacConfig);
const TOTAL = ALL_KEYS.length;

const reaches = (role, key) => role.permissions.includes(key) || heldByWildcard(role.permissions, key);
const reachedCount = (role) => ALL_KEYS.filter((k) => reaches(role, k)).length;
const otherAppKeys = (role) => role.permissions.filter((p) => p !== "*" && !p.startsWith(`${PRODUCT}.`));
// System roles and roles other apps use are shared, so they can't be removed from here.
const removable = (role) => !role.isSystem && !otherAppKeys(role).length;
const sameKeys = (a, b) => a.length === b.length && a.every((k) => b.includes(k));

// Checkbox state for a set of keys within a role: true, false, or "indeterminate".
function groupState(role, keys) {
  const n = keys.filter((k) => reaches(role, k)).length;
  return n === 0 ? false : n === keys.length ? true : "indeterminate";
}

function uniqueKey(name, roles) {
  const base = normalizeRoleId(name) || "role";
  const taken = new Set(roles.map((r) => r.key).filter(Boolean));
  let key = base;
  for (let n = 2; taken.has(key); n += 1) key = `${base}_${n}`;
  return key;
}

export function RolesPermissionsScreen() {
  const { userId } = useRbac();
  const projectId = getActiveProjectId();
  const [saved, setSaved] = useState([]);
  const [roles, setRoles] = useState([]);
  const [removed, setRemoved] = useState([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newRole, setNewRole] = useState("");
  const [grants, setGrants] = useState(null);

  const apply = useCallback((rows, nextGrants) => {
    setUnavailable(rows === null);
    setSaved(rows ?? []);
    setRoles(rows ?? []);
    setGrants(nextGrants ?? null);
    setRemoved([]);
    setLoading(false);
  }, []);

  const load = useCallback(() => Promise.all([listRoles(projectId), listGrants(projectId)]), [projectId]);

  useEffect(() => {
    let alive = true;
    load().then(([rows, nextGrants]) => alive && apply(rows, nextGrants));
    return () => {
      alive = false;
    };
  }, [load, apply]);

  const dirty = useMemo(
    () =>
      removed.length > 0 ||
      roles.some((r) => {
        const before = saved.find((s) => s.id === r.id);
        return !before || before.name !== r.name || !sameKeys(before.permissions, r.permissions);
      }),
    [roles, saved, removed],
  );

  const patchRole = (id, patch) => setRoles((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  // Toggle a set of Property keys on/off for one role.
  const setKeys = (role, keys, on) => {
    const next = new Set(role.permissions);
    keys.forEach((k) => (on ? next.add(k) : next.delete(k)));
    patchRole(role.id, { permissions: [...next] });
  };

  const addRole = () => {
    const name = newRole.trim();
    if (!name) {
      toast.error("Give the role a name.");
      return;
    }
    const key = uniqueKey(name, [...saved, ...roles]);
    setRoles((prev) => [...prev, { id: crypto.randomUUID(), key, name, permissions: [], isSystem: false, metadata: {} }]);
    setNewRole("");
  };

  // A role someone still holds stays: removing it would silently take their access away.
  const removeRole = (role) => {
    const live = grants?.filter((g) => g.roleId === role.id && g.status === "active");
    const holders = live ? new Set(live.map((g) => g.userId)).size : null;
    if (holders !== 0 && saved.some((s) => s.id === role.id)) {
      toast.error(
        holders
          ? `${role.name} is held by ${holders} member${holders === 1 ? "" : "s"}. Move them to another role in Team & Members first.`
          : "Couldn't check who holds this role. Reload and try again.",
      );
      return;
    }
    setRoles((prev) => prev.filter((r) => r.id !== role.id));
    if (saved.some((s) => s.id === role.id)) setRemoved((prev) => [...prev, role.id]);
  };

  // Create, update and remove in turn; role edits need an org owner or admin, so any refusal reloads the saved state.
  const save = async () => {
    setSaving(true);
    let ok = true;
    for (const [i, role] of roles.entries()) {
      const before = saved.find((s) => s.id === role.id);
      const keys = productKeysOf(role.permissions);
      const metadata = { ...(before?.metadata || {}), ...(role.key ? { key: role.key } : {}), propertyKnown: ALL_KEYS };
      if (!before) {
        const created = await createRole({
          id: role.id,
          projectId,
          key: role.key,
          name: role.name.trim() || "Untitled role",
          permissions: keys,
          isSystem: false,
          sort: 20 + i,
          createdBy: userId,
          metadata,
        });
        ok = Boolean(created) && ok;
      } else if (before.name !== role.name || !sameKeys(before.permissions, role.permissions)) {
        const updated = await updateRole(role.id, {
          name: role.name.trim() || before.name,
          permissions: withProductKeys(before.permissions, keys),
          metadata,
        });
        ok = Boolean(updated) && ok;
      }
    }
    for (const id of removed) ok = (await softDeleteRole(id)) && ok;
    setSaving(false);
    if (ok) toast.success("Roles saved.");
    else toast.error("Couldn't save every change — only the organization's owners and admins can edit roles.");
    notifyRbacChanged();
    apply(...(await load()));
    return ok;
  };

  return (
    <SettingsPage
      title="Roles & Permissions"
      description="Roles are shared with the other Geiger apps in this project. Set what each role can see and do in Property here; who holds which role is set in Team & Members."
      setting={{ loading, saving, dirty, save, unavailable: false }}
      permission="property.role.manage"
    >
      {unavailable ? (
        <p className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          Roles couldn&apos;t be loaded. Refresh to try again.
        </p>
      ) : null}

      <SectionCard title="Roles" description="Rename your own roles, add new ones, or remove the ones you don't use.">
        <div className="space-y-4">
          <ul className="divide-y divide-border rounded-lg border border-border">
            {roles.map((role) => (
              <li key={role.id} className="flex items-center gap-3 px-4 py-3">
                <Input
                  value={role.name}
                  onChange={(e) => patchRole(role.id, { name: e.target.value })}
                  disabled={role.isSystem}
                  title={role.isSystem ? "System roles keep their name across Geiger apps" : undefined}
                  aria-label="Role name"
                />
                <Badge variant="neutral" className="shrink-0">
                  {reachedCount(role)} / {TOTAL}
                </Badge>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="shrink-0 text-red-600 dark:text-red-300 hover:bg-red-500/10"
                  onClick={() => removeRole(role)}
                  disabled={!removable(role)}
                  title={removable(role) ? undefined : "System roles and roles other Geiger apps use can't be removed here"}
                  aria-label={`Remove ${role.name || "role"}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addRole()}
              placeholder="e.g. Regional manager"
              aria-label="New role name"
            />
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={addRole}>
              <Plus className="h-4 w-4" /> Add Role
            </Button>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Permission matrix"
        description="Section rows toggle every page in that section for a role. Locked roles hold every permission."
        bodyPadding={false}
      >
        <div className="max-h-[640px] overflow-auto">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-surface-subtle">
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
                  Permission
                </th>
                {roles.map((role) => (
                  <th key={role.id} className="px-3 py-3 text-center text-xs font-medium text-foreground">
                    <span className="inline-flex items-center gap-1">
                      {isOwnerGrade(role.permissions) ? <Lock className="h-3 w-3 text-text-tertiary" aria-hidden /> : null}
                      {role.name || "Untitled"}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {GROUPS.map((g) => {
                const keys = g.permissions.map((p) => p.key);
                return (
                  <Fragment key={g.group}>
                    <tr className="border-b border-border bg-surface-card">
                      <td className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
                        {g.group}
                      </td>
                      {roles.map((role) => (
                        <td key={role.id} className="px-3 py-2 text-center">
                          <Checkbox
                            checked={groupState(role, keys)}
                            disabled={isOwnerGrade(role.permissions)}
                            onCheckedChange={(v) => setKeys(role, keys, v === true)}
                            aria-label={`${role.name}: all of ${g.group}`}
                          />
                        </td>
                      ))}
                    </tr>
                    {g.permissions.map((p) => (
                      <tr key={p.key} className="border-b border-border last:border-b-0 hover:bg-surface-hover">
                        <td className="px-4 py-2">
                          <span className="text-foreground">{p.label}</span>
                          <code className="ml-2 hidden font-mono text-[11px] text-text-tertiary sm:inline">{p.key}</code>
                        </td>
                        {roles.map((role) => (
                          <td key={role.id} className="px-3 py-2 text-center">
                            <Checkbox
                              checked={reaches(role, p.key)}
                              disabled={heldByWildcard(role.permissions, p.key)}
                              onCheckedChange={(v) => setKeys(role, [p.key], v === true)}
                              aria-label={`${role.name}: ${p.label}`}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </SettingsPage>
  );
}

export default RolesPermissionsScreen;
