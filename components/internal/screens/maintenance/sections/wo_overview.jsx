"use client";

import { BadgeCheck, CalendarClock, CheckCircle2, HardHat, Play, RotateCcw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionCard, StatsBar, StatusPill } from "@/components/internal/shared/screen_kit";
import {
  APPROVAL_STATUS_MAP,
  CLOSED_WORK_STATUSES,
  MAINTENANCE_STATUS_MAP,
  PRIORITY_MAP,
  SOURCE_OPTIONS,
  WORK_KIND_MAP,
  completedDateOf,
  daysBetween,
  daysUntil,
  entryPermissionLabel,
  formatDate,
  formatDateTime,
  money,
} from "../shared";
import { approvalAmountOf } from "./wo_approval";
import { listMeta, metaOf, usePropertyPolicies } from "./wo_shared";

// Work-order overview: KPIs, the suggested next step, key facts and recent status changes.

function nextStep(item) {
  if (CLOSED_WORK_STATUSES.includes(item.status)) {
    return { key: "reopen", label: "Reopen", icon: RotateCcw, text: "This job is closed. Reopen it if the issue comes back." };
  }
  if (!item.vendorId && !item.technician) {
    return { key: "assignVendor", label: "Assign vendor", icon: HardHat, text: "No one is assigned yet — dispatch a vendor or technician." };
  }
  if (!item.scheduledDate) {
    return { key: "schedule", label: "Schedule", icon: CalendarClock, text: "Book the visit so the tenant knows when to expect it." };
  }
  if (item.status !== "In progress") {
    return { key: "start", label: "Start work", icon: Play, text: `Visit booked for ${formatDate(item.scheduledDate)}. Start the job when work begins.` };
  }
  return { key: "complete", label: "Complete…", icon: CheckCircle2, text: "Work is underway. Close it out with the completion wizard." };
}

export function WorkOrderOverview({ item, runAction }) {
  const closed = CLOSED_WORK_STATUSES.includes(item.status);
  const opened = item.createdAt;
  const doneOn = completedDateOf(item);
  const age = daysBetween(opened, closed && doneOn ? doneOn : new Date().toISOString());
  const due = metaOf(item, "dueDate");
  const dueIn = daysUntil(due);
  const approval = APPROVAL_STATUS_MAP[metaOf(item, "approvalStatus") || ""] || APPROVAL_STATUS_MAP[""];
  const policies = usePropertyPolicies(item.propertyId);
  const limit = Number(policies?.ownerApprovalLimit?.value) || 0;
  const approvalStatus = metaOf(item, "approvalStatus") || "";
  // Over the property's limit (or flagged by its schedule) and not yet signed off.
  const needsApproval =
    !CLOSED_WORK_STATUSES.includes(item.status) &&
    !["Pending", "Approved"].includes(approvalStatus) &&
    (Boolean(metaOf(item, "approvalRequired")) || (limit > 0 && approvalAmountOf(item) > limit));
  const step = needsApproval
    ? {
        key: "requestApproval",
        label: "Request approval",
        icon: BadgeCheck,
        text:
          limit > 0 && approvalAmountOf(item) > limit
            ? `${money(approvalAmountOf(item))} is over the ${money(limit)} owner approval limit — get sign-off before work starts.`
            : "This job is flagged for owner approval before work starts.",
      }
    : nextStep(item);
  const Icon = step.icon;
  const history = listMeta(item, "statusHistory").slice(0, 4);
  const source = SOURCE_OPTIONS.find((o) => o.value === metaOf(item, "source"))?.label;

  const facts = [
    { label: "Type", value: WORK_KIND_MAP[item.kind]?.label || "Work order" },
    { label: "Property & unit", value: item.propertyLabel || "—" },
    { label: "Tenant", value: item.tenantName || "—" },
    { label: "Category", value: [item.category, metaOf(item, "subcategory")].filter(Boolean).join(" · ") || "—" },
    { label: "Source", value: source || "—" },
    { label: "Vendor", value: item.vendorName || "Unassigned" },
    { label: "Technician", value: item.technician || "—" },
    { label: "Scheduled", value: item.scheduledDate ? formatDate(item.scheduledDate) : "Not scheduled" },
    { label: "Entry", value: metaOf(item, "entryPermission") ? entryPermissionLabel(metaOf(item, "entryPermission")) : "Policy default" },
    { label: "Tenant chargeback", value: money(metaOf(item, "tenantChargeback")) },
  ];

  return (
    <div className="space-y-5">
      <StatsBar
        stats={[
          { label: closed ? "Days to close" : "Days open", value: age === null ? "—" : String(age), footer: `Opened ${formatDate(opened)}` },
          {
            label: "Due",
            value: due ? formatDate(due) : "—",
            footer: !due ? "No due date" : closed ? "Closed" : dueIn < 0 ? `${-dueIn}d overdue` : dueIn === 0 ? "Due today" : `In ${dueIn}d`,
          },
          { label: "Total cost", value: money(item.totalCost), footer: `Labor ${money(item.laborCost)} · Parts ${money(item.materialCost)}` },
          { label: "Approval", value: approval.label, footer: metaOf(item, "approver") || "Owner sign-off" },
        ]}
      />

      <SectionCard
        title="Next step"
        description={step.text}
        action={
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => runAction(step.key)}>
            <Icon className="h-4 w-4" /> {step.label}
          </Button>
        }
      >
        <div className="flex flex-wrap items-center gap-2 text-sm text-text-secondary">
          <StatusPill status={item.status} map={MAINTENANCE_STATUS_MAP} />
          <Badge variant={PRIORITY_MAP[item.priority]?.variant || "neutral"}>{item.priority} priority</Badge>
          {metaOf(item, "emergency") ? <Badge variant="danger">Emergency</Badge> : null}
          {metaOf(item, "approvalStatus") ? <Badge variant={approval.variant}>{approval.label}</Badge> : null}
        </div>
      </SectionCard>

      <SectionCard title="At a glance">
        <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
          {facts.map((f) => (
            <div key={f.label} className="min-w-0">
              <dt className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">{f.label}</dt>
              <dd className="mt-1 truncate text-sm text-foreground">{f.value}</dd>
            </div>
          ))}
        </dl>
        {metaOf(item, "description") ? (
          <p className="mt-5 whitespace-pre-wrap border-t border-border pt-4 text-sm text-text-secondary">{metaOf(item, "description")}</p>
        ) : null}
      </SectionCard>

      {history.length ? (
        <SectionCard title="Recent status changes" bodyPadding={false}>
          <ul className="divide-y divide-border">
            {history.map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <StatusPill status={h.status} map={MAINTENANCE_STATUS_MAP} />
                <span className="text-xs text-text-tertiary">
                  {[h.by, formatDateTime(h.at)].filter(Boolean).join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}
    </div>
  );
}
