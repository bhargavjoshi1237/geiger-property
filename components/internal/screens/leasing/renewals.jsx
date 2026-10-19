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
  Check,
  X,
  Send,
  Handshake,
  FileText,
  Mail,
} from "lucide-react";

import { Button } from "@geiger/ui/button";
import { SectionCard, StatusPill } from "@/components/internal/shared/screen_kit";
import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { ActivitySection, DocumentsSection } from "@/components/internal/screens/entity/shared_sections";
import { FieldsForm } from "@/components/internal/screens/entity/fields_form";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { renewalsData } from "@/lib/supabase/renewals";
import { leasesLayer } from "@/lib/supabase/leases";
import { acceptRenewal, declineRenewal, todayISO } from "@/lib/leasing/workflows";
import {
  makeFieldsSection,
  makeOverviewSection,
  makeNotesSection,
} from "@/components/internal/screens/entity/sections/factories";
import {
  RENEWAL_STATUS_MAP,
  RENEWAL_OPEN_STATUSES,
  MOVE_OUT_REASON_OPTIONS,
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
// increases per lease. Accepting creates the renewed lease (renewal_of_id → the
// old lease) and marks the old one Renewed; declining flags a move-out.

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
      termMonths: 12,
    },
  }));
}

const increaseCell = (r) => {
  const { pct } = rentIncrease(r);
  const tone =
    pct === null || pct === 0 ? "text-text-secondary" : pct > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400";
  return <span className={tone}>{formatPct(pct)}</span>;
};

// Decision card: accept (creates the renewed lease) or decline.
function DecisionCard({ item, runAction }) {
  const { openItemInTab } = useWorkspaceUrl();
  const newLeaseId = item.metadata?.newLeaseId;
  const blocker = !item.leaseId
    ? "Link a lease in Terms first."
    : !item.newStart || !item.newEnd
      ? "Set the new term start and end in Terms."
      : !(Number(item.proposedRent) > 0)
        ? "Set the proposed rent in Terms."
        : null;

  if (newLeaseId) {
    return (
      <SectionCard
        title="Renewed"
        action={
          <Button variant="outline" size="sm" className="border-border bg-surface-card" onClick={() => openItemInTab(newLeaseId, "Leases")}>
            Open New Lease
          </Button>
        }
      >
        <p className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4" /> Accepted {formatDate(item.metadata?.decidedOn)} — new lease &ldquo;{item.metadata?.newLeaseName}&rdquo;.
        </p>
      </SectionCard>
    );
  }
  if (!isOpen(item)) {
    return (
      <SectionCard title="Decision">
        <p className="text-sm text-text-secondary">
          {item.status}
          {item.metadata?.decidedOn ? ` on ${formatDate(item.metadata.decidedOn)}` : ""}
          {item.metadata?.declineReason ? ` — ${item.metadata.declineReason}` : ""}.
        </p>
      </SectionCard>
    );
  }
  return (
    <SectionCard
      title="Decision"
      description="Accepting creates the renewed lease and marks the current one Renewed."
      action={
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => runAction("decline")}>
            <X className="h-4 w-4" /> Decline
          </Button>
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={Boolean(blocker)} onClick={() => runAction("accept")}>
            <Check className="h-4 w-4" /> Accept
          </Button>
        </div>
      }
    >
      <p className="text-sm text-text-secondary">
        {blocker ||
          `Ready: ${formatDate(item.newStart)} – ${formatDate(item.newEnd)} at ${currency(item.proposedRent)}/mo${
            item.responseDue ? ` · response due ${formatDate(item.responseDue)}` : ""
          }.`}
      </p>
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
    { key: "offerSentOn", label: "Offer sent", format: (v) => formatDate(v) },
    { key: "responseDue", label: "Response due", format: (v) => formatDate(v) },
  ],
});

function RenewalOverviewSection(props) {
  return (
    <div className="space-y-4">
      <BaseOverview {...props} />
      <DecisionCard item={props.item} runAction={props.runAction} />
    </div>
  );
}

const LETTER_FIELDS = [{ key: "offerLetter", label: "Letter", type: "textarea", meta: true, rows: 16 }];

// Offer letter wording, drafted from the offer terms and editable.
function OfferLetterSection({ item, onPatch, onCommit, onCommitMeta }) {
  const [busy, setBusy] = useState(false);
  const draft = async () => {
    setBusy(true);
    const lease = item.leaseId ? await leasesLayer.get(item.leaseId) : null;
    setBusy(false);
    const text = `${formatDate(todayISO())}

Dear ${item.tenantName || "Resident"},

Your lease for ${item.unit || lease?.unit || "your home"} ends on ${formatDate(item.currentEnd)}. We'd love for you to stay, and we're pleased to offer a renewal:

• New term: ${formatDate(item.newStart)} – ${formatDate(item.newEnd)}${item.termMonths ? ` (${item.termMonths} months)` : ""}
• Monthly rent: ${currency(item.proposedRent)} (currently ${currency(item.currentRent)})
${item.metadata?.concession ? `• Renewal incentive: ${item.metadata.concession}\n` : ""}
Please let us know by ${formatDate(item.responseDue)} whether you'd like to renew.

Thank you,
${lease?.metadata?.landlord || "Management"}`;
    await onCommitMeta({ offerLetter: text });
    toast.success("Offer letter drafted.");
  };
  return (
    <SectionCard
      title="Offer letter"
      action={
        <Button variant="outline" size="sm" className="border-border bg-surface-card" disabled={busy} onClick={draft}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} Draft from Offer
        </Button>
      }
    >
      <FieldsForm item={item} fields={LETTER_FIELDS} onPatch={onPatch} onCommit={onCommit} onCommitMeta={onCommitMeta} />
    </SectionCard>
  );
}

const renewalsConfig = {
  key: "renewal",
  singular: "Renewal",
  plural: "Renewals",
  title: "Renewals",
  description:
    "Upcoming lease expirations and renewal offers — propose new terms and rent, track the negotiation, and accept to create the renewed lease.",
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
    { value: "awaiting", label: "Awaiting response", filter: (r) => r.status === "Offer sent" || r.status === "Negotiating" },
    { value: "closed", label: "Decided", filter: (r) => !isOpen(r) },
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
      key: "responseDue",
      header: "Response due",
      className: "text-sm text-muted-foreground",
      render: (r) => {
        const d = daysUntil(r.responseDue);
        const late = isOpen(r) && d !== null && d < 0;
        return <span className={late ? "font-medium text-red-600 dark:text-red-400" : undefined}>{formatDate(r.responseDue)}</span>;
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
    termMonths: Number(draft.termMonths) || 0,
    status: "Not started",
  }),

  headerMeta: (r) =>
    [r.tenantName, r.unit, r.currentEnd ? `Ends ${formatDate(r.currentEnd)}` : null]
      .filter(Boolean)
      .join(" · "),

  actions: [
    {
      key: "send",
      label: "Mark offer sent",
      icon: Send,
      showIf: (r) => r.status === "Not started",
      run: async (ctx) => {
        const ok = await ctx.commit({ status: "Offer sent", offerSentOn: todayISO(), ...(ctx.item.responseDue ? {} : { responseDue: shiftDate(todayISO(), { days: 30 }) }) });
        if (ok) {
          ctx.log("Marked the renewal offer sent");
          toast.success("Offer marked as sent.");
        }
      },
    },
    {
      key: "counter",
      label: "Record counter-offer",
      icon: Handshake,
      showIf: isOpen,
      wizard: {
        title: "Record a counter-offer",
        finishLabel: "Save Counter",
        logSummary: "Recorded a counter-offer",
        initial: (r) => ({ counterRent: r.proposedRent, counterTerm: r.termMonths || 12 }),
        steps: [
          {
            key: "counter",
            title: "Counter",
            fields: [
              { key: "counterRent", label: "Tenant's counter rent", type: "currency", required: true },
              { key: "counterTerm", label: "Requested term (months)", type: "number" },
              { key: "counterNotes", label: "Notes", type: "textarea" },
              { key: "acceptCounter", label: "Agree to the counter (update the proposed rent)", type: "switch" },
            ],
          },
        ],
        finish: async (v, ctx) => {
          const ok = await ctx.commit({
            status: "Negotiating",
            ...(v.acceptCounter ? { proposedRent: Number(v.counterRent) || 0, termMonths: Number(v.counterTerm) || 0 } : {}),
          });
          if (!ok) return false;
          const history = Array.isArray(ctx.item.metadata?.counters) ? ctx.item.metadata.counters : [];
          await ctx.commitMeta({ counters: [...history, { on: todayISO(), rent: Number(v.counterRent) || 0, term: Number(v.counterTerm) || 0, notes: v.counterNotes || "", agreed: Boolean(v.acceptCounter) }] });
          toast.success("Counter-offer recorded.");
          return true;
        },
      },
    },
    {
      key: "accept",
      label: "Accept renewal",
      icon: Check,
      showIf: isOpen,
      separatorBefore: true,
      wizard: {
        title: "Accept renewal",
        description: "Creates the renewed lease (Pending) with the new term and rent, copies its people, and marks the current lease Renewed.",
        finishLabel: "Accept & Create Lease",
        logSummary: "Accepted the renewal",
        initial: () => ({ transferCharges: true, transferDeposits: true }),
        steps: [
          {
            key: "confirm",
            title: "Confirm",
            fields: [
              { key: "transferCharges", label: "Move recurring charges to the new lease", type: "switch", full: true },
              { key: "transferDeposits", label: "Carry held deposits to the new lease", type: "switch", full: true },
            ],
          },
        ],
        finish: async (v, ctx) => {
          if (!ctx.item.leaseId || !ctx.item.newStart || !ctx.item.newEnd) {
            toast.error("Link a lease and set the new term first.");
            return false;
          }
          const created = await acceptRenewal(ctx.item, v);
          if (!created) {
            toast.error("Couldn't create the renewed lease.");
            return false;
          }
          toast.success(`Renewed — “${created.name}” is pending.`);
          ctx.reload();
          return true;
        },
      },
    },
    {
      key: "decline",
      label: "Decline renewal",
      icon: X,
      showIf: isOpen,
      danger: true,
      wizard: {
        title: "Decline renewal",
        finishLabel: "Decline",
        logSummary: "Declined the renewal",
        initial: () => ({ movingOut: true, reason: "End of term" }),
        steps: [
          {
            key: "reason",
            title: "Reason",
            fields: [
              { key: "reason", label: "Reason", type: "select", options: MOVE_OUT_REASON_OPTIONS },
              { key: "movingOut", label: "Tenant is moving out", type: "switch" },
            ],
          },
        ],
        finish: async (v, ctx) => {
          const saved = await declineRenewal(ctx.item, v);
          if (!saved) {
            toast.error("Couldn't decline the renewal.");
            return false;
          }
          toast.success(v.movingOut ? "Declined — start the move-out from the lease." : "Renewal declined.");
          ctx.reload();
          return true;
        },
      },
    },
  ],

  navGroups: [
    {
      group: null,
      items: [
        { key: "overview", label: "Overview", icon: LayoutDashboard, desc: "A snapshot of this renewal and its decision." },
      ],
    },
    {
      group: "Offer",
      items: [
        { key: "terms", label: "Terms", icon: CalendarRange, desc: "The lease, new term, and proposed rent." },
        { key: "increase", label: "Rent increase", icon: TrendingUp, desc: "The change from current rent." },
        { key: "letter", label: "Offer letter", icon: Mail, desc: "The wording sent to the tenant." },
        { key: "communication", label: "Communication", icon: MessageSquare, desc: "Conversations with the tenant." },
      ],
    },
    {
      group: "Files & history",
      items: [
        { key: "documents", label: "Documents", icon: FileText, desc: "Signed renewal and attachments." },
        { key: "activity", label: "Activity", icon: Clock, desc: "Every change and action on this renewal." },
      ],
    },
  ],
  sections: {
    overview: RenewalOverviewSection,
    terms: makeFieldsSection([
      { key: "leaseId", label: "Lease", type: "relation", load: renewalLeaseOptions, full: true },
      { key: "currentRent", label: "Current rent", type: "currency" },
      { key: "currentEnd", label: "Current lease ends", type: "date" },
      { key: "newStart", label: "New term start", type: "date" },
      { key: "newEnd", label: "New term end", type: "date" },
      { key: "termMonths", label: "Term (months)", type: "number", min: 1 },
      { key: "proposedRent", label: "Proposed rent", type: "currency" },
      { key: "offerSentOn", label: "Offer sent on", type: "date" },
      { key: "responseDue", label: "Response due", type: "date" },
      { key: "concession", label: "Renewal incentive", type: "text", meta: true, full: true },
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
      { key: "marketRent", label: "Market rent", type: "currency", meta: true },
      { key: "rentCapPct", label: "Local rent cap", type: "percent", meta: true, hint: "Leave blank where no cap applies." },
      {
        key: "increaseNotes",
        label: "Justification",
        type: "textarea",
        meta: true,
        placeholder: "Market comps, improvements, local caps…",
      },
    ]),
    letter: OfferLetterSection,
    communication: makeNotesSection({
      field: "communicationNotes",
      placeholder: "Log calls, emails, and the tenant's responses…",
    }),
    documents: DocumentsSection,
    activity: ActivitySection,
  },
};

export function RenewalsScreen() {
  return <EntityListScreen config={renewalsConfig} />;
}

export default RenewalsScreen;
