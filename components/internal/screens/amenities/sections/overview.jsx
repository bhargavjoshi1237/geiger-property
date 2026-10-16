"use client";

import { useEffect, useState } from "react";

import { ListLoading, SectionCard, StatsBar, StatusPill } from "@/components/internal/shared/screen_kit";
import { listAmenityReservations } from "@/lib/supabase/amenity_reservations";
import { listAmenityOwners } from "@/lib/supabase/amenity_links";
import {
  RESERVATION_STATUS_MAP,
  SCOPE_OPTIONS,
  WEEKDAYS,
  DEFAULT_HOURS,
  currency,
  feeLabel,
  formatSlot,
} from "../shared";

// Amenity · Overview — bookings KPIs, where it's attached, hours and next bookings.

function Fact({ label, children }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">{label}</dt>
      <dd className="mt-1 truncate text-sm text-foreground">{children || "—"}</dd>
    </div>
  );
}

export function AmenityOverviewSection({ item }) {
  const [data, setData] = useState(null);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    Promise.all([listAmenityReservations(item.id), listAmenityOwners(item.id)])
      .then(([res, links]) => alive && setData({ res: res ?? [], links: links ?? [] }))
      .catch(() => alive && setData({ res: [], links: [] }));
    return () => {
      alive = false;
    };
  }, [item.id]);

  if (!data) return <ListLoading label="Loading amenity" className="py-10" />;

  const next = data.res.filter((r) => new Date(r.endsAt) >= now && ["approved", "requested"].includes(r.status)).slice(0, 5);
  const pending = data.res.filter((r) => r.status === "requested").length;
  const feeTotal = data.res.filter((r) => r.status === "approved").reduce((s, r) => s + (Number(r.fee) || 0), 0);
  const hours = item.openHours || {};

  return (
    <div className="space-y-5">
      <StatsBar
        stats={[
          { label: "Attached to", value: String(data.links.length), footer: "Properties, units & types" },
          { label: "Upcoming", value: String(next.length), footer: item.bookable ? "Next bookings" : "Booking is off" },
          { label: "Requests", value: String(pending), footer: "Awaiting approval" },
          { label: "Booking fees", value: currency(feeTotal), footer: "Approved, all time" },
        ]}
      />

      <SectionCard title="At a glance">
        <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-3">
          <Fact label="Category">{item.category}</Fact>
          <Fact label="Applies to">{SCOPE_OPTIONS.find((s) => s.value === item.scope)?.label}</Fact>
          <Fact label="Fee">{feeLabel(item)}</Fact>
          <Fact label="Location">{item.location}</Fact>
          <Fact label="Bookable">{item.bookable ? (item.approvalRequired ? "Yes · approval required" : "Yes · instant") : "No"}</Fact>
          <Fact label="Capacity">{item.capacity ? `${item.capacity} at a time` : null}</Fact>
        </dl>
        {item.description ? <p className="mt-5 whitespace-pre-wrap text-sm text-text-secondary">{item.description}</p> : null}
      </SectionCard>

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard title="Open hours" bodyPadding={false}>
          <ul className="divide-y divide-border">
            {WEEKDAYS.map((d) => {
              const h = { ...DEFAULT_HOURS, ...(hours[d.key] || {}) };
              return (
                <li key={d.key} className="flex items-center justify-between px-5 py-2.5 text-sm">
                  <span className="text-text-secondary">{d.label}</span>
                  <span className="tabular-nums text-foreground">{h.open ? `${h.from} – ${h.to}` : "Closed"}</span>
                </li>
              );
            })}
          </ul>
        </SectionCard>
        <SectionCard title="Next bookings" bodyPadding={false}>
          {next.length ? (
            <ul className="divide-y divide-border">
              {next.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{r.tenantName || "Resident"}</p>
                    <p className="truncate text-xs text-text-secondary">{formatSlot(r)}</p>
                  </div>
                  <StatusPill status={r.status} map={RESERVATION_STATUS_MAP} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-6 text-sm text-text-secondary">No upcoming bookings.</p>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

export default AmenityOverviewSection;
