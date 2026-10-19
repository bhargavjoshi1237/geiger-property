"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Pause, Play, Trash2 } from "lucide-react";

import { Button } from "@geiger/ui/button";
import { Input } from "@geiger/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@geiger/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@geiger/ui/select";
import { Field, StatusPill } from "@/components/internal/shared/screen_kit";
import { getUser } from "@/lib/supabase/user";
import {
  createReportSchedule,
  listReportSchedules,
  softDeleteReportSchedule,
  updateReportSchedule,
} from "@/lib/supabase/report_schedules";
import { RANGE_PRESETS, AS_OF_PRESETS, rangeLabel } from "@/lib/reports/periods";
import {
  FREQUENCY_OPTIONS,
  MONTH_DAY_OPTIONS,
  SCHEDULE_STATUS_MAP,
  WEEKDAY_OPTIONS,
  parseRecipients,
  scheduleLabel,
} from "@/lib/reports/schedule";

// Schedule dialog: save the report's current filters as a recurring email
// (property.report_schedules), and manage this report's existing schedules.

function SimpleSelect({ id, value, onChange, options }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-full bg-surface-card">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// Filters worth saving: presets re-resolve at send time; custom ranges stay fixed.
export function storableFilters(filters) {
  const { from, to, ...rest } = filters;
  return rest.preset === "custom" ? { ...rest, from, to } : rest;
}

const EMPTY = { name: "", frequency: "monthly", dayOfWeek: "1", dayOfMonth: "1", recipients: "" };

export function ScheduleDialog({ open, onOpenChange, report, filters, periodMode = "range" }) {
  const [draft, setDraft] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [schedules, setSchedules] = useState(null);
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));

  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    listReportSchedules(report.key).then((rows) => alive && setSchedules(rows ?? []));
    return () => {
      alive = false;
    };
  }, [open, report.key]);

  const presetLabel = [...RANGE_PRESETS, ...AS_OF_PRESETS].find((p) => p.value === filters.preset)?.label;
  const periodText =
    filters.preset === "custom" ? `Fixed: ${rangeLabel(filters)}` : `${presetLabel || "Current period"} (recalculated at each send)`;

  const submit = async () => {
    const { valid, invalid } = parseRecipients(draft.recipients);
    if (!valid.length) {
      toast.error("Add at least one recipient email.");
      return;
    }
    if (invalid.length) {
      toast.error(`Not an email: ${invalid.slice(0, 3).join(", ")}`);
      return;
    }
    setBusy(true);
    const user = await getUser();
    const freq = FREQUENCY_OPTIONS.find((f) => f.value === draft.frequency)?.label || "";
    const row = {
      id: crypto.randomUUID(),
      name: draft.name.trim() || `${report.title} · ${freq}`,
      reportKey: report.key,
      filters: storableFilters(filters),
      recipients: valid,
      frequency: draft.frequency,
      dayOfWeek: Number(draft.dayOfWeek),
      dayOfMonth: Number(draft.dayOfMonth),
      status: "Active",
      createdBy: user?.id || null,
    };
    setSchedules((prev) => [row, ...(prev || [])]);
    const created = await createReportSchedule(row);
    setBusy(false);
    if (!created) {
      setSchedules((prev) => (prev || []).filter((s) => s.id !== row.id));
      toast.error("Couldn't save the schedule.");
      return;
    }
    setSchedules((prev) => (prev || []).map((s) => (s.id === row.id ? created : s)));
    setDraft(EMPTY);
    toast.success(`Scheduled — ${scheduleLabel(created).toLowerCase()} to ${valid.length} recipient${valid.length === 1 ? "" : "s"}.`);
  };

  const togglePause = async (s) => {
    const status = s.status === "Paused" ? "Active" : "Paused";
    setSchedules((prev) => prev.map((x) => (x.id === s.id ? { ...x, status } : x)));
    if (!(await updateReportSchedule(s.id, { status }))) {
      setSchedules((prev) => prev.map((x) => (x.id === s.id ? s : x)));
      toast.error("Couldn't update the schedule.");
    }
  };

  const remove = async (s) => {
    setSchedules((prev) => prev.filter((x) => x.id !== s.id));
    if (!(await softDeleteReportSchedule(s.id))) {
      setSchedules((prev) => [s, ...prev]);
      toast.error("Couldn't delete the schedule.");
    } else toast.success("Schedule deleted.");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Schedule {report.title}</DialogTitle>
          <DialogDescription>
            Email a summary of this report with its current filters. Sent by the daily scheduler once email delivery is
            configured; the CSV and HTML of each run are kept under Reports → Scheduled Reports.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="sr-name" className="sm:col-span-2">
            <Input id="sr-name" value={draft.name} onChange={(e) => set("name")(e.target.value)} placeholder={`${report.title} · Monthly`} />
          </Field>
          <Field label="Frequency" htmlFor="sr-freq">
            <SimpleSelect id="sr-freq" value={draft.frequency} onChange={set("frequency")} options={FREQUENCY_OPTIONS} />
          </Field>
          {draft.frequency === "weekly" ? (
            <Field label="Day" htmlFor="sr-dow">
              <SimpleSelect id="sr-dow" value={draft.dayOfWeek} onChange={set("dayOfWeek")} options={WEEKDAY_OPTIONS} />
            </Field>
          ) : draft.frequency === "monthly" ? (
            <Field label="Day of month" htmlFor="sr-dom">
              <SimpleSelect id="sr-dom" value={draft.dayOfMonth} onChange={set("dayOfMonth")} options={MONTH_DAY_OPTIONS} />
            </Field>
          ) : (
            <div />
          )}
          <Field label="Recipients" htmlFor="sr-to" hint="Separate addresses with commas." className="sm:col-span-2">
            <Input id="sr-to" value={draft.recipients} onChange={(e) => set("recipients")(e.target.value)} placeholder="owner@example.com, accounting@example.com" />
          </Field>
          <Field label={periodMode === "asOf" ? "As of" : "Period"} className="sm:col-span-2">
            <p className="rounded-md border border-border bg-surface-card px-3 py-2 text-sm text-text-secondary">{periodText}</p>
          </Field>
        </div>
        {schedules?.length ? (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wider text-text-tertiary">Existing schedules</p>
            <ul className="divide-y divide-border rounded-lg border border-border">
              {schedules.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-foreground">{s.name}</p>
                    <p className="truncate text-xs text-text-secondary">
                      {scheduleLabel(s)} · {(s.recipients || []).join(", ")}
                    </p>
                  </div>
                  <StatusPill status={s.status} map={SCHEDULE_STATUS_MAP} />
                  <Button variant="ghost" size="icon-sm" onClick={() => togglePause(s)} aria-label={s.status === "Paused" ? "Resume schedule" : "Pause schedule"}>
                    {s.status === "Paused" ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-red-600 dark:text-red-400 hover:bg-red-500/10"
                    onClick={() => remove(s)}
                    aria-label="Delete schedule"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={busy} onClick={submit}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save Schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
