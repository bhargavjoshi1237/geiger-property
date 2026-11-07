"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlarmClock,
  ArrowUpRight,
  Check,
  ChevronDown,
  FileText,
  ListChecks,
  Loader2,
  Play,
  RotateCcw,
  Settings2,
  UserPlus,
  X,
} from "lucide-react";
import { LogoLoading } from "@geiger/ui";

import { Badge } from "@geiger/ui/badge";
import { Button } from "@geiger/ui/button";
import { Input } from "@geiger/ui/input";
import { Textarea } from "@geiger/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@geiger/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@geiger/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@geiger/ui/dropdown-menu";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@geiger/ui/select";
import { Field, SearchInput, StatusPill } from "@/components/internal/shared/screen_kit";
import { usePermission } from "@/context/rbac-context";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { reviewAction, attachmentUrl } from "@/lib/orchestration/api";
import { FIXES, reasonOf } from "@/lib/orchestration/reasons";
import { recordTab, recordTypeLabel } from "@/lib/orchestration/records";
import { RECIPIENT_OPTIONS, stepSummary } from "@/lib/automations/catalog";
import { loadRecordContext } from "@/lib/context/record_context";
import { automationRunsLayer } from "@/lib/supabase/automation_runs";
import { listTenants } from "@/lib/supabase/tenants";
import { vendorsLayer } from "@/lib/supabase/vendors";
import { ownersLayer } from "@/lib/supabase/owners";
import { RunSteps, RunWhy } from "@/components/internal/screens/automations/run_detail";
import { CaseSheet } from "./launcher";
import { HISTORY_LABELS, REVIEW_CHANGED_EVENT, REVIEW_KIND_MAP, REVIEW_STATUS_MAP, SEVERITY_MAP, SOURCE_LABELS, timeAgo, usd } from "./constants";

// Review item detail (ORCH-04): the plain-language reason, why the run ran, the record's context, the fixes as
// buttons, and the item's history. Actions run server-side (POST /api/orchestration/review) and are audited.

const outline = "border-border bg-surface-card text-muted-foreground hover:bg-surface-hover hover:text-foreground";
const label = "mb-2 text-xs font-semibold uppercase tracking-wider text-text-tertiary";
const DAY = 86400000;

const SNOOZE_PRESETS = [
  { key: "4h", label: "4 hours", ms: 4 * 3600000 },
  { key: "1d", label: "Tomorrow", ms: DAY },
  { key: "3d", label: "3 days", ms: 3 * DAY },
  { key: "1w", label: "A week", ms: 7 * DAY },
];

const PARTY_LOADERS = {
  tenant: async () => ((await listTenants()) || []).map((t) => ({ id: t.id, label: t.name, hint: [t.unit, t.email].filter(Boolean).join(" · ") })),
  vendor: async () => ((await vendorsLayer.list()) || []).map((v) => ({ id: v.id, label: v.name, hint: [v.specialty, v.email].filter(Boolean).join(" · ") })),
  owner: async () => ((await ownersLayer.list()) || []).map((o) => ({ id: o.id, label: o.name, hint: o.email || "" })),
};

export const announceReviewChange = () => {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(REVIEW_CHANGED_EVENT));
};

// Change the failed step's inputs (another recipient, another amount, another vendor) and retry from there.
function AdjustDialog({ open, onOpenChange, step, busy, onSubmit }) {
  const c = step?.config || {};
  const [recipient, setRecipient] = useState(c.recipient || "tenant");
  const [email, setEmail] = useState(c.email || "");
  const [amount, setAmount] = useState(c.amount ?? "");
  const [vendorId, setVendorId] = useState(c.vendorId || "");
  const [vendors, setVendors] = useState([]);
  useEffect(() => {
    if (!open || step?.type !== "assign") return undefined;
    let alive = true;
    vendorsLayer.list().then((rows) => alive && setVendors(rows || []));
    return () => {
      alive = false;
    };
  }, [open, step?.type]);

  const submit = () => {
    if (step.type === "send_email") {
      if (recipient === "custom" && !/^\S+@\S+\.\S+$/.test(email)) return toast.error("Enter a valid email address.");
      return onSubmit({ recipient, ...(recipient === "custom" ? { email } : {}) });
    }
    if (step.type === "post_charge") {
      if (!(Number(amount) > 0)) return toast.error("Enter an amount greater than zero.");
      return onSubmit({ amountType: "fixed", amount: Number(amount) });
    }
    if (step.type === "assign") {
      if (!vendorId) return toast.error("Pick a vendor.");
      return onSubmit({ mode: "vendor", vendorId });
    }
    return undefined;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change and retry</DialogTitle>
          <DialogDescription>Edit the failed step for this run only, then retry from it. The workflow itself doesn&apos;t change.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <p className="text-sm text-text-secondary">{step ? stepSummary(step) : ""}</p>
          {step?.type === "send_email" ? (
            <>
              <Field label="Send to" htmlFor="adjust-recipient">
                <Select value={recipient} onValueChange={setRecipient}>
                  <SelectTrigger id="adjust-recipient" className="w-full bg-surface-card">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RECIPIENT_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              {recipient === "custom" ? (
                <Field label="Email address" htmlFor="adjust-email">
                  <Input id="adjust-email" type="email" placeholder="someone@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                </Field>
              ) : null}
            </>
          ) : null}
          {step?.type === "post_charge" ? (
            <Field label="Amount" htmlFor="adjust-amount">
              <Input id="adjust-amount" type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
          ) : null}
          {step?.type === "assign" ? (
            <Field label="Vendor" htmlFor="adjust-vendor">
              <Select value={vendorId} onValueChange={setVendorId}>
                <SelectTrigger id="adjust-vendor" className="w-full bg-surface-card">
                  <SelectValue placeholder="Choose a vendor" />
                </SelectTrigger>
                <SelectContent>
                  {vendors.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                      {v.specialty ? ` · ${v.specialty}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={busy} onClick={submit}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} Change and retry
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Link an unknown intake sender to a tenant / vendor / owner; the stored email is re-filed as them.
function LinkPersonDialog({ open, onOpenChange, types, busy, onSubmit }) {
  const [type, setType] = useState(types[0] || "tenant");
  const [people, setPeople] = useState(null);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState("");
  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    (PARTY_LOADERS[type] || (async () => []))().then((rows) => {
      if (!alive) return;
      setPeople(rows);
    });
    return () => {
      alive = false;
    };
  }, [open, type]);
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (people || []).filter((p) => !q || `${p.label} ${p.hint}`.toLowerCase().includes(q)).slice(0, 50);
  }, [people, search]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Link to a person</DialogTitle>
          <DialogDescription>Pick who sent this email. It&apos;s filed as theirs, and their address is remembered for next time.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          {types.length > 1 ? (
            <Select
              value={type}
              onValueChange={(v) => {
                setType(v);
                setPeople(null);
                setPicked("");
              }}
            >
              <SelectTrigger className="w-full bg-surface-card" aria-label="Kind of person">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {types.map((t) => (
                  <SelectItem key={t} value={t}>
                    {recordTypeLabel(t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <SearchInput value={search} onChange={setSearch} placeholder={`Search ${recordTypeLabel(type).toLowerCase()}s…`} expanded />
          <div className="max-h-64 divide-y divide-border overflow-y-auto rounded-lg border border-border">
            {people === null ? (
              <div className="flex justify-center py-6">
                <LogoLoading size={32} aria-label="Loading people" />
              </div>
            ) : shown.length ? (
              shown.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPicked(p.id)}
                  className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-surface-hover ${picked === p.id ? "bg-surface-active" : ""}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-foreground">{p.label}</span>
                    {p.hint ? <span className="block truncate text-xs text-text-secondary">{p.hint}</span> : null}
                  </span>
                  {picked === p.id ? <Check className="h-4 w-4 text-foreground" /> : null}
                </button>
              ))
            ) : (
              <p className="px-3 py-6 text-center text-sm text-text-tertiary">Nobody matches.</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={!picked || busy} onClick={() => onSubmit({ partyType: type, partyId: picked })}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} Link and file
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ReviewDetailSheet({ item, members = [], roles = [], onClose, onChanged }) {
  const canResolve = usePermission("review.resolve");
  const canPost = usePermission("accounting.post");
  const { openItemInTab, setTab } = useWorkspaceUrl();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(null);
  const [run, setRun] = useState(null);
  const [context, setContext] = useState(undefined);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [caseOpen, setCaseOpen] = useState(false);

  const runId = item?.proposedAction?.runId || (item?.sourceType === "automation_run" ? item.sourceId : null);
  useEffect(() => {
    if (!runId) return undefined;
    let alive = true;
    automationRunsLayer.get(runId).then((r) => alive && setRun(r));
    return () => {
      alive = false;
    };
  }, [runId]);

  useEffect(() => {
    if (!item?.recordId) return undefined;
    let alive = true;
    loadRecordContext(item.recordType, item.recordId).then((c) => alive && setContext(c));
    return () => {
      alive = false;
    };
  }, [item?.recordType, item?.recordId]);

  if (!item) return null;
  const closed = item.status === "resolved" || item.status === "dismissed";
  const reason = reasonOf(item.reasonCode);
  const isBill = item.sourceType === "bill";
  const stepIndex = Number.isInteger(item.proposedAction?.step) ? item.proposedAction.step : item.metadata?.step;
  const failedStep = run && Number.isInteger(stepIndex) ? (run.steps || [])[stepIndex] : null;
  const canAdjust = ["send_email", "post_charge", "assign"].includes(failedStep?.type) && run?.status === "failed";
  const intake = item.metadata?.intake || item.intake || null;
  const tab = recordTab(item.recordType);

  const act = async (action, input = {}, okMessage) => {
    setBusy(action);
    const res = await reviewAction(item.id, action, { note, ...input });
    setBusy(null);
    if (!res.ok) {
      toast.error(res.error || "That didn't work.");
      return false;
    }
    if (res.ok && res.message && /^Still failing|Couldn't/.test(res.message)) toast.error(res.message);
    else toast.success(okMessage || res.message || "Done.");
    if (res.item) onChanged?.(res.item);
    announceReviewChange();
    setNote("");
    return true;
  };

  const fixButton = (fix) => {
    switch (fix) {
      case "open_record":
        return tab && item.recordId ? (
          <Button key={fix} variant="outline" className={outline} onClick={() => openItemInTab(item.recordId, tab)}>
            Open {recordTypeLabel(item.recordType).toLowerCase()} <ArrowUpRight className="h-4 w-4" />
          </Button>
        ) : null;
      case "retry":
        return (
          <Button key={fix} variant="outline" className={outline} disabled={!canResolve || Boolean(busy)} onClick={() => act("retry")}>
            {busy === "retry" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} Retry
          </Button>
        );
      case "adjust_and_retry":
        return canAdjust ? (
          <Button key={fix} variant="outline" className={outline} disabled={!canResolve || Boolean(busy)} onClick={() => setAdjustOpen(true)}>
            <Settings2 className="h-4 w-4" /> Change and retry
          </Button>
        ) : null;
      case "approve":
        return (
          <Button
            key={fix}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={!canResolve || (isBill && !canPost) || Boolean(busy)}
            title={isBill && !canPost ? "Approving a bill posts it to payables, which your role can't do" : undefined}
            onClick={() => act("approve")}
          >
            {busy === "approve" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Approve
          </Button>
        );
      case "reject":
        return (
          <Button key={fix} variant="outline" className={outline} disabled={!canResolve || Boolean(busy)} onClick={() => act("reject")}>
            {busy === "reject" ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />} Reject
          </Button>
        );
      case "run_suggested":
        return item.proposedAction && item.proposedAction.type !== "intake_link_sender" ? (
          <Button key={fix} className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={!canResolve || Boolean(busy)} onClick={() => act("run_suggested")}>
            {busy === "run_suggested" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} {item.proposedAction.label || "Run suggested"}
          </Button>
        ) : null;
      case "link_person":
        return (
          <Button key={fix} className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={!canResolve || Boolean(busy)} onClick={() => setLinkOpen(true)}>
            <UserPlus className="h-4 w-4" /> Link to person
          </Button>
        );
      case "open_case":
        return (
          <Button key={fix} variant="outline" className={outline} onClick={() => setCaseOpen(true)}>
            <ListChecks className="h-4 w-4" /> Work through it
          </Button>
        );
      case "open_guardrails":
        return (
          <Button key={fix} variant="outline" className={outline} onClick={() => setTab("Automation Settings")}>
            <Settings2 className="h-4 w-4" /> Open guardrails
          </Button>
        );
      case "open_settings":
        return (
          <Button key={fix} variant="outline" className={outline} onClick={() => setTab("Notifications")}>
            <Settings2 className="h-4 w-4" /> Open settings
          </Button>
        );
      default:
        return null;
    }
  };

  const fixes = reason.fixes.filter((f) => !["resolve", "dismiss"].includes(f));
  const assignedTo = item.assigneeId ? members.find((m) => m.id === item.assigneeId)?.name || "A teammate" : item.assigneeRole ? roles.find((r) => r.id === item.assigneeRole)?.name || item.assigneeRole : null;

  return (
    <Sheet open={Boolean(item)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{item.title}</SheetTitle>
          <SheetDescription>
            {REVIEW_KIND_MAP[item.kind]?.label || "Item"} · {SOURCE_LABELS[item.sourceType] || "Review"} · raised {timeAgo(item.lastRaisedAt || item.createdAt)}
            {item.occurrences > 1 ? ` · ${item.occurrences} times` : ""}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 px-4 pb-8 pt-2">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={item.status} map={REVIEW_STATUS_MAP} />
            <StatusPill status={item.severity} map={SEVERITY_MAP} />
            {item.amountAtStake ? <Badge variant="neutral">{usd(item.amountAtStake)} at stake</Badge> : null}
            {assignedTo ? <Badge variant="outline">Assigned: {assignedTo}</Badge> : null}
            {item.dueAt ? <Badge variant="outline">Due {new Date(item.dueAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</Badge> : null}
          </div>

          <div>
            <p className={label}>{reason.title}</p>
            <div className="space-y-3 rounded-lg border border-border bg-surface-subtle p-3">
              <p className="text-sm text-foreground">{item.reasonText}</p>
              {item.proposedAction?.summary ? (
                <p className="text-xs text-text-secondary">
                  It would {item.proposedAction.summary}
                  {item.amountAtStake ? ` (${usd(item.amountAtStake)})` : ""}.
                </p>
              ) : null}
              {item.metadata?.details && item.metadata.details !== item.reasonText ? (
                <details className="text-xs text-text-secondary">
                  <summary className="cursor-pointer text-text-tertiary">Technical details</summary>
                  <p className="mt-1 whitespace-pre-wrap break-words">{item.metadata.details}</p>
                </details>
              ) : null}
            </div>
          </div>

          {!closed && fixes.length ? <div className="flex flex-wrap gap-2">{fixes.map(fixButton)}</div> : null}

          {intake?.email ? (
            <div>
              <p className={label}>Email</p>
              <div className="space-y-2 rounded-lg border border-border bg-surface-subtle p-3 text-sm">
                <p className="text-text-secondary">
                  From <span className="text-foreground">{intake.email.fromName ? `${intake.email.fromName} <${intake.email.from}>` : intake.email.from}</span>
                </p>
                {intake.email.subject ? <p className="font-medium text-foreground">{intake.email.subject}</p> : null}
                {intake.email.text ? <p className="line-clamp-6 whitespace-pre-wrap text-xs text-text-secondary">{intake.email.text}</p> : null}
                {(intake.attachments || []).length ? (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {intake.attachments.map((a) => (
                      <Button
                        key={a.path}
                        size="sm"
                        variant="outline"
                        className={outline}
                        onClick={async () => {
                          const res = await attachmentUrl(a.path);
                          if (res.ok && res.url) window.open(res.url, "_blank", "noopener");
                          else toast.error(res.error || "Couldn't open the file.");
                        }}
                      >
                        <FileText className="h-3.5 w-3.5" /> {a.name}
                      </Button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {run ? (
            <div>
              <p className={label}>Why the workflow ran</p>
              <div className="space-y-4 rounded-lg border border-border bg-surface-subtle p-3">
                <RunWhy run={run} />
                <details>
                  <summary className="cursor-pointer text-xs text-text-tertiary">Steps of “{run.automationName || "the workflow"}”</summary>
                  <div className="mt-2">
                    <RunSteps run={run} />
                  </div>
                </details>
              </div>
            </div>
          ) : null}

          {item.recordId ? (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">{recordTypeLabel(item.recordType)}</p>
                {tab ? (
                  <Button variant="ghost" size="sm" className="h-7 text-muted-foreground hover:bg-surface-active" onClick={() => openItemInTab(item.recordId, tab)}>
                    Open <ArrowUpRight className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
              </div>
              {context === undefined ? (
                <div className="flex justify-center py-6">
                  <LogoLoading size={32} aria-label="Loading record" />
                </div>
              ) : context ? (
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-border bg-surface-subtle p-3 text-sm">
                  <div className="col-span-2">
                    <dt className="text-xs text-text-tertiary">Name</dt>
                    <dd className="truncate text-foreground">{context.title}</dd>
                  </div>
                  {context.facts.map((f) => (
                    <div key={f.label}>
                      <dt className="text-xs text-text-tertiary">{f.label}</dt>
                      <dd className="truncate text-foreground">{f.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="text-sm text-text-tertiary">{item.recordLabel || "The record"} is no longer available.</p>
              )}
            </div>
          ) : null}

          {!closed ? (
            <div className="space-y-3 border-t border-border pt-4">
              <Textarea className="min-h-[72px]" placeholder="Add a note (saved with your decision)…" value={note} onChange={(e) => setNote(e.target.value)} />
              <div className="flex flex-wrap items-center gap-2">
                <Button className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={!canResolve || Boolean(busy)} onClick={() => act("resolve", {}, "Resolved.")}>
                  {busy === "resolve" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Resolve
                </Button>
                <Button variant="outline" className={outline} disabled={!canResolve || Boolean(busy)} onClick={() => act("dismiss", {}, "Dismissed.")}>
                  Dismiss
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className={outline} disabled={!canResolve || Boolean(busy)}>
                      <AlarmClock className="h-4 w-4" /> Snooze <ChevronDown className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-44 border-border bg-surface-subtle">
                    {SNOOZE_PRESETS.map((p) => (
                      <DropdownMenuItem key={p.key} onClick={() => act("snooze", { until: new Date(Date.now() + p.ms).toISOString() }, `Snoozed for ${p.label.toLowerCase()}.`)}>
                        {p.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Select
                  value={item.assigneeId ? `m:${item.assigneeId}` : item.assigneeRole ? `r:${item.assigneeRole}` : "none"}
                  onValueChange={(v) => {
                    if (v === "none") return act("reassign", { assigneeId: null, assigneeRole: null });
                    const [kind, id] = [v.slice(0, 1), v.slice(2)];
                    const who = kind === "m" ? members.find((m) => m.id === id)?.name : roles.find((r) => r.id === id)?.name;
                    return act("reassign", kind === "m" ? { assigneeId: id, assigneeLabel: who } : { assigneeRole: id, assigneeLabel: who }, `Assigned to ${who || "them"}.`);
                  }}
                  disabled={!canResolve || Boolean(busy)}
                >
                  <SelectTrigger className="h-9 w-auto min-w-36 bg-surface-card" aria-label="Assign">
                    <SelectValue placeholder="Assign" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {members.length ? (
                      <SelectGroup>
                        <SelectLabel>People</SelectLabel>
                        {members.map((m) => (
                          <SelectItem key={m.id} value={`m:${m.id}`}>
                            {m.name || m.email}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ) : null}
                    {roles.length ? (
                      <SelectGroup>
                        <SelectLabel>Roles</SelectLabel>
                        {roles.map((r) => (
                          <SelectItem key={r.id} value={`r:${r.id}`}>
                            {r.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ) : null}
                  </SelectContent>
                </Select>
              </div>
              {!canResolve ? <p className="text-xs text-text-tertiary">Your role can view this queue but not act on it.</p> : null}
            </div>
          ) : item.resolution ? (
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm">
              <p className="text-foreground">
                {HISTORY_LABELS[item.resolution.action] || "Closed"} by {item.resolution.by || "someone"} · {timeAgo(item.resolution.at)}
              </p>
              {item.resolution.note ? <p className="mt-1 text-xs text-text-secondary">{item.resolution.note}</p> : null}
            </div>
          ) : null}

          <div>
            <p className={label}>History</p>
            <ol className="space-y-2 border-l border-border pl-3">
              {[...(item.history || [])].reverse().map((h, i) => (
                <li key={i} className="text-xs">
                  <span className="text-foreground">{HISTORY_LABELS[h.action] || h.action}</span>
                  {h.by ? <span className="text-text-secondary"> · {h.by}</span> : null}
                  <span className="text-text-tertiary"> · {timeAgo(h.at)}</span>
                  {h.note ? <p className="mt-0.5 text-text-secondary">{h.note}</p> : null}
                </li>
              ))}
            </ol>
          </div>
        </div>

        {adjustOpen && failedStep ? (
          <AdjustDialog
            open={adjustOpen}
            onOpenChange={setAdjustOpen}
            step={failedStep}
            busy={busy === "adjust_and_retry"}
            onSubmit={async (config) => {
              if (await act("adjust_and_retry", { step: stepIndex, config })) setAdjustOpen(false);
            }}
          />
        ) : null}
        {linkOpen ? (
          <LinkPersonDialog
            open={linkOpen}
            onOpenChange={setLinkOpen}
            types={item.proposedAction?.partyTypes || ["tenant", "vendor", "owner"]}
            busy={busy === "run_suggested"}
            onSubmit={async (input) => {
              if (await act("run_suggested", input, "Linked and filed.")) setLinkOpen(false);
            }}
          />
        ) : null}
        {caseOpen ? (
          <CaseSheet
            open={caseOpen}
            onOpenChange={setCaseOpen}
            reviewItem={item}
            onResolved={(next) => {
              if (next?.id) onChanged?.(next);
              announceReviewChange();
            }}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

export default ReviewDetailSheet;
