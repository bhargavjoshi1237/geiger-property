"use client";

import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";

import { Badge } from "@geiger/ui/badge";
import { Button } from "@geiger/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@geiger/ui/dialog";
import WizardDialog from "@/components/internal/shared/wizard_dialog";
import { getUser } from "@/lib/supabase/user";
import { automationsLayer } from "@/lib/supabase/automations";
import { playbookInstallsLayer } from "@/lib/supabase/playbook_installs";
import { stepSummary, triggerLabel } from "@/lib/automations/catalog";
import { autonomyLabel } from "@/lib/orchestration/autonomy";
import { playbookConfig } from "@/lib/orchestration/playbooks";
import { applyUpdate, installPlaybook, uninstallPlaybook } from "@/lib/orchestration/playbooks/install";

// Playbook dialogs (ORCH-07): the setup wizard (questions → preview of the workflows it will generate → install as
// Active or Draft), the update dialog (change list, which workflows regenerate and which stay customized) and uninstall.

const GHOST = "text-muted-foreground hover:bg-surface-active hover:text-foreground";
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Short "when" line for a generated workflow.
export function triggerText(key, t = {}) {
  if (key === "schedule") {
    const when = t.frequency === "daily" ? "Daily" : t.frequency === "monthly" ? `Monthly on day ${t.monthDay}` : `Weekly on ${WEEKDAYS[Number(t.weekday ?? 1)] || "Monday"}`;
    return t.scope === "active_leases" ? `${when} · each active lease` : t.scope === "tenants_with_balance" ? `${when} · each tenant owing` : when;
  }
  if (key === "lease.ending") return `${t.daysBefore} days before a lease ends`;
  if (key === "rent.overdue") return `Rent ${t.daysOverdue} day${Number(t.daysOverdue) === 1 ? "" : "s"} late`;
  if (key === "work_order.overdue") return `Unassigned ${t.unassignedHours}h or past due`;
  if (key === "vendor.compliance_expiring") return `${t.daysBefore} days before a COI or licence expires`;
  return triggerLabel(key);
}

// The workflows a config generates, as connected step lists.
export function WorkflowPreview({ playbook, values }) {
  const workflows = playbook.workflows(playbookConfig(playbook, values));
  if (!workflows.length) return <p className="text-sm text-text-secondary">This playbook has no workflows to install yet.</p>;
  return (
    <div className="space-y-3">
      <p className="text-sm text-text-secondary">
        {workflows.length} workflow{workflows.length === 1 ? "" : "s"} will be created {values.activate ? "and switched on" : "as drafts"} ·{" "}
        {autonomyLabel(values.autonomy || playbook.defaultAutonomy)}
      </p>
      {workflows.map((w) => (
        <div key={w.key} className="rounded-lg border border-border bg-surface-subtle p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-foreground">{w.name}</p>
            <Badge variant="outline">{triggerText(w.triggerEvent, w.trigger)}</Badge>
          </div>
          {w.description ? <p className="mt-0.5 text-xs text-text-secondary">{w.description}</p> : null}
          <ol className="mt-2 space-y-1 border-l border-border pl-3">
            {w.steps.map((s) => (
              <li key={s.id} className="text-xs text-text-secondary">
                {stepSummary(s)}
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}

export function InstallPlaybookDialog({ playbook, ctx, open, onOpenChange, onInstalled }) {
  if (!playbook) return null;
  const steps = [
    ...playbook.questions(ctx),
    { key: "preview", title: "Preview", description: "Check what will be created. Every workflow stays editable on the canvas.", render: ({ values }) => <WorkflowPreview playbook={playbook} values={values} /> },
  ];
  const finish = async (values) => {
    const user = await getUser();
    const res = await installPlaybook({
      playbook,
      answers: values,
      activate: Boolean(values.activate),
      installs: playbookInstallsLayer,
      automations: automationsLayer,
      installedBy: user?.id || null,
    });
    if (!res.ok) {
      toast.error(res.error || "Couldn't install the playbook.");
      return false;
    }
    toast.success(`${playbook.title} installed — ${res.automations.length} workflow${res.automations.length === 1 ? "" : "s"} ${values.activate ? "switched on" : "saved as drafts"}.`);
    onInstalled?.(res);
    return true;
  };
  return (
    <WizardDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Set up ${playbook.title}`}
      description={playbook.outcome}
      steps={steps}
      initial={playbook.defaults?.(ctx) || {}}
      onFinish={finish}
      finishLabel="Install"
    />
  );
}

export function UpdatePlaybookDialog({ playbook, install, plan, open, onOpenChange, onUpdated }) {
  const [busy, setBusy] = useState(false);
  if (!playbook || !install || !plan) return null;
  const run = async () => {
    setBusy(true);
    const res = await applyUpdate({ playbook, install, plan, installs: playbookInstallsLayer, automations: automationsLayer });
    setBusy(false);
    if (!res.ok) return toast.error(res.error || "Couldn't update the playbook.");
    toast.success(`${playbook.title} updated to version ${playbook.version}.`);
    onUpdated?.(res);
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Update {playbook.title}</DialogTitle>
          <DialogDescription>
            Version {plan.fromVersion} → {plan.toVersion}. Workflows you haven&apos;t edited are regenerated from your saved setup.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 text-sm">
          {plan.changes.length ? (
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wider text-text-tertiary">What changed</p>
              <ul className="space-y-1 text-text-secondary">
                {plan.changes.map((c, i) => (
                  <li key={i}>
                    <Badge variant="neutral" className="mr-2">
                      v{c.version}
                    </Badge>
                    {c.note}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <ul className="space-y-1 text-text-secondary">
            <li>{plan.regenerate.length} workflow{plan.regenerate.length === 1 ? "" : "s"} regenerated</li>
            {plan.create.length ? <li>{plan.create.length} new workflow{plan.create.length === 1 ? "" : "s"} added</li> : null}
            {plan.retire.length ? <li>{plan.retire.length} workflow{plan.retire.length === 1 ? "" : "s"} no longer part of the playbook — paused</li> : null}
          </ul>
          {plan.keepCustomized.length ? (
            <p className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              You customized {plan.keepCustomized.map((a) => `"${a.name}"`).join(", ")}, so {plan.keepCustomized.length === 1 ? "it stays" : "they stay"} as{" "}
              {plan.keepCustomized.length === 1 ? "it is" : "they are"}. To take the new version, remove the playbook and set it up again.
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" className={GHOST} disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={busy} onClick={run}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Update
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function UninstallPlaybookDialog({ playbook, install, open, onOpenChange, onRemoved }) {
  const [busy, setBusy] = useState(false);
  if (!playbook || !install) return null;
  const run = async () => {
    setBusy(true);
    const res = await uninstallPlaybook({ install, installs: playbookInstallsLayer, automations: automationsLayer });
    setBusy(false);
    if (!res.ok) return toast.error(res.error || "Couldn't remove the playbook.");
    toast.success(`${playbook.title} removed — its workflows are paused and their history is kept.`);
    onRemoved?.();
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Remove {playbook.title}</DialogTitle>
          <DialogDescription>
            Its {install.automationIds?.length || 0} workflow{install.automationIds?.length === 1 ? "" : "s"} will be paused, not deleted — runs already waiting stay parked and Run History keeps everything.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" className={GHOST} disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="bg-red-500/90 text-white hover:bg-red-500" disabled={busy} onClick={run}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Remove
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
