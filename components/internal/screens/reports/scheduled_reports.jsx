"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarClock, Download, FileCode2, MoreHorizontal, Pause, Play, Send, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import {
  DataTable,
  EmptyState,
  ListLoading,
  ScreenHeader,
  SectionCard,
  StatsBar,
  StatusPill,
} from "@/components/internal/shared/screen_kit";
import { usePermission } from "@/context/rbac-context";
import { getReport } from "@/lib/reports/catalog";
import { RANGE_PRESETS, AS_OF_PRESETS, formatIso, rangeLabel } from "@/lib/reports/periods";
import { RUN_STATUS_MAP, SCHEDULE_STATUS_MAP, scheduleLabel } from "@/lib/reports/schedule";
import {
  listReportRuns,
  listReportSchedules,
  softDeleteReportSchedule,
  updateReportSchedule,
} from "@/lib/supabase/report_schedules";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { downloadCsvText } from "./report_view";

// Scheduled Reports — every saved report schedule (property.report_schedules)
// and the runs the daily scheduler sent (property.report_runs), with the CSV /
// HTML of each run kept for download.

const periodOf = (filters = {}) =>
  filters.preset === "custom"
    ? rangeLabel(filters)
    : [...RANGE_PRESETS, ...AS_OF_PRESETS].find((p) => p.value === filters.preset)?.label || "Default period";

// Open a run's archived HTML in a new tab.
function openHtml(html) {
  const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export function ScheduledReportsScreen() {
  const [schedules, setSchedules] = useState([]);
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadedAt, setLoadedAt] = useState(0);
  const canSchedule = usePermission("reports.schedule");
  const { setTab } = useWorkspaceUrl();

  useEffect(() => {
    let alive = true;
    Promise.all([listReportSchedules(), listReportRuns()]).then(([s, r]) => {
      if (!alive) return;
      setSchedules(s ?? []);
      setRuns(r ?? []);
      setLoadedAt(Date.now());
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  const byId = useMemo(() => new Map(schedules.map((s) => [s.id, s])), [schedules]);

  const stats = useMemo(() => {
    const active = schedules.filter((s) => s.status === "Active");
    const recipients = new Set(active.flatMap((s) => s.recipients || []));
    const recent = runs.filter((r) => loadedAt - new Date(r.createdAt).getTime() < 30 * 86400000);
    return [
      { label: "Schedules", value: String(schedules.length), footer: `${active.length} active` },
      { label: "Recipients", value: String(recipients.size), footer: "Across active schedules" },
      { label: "Runs (30 days)", value: String(recent.length), footer: `${recent.filter((r) => r.status === "sent").length} sent` },
      { label: "Needs attention", value: String(recent.filter((r) => r.status !== "sent").length), footer: "Failed or not configured" },
    ];
  }, [schedules, runs, loadedAt]);

  const togglePause = async (s) => {
    const status = s.status === "Paused" ? "Active" : "Paused";
    setSchedules((prev) => prev.map((x) => (x.id === s.id ? { ...x, status } : x)));
    if (await updateReportSchedule(s.id, { status })) toast.success(status === "Paused" ? "Schedule paused." : "Schedule resumed.");
    else {
      setSchedules((prev) => prev.map((x) => (x.id === s.id ? s : x)));
      toast.error("Couldn't update the schedule.");
    }
  };

  const remove = async (s) => {
    setSchedules((prev) => prev.filter((x) => x.id !== s.id));
    if (await softDeleteReportSchedule(s.id)) toast.success("Schedule deleted.");
    else {
      setSchedules((prev) => [s, ...prev]);
      toast.error("Couldn't delete the schedule.");
    }
  };

  const scheduleColumns = [
    {
      key: "name",
      header: "Schedule",
      render: (s) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-medium text-foreground">{s.name}</span>
          <span className="text-xs text-text-secondary">{getReport(s.reportKey)?.title || s.reportKey} · {periodOf(s.filters)}</span>
        </div>
      ),
    },
    { key: "when", header: "Sends", className: "text-text-secondary", render: (s) => scheduleLabel(s) },
    {
      key: "recipients",
      header: "Recipients",
      className: "max-w-64 truncate text-text-secondary",
      render: (s) => (s.recipients || []).join(", ") || "—",
    },
    { key: "status", header: "Status", render: (s) => <StatusPill status={s.status} map={SCHEDULE_STATUS_MAP} /> },
    {
      key: "last",
      header: "Last run",
      className: "whitespace-nowrap text-text-secondary",
      render: (s) => (s.lastRunAt ? `${formatIso(s.lastRunAt)}${s.lastStatus ? ` · ${RUN_STATUS_MAP[s.lastStatus]?.label || s.lastStatus}` : ""}` : "Not yet"),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (s) => (
        <div onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Schedule actions">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="border-border bg-surface-subtle">
              <DropdownMenuItem onClick={() => getReport(s.reportKey) && setTab(getReport(s.reportKey).title)}>
                <Send className="h-4 w-4" /> Open report
              </DropdownMenuItem>
              {canSchedule ? (
                <>
                  <DropdownMenuItem onClick={() => togglePause(s)}>
                    {s.status === "Paused" ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                    {s.status === "Paused" ? "Resume" : "Pause"}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" className="text-red-600 dark:text-red-400 focus:bg-red-500/10" onClick={() => remove(s)}>
                    <Trash2 className="h-4 w-4" /> Delete
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ];

  const runColumns = [
    {
      key: "created",
      header: "Sent",
      className: "whitespace-nowrap text-text-secondary",
      render: (r) => formatIso(r.createdAt),
    },
    {
      key: "schedule",
      header: "Schedule",
      render: (r) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-medium text-foreground">{byId.get(r.scheduleId)?.name || getReport(r.reportKey)?.title || r.reportKey}</span>
          <span className="text-xs text-text-secondary">Period {r.periodKey} · {r.rowCount} rows</span>
        </div>
      ),
    },
    { key: "status", header: "Status", render: (r) => <StatusPill status={r.status} map={RUN_STATUS_MAP} /> },
    {
      key: "sent",
      header: "Delivered",
      className: "text-text-secondary",
      render: (r) => `${r.sentCount} of ${(r.recipients || []).length}`,
    },
    {
      key: "files",
      header: "",
      align: "right",
      render: (r) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-text-secondary hover:bg-surface-hover hover:text-foreground"
            disabled={!r.csv}
            onClick={() => downloadCsvText(`${getReport(r.reportKey)?.title || "report"} ${r.periodKey}`, r.csv || "")}
          >
            <Download className="h-3.5 w-3.5" /> CSV
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-text-secondary hover:bg-surface-hover hover:text-foreground"
            disabled={!r.html}
            onClick={() => openHtml(r.html || "")}
          >
            <FileCode2 className="h-3.5 w-3.5" /> View
          </Button>
        </div>
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Scheduled Reports"
        description="Reports emailed on a schedule. Create one from any report's Schedule button; every run's CSV and HTML is kept here."
      />
      {loading ? (
        <ListLoading label="Loading scheduled reports" />
      ) : (
        <>
          <StatsBar stats={stats} />
          <SectionCard title="Schedules" bodyPadding={false}>
            {schedules.length ? (
              <div className="overflow-x-auto">
                <DataTable columns={scheduleColumns} data={schedules} getRowKey={(s) => s.id} className="rounded-none border-0" />
              </div>
            ) : (
              <EmptyState
                icon={CalendarClock}
                title="No scheduled reports yet"
                description="Open any report under Reports and choose Schedule to email it daily, weekly or monthly."
                className="py-12"
              />
            )}
          </SectionCard>
          <SectionCard title="Recent runs" description="Delivered by the daily scheduler; one run per schedule per period." bodyPadding={false}>
            {runs.length ? (
              <div className="overflow-x-auto">
                <DataTable columns={runColumns} data={runs.slice(0, 100)} getRowKey={(r) => r.id} className="rounded-none border-0" />
              </div>
            ) : (
              <EmptyState icon={Send} title="Nothing sent yet" description="Runs appear here after the scheduler sends a report." className="py-12" />
            )}
          </SectionCard>
        </>
      )}
    </MainScreenWrapper>
  );
}

export default ScheduledReportsScreen;
