"use client";

import { Building, HandCoins, Megaphone, Scale, ShieldCheck, UsersRound } from "lucide-react";

import { Switch } from "@geiger/ui/switch";
import { SectionCard, SettingRow, SettingsList } from "@/components/internal/shared/screen_kit";
import { workspaceNav } from "@/components/internal/sidebar/sidebar_nav";
import { usePermission } from "@/context/rbac-context";
import { notifyModulesChanged } from "@/context/modules-context";
import { MODULES, MODULES_SETTING_KEY, MODULE_DEFAULTS, isModuleOn, moduleNavTitles } from "@/lib/modules";
import { SettingsPage, useSetting } from "./settings_kit";

// Settings → Modules: one switch per optional vertical (lib/modules.js), saved to the `modules` setting.

const ICONS = { leasing: Megaphone, commercial: Building, affordable: HandCoins, regulation: Scale, associations: UsersRound };

export function ModulesSettingsScreen() {
  const setting = useSetting(MODULES_SETTING_KEY, MODULE_DEFAULTS, { label: "Modules" });
  const canManage = usePermission("settings.manage");
  // The sidebar and page gates refresh once the switches are saved.
  const withRefresh = {
    ...setting,
    save: async (...args) => {
      const ok = await setting.save(...args);
      if (ok) notifyModulesChanged();
      return ok;
    },
  };

  return (
    <SettingsPage
      title="Modules"
      description="Turn on the parts of Geiger Property your company uses. Switching a module off hides it for everyone in this project — nothing is deleted."
      setting={withRefresh}
    >
      <SectionCard title="Optional modules" description="An off module's pages leave the sidebar, and its scheduled jobs, workflow triggers and signals stop for this project.">
        <SettingsList>
          {MODULES.map((m) => {
            const pages = moduleNavTitles(workspaceNav, m.key);
            const on = isModuleOn(setting.value, m.key);
            return (
              <SettingRow
                key={m.key}
                icon={ICONS[m.key]}
                title={m.label}
                description={pages.length ? `${m.description} Pages: ${pages.join(", ")}.` : m.description}
                control={
                  <Switch
                    checked={on}
                    disabled={!canManage}
                    onCheckedChange={(v) => setting.set(m.key)(Boolean(v))}
                    aria-label={`${m.label} module`}
                  />
                }
              />
            );
          })}
        </SettingsList>
      </SectionCard>

      <p className="flex items-start gap-2 text-xs text-text-tertiary">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Core features — properties, leases, people, maintenance, accounting, documents, reports and automations — are always on.
      </p>
    </SettingsPage>
  );
}

export default ModulesSettingsScreen;
