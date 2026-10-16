"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeftRight, Check, ClipboardCheck, Gavel, ListChecks, Loader2, LogIn, LogOut, Repeat, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable, EmptyState, ListLoading, SectionCard, StatusPill } from "@/components/internal/shared/screen_kit";
import { FieldsForm } from "@/components/internal/screens/entity/fields_form";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { listLeaseMoves } from "@/lib/supabase/moves";
import { listLeaseInspections } from "@/lib/supabase/inspections";
import { listLeaseRenewals } from "@/lib/supabase/renewals";
import { listLeaseNotices } from "@/lib/supabase/notices";
import { listLeaseDeposits } from "@/lib/supabase/security_deposits";
import { leasesLayer, listRenewalLeases } from "@/lib/supabase/leases";
import { unitTurnsLayer } from "@/lib/supabase/unit_turns";
import { logSystemActivity } from "@/lib/supabase/activity_log";
import {
  DEFAULT_MOVE_IN_CHECKLIST,
  DEFAULT_MOVE_OUT_CHECKLIST,
  acceptRenewal,
  checklistOf,
  declineRenewal,
  scheduleMoveIn,
} from "@/lib/leasing/workflows";
import { Callout } from "./gated";
import {
  DEPOSIT_STATUS_MAP,
  EVICTION_REASON_OPTIONS,
  EVICTION_STAGE_OPTIONS,
  INSPECTION_STATUS_MAP,
  LEASE_STATUS_MAP,
  MOVE_OUT_REASON_OPTIONS,
  MOVE_STATUS_MAP,
  NOTICE_STATUS_MAP,
  REFUND_METHOD_OPTIONS,
  RENEWAL_OPEN_STATUSES,
  RENEWAL_STATUS_MAP,
  TERMINATION_REASON_OPTIONS,
  currency,
  formatDate,
  formatPct,
  inspectionKindLabel,
  inspectionKindOf,
  isNoticeOverdue,
  metaList,
  rentIncrease,
} from "../shared";

// Lifecycle tabs of the lease editor: move-in, move-out, renewal, notices,
// eviction, and early termination — each linking the records it created.

// Read-only table of linked rows; row click opens the record in its own tab.
export function Linked({ rows, columns, tab, emptyTitle, emptyDescription, icon }) {
  const { openItemInTab } = useWorkspaceUrl();
  if (rows === null) return <ListLoading label="Loading" className="py-10" />;
  if (!rows.length) {
    return (
      <div className="rounded-xl border border-border bg-surface-subtle">
        <EmptyState icon={icon} title={emptyTitle} description={emptyDescription} />
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <DataTable columns={columns} data={rows} getRowKey={(r) => r.id} onRowClick={tab ? (r) => openItemInTab(r.id, tab) : undefined} />
    </div>
  );
}

const nameCol = (sub) => ({
  key: "name",
  header: "Record",
  render: (r) => (
    <div className="flex flex-col gap-0.5">
      <span className="font-medium text-foreground">{r.name || "Untitled"}</span>
      {sub ? <span className="text-xs text-text-secondary">{sub(r)}</span> : null}
    </div>
  ),
});

const MOVE_COLUMNS = [
  nameCol((r) => (r.kind === "out" ? "Move-out" : "Move-in")),
  { key: "status", header: "Status", render: (r) => <StatusPill status={r.status} map={MOVE_STATUS_MAP} /> },
  { key: "moveDate", header: "Date", align: "right", className: "text-right text-sm text-muted-foreground", render: (r) => formatDate(r.moveDate) },
];

const INSPECTION_COLUMNS = [
  nameCol((r) => inspectionKindLabel(r)),
  { key: "status", header: "Status", render: (r) => <StatusPill status={r.status} map={INSPECTION_STATUS_MAP} /> },
  { key: "inspectionDate", header: "Date", align: "right", className: "text-right text-sm text-muted-foreground", render: (r) => formatDate(r.inspectionDate) },
];

// Checklist stored in metadata[field], seeded from a standard list on demand.
export function Checklist({ item, field, defaults, onCommitMeta }) {
  const list = metaList(item, field);
  const done = list.filter((x) => x.done).length;
  const toggle = (id) => onCommitMeta({ [field]: list.map((x) => (x.id === id ? { ...x, done: !x.done } : x)) });
  return (
    <SectionCard
      title="Checklist"
      description={list.length ? `${done} of ${list.length} done` : "No checklist yet."}
      action={
        !list.length ? (
          <Button size="sm" variant="outline" className="border-border bg-surface-card" onClick={() => onCommitMeta({ [field]: checklistOf(defaults) })}>
            <ListChecks className="h-4 w-4" /> Use standard checklist
          </Button>
        ) : null
      }
      bodyPadding={false}
    >
      {list.length ? (
        <ul className="divide-y divide-border">
          {list.map((x) => (
            <li key={x.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
              <Checkbox checked={Boolean(x.done)} onCheckedChange={() => toggle(x.id)} aria-label={x.label} />
              <span className={x.done ? "text-text-tertiary line-through" : "text-foreground"}>{x.label}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </SectionCard>
  );
}

// --- Move-in ----------------------------------------------------------------------

const MOVE_IN_FIELDS = [
  { key: "moveInDate", label: "Move-in date", type: "date" },
  { key: "keysIssued", label: "Keys issued", type: "number", meta: true, min: 0 },
  { key: "utilitiesTransferred", label: "Utilities transferred", type: "switch", meta: true },
  { key: "portalInvited", label: "Portal invitation sent", type: "switch", meta: true },
  { key: "welcomePacketSent", label: "Welcome packet sent", type: "switch", meta: true },
  { key: "moveInNotes", label: "Move-in notes", type: "textarea", meta: true },
];

export function MoveInSection({ item, onPatch, onCommit, onCommitMeta }) {
  const [moves, setMoves] = useState(null);
  const [inspections, setInspections] = useState(null);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    Promise.all([listLeaseMoves(item.id), listLeaseInspections(item.id)]).then(([m, i]) => {
      if (!alive) return;
      setMoves((m ?? []).filter((x) => x.kind !== "out"));
      setInspections((i ?? []).filter((x) => inspectionKindOf(x) === "move_in"));
    });
    return () => {
      alive = false;
    };
  }, [item.id, tick]);

  const schedule = async () => {
    setBusy(true);
    const res = await scheduleMoveIn(item, { moveDate: item.moveInDate || item.termStart });
    setBusy(false);
    if (!res) {
      toast.error("Couldn't schedule the move-in.");
      return;
    }
    logSystemActivity("lease", item.id, "action", "Scheduled the move-in and move-in inspection");
    toast.success("Move-in and inspection scheduled.");
    setTick((t) => t + 1);
  };

  return (
    <div className="space-y-6">
      <SectionCard title="Move-in details">
        <FieldsForm item={item} fields={MOVE_IN_FIELDS} onPatch={onPatch} onCommit={onCommit} onCommitMeta={onCommitMeta} />
      </SectionCard>
      <Checklist item={item} field="moveInChecklist" defaults={DEFAULT_MOVE_IN_CHECKLIST} onCommitMeta={onCommitMeta} />
      <SectionCard
        title="Move-in record & inspection"
        action={
          moves && !moves.length ? (
            <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={busy} onClick={schedule}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />} Schedule move-in
            </Button>
          ) : null
        }
      >
        <div className="space-y-4">
          <Linked rows={moves} columns={MOVE_COLUMNS} tab="Move-ins & Move-outs" icon={ArrowLeftRight} emptyTitle="No move-in scheduled" emptyDescription="Schedule it to create the move record and the move-in inspection." />
          {inspections?.length ? <Linked rows={inspections} columns={INSPECTION_COLUMNS} tab="Inspections" icon={ClipboardCheck} /> : null}
        </div>
      </SectionCard>
    </div>
  );
}

// --- Move-out ---------------------------------------------------------------------

const MOVE_OUT_FIELDS = [
  { key: "noticeDate", label: "Notice given", type: "date" },
  { key: "moveOutDate", label: "Move-out date", type: "date" },
  { key: "moveOutReason", label: "Reason", type: "select", meta: true, options: MOVE_OUT_REASON_OPTIONS },
  { key: "unitAvailableOn", label: "Unit available on", type: "date", meta: true },
  { key: "forwardingAddress", label: "Forwarding address", type: "textarea", meta: true },
  { key: "forwardingEmail", label: "Forwarding email", type: "email", meta: true },
  { key: "forwardingPhone", label: "Forwarding phone", type: "phone", meta: true },
  { key: "refundMethod", label: "Deposit refund by", type: "select", meta: true, options: REFUND_METHOD_OPTIONS },
  { key: "leaseViolated", label: "Lease agreement violated", type: "switch", meta: true },
  { key: "moveOutRemarks", label: "Tenant remarks", type: "textarea", meta: true },
];

const DEPOSIT_COLUMNS = [
  nameCol((r) => (r.returnDue ? `Return by ${formatDate(r.returnDue)}` : "No return deadline yet")),
  { key: "status", header: "Status", render: (r) => <StatusPill status={r.status} map={DEPOSIT_STATUS_MAP} /> },
  { key: "amount", header: "Amount", align: "right", className: "text-right tabular-nums", render: (r) => currency(r.amount) },
];

const TURN_COLUMNS = [
  nameCol((r) => (r.targetReadyDate ? `Ready by ${formatDate(r.targetReadyDate)}` : "")),
  { key: "status", header: "Status", render: (r) => <Badge variant="neutral">{r.status}</Badge> },
  { key: "budget", header: "Budget", align: "right", className: "text-right tabular-nums", render: (r) => currency(r.budget) },
];

export function MoveOutSection({ item, onPatch, onCommit, onCommitMeta, runAction }) {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    let alive = true;
    Promise.all([listLeaseMoves(item.id), listLeaseInspections(item.id), listLeaseDeposits(item.id)]).then(async ([m, i, d]) => {
      const outs = (m ?? []).filter((x) => x.kind === "out");
      const turns = outs.length ? ((await unitTurnsLayer.list({ unitId: item.unitId })) ?? []).filter((t) => outs.some((o) => o.id === t.moveId)) : [];
      if (!alive) return;
      setRows({
        moves: outs,
        inspections: (i ?? []).filter((x) => inspectionKindOf(x) === "move_out"),
        deposits: d ?? [],
        turns,
      });
    });
    return () => {
      alive = false;
    };
  }, [item.id, item.unitId, item.moveOutDate]);

  return (
    <div className="space-y-6">
      {rows && !rows.moves.length ? (
        <Callout
          tone="info"
          action={
            <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => runAction("moveOut")}>
              <LogOut className="h-4 w-4" /> Start move-out
            </Button>
          }
        >
          The move-out wizard schedules the move, the move-out inspection and unit turn, and sets the deposit&apos;s return deadline.
        </Callout>
      ) : null}
      <SectionCard title="Move-out details">
        <FieldsForm item={item} fields={MOVE_OUT_FIELDS} onPatch={onPatch} onCommit={onCommit} onCommitMeta={onCommitMeta} />
      </SectionCard>
      <Checklist item={item} field="moveOutChecklist" defaults={DEFAULT_MOVE_OUT_CHECKLIST} onCommitMeta={onCommitMeta} />
      {rows === null ? (
        <ListLoading label="Loading move-out records" className="py-10" />
      ) : (
        <>
          <SectionCard title="Move & inspection">
            <div className="space-y-4">
              <Linked rows={rows.moves} columns={MOVE_COLUMNS} tab="Move-ins & Move-outs" icon={ArrowLeftRight} emptyTitle="No move-out scheduled" emptyDescription="Start the move-out to create it." />
              {rows.inspections.length ? <Linked rows={rows.inspections} columns={INSPECTION_COLUMNS} tab="Inspections" icon={ClipboardCheck} /> : null}
            </div>
          </SectionCard>
          <SectionCard title="Deposit disposition">
            <Linked rows={rows.deposits} columns={DEPOSIT_COLUMNS} tab="Security Deposits" icon={ClipboardCheck} emptyTitle="No deposits recorded" emptyDescription="Record deposits held in the Deposits tab." />
          </SectionCard>
          {rows.turns.length ? (
            <SectionCard title="Unit turn">
              <Linked rows={rows.turns} columns={TURN_COLUMNS} tab="Unit Turns" icon={Repeat} />
            </SectionCard>
          ) : null}
        </>
      )}
    </div>
  );
}

// --- Renewal ----------------------------------------------------------------------

const RENEWAL_FIELDS = [
  {
    key: "renewalOption",
    label: "Renewal approach",
    type: "select",
    meta: true,
    options: [
      { value: "Offer", label: "Send a renewal offer" },
      { value: "Auto-renew", label: "Auto-renew same terms" },
      { value: "Month-to-month", label: "Roll to month-to-month" },
      { value: "Do not renew", label: "Do not renew" },
    ],
  },
  { key: "renewalEligibleOn", label: "Eligible for renewal on", type: "date", meta: true },
  { key: "increasePct", label: "Target increase", type: "percent", meta: true },
  { key: "renewalNotes", label: "Renewal notes", type: "textarea", meta: true },
];

export function RenewalSection({ item, onPatch, onCommit, onCommitMeta, runAction, onReload }) {
  const [offers, setOffers] = useState(null);
  const [chain, setChain] = useState({ from: null, to: [] });
  const [busy, setBusy] = useState("");
  const [tick, setTick] = useState(0);
  const { openItemInTab } = useWorkspaceUrl();

  useEffect(() => {
    let alive = true;
    Promise.all([
      listLeaseRenewals(item.id),
      item.renewalOfId ? leasesLayer.get(item.renewalOfId) : null,
      listRenewalLeases(item.id),
    ]).then(([r, from, to]) => {
      if (!alive) return;
      setOffers(r ?? []);
      setChain({ from, to: to ?? [] });
    });
    return () => {
      alive = false;
    };
  }, [item.id, item.renewalOfId, tick]);

  const accept = async (r) => {
    setBusy(r.id);
    const created = await acceptRenewal(r);
    setBusy("");
    if (!created) {
      toast.error("Couldn't create the renewed lease.");
      return;
    }
    logSystemActivity("lease", item.id, "action", `Renewal accepted — new lease “${created.name}”`);
    toast.success("Renewal accepted — the new lease is pending.", {
      action: { label: "Open", onClick: () => openItemInTab(created.id, "Leases") },
    });
    setTick((t) => t + 1);
    onReload?.();
  };

  const decline = async (r) => {
    setBusy(r.id);
    const saved = await declineRenewal(r, { movingOut: true });
    setBusy("");
    if (!saved) {
      toast.error("Couldn't decline the renewal.");
      return;
    }
    logSystemActivity("lease", item.id, "action", "Renewal declined — tenant moving out");
    toast.success("Renewal declined. Start the move-out when you're ready.");
    setTick((t) => t + 1);
  };

  return (
    <div className="space-y-6">
      {chain.from ? (
        <Callout
          tone="info"
          action={
            <Button size="sm" variant="outline" className="border-border bg-surface-card" onClick={() => openItemInTab(chain.from.id, "Leases")}>
              Open
            </Button>
          }
        >
          Renewal of &ldquo;{chain.from.name}&rdquo; ({formatDate(chain.from.termStart)} – {formatDate(chain.from.termEnd)}).
        </Callout>
      ) : null}
      {chain.to.map((l) => (
        <Callout
          key={l.id}
          tone="success"
          action={
            <Button size="sm" variant="outline" className="border-border bg-surface-card" onClick={() => openItemInTab(l.id, "Leases")}>
              Open
            </Button>
          }
        >
          Renewed as &ldquo;{l.name}&rdquo; — {LEASE_STATUS_MAP[l.status]?.label || l.status}, {currency(l.rent)}/mo from {formatDate(l.termStart)}.
        </Callout>
      ))}

      <SectionCard title="Renewal settings">
        <FieldsForm item={item} fields={RENEWAL_FIELDS} onPatch={onPatch} onCommit={onCommit} onCommitMeta={onCommitMeta} />
      </SectionCard>

      <SectionCard
        title="Renewal offers"
        action={
          <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => runAction("renew")}>
            <Repeat className="h-4 w-4" /> Offer renewal
          </Button>
        }
        bodyPadding={false}
      >
        {offers === null ? (
          <ListLoading label="Loading offers" className="rounded-none border-0 py-10" />
        ) : offers.length === 0 ? (
          <EmptyState icon={Repeat} title="No renewal offers yet" description="Offer new terms and rent; accepting creates the renewed lease." />
        ) : (
          <ul className="divide-y divide-border">
            {offers.map((r) => {
              const open = RENEWAL_OPEN_STATUSES.includes(r.status);
              return (
                <li key={r.id} className="flex flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <button type="button" className="min-w-0 text-left" onClick={() => openItemInTab(r.id, "Renewals")}>
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-foreground">
                        {currency(r.proposedRent)}/mo · {formatDate(r.newStart)} – {formatDate(r.newEnd)}
                      </span>
                      <StatusPill status={r.status} map={RENEWAL_STATUS_MAP} />
                    </div>
                    <p className="text-xs text-text-secondary">
                      {formatPct(rentIncrease(r).pct)} vs current
                      {r.responseDue ? ` · Response due ${formatDate(r.responseDue)}` : ""}
                      {r.metadata?.newLeaseName ? ` · New lease: ${r.metadata.newLeaseName}` : ""}
                    </p>
                  </button>
                  {open ? (
                    <div className="flex shrink-0 gap-2">
                      <Button size="sm" variant="ghost" disabled={Boolean(busy)} onClick={() => decline(r)}>
                        <X className="h-4 w-4" /> Decline
                      </Button>
                      <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={Boolean(busy)} onClick={() => accept(r)}>
                        {busy === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Accept
                      </Button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

// --- Notices ----------------------------------------------------------------------

const NOTICE_COLUMNS = [
  nameCol((r) => [r.noticeType, r.metadata?.direction === "incoming" ? "Received" : null].filter(Boolean).join(" · ")),
  { key: "status", header: "Status", render: (r) => <StatusPill status={r.status} map={NOTICE_STATUS_MAP} /> },
  { key: "servedDate", header: "Served", className: "text-sm text-muted-foreground", render: (r) => formatDate(r.servedDate) },
  {
    key: "cureBy",
    header: "Cure by",
    align: "right",
    className: "text-right text-sm",
    render: (r) => <span className={isNoticeOverdue(r) ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground"}>{formatDate(r.cureBy)}</span>,
  },
];

export function NoticesSection({ item, runAction }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    let alive = true;
    listLeaseNotices(item.id).then((r) => alive && setRows(r ?? []));
    return () => {
      alive = false;
    };
  }, [item.id, item.noticeDate, item.status]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" className="border-border bg-surface-card" onClick={() => runAction("noticeToVacate")}>
          Record notice to vacate
        </Button>
        <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => runAction("serveNotice")}>
          <Gavel className="h-4 w-4" /> Serve a notice
        </Button>
      </div>
      <Linked rows={rows} columns={NOTICE_COLUMNS} tab="Notices & Violations" icon={Gavel} emptyTitle="No notices yet" emptyDescription="Late rent, violations, entry, and non-renewal notices on this lease show here." />
    </div>
  );
}

// --- Eviction & early termination -------------------------------------------------

const EVICTION_FIELDS = [
  { key: "evictionStage", label: "Stage", type: "select", meta: true, options: EVICTION_STAGE_OPTIONS },
  { key: "evictionReason", label: "Reason", type: "select", meta: true, options: EVICTION_REASON_OPTIONS },
  { key: "evictionAmountOwed", label: "Amount owed", type: "currency", meta: true },
  { key: "evictionStartedOn", label: "Started on", type: "date", meta: true },
  { key: "heading-court", label: "Court", type: "heading" },
  { key: "evictionFiledOn", label: "Filed on", type: "date", meta: true },
  { key: "evictionCaseNumber", label: "Case #", type: "text", meta: true },
  { key: "evictionCourt", label: "Court", type: "text", meta: true },
  { key: "evictionAttorney", label: "Attorney", type: "text", meta: true },
  { key: "evictionHearingOn", label: "Hearing date", type: "date", meta: true },
  { key: "evictionJudgmentOn", label: "Judgment date", type: "date", meta: true },
  { key: "evictionJudgmentAmount", label: "Judgment amount", type: "currency", meta: true },
  { key: "evictionWritOn", label: "Writ issued", type: "date", meta: true },
  { key: "evictionPossessionOn", label: "Possession recovered", type: "date", meta: true },
  { key: "evictionCosts", label: "Legal costs", type: "currency", meta: true },
  { key: "evictionNotes", label: "Notes", type: "textarea", meta: true },
];

export function EvictionSection({ item, onPatch, onCommit, onCommitMeta, runAction }) {
  const active = Boolean(item.metadata?.evictionActive);
  return (
    <div className="space-y-6">
      <Callout
        tone={active ? "danger" : "info"}
        action={
          active ? (
            <Button size="sm" variant="outline" className="border-border bg-surface-card" onClick={() => runAction("closeEviction")}>
              Close eviction
            </Button>
          ) : (
            <Button size="sm" variant="outline" className="border-border bg-surface-card" onClick={() => runAction("eviction")}>
              Start eviction
            </Button>
          )
        }
      >
        {active
          ? "Eviction active — the lease is flagged so online payments can be blocked per your payment policy."
          : item.metadata?.evictionClosedOn
            ? `Eviction closed on ${formatDate(item.metadata.evictionClosedOn)}${item.metadata?.evictionOutcome ? ` — ${item.metadata.evictionOutcome}` : ""}.`
            : "No eviction on this lease."}
      </Callout>
      <SectionCard title="Case">
        <FieldsForm item={item} fields={EVICTION_FIELDS} onPatch={onPatch} onCommit={onCommit} onCommitMeta={onCommitMeta} />
      </SectionCard>
    </div>
  );
}

const TERMINATION_FIELDS = [
  { key: "earlyTermDate", label: "Termination date", type: "date", meta: true },
  { key: "earlyTermNoticeOn", label: "Requested on", type: "date", meta: true },
  { key: "earlyTermReason", label: "Reason", type: "select", meta: true, options: TERMINATION_REASON_OPTIONS },
  { key: "earlyTermFee", label: "Termination fee", type: "currency", meta: true },
  { key: "earlyTermFeePaid", label: "Fee paid", type: "switch", meta: true },
  { key: "earlyTermMonthsForfeited", label: "Deposit / rent forfeited (months)", type: "number", meta: true, min: 0 },
  { key: "earlyTermNotes", label: "Notes", type: "textarea", meta: true },
];

export function TerminationSection({ item, onPatch, onCommit, onCommitMeta }) {
  return (
    <div className="space-y-6">
      <Callout tone="warning">
        {item.metadata?.earlyTermDate
          ? `Terminated early on ${formatDate(item.metadata.earlyTermDate)}. The fee is recorded here; bill it from the lease's charges.`
          : "Use Actions → Terminate early to end this lease before its term."}
      </Callout>
      <SectionCard title="Early termination">
        <FieldsForm item={item} fields={TERMINATION_FIELDS} onPatch={onPatch} onCommit={onCommit} onCommitMeta={onCommitMeta} />
      </SectionCard>
    </div>
  );
}
