"use client";

import { useEffect, useState } from "react";
import { DoorOpen } from "lucide-react";

import { DataTable, EmptyState, ListLoading, SectionCard, StatsBar, StatusPill } from "@/components/internal/shared/screen_kit";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { listUnits } from "@/lib/supabase/units";
import { leasesLayer } from "@/lib/supabase/leases";
import { UNIT_STATUS_MAP, LIVE_LEASE, currency, formatDate, isRevenue, specs } from "@/components/internal/screens/units/shared";

// Availability + pricing rollup over the units linked by `filterField`
// (unitTypeId for unit types, floorPlanId for floor plans).

const AVAILABLE = ["Vacant", "Make-ready", "Notice"];

export function makeUnitRollupSection({ filterField, marketKey, noun, imageKey }) {
  function UnitRollupSection({ item }) {
    const { openItemInTab } = useWorkspaceUrl();
    const [data, setData] = useState(null);

    useEffect(() => {
      let alive = true;
      Promise.all([listUnits(), leasesLayer.list()])
        .then(([units, leases]) => {
          if (!alive) return;
          const mine = (units ?? []).filter((u) => u[filterField] === item.id);
          const live = new Map();
          for (const l of leases ?? []) if (l.unitId && LIVE_LEASE.includes(l.status)) live.set(l.unitId, l);
          setData(mine.map((u) => ({ ...u, leasedRent: Number(live.get(u.id)?.rent) || 0 })));
        })
        .catch(() => alive && setData([]));
      return () => {
        alive = false;
      };
    }, [item.id]);

    if (!data) return <ListLoading label="Loading units" className="py-10" />;

    const revenue = data.filter(isRevenue);
    const occupied = revenue.filter((u) => ["Occupied", "Notice"].includes(u.status)).length;
    const available = data.filter((u) => AVAILABLE.includes(u.status) && isRevenue(u));
    const leased = revenue.filter((u) => u.leasedRent);
    const avgLeased = leased.length ? leased.reduce((s, u) => s + u.leasedRent, 0) / leased.length : 0;
    const rents = data.map((u) => Number(u.rent) || 0).filter(Boolean);
    const market = Number(item[marketKey]) || 0;

    const stats = [
      { label: "Units", value: String(data.length), footer: `${data.length - revenue.length} non-revenue` },
      { label: "Occupancy", value: `${revenue.length ? Math.round((occupied / revenue.length) * 100) : 0}%`, footer: `${occupied} of ${revenue.length} leased` },
      { label: "Available", value: String(available.length), footer: "Vacant, make-ready or on notice" },
      {
        label: "Avg leased rent",
        value: currency(avgLeased),
        delta: market && avgLeased ? `${(((avgLeased - market) / market) * 100).toFixed(1)}%` : undefined,
        trend: avgLeased >= market ? "up" : "down",
        footer: rents.length ? `Unit rents ${currency(Math.min(...rents))}–${currency(Math.max(...rents))}` : "No unit rents yet",
      },
    ];

    const columns = [
      {
        key: "label",
        header: "Unit",
        render: (u) => (
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-foreground">{u.label}</span>
            <span className="text-xs text-text-secondary">{specs(u) || "—"}</span>
          </div>
        ),
      },
      { key: "status", header: "Status", render: (u) => <StatusPill status={u.status} map={UNIT_STATUS_MAP} /> },
      {
        key: "availableDate",
        header: "Available",
        className: "text-sm text-muted-foreground",
        render: (u) => (AVAILABLE.includes(u.status) ? formatDate(u.availableDate) : "—"),
      },
      {
        key: "rent",
        header: "Market · Leased",
        align: "right",
        className: "text-right tabular-nums",
        render: (u) => (
          <div className="flex flex-col items-end gap-0.5">
            <span className="font-semibold text-foreground">{currency(u.rent)}</span>
            <span className="text-xs text-text-secondary">{u.leasedRent ? currency(u.leasedRent) : "—"}</span>
          </div>
        ),
      },
    ];

    return (
      <div className="space-y-5">
        <StatsBar stats={stats} />
        {imageKey && item[imageKey] && !/\.pdf($|\?)/i.test(item[imageKey]) ? (
          <SectionCard bodyPadding={false}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item[imageKey]} alt={item.name || "Plan"} className="max-h-80 w-full object-contain" />
          </SectionCard>
        ) : null}
        <SectionCard title="Units" description={`Units using this ${noun}, available first.`} bodyPadding={false}>
          {data.length ? (
            <DataTable
              columns={columns}
              data={[...data].sort((a, b) => Number(AVAILABLE.includes(b.status)) - Number(AVAILABLE.includes(a.status)))}
              getRowKey={(u) => u.id}
              onRowClick={(u) => openItemInTab(u.id, "Units")}
              className="rounded-none border-0"
            />
          ) : (
            <EmptyState icon={DoorOpen} title="No units yet" description={`Assign this ${noun} to units from their Details section.`} />
          )}
        </SectionCard>
      </div>
    );
  }
  return UnitRollupSection;
}
