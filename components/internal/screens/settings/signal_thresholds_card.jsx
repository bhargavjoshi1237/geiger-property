"use client";

import { Loader2 } from "lucide-react";

import { Button } from "@geiger/ui/button";
import { Input } from "@geiger/ui/input";
import { Switch } from "@geiger/ui/switch";
import { Field, ListLoading, SectionCard } from "@/components/internal/shared/screen_kit";
import { usePermission } from "@/context/rbac-context";
import { SIGNAL_DEFAULTS, SIGNAL_SETTINGS_KEY, SIGNAL_THRESHOLD_FIELDS } from "@/lib/signals/config";
import { DETECTORS } from "@/lib/signals/detectors";
import { AREAS } from "@/lib/signals/constants";
import { useSetting } from "./settings_kit";

// Signal thresholds (ORCH-06): when each rule detector fires and how much a money-less signal is worth.
// Saves the `signal_settings` key; the daily signals job reads it. Rendered inside Automation Settings.

const GROUPS = [...new Set(SIGNAL_THRESHOLD_FIELDS.map((f) => f.group))];

export function SignalThresholdsCard() {
  const setting = useSetting(SIGNAL_SETTINGS_KEY, SIGNAL_DEFAULTS, { label: "Signal thresholds" });
  const canEdit = usePermission("automations.manage");
  const { value, set, update, save, saving, dirty, loading } = setting;
  const disabled = new Set(Array.isArray(value.disabled) ? value.disabled : []);
  const toggle = (key, on) => update((prev) => ({ ...prev, disabled: on ? (prev.disabled || []).filter((k) => k !== key) : [...new Set([...(prev.disabled || []), key])] }));

  return (
    <SectionCard
      title="Signal thresholds"
      description="When the daily briefing flags something, and which rules run. Changes apply on the next signals run."
      action={
        <Button
          size="sm"
          className="bg-primary text-primary-foreground hover:bg-primary/90"
          disabled={saving || !dirty || !canEdit}
          title={canEdit ? undefined : "Your role can't change automation settings"}
          onClick={() => save()}
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Save
        </Button>
      }
    >
      {loading ? (
        <ListLoading label="Loading thresholds" />
      ) : (
        <div className="space-y-6">
          {GROUPS.map((group) => (
            <div key={group}>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-tertiary">{group}</p>
              <div className="grid gap-4 sm:grid-cols-2">
                {SIGNAL_THRESHOLD_FIELDS.filter((f) => f.group === group).map((f) => (
                  <Field key={f.key} label={f.label} htmlFor={`sig-${f.key}`} hint={f.suffix ? `In ${f.suffix}. Default ${f.prefix || ""}${SIGNAL_DEFAULTS[f.key]}.` : `Default ${f.prefix || ""}${SIGNAL_DEFAULTS[f.key]}.`}>
                    <Input
                      id={`sig-${f.key}`}
                      type="number"
                      min={0}
                      disabled={!canEdit}
                      value={value[f.key] ?? ""}
                      onChange={(e) => set(f.key)(e.target.value === "" ? "" : Number(e.target.value))}
                    />
                  </Field>
                ))}
              </div>
            </div>
          ))}
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-tertiary">Rules</p>
            <div className="divide-y divide-border rounded-lg border border-border">
              {DETECTORS.map((d) => (
                <div key={d.key} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{d.label}</p>
                    <p className="text-xs text-text-secondary">
                      {AREAS[d.area]?.label} · {d.description}
                    </p>
                  </div>
                  <Switch checked={!disabled.has(d.key)} disabled={!canEdit} onCheckedChange={(on) => toggle(d.key, on)} aria-label={`Run ${d.label}`} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

export default SignalThresholdsCard;
