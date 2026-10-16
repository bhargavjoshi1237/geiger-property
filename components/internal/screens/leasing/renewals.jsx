"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  LayoutDashboard,
  CalendarRange,
  TrendingUp,
  MessageSquare,
  Clock,
  Repeat,
  Loader2,
  CheckCircle2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { SectionCard, StatusPill } from "@/components/internal/shared/screen_kit";
import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { renewalsData } from "@/lib/supabase/renewals";
import { leasesLayer } from "@/lib/supabase/leases";
import {
  makeFieldsSection,
  makeOverviewSection,
  makeNotesSection,
} from "@/components/internal/screens/entity/sections/factories";
import {
  RENEWAL_STATUS_MAP,
  RENEWAL_OPEN_STATUSES,
  filterOptions,
  currency,
  formatDate,
  formatPct,
  rentIncrease,
  shiftDate,
  daysUntil,
  withinDays,
} from "./shared";

// Renewals — an entity screen over `property.renewals`: renewal offers and rent
// increases per lease, with an action that applies an accepted renewal to its lease.

const isOpen = (r) => RENEWAL_OPEN_STATUSES.includes(r.status);
const expiringSoon = (r) => withinDays(r.currentEnd, 60);

// Lease options carrying the lease's current terms into the renewal.
async function renewalLeaseOptions() {
  const rows = (await leasesLayer.list()) ?? [];
  return rows.map((l) => ({
    value: l.id,
    label: l.tenantName ? `${l.name} · ${l.tenantName}` : l.name || "Lease",
    patch: {
      tenantId: l.tenantId || "",
      tenantName: l.tenantName || "",
      unitId: l.unitId || "",
      unit: l.unit || "",
      currentRent: Number(l.rent) || 0,
      currentEnd: l.termEnd || "",
    },
  }));
}

// Create-dialog variant: also proposes a next term and starts at the current rent.
async function createLeaseOptions() {
  const opts = await renewalLeaseOptions();
  return opts.map((o) => ({
    ...o,
    patch: {
      ...o.patch,
      proposedRent: o.patch.currentRent,
      newStart: shiftDate(o.patch.currentEnd, { days: 1 }),
      newEnd: shiftDate(o.patch.currentEnd, { years: 1 }),
    },
  }));
}

const increaseCell = (r) => {
  const { pct } = rentIncrease(r);
  const tone =
    pct === null || pct === 0 ? "text-text-secondary" : pct > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400";
  return <span className={tone}>{formatPct(pct)}</span>;
};

// Applies an accepted renewal's term and rent to the linked lease.
function ApplyRenewalCard({ item, onCommit }) {
  const [busy, setBusy] = useState(false);
  const appliedAt = item.metadata?.appliedAt;
  const blocker = !item.leaseId
    ? "Link a lease in Terms first."
    : item.status !== "Accepted"
      ? "Mark this renewal Accepted to apply it."
      : !item.newStart || !item.newEnd
        ? "Set the new term start and end in Terms."
        : !(Number(item.proposedRent) > 0)
          ? "Set the proposed rent in Terms."
          : null;

  const apply = async () => {
    setBusy(true);
    const saved = await leasesLayer.update(item.leaseId, {
      termStart: item.newStart,
      termEnd: item.newEnd,
      rent: Number(item.proposedRent) || 0,
      status: "Active",
    });
    setBusy(false);
    if (!saved) {
      toast.error("Couldn't update the lease.");
      return;
    }
    onCommit({ metadata: { ...(item.metadata || {}), appliedAt: new Date().toISOString() } });
    toast.success(`Lease renewed through ${formatDate(item.newEnd)} at ${currency(item.proposedRent)}/mo.`);
  };

  return (
    <SectionCard
      title="Renew lease"
      description="Updates the linked lease with the new term and rent and sets it Active."
      action={
        <Button
          className="bg-primary text-primary-foreground hover:bg-primary/90"
          disabled={Boolean(blocker) || busy}
          onClick={apply}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Repeat className="h-4 w-4" />}
          {appliedAt ? "Apply again" : "Renew lease"}
        </Button>
      }
    >
      {appliedAt ? (
        <p className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4" /> Applied to the lease on {formatDate(appliedAt)}.
        </p>
      ) : (
        <p className="text-sm text-text-secondary">
          {blocker ||
            `Ready: ${formatDate(item.newStart)} – ${formatDate(item.newEnd)} at ${currency(item.proposedRent)}/mo.`}
        </p>
      )}
    </SectionCard>
  );
}

const BaseOverview = makeOverviewSection({
  fields: [
    { key: "tenantName", label: "Tenant" },
    { key: "unit", label: "Unit" },
    { key: "status", label: "Status" },
    { key: "currentEnd", label: "Current lease ends", format: (v) => formatDate(v) },
    { key: "currentRent", label: "Current rent", format: (v) => `${currency(v)}/mo` },
    { key: "proposedRent", label: "Proposed rent", format: (v) => `${currency(v)}/mo` },
    { key: "increase", label: "Increase", format: (_v, r) => formatPct(rentIncrease(r).pct) },
    {
      key: "newTerm",
      label: "New term",
      format: (_v, r) => (r.newStart || r.newEnd ? `${formatDate(r.newStart)} – ${formatDate(r.newEnd)}` : "—"),
    },
  ],
});

function RenewalOverviewSection(props) {
  return (
    <div className="space-y-4">
      <BaseOverview {...props} />
      <ApplyRenewalCard item={props.item} onCommit={props.onCommit} />
    </div>
  );
}

const renewalsConfig = {
  key: "renewal",
  singular: "Renewal",
  plural: "Renewals",
  title: "Renewals",
  description:
    "Upcoming lease expirations and renewal offers — propose new terms and rent, track the negotiation, and apply accepted renewals to the lease.",
  icon: Repeat,
  titleField: "name",
  searchFields: ["name", "tenantName", "unit"],
  data: renewalsData,

  statusMap: RENEWAL_STATUS_MAP,
  statusFilterOptions: filterOptions(RENEWAL_STATUS_MAP),

  views: [
    { value: "all", label: "All", filter: () => true },
    { value: "expiring", label: "Expiring ≤60 days", filter: expiringSoon },
    { value: "open", label: "Open", filter: isOpen },
    { value: "closed", label: "Closed", filter: (r) => !isOpen(r) },
  ],

  columns: [
    {
      key: "name",
      header: "Renewal",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="text-xs text-text-secondary">
            {[r.tenantName, r.unit].filter(Boolean).join(" · ") || "No lease linked"}
          </span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusPill status={r.status} map={RENEWAL_STATUS_MAP} />,
    },
    {
      key: "currentEnd",
      header: "Lease ends",
      className: "text-sm text-muted-foreground",
      render: (r) => {
        const d = daysUntil(r.currentEnd);
        if (d === null) return "—";
        return (
          <span className={expiringSoon(r) && isOpen(r) ? "text-amber-700 dark:text-amber-400" : undefined}>
            {formatDate(r.currentEnd)}
            {d >= 0 && d <= 60 ? ` · ${d}d` : ""}
          </span>
        );
      },
    },
    {
      key: "rent",
      header: "Current → Proposed",
      align: "right",
      className: "text-right tabular-nums text-text-secondary",
      render: (r) => (
        <span>
          {currency(r.currentRent)} → <span className="text-foreground">{currency(r.proposedRent)}</span>
        </span>
      ),
    },
    {
      key: "increase",
      header: "Increase",
      align: "right",
      className: "text-right font-semibold tabular-nums",
      render: increaseCell,
    },
  ],

  stats: (rows) => {
    const open = rows.filter(isOpen).length;
    const expiring = rows.filter((r) => isOpen(r) && expiringSoon(r)).length;
    const decided = rows.filter((r) => !isOpen(r));
    const accepted = decided.filter((r) => r.status === "Accepted").length;
    const pcts = rows.map((r) => rentIncrease(r).pct).filter((p) => p !== null);
    const avg = pcts.length ? pcts.reduce((s, p) => s + p, 0) / pcts.length : null;
    return [
      { label: "Open renewals", value: String(open), footer: `${rows.length} total` },
      { label: "Expiring ≤60 days", value: String(expiring), footer: "Still open" },
      {
        label: "Acceptance rate",
        value: `${decided.length ? Math.round((accepted / decided.length) * 100) : 0}%`,
        footer: `${accepted} of ${decided.length} decided`,
      },
      { label: "Avg increase", value: formatPct(avg), footer: "Proposed vs current" },
    ];
  },

  createDraft: { name: "", leaseId: "", proposedRent: "" },
  createFields: [
    { key: "name", label: "Renewal name", type: "text", placeholder: "e.g. Maple Court · 4B — 2027 renewal" },
    {
      key: "leaseId",
      label: "Lease",
      type: "select",
      optionsFrom: "leases",
      placeholder: "Select a lease…",
      emptyLabel: "No leases yet — add them in Leases",
    },
    { key: "proposedRent", label: "Proposed rent", type: "number", placeholder: "0" },
  ],
  loadCreateOptions: async () => ({ leases: await createLeaseOptions() }),
  newRow: (draft) => ({
    name: draft.name.trim(),
    leaseId: draft.leaseId || "",
    tenantId: draft.tenantId || "",
    tenantName: draft.tenantName || "",
    unitId: draft.unitId || "",
    unit: draft.unit || "",
    currentRent: Number(draft.currentRent) || 0,
    proposedRent: Number(draft.proposedRent) || 0,
    currentEnd: draft.currentEnd || "",
    newStart: draft.newStart || "",
    newEnd: draft.newEnd || "",
    status: "Not started",
  }),

  headerMeta: (r) =>
    [r.tenantName, r.unit, r.currentEnd ? `Ends ${formatDate(r.currentEnd)}` : null]
      .filter(Boolean)
      .join(" · "),

  navGroups: [
    {
      group: null,
      items: [
        { key: "overview", label: "Overview", icon: LayoutDashboard, desc: "A snapshot of this renewal." },
      ],
    },
    {
      group: "Offer",
      items: [
        { key: "terms", label: "Terms", icon: CalendarRange, desc: "The lease, new term, and proposed rent." },
        { key: "increase", label: "Rent increase", icon: TrendingUp, desc: "The change from current rent." },
        { key: "communication", label: "Communication", icon: MessageSquare, desc: "Conversations with the tenant." },
        { key: "activity", label: "Activity", icon: Clock, desc: "Notes and history." },
      ],
    },
  ],
  sections: {
    overview: RenewalOverviewSection,
    terms: makeFieldsSection([
      { key: "leaseId", label: "Lease", type: "relation", load: renewalLeaseOptions, full: true },
      { key: "currentRent", label: "Current rent", type: "number" },
      { key: "currentEnd", label: "Current lease ends", type: "date" },
      { key: "newStart", label: "New term start", type: "date" },
      { key: "newEnd", label: "New term end", type: "date" },
      { key: "proposedRent", label: "Proposed rent", type: "number" },
      { key: "noticeDate", label: "Offer / notice date", type: "date", meta: true },
      { key: "responseDue", label: "Response due", type: "date", meta: true },
      {
        key: "status",
        label: "Status",
        type: "select",
        options: filterOptions(RENEWAL_STATUS_MAP).slice(1),
      },
    ]),
    increase: makeFieldsSection([
      { key: "currentRent", label: "Current rent", type: "readonly", format: (v) => `${currency(v)}/mo` },
      { key: "proposedRent", label: "Proposed rent", type: "readonly", format: (v) => `${currency(v)}/mo` },
      {
        key: "increaseAmount",
        label: "Increase amount",
        type: "readonly",
        format: (_v, r) => `${currency(rentIncrease(r).amount)}/mo`,
      },
      {
        key: "increasePct",
        label: "Increase %",
        type: "readonly",
        format: (_v, r) => formatPct(rentIncrease(r).pct),
      },
      {
        key: "increaseNotes",
        label: "Justification",
        type: "textarea",
        meta: true,
        placeholder: "Market comps, improvements, local caps…",
      },
    ]),
    communication: makeNotesSection({
      field: "communicationNotes",
      placeholder: "Log calls, emails, and the tenant's responses…",
    }),
    activity: makeNotesSection({ field: "activityNotes", placeholder: "Log a note about this renewal…" }),
  },
};

export function RenewalsScreen() {
  return <EntityListScreen config={renewalsConfig} />;
}

export default RenewalsScreen;
