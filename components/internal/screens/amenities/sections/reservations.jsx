"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarClock, Check, Plus, X, Ban } from "lucide-react";

import { DataTable, EmptyState, ListLoading, StatsBar, StatusPill } from "@/components/internal/shared/screen_kit";
import { Button } from "@geiger/ui/button";
import { SegmentedTabs } from "@/components/internal/shared/segmented_tabs";
import { WizardDialog } from "@/components/internal/shared/wizard_dialog";
import { listAmenityReservations, setReservationStatus } from "@/lib/supabase/amenity_reservations";
import { logSystemActivity } from "@/lib/supabase/activity_log";
import {
  RESERVATION_STATUS_MAP,
  checkBooking,
  createReservation,
  currency,
  formatSlot,
  reservationDraft,
  reservationSteps,
} from "../shared";

// Amenity · Reservations — this amenity's bookings with approve / decline /
// cancel, plus a booking dialog that enforces hours, capacity and slot rules.

const FILTERS = [
  { value: "upcoming", label: "Upcoming" },
  { value: "requested", label: "Requests" },
  { value: "past", label: "Past" },
  { value: "all", label: "All" },
];

export function AmenityReservationsSection({ item }) {
  const [rows, setRows] = useState(null);
  const [filter, setFilter] = useState("upcoming");
  const [open, setOpen] = useState(false);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    listAmenityReservations(item.id)
      .then((r) => alive && setRows(r ?? []))
      .catch(() => alive && setRows([]));
    return () => {
      alive = false;
    };
  }, [item.id]);

  const steps = useMemo(() => {
    const [step] = reservationSteps(false);
    return [{ ...step, validate: (v) => checkBooking(item, v, rows || []) }];
  }, [item, rows]);

  const shown = useMemo(() => {
    const list = rows || [];
    if (filter === "upcoming") return list.filter((r) => new Date(r.endsAt) >= now && r.status !== "cancelled" && r.status !== "declined");
    if (filter === "requested") return list.filter((r) => r.status === "requested");
    if (filter === "past") return list.filter((r) => new Date(r.endsAt) < now).reverse();
    return list;
  }, [rows, filter, now]);

  if (rows === null) return <ListLoading label="Loading reservations" className="py-10" />;

  const setStatus = async (row, status) => {
    const prev = rows;
    setRows((list) => list.map((r) => (r.id === row.id ? { ...r, status } : r)));
    const ok = await setReservationStatus(row.id, status);
    if (!ok) {
      setRows(prev);
      toast.error("Couldn't update the reservation.");
      return;
    }
    logSystemActivity("amenity", item.id, "action", `${RESERVATION_STATUS_MAP[status].label} reservation for ${row.tenantName || "a resident"}`);
    toast.success(`Reservation ${RESERVATION_STATUS_MAP[status].label.toLowerCase()}.`);
  };

  const add = async (values) => {
    const created = await createReservation(item, values);
    if (!created) {
      toast.error("Couldn't book that slot.");
      return false;
    }
    setRows((list) => [...list, created].sort((a, b) => String(a.startsAt).localeCompare(String(b.startsAt))));
    logSystemActivity("amenity", item.id, "action", `Booked for ${created.tenantName || "a resident"}`);
    toast.success(created.status === "approved" ? "Reservation booked." : "Reservation requested — approve it below.");
    return true;
  };

  const upcoming = rows.filter((r) => new Date(r.endsAt) >= now && r.status === "approved");
  const pending = rows.filter((r) => r.status === "requested").length;
  const monthKey = new Date().toISOString().slice(0, 7);
  const monthFees = rows
    .filter((r) => r.status === "approved" && String(r.startsAt).slice(0, 7) === monthKey)
    .reduce((s, r) => s + (Number(r.fee) || 0), 0);

  const columns = [
    {
      key: "tenantName",
      header: "Resident",
      render: (r) => (
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-foreground">{r.tenantName || "—"}</span>
          <span className="text-xs text-text-secondary">{[r.unit, r.guests ? `${r.guests} guests` : null].filter(Boolean).join(" · ") || "—"}</span>
        </div>
      ),
    },
    { key: "slot", header: "When", className: "text-sm text-muted-foreground", render: formatSlot },
    { key: "status", header: "Status", render: (r) => <StatusPill status={r.status} map={RESERVATION_STATUS_MAP} /> },
    { key: "fee", header: "Fee", align: "right", className: "text-right tabular-nums text-foreground", render: (r) => currency(r.fee) },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (r) => (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          {r.status === "requested" ? (
            <>
              <Button size="sm" variant="ghost" className="text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400" onClick={() => setStatus(r, "approved")}>
                <Check className="h-4 w-4" /> Approve
              </Button>
              <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-500/10 dark:text-red-300" onClick={() => setStatus(r, "declined")}>
                <X className="h-4 w-4" /> Decline
              </Button>
            </>
          ) : null}
          {r.status === "approved" && new Date(r.endsAt) >= now ? (
            <Button size="sm" variant="ghost" className="text-text-secondary hover:bg-surface-hover" onClick={() => setStatus(r, "cancelled")}>
              <Ban className="h-4 w-4" /> Cancel
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <StatsBar
        stats={[
          { label: "Upcoming", value: String(upcoming.length), footer: "Approved bookings" },
          { label: "Requests", value: String(pending), footer: pending ? "Awaiting approval" : "All caught up" },
          { label: "Fees this month", value: currency(monthFees), footer: "Approved bookings" },
          { label: "All time", value: String(rows.length), footer: "Reservations" },
        ]}
      />

      {!item.bookable ? (
        <p className="rounded-xl border border-border bg-surface-subtle px-4 py-3 text-sm text-text-secondary">
          Booking is off for this amenity — turn it on under Booking Rules so residents can reserve it. Staff can still book here.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedTabs tabs={FILTERS} value={filter} onChange={setFilter} />
        <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> New Reservation
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={shown}
        getRowKey={(r) => r.id}
        empty={
          <div className="rounded-xl border border-border bg-surface-subtle">
            <EmptyState icon={CalendarClock} title="No reservations here" description="Bookings for this amenity show up here." />
          </div>
        }
      />

      <WizardDialog
        open={open}
        onOpenChange={setOpen}
        title={`Reserve ${item.name}`}
        description={item.approvalRequired ? "Staff approval required — it starts as a request." : "Booked straight away — no approval needed."}
        steps={steps}
        initial={reservationDraft(item)}
        finishLabel="Book"
        onFinish={add}
      />
    </div>
  );
}

export default AmenityReservationsSection;
