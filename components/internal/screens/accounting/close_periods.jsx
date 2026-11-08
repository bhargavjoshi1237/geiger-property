"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarCheck, CheckCircle2, CircleAlert, ExternalLink, Loader2, Lock, LockOpen } from "lucide-react";
import { LogoLoading } from "@geiger/ui";

import { DataTable, EmptyState, Field, ListLoading, SectionCard, StatusPill } from "@/components/internal/shared/screen_kit";
import { WizardDialog } from "@/components/internal/shared/wizard_dialog";
import { RoleGate } from "@/components/internal/shared/role_gate";
import { Button } from "@geiger/ui/button";
import { Input } from "@geiger/ui/input";
import { Textarea } from "@geiger/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@geiger/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@geiger/ui/select";
import { usePermission } from "@/context/rbac-context";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { getSetting } from "@/lib/supabase/settings";
import {
  closePeriod,
  getLockedThrough,
  listPeriods,
  periodsErrorMessage,
  reopenPeriod,
  runPeriodChecks,
} from "@/lib/supabase/accounting_periods";
import { checklistSnapshot, missingOverrides } from "@/lib/accounting/close_checks";
import {
  MONTH_NAMES,
  closableMonths,
  closedThroughLabel,
  firstOpenDate,
  fiscalYearRange,
  monthLabel,
  nextClosablePeriod,
  normalizeStartMonth,
  shortDate,
} from "@/lib/ledger/periods";
import { formatDate, todayISO } from "./shared";

// Close Periods (CORE-40): close a month after its checklist, reopen the latest close with a reason, and the history of both.
// Virtual close: closing the fiscal year's last month also closes the year; reports roll prior years into retained earnings.

export const CLOSE_PERMISSION = "property.accounting.close";
export const NO_CLOSE = "Your role can't close or reopen periods.";
export const useCanClose = () => usePermission(CLOSE_PERMISSION);

const PERIOD_STATUS_MAP = {
  closed: { label: "Closed", variant: "success" },
  reopened: { label: "Reopened", variant: "warning" },
};

const periodTitle = (p) => (p.kind === "year" ? `Fiscal year ${p.periodEnd.slice(0, 4)}` : monthLabel(p.periodStart));
const periodOf = (end) => (end ? { start: `${end.slice(0, 7)}-01`, end, key: end.slice(0, 7) } : null);
const stamp = (at) => (at ? formatDate(String(at).slice(0, 10)) : "");

// The fiscal-year start month from accounting_settings (January when unset).
function useFiscalYearStart(reloadKey) {
  const [start, setStart] = useState(1);
  useEffect(() => {
    let alive = true;
    getSetting("accounting_settings", {}).then((s) => alive && setStart(normalizeStartMonth(s?.fiscalYearStartMonth)));
    return () => {
      alive = false;
    };
  }, [reloadKey]);
  return start;
}

// One event of a period's history as a sentence.
function eventLine(e) {
  const who = e.byName ? ` by ${e.byName}` : "";
  if (e.action === "reopened") return `Reopened ${stamp(e.at)}${who}${e.reason ? `: ${e.reason}` : ""}`;
  return `Closed ${stamp(e.at)}${who}`;
}

// The checklist step: runs the checks for the period and takes an override note per failing check.
function ChecklistStep({ period, values, set, onNavigate }) {
  const fresh = values.checksFor === period?.end;
  useEffect(() => {
    if (!period || fresh) return;
    let alive = true;
    runPeriodChecks(period).then((results) => {
      if (!alive) return;
      if (!results) toast.error(periodsErrorMessage() || "Couldn't run the close checks.");
      set({ checks: results || [], checksFor: period.end, notes: {} });
    });
    return () => {
      alive = false;
    };
    // set changes identity every render; the period is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period?.end, fresh]);

  if (!fresh) {
    return (
      <div className="flex flex-col items-center gap-2 py-8">
        <LogoLoading size={36} aria-label="Running the close checks" />
        <p className="text-sm text-text-secondary">Checking {monthLabel(period?.start)}…</p>
      </div>
    );
  }
  const notes = values.notes || {};
  const failing = (values.checks || []).filter((c) => !c.ok).length;
  return (
    <div className="space-y-3">
      <p className="text-sm text-text-secondary">
        {failing ? `${failing} of ${values.checks.length} checks need attention. Fix them first, or explain why the month can close anyway.` : "Every check passes."}
      </p>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {(values.checks || []).map((c) => (
          <li key={c.key} className="space-y-2 px-3 py-2.5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-2">
                {c.ok ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{c.label}</p>
                  {c.detail ? <p className="text-xs text-text-secondary">{c.detail}</p> : null}
                </div>
              </div>
              {!c.ok && c.link ? (
                <Button variant="ghost" size="sm" className="shrink-0 text-muted-foreground hover:bg-surface-active hover:text-foreground" onClick={() => onNavigate(c.link)}>
                  <ExternalLink className="h-3.5 w-3.5" /> {c.link}
                </Button>
              ) : null}
            </div>
            {!c.ok ? (
              <Input
                aria-label={`Override note for ${c.label}`}
                placeholder="Why the month can close anyway (required to override)"
                value={notes[c.key] || ""}
                onChange={(e) => set({ notes: { ...notes, [c.key]: e.target.value } })}
              />
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

// Close wizard: the month (the next unclosed one), the checklist with overrides, then confirm.
export function ClosePeriodWizard({ open, onOpenChange, onClosed }) {
  const { setTab } = useWorkspaceUrl();
  const [lockedThrough, setLockedThrough] = useState(null);
  const fyStart = useFiscalYearStart(open ? 1 : 0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setLockedThrough(null);
  }
  useEffect(() => {
    if (!open) return;
    let alive = true;
    getLockedThrough({ fresh: true }).then((d) => alive && setLockedThrough(d ?? ""));
    return () => {
      alive = false;
    };
  }, [open]);

  const today = todayISO();
  const months = useMemo(() => (lockedThrough === null ? [] : closableMonths(lockedThrough, today)), [lockedThrough, today]);
  const endOf = (values) => values.periodEnd || months[0]?.end || "";
  const yearEnds = (end) => Boolean(end) && fiscalYearRange(end, fyStart).end === end;

  const steps = [
    {
      key: "month",
      title: "Month",
      render: ({ values, set }) => {
        if (lockedThrough === null) {
          return (
            <div className="flex justify-center py-8">
              <LogoLoading size={36} aria-label="Loading the close status" />
            </div>
          );
        }
        if (!months.length) {
          return (
            <p className="text-sm text-text-secondary">
              {closedThroughLabel(lockedThrough)}. {monthLabel(firstOpenDate(lockedThrough))} can close once it ends.
            </p>
          );
        }
        if (lockedThrough) {
          return (
            <div className="space-y-2 text-sm text-text-secondary">
              <p>
                {closedThroughLabel(lockedThrough)}. Periods close in order, so the next one is <span className="font-medium text-foreground">{monthLabel(months[0].start)}</span>.
              </p>
              <p>Once closed, nothing can post on or before {shortDate(months[0].end)} until the month is reopened.</p>
            </div>
          );
        }
        return (
          <div className="space-y-3">
            <p className="text-sm text-text-secondary">Nothing is closed yet. Pick the month to close through — every earlier month closes with it.</p>
            <Field label="Close through" htmlFor="close-month">
              <Select value={endOf(values)} onValueChange={(v) => set({ periodEnd: v, checksFor: "" })}>
                <SelectTrigger id="close-month" className="bg-surface-card">
                  <SelectValue placeholder="Pick a month" />
                </SelectTrigger>
                <SelectContent>
                  {months.map((m) => (
                    <SelectItem key={m.end} value={m.end}>
                      {monthLabel(m.start)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
        );
      },
      validate: (values) => (endOf(values) ? null : lockedThrough === null ? "Still loading the close status." : "There's no month ready to close yet."),
    },
    {
      key: "checks",
      title: "Checklist",
      render: ({ values, set }) => (
        <ChecklistStep
          period={periodOf(endOf(values))}
          values={values}
          set={set}
          onNavigate={(tab) => {
            onOpenChange(false);
            setTab(tab);
          }}
        />
      ),
      validate: (values) => {
        if (values.checksFor !== endOf(values)) return "Wait for the checks to finish.";
        return missingOverrides(values.checks || [], values.notes).length ? "Add a note to each failing check, or fix it first." : null;
      },
    },
    {
      key: "confirm",
      title: "Confirm",
      render: ({ values }) => {
        const end = endOf(values);
        const overridden = (values.checks || []).filter((c) => !c.ok);
        return (
          <div className="space-y-3 text-sm text-text-secondary">
            <p>
              Close <span className="font-medium text-foreground">{monthLabel(end)}</span>. Nothing posts on or before {shortDate(end)} until it&apos;s reopened; voids land on the first open day and bank reconciliation keeps working.
            </p>
            {yearEnds(end) ? <p>This is the last month of fiscal year {end.slice(0, 4)}, so the year closes too. Reports carry its earnings into retained earnings.</p> : null}
            {overridden.length ? (
              <ul className="list-disc space-y-1 pl-5">
                {overridden.map((c) => (
                  <li key={c.key}>
                    <span className="text-foreground">{c.label}</span> — {String(values.notes?.[c.key] || "").trim()}
                  </li>
                ))}
              </ul>
            ) : (
              <p>Every check passed.</p>
            )}
          </div>
        );
      },
    },
  ];

  const finish = async (values) => {
    const end = endOf(values);
    const id = await closePeriod({ periodEnd: end, checklist: checklistSnapshot(values.checks || [], values.notes) });
    if (!id) {
      toast.error(periodsErrorMessage() || "Couldn't close the period.");
      return false;
    }
    toast.success(`${monthLabel(end)} closed. Books closed through ${shortDate(end)}.`);
    onClosed?.(id);
    return true;
  };

  return (
    <WizardDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Close period"
      description="Lock a month so nothing posts into it. Reopening needs a reason and is recorded."
      steps={steps}
      initial={{ periodEnd: "", checks: [], checksFor: "", notes: {} }}
      onFinish={finish}
      finishLabel="Close Period"
    />
  );
}

// Reopen the latest closed period: a reason is required and recorded.
export function ReopenPeriodDialog({ period, onOpenChange, onReopened }) {
  const open = Boolean(period);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const canClose = useCanClose();
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setReason("");
  }

  const run = async () => {
    if (!reason.trim()) {
      toast.error("Give a reason for reopening the period.");
      return;
    }
    setBusy(true);
    const id = await reopenPeriod(period.id, reason);
    setBusy(false);
    if (!id) {
      toast.error(periodsErrorMessage() || "Couldn't reopen the period.");
      return;
    }
    toast.success(`${periodTitle(period)} reopened.`);
    onReopened?.(id);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reopen {period ? periodTitle(period) : "period"}</DialogTitle>
          <DialogDescription>Postings dated in this period are allowed again until it closes. The reason stays in the close history.</DialogDescription>
        </DialogHeader>
        <Field label="Reason" htmlFor="reopen-reason">
          <Textarea id="reopen-reason" rows={3} placeholder="e.g. A vendor bill for March arrived late" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={busy || !canClose || !reason.trim()} onClick={run}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockOpen className="h-4 w-4" />}
            Reopen Period
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// The Close periods tab: where the books stand, and every close and reopen.
export function ClosePeriodsPanel({ reloadKey = 0, onChanged, onClose }) {
  const [rows, setRows] = useState(null);
  const [lockedThrough, setLockedThrough] = useState(null);
  const [reopening, setReopening] = useState(null);
  const canClose = useCanClose();
  const fyStart = useFiscalYearStart(reloadKey);

  useEffect(() => {
    let alive = true;
    Promise.all([listPeriods(), getLockedThrough({ fresh: true })]).then(([periods, locked]) => {
      if (!alive) return;
      setRows(periods || []);
      setLockedThrough(locked ?? "");
    });
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  if (rows === null) return <ListLoading label="Loading closed periods" />;
  const latest = rows.find((r) => r.kind === "month" && r.status === "closed" && r.periodEnd === lockedThrough) || null;
  const next = nextClosablePeriod(lockedThrough, todayISO());
  const fyLabel = `Fiscal year starts in ${MONTH_NAMES[fyStart - 1]}`;

  const columns = [
    {
      key: "period",
      header: "Period",
      render: (p) => (
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="font-medium text-foreground">{periodTitle(p)}</span>
          <span className="text-xs text-text-secondary">
            {formatDate(p.periodStart)} – {formatDate(p.periodEnd)}
          </span>
        </div>
      ),
    },
    { key: "status", header: "Status", render: (p) => <StatusPill status={p.status} map={PERIOD_STATUS_MAP} /> },
    {
      key: "checks",
      header: "Checklist",
      className: "text-sm text-text-secondary",
      render: (p) => {
        if (p.kind === "year") return "—";
        const overridden = p.checklist.filter((c) => !c.ok).length;
        return overridden ? `${overridden} overridden` : p.checklist.length ? "All passed" : "—";
      },
    },
    {
      key: "history",
      header: "History",
      className: "max-w-md text-sm text-text-secondary",
      render: (p) => (
        <div className="flex flex-col gap-0.5">
          {(p.history.length ? p.history : [{ action: "closed", at: p.closedAt, byName: p.closedByName }]).map((e, i) => (
            <span key={i} className={e.action === "reopened" ? "text-amber-700 dark:text-amber-400" : undefined}>
              {eventLine(e)}
            </span>
          ))}
        </div>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      className: "w-32 text-right",
      render: (p) =>
        latest && p.id === latest.id ? (
          <RoleGate allowed={canClose} reason={NO_CLOSE}>
            <Button variant="outline" size="sm" className="border-border bg-surface-card" disabled={!canClose} onClick={() => setReopening(p)}>
              <LockOpen className="h-3.5 w-3.5" /> Reopen
            </Button>
          </RoleGate>
        ) : null,
    },
  ];

  return (
    <div className="space-y-4">
      <SectionCard
        title={lockedThrough ? closedThroughLabel(lockedThrough) : "No periods closed yet"}
        description={`${fyLabel}. ${next ? `Next to close: ${monthLabel(next.start)}.` : lockedThrough ? "The next month can close once it ends." : ""} Closing locks the month; reports roll earlier fiscal years into retained earnings.`}
        action={
          <RoleGate allowed={canClose} reason={NO_CLOSE}>
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={!canClose || !next} onClick={onClose}>
              <Lock className="h-4 w-4" /> Close Period
            </Button>
          </RoleGate>
        }
      />
      <DataTable
        columns={columns}
        data={rows}
        getRowKey={(p) => p.id}
        empty={
          <div className="rounded-xl border border-border bg-surface-subtle">
            <EmptyState icon={CalendarCheck} title="No periods closed yet" description="Close a month once its checklist passes; it shows here with who closed it and any reopen." />
          </div>
        }
      />
      <ReopenPeriodDialog
        period={reopening}
        onOpenChange={(o) => !o && setReopening(null)}
        onReopened={() => onChanged?.()}
      />
    </div>
  );
}
