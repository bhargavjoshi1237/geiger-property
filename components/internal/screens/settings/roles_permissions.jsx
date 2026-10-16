"use client";

import { Fragment, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { SectionCard } from "@/components/internal/shared/screen_kit";
import { normalizeRoleId } from "@/lib/rbac";
import { notifyRbacChanged } from "@/context/rbac-context";
import { SettingsPage, useSetting } from "./settings_kit";
import { ALL_KEYS, DEFAULT_ROLES, PERMISSION_CATALOG, PERMISSION_GROUPS } from "./permissions";

// Roles & Permissions — named roles and a role × permission matrix (settings key
// `roles` = [{ id, name, permissions: [] }]). Advisory UI gating only.

const TOTAL = PERMISSION_CATALOG.length;

// Checkbox state for a set of keys within a role: true, false, or "indeterminate".
function groupState(role, keys) {
  const n = keys.filter((k) => (role.permissions || []).includes(k)).length;
  return n === 0 ? false : n === keys.length ? true : "indeterminate";
}

export function RolesPermissionsScreen() {
  const setting = useSetting("roles", DEFAULT_ROLES, { label: "Roles", seedDirty: true });
  const { value, update, seeded } = setting;
  const roles = Array.isArray(value) ? value : [];
  const [newRole, setNewRole] = useState("");

  const setRoles = (next) => update(next);

  // Stamp each role with the catalog it was decided against (keys added later
  // inherit from their section until a role is saved again), then refresh RBAC.
  const pageSetting = {
    ...setting,
    save: async () => {
      const ok = await setting.save(roles.map((r) => ({ ...r, known: ALL_KEYS })));
      if (ok) notifyRbacChanged();
      return ok;
    },
  };
  const patchRole = (id, patch) => setRoles(roles.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  // Toggle a set of permission keys on/off for one role.
  const setKeys = (role, keys, on) => {
    const current = new Set(role.permissions || []);
    keys.forEach((k) => (on ? current.add(k) : current.delete(k)));
    patchRole(role.id, { permissions: [...current] });
  };

  const addRole = () => {
    const name = newRole.trim();
    if (!name) {
      toast.error("Give the role a name.");
      return;
    }
    let id = normalizeRoleId(name) || "role";
    while (roles.some((r) => r.id === id)) id = `${id}_${Math.random().toString(36).slice(2, 5)}`;
    setRoles([...roles, { id, name, permissions: [] }]);
    setNewRole("");
  };

  const removeRole = (role) => {
    if (roles.length <= 1) {
      toast.error("Keep at least one role.");
      return;
    }
    setRoles(roles.filter((r) => r.id !== role.id));
  };

  return (
    <SettingsPage
      title="Roles & Permissions"
      description="Define roles and what each can see. Permissions are advisory — they hide navigation and controls in the app, they don't secure the underlying data."
      setting={pageSetting}
      permission="roles.manage"
    >
      {seeded ? (
        <p className="rounded-lg border border-sky-500/20 bg-sky-500/10 px-4 py-3 text-sm text-sky-700 dark:text-sky-400">
          These are suggested starting roles — adjust them and save to keep them.
        </p>
      ) : null}

      <SectionCard title="Roles" description="Rename a role, add your own, or remove ones you don't use.">
        <div className="space-y-4">
          <ul className="divide-y divide-border rounded-lg border border-border">
            {roles.map((role) => (
              <li key={role.id} className="flex items-center gap-3 px-4 py-3">
                <Input
                  value={role.name}
                  onChange={(e) => patchRole(role.id, { name: e.target.value })}
                  className="bg-surface-card"
                  aria-label="Role name"
                />
                <Badge variant="neutral" className="shrink-0">
                  {(role.permissions || []).length} / {TOTAL}
                </Badge>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="shrink-0 text-red-600 dark:text-red-300 hover:bg-red-500/10"
                  onClick={() => removeRole(role)}
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
              className="bg-surface-card"
              aria-label="New role name"
            />
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={addRole}>
              <Plus className="h-4 w-4" /> Add role
            </Button>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Permission matrix"
        description="Section rows toggle every page in that section for a role."
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
                  <th
                    key={role.id}
                    className="px-3 py-3 text-center text-xs font-medium text-foreground"
                  >
                    {role.name || "Untitled"}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISSION_GROUPS.map((g) => {
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
                          <code className="ml-2 hidden font-mono text-[11px] text-text-tertiary sm:inline">
                            {p.key}
                          </code>
                        </td>
                        {roles.map((role) => (
                          <td key={role.id} className="px-3 py-2 text-center">
                            <Checkbox
                              checked={(role.permissions || []).includes(p.key)}
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
