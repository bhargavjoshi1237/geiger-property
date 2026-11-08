"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { Button } from "@geiger/ui/button";
import { Switch } from "@geiger/ui/switch";
import { ListLoading, SectionCard } from "@/components/internal/shared/screen_kit";
import { usePermission } from "@/context/rbac-context";
import { saveStatementSettingsApi, statementSettingsApi } from "@/lib/billing/api";
import { STATEMENT_AUDIENCES, STATEMENT_DEFAULTS, audienceOf, audienceSettings } from "@/lib/billing/statement_rules";
import { SelectField } from "./settings_kit";

// Resident statements (CORE-12): billing_settings.statements — send last month's statement on a day each month, and to whom.
// Saved through /api/billing/statements/settings, which merges into billing_settings so the jobs pause switch is never overwritten.

const DAYS = Array.from({ length: 28 }, (_, i) => ({ value: String(i + 1), label: `Day ${i + 1}` }));

export function StatementSettingsCard() {
  const [value, setValue] = useState(null);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const canEdit = usePermission("property.rent.manage");

  useEffect(() => {
    let alive = true;
    statementSettingsApi().then((res) => {
      if (!alive) return;
      setValue(res.ok ? res.statements : { ...STATEMENT_DEFAULTS });
      setError(res.ok ? "" : res.error || "Couldn't load the statement settings.");
    });
    return () => {
      alive = false;
    };
  }, []);

  const update = (patch) => {
    setValue((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  };
  const save = async () => {
    setSaving(true);
    const res = await saveStatementSettingsApi(value);
    setSaving(false);
    if (!res.ok) return toast.error(res.error || "Couldn't save the statement settings.");
    setValue(res.statements);
    setDirty(false);
    toast.success("Statement settings saved.");
  };

  return (
    <SectionCard
      title="Resident statements"
      description="Each month, email last month's statement to residents with a link to the resident portal (Scheduled jobs → Resident statements). Residents who prefer paper go to a print batch; send by hand any time from Rent Collection."
      action={
        <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={!value || saving || !dirty || !canEdit} title={canEdit ? undefined : "Your role can't change billing settings"} onClick={save}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Save
        </Button>
      }
    >
      {!value ? (
        <ListLoading label="Loading statement settings" />
      ) : (
        <div className="space-y-4">
          {error ? <p className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">{error} Showing defaults.</p> : null}
          <label className="flex items-center justify-between gap-4 rounded-lg border border-border px-4 py-3">
            <span className="min-w-0">
              <span className="block text-sm font-medium text-foreground">Send statements automatically</span>
              <span className="block text-xs text-text-secondary">Off: statements go out only when someone sends them.</span>
            </span>
            <Switch checked={value.enabled} disabled={!canEdit} onCheckedChange={(v) => update({ enabled: v })} aria-label="Send statements automatically" />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField id="stmt-day" label="Send on" hint="Day of the month; missed days catch up until the month ends." value={String(value.day)} onChange={(v) => update({ day: Number(v) })} options={DAYS} />
            <SelectField
              id="stmt-audience"
              label="Who gets one"
              hint={STATEMENT_AUDIENCES.find((a) => a.value === audienceOf(value))?.hint}
              value={audienceOf(value)}
              onChange={(v) => update(audienceSettings(v))}
              options={STATEMENT_AUDIENCES}
            />
          </div>
        </div>
      )}
    </SectionCard>
  );
}

export default StatementSettingsCard;
