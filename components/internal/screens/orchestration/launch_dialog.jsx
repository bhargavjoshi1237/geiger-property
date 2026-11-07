"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Loader2, Play, Workflow } from "lucide-react";
import { LogoLoading } from "@geiger/ui";

import { Badge } from "@geiger/ui/badge";
import { Button } from "@geiger/ui/button";
import { Checkbox } from "@geiger/ui/checkbox";
import { Input } from "@geiger/ui/input";
import { Textarea } from "@geiger/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@geiger/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@geiger/ui/select";
import { EmptyState, Field } from "@/components/internal/shared/screen_kit";
import { automationsData } from "@/lib/supabase/automations";
import { RECORD_TYPES, triggerLabel } from "@/lib/automations/catalog";
import { autonomyLabel } from "@/lib/orchestration/autonomy";
import { previewLaunch, runLaunch } from "@/lib/orchestration/api";
import { workflowOf } from "@/components/internal/screens/automations/sections";

// Run a workflow on chosen records (ORCH-08): pick the workflow, see a dry-run preview of exactly what will happen
// per record, untick records and edit the message text for this batch, then run under the workflow's autonomy.
// A preview writes nothing; running starts one "manual" run per ticked record.

const OUTCOME = {
  run: { label: "Runs", variant: "success" },
  approval: { label: "Needs approval", variant: "warning" },
  suggest: { label: "Suggestion", variant: "info" },
  review: { label: "Raises a review item", variant: "danger" },
  skip: { label: "Skipped", variant: "outline" },
  defer: { label: "Held (quiet hours)", variant: "purple" },
  wait: { label: "Wait", variant: "neutral" },
  stop: { label: "Stops", variant: "outline" },
  control: { label: "Check", variant: "neutral" },
};

const usd = (n) => `$${(Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

// One plain sentence for the whole batch, e.g. "Email 7 tenants, post 7 late fees totalling $350, raise 1 item for Sam (no email)."
export function summarizePlan(plan, included) {
  if (!plan) return "";
  const records = plan.records.filter((r) => included.has(r.recordId));
  const parts = [];
  const unmatched = records.filter((r) => !r.matched).length;
  const live = records.filter((r) => r.matched);
  const byStep = new Map();
  for (const r of live) {
    for (const s of r.steps) {
      if (!byStep.has(s.index)) byStep.set(s.index, []);
      byStep.get(s.index).push({ ...s, record: r.label });
    }
  }
  for (const [, list] of [...byStep].sort((a, b) => a[0] - b[0])) {
    const first = list[0];
    const runs = list.filter((s) => s.outcome === "run");
    if (runs.length) {
      if (first.type === "send_email") parts.push(`email ${plural(runs.reduce((n, s) => n + (s.recipients?.length || 0), 0), "recipient")}${first.subject ? ` ("${first.subject}")` : first.templateId ? " (from a template)" : ""}`);
      else if (first.type === "post_charge") parts.push(`post ${plural(runs.length, "charge")} totalling ${usd(runs.reduce((n, s) => n + (Number(s.amount) || 0), 0))}`);
      else parts.push(`${first.summary.charAt(0).toLowerCase()}${first.summary.slice(1)}${runs.length > 1 ? ` ×${runs.length}` : ""}`);
    }
    const approvals = list.filter((s) => s.outcome === "approval").length;
    if (approvals) parts.push(`${plural(approvals, "step")} wait for approval`);
    const suggests = list.filter((s) => s.outcome === "suggest").length;
    if (suggests) parts.push(`${plural(suggests, "suggestion")} go to the Review Queue`);
    for (const s of list.filter((x) => x.outcome === "review")) parts.push(`raise 1 item for ${s.record}${s.reasonCode === "no_recipient_email" ? " (no email)" : ""}`);
    const skipped = list.filter((s) => s.outcome === "skip").length;
    if (skipped) parts.push(`skip ${plural(skipped, "message")} (guardrails)`);
    const held = list.filter((s) => s.outcome === "defer").length;
    if (held) parts.push(`hold ${plural(held, "message")} for quiet hours`);
  }
  if (unmatched) parts.push(`${plural(unmatched, "record")} don't meet the conditions and won't run`);
  if (!parts.length) return "Nothing would happen for the selected records.";
  const text = parts.join(", ");
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

export function LaunchDialog({ open, onOpenChange, recordType, recordIds = [], automationId = null, filter = null, emptyAction = null, source = {}, title, onDone }) {
  const [workflows, setWorkflows] = useState(null);
  const [chosen, setChosen] = useState(automationId || "");
  const [preview, setPreview] = useState({ key: null, plan: null });
  const [running, setRunning] = useState(false);
  const [included, setIncluded] = useState(new Set());
  const [overrides, setOverrides] = useState({});
  const [editOpen, setEditOpen] = useState(false);
  const [launchId, setLaunchId] = useState(null);
  const ids = useMemo(() => [...new Set(recordIds.filter(Boolean))], [recordIds]);
  const idsKey = ids.join(",");

  // Reset and load the workflows that can run on this record type whenever the dialog opens.
  const [openedFor, setOpenedFor] = useState(null);
  const openKey = open ? `${recordType}:${idsKey}:${automationId || ""}` : null;
  if (openKey !== openedFor) {
    setOpenedFor(openKey);
    if (open) {
      setWorkflows(null);
      setPreview({ key: null, plan: null });
      setChosen(automationId || "");
      setOverrides({});
      setEditOpen(false);
      setIncluded(new Set(ids));
      setLaunchId(crypto.randomUUID());
    }
  }

  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    automationsData.list().then((rows) => {
      if (!alive) return;
      const list = (rows ?? []).filter((a) => {
        const wf = workflowOf(a);
        return wf.steps.length && (!recordType || wf.recordType === recordType) && (!filter || filter(a));
      });
      setWorkflows(list);
      setChosen((c) => c || list.find((a) => workflowOf(a).triggerEvent === "manual")?.id || list[0]?.id || "");
    });
    return () => {
      alive = false;
    };
  }, [open, recordType, filter]);

  // The preview (dry run) for the chosen workflow and records; "previewing" until it matches the current choice.
  const previewKey = open && chosen && ids.length ? `${chosen}:${idsKey}` : null;
  useEffect(() => {
    if (!previewKey) return undefined;
    let alive = true;
    previewLaunch({ automationId: chosen, recordType, recordIds: ids }).then((res) => {
      if (!alive) return;
      if (!res.ok) toast.error(res.error || "Couldn't preview the workflow.");
      else setIncluded(new Set(res.records.filter((r) => r.matched).map((r) => r.recordId)));
      setPreview({ key: previewKey, plan: res.ok ? res : null });
    });
    return () => {
      alive = false;
    };
  }, [previewKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const previewing = Boolean(previewKey) && preview.key !== previewKey;
  const plan = previewing ? null : preview.plan;

  const workflow = workflows?.find((w) => w.id === chosen) || null;
  const messageSteps = (plan?.automation?.steps || []).filter((s) => s.type === "send_email");
  const summary = useMemo(() => summarizePlan(plan, included), [plan, included]);
  const runnable = plan ? plan.records.filter((r) => r.matched && included.has(r.recordId)) : [];

  const toggle = (id, on) =>
    setIncluded((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const setOverride = (stepId, key, value) => setOverrides((prev) => ({ ...prev, [stepId]: { ...(prev[stepId] || {}), [key]: value } }));

  const run = async () => {
    if (!runnable.length) return;
    setRunning(true);
    const clean = Object.fromEntries(Object.entries(overrides).filter(([, v]) => Object.values(v).some((x) => String(x || "").trim())));
    const res = await runLaunch({ automationId: chosen, recordType, recordIds: runnable.map((r) => r.recordId), overrides: clean, source, launchId });
    setRunning(false);
    if (!res.ok) {
      toast.error(res.error || "Couldn't start the workflow.");
      return;
    }
    toast.success(`Started ${plural(res.started, "run")}${res.skipped ? ` · ${res.skipped} skipped` : ""}.`);
    onDone?.(res);
    onOpenChange(false);
  };

  const typeLabel = RECORD_TYPES[recordType]?.label?.toLowerCase() || "record";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title || "Run a workflow"}</DialogTitle>
          <DialogDescription>
            Preview exactly what will happen for {plural(ids.length, typeLabel)}, adjust it, then run it. Nothing changes until you press Run.
          </DialogDescription>
        </DialogHeader>

        {workflows === null ? (
          <div className="flex justify-center py-10">
            <LogoLoading size={40} aria-label="Loading workflows" />
          </div>
        ) : !workflows.length ? (
          <EmptyState
            icon={Workflow}
            title="No workflow runs on this kind of record"
            description={`Create a workflow with the "Run by hand" trigger on ${typeLabel}s, or install a playbook that covers it.`}
            action={
              emptyAction ? (
                <Button variant="outline" className="border-border bg-surface-card text-muted-foreground hover:bg-surface-hover hover:text-foreground" onClick={emptyAction.onClick}>
                  {emptyAction.label}
                </Button>
              ) : null
            }
          />
        ) : (
          <div className="grid gap-4">
            <Field label="Workflow" htmlFor="launch-workflow" hint={workflow ? `${triggerLabel(workflowOf(workflow).triggerEvent)} · ${autonomyLabel(workflow.autonomy)}` : undefined}>
              <Select value={chosen} onValueChange={setChosen}>
                <SelectTrigger id="launch-workflow" className="w-full bg-surface-card">
                  <SelectValue placeholder="Choose a workflow" />
                </SelectTrigger>
                <SelectContent>
                  {workflows.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name || "Untitled workflow"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {previewing ? (
              <div className="flex justify-center py-8">
                <LogoLoading size={40} aria-label="Previewing" />
              </div>
            ) : plan ? (
              <>
                <div className="rounded-lg border border-border bg-surface-subtle p-3">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">What will happen</p>
                  <p className="mt-1 text-sm text-foreground">{summary}</p>
                </div>

                <div className="divide-y divide-border rounded-lg border border-border">
                  {plan.records.map((r) => (
                    <label key={r.recordId} className="flex cursor-pointer items-start gap-3 px-3 py-2.5">
                      <Checkbox
                        className="mt-0.5"
                        checked={included.has(r.recordId)}
                        disabled={!r.matched}
                        onCheckedChange={(v) => toggle(r.recordId, Boolean(v))}
                        aria-label={`Include ${r.label}`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground">{r.label}</p>
                        {r.matched ? (
                          <ul className="mt-1 space-y-0.5">
                            {r.steps.map((s) => (
                              <li key={s.index} className="flex items-start gap-2 text-xs text-text-secondary">
                                <Badge variant={OUTCOME[s.outcome]?.variant || "neutral"} className="shrink-0 px-1.5 py-0 text-[10px]">
                                  {OUTCOME[s.outcome]?.label || s.outcome}
                                </Badge>
                                <span className="min-w-0">{s.message || s.summary}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="mt-0.5 text-xs text-text-tertiary">Doesn&apos;t meet the workflow&apos;s conditions — it won&apos;t run.</p>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
                {plan.missing ? <p className="text-xs text-text-tertiary">{plural(plan.missing, "record")} could not be found and were left out.</p> : null}

                {messageSteps.length ? (
                  <div className="rounded-lg border border-border">
                    <button type="button" className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-foreground" onClick={() => setEditOpen((o) => !o)}>
                      {editOpen ? <ChevronDown className="h-4 w-4 text-text-tertiary" /> : <ChevronRight className="h-4 w-4 text-text-tertiary" />}
                      Edit the message for this batch
                      <span className="ml-auto text-xs text-text-tertiary">Merge fields like {"{{tenant_first_name}}"} still work</span>
                    </button>
                    {editOpen ? (
                      <div className="grid gap-4 border-t border-border p-3">
                        {messageSteps.map((s, i) => (
                          <div key={s.id || i} className="grid gap-3">
                            {messageSteps.length > 1 ? <p className="text-xs font-medium text-text-secondary">Message {i + 1}</p> : null}
                            <Field label="Subject" htmlFor={`launch-subject-${i}`}>
                              <Input
                                id={`launch-subject-${i}`}
                                placeholder={s.config?.subject || "Keep the workflow's subject"}
                                value={overrides[s.id]?.subject ?? ""}
                                onChange={(e) => setOverride(s.id, "subject", e.target.value)}
                              />
                            </Field>
                            <Field label="Message" htmlFor={`launch-body-${i}`}>
                              <Textarea
                                id={`launch-body-${i}`}
                                className="min-h-[110px]"
                                placeholder={s.config?.body || "Keep the workflow's message"}
                                value={overrides[s.id]?.body ?? ""}
                                onChange={(e) => setOverride(s.id, "body", e.target.value)}
                              />
                            </Field>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={running || previewing || !runnable.length} onClick={run}>
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Run on {plural(runnable.length, typeLabel)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default LaunchDialog;
