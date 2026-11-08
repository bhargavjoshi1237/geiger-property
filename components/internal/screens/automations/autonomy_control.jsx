"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, PauseCircle, PlayCircle, ShieldCheck } from "lucide-react";

import { Button } from "@geiger/ui/button";
import { Checkbox } from "@geiger/ui/checkbox";
import { Input } from "@geiger/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@geiger/ui/select";
import { Field, SectionCard } from "@/components/internal/shared/screen_kit";
import { usePermission } from "@/context/rbac-context";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { getSetting, saveSetting } from "@/lib/supabase/settings";
import { listRoleChoices } from "@/lib/supabase/rbac";
import { STEP_CATEGORIES } from "@/lib/automations/catalog";
import { AUTONOMY_MODES, GUARDRAILS_KEY, autonomyOf } from "@/lib/orchestration/autonomy";

// Autonomy dial for a workflow (ORCH-05) and the project-wide "Pause all automations" switch. The mode is the
// automations.autonomy column; which kinds of step it asks about, the limit and the approver role live in
// metadata.autonomyConfig. Guardrails (Settings → Automation Settings) apply in every mode.

const GATED = ["money", "legal", "message", "record"];
const outline = "border-border bg-surface-card text-muted-foreground hover:bg-surface-hover hover:text-foreground";

export const AUTONOMY_CHANGED_EVENT = "geiger:automations-paused-changed";

export function AutonomyControl({ item, onCommit, onCommitMeta, compact = false }) {
  const canManage = usePermission("automations.manage");
  const current = autonomyOf({ autonomy: item.autonomy, autonomyConfig: item.metadata?.autonomyConfig });
  const [threshold, setThreshold] = useState(String(current.threshold || ""));
  const [roles, setRoles] = useState([]);
  useEffect(() => {
    let alive = true;
    listRoleChoices().then((rows) => alive && setRoles(rows ?? []));
    return () => {
      alive = false;
    };
  }, []);

  const config = item.metadata?.autonomyConfig || {};
  const setMode = async (mode) => {
    if ((await onCommit({ autonomy: mode })) === false) return;
    toast.success(`Autonomy set to "${AUTONOMY_MODES.find((m) => m.value === mode)?.label}".`);
  };
  const setConfig = (patch) => onCommitMeta({ autonomyConfig: { ...config, ...patch } });
  const toggleCategory = (cat, on) => {
    const next = new Set(current.appliesTo);
    if (on) next.add(cat);
    else next.delete(cat);
    setConfig({ appliesTo: GATED.filter((c) => next.has(c)) });
  };

  const modeSelect = (
    <Select value={current.mode} onValueChange={setMode} disabled={!canManage}>
      <SelectTrigger className={compact ? "h-8 w-48 bg-surface-card text-xs" : "w-full bg-surface-card"} aria-label="Autonomy">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {AUTONOMY_MODES.map((m) => (
          <SelectItem key={m.value} value={m.value}>
            {m.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-3.5 w-3.5 text-text-secondary" />
        {modeSelect}
      </div>
    );
  }

  return (
    <SectionCard title="Autonomy" description="How much this workflow may do on its own. Guardrails still cap money and messages in every mode.">
      <div className="space-y-4">
        <Field label="Mode" htmlFor="wf-autonomy" hint={AUTONOMY_MODES.find((m) => m.value === current.mode)?.desc}>
          {modeSelect}
        </Field>
        {current.mode === "approve" || current.mode === "suggest" ? (
          <div>
            <p className="mb-2 text-sm font-medium text-muted-foreground">{current.mode === "suggest" ? "Suggest instead of doing" : "Ask before"}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {GATED.map((cat) => (
                <label key={cat} className="flex items-center gap-2 text-sm text-foreground">
                  <Checkbox checked={current.appliesTo.includes(cat)} disabled={!canManage} onCheckedChange={(v) => toggleCategory(cat, Boolean(v))} />
                  {STEP_CATEGORIES[cat]}
                </label>
              ))}
            </div>
          </div>
        ) : null}
        {current.mode === "approve_over" ? (
          <Field label="Ask when a charge is at least" htmlFor="wf-threshold" hint="Smaller charges and every message go straight through.">
            <Input
              id="wf-threshold"
              type="number"
              min={0}
              className="w-40"
              disabled={!canManage}
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              onBlur={() => setConfig({ threshold: Number(threshold) || 0 })}
            />
          </Field>
        ) : null}
        {current.mode !== "auto" ? (
          <Field label="Who decides" htmlFor="wf-approver" hint="Review items are assigned to this role.">
            <Select value={current.approverRole || "any"} onValueChange={(v) => setConfig({ approverRole: v === "any" ? "" : v })} disabled={!canManage}>
              <SelectTrigger id="wf-approver" className="w-full bg-surface-card sm:w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Anyone who can resolve review items</SelectItem>
                {roles.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name || r.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        ) : null}
        {!canManage ? <p className="text-xs text-text-tertiary">Your role can see the autonomy but not change it.</p> : null}
      </div>
    </SectionCard>
  );
}

// The project-wide pause switch, read from settings.automation_guardrails.pauseAll.
export function usePauseAll() {
  const [paused, setPaused] = useState(null);
  useEffect(() => {
    let alive = true;
    const load = () => getSetting(GUARDRAILS_KEY, {}).then((v) => alive && setPaused(Boolean(v?.pauseAll)));
    load();
    window.addEventListener(AUTONOMY_CHANGED_EVENT, load);
    return () => {
      alive = false;
      window.removeEventListener(AUTONOMY_CHANGED_EVENT, load);
    };
  }, []);
  const set = async (next) => {
    const stored = (await getSetting(GUARDRAILS_KEY, {})) || {};
    const ok = await saveSetting(GUARDRAILS_KEY, { ...stored, pauseAll: next });
    if (!ok) {
      toast.error("Couldn't update automations.");
      return false;
    }
    setPaused(next);
    window.dispatchEvent(new Event(AUTONOMY_CHANGED_EVENT));
    toast.success(next ? "All automations paused — nothing runs until you resume." : "Automations resumed.");
    return true;
  };
  return { paused, set };
}

export function PauseAllButton() {
  const canManage = usePermission("automations.manage");
  const { paused, set } = usePauseAll();
  const [busy, setBusy] = useState(false);
  if (paused === null || !canManage) return null;
  return (
    <Button
      variant="outline"
      className={outline}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await set(!paused);
        setBusy(false);
      }}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : paused ? <PlayCircle className="h-4 w-4" /> : <PauseCircle className="h-4 w-4" />}
      {paused ? "Resume Automations" : "Pause All"}
    </Button>
  );
}

// Banner shown on automation screens while everything is paused.
export function PausedBanner() {
  const { paused, set } = usePauseAll();
  const canManage = usePermission("automations.manage");
  const { setTab } = useWorkspaceUrl();
  if (!paused) return null;
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
        <PauseCircle className="h-4 w-4 shrink-0" /> All automations are paused. No step runs — triggers queue up and continue when you resume.
      </p>
      <div className="flex shrink-0 gap-2">
        <Button size="sm" variant="ghost" className="text-muted-foreground hover:bg-surface-active" onClick={() => setTab("Automation Settings")}>
          Guardrails
        </Button>
        {canManage ? (
          <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => set(false)}>
            Resume
          </Button>
        ) : null}
      </div>
    </div>
  );
}
