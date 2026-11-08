"use client";

import React from "react";
import { CalendarClock, Inbox } from "lucide-react";
import { DataTable, EmptyState, ScreenHeader, SectionCard, StatusPill } from "@/components/internal/shared/screen_kit";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { JOB_RUN_STATUS_MAP, JOB_TRIGGER_LABEL, formatDateTime } from "@/components/internal/screens/automations/shared";

// Operator view (PLAT-01h): events that belong to no project — unattributed inbound mail and scheduler failures — for
// PROPERTY_OPERATOR_EMAILS only. Read-only; rendered from server data (app/operator/page.js).

const EVENT_STATE_MAP = {
  open: { label: "Open", variant: "warning" },
  resolved: { label: "Resolved", variant: "success" },
};

const detailLine = (e) => {
  const d = e.detail || {};
  if (e.kind === "inbound_unattributed") return [d.from && `From ${d.from}`, d.to?.length && `to ${d.to.join(", ")}`, d.subject && `“${d.subject}”`].filter(Boolean).join(" · ");
  return d.message || "";
};

const EVENT_COLUMNS = [
  { key: "state", header: "State", render: (e) => <StatusPill status={e.resolvedAt ? "resolved" : "open"} map={EVENT_STATE_MAP} /> },
  {
    key: "summary",
    header: "Event",
    render: (e) => (
      <div className="min-w-0">
        <p className="truncate font-medium text-foreground">{e.summary}</p>
        <p className="truncate text-xs text-text-secondary">{detailLine(e) || e.kindLabel}</p>
      </div>
    ),
  },
  { key: "source", header: "Source", render: (e) => <span className="font-mono text-xs text-text-secondary">{e.source || "—"}</span> },
  { key: "count", header: "Seen", align: "right", render: (e) => e.occurrences },
  { key: "last", header: "Last seen", render: (e) => formatDateTime(e.lastSeenAt) },
];

const RUN_COLUMNS = [
  { key: "status", header: "Status", render: (r) => <StatusPill status={r.status} map={JOB_RUN_STATUS_MAP} /> },
  { key: "job", header: "Job", render: (r) => <span className="font-mono text-xs">{r.jobKey}</span> },
  { key: "trigger", header: "Trigger", render: (r) => JOB_TRIGGER_LABEL[r.trigger] || r.trigger },
  {
    key: "errors",
    header: "Errors",
    render: (r) => <span className="line-clamp-2 text-xs text-text-secondary">{r.errors.join(" · ") || "—"}</span>,
  },
  { key: "started", header: "Started", render: (r) => formatDateTime(r.startedAt) },
];

export function OperatorScreen({ operator, events, runs, error }) {
  return (
    <div className="min-h-[100dvh] w-full bg-background text-foreground">
      <MainScreenWrapper>
        <ScreenHeader
          title="Operator"
          description={`Events outside any project, for platform operators. Signed in as ${operator.email}.`}
        />
        {error ? (
          <p className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">{error}</p>
        ) : null}
        <SectionCard title="Events" description="Inbound mail no project claims, and scheduler failures outside any project.">
          <DataTable
            columns={EVENT_COLUMNS}
            data={events || []}
            getRowKey={(e) => e.id}
            empty={<EmptyState className="py-10" icon={Inbox} title="Nothing to triage" description="Unattributed mail and project-less job failures appear here." />}
          />
        </SectionCard>
        <SectionCard title="Scheduler runs" description="Cross-project runs that failed, stopped or found another run in progress (last 14 days).">
          <DataTable
            columns={RUN_COLUMNS}
            data={runs || []}
            getRowKey={(r) => r.id}
            empty={<EmptyState className="py-10" icon={CalendarClock} title="No problem runs" description="Scheduled runs that go wrong appear here." />}
          />
        </SectionCard>
      </MainScreenWrapper>
    </div>
  );
}

export default OperatorScreen;
