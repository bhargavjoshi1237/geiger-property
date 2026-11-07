"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, History, Inbox } from "lucide-react";

import { Button } from "@geiger/ui/button";
import { DataTable, EmptyState, ListLoading, SectionCard, StatusPill } from "@/components/internal/shared/screen_kit";
import { listRunsForRecord } from "@/lib/supabase/automation_runs";
import { listOpenReviewsForRecord } from "@/lib/supabase/review_items";
import { MANUAL_RECORD_TYPES, triggerLabel } from "@/lib/automations/catalog";
import { explainRun } from "@/lib/orchestration/explain";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { RUN_STATUS_MAP, formatDateTime } from "@/components/internal/screens/automations/shared";

// Automation on record editors (ORCH-02 / ORCH-04 / ORCH-08): an "Automation Runs" section, a banner while the
// record has open review items, and the record types that can run a workflow by hand. EntityDetailScreen injects
// these for any entity config whose key maps to a record type below.

export const ENTITY_RECORD_TYPES = {
  lease: "lease",
  tenant: "tenant",
  workorder: "work_order",
  application: "application",
  move: "move",
  vendor: "vendor",
  bill: "bill",
};

export const recordTypeForEntity = (configKey) => ENTITY_RECORD_TYPES[configKey] || null;
export const canLaunchOn = (recordType) => MANUAL_RECORD_TYPES.includes(recordType);

export function RecordReviewBanner({ recordType, recordId }) {
  const [items, setItems] = useState([]);
  const { openItemInTab } = useWorkspaceUrl();
  useEffect(() => {
    let alive = true;
    listOpenReviewsForRecord(recordType, recordId).then((rows) => alive && setItems(rows || []));
    return () => {
      alive = false;
    };
  }, [recordType, recordId]);
  if (!items.length) return null;
  const first = items[0];
  const urgent = items.some((i) => i.severity === "urgent");
  return (
    <div
      className={`mb-4 flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between ${
        urgent ? "border-red-500/20 bg-red-500/5" : "border-amber-500/20 bg-amber-500/10"
      }`}
    >
      <div className="flex min-w-0 items-start gap-3">
        <Inbox className={`mt-0.5 h-4 w-4 shrink-0 ${urgent ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"}`} />
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            {items.length === 1 ? "1 item needs review" : `${items.length} items need review`}: {first.title}
          </p>
          <p className="mt-0.5 line-clamp-2 text-xs text-text-secondary">{first.reasonText}</p>
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="shrink-0 border-border bg-surface-card text-muted-foreground hover:bg-surface-hover hover:text-foreground"
        onClick={() => openItemInTab(first.id, "Review Queue")}
      >
        Open in Review Queue <ArrowUpRight className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

// Every workflow run (and skipped evaluation) on the open record; a row opens it in Run History.
export function RecordAutomationRunsSection({ item, recordType }) {
  const [runs, setRuns] = useState(null);
  const { openItemInTab } = useWorkspaceUrl();
  const id = item?.id;
  useEffect(() => {
    let alive = true;
    listRunsForRecord(recordType, id).then((rows) => alive && setRuns(rows ?? []));
    return () => {
      alive = false;
    };
  }, [recordType, id]);

  if (runs === null) return <ListLoading label="Loading runs" />;
  if (!runs.length) {
    return (
      <SectionCard>
        <EmptyState icon={History} title="No automation runs yet" description="When a workflow runs for this record — or decides not to — it shows up here with the reason." />
      </SectionCard>
    );
  }
  return (
    <DataTable
      columns={[
        {
          key: "workflow",
          header: "Workflow",
          render: (r) => (
            <div className="flex flex-col gap-1">
              <span className="font-medium text-foreground">{r.automationName || "Workflow"}</span>
              <span className="line-clamp-1 text-xs text-text-secondary">{explainRun(r).headline}</span>
            </div>
          ),
        },
        { key: "trigger", header: "Trigger", className: "text-text-secondary", render: (r) => triggerLabel(r.eventType) },
        { key: "status", header: "Status", render: (r) => <StatusPill status={r.status} map={RUN_STATUS_MAP} /> },
        { key: "started", header: "Started", align: "right", className: "text-right text-text-secondary", render: (r) => formatDateTime(r.startedAt) },
      ]}
      data={runs}
      getRowKey={(r) => r.id}
      onRowClick={(r) => openItemInTab(r.id, "Run History")}
    />
  );
}
