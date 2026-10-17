"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, BadgeDollarSign, ClipboardPen, Home, RefreshCw } from "lucide-react";

import { ListLoading, SectionCard, StatsBar, StatusPill } from "@/components/internal/shared/screen_kit";
import { Button } from "@/components/ui/button";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { leasesLayer } from "@/lib/supabase/leases";
import { workOrdersLayer } from "@/lib/supabase/work_orders";
import { CLOSED_WORK_STATUSES } from "@/components/internal/screens/maintenance/shared";
import { LEASE_STATUS_MAP } from "@/components/internal/screens/leasing/shared";
import { LIVE_LEASE, currency, daysSince, daysUntil, formatDate, specs } from "../shared";

// Unit · Overview — live KPIs (status, tenant, rent vs market, days vacant, open
// work orders), the current lease, alerts, and quick actions.

const VACANT = ["Vacant", "Make-ready", "Down"];

// Start of the current vacancy: explicit vacatedOn, else the last ended lease.
function vacancyStart(item, leases) {
  if (item.vacatedOn) return item.vacatedOn;
  const ended = leases
    .filter((l) => l.termEnd && !LIVE_LEASE.includes(l.status))
    .map((l) => l.termEnd)
    .sort();
  return ended[ended.length - 1] || item.leaseEnd || null;
}

function Fact({ label, children }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">{label}</dt>
      <dd className="mt-1 truncate text-sm text-foreground">{children || "—"}</dd>
    </div>
  );
}

export function UnitOverviewSection({ item, runAction }) {
  const { openItemInTab } = useWorkspaceUrl();
  const [data, setData] = useState(null);

  useEffect(() => {
    let alive = true;
    Promise.all([leasesLayer.list({ unitId: item.id }), workOrdersLayer.list({ unitId: item.id })])
      .then(([leases, wos]) => alive && setData({ leases: leases ?? [], wos: wos ?? [] }))
      .catch(() => alive && setData({ leases: [], wos: [] }));
    return () => {
      alive = false;
    };
  }, [item.id]);

  if (!data) return <ListLoading label="Loading unit overview" className="py-10" />;

  const lease = data.leases.find((l) => LIVE_LEASE.includes(l.status)) || null;
  const openWos = data.wos.filter((w) => !CLOSED_WORK_STATUSES.includes(w.status));
  const urgent = openWos.filter((w) => w.priority === "Urgent" || w.priority === "High").length;
  const market = Number(item.rent) || 0;
  const leased = Number(lease?.rent) || 0;
  const gap = market && leased ? ((leased - market) / market) * 100 : null;
  const leaseLeft = daysUntil(lease?.termEnd);
  const vacantDays = VACANT.includes(item.status) ? daysSince(vacancyStart(item, data.leases)) : null;

  const stats = [
    { label: "Status", value: item.status || "—", footer: item.readyStatus ? `Ready: ${item.readyStatus}` : "Unit status" },
    {
      label: "Leased vs market",
      value: lease ? currency(leased) : currency(market),
      delta: gap !== null ? `${gap >= 0 ? "+" : ""}${gap.toFixed(1)}%` : undefined,
      trend: gap !== null && gap >= 0 ? "up" : "down",
      footer: lease ? `Market ${currency(market)}` : "Market rent · no active lease",
    },
    {
      label: "Days vacant",
      value: vacantDays === null ? "—" : String(vacantDays),
      footer: vacantDays === null ? "Not vacant" : `Lost ~${currency((market / 30) * vacantDays)}`,
    },
    { label: "Open work orders", value: String(openWos.length), footer: urgent ? `${urgent} high priority` : "None urgent" },
  ];

  const alerts = [
    item.nonRevenue || item.status === "Non-revenue"
      ? `Non-revenue (${item.nonRevenueType || "unspecified"}) since ${formatDate(item.nonRevenueSince)}.`
      : null,
    item.status === "Down"
      ? `Offline for ${item.downReason || "an unspecified reason"}${item.downUntil ? ` — expected back ${formatDate(item.downUntil)}` : ""}.`
      : null,
    leaseLeft !== null && leaseLeft >= 0 && leaseLeft <= 60
      ? `Lease ends ${formatDate(lease.termEnd)} — plan the renewal or turn.`
      : null,
    item.concessionType && item.concessionType !== "None"
      ? `Concession active: ${item.concessionType}${item.concessionEndsOn ? ` until ${formatDate(item.concessionEndsOn)}` : ""}.`
      : null,
    urgent ? `${urgent} high-priority work order${urgent > 1 ? "s" : ""} open.` : null,
  ].filter(Boolean);

  return (
    <div className="space-y-5">
      <StatsBar stats={stats} />

      {alerts.length ? (
        <SectionCard>
          <ul className="space-y-2">
            {alerts.map((a) => (
              <li key={a} className="flex items-start gap-2 text-sm text-text-secondary">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                {a}
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}

      <SectionCard
        title="Current lease"
        action={
          lease ? (
            <Button
              variant="outline"
              size="sm"
              className="border-border bg-surface-card hover:bg-surface-hover"
              onClick={() => openItemInTab(lease.id, "Leases")}
            >
              Open Lease
            </Button>
          ) : null
        }
      >
        {lease ? (
          <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-3">
            <Fact label="Tenant">{lease.tenantName}</Fact>
            <Fact label="Lease">{lease.name}</Fact>
            <Fact label="Status">
              <StatusPill status={lease.status} map={LEASE_STATUS_MAP} />
            </Fact>
            <Fact label="Term">{`${formatDate(lease.termStart)} – ${formatDate(lease.termEnd)}`}</Fact>
            <Fact label="Rent">{`${currency(lease.rent)}/mo`}</Fact>
            <Fact label="Deposit">{currency(lease.deposit)}</Fact>
          </dl>
        ) : (
          <p className="text-sm text-text-secondary">
            No active lease. {item.availableDate ? `Available ${formatDate(item.availableDate)}.` : "Set an available date under Availability & Marketing."}
          </p>
        )}
      </SectionCard>

      <SectionCard title="At a glance">
        <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-3">
          <Fact label="Layout">{specs(item)}</Fact>
          <Fact label="Floor">{item.floor}</Fact>
          <Fact label="Market rent">{currency(item.rent)}</Fact>
          <Fact label="Deposit">{currency(item.deposit)}</Fact>
          <Fact label="Available">{formatDate(item.availableDate)}</Fact>
          <Fact label="Ready">{item.readyStatus}</Fact>
          <Fact label="Furnished">{item.furnished ? `Yes${item.furnishedPremium ? ` (+${currency(item.furnishedPremium)})` : ""}` : "No"}</Fact>
          <Fact label="Mid-term">{item.midTermEligible ? `${item.minStayMonths || 1}+ months` : "No"}</Fact>
          <Fact label="Occupant">{item.occupantName}</Fact>
        </dl>
      </SectionCard>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" className="border-border bg-surface-card hover:bg-surface-hover" onClick={() => runAction("changeRent")}>
          <BadgeDollarSign className="h-4 w-4" /> Change Market Rent
        </Button>
        <Button variant="outline" className="border-border bg-surface-card hover:bg-surface-hover" onClick={() => runAction("createListing")}>
          <Home className="h-4 w-4" /> Create Listing
        </Button>
        <Button variant="outline" className="border-border bg-surface-card hover:bg-surface-hover" onClick={() => runAction("startTurn")}>
          <RefreshCw className="h-4 w-4" /> Start Turn
        </Button>
        <Button variant="outline" className="border-border bg-surface-card hover:bg-surface-hover" onClick={() => runAction("newWorkOrder")}>
          <ClipboardPen className="h-4 w-4" /> New Work Order
        </Button>
      </div>
    </div>
  );
}

export default UnitOverviewSection;
