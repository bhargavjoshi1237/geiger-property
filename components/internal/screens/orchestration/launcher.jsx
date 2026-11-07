"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowUpRight, CheckCircle2, ListChecks, Loader2, Play } from "lucide-react";
import { LogoLoading } from "@geiger/ui";

import { Badge } from "@geiger/ui/badge";
import { Button } from "@geiger/ui/button";
import { Checkbox } from "@geiger/ui/checkbox";
import { Textarea } from "@geiger/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@geiger/ui/sheet";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { recordTab, recordTypeLabel } from "@/lib/orchestration/records";
import { FIXES, reasonOf } from "@/lib/orchestration/reasons";
import { reviewAction } from "@/lib/orchestration/api";
import { markSignalActioned, setPendingAction } from "@/lib/orchestration/pending_action";
import { loadRecordContext } from "@/lib/context/record_context";
import { createActivity } from "@/lib/supabase/activity_log";
import { automationRunsLayer } from "@/lib/supabase/automation_runs";
import { RunWhy } from "@/components/internal/screens/automations/run_detail";
import { LaunchDialog } from "./launch_dialog";

// Insight-to-action launcher (ORCH-08). A suggested action is
//   { type: "playbook" | "workflow" | "wizard" | "report" | "tab" | "case", label, key?, recordType?, recordIds?,
//     recordId?, automationId?, tab?, itemId?, initial? }
// carried by signals (suggested_actions) and review items. SuggestedActionButton runs one: workflows and playbooks
// open a preview (dry run) to refine, then run on the selected records; wizards open the record's action wizard
// pre-filled (finishing it resolves the item / actions the signal); reports and tabs navigate; "case" opens the
// guided case sheet.

const refsOf = (signal) => signal?.recordRefs || signal?.record_refs || [];
const actionsOf = (signal) => signal?.suggestedActions || signal?.suggested_actions || [];

// Records an action applies to: explicit ids, else the signal's records of that type.
function targetsOf(action, signal) {
  if (action.recordIds?.length) return { recordType: action.recordType, recordIds: action.recordIds };
  const refs = refsOf(signal);
  const type = action.recordType || refs[0]?.type;
  return { recordType: type, recordIds: refs.filter((r) => r.type === type).map((r) => r.id) };
}

export function SuggestedActionButton({ action, signal = null, reviewItem = null, size = "sm", variant = "outline", className = "", onDone }) {
  const { setTab, openItemInTab } = useWorkspaceUrl();
  const [launch, setLaunch] = useState(false);
  const [caseOpen, setCaseOpen] = useState(false);
  const targets = useMemo(() => (action ? targetsOf(action, signal) : { recordIds: [] }), [action, signal]);
  if (!action) return null;
  const source = { ...(signal?.id ? { signalId: signal.id } : {}), ...(reviewItem?.id ? { reviewItemId: reviewItem.id } : {}) };

  const go = () => {
    switch (action.type) {
      case "workflow":
      case "playbook":
        if (!targets.recordType || !targets.recordIds.length) {
          setTab(action.type === "playbook" ? "Playbooks" : "All Workflows");
          return;
        }
        setLaunch(true);
        return;
      case "wizard": {
        const recordId = action.recordId || action.itemId || targets.recordIds[0];
        const tab = recordTab(action.recordType || targets.recordType);
        if (!recordId || !tab) return;
        setPendingAction({ recordId, actionKey: action.key, initial: action.initial, reviewItemId: reviewItem?.id, signalId: signal?.id, label: action.label });
        openItemInTab(recordId, tab);
        return;
      }
      case "case":
        setCaseOpen(true);
        return;
      default: {
        const id = action.itemId || (action.type === "tab" ? action.recordId : null);
        const tab = action.tab || recordTab(action.recordType);
        if (id && tab) openItemInTab(id, tab);
        else if (tab) setTab(tab);
      }
    }
  };

  const Icon = action.type === "workflow" || action.type === "playbook" ? Play : action.type === "case" ? ListChecks : ArrowUpRight;
  return (
    <>
      <Button
        size={size}
        variant={variant}
        className={variant === "outline" ? `border-border bg-surface-card text-muted-foreground hover:bg-surface-hover hover:text-foreground ${className}` : className}
        onClick={go}
      >
        <Icon className="h-3.5 w-3.5" /> {action.label || "Open"}
      </Button>
      {launch ? (
        <LaunchDialog
          open={launch}
          onOpenChange={setLaunch}
          recordType={targets.recordType}
          recordIds={targets.recordIds}
          automationId={action.automationId || null}
          filter={action.type === "playbook" && action.key ? (a) => a.metadata?.playbook?.key === action.key : null}
          emptyAction={action.type === "playbook" ? { label: "Open Playbooks", onClick: () => setTab("Playbooks") } : null}
          source={source}
          title={action.label}
          onDone={(res) => onDone?.(res)}
        />
      ) : null}
      {caseOpen ? <CaseSheet open={caseOpen} onOpenChange={setCaseOpen} signal={signal} reviewItem={reviewItem} onResolved={onDone} /> : null}
    </>
  );
}

// Checklist rows for a review item: its proposed action, then the reason's fixes that do something by themselves.
function reviewChecklist(item) {
  const steps = [];
  if (item.proposedAction?.summary) steps.push({ key: "proposed", label: `Run the suggestion: ${item.proposedAction.summary}`, action: "run_suggested" });
  for (const fix of reasonOf(item.reasonCode).fixes) {
    if (fix === "open_record" && item.recordId) steps.push({ key: fix, label: `Check ${item.recordLabel || "the record"}`, open: true });
    else if (["retry", "approve"].includes(fix)) steps.push({ key: fix, label: FIXES[fix].label, action: fix });
  }
  if (!steps.length) steps.push({ key: "handled", label: "Handle it outside Geiger and note what you did" });
  return steps;
}

// Guided case sheet (ORCH-08): why, the record's context, and a checklist; completing it resolves the review item
// (or actions the signal) and writes the outcome to the record's activity.
export function CaseSheet({ open, onOpenChange, signal = null, reviewItem = null, onResolved }) {
  const { openItemInTab } = useWorkspaceUrl();
  const primary = reviewItem?.recordId ? { type: reviewItem.recordType, id: reviewItem.recordId, label: reviewItem.recordLabel } : refsOf(signal)[0] || null;
  const [context, setContext] = useState(undefined);
  const [run, setRun] = useState(null);
  const [done, setDone] = useState(() => new Set());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    if (!open || !primary?.id) return undefined;
    let alive = true;
    loadRecordContext(primary.type, primary.id).then((c) => alive && setContext(c));
    return () => {
      alive = false;
    };
  }, [open, primary?.type, primary?.id]);

  const runId = reviewItem?.sourceType === "automation_run" ? reviewItem.sourceId : null;
  useEffect(() => {
    if (!open || !runId) return undefined;
    let alive = true;
    automationRunsLayer.get(runId).then((r) => alive && setRun(r));
    return () => {
      alive = false;
    };
  }, [open, runId]);

  const checklist = signal
    ? actionsOf(signal).map((a, i) => ({ key: `a${i}`, label: a.label, suggested: a }))
    : reviewItem
      ? reviewChecklist(reviewItem)
      : [];
  const allDone = checklist.length > 0 && checklist.every((s) => done.has(s.key));
  const mark = (key, on = true) =>
    setDone((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  const doAction = async (step) => {
    setBusy(step.key);
    const res = await reviewAction(reviewItem.id, step.action);
    setBusy(null);
    if (!res.ok || res.ok === false) {
      toast.error(res.error || res.message || "That didn't work.");
      return;
    }
    toast.success(res.message || "Done.");
    mark(step.key);
    if (res.item?.status === "resolved") {
      onResolved?.(res.item);
      onOpenChange(false);
    }
  };

  const complete = async () => {
    setBusy("complete");
    const steps = checklist.filter((s) => done.has(s.key)).map((s) => s.label);
    const summary = `Worked through: ${steps.join("; ")}${note.trim() ? `. ${note.trim()}` : ""}`;
    if (reviewItem) {
      const res = await reviewAction(reviewItem.id, "resolve", { note: summary });
      setBusy(null);
      if (!res.ok) return toast.error(res.error || "Couldn't close the case.");
      toast.success("Case resolved.");
      onResolved?.(res.item);
    } else if (signal) {
      await markSignalActioned(signal.id);
      if (primary?.id) await createActivity({ ownerType: primary.type === "work_order" ? "workorder" : primary.type, ownerId: primary.id, verb: "action", summary: `${signal.title}: ${summary}` });
      setBusy(null);
      toast.success("Marked as actioned.");
      onResolved?.(signal);
    }
    onOpenChange(false);
  };

  const title = reviewItem?.title || signal?.title || "Case";
  const why = reviewItem?.reasonText || signal?.why || "";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{primary ? `${recordTypeLabel(primary.type)} · ${primary.label || context?.title || ""}` : "Work through it step by step."}</SheetDescription>
        </SheetHeader>
        <div className="space-y-6 px-4 pb-8 pt-2">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-tertiary">Why</p>
            <div className="space-y-3 rounded-lg border border-border bg-surface-subtle p-3">
              {why ? <p className="text-sm text-foreground">{why}</p> : null}
              {run ? <RunWhy run={run} /> : null}
            </div>
          </div>

          {primary?.id ? (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">Context</p>
                {recordTab(primary.type) ? (
                  <Button variant="ghost" size="sm" className="h-7 text-muted-foreground hover:bg-surface-active" onClick={() => openItemInTab(primary.id, recordTab(primary.type))}>
                    Open {recordTypeLabel(primary.type).toLowerCase()} <ArrowUpRight className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
              </div>
              {context === undefined ? (
                <div className="flex justify-center py-6">
                  <LogoLoading size={32} aria-label="Loading context" />
                </div>
              ) : context ? (
                <div className="space-y-3 rounded-lg border border-border bg-surface-subtle p-3">
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    {context.facts.map((f) => (
                      <div key={f.label}>
                        <dt className="text-xs text-text-tertiary">{f.label}</dt>
                        <dd className="truncate text-foreground">{f.value}</dd>
                      </div>
                    ))}
                  </dl>
                  {context.recent.length ? (
                    <div className="border-t border-border pt-2">
                      <p className="mb-1 text-xs text-text-tertiary">Recent activity</p>
                      <ul className="space-y-1">
                        {context.recent.map((a) => (
                          <li key={a.id} className="line-clamp-1 text-xs text-text-secondary">
                            {a.summary}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="text-sm text-text-tertiary">This record is no longer available.</p>
              )}
            </div>
          ) : null}

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-tertiary">Checklist</p>
            <ul className="space-y-2">
              {checklist.map((step) => (
                <li key={step.key} className="flex items-center gap-3 rounded-lg border border-border bg-surface-subtle px-3 py-2.5">
                  <Checkbox checked={done.has(step.key)} onCheckedChange={(v) => mark(step.key, Boolean(v))} aria-label={step.label} />
                  <span className={`min-w-0 flex-1 text-sm ${done.has(step.key) ? "text-text-tertiary line-through" : "text-foreground"}`}>{step.label}</span>
                  {step.suggested ? (
                    <SuggestedActionButton action={step.suggested} signal={signal} reviewItem={reviewItem} onDone={() => mark(step.key)} />
                  ) : step.action ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-border bg-surface-card text-muted-foreground hover:bg-surface-hover hover:text-foreground"
                      disabled={busy === step.key}
                      onClick={() => doAction(step)}
                    >
                      {busy === step.key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                      {step.action === "run_suggested" ? "Run" : FIXES[step.action]?.label}
                    </Button>
                  ) : step.open && recordTab(primary?.type) ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground hover:bg-surface-active"
                      onClick={() => {
                        mark(step.key);
                        openItemInTab(primary.id, recordTab(primary.type));
                      }}
                    >
                      Open <ArrowUpRight className="h-3.5 w-3.5" />
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-tertiary">Outcome note</p>
            <Textarea className="min-h-[80px]" placeholder="What did you decide or do?" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
            <Badge variant={allDone ? "success" : "neutral"}>
              {done.size}/{checklist.length} done
            </Badge>
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={!allDone || busy === "complete"} onClick={complete}>
              {busy === "complete" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {reviewItem ? "Resolve case" : "Mark actioned"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default SuggestedActionButton;
