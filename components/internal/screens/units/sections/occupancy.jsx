"use client";

import { useEffect, useMemo, useState } from "react";
import { Users } from "lucide-react";

import { DataTable, EmptyState, ListLoading, SectionCard, StatsBar, StatusPill } from "@/components/internal/shared/screen_kit";
import { Badge } from "@/components/ui/badge";
import { FieldsForm } from "@/components/internal/screens/entity/fields_form";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { leasesLayer } from "@/lib/supabase/leases";
import { movesLayer } from "@/lib/supabase/moves";
import { LEASE_STATUS_MAP, MOVE_STATUS_MAP } from "@/components/internal/screens/leasing/shared";
import { LIVE_LEASE, currency, formatDate, occupantOptions } from "../shared";

// Unit · Occupancy — the current occupant (columns kept in sync with the lease),
// plus a history table merged from this unit's leases and move-ins/outs.

const FIELDS = [
  { key: "tenantId", label: "Current tenant", type: "relation", load: occupantOptions, displayKey: "occupantName" },
  { key: "occupantName", label: "Occupant name (display)", type: "text" },
  { key: "leaseStart", label: "Lease start", type: "date" },
  { key: "leaseEnd", label: "Lease end", type: "date" },
  { key: "moveInDate", label: "Moved in", type: "date", meta: true },
  { key: "vacatedOn", label: "Vacated on", type: "date", meta: true },
  { key: "householdSize", label: "Household size", type: "number", meta: true, min: 0 },
  { key: "noticeGivenOn", label: "Notice given", type: "date", meta: true, showIf: (u) => u.status === "Notice" },
  { key: "occupancyNotes", label: "Occupancy notes", type: "textarea", meta: true },
];

const months = (a, b) => {
  const s = new Date(`${a}T00:00:00`);
  const e = b ? new Date(`${b}T00:00:00`) : new Date();
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 0;
  return Math.max(0, (e - s) / (30.44 * 86400000));
};

export function UnitOccupancySection({ item, onPatch, onCommit, onCommitMeta }) {
  const { openItemInTab } = useWorkspaceUrl();
  const [data, setData] = useState(null);

  useEffect(() => {
    let alive = true;
    Promise.all([leasesLayer.list({ unitId: item.id }), movesLayer.list({ unitId: item.id })])
      .then(([leases, moves]) => alive && setData({ leases: leases ?? [], moves: moves ?? [] }))
      .catch(() => alive && setData({ leases: [], moves: [] }));
    return () => {
      alive = false;
    };
  }, [item.id]);

  const history = useMemo(() => {
    if (!data) return [];
    const rows = [
      ...data.leases.map((l) => ({
        id: l.id,
        tab: "Leases",
        date: l.termStart || l.createdAt?.slice(0, 10) || "",
        event: "Lease",
        who: l.tenantName,
        detail: l.termStart || l.termEnd ? `${formatDate(l.termStart)} – ${formatDate(l.termEnd)}` : l.name,
        rent: l.rent,
        status: l.status,
        map: LEASE_STATUS_MAP,
      })),
      ...data.moves.map((m) => ({
        id: m.id,
        tab: "Move-ins & Move-outs",
        date: m.moveDate || "",
        event: m.kind === "out" ? "Move-out" : "Move-in",
        who: m.tenantName,
        detail: m.leaseName || m.name,
        rent: null,
        status: m.status,
        map: MOVE_STATUS_MAP,
      })),
    ];
    return rows.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }, [data]);

  if (!data) return <ListLoading label="Loading occupancy" className="py-10" />;

  const live = data.leases.find((l) => LIVE_LEASE.includes(l.status));
  const termed = data.leases.filter((l) => l.termStart);
  const avgTenure = termed.length
    ? termed.reduce((s, l) => s + months(l.termStart, l.termEnd), 0) / termed.length
    : 0;
  // Months leased in the trailing 12 months, from lease terms.
  const yearAgo = new Date();
  yearAgo.setFullYear(yearAgo.getFullYear() - 1);
  const leased12 = termed.reduce((s, l) => {
    const start = new Date(`${l.termStart}T00:00:00`);
    const end = l.termEnd ? new Date(`${l.termEnd}T00:00:00`) : new Date();
    const from = start > yearAgo ? start : yearAgo;
    const to = end < new Date() ? end : new Date();
    return s + Math.max(0, (to - from) / (30.44 * 86400000));
  }, 0);

  // StatsBar values roll digit by digit, so keep them short and space-free.
  const stats = [
    { label: "Current", value: live ? "Leased" : "Vacant", footer: live?.tenantName || item.occupantName || "No active lease" },
    { label: "Tenancies", value: String(data.leases.length), footer: `${data.moves.length} moves logged` },
    { label: "Avg tenure", value: avgTenure ? avgTenure.toFixed(1) : "0", footer: "Months per lease" },
    { label: "Occupancy", value: `${Math.min(100, Math.round((leased12 / 12) * 100))}%`, footer: "Trailing 12 months" },
  ];

  const columns = [
    { key: "date", header: "Date", className: "text-sm text-muted-foreground", render: (r) => formatDate(r.date) },
    { key: "event", header: "Event", render: (r) => <Badge variant={r.event === "Lease" ? "info" : "neutral"}>{r.event}</Badge> },
    {
      key: "who",
      header: "Tenant",
      render: (r) => (
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-foreground">{r.who || "—"}</span>
          <span className="text-xs text-text-secondary">{r.detail || "—"}</span>
        </div>
      ),
    },
    { key: "status", header: "Status", render: (r) => (r.status ? <StatusPill status={r.status} map={r.map} /> : "—") },
    {
      key: "rent",
      header: "Rent",
      align: "right",
      className: "text-right tabular-nums text-foreground",
      render: (r) => (r.rent ? currency(r.rent) : "—"),
    },
  ];

  return (
    <div className="space-y-5">
      <StatsBar stats={stats} />
      <SectionCard title="Current occupant" description="Kept on the unit for rent roll and quick lookup.">
        <FieldsForm item={item} fields={FIELDS} onPatch={onPatch} onCommit={onCommit} onCommitMeta={onCommitMeta} />
      </SectionCard>
      <SectionCard title="Occupancy history" description="Leases and move-ins/outs for this unit, newest first." bodyPadding={false}>
        {history.length ? (
          <DataTable
            columns={columns}
            data={history}
            getRowKey={(r) => `${r.tab}-${r.id}`}
            onRowClick={(r) => openItemInTab(r.id, r.tab)}
            className="rounded-none border-0"
          />
        ) : (
          <EmptyState icon={Users} title="No occupancy history yet" description="Leases and moves linked to this unit appear here." />
        )}
      </SectionCard>
    </div>
  );
}

export default UnitOccupancySection;
