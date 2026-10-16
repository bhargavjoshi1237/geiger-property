"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  LayoutDashboard,
  Link2,
  Landmark,
  Scissors,
  Undo2,
  FileText,
  Clock,
  PiggyBank,
  Percent,
  Mail,
  CalendarClock,
  Loader2,
  Wand2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ListLoading, SectionCard, StatGrid, StatusPill } from "@/components/internal/shared/screen_kit";
import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { FieldsForm } from "@/components/internal/screens/entity/fields_form";
import { ActivitySection, DocumentsSection } from "@/components/internal/screens/entity/shared_sections";
import { securityDepositsData } from "@/lib/supabase/security_deposits";
import { leasesLayer } from "@/lib/supabase/leases";
import { movesLayer } from "@/lib/supabase/moves";
import { leaseOptions, tenantOptions, unitOptions } from "@/lib/supabase/options";
import { addDays, leasePolicies, storeTextDocument, todayISO } from "@/lib/leasing/workflows";
import { makeNotesSection } from "@/components/internal/screens/entity/sections/factories";
import { Callout, MetaRecords, makeMetaAwareFieldsSection } from "./sections/gated";
import { tenantJoinedLoader } from "./joins";
import {
  DEDUCTION_CATEGORY_OPTIONS,
  DEPOSIT_KIND_OPTIONS,
  DEPOSIT_OPEN_STATUSES,
  DEPOSIT_STATUS_MAP,
  REFUND_METHOD_OPTIONS,
  daysUntil,
  filterOptions,
  formatDate,
  metaList,
  money2,
  sumBy,
} from "./shared";

// Security Deposits — an entity screen over `property.security_deposits`:
// itemized deductions, interest accrued at the policy rate, the return deadline
// (policy days after move-out) with overdue badges, and the disposition letter.

const deductionsOf = (r) => sumBy(metaList(r, "deductions"));
const interestOf = (r) => Number(r?.metadata?.interestAccrued) || 0;
const refundDue = (r) => Math.max(0, (Number(r.amount) || 0) + interestOf(r) - deductionsOf(r));
const isOpen = (r) => DEPOSIT_OPEN_STATUSES.includes(r.status);
const isOverdue = (r) => isOpen(r) && r.returnDue && daysUntil(r.returnDue) < 0;

function DeadlineBadge({ row }) {
  if (!row.returnDue) return <span className="text-text-tertiary">—</span>;
  if (!isOpen(row)) return <span className="text-sm text-muted-foreground">{formatDate(row.returnDue)}</span>;
  const d = daysUntil(row.returnDue);
  if (d < 0) return <Badge variant="danger">{-d}d overdue</Badge>;
  if (d <= 7) return <Badge variant="warning">Due in {d}d</Badge>;
  return <span className="text-sm text-muted-foreground">{formatDate(row.returnDue)}</span>;
}

// Simple interest from received date to returned/move-out date (or today).
function accrual(r, rate) {
  const from = r.metadata?.receivedOn || r.createdAt?.slice(0, 10);
  const to = r.returnedOn || r.moveOutDate || todayISO();
  if (!from || !rate) return { days: 0, amount: 0, from, to };
  const days = Math.max(0, Math.round((new Date(`${to}T00:00:00`) - new Date(`${String(from).slice(0, 10)}T00:00:00`)) / 86400000));
  return { days, amount: Math.round((Number(r.amount) || 0) * (rate / 100) * (days / 365) * 100) / 100, from, to };
}

// Effective deposit policies via the linked lease (company → property → lease).
function useDepositPolicies(item) {
  const [policies, setPolicies] = useState(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const lease = item.leaseId ? await leasesLayer.get(item.leaseId) : null;
      const p = await leasePolicies(lease || { propertyId: item.propertyId });
      if (alive) setPolicies(p);
    })();
    return () => {
      alive = false;
    };
  }, [item.leaseId, item.propertyId]);
  return policies;
}

function DepositOverviewSection({ item }) {
  const d = daysUntil(item.returnDue);
  return (
    <div className="space-y-5">
      {isOverdue(item) ? (
        <Callout tone="danger">The return deadline passed {-d} days ago — send the disposition and refund now.</Callout>
      ) : isOpen(item) && item.returnDue ? (
        <Callout tone={d <= 7 ? "warning" : "info"}>Itemized disposition due by {formatDate(item.returnDue)} ({d} days).</Callout>
      ) : null}
      <StatGrid
        stats={[
          { label: "Deposit", value: money2(item.amount), hint: item.metadata?.depositKind || "Security deposit" },
          { label: "Interest", value: money2(interestOf(item)), hint: "Recorded accrual" },
          { label: "Deductions", value: money2(deductionsOf(item)), hint: `${metaList(item, "deductions").length} items` },
          { label: item.returnedOn ? "Refunded" : "Refund due", value: money2(item.returnedOn ? item.refundAmount : refundDue(item)), hint: item.returnedOn ? formatDate(item.returnedOn) : "Deposit + interest − deductions" },
        ]}
      />
      <SectionCard>
        <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
          {[
            ["Tenant", item.tenantName],
            ["Unit", item.unit],
            ["Lease", item.leaseName],
            ["Held at", item.heldLocation],
            ["Received", formatDate(item.metadata?.receivedOn)],
            ["Move-out", formatDate(item.moveOutDate)],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">{k}</dt>
              <dd className="mt-1 truncate text-foreground">{v || "—"}</dd>
            </div>
          ))}
        </dl>
      </SectionCard>
    </div>
  );
}

function InterestSection({ item, onPatch, onCommit, onCommitMeta }) {
  const policies = useDepositPolicies(item);
  if (!policies) return <ListLoading label="Loading deposit policy" className="py-10" />;
  const override = item.metadata?.interestRateOverride;
  const rate = override !== undefined && override !== "" ? Number(override) : Number(policies.depositInterestRate) || 0;
  const a = accrual(item, rate);
  return (
    <div className="space-y-5">
      <SectionCard
        title="Accrued interest"
        description={`${rate}% simple interest${override !== undefined && override !== "" ? " (override)" : " from your deposit policy"} · ${formatDate(a.from)} – ${formatDate(a.to)} (${a.days} days)`}
        action={
          <Button
            size="sm"
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={a.amount === interestOf(item)}
            onClick={async () => {
              if (await onCommitMeta({ interestAccrued: a.amount, interestCalculatedOn: todayISO() })) toast.success(`Recorded ${money2(a.amount)} of interest.`);
            }}
          >
            Record {money2(a.amount)}
          </Button>
        }
      >
        <p className="text-sm text-text-secondary">
          Recorded so far: <span className="font-medium text-foreground">{money2(interestOf(item))}</span>
          {item.metadata?.interestCalculatedOn ? ` on ${formatDate(item.metadata.interestCalculatedOn)}` : ""}. Interest is added to the refund due.
        </p>
      </SectionCard>
      <SectionCard title="Settings">
        <FieldsForm
          item={item}
          fields={[
            { key: "interestBearing", label: "Interest-bearing account", type: "switch", meta: true },
            { key: "interestRateOverride", label: "Rate override", type: "percent", meta: true, hint: "Blank to use the policy rate." },
            { key: "interestPaidAnnually", label: "Interest paid to tenant annually", type: "switch", meta: true },
          ]}
          onPatch={onPatch}
          onCommit={onCommit}
          onCommitMeta={onCommitMeta}
        />
      </SectionCard>
    </div>
  );
}

const RETURN_FIELDS = [
  { key: "moveOutDate", label: "Move-out date", type: "date" },
  { key: "returnDue", label: "Return deadline", type: "date" },
  { key: "suggested", label: "Refund due", type: "readonly", format: (_v, r) => money2(refundDue(r)), hint: "Deposit + interest − deductions." },
  { key: "refundAmount", label: "Refund paid", type: "currency" },
  { key: "returnedOn", label: "Returned on", type: "date" },
  { key: "refundMethod", label: "Refund method", type: "select", meta: true, options: REFUND_METHOD_OPTIONS },
  { key: "checkNumber", label: "Check / reference #", type: "text", meta: true },
  { key: "amountOwedByTenant", label: "Balance owed by tenant", type: "readonly", format: (_v, r) => money2(Math.max(0, deductionsOf(r) - (Number(r.amount) || 0) - interestOf(r))) },
  { key: "forwardingAddress", label: "Forwarding address", type: "textarea", meta: true },
];

function ReturnSection(props) {
  const { item, onCommit } = props;
  const policies = useDepositPolicies(item);
  const days = Number(policies?.depositReturnDays) || 30;
  return (
    <div className="space-y-5">
      {item.moveOutDate && !item.returnDue ? (
        <Callout
          tone="info"
          action={
            <Button size="sm" variant="outline" className="border-border bg-surface-card" onClick={() => onCommit({ returnDue: addDays(item.moveOutDate, days) })}>
              <CalendarClock className="h-4 w-4" /> Set deadline
            </Button>
          }
        >
          Your policy gives {days} days after move-out — deadline {formatDate(addDays(item.moveOutDate, days))}.
        </Callout>
      ) : null}
      <SectionCard title="Return">
        <FieldsForm item={item} fields={RETURN_FIELDS} onPatch={props.onPatch} onCommit={props.onCommit} onCommitMeta={props.onCommitMeta} />
      </SectionCard>
    </div>
  );
}

function dispositionText(r) {
  const deds = metaList(r, "deductions");
  const lines = [
    formatDate(todayISO()),
    "",
    `To: ${r.tenantName || "Tenant"}`,
    r.metadata?.forwardingAddress || "",
    "",
    `RE: Security deposit itemization — ${r.unit || r.leaseName || ""}`,
    "",
    `Move-out date: ${formatDate(r.moveOutDate)}`,
    "",
    `Deposit held:            ${money2(r.amount)}`,
    `Interest accrued:        ${money2(interestOf(r))}`,
    "",
    "Itemized deductions:",
    ...(deds.length ? deds.map((d) => `  • ${d.label}${d.category ? ` (${d.category})` : ""}: ${money2(d.amount)}${d.notes ? ` — ${d.notes}` : ""}`) : ["  None"]),
    `Total deductions:        ${money2(deductionsOf(r))}`,
    "",
    `Amount refunded:         ${money2(r.returnedOn ? r.refundAmount : refundDue(r))}`,
  ];
  const owed = deductionsOf(r) - (Number(r.amount) || 0) - interestOf(r);
  if (owed > 0) lines.push(`Balance you owe:         ${money2(owed)}`);
  lines.push("", r.metadata?.refundMethod ? `Refund sent by ${r.metadata.refundMethod}${r.metadata?.checkNumber ? ` #${r.metadata.checkNumber}` : ""}.` : "", "", "Management");
  return lines.join("\n");
}

function LetterSection({ item, onCommitMeta }) {
  const [busy, setBusy] = useState(false);
  const text = dispositionText(item);
  const save = async () => {
    setBusy(true);
    const doc = await storeTextDocument({ ownerType: "deposit", ownerId: item.id, kind: "deposit_disposition", name: `${item.name || "Deposit"} — disposition`, text });
    setBusy(false);
    if (!doc) {
      toast.error("Couldn't save the letter.");
      return;
    }
    await onCommitMeta({ letterSentOn: todayISO(), letterUrl: doc.url });
    toast.success("Disposition letter saved to Documents.");
  };
  return (
    <SectionCard
      title="Disposition letter"
      description={item.metadata?.letterSentOn ? `Last saved ${formatDate(item.metadata.letterSentOn)}.` : "The itemized statement the tenant receives."}
      action={
        <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={busy} onClick={save}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />} Save as document
        </Button>
      }
    >
      <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap font-mono text-[13px] leading-relaxed text-foreground">{text}</pre>
    </SectionCard>
  );
}

const DEDUCTION_FIELDS = [
  { key: "label", label: "Description", type: "text", required: true, placeholder: "e.g. Carpet cleaning — bedroom 2" },
  { key: "category", label: "Category", type: "select", options: DEDUCTION_CATEGORY_OPTIONS },
  { key: "amount", label: "Amount", type: "currency", required: true },
  { key: "invoiceNumber", label: "Invoice / receipt #", type: "text" },
  { key: "notes", label: "Notes", type: "textarea", full: true },
];

function DeductionsSection({ item, config, onCommitMeta }) {
  return (
    <MetaRecords
      item={item}
      config={config}
      onCommitMeta={onCommitMeta}
      field="deductions"
      fields={DEDUCTION_FIELDS}
      singular="Deduction"
      icon={Scissors}
      defaults={() => ({ category: "Cleaning" })}
      emptyDescription="Itemize every charge against the deposit — the move-out inspection comparison can add them for you."
      summary={(d) => ({
        title: d.label,
        meta: [d.category, d.invoiceNumber ? `#${d.invoiceNumber}` : null, d.inspectionId ? "From inspection" : null, d.notes].filter(Boolean).join(" · "),
        aside: money2(d.amount),
      })}
    />
  );
}

async function moveOptions() {
  const rows = (await movesLayer.list({ kind: "out" })) ?? [];
  return rows.map((m) => ({ value: m.id, label: `${m.name || "Move-out"} · ${formatDate(m.moveDate)}`, patch: {} }));
}

// Lease options for the create dialog, carrying the lease's deposit as the amount.
async function depositLeaseOptions() {
  const rows = (await leasesLayer.list()) ?? [];
  return rows.map((l) => ({
    value: l.id,
    label: l.deposit ? `${l.name} — ${money2(l.deposit)}` : l.name || "Lease",
    patch: {
      leaseName: l.name || "",
      unitId: l.unitId || "",
      unit: l.unit || "",
      tenantId: l.tenantId || "",
      tenantName: l.tenantName || "",
      propertyId: l.propertyId || "",
      amount: Number(l.deposit) || 0,
    },
  }));
}

const depositsConfig = {
  key: "deposit",
  singular: "Deposit",
  plural: "Deposits",
  title: "Security Deposits",
  description:
    "Every deposit you hold — where it's held, interest accrued, itemized deductions, and the return deadline after move-out.",
  icon: PiggyBank,
  titleField: "name",
  searchFields: ["name", "unit", "tenantName", "leaseName"],
  data: securityDepositsData,
  rowsLoader: tenantJoinedLoader(securityDepositsData),

  statusMap: DEPOSIT_STATUS_MAP,
  statusFilterOptions: filterOptions(DEPOSIT_STATUS_MAP),

  views: [
    { value: "all", label: "All", filter: () => true },
    { value: "held", label: "Held", filter: (r) => r.status === "Held" || r.status === "Pending" },
    { value: "awaiting", label: "Awaiting disposition", filter: (r) => r.status === "Awaiting disposition" || (isOpen(r) && Boolean(r.moveOutDate)) },
    { value: "overdue", label: "Overdue", filter: isOverdue },
    { value: "closed", label: "Closed", filter: (r) => !isOpen(r) },
  ],

  columns: [
    {
      key: "name",
      header: "Deposit",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="text-xs text-text-secondary">
            {[r.tenantName, r.unit].filter(Boolean).join(" · ") || "No unit linked"}
          </span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusPill status={r.status} map={DEPOSIT_STATUS_MAP} />,
    },
    { key: "returnDue", header: "Return by", render: (r) => <DeadlineBadge row={r} /> },
    {
      key: "deductions",
      header: "Deductions",
      align: "right",
      className: "text-right tabular-nums text-text-secondary",
      render: (r) => (deductionsOf(r) ? money2(deductionsOf(r)) : "—"),
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      className: "text-right font-semibold tabular-nums text-foreground",
      render: (r) => money2(r.amount),
    },
  ],

  stats: (rows) => {
    const held = rows.filter(isOpen);
    const total = held.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const overdue = rows.filter(isOverdue).length;
    const awaiting = rows.filter((r) => isOpen(r) && r.moveOutDate).length;
    return [
      { label: "Deposits held", value: String(held.length), footer: `${rows.length} total` },
      { label: "Total held", value: money2(total), footer: "Liability on the books" },
      { label: "Awaiting disposition", value: String(awaiting), footer: "Moved out, not yet returned" },
      { label: "Overdue", value: String(overdue), footer: "Past the return deadline" },
    ];
  },

  createDraft: { name: "", leaseId: "", amount: "" },
  createFields: [
    { key: "name", label: "Deposit label", type: "text", placeholder: "e.g. Maple Court · 4B — Jordan Blake" },
    {
      key: "leaseId",
      label: "Lease",
      type: "select",
      optionsFrom: "leases",
      placeholder: "Select a lease…",
      emptyLabel: "No leases yet — add them in Leases",
    },
    { key: "amount", label: "Amount", type: "number", placeholder: "0" },
  ],
  loadCreateOptions: async () => ({ leases: await depositLeaseOptions() }),
  newRow: (draft) => ({
    name: draft.name.trim(),
    leaseId: draft.leaseId || "",
    leaseName: draft.leaseName || "",
    unitId: draft.unitId || "",
    unit: draft.unit || "",
    tenantId: draft.tenantId || "",
    tenantName: draft.tenantName || "",
    propertyId: draft.propertyId || "",
    amount: Number(draft.amount) || 0,
    status: "Held",
    metadata: { depositKind: "Security deposit", receivedOn: todayISO() },
  }),

  headerMeta: (r) => [r.tenantName, r.unit, money2(r.amount), r.returnDue && isOpen(r) ? `Return by ${formatDate(r.returnDue)}` : null].filter(Boolean).join(" · "),

  actions: [
    {
      key: "deadline",
      label: "Set return deadline",
      icon: CalendarClock,
      showIf: isOpen,
      wizard: {
        title: "Set return deadline",
        description: "Counted from the move-out date using your deposit policy.",
        finishLabel: "Save deadline",
        logSummary: "Set the deposit return deadline",
        initial: (r) => ({ moveOutDate: r.moveOutDate || todayISO() }),
        steps: [{ key: "dates", title: "Dates", fields: [{ key: "moveOutDate", label: "Move-out date", type: "date", required: true }, { key: "days", label: "Return within (days)", type: "number", placeholder: "Your deposit policy" }] }],
        finish: async (v, ctx) => {
          const lease = ctx.item.leaseId ? await leasesLayer.get(ctx.item.leaseId) : null;
          const days = Number(v.days) || Number((await leasePolicies(lease || { propertyId: ctx.item.propertyId })).depositReturnDays) || 30;
          const ok = await ctx.commit({ moveOutDate: v.moveOutDate, returnDue: addDays(v.moveOutDate, days), status: "Awaiting disposition" });
          if (ok) toast.success(`Return deadline set to ${formatDate(addDays(v.moveOutDate, days))}.`);
          return ok;
        },
      },
    },
    {
      key: "return",
      label: "Return deposit",
      icon: Undo2,
      showIf: isOpen,
      wizard: {
        title: "Return deposit",
        description: "Records the refund and closes the deposit.",
        finishLabel: "Record return",
        logSummary: "Returned the deposit",
        initial: (r) => ({ returnedOn: todayISO(), refundAmount: refundDue(r), refundMethod: r.metadata?.refundMethod || "Check", saveLetter: true }),
        steps: [
          {
            key: "review",
            title: "Review",
            render: () => null,
            description: "Deductions are itemized in the Deductions tab and interest in Interest — check both before returning.",
          },
          {
            key: "refund",
            title: "Refund",
            fields: [
              { key: "refundAmount", label: "Refund amount", type: "currency", required: true },
              { key: "returnedOn", label: "Returned on", type: "date", required: true },
              { key: "refundMethod", label: "Method", type: "select", options: REFUND_METHOD_OPTIONS },
              { key: "checkNumber", label: "Check / reference #", type: "text" },
              { key: "saveLetter", label: "Save the disposition letter to Documents", type: "switch" },
            ],
          },
        ],
        finish: async (v, ctx) => {
          const amount = Number(v.refundAmount) || 0;
          const held = Number(ctx.item.amount) || 0;
          const status = amount <= 0 ? "Forfeited" : amount < held + interestOf(ctx.item) - 0.005 ? "Partially returned" : "Returned";
          const ok = await ctx.commit({ refundAmount: amount, returnedOn: v.returnedOn, status });
          if (!ok) return false;
          await ctx.commitMeta({ refundMethod: v.refundMethod || "", checkNumber: v.checkNumber || "" });
          if (v.saveLetter) {
            const next = { ...ctx.item, refundAmount: amount, returnedOn: v.returnedOn, metadata: { ...(ctx.item.metadata || {}), refundMethod: v.refundMethod, checkNumber: v.checkNumber } };
            await storeTextDocument({ ownerType: "deposit", ownerId: ctx.item.id, kind: "deposit_disposition", name: `${ctx.item.name || "Deposit"} — disposition`, text: dispositionText(next) });
          }
          toast.success(`Deposit ${status.toLowerCase()}.`);
          return true;
        },
      },
    },
  ],

  navGroups: [
    {
      group: null,
      items: [
        { key: "overview", label: "Overview", icon: LayoutDashboard, desc: "Amount, interest, deductions, refund, and deadline." },
        { key: "links", label: "Links", icon: Link2, desc: "The lease, unit, tenant, and move-out this deposit belongs to." },
      ],
    },
    {
      group: "Deposit",
      items: [
        { key: "holding", label: "Amount & Holding", icon: Landmark, desc: "Amount, kind, and where it's held." },
        { key: "interest", label: "Interest", icon: Percent, desc: "Interest accrued at the policy rate." },
        { key: "deductions", label: "Deductions", icon: Scissors, desc: "Itemized charges against the deposit." },
        { key: "refund", label: "Return", icon: Undo2, desc: "Deadline, refund, and forwarding address." },
        { key: "letter", label: "Disposition Letter", icon: Mail, desc: "The itemized statement for the tenant." },
      ],
    },
    {
      group: "Files & history",
      items: [
        { key: "documents", label: "Documents", icon: FileText, desc: "Receipts, letters, and statements." },
        { key: "notes", label: "Notes", icon: FileText, desc: "Internal notes." },
        { key: "activity", label: "Activity", icon: Clock, desc: "Every change and action on this deposit." },
      ],
    },
  ],
  sections: {
    overview: DepositOverviewSection,
    links: makeMetaAwareFieldsSection([
      { key: "leaseId", label: "Lease", type: "relation", load: leaseOptions, displayKey: "leaseName", full: true },
      { key: "unitId", label: "Unit", type: "relation", load: unitOptions, displayKey: "unit" },
      { key: "tenantId", label: "Tenant", type: "relation", load: tenantOptions, displayKey: "tenantName" },
      { key: "moveId", label: "Move-out", type: "relation", load: moveOptions },
    ]),
    holding: makeMetaAwareFieldsSection([
      { key: "amount", label: "Amount", type: "currency" },
      { key: "depositKind", label: "Kind", type: "select", meta: true, options: DEPOSIT_KIND_OPTIONS },
      { key: "heldLocation", label: "Held at", type: "text", placeholder: "e.g. First National — Trust acct" },
      { key: "receivedOn", label: "Received on", type: "date", meta: true },
      { key: "receiptNumber", label: "Receipt #", type: "text", meta: true },
      { key: "status", label: "Status", type: "select", options: filterOptions(DEPOSIT_STATUS_MAP).slice(1) },
    ]),
    interest: InterestSection,
    deductions: DeductionsSection,
    refund: ReturnSection,
    letter: LetterSection,
    documents: DocumentsSection,
    notes: makeNotesSection({ field: "activityNotes", placeholder: "Log a note about this deposit…" }),
    activity: ActivitySection,
  },
};

export function SecurityDepositsScreen() {
  return <EntityListScreen config={depositsConfig} />;
}

export default SecurityDepositsScreen;
