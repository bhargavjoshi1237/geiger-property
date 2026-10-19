"use client";

import { useState } from "react";
import { toast } from "sonner";
import { LayoutDashboard, Repeat, Send, Clock, Loader2, ReceiptText, Ban } from "lucide-react";

import { EmptyState, SectionCard, StatusPill } from "@/components/internal/shared/screen_kit";
import { Button } from "@geiger/ui/button";
import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { recurringChargesLayer } from "@/lib/supabase/recurring_charges";
import { incomeAccountOptions } from "@/lib/supabase/gl_accounts";
import { ledgerErrorMessage, postCharge, voidEntry } from "@/lib/supabase/ledger";
import { tenantOptions, unitOptions } from "@/lib/supabase/options";
import {
  makeFieldsSection,
  makeOverviewSection,
  makeNotesSection,
} from "@/components/internal/screens/entity/sections/factories";
import { leaseLinkOptions } from "./options";
import { withMetaMirror } from "./sections";
import { RoleGate } from "@/components/internal/shared/role_gate";
import { NO_POST, useCanPost, useCanVoid } from "./ledger_dialogs";
import {
  RECURRING_STATUS_MAP,
  CHARGE_FREQUENCIES,
  FREQUENCY_MONTHS,
  filterOptions,
  optionsOf,
  currency,
  money,
  formatDate,
  todayISO,
  addMonthsISO,
  monthlyEquivalent,
} from "./shared";

// Recurring Charges — scheduled tenant charges beyond base rent (parking, pet
// rent, storage…) over `property.recurring_charges`. Posting a charge books
// Dr Accounts Receivable / Cr the charge's income account on the lease's
// ledger (idempotent per charge + date) and advances the schedule. The
// financial scheduler posts due charges automatically.

const FREQUENCY_OPTIONS = optionsOf(CHARGE_FREQUENCIES);
const STATUS_OPTIONS = filterOptions(RECURRING_STATUS_MAP).slice(1);

// Post one occurrence of a charge → entry id or null.
export async function postRecurringOccurrence(charge, date) {
  const posted = await postCharge({
    date,
    amount: charge.amount,
    glAccountId: charge.glAccountId || undefined,
    leaseId: charge.leaseId || undefined,
    tenantId: charge.tenantId || undefined,
    unitId: charge.unitId || undefined,
    propertyId: charge.propertyId || undefined,
    memo: `${charge.name} · ${formatDate(date)}`,
    sourceId: charge.id,
    idempotencyKey: `rc:${charge.id}:${date}`,
    metadata: { recurringChargeId: charge.id },
  });
  return posted?.entryId || null;
}

// Posting panel: posts the next occurrence to the ledger and advances nextDate.
function PostingSection({ item, onCommit }) {
  const [busy, setBusy] = useState(false);
  const postings = Array.isArray(item?.metadata?.postings) ? item.metadata.postings : [];
  const amount = Number(item.amount) || 0;
  const linked = Boolean(item.leaseId || item.tenantId);
  const ready = item.status === "Active" && amount > 0 && linked;
  const canPost = useCanPost();
  const canVoid = useCanVoid();

  const post = async () => {
    if (!canPost) {
      toast.error(NO_POST);
      return;
    }
    setBusy(true);
    const date = item.nextDate || todayISO();
    const entryId = await postRecurringOccurrence(item, date);
    setBusy(false);
    if (!entryId) {
      toast.error(ledgerErrorMessage() || "Couldn't post the charge to the ledger.");
      return;
    }
    const months = FREQUENCY_MONTHS[item.frequency] ?? 1;
    onCommit({
      ...(months ? { nextDate: addMonthsISO(date, months) } : { status: "Ended" }),
      metadata: {
        ...(item.metadata || {}),
        postings: [{ id: entryId, entryId, date, amount, postedAt: todayISO() }, ...postings.filter((p) => p.entryId !== entryId)],
      },
    });
    toast.success(`Posted ${money(amount)} to ${item.tenantName || "the lease"}'s ledger.`);
  };

  const voidPosting = async (p) => {
    if (p.entryId) {
      const voided = await voidEntry(p.entryId, { memo: `Void: ${item.name} · ${formatDate(p.date)}` });
      if (!voided && !/already void/.test(ledgerErrorMessage())) {
        toast.error(ledgerErrorMessage() || "Couldn't void this posting.");
        return;
      }
    }
    onCommit({
      metadata: {
        ...(item.metadata || {}),
        postings: postings.map((x) => (x.id === p.id ? { ...x, voided: true } : x)),
      },
    });
    toast.success("Posting voided — a reversal was posted.");
  };

  return (
    <div className="space-y-4">
      <SectionCard>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">
              Next charge: {money(amount)} on {formatDate(item.nextDate || todayISO())}
            </p>
            <p className="mt-0.5 text-sm text-text-secondary">
              {linked
                ? `Posts Dr Accounts Receivable / Cr ${item.account || "Rental Income"} to ${item.tenantName || "the lease"}${item.frequency === "One-time" ? " and ends this charge." : ", then moves the next date forward."}`
                : "Link a lease or tenant in Details to post this charge."}
            </p>
          </div>
          <RoleGate allowed={canPost} reason={NO_POST}>
            <Button
              className="shrink-0 bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={!ready || !canPost || busy}
              onClick={post}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Post Next Charge
            </Button>
          </RoleGate>
        </div>
      </SectionCard>

      {postings.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface-subtle">
          <EmptyState
            icon={ReceiptText}
            title="Nothing posted yet"
            description="Charges you (or the scheduler) post appear here and on the lease's ledger."
          />
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface-subtle">
          {postings.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{formatDate(p.date)}</p>
                <p className="truncate text-xs text-text-secondary">
                  {[p.voided ? "Voided" : p.entryId ? "Posted to ledger" : p.account ? `Posted to ${p.account}` : "Posted", p.auto ? "Scheduler" : null, formatDate(p.postedAt)]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className={`text-sm font-semibold tabular-nums ${p.voided ? "text-text-tertiary line-through" : "text-foreground"}`}>
                  {money(p.amount)}
                </span>
                {canVoid && p.entryId && !p.voided ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-300"
                    onClick={() => voidPosting(p)}
                    aria-label="Void posting"
                  >
                    <Ban className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Lease/unit display names have no column here; they live in metadata.
const DetailFields = withMetaMirror(
  makeFieldsSection([
    { key: "name", label: "Charge", type: "text", full: true },
    { key: "leaseId", label: "Lease", type: "relation", load: leaseLinkOptions, displayKey: "leaseName", hint: "Fills tenant, unit and property." },
    { key: "tenantId", label: "Tenant", type: "relation", load: tenantOptions, displayKey: "tenantName" },
    { key: "unitId", label: "Unit", type: "relation", load: unitOptions, displayKey: "unit" },
    { key: "amount", label: "Amount", type: "currency", placeholder: "0.00" },
    { key: "frequency", label: "Frequency", type: "select", options: FREQUENCY_OPTIONS },
    { key: "nextDate", label: "Next charge date", type: "date" },
    { key: "status", label: "Status", type: "select", options: STATUS_OPTIONS },
    { key: "glAccountId", label: "Income account", type: "relation", load: incomeAccountOptions, displayKey: "account", hint: "Defaults to Rental Income when empty." },
    { key: "autoPost", label: "Post automatically", type: "switch", meta: true, hint: "The daily scheduler posts this charge when it comes due." },
  ]),
  ["leaseName", "propertyName"],
);

const chargesConfig = {
  key: "charge",
  singular: "Recurring charge",
  plural: "Recurring charges",
  title: "Recurring Charges",
  description:
    "Scheduled charges beyond base rent — parking, pets, storage, utilities. Each posting books a receivable on the lease's ledger.",
  icon: Repeat,
  titleField: "name",
  searchFields: ["name", "tenantName", "unit", "account"],
  data: recurringChargesLayer.data,

  statusMap: RECURRING_STATUS_MAP,
  statusFilterOptions: filterOptions(RECURRING_STATUS_MAP),

  columns: [
    {
      key: "name",
      header: "Charge",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="text-xs text-text-secondary">
            {[r.tenantName, r.unit, r.account].filter(Boolean).join(" · ") || "No tenant linked"}
          </span>
        </div>
      ),
    },
    {
      key: "frequency",
      header: "Frequency",
      className: "text-sm text-text-secondary",
      render: (r) => r.frequency || "—",
    },
    {
      key: "nextDate",
      header: "Next charge",
      className: "whitespace-nowrap text-sm tabular-nums text-text-secondary",
      render: (r) => (r.status === "Active" ? formatDate(r.nextDate) : "—"),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusPill status={r.status} map={RECURRING_STATUS_MAP} />,
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      className: "text-right font-semibold tabular-nums text-foreground",
      render: (r) => money(r.amount),
    },
  ],

  stats: (rows) => {
    const active = rows.filter((r) => r.status === "Active");
    const monthly = active.reduce((s, r) => s + monthlyEquivalent(r.amount, r.frequency), 0);
    const horizon = addMonthsISO(todayISO(), 1);
    const dueSoon = active.filter((r) => r.nextDate && r.nextDate <= horizon);
    const unlinked = active.filter((r) => !r.leaseId && !r.tenantId);
    return [
      { label: "Monthly recurring", value: currency(monthly), footer: "Active charges, per month" },
      { label: "Active charges", value: String(active.length), footer: `${rows.length} total` },
      { label: "Due next 30 days", value: String(dueSoon.length), footer: currency(dueSoon.reduce((s, r) => s + (Number(r.amount) || 0), 0)) },
      { label: "Not linked", value: String(unlinked.length), footer: "Need a lease or tenant to post" },
    ];
  },

  createDraft: { name: "", leaseId: "", tenantId: "", tenantName: "", unitId: "", unit: "", propertyId: "", amount: "", frequency: "Monthly", nextDate: "", glAccountId: "", account: "" },
  createFields: [
    { key: "name", label: "Charge", type: "text", placeholder: "e.g. Parking space #12" },
    {
      key: "leaseId",
      label: "Lease",
      type: "select",
      optionsFrom: "leases",
      placeholder: "Select a lease…",
      emptyLabel: "No leases yet — add them in Leases",
    },
    { key: "amount", label: "Amount", type: "number", placeholder: "0.00" },
    { key: "frequency", label: "Frequency", type: "select", options: FREQUENCY_OPTIONS },
    { key: "nextDate", label: "Next charge date", type: "date" },
    {
      key: "glAccountId",
      label: "Income account",
      type: "select",
      optionsFrom: "accounts",
      placeholder: "Rental Income",
      emptyLabel: "No accounts yet — add them in Chart of Accounts",
    },
  ],
  loadCreateOptions: async () => {
    const [leases, accounts] = await Promise.all([leaseLinkOptions(), incomeAccountOptions()]);
    return { leases, accounts };
  },
  newRow: (draft) => ({
    name: draft.name.trim(),
    leaseId: draft.leaseId || "",
    tenantId: draft.tenantId || "",
    tenantName: draft.tenantName || "",
    unitId: draft.unitId || "",
    unit: draft.unit || "",
    propertyId: draft.propertyId || "",
    amount: Math.abs(Number(draft.amount) || 0),
    frequency: draft.frequency || "Monthly",
    nextDate: draft.nextDate || todayISO(),
    glAccountId: draft.glAccountId || "",
    account: draft.account || "",
    status: "Active",
    metadata: { leaseName: draft.leaseName || "", autoPost: true },
  }),

  headerMeta: (r) =>
    [r.tenantName, `${money(r.amount)} ${(r.frequency || "").toLowerCase()}`.trim(), r.account].filter(Boolean).join(" · "),

  navGroups: [
    {
      group: null,
      items: [{ key: "overview", label: "Overview", icon: LayoutDashboard, desc: "A snapshot of this charge." }],
    },
    {
      group: "Charge",
      items: [
        { key: "details", label: "Details", icon: Repeat, desc: "Lease, amount, schedule, and income account." },
        { key: "posting", label: "Posting", icon: Send, desc: "Post the next occurrence to the lease's ledger." },
        { key: "activity", label: "Activity", icon: Clock, desc: "Notes and history." },
      ],
    },
  ],
  sections: {
    overview: makeOverviewSection({
      fields: [
        { key: "leaseName", label: "Lease", meta: true },
        { key: "tenantName", label: "Tenant" },
        { key: "unit", label: "Unit" },
        { key: "amount", label: "Amount", format: (v) => money(v) },
        { key: "frequency", label: "Frequency" },
        { key: "nextDate", label: "Next charge", format: (v) => formatDate(v) },
        { key: "monthly", label: "Monthly equivalent", format: (_v, r) => money(monthlyEquivalent(r.amount, r.frequency)) },
        { key: "account", label: "Income account", format: (v) => v || "Rental Income (default)" },
        { key: "status", label: "Status" },
      ],
    }),
    details: DetailFields,
    posting: PostingSection,
    activity: makeNotesSection({ field: "activityNotes", placeholder: "Log a note about this charge…" }),
  },
};

export function RecurringChargesScreen() {
  return <EntityListScreen config={chargesConfig} />;
}

export default RecurringChargesScreen;
