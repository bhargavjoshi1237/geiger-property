"use client";

import { Loader2, RotateCcw } from "lucide-react";

import { Button } from "@geiger/ui/button";
import { Input } from "@geiger/ui/input";
import { Field, SectionCard } from "@/components/internal/shared/screen_kit";
import { usePermission } from "@/context/rbac-context";
import { useSetting } from "@/components/internal/screens/settings/settings_kit";
import { COUNTED_STEPS, DEFAULT_MINUTES, MINUTE_LABELS, VALUE_DEFAULTS, VALUE_KEY, resolveMinutes } from "@/lib/orchestration/value";

// "Your team's minutes per task" (ORCH-09): the baseline the Impact page multiplies completed steps by. Saving
// recalculates hours saved straight away — the page reads these minutes live, not from the nightly rollup.
export function AutomationMinutesCard() {
  const setting = useSetting(VALUE_KEY, VALUE_DEFAULTS, { label: "Minutes per task" });
  const allowed = usePermission("automations.manage");
  const minutes = resolveMinutes(setting.value);
  const setMinute = (key) => (e) => setting.update((prev) => ({ ...prev, minutes: { ...resolveMinutes(prev), [key]: e.target.value === "" ? "" : Number(e.target.value) } }));

  return (
    <SectionCard
      title="Your team's minutes per task"
      description="How long each task takes a person by hand. Impact multiplies completed steps by these to estimate hours saved — always labelled estimated."
      action={
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:bg-surface-active hover:text-foreground"
            disabled={!allowed || setting.loading}
            onClick={() => setting.update({ minutes: DEFAULT_MINUTES })}
          >
            <RotateCcw className="h-3.5 w-3.5" /> Geiger defaults
          </Button>
          <Button
            size="sm"
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={!allowed || !setting.dirty || setting.saving}
            onClick={() => setting.save({ minutes: resolveMinutes(setting.value) })}
          >
            {setting.saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Save
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        {COUNTED_STEPS.map((key) => (
          <Field key={key} label={MINUTE_LABELS[key]} htmlFor={`minutes-${key}`} hint={`Default ${DEFAULT_MINUTES[key]} min`}>
            <Input
              id={`minutes-${key}`}
              type="number"
              min={0}
              step={0.5}
              disabled={!allowed || setting.loading}
              value={setting.value?.minutes?.[key] ?? minutes[key]}
              onChange={setMinute(key)}
            />
          </Field>
        ))}
      </div>
    </SectionCard>
  );
}

export default AutomationMinutesCard;
