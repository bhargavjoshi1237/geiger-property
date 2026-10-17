"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowRightLeft, BadgeCheck, CheckCircle2, Send, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, SectionCard } from "@/components/internal/shared/screen_kit";
import { FieldsForm } from "@/components/internal/screens/entity/sections/factories";
import { listRecordItems } from "@/lib/supabase/record_items";
import {
  APPROVAL_METHOD_OPTIONS,
  APPROVAL_STATUS_MAP,
  PRIORITY_OPTIONS,
  REQUEST_STATUS_MAP,
  WORK_KIND_MAP,
  currency,
  formatDateTime,
  money,
  selectOptions,
} from "../shared";
import { SOURCE_LABEL, listMeta, metaOf, statusPartial, usePropertyPolicies, withStatusHistory } from "./wo_shared";

// Approval & sharing: owner sign-off above the effective `ownerApprovalLimit`
// policy, plus request triage and owner/tenant visibility.

const meta = (field) => ({ ...field, meta: true });

// Accepted estimate total for a work order (record_items kind "estimate").
export async function acceptedEstimateTotal(ownerType, id) {
  const rows = (await listRecordItems(ownerType, id, "estimate")) ?? [];
  return rows
    .filter((r) => r.status === "Accepted" || r.metadata?.accepted)
    .reduce((s, r) => s + (Number(r.amount) || 0), 0);
}

// The amount owner approval is judged on.
export const approvalAmountOf = (item, accepted = 0) =>
  Number(metaOf(item, "approvalAmount")) ||
  accepted ||
  Number(item.totalCost) ||
  Number(metaOf(item, "estimateAmount")) ||
  0;

const APPROVAL_FIELDS = [
  meta({ key: "approvalAmount", label: "Amount for approval", type: "currency", hint: "Blank uses the accepted estimate, then the total cost." }),
  meta({ key: "approver", label: "Approver", type: "text", placeholder: "Owner or asset manager" }),
  meta({ key: "approverContact", label: "Approver contact", type: "text", placeholder: "Email or phone" }),
  meta({ key: "approvalMethod", label: "Request via", type: "select", options: APPROVAL_METHOD_OPTIONS }),
  meta({ key: "approvalDueDate", label: "Decision needed by", type: "date" }),
  meta({ key: "autoApproveEmergency", label: "Proceed without approval in emergencies", type: "switch" }),
  meta({ key: "approvalNotes", label: "Approval notes", type: "textarea" }),
];

export function ApprovalSection({ item, config, onPatch, onCommit, onCommitMeta, runAction }) {
  const policies = usePropertyPolicies(item.propertyId);
  const [accepted, setAccepted] = useState(0);
  useEffect(() => {
    let alive = true;
    acceptedEstimateTotal(config.key, item.id).then((v) => alive && setAccepted(v));
    return () => {
      alive = false;
    };
  }, [config.key, item.id]);

  const limitPolicy = policies?.ownerApprovalLimit;
  const limit = Number(limitPolicy?.value) || 0;
  const amount = approvalAmountOf(item, accepted);
  const required = limit > 0 && amount > limit;
  const status = metaOf(item, "approvalStatus") || "";
  const s = APPROVAL_STATUS_MAP[status] || APPROVAL_STATUS_MAP[""];
  const history = listMeta(item, "approvals");

  return (
    <div className="space-y-4">
      <SectionCard
        title="Owner approval"
        description={
          limitPolicy
            ? `Jobs above ${currency(limit)} need sign-off (${SOURCE_LABEL[limitPolicy.source]}).`
            : "Loading the approval limit…"
        }
        action={
          <div className="flex flex-wrap gap-2">
            {status === "Pending" ? (
              <>
                <Button
                  variant="outline"
                  className="border-border bg-surface-card hover:bg-surface-hover"
                  onClick={() => runAction("rejectApproval")}
                >
                  <XCircle className="h-4 w-4" /> Reject
                </Button>
                <Button
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                  onClick={() => runAction("approve")}
                >
                  <CheckCircle2 className="h-4 w-4" /> Approve
                </Button>
              </>
            ) : (
              <Button
                className="bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => runAction("requestApproval")}
              >
                <Send className="h-4 w-4" /> {status ? "Request Again" : "Request Approval"}
              </Button>
            )}
          </div>
        }
      >
        <dl className="grid gap-4 sm:grid-cols-4">
          {[
            { label: "Approval limit", value: limitPolicy ? currency(limit) : "—" },
            { label: "Amount", value: money(amount) },
            {
              label: "Requirement",
              value: (
                <Badge variant={required ? "warning" : "success"}>
                  {required ? "Approval required" : "Within limit"}
                </Badge>
              ),
            },
            { label: "Status", value: <Badge variant={s.variant}>{s.label}</Badge> },
          ].map((x) => (
            <div key={x.label}>
              <dt className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">{x.label}</dt>
              <dd className="mt-1 text-sm font-medium tabular-nums text-foreground">{x.value}</dd>
            </div>
          ))}
        </dl>
        {status && status !== "Pending" ? (
          <p className="mt-4 text-xs text-text-secondary">
            {s.label} by {metaOf(item, "approvalDecisionBy") || "—"} · {formatDateTime(metaOf(item, "approvalDecisionAt"))}
            {metaOf(item, "approvalDecisionNotes") ? ` — ${metaOf(item, "approvalDecisionNotes")}` : ""}
          </p>
        ) : status === "Pending" ? (
          <p className="mt-4 text-xs text-text-secondary">
            Requested by {metaOf(item, "approvalRequestedBy") || "—"} · {formatDateTime(metaOf(item, "approvalRequestedAt"))}
          </p>
        ) : null}
      </SectionCard>

      <FieldsForm item={item} fields={APPROVAL_FIELDS} onPatch={onPatch} onCommit={onCommit} onCommitMeta={onCommitMeta} />

      <SectionCard title="Approval history" bodyPadding={false}>
        {history.length === 0 ? (
          <EmptyState icon={BadgeCheck} title="No approval activity yet" description="Requests and decisions are recorded here." />
        ) : (
          <ul className="divide-y divide-border">
            {history.map((h) => (
              <li key={h.id} className="flex items-start justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={h.action === "Approved" ? "success" : h.action === "Rejected" ? "danger" : "warning"}>
                      {h.action}
                    </Badge>
                    <span className="text-sm text-foreground">{h.by || "—"}</span>
                  </div>
                  {h.notes ? <p className="mt-1 text-xs text-text-secondary">{h.notes}</p> : null}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm tabular-nums text-foreground">{money(h.amount)}</p>
                  <p className="text-xs text-text-tertiary">{formatDateTime(h.at)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

// --- Request triage ------------------------------------------------------------

const TRIAGE_FIELDS = [
  { key: "status", label: "Request status", type: "select", options: selectOptions(REQUEST_STATUS_MAP) },
  { key: "priority", label: "Priority", type: "select", options: PRIORITY_OPTIONS },
  meta({ key: "approvedBy", label: "Reviewed by", type: "text" }),
  meta({ key: "reviewedOn", label: "Reviewed on", type: "date" }),
  meta({ key: "resolutionNotes", label: "Decision notes", type: "textarea" }),
];

// Request triage; converting flips the same record to an open work order.
export function TriageSection({ item, onPatch, onCommit, onCommitMeta }) {
  const isRequest = item.kind === "request";
  const convert = async () => {
    const sp = await statusPartial(item, "Open", { note: "Converted from request" });
    const ok = await onCommit({ kind: "work_order", ...sp });
    if (ok) toast.success(`"${item.name}" converted to a work order.`);
  };
  return (
    <div className="space-y-4">
      <SectionCard
        title={isRequest ? "Convert to work order" : "Already a work order"}
        description={
          isRequest
            ? "Approve the request and turn it into an open work order you can dispatch."
            : "This record is a work order. Triage applies to tenant and staff requests."
        }
        action={
          isRequest ? (
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={convert}>
              <ArrowRightLeft className="h-4 w-4" /> Convert
            </Button>
          ) : null
        }
      >
        <p className="text-sm text-text-secondary">Type: {WORK_KIND_MAP[item.kind]?.label || "Work order"}</p>
      </SectionCard>
      <FieldsForm
        item={item}
        fields={TRIAGE_FIELDS}
        onPatch={onPatch}
        onCommit={withStatusHistory(item, onCommit)}
        onCommitMeta={onCommitMeta}
      />
    </div>
  );
}

// --- Sharing -------------------------------------------------------------------

const SHARING_FIELDS = [
  { key: "owner-h", label: "Owner", type: "heading", hint: "What the owner sees in their portal and statements." },
  meta({ key: "shareWithOwner", label: "Share with owner", type: "switch" }),
  meta({ key: "showCostsToOwner", label: "Show costs to owner", type: "switch", showIf: (i) => Boolean(i.metadata?.shareWithOwner) }),
  meta({ key: "notifyOwnerOnComplete", label: "Notify owner on completion", type: "switch", showIf: (i) => Boolean(i.metadata?.shareWithOwner) }),
  meta({ key: "ownerNote", label: "Note to owner", type: "textarea", showIf: (i) => Boolean(i.metadata?.shareWithOwner) }),
  { key: "tenant-h", label: "Tenant", type: "heading", hint: "What the resident sees on their request." },
  meta({ key: "shareWithTenant", label: "Share with tenant", type: "switch" }),
  meta({ key: "notifyTenantOnStatus", label: "Notify tenant on status changes", type: "switch", showIf: (i) => Boolean(i.metadata?.shareWithTenant) }),
  meta({ key: "showPhotosToTenant", label: "Show photos to tenant", type: "switch", showIf: (i) => Boolean(i.metadata?.shareWithTenant) }),
  meta({ key: "showScheduleToTenant", label: "Show schedule to tenant", type: "switch", showIf: (i) => Boolean(i.metadata?.shareWithTenant) }),
  meta({ key: "tenantNote", label: "Note to tenant", type: "textarea", showIf: (i) => Boolean(i.metadata?.shareWithTenant) }),
];

export function SharingSection({ item, onPatch, onCommit, onCommitMeta }) {
  return (
    <FieldsForm item={item} fields={SHARING_FIELDS} onPatch={onPatch} onCommit={onCommit} onCommitMeta={onCommitMeta} />
  );
}
