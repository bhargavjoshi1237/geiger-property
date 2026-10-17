"use client";

import { toast } from "sonner";
import {
  Ban,
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  HardHat,
  PauseCircle,
  Play,
  Receipt,
  RotateCcw,
  Send,
  XCircle,
} from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { billsLayer } from "@/lib/supabase/bills";
import { vendorAssignmentsLayer } from "@/lib/supabase/vendor_assignments";
import { vendorOptions } from "@/lib/supabase/options";
import { logSystemActivity } from "@/lib/supabase/activity_log";
import {
  APPROVAL_METHOD_OPTIONS,
  CANCEL_REASON_OPTIONS,
  CLOSED_WORK_STATUSES,
  DISPATCH_METHOD_OPTIONS,
  HOLD_REASON_OPTIONS,
  ROOT_CAUSE_OPTIONS,
  addDays,
  money,
  todayString,
} from "../shared";
import { approvalAmountOf } from "./wo_approval";
import { deductMaterials } from "./wo_execution";
import { actorName, listMeta, metaOf, statusPartial } from "./wo_shared";

// Header actions for the work-order editor: lifecycle moves (each appends to
// metadata.statusHistory), owner approval, and raising a vendor bill.

const isOpen = (i) => !CLOSED_WORK_STATUSES.includes(i.status);
const SCHEDULABLE = ["Open", "Draft", "On hold", "Submitted", "In review", "Approved"];
const VENDOR_FIELD = { key: "vendorId", label: "Vendor", type: "relation", load: vendorOptions, displayKey: "vendorName", required: true };

// Commit `partial` with metadata merged onto the current bag (no status change).
const withMeta = (item, partial, metaPatch) => ({ ...partial, metadata: { ...(item.metadata || {}), ...metaPatch } });

async function moveTo(ctx, next, { note = "", meta = {}, partial = {}, success } = {}) {
  const sp = await statusPartial(ctx.item, next, { note, meta });
  const ok = await ctx.commit({ ...partial, ...sp });
  if (ok && success) toast.success(success);
  return ok;
}

async function recordApproval(ctx, action, values) {
  const item = ctx.item;
  const by = values.decidedBy || (await actorName());
  const at = new Date().toISOString();
  const status = action === "Approved" ? "Approved" : "Rejected";
  const metaPatch = {
    approvalStatus: status,
    approvalDecisionAt: at,
    approvalDecisionBy: by,
    approvalDecisionNotes: values.notes || "",
    approvals: [
      { id: crypto.randomUUID(), action: status, by, at, amount: approvalAmountOf(item), notes: values.notes || "" },
      ...listMeta(item, "approvals"),
    ],
  };
  // An approved job that was waiting on approval goes back to Open.
  if (status === "Approved" && item.status === "On hold" && metaOf(item, "holdReason") === "Waiting on approval") {
    return moveTo(ctx, "Open", { note: "Owner approved", meta: metaPatch, success: "Approved — work order resumed." });
  }
  const ok = await ctx.commitMeta(metaPatch);
  if (ok) toast.success(status === "Approved" ? "Approval recorded." : "Rejection recorded.");
  return ok;
}

// Materials step of the completion wizard: tick the parts to deduct from stock.
function MaterialsStep({ values, set }) {
  const list = values.materials || [];
  if (!list.length) {
    return <p className="text-sm text-text-secondary">No undeducted parts on this job. Add parts under Materials Used to track stock.</p>;
  }
  const deduct = values.deduct || {};
  return (
    <ul className="divide-y divide-border rounded-xl border border-border bg-surface-subtle">
      {list.map((r) => (
        <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
          <label className="flex min-w-0 items-center gap-3 text-sm text-foreground">
            <Checkbox
              checked={deduct[r.id] !== false}
              onCheckedChange={(v) => set({ deduct: { ...deduct, [r.id]: Boolean(v) } })}
            />
            <span className="truncate">{r.name}</span>
          </label>
          <span className="shrink-0 text-sm tabular-nums text-text-secondary">
            {r.qty} × {money(r.unitCost)}
          </span>
        </li>
      ))}
    </ul>
  );
}

export const workOrderActions = [
  {
    key: "assignVendor",
    label: "Assign vendor",
    icon: HardHat,
    showIf: isOpen,
    wizard: {
      title: "Assign vendor",
      description: "Dispatch a vendor and optionally book the visit.",
      finishLabel: "Assign",
      logSummary: "Assigned vendor",
      initial: (i) => ({
        vendorId: i.vendorId || "",
        vendorName: i.vendorName || "",
        technician: i.technician || "",
        technicianPhone: metaOf(i, "technicianPhone") || "",
        dispatchMethod: metaOf(i, "dispatchMethod") || "Phone",
        notToExceed: metaOf(i, "notToExceed") || "",
        assignmentNotes: metaOf(i, "assignmentNotes") || "",
        scheduledDate: i.scheduledDate || "",
        windowStart: metaOf(i, "windowStart") || "",
        windowEnd: metaOf(i, "windowEnd") || "",
      }),
      steps: [
        {
          key: "vendor",
          title: "Vendor",
          fields: [
            VENDOR_FIELD,
            { key: "technician", label: "Technician", type: "text" },
            { key: "technicianPhone", label: "Technician phone", type: "phone" },
            { key: "dispatchMethod", label: "Dispatched via", type: "select", options: DISPATCH_METHOD_OPTIONS },
            { key: "notToExceed", label: "Not-to-exceed", type: "currency" },
            { key: "assignmentNotes", label: "Instructions", type: "textarea" },
          ],
        },
        {
          key: "when",
          title: "Visit",
          description: "Optional — leave blank to schedule later.",
          fields: [
            { key: "scheduledDate", label: "Scheduled date", type: "date" },
            { key: "windowStart", label: "Window start", type: "time" },
            { key: "windowEnd", label: "Window end", type: "time" },
          ],
        },
      ],
      finish: async (v, ctx) => {
        const item = ctx.item;
        const metaPatch = {
          technicianPhone: v.technicianPhone || "",
          dispatchMethod: v.dispatchMethod || "",
          notToExceed: v.notToExceed === "" ? "" : Number(v.notToExceed) || 0,
          assignmentNotes: v.assignmentNotes || "",
          windowStart: v.windowStart || "",
          windowEnd: v.windowEnd || "",
          dispatchedOn: todayString(),
          vendorAccepted: false,
        };
        const partial = {
          vendorId: v.vendorId,
          vendorName: v.vendorName || "",
          technician: v.technician || "",
          scheduledDate: v.scheduledDate || "",
        };
        const ok =
          v.scheduledDate && SCHEDULABLE.includes(item.status)
            ? await moveTo(ctx, "Scheduled", { note: `Assigned to ${v.vendorName || "vendor"}`, meta: metaPatch, partial })
            : await ctx.commit(withMeta(item, partial, metaPatch));
        if (!ok) return false;
        vendorAssignmentsLayer.create({
          id: crypto.randomUUID(),
          name: item.name,
          vendorId: v.vendorId,
          vendorName: v.vendorName || "",
          workOrderId: item.id,
          workOrderLabel: item.name,
          scheduledDate: v.scheduledDate || "",
          status: "Assigned",
        });
        toast.success(`Assigned to ${v.vendorName || "the vendor"}.`);
        return true;
      },
    },
  },
  {
    key: "schedule",
    label: "Schedule",
    icon: CalendarClock,
    showIf: isOpen,
    wizard: {
      title: "Schedule the visit",
      finishLabel: "Schedule",
      logSummary: "Scheduled visit",
      initial: (i) => ({
        scheduledDate: i.scheduledDate || todayString(),
        windowStart: metaOf(i, "windowStart") || "",
        windowEnd: metaOf(i, "windowEnd") || "",
        eta: metaOf(i, "eta") || "",
        technician: i.technician || "",
        notifyTenant: Boolean(metaOf(i, "notifyTenantOnStatus")),
      }),
      steps: [
        {
          key: "when",
          title: "When",
          fields: [
            { key: "scheduledDate", label: "Date", type: "date", required: true },
            { key: "technician", label: "Technician", type: "text" },
            { key: "windowStart", label: "Window start", type: "time" },
            { key: "windowEnd", label: "Window end", type: "time" },
            { key: "eta", label: "ETA", type: "time" },
            { key: "notifyTenant", label: "Tell the tenant on their request", type: "switch" },
          ],
        },
      ],
      finish: async (v, ctx) => {
        const item = ctx.item;
        const metaPatch = {
          windowStart: v.windowStart || "",
          windowEnd: v.windowEnd || "",
          eta: v.eta || "",
          notifyTenantOnStatus: Boolean(v.notifyTenant),
          ...(v.notifyTenant ? { shareWithTenant: true, showScheduleToTenant: true } : {}),
        };
        const partial = { scheduledDate: v.scheduledDate, technician: v.technician || "" };
        const ok = SCHEDULABLE.includes(item.status)
          ? await moveTo(ctx, "Scheduled", { note: `Visit on ${v.scheduledDate}`, meta: metaPatch, partial })
          : await ctx.commit(withMeta(item, partial, metaPatch));
        if (ok) toast.success("Visit scheduled.");
        return ok;
      },
    },
  },
  {
    key: "start",
    label: "Start work",
    icon: Play,
    showIf: (i) => isOpen(i) && i.status !== "In progress",
    run: async (ctx) => {
      const ok = await moveTo(ctx, "In progress", { note: "Work started", success: "Work started." });
      if (ok) ctx.log("Started work");
    },
  },
  {
    key: "hold",
    label: "Put on hold",
    icon: PauseCircle,
    showIf: (i) => isOpen(i) && i.status !== "On hold",
    wizard: {
      title: "Put on hold",
      finishLabel: "Put on Hold",
      logSummary: "Put on hold",
      initial: () => ({ holdReason: "Waiting on parts", holdUntil: "", note: "" }),
      steps: [
        {
          key: "why",
          title: "Reason",
          fields: [
            { key: "holdReason", label: "Reason", type: "select", options: HOLD_REASON_OPTIONS, required: true },
            { key: "holdUntil", label: "Expected to resume", type: "date" },
            { key: "note", label: "Note", type: "textarea" },
          ],
        },
      ],
      finish: (v, ctx) =>
        moveTo(ctx, "On hold", {
          note: [v.holdReason, v.note].filter(Boolean).join(" — "),
          meta: { holdReason: v.holdReason, holdUntil: v.holdUntil || "" },
          success: "Work order on hold.",
        }),
    },
  },
  {
    key: "complete",
    label: "Complete…",
    icon: CheckCircle2,
    showIf: isOpen,
    wizard: {
      title: "Complete work order",
      description: "Record the resolution, deduct parts from stock and close the job.",
      finishLabel: "Complete",
      logSummary: "Completed work order",
      initial: (i) => ({
        resolution: metaOf(i, "resolution") || "",
        completedDate: metaOf(i, "completedDate") || todayString(),
        actualHours: metaOf(i, "actualHours") || metaOf(i, "estimatedHours") || "",
        rootCause: metaOf(i, "rootCause") || "",
        signedOffBy: metaOf(i, "signedOffBy") || "",
        materials: listMeta(i, "materialsUsed").filter((r) => !r.deducted && r.itemId),
        deduct: {},
        followUpNeeded: false,
        followUpNotes: "",
        requestFeedback: Boolean(i.tenantId),
      }),
      steps: [
        {
          key: "resolution",
          title: "Resolution",
          fields: [
            { key: "resolution", label: "Resolution", type: "textarea", required: true },
            { key: "completedDate", label: "Completed on", type: "date", required: true },
            { key: "actualHours", label: "Hours on site", type: "number", min: 0, step: 0.25 },
            { key: "rootCause", label: "Root cause", type: "select", options: ROOT_CAUSE_OPTIONS },
            { key: "signedOffBy", label: "Signed off by", type: "text" },
          ],
        },
        { key: "materials", title: "Parts used", description: "Ticked parts are deducted from Inventory & Parts.", render: (p) => <MaterialsStep {...p} /> },
        {
          key: "wrap",
          title: "Close",
          fields: [
            { key: "followUpNeeded", label: "Follow-up needed", type: "switch" },
            { key: "followUpNotes", label: "Follow-up notes", type: "textarea", showIf: (v) => Boolean(v.followUpNeeded) },
            { key: "requestFeedback", label: "Ask the tenant for feedback", type: "switch" },
          ],
        },
      ],
      finish: async (v, ctx) => {
        const item = ctx.item;
        const all = listMeta(item, "materialsUsed");
        const picked = all.filter((r) => !r.deducted && r.itemId && v.deduct?.[r.id] !== false);
        const res = picked.length ? await deductMaterials(item, picked) : { list: [], failed: 0 };
        const byId = new Map(res.list.map((r) => [r.id, r]));
        const metaPatch = {
          resolution: v.resolution,
          completedDate: v.completedDate,
          actualHours: v.actualHours === "" ? "" : Number(v.actualHours) || 0,
          rootCause: v.rootCause || "",
          signedOffBy: v.signedOffBy || "",
          followUpNeeded: Boolean(v.followUpNeeded),
          followUpNotes: v.followUpNotes || "",
          materialsUsed: all.map((r) => byId.get(r.id) || r),
          ...(v.requestFeedback ? { feedbackRequested: true, feedbackRequestedOn: todayString() } : {}),
        };
        const ok = await moveTo(ctx, "Completed", { note: "Completed", meta: metaPatch, success: "Work order completed." });
        if (res.failed) toast.error(`Couldn't deduct ${res.failed} part${res.failed > 1 ? "s" : ""} from stock.`);
        return ok;
      },
    },
  },
  {
    key: "reopen",
    label: "Reopen",
    icon: RotateCcw,
    showIf: (i) => !isOpen(i),
    run: async (ctx) => {
      const ok = await moveTo(ctx, "Open", { note: "Reopened", success: "Work order reopened." });
      if (ok) ctx.log("Reopened work order");
    },
  },
  {
    key: "requestApproval",
    label: "Request approval",
    icon: Send,
    separatorBefore: true,
    showIf: (i) => !["Pending", "Approved"].includes(metaOf(i, "approvalStatus") || ""),
    wizard: {
      title: "Request owner approval",
      description: "Records the request on this work order. Owner email delivery isn't connected yet — contact the approver directly.",
      finishLabel: "Request Approval",
      logSummary: "Requested owner approval",
      initial: (i) => ({
        approver: metaOf(i, "approver") || "",
        approverContact: metaOf(i, "approverContact") || "",
        approvalMethod: metaOf(i, "approvalMethod") || "Email",
        amount: approvalAmountOf(i) || "",
        approvalDueDate: metaOf(i, "approvalDueDate") || addDays(2),
        notes: "",
      }),
      steps: [
        {
          key: "who",
          title: "Approver",
          fields: [
            { key: "approver", label: "Approver", type: "text", required: true },
            { key: "approverContact", label: "Contact", type: "text" },
            { key: "approvalMethod", label: "Request via", type: "select", options: APPROVAL_METHOD_OPTIONS },
            { key: "amount", label: "Amount", type: "currency", required: true },
            { key: "approvalDueDate", label: "Decision needed by", type: "date" },
            { key: "notes", label: "Notes", type: "textarea" },
          ],
        },
      ],
      finish: async (v, ctx) => {
        const item = ctx.item;
        const by = await actorName();
        const at = new Date().toISOString();
        const amount = Number(v.amount) || 0;
        const ok = await ctx.commitMeta({
          approvalStatus: "Pending",
          approver: v.approver,
          approverContact: v.approverContact || "",
          approvalMethod: v.approvalMethod || "",
          approvalAmount: amount,
          approvalDueDate: v.approvalDueDate || "",
          approvalRequestedAt: at,
          approvalRequestedBy: by,
          approvalDecisionAt: "",
          approvalDecisionBy: "",
          approvalDecisionNotes: "",
          approvals: [
            { id: crypto.randomUUID(), action: "Requested", by, at, amount, notes: v.notes || "" },
            ...listMeta(item, "approvals"),
          ],
        });
        if (ok) toast.success(`Approval requested from ${v.approver}.`);
        return ok;
      },
    },
  },
  {
    key: "approve",
    label: "Record approval",
    icon: BadgeCheck,
    showIf: (i) => metaOf(i, "approvalStatus") === "Pending",
    wizard: {
      title: "Record approval",
      finishLabel: "Approve",
      logSummary: "Owner approved",
      initial: (i) => ({ decidedBy: metaOf(i, "approver") || "", notes: "" }),
      steps: [
        {
          key: "decision",
          title: "Decision",
          fields: [
            { key: "decidedBy", label: "Approved by", type: "text", required: true },
            { key: "notes", label: "Notes", type: "textarea" },
          ],
        },
      ],
      finish: (v, ctx) => recordApproval(ctx, "Approved", v),
    },
  },
  {
    key: "rejectApproval",
    label: "Record rejection",
    icon: XCircle,
    showIf: (i) => metaOf(i, "approvalStatus") === "Pending",
    wizard: {
      title: "Record rejection",
      finishLabel: "Reject",
      logSummary: "Owner rejected",
      initial: (i) => ({ decidedBy: metaOf(i, "approver") || "", notes: "" }),
      steps: [
        {
          key: "decision",
          title: "Decision",
          fields: [
            { key: "decidedBy", label: "Rejected by", type: "text", required: true },
            { key: "notes", label: "Reason", type: "textarea", required: true },
          ],
        },
      ],
      finish: (v, ctx) => recordApproval(ctx, "Rejected", v),
    },
  },
  {
    key: "createBill",
    label: "Create vendor bill",
    icon: Receipt,
    separatorBefore: true,
    wizard: {
      title: "Create vendor bill",
      description: "Raises a payable in Bills & Payables linked to this work order.",
      finishLabel: "Create Bill",
      logSummary: "Created vendor bill",
      initial: (i) => ({
        vendorId: i.vendorId || "",
        vendorName: i.vendorName || "",
        amount: Number(metaOf(i, "vendorInvoiceAmount")) || Number(i.totalCost) || "",
        billDate: todayString(),
        dueDate: addDays(30),
        invoiceNumber: metaOf(i, "vendorInvoiceNo") || "",
        memo: `Work order: ${i.name}${i.propertyLabel ? ` (${i.propertyLabel})` : ""}`,
      }),
      steps: [
        {
          key: "bill",
          title: "Bill",
          fields: [
            VENDOR_FIELD,
            { key: "amount", label: "Amount", type: "currency", required: true },
            { key: "invoiceNumber", label: "Invoice #", type: "text" },
            { key: "billDate", label: "Bill date", type: "date" },
            { key: "dueDate", label: "Due date", type: "date", required: true },
            { key: "memo", label: "Memo", type: "textarea" },
          ],
          validate: (v) => (Number(v.amount) > 0 ? null : "Enter an amount above zero."),
        },
      ],
      finish: async (v, ctx) => {
        const item = ctx.item;
        const vendorName = v.vendorName || "Vendor";
        const created = await billsLayer.create({
          id: crypto.randomUUID(),
          name: v.invoiceNumber ? `${vendorName} #${v.invoiceNumber}` : `${vendorName} — ${item.name}`,
          vendorId: v.vendorId,
          vendorName,
          propertyId: item.propertyId || "",
          propertyName: item.propertyLabel || "",
          workOrderId: item.id,
          amount: Number(v.amount) || 0,
          billDate: v.billDate || todayString(),
          dueDate: v.dueDate,
          status: "Open",
          metadata: { memo: v.memo || "", invoiceNumber: v.invoiceNumber || "", source: "work_order", workOrderName: item.name },
        });
        if (!created) {
          toast.error("Couldn't create the bill.");
          return false;
        }
        logSystemActivity("bill", created.id, "created", `Created from work order "${item.name}"`);
        await ctx.commitMeta({
          billIds: [created.id, ...(metaOf(item, "billIds") || [])],
          vendorInvoiceNo: v.invoiceNumber || metaOf(item, "vendorInvoiceNo") || "",
          vendorInvoiceAmount: Number(v.amount) || 0,
        });
        toast.success(`Bill for ${money(v.amount)} created in Bills & Payables.`);
        return true;
      },
    },
  },
  {
    key: "cancel",
    label: "Cancel work order",
    icon: Ban,
    danger: true,
    separatorBefore: true,
    showIf: isOpen,
    wizard: {
      title: "Cancel work order",
      finishLabel: "Cancel Work Order",
      logSummary: "Cancelled work order",
      initial: () => ({ cancelReason: "Duplicate request", note: "" }),
      steps: [
        {
          key: "why",
          title: "Reason",
          fields: [
            { key: "cancelReason", label: "Reason", type: "select", options: CANCEL_REASON_OPTIONS, required: true },
            { key: "note", label: "Note", type: "textarea" },
          ],
        },
      ],
      finish: (v, ctx) =>
        moveTo(ctx, "Cancelled", {
          note: [v.cancelReason, v.note].filter(Boolean).join(" — "),
          meta: { cancelReason: v.cancelReason, cancelledOn: todayString() },
          success: "Work order cancelled.",
        }),
    },
  },
];
