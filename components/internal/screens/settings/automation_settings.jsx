"use client";

import { useEffect, useState } from "react";
import { Ban, Clock, PauseCircle, ShieldCheck } from "lucide-react";

import { Input } from "@geiger/ui/input";
import { Switch } from "@geiger/ui/switch";
import { Field, SectionCard, SettingRow, SettingsList } from "@/components/internal/shared/screen_kit";
import { usePermission } from "@/context/rbac-context";
import { getSetting } from "@/lib/supabase/settings";
import { GUARDRAILS_KEY, GUARDRAIL_DEFAULTS } from "@/lib/orchestration/autonomy";
import { usePauseAll } from "@/components/internal/screens/automations/autonomy_control";
import { AutomationMinutesCard } from "./automation_minutes_card";
import { IntakeRulesCard } from "./intake_rules_card";
import { SignalThresholdsCard } from "./signal_thresholds_card";
import { SettingsPage, useSetting } from "./settings_kit";

// Automation Settings — project guardrails every workflow obeys in every autonomy mode (ORCH-05, settings key
// `automation_guardrails`), the pause-all switch, and the cards for minutes per task (ORCH-09), email intake rules
// (ORCH-10) and signal thresholds (ORCH-06), each saved on its own.

const num = (v) => (v === "" ? "" : Number(v));

export function AutomationSettingsScreen() {
  const setting = useSetting(GUARDRAILS_KEY, GUARDRAIL_DEFAULTS, { label: "Guardrails" });
  const canManage = usePermission("automations.manage");
  const { paused, set: setPaused } = usePauseAll();
  const [timezone, setTimezone] = useState("");
  useEffect(() => {
    let alive = true;
    getSetting("company_profile", {}).then((v) => alive && setTimezone(v?.timezone || "America/New_York"));
    return () => {
      alive = false;
    };
  }, []);

  const g = setting.value;
  const quiet = { ...GUARDRAIL_DEFAULTS.quietHours, ...(g.quietHours || {}) };
  const setQuiet = (patch) => setting.update((prev) => ({ ...prev, quietHours: { ...GUARDRAIL_DEFAULTS.quietHours, ...(prev.quietHours || {}), ...patch } }));
  const field = (key) => ({ value: g[key] ?? "", onChange: (e) => setting.set(key)(num(e.target.value)), disabled: !canManage });
  // Pause-all saves on its own, so saving guardrails always keeps its live value.
  const guarded = { ...setting, save: () => setting.save({ ...setting.value, pauseAll: Boolean(paused) }) };

  return (
    <SettingsPage
      title="Automation Settings"
      description="Guardrails every workflow obeys, whatever its autonomy — money caps, message limits, quiet hours and do-not-contact — plus how much time automations save, email intake and signal thresholds."
      setting={guarded}
      permission="automations.manage"
    >
      <SectionCard title="Pause all automations" description="Stops every workflow before its next step. Triggers keep queuing and continue — without repeating anything — when you resume.">
        <SettingsList>
          <SettingRow
            icon={PauseCircle}
            title={paused ? "Automations are paused" : "Automations are running"}
            description={paused ? "Nothing runs until you resume." : "Workflows run on their triggers and schedules."}
            checked={Boolean(paused)}
            onCheckedChange={(v) => canManage && setPaused(Boolean(v))}
          />
        </SettingsList>
      </SectionCard>

      <SectionCard title="Money" description="Charges over these limits wait for approval in the Review Queue, even in Run automatically mode.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Most a single run may charge ($)" htmlFor="gr-run" hint="0 turns the cap off.">
            <Input id="gr-run" type="number" min={0} {...field("maxChargePerRun")} />
          </Field>
          <Field label="Most charges automations may post per day" htmlFor="gr-day" hint="Across the whole project. 0 turns the cap off.">
            <Input id="gr-day" type="number" min={0} {...field("maxChargesPerDay")} />
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Messages" description="Limits that keep automated messages respectful. A capped or blocked message is skipped and the reason is logged on the run.">
        <div className="space-y-4">
          <Field label="Most automated messages one person gets per week" htmlFor="gr-week" hint="Legal notices and emergencies don't count. 0 turns the cap off.">
            <Input id="gr-week" type="number" min={0} className="w-40" {...field("maxMessagesPerRecordPerWeek")} />
          </Field>
          <SettingsList>
            <SettingRow
              icon={Ban}
              title="Respect do-not-contact"
              description="Skip people marked do-not-contact. Legal notices and emergencies still go out."
              checked={g.respectDoNotContact !== false}
              onCheckedChange={(v) => canManage && setting.set("respectDoNotContact")(v)}
            />
            <SettingRow
              icon={Clock}
              title="Quiet hours"
              description={`Hold automated messages inside these hours (${timezone || "company timezone"}) and send them when quiet hours end. Emergencies go immediately.`}
              control={<Switch checked={quiet.enabled !== false} disabled={!canManage} onCheckedChange={(v) => setQuiet({ enabled: v })} aria-label="Quiet hours" />}
            />
          </SettingsList>
          {quiet.enabled !== false ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Quiet from" htmlFor="gr-quiet-start">
                <Input id="gr-quiet-start" type="time" value={quiet.start} disabled={!canManage} onChange={(e) => setQuiet({ start: e.target.value })} />
              </Field>
              <Field label="Until" htmlFor="gr-quiet-end">
                <Input id="gr-quiet-end" type="time" value={quiet.end} disabled={!canManage} onChange={(e) => setQuiet({ end: e.target.value })} />
              </Field>
            </div>
          ) : null}
        </div>
      </SectionCard>

      <p className="flex items-start gap-2 text-xs text-text-tertiary">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Each workflow&apos;s autonomy (Suggest only, Ask first, Ask above a limit, Run automatically) is set on the workflow. These guardrails apply on top of it.
      </p>

      <AutomationMinutesCard />
      <IntakeRulesCard />
      <SignalThresholdsCard />
    </SettingsPage>
  );
}

export default AutomationSettingsScreen;
