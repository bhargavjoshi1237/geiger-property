"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  CalendarClock,
  CheckCircle2,
  Circle,
  FileText,
  Gavel,
  Loader2,
  LogOut,
  Play,
  Repeat,
  ShieldOff,
  Square,
  Wand2,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { listLeaseDeposits, securityDepositsLayer } from "@/lib/supabase/security_deposits";
import { updateUnit } from "@/lib/supabase/units";
import { updateTenant } from "@/lib/supabase/tenants";
import { ledgerErrorMessage, postCharge } from "@/lib/supabase/ledger";
import {
  createLeaseNotice,
  createRenewalOffer,
  draftNoticeText,
  generateLeaseDocument,
  leasePolicies,
  scheduleMoveIn,
  scheduleMoveOut,
  syncOccupancy,
  todayISO,
} from "@/lib/leasing/workflows";
import {
  DELIVERY_METHOD_OPTIONS,
  EVICTION_REASON_OPTIONS,
  MOVE_OUT_REASON_OPTIONS,
  NOTICE_TYPE_OPTIONS,
  REFUND_METHOD_OPTIONS,
  TERMINATION_REASON_OPTIONS,
  currency,
  isLiveLease,
  shiftDate,
  toOptions,
} from "./shared";

// Header actions for the lease editor — lifecycle wizards over the leasing
// workflows. Each finish() persists the lease through ctx.commit/commitMeta
// (optimistic + rollback) and the related rows through lib/leasing/workflows.

const live = (l) => isLiveLease(l);
const notClosed = (l) => !["Renewed", "Ended", "Terminated"].includes(l.status);

function ReadinessList({ lease }) {
  const checks = [
    [Boolean(lease.unitId), "Unit linked"],
    [Boolean(lease.tenantId), "Primary tenant linked"],
    [Boolean(lease.termStart), "Term start set"],
    [Boolean(lease.termEnd) || lease.termType === "mtm", "Term end set (or month-to-month)"],
    [Number(lease.rent) > 0, `Rent set${Number(lease.rent) > 0 ? ` — ${currency(lease.rent)}/mo` : ""}`],
    [Boolean(lease.signedDate), "Signed date recorded"],
  ];
  return (
    <ul className="space-y-1.5 rounded-xl border border-border bg-surface-subtle p-4">
      {checks.map(([ok, label]) => (
        <li key={label} className="flex items-center gap-2 text-sm">
          {ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> : <Circle className="h-4 w-4 text-text-tertiary" />}
          <span className={ok ? "text-foreground" : "text-text-secondary"}>{label}</span>
        </li>
      ))}
    </ul>
  );
}

// Fills the notice text from the starter template for its type.
function NoticeTextFiller({ lease, values, set }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="border-border bg-surface-card"
      disabled={busy || !values.noticeType}
      onClick={async () => {
        setBusy(true);
        const text = await draftNoticeText(lease, values);
        setBusy(false);
        set({ noticeText: text });
      }}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />} Fill from {values.noticeType || "Type"} Template
    </Button>
  );
}

const depositOptionsFor = (lease) => async () =>
  ((await listLeaseDeposits(lease.id)) ?? []).map((d) => ({
    value: d.id,
    label: `${d.name || "Deposit"} · ${currency(d.amount)}`,
    patch: {},
  }));

export function leaseActions(lease) {
  return [
    {
      key: "activate",
      label: "Activate lease",
      icon: Play,
      showIf: (l) => l.status === "Draft" || l.status === "Pending",
      wizard: {
        title: "Activate lease",
        description: "Puts the lease in force and points the unit and tenant at it.",
        finishLabel: "Activate",
        logSummary: "Activated the lease",
        initial: (l) => ({
          signedDate: l.signedDate || todayISO(),
          moveInDate: l.moveInDate || l.termStart || todayISO(),
          syncUnit: true,
          syncTenant: true,
          scheduleMove: true,
          recordDeposit: Number(l.deposit) > 0,
        }),
        steps: [
          {
            key: "check",
            title: "Check",
            description: "Unit, tenant, term, and rent should be set before activating.",
            render: () => <ReadinessList lease={lease} />,
            validate: () =>
              !lease.unitId || !lease.termStart || !(Number(lease.rent) > 0)
                ? "Link a unit and set the term start and rent first."
                : null,
          },
          {
            key: "dates",
            title: "Dates",
            fields: [
              { key: "signedDate", label: "Signed on", type: "date", required: true },
              { key: "moveInDate", label: "Move-in date", type: "date", required: true },
            ],
          },
          {
            key: "options",
            title: "Follow-ups",
            fields: [
              { key: "syncUnit", label: "Mark the unit occupied", type: "switch" },
              { key: "syncTenant", label: "Mark the tenant current", type: "switch" },
              { key: "scheduleMove", label: "Schedule the move-in and inspection", type: "switch" },
              { key: "recordDeposit", label: `Record the ${currency(lease.deposit)} deposit as held`, type: "switch", showIf: () => Number(lease.deposit) > 0 },
            ],
          },
        ],
        finish: async (v, ctx) => {
          const ok = await ctx.commit({ status: "Active", signedDate: v.signedDate, moveInDate: v.moveInDate });
          if (!ok) return false;
          const next = { ...ctx.item, status: "Active", signedDate: v.signedDate, moveInDate: v.moveInDate };
          const tasks = [syncOccupancy(next, { unit: v.syncUnit, tenant: v.syncTenant })];
          if (v.scheduleMove) tasks.push(scheduleMoveIn(next, { moveDate: v.moveInDate }));
          if (v.recordDeposit) {
            const existing = (await listLeaseDeposits(next.id)) ?? [];
            if (!existing.length) {
              tasks.push(
                securityDepositsLayer.create({
                  id: crypto.randomUUID(),
                  name: `${next.unit || next.name} — security deposit`,
                  amount: Number(next.deposit) || 0,
                  leaseId: next.id,
                  leaseName: next.name || "",
                  tenantId: next.tenantId || "",
                  tenantName: next.tenantName || "",
                  unitId: next.unitId || "",
                  unit: next.unit || "",
                  propertyId: next.propertyId || "",
                  status: "Held",
                  metadata: { depositKind: "Security deposit", receivedOn: v.signedDate },
                }),
              );
            }
          }
          const results = await Promise.all(tasks);
          if (results.some((r) => !r)) toast.warning("Lease activated, but some follow-ups didn't save.");
          else toast.success("Lease activated.");
          ctx.reload();
          return true;
        },
      },
    },
    {
      key: "renew",
      label: "Offer renewal",
      icon: Repeat,
      showIf: (l) => live(l) || l.status === "Pending",
      wizard: {
        title: "Offer a renewal",
        description: "Creates a renewal offer. Accepting it (here or in Renewals) creates the renewed lease.",
        finishLabel: "Create Offer",
        logSummary: "Created a renewal offer",
        initial: (l) => {
          const newStart = shiftDate(l.termEnd || todayISO(), { days: 1 });
          const pct = Number(l.metadata?.increasePct) || 0;
          return {
            newStart,
            termMonths: 12,
            newEnd: shiftDate(newStart, { months: 12, days: -1 }),
            proposedRent: Math.round((Number(l.rent) || 0) * (1 + pct / 100)),
            responseDue: shiftDate(todayISO(), { days: 30 }),
            sendNow: true,
          };
        },
        steps: [
          {
            key: "terms",
            title: "Terms",
            fields: [
              { key: "newStart", label: "New term starts", type: "date", required: true },
              { key: "termMonths", label: "Term (months)", type: "number", min: 1 },
              { key: "newEnd", label: "New term ends", type: "date", required: true },
              { key: "proposedRent", label: "Proposed rent", type: "currency", required: true, hint: `Current rent ${currency(lease.rent)}/mo` },
              { key: "responseDue", label: "Response due", type: "date" },
            ],
            validate: (v) => (v.newEnd <= v.newStart ? "The new term must end after it starts." : null),
          },
          {
            key: "offer",
            title: "Offer",
            fields: [
              { key: "concession", label: "Renewal incentive", type: "text", placeholder: "e.g. Free carpet cleaning", full: true },
              { key: "notes", label: "Justification / notes", type: "textarea" },
              { key: "sendNow", label: "Mark the offer as sent", type: "switch" },
            ],
          },
        ],
        finish: async (v, ctx) => {
          const row = await createRenewalOffer(ctx.item, v);
          if (!row) {
            toast.error("Couldn't create the renewal offer.");
            return false;
          }
          toast.success("Renewal offer created.");
          ctx.navigate("renewal");
          return true;
        },
      },
    },
    {
      key: "noticeToVacate",
      label: "Record notice to vacate",
      icon: CalendarClock,
      showIf: live,
      wizard: {
        title: "Record notice to vacate",
        description: "The tenant has told you they're moving out.",
        finishLabel: "Record Notice",
        logSummary: "Recorded a notice to vacate",
        initial: (l) => ({
          noticeDate: todayISO(),
          moveOutDate: l.termEnd && l.termEnd > todayISO() ? l.termEnd : shiftDate(todayISO(), { days: 30 }),
          moveOutReason: "End of term",
          recordNotice: true,
          markUnit: true,
        }),
        steps: [
          {
            key: "notice",
            title: "Notice",
            fields: [
              { key: "noticeDate", label: "Notice received", type: "date", required: true },
              { key: "moveOutDate", label: "Move-out date", type: "date", required: true },
              { key: "moveOutReason", label: "Reason", type: "select", options: MOVE_OUT_REASON_OPTIONS },
              { key: "deliveryMethod", label: "Received by", type: "select", options: DELIVERY_METHOD_OPTIONS },
              { key: "forwardingAddress", label: "Forwarding address", type: "textarea" },
              { key: "recordNotice", label: "Log it in Notices & Violations", type: "switch" },
              { key: "markUnit", label: "Mark the unit on notice", type: "switch" },
            ],
            validate: (v) => (v.moveOutDate < v.noticeDate ? "The move-out date can't be before the notice." : null),
          },
        ],
        finish: async (v, ctx) => {
          const ok = await ctx.commit({ noticeDate: v.noticeDate, moveOutDate: v.moveOutDate, status: "Notice given" });
          if (!ok) return false;
          await ctx.commitMeta({ moveOutReason: v.moveOutReason || "", forwardingAddress: v.forwardingAddress || "" });
          const tasks = [];
          if (v.recordNotice) {
            tasks.push(
              createLeaseNotice(ctx.item, {
                noticeType: "Notice to vacate",
                servedDate: v.noticeDate,
                cureBy: v.moveOutDate,
                deliveryMethod: v.deliveryMethod || "",
                status: "Received",
                direction: "incoming",
              }),
            );
          }
          if (v.markUnit && ctx.item.unitId) tasks.push(updateUnit(ctx.item.unitId, { status: "Notice" }));
          await Promise.all(tasks);
          toast.success("Notice to vacate recorded.");
          return true;
        },
      },
    },
    {
      key: "moveOut",
      label: "Move out",
      icon: LogOut,
      showIf: (l) => live(l) || l.status === "Terminated",
      wizard: {
        title: "Move out",
        description: "Schedules the move-out, the inspection and unit turn, and sets the deposit's return deadline.",
        finishLabel: "Schedule Move-Out",
        logSummary: "Scheduled the move-out",
        initial: (l) => ({
          noticeDate: l.noticeDate || todayISO(),
          moveOutDate: l.moveOutDate || l.termEnd || shiftDate(todayISO(), { days: 30 }),
          moveOutReason: l.metadata?.moveOutReason || "End of term",
          forwardingAddress: l.metadata?.forwardingAddress || "",
          inspectionDate: l.moveOutDate || l.termEnd || "",
          createTurn: true,
          turnBudget: 0,
          markUnitNotice: true,
          refundMethod: "Check",
        }),
        steps: [
          {
            key: "dates",
            title: "Dates",
            fields: [
              { key: "noticeDate", label: "Notice given", type: "date" },
              { key: "moveOutDate", label: "Move-out date", type: "date", required: true },
              { key: "moveOutReason", label: "Reason", type: "select", options: MOVE_OUT_REASON_OPTIONS },
              { key: "forwardingAddress", label: "Forwarding address", type: "textarea" },
            ],
          },
          {
            key: "turn",
            title: "Inspection & turn",
            fields: [
              { key: "inspectionDate", label: "Move-out inspection", type: "date" },
              { key: "inspector", label: "Inspector", type: "text" },
              { key: "createTurn", label: "Create a unit turn", type: "switch" },
              { key: "targetReadyDate", label: "Target ready date", type: "date", showIf: (v) => v.createTurn },
              { key: "turnBudget", label: "Turn budget", type: "currency", showIf: (v) => v.createTurn },
              { key: "markUnitNotice", label: "Mark the unit on notice", type: "switch" },
            ],
          },
          {
            key: "deposit",
            title: "Deposit",
            description: "The return deadline is counted from the move-out date.",
            fields: [
              { key: "depositId", label: "Deposit to return", type: "relation", load: depositOptionsFor(lease), full: true },
              { key: "returnDays", label: "Return within (days)", type: "number", min: 1, placeholder: "Your deposit policy" },
              { key: "refundMethod", label: "Refund by", type: "select", options: REFUND_METHOD_OPTIONS },
            ],
          },
        ],
        finish: async (v, ctx) => {
          const returnDays = Number(v.returnDays) || Number((await leasePolicies(ctx.item)).depositReturnDays) || 30;
          const res = await scheduleMoveOut(ctx.item, { ...v, returnDays });
          if (!res) {
            toast.error("Couldn't schedule the move-out.");
            return false;
          }
          await ctx.commit({
            noticeDate: v.noticeDate || "",
            moveOutDate: v.moveOutDate,
            ...(ctx.item.status === "Eviction" || ctx.item.status === "Terminated" ? {} : { status: "Notice given" }),
          });
          await ctx.commitMeta({
            moveOutReason: v.moveOutReason || "",
            forwardingAddress: v.forwardingAddress || "",
            refundMethod: v.refundMethod || "",
            moveOutMoveId: res.move.id,
          });
          toast.success(res.turn ? "Move-out, inspection, and unit turn scheduled." : "Move-out and inspection scheduled.");
          ctx.navigate("moveOut");
          return true;
        },
      },
    },
    {
      key: "terminate",
      label: "Terminate early",
      icon: XCircle,
      showIf: (l) => live(l) || l.status === "Pending",
      danger: true,
      separatorBefore: true,
      wizard: {
        title: "Terminate early",
        description: "Ends the lease before its term. The fee is recorded on the lease.",
        finishLabel: "Terminate Lease",
        logSummary: "Terminated the lease early",
        initial: (l) => ({ earlyTermDate: shiftDate(todayISO(), { days: 30 }), earlyTermNoticeOn: todayISO(), earlyTermFee: Number(l.rent) || 0, postFee: true }),
        steps: [
          {
            key: "terms",
            title: "Terms",
            fields: [
              { key: "earlyTermDate", label: "Termination date", type: "date", required: true },
              { key: "earlyTermNoticeOn", label: "Requested on", type: "date" },
              { key: "earlyTermReason", label: "Reason", type: "select", options: TERMINATION_REASON_OPTIONS, required: true },
              { key: "earlyTermFee", label: "Termination fee", type: "currency" },
              { key: "postFee", label: "Charge the fee to the lease ledger", type: "switch", showIf: (v) => Number(v.earlyTermFee) > 0 },
              { key: "earlyTermNotes", label: "Notes", type: "textarea" },
            ],
          },
        ],
        finish: async (v, ctx) => {
          const ok = await ctx.commit({ status: "Terminated", moveOutDate: v.earlyTermDate });
          if (!ok) return false;
          await ctx.commitMeta({
            earlyTermDate: v.earlyTermDate,
            earlyTermNoticeOn: v.earlyTermNoticeOn || "",
            earlyTermReason: v.earlyTermReason,
            earlyTermFee: Number(v.earlyTermFee) || 0,
            earlyTermFeePaid: false,
            earlyTermNotes: v.earlyTermNotes || "",
            originalTermEnd: ctx.item.termEnd || "",
          });
          const fee = Number(v.earlyTermFee) || 0;
          if (fee > 0 && v.postFee) {
            const l = ctx.item;
            const posted = await postCharge({
              leaseId: l.id,
              tenantId: l.tenantId,
              unitId: l.unitId,
              propertyId: l.propertyId,
              amount: fee,
              date: v.earlyTermNoticeOn || todayISO(),
              memo: "Early termination fee",
              incomeKey: "other_income",
              idempotencyKey: `early-term:${l.id}`,
            });
            if (!posted) toast.error(ledgerErrorMessage() || "Lease terminated, but the fee couldn't be posted to the ledger.");
          }
          toast.success("Lease terminated. Start the move-out when you're ready.");
          ctx.navigate("termination");
          return true;
        },
      },
    },
    {
      key: "eviction",
      label: "Start eviction",
      icon: Gavel,
      showIf: (l) => live(l) && !l.metadata?.evictionActive,
      danger: true,
      wizard: {
        title: "Start eviction",
        description: "Flags the lease (online payments can then be blocked per your payment policy) and records the notice.",
        finishLabel: "Start Eviction",
        logSummary: "Started an eviction",
        initial: () => ({ evictionReason: "Nonpayment of rent", noticeType: "Pay or quit", servedDate: todayISO(), cureBy: shiftDate(todayISO(), { days: 3 }), createNotice: true }),
        steps: [
          {
            key: "reason",
            title: "Reason",
            fields: [
              { key: "evictionReason", label: "Reason", type: "select", options: EVICTION_REASON_OPTIONS, required: true },
              { key: "evictionAmountOwed", label: "Amount owed", type: "currency" },
            ],
          },
          {
            key: "notice",
            title: "Notice",
            fields: [
              { key: "createNotice", label: "Record the notice served", type: "switch", full: true },
              { key: "noticeType", label: "Notice type", type: "select", options: toOptions(["Pay or quit", "Cure or quit", "Unconditional quit", "Eviction notice"]), showIf: (v) => v.createNotice },
              { key: "servedDate", label: "Served on", type: "date", showIf: (v) => v.createNotice },
              { key: "deliveryMethod", label: "Delivery", type: "select", options: DELIVERY_METHOD_OPTIONS, showIf: (v) => v.createNotice },
              { key: "cureBy", label: "Cure / vacate by", type: "date", showIf: (v) => v.createNotice },
            ],
          },
        ],
        finish: async (v, ctx) => {
          const prior = ctx.item.status;
          const ok = await ctx.commit({ status: "Eviction" });
          if (!ok) return false;
          await ctx.commitMeta({
            evictionActive: true,
            evictionStage: "Notice served",
            evictionReason: v.evictionReason,
            evictionAmountOwed: Number(v.evictionAmountOwed) || 0,
            evictionStartedOn: todayISO(),
            evictionPriorStatus: prior,
          });
          if (v.createNotice) {
            const reason = v.evictionReason;
            const noticeText = await draftNoticeText(ctx.item, { ...v, reason, amountDue: v.evictionAmountOwed });
            await createLeaseNotice(ctx.item, {
              noticeType: v.noticeType,
              servedDate: v.servedDate,
              cureBy: v.cureBy,
              deliveryMethod: v.deliveryMethod || "",
              amountDue: v.evictionAmountOwed,
              noticeText,
              status: "Served",
            });
          }
          toast.success("Eviction started.");
          ctx.navigate("eviction");
          return true;
        },
      },
    },
    {
      key: "closeEviction",
      label: "Close eviction",
      icon: ShieldOff,
      showIf: (l) => Boolean(l.metadata?.evictionActive),
      wizard: {
        title: "Close eviction",
        finishLabel: "Close Eviction",
        logSummary: "Closed the eviction",
        initial: () => ({ outcome: "Settled — tenant stays", closedOn: todayISO() }),
        steps: [
          {
            key: "outcome",
            title: "Outcome",
            fields: [
              { key: "outcome", label: "Outcome", type: "select", options: toOptions(["Settled — tenant stays", "Dismissed", "Possession recovered", "Tenant moved out"]), required: true },
              { key: "closedOn", label: "Closed on", type: "date", required: true },
              { key: "notes", label: "Notes", type: "textarea" },
            ],
          },
        ],
        finish: async (v, ctx) => {
          const stays = v.outcome === "Settled — tenant stays" || v.outcome === "Dismissed";
          const ok = await ctx.commit({ status: stays ? ctx.item.metadata?.evictionPriorStatus || "Active" : "Ended" });
          if (!ok) return false;
          await ctx.commitMeta({
            evictionActive: false,
            evictionClosedOn: v.closedOn,
            evictionOutcome: v.outcome,
            evictionStage: stays ? (v.outcome === "Dismissed" ? "Dismissed" : "Settled") : "Possession recovered",
            evictionNotes: [ctx.item.metadata?.evictionNotes, v.notes].filter(Boolean).join("\n"),
          });
          toast.success("Eviction closed.");
          return true;
        },
      },
    },
    {
      key: "serveNotice",
      label: "Serve a notice",
      icon: FileText,
      showIf: notClosed,
      separatorBefore: true,
      wizard: {
        title: "Serve a notice",
        description: "Records a notice on this lease with its wording, delivery, and cure date.",
        finishLabel: "Save Notice",
        logSummary: "Served a notice",
        initial: () => ({ noticeType: "Lease violation", servedDate: todayISO(), cureBy: shiftDate(todayISO(), { days: 10 }), deliveryMethod: "Posted" }),
        steps: [
          {
            key: "details",
            title: "Details",
            fields: [
              { key: "noticeType", label: "Type", type: "select", options: NOTICE_TYPE_OPTIONS, required: true },
              { key: "servedDate", label: "Served on", type: "date" },
              { key: "deliveryMethod", label: "Delivery", type: "select", options: DELIVERY_METHOD_OPTIONS },
              { key: "cureBy", label: "Cure by / effective", type: "date" },
              { key: "amountDue", label: "Amount", type: "currency" },
              { key: "reason", label: "Violation / reason", type: "text", full: true },
            ],
          },
          {
            key: "text",
            title: "Wording",
            fields: [{ key: "noticeText", label: "Notice text", type: "textarea", rows: 12 }],
            render: ({ values, set }) => <NoticeTextFiller lease={lease} values={values} set={set} />,
          },
        ],
        finish: async (v, ctx) => {
          const row = await createLeaseNotice(ctx.item, { ...v, status: v.servedDate ? "Served" : "Draft" });
          if (!row) {
            toast.error("Couldn't save the notice.");
            return false;
          }
          toast.success("Notice saved.");
          ctx.navigate("notices");
          return true;
        },
      },
    },
    {
      key: "monthToMonth",
      label: "Convert to month-to-month",
      icon: Repeat,
      showIf: (l) => live(l) && l.termType !== "mtm",
      wizard: {
        title: "Convert to month-to-month",
        finishLabel: "Convert",
        logSummary: "Converted the lease to month-to-month",
        initial: (l) => ({ mtmSince: shiftDate(l.termEnd || todayISO(), { days: 1 }), premium: Number(l.metadata?.mtmPremium) || 0, applyPremium: true }),
        steps: [
          {
            key: "terms",
            title: "Terms",
            fields: [
              { key: "mtmSince", label: "Month-to-month from", type: "date", required: true },
              { key: "premium", label: "Month-to-month premium", type: "currency" },
              { key: "applyPremium", label: "Add the premium to the rent", type: "switch" },
            ],
          },
        ],
        finish: async (v, ctx) => {
          const rent = (Number(ctx.item.rent) || 0) + (v.applyPremium ? Number(v.premium) || 0 : 0);
          const ok = await ctx.commit({ termType: "mtm", status: "Month-to-month", rent });
          if (!ok) return false;
          await ctx.commitMeta({ mtmSince: v.mtmSince, mtmPremium: Number(v.premium) || 0 });
          toast.success("Lease is now month-to-month.");
          return true;
        },
      },
    },
    {
      key: "endLease",
      label: "End lease",
      icon: Square,
      showIf: (l) => ["Notice given", "Terminated", "Month-to-month", "Eviction"].includes(l.status),
      wizard: {
        title: "End lease",
        description: "Closes the lease after move-out and frees the unit.",
        finishLabel: "End Lease",
        logSummary: "Ended the lease",
        initial: (l) => ({ endedOn: l.moveOutDate || todayISO(), vacateUnit: true, tenantPast: true }),
        steps: [
          {
            key: "end",
            title: "End",
            fields: [
              { key: "endedOn", label: "Ended on", type: "date", required: true },
              { key: "vacateUnit", label: "Mark the unit vacant", type: "switch" },
              { key: "tenantPast", label: "Mark the tenant as past", type: "switch" },
            ],
          },
        ],
        finish: async (v, ctx) => {
          const ok = await ctx.commit({ status: "Ended", moveOutDate: v.endedOn });
          if (!ok) return false;
          await Promise.all([
            v.vacateUnit && ctx.item.unitId
              ? updateUnit(ctx.item.unitId, { status: "Vacant", tenantId: "", occupantName: "", leaseStart: "", leaseEnd: "" })
              : true,
            v.tenantPast && ctx.item.tenantId ? updateTenant(ctx.item.tenantId, { status: "Past" }) : true,
          ]);
          toast.success("Lease ended.");
          return true;
        },
      },
    },
    {
      key: "generateDocument",
      label: "Generate lease document",
      icon: Wand2,
      separatorBefore: true,
      run: async (ctx) => {
        const id = toast.loading("Generating the lease document…");
        const res = await generateLeaseDocument(ctx.item);
        if (!res) {
          toast.error("Couldn't generate the lease document.", { id });
          return;
        }
        await ctx.commitMeta({
          lastDocumentAt: new Date().toISOString(),
          lastDocumentId: res.document.id,
          lastDocumentUrl: res.document.url,
        });
        ctx.log("Generated the lease document");
        toast.success(
          res.unknown.length || res.empty.length ? "Lease document saved — some merge fields were blank." : "Lease document saved to Documents.",
          { id },
        );
        ctx.navigate("document");
      },
    },
  ];
}

export default leaseActions;
