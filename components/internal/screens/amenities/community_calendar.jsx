"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Ban, CalendarDays, CalendarPlus, Check, ChevronLeft, ChevronRight, Plus, Trash2, X } from "lucide-react";

import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import {
  EmptyState,
  ListLoading,
  ScreenHeader,
  SectionCard,
  StatsBar,
  StatusPill,
  Toolbar,
  VARIANT_DOT,
  statusDotClass,
} from "@/components/internal/shared/screen_kit";
import { Button } from "@geiger/ui/button";
import { WizardDialog } from "@/components/internal/shared/wizard_dialog";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { cn } from "@/lib/utils";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { listAmenities } from "@/lib/supabase/amenities";
import { listAllAmenityReservations, setReservationStatus } from "@/lib/supabase/amenity_reservations";
import { residentEventsLayer } from "@/lib/supabase/resident_events";
import { propertyOptions } from "@/lib/supabase/options";
import { logSystemActivity } from "@/lib/supabase/activity_log";
import {
  EVENT_STATUS_MAP,
  RESERVATION_STATUS_MAP,
  checkBooking,
  createReservation,
  currency,
  dateKey,
  formatDay,
  formatTime,
  reservationDraft,
  reservationSteps,
  toISO,
  todayISO,
} from "./shared";

// Community calendar — a month grid of amenity reservations, resident events and
// maintenance closures. Pick a day to approve/decline bookings or manage events.

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SHOW_OPTIONS = [
  { value: "all", label: "Everything" },
  { value: "reservations", label: "Reservations" },
  { value: "events", label: "Events" },
];

// 6-week grid of Date objects starting on the Sunday on/before the 1st.
function monthGrid(cursor) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}

const localDay = (iso) => (iso ? dateKey(new Date(iso)) : "");

const EVENT_STEPS = (amenityOptions) => [
  {
    key: "event",
    title: "Event",
    fields: [
      { key: "name", label: "Event name", type: "text", required: true, full: true, placeholder: "e.g. Rooftop movie night" },
      { key: "date", label: "Date", type: "date", required: true },
      { key: "location", label: "Location", type: "text" },
      { key: "startTime", label: "Starts", type: "time", required: true },
      { key: "endTime", label: "Ends", type: "time", required: true },
      { key: "amenityId", label: "Amenity (optional)", type: "select", options: amenityOptions },
      { key: "propertyId", label: "Property", type: "relation", load: propertyOptions },
      { key: "capacity", label: "Capacity", type: "number", min: 0 },
      { key: "description", label: "Description", type: "textarea" },
    ],
    validate: (v) => (v.endTime <= v.startTime ? "The event must end after it starts." : null),
  },
];

export function CommunityCalendar({ modeSwitch }) {
  const { openItem } = useWorkspaceUrl();
  const [data, setData] = useState(null);
  const [cursor, setCursor] = useState(() => new Date());
  const [selected, setSelected] = useState(todayISO());
  const [amenityFilter, setAmenityFilter] = useState("all");
  const [show, setShow] = useState("all");
  const [dialog, setDialog] = useState(null); // null | "reservation" | "event"

  useEffect(() => {
    let alive = true;
    Promise.all([listAllAmenityReservations(), residentEventsLayer.list(), listAmenities()])
      .then(([res, events, amenities]) => alive && setData({ res: res ?? [], events: events ?? [], amenities: amenities ?? [] }))
      .catch(() => alive && setData({ res: [], events: [], amenities: [] }));
    return () => {
      alive = false;
    };
  }, []);

  const amenities = useMemo(() => data?.amenities ?? [], [data]);
  const amenityById = useMemo(() => new Map(amenities.map((a) => [a.id, a])), [amenities]);
  const amenityOptions = useMemo(() => amenities.map((a) => ({ value: a.id, label: a.name })), [amenities]);
  const bookableOptions = useMemo(
    () => amenities.filter((a) => a.bookable && a.status !== "Inactive").map((a) => ({ value: a.id, label: a.name })),
    [amenities],
  );

  // Everything on the calendar, keyed by local day.
  const byDay = useMemo(() => {
    const map = new Map();
    const push = (day, entry) => {
      if (!day) return;
      if (!map.has(day)) map.set(day, []);
      map.get(day).push(entry);
    };
    if (!data) return map;
    const amenityOk = (id) => amenityFilter === "all" || id === amenityFilter;
    if (show !== "events") {
      for (const r of data.res) {
        if (!amenityOk(r.amenityId) || r.status === "cancelled" || r.status === "declined") continue;
        push(localDay(r.startsAt), { type: "reservation", row: r, sort: r.startsAt, dot: statusDotClass(RESERVATION_STATUS_MAP[r.status]) });
      }
      for (const a of amenities) {
        if (!amenityOk(a.id)) continue;
        for (const c of Array.isArray(a.closures) ? a.closures : []) {
          push(c.date, { type: "closure", row: { id: `${a.id}-${c.id}`, name: `${a.name} closed`, detail: c.label }, sort: "", dot: VARIANT_DOT.danger });
        }
      }
    }
    if (show !== "reservations") {
      for (const e of data.events) {
        if (amenityFilter !== "all" && e.amenityId !== amenityFilter) continue;
        if (e.status === "Cancelled") continue;
        push(localDay(e.startsAt), { type: "event", row: e, sort: e.startsAt, dot: VARIANT_DOT.info });
      }
    }
    for (const list of map.values()) list.sort((a, b) => String(a.sort).localeCompare(String(b.sort)));
    return map;
  }, [data, amenities, amenityFilter, show]);

  const reservationStep = useMemo(() => {
    const [step] = reservationSteps(true, bookableOptions);
    return [{ ...step, validate: (v) => checkBooking(amenityById.get(v.amenityId), v, (data?.res || []).filter((r) => r.amenityId === v.amenityId)) }];
  }, [bookableOptions, amenityById, data]);
  const eventSteps = useMemo(() => EVENT_STEPS(amenityOptions), [amenityOptions]);

  if (!data) {
    return (
      <MainScreenWrapper>
        <ScreenHeader title="Amenities" description="Community calendar" actions={modeSwitch} />
        <ListLoading label="Loading calendar" />
      </MainScreenWrapper>
    );
  }

  const monthKey = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
  const inMonth = (iso) => localDay(iso).startsWith(monthKey);
  const monthRes = data.res.filter((r) => inMonth(r.startsAt));
  const stats = [
    { label: "Bookings", value: String(monthRes.filter((r) => r.status === "approved").length), footer: "Approved this month" },
    { label: "Requests", value: String(data.res.filter((r) => r.status === "requested").length), footer: "Awaiting approval" },
    { label: "Events", value: String(data.events.filter((e) => inMonth(e.startsAt) && e.status !== "Cancelled").length), footer: "Scheduled this month" },
    {
      label: "Booking fees",
      value: currency(monthRes.filter((r) => r.status === "approved").reduce((s, r) => s + (Number(r.fee) || 0), 0)),
      footer: "This month",
    },
  ];

  const setResStatus = async (row, status) => {
    const prev = data;
    setData((d) => ({ ...d, res: d.res.map((r) => (r.id === row.id ? { ...r, status } : r)) }));
    const ok = await setReservationStatus(row.id, status);
    if (!ok) {
      setData(prev);
      toast.error("Couldn't update the reservation.");
      return;
    }
    if (row.amenityId) logSystemActivity("amenity", row.amenityId, "action", `${RESERVATION_STATUS_MAP[status].label} reservation for ${row.tenantName || "a resident"}`);
    toast.success(`Reservation ${RESERVATION_STATUS_MAP[status].label.toLowerCase()}.`);
  };

  const setEventStatus = async (row, status) => {
    const prev = data;
    setData((d) => ({ ...d, events: d.events.map((e) => (e.id === row.id ? { ...e, status } : e)) }));
    const ok = await residentEventsLayer.update(row.id, { status });
    if (!ok) {
      setData(prev);
      toast.error("Couldn't update the event.");
      return;
    }
    toast.success(`Event ${status.toLowerCase()}.`);
  };

  const removeEvent = async (row) => {
    const prev = data;
    setData((d) => ({ ...d, events: d.events.filter((e) => e.id !== row.id) }));
    const ok = await residentEventsLayer.softDelete(row.id);
    if (!ok) {
      setData(prev);
      toast.error("Couldn't delete the event.");
      return;
    }
    toast.success("Event deleted.");
  };

  const addReservation = async (v) => {
    const amenity = amenityById.get(v.amenityId);
    if (!amenity) return false;
    const created = await createReservation(amenity, v);
    if (!created) {
      toast.error("Couldn't book that slot.");
      return false;
    }
    setData((d) => ({ ...d, res: [...d.res, created] }));
    setSelected(v.date);
    logSystemActivity("amenity", amenity.id, "action", `Booked for ${created.tenantName || "a resident"}`);
    toast.success(created.status === "approved" ? "Reservation booked." : "Reservation requested.");
    return true;
  };

  const addEvent = async (v) => {
    const amenity = amenityById.get(v.amenityId);
    const created = await residentEventsLayer.create({
      id: crypto.randomUUID(),
      name: v.name.trim(),
      startsAt: toISO(v.date, v.startTime),
      endsAt: toISO(v.date, v.endTime),
      location: v.location || amenity?.location || amenity?.name || "",
      amenityId: v.amenityId || "",
      amenityName: amenity?.name || "",
      propertyId: v.propertyId || "",
      propertyName: v.propertyName || "",
      capacity: Number(v.capacity) || 0,
      description: v.description || "",
      status: "Scheduled",
    });
    if (!created) {
      toast.error("Couldn't create the event.");
      return false;
    }
    setData((d) => ({ ...d, events: [...d.events, created] }));
    setSelected(v.date);
    toast.success("Event added to the calendar.");
    return true;
  };

  const shift = (months) => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + months, 1));
  const today = todayISO();
  const days = monthGrid(cursor);
  const dayItems = byDay.get(selected) || [];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Amenities"
        description="The community calendar — amenity reservations, resident events and maintenance closures in one view."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {modeSwitch}
            <Button variant="outline" className="border-border bg-surface-card hover:bg-surface-hover" onClick={() => setDialog("event")}>
              <CalendarPlus className="h-4 w-4" /> New Event
            </Button>
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => setDialog("reservation")}>
              <Plus className="h-4 w-4" /> New Reservation
            </Button>
          </div>
        }
      />

      <StatsBar stats={stats} />

      <Toolbar>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-9 w-9 border-border bg-surface-card" onClick={() => shift(-1)} aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            className="h-9 border-border bg-surface-card"
            onClick={() => {
              setCursor(new Date());
              setSelected(today);
            }}
          >
            Today
          </Button>
          <Button variant="outline" size="icon" className="h-9 w-9 border-border bg-surface-card" onClick={() => shift(1)} aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="ml-1 text-sm font-semibold text-foreground">
            {cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <FilterDropdown value={show} onValueChange={setShow} options={SHOW_OPTIONS} height="h-9" />
          <FilterDropdown
            value={amenityFilter}
            onValueChange={setAmenityFilter}
            options={[{ value: "all", label: "All amenities" }, ...amenityOptions]}
            height="h-9"
          />
        </div>
      </Toolbar>

      <div className="overflow-hidden rounded-xl border border-border bg-surface-subtle">
        <div className="grid grid-cols-7 border-b border-border">
          {DOW.map((d) => (
            <div key={d} className="px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d, i) => {
            const key = dateKey(d);
            const items = byDay.get(key) || [];
            const outside = d.getMonth() !== cursor.getMonth();
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelected(key)}
                className={cn(
                  "flex min-h-[64px] flex-col gap-1 border-border p-1.5 text-left transition-colors sm:min-h-[104px]",
                  i % 7 !== 0 && "border-l",
                  i >= 7 && "border-t",
                  outside ? "bg-surface-card/40" : "hover:bg-surface-hover",
                  selected === key && "bg-surface-active",
                )}
              >
                <span
                  className={cn(
                    "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs tabular-nums",
                    key === today ? "bg-primary font-semibold text-primary-foreground" : outside ? "text-text-tertiary" : "text-foreground",
                  )}
                >
                  {d.getDate()}
                </span>
                <div className="flex flex-wrap gap-1 sm:hidden">
                  {items.slice(0, 4).map((e) => (
                    <span key={`${e.type}-${e.row.id}`} className={cn("h-1.5 w-1.5 rounded-full", e.dot || VARIANT_DOT.neutral)} />
                  ))}
                </div>
                <div className="hidden min-w-0 flex-col gap-0.5 sm:flex">
                  {items.slice(0, 3).map((e) => (
                    <span
                      key={`${e.type}-${e.row.id}`}
                      className="flex min-w-0 items-center gap-1 rounded-md bg-surface-card px-1.5 py-0.5 text-[11px] text-text-secondary"
                    >
                      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", e.dot || VARIANT_DOT.neutral)} />
                      <span className="truncate">
                        {e.type === "reservation"
                          ? `${formatTime(e.row.startsAt)} ${e.row.amenityName || "Booking"}`
                          : e.type === "event"
                            ? `${formatTime(e.row.startsAt)} ${e.row.name}`
                            : e.row.name}
                      </span>
                    </span>
                  ))}
                  {items.length > 3 ? <span className="px-1.5 text-[11px] text-text-tertiary">+{items.length - 3} more</span> : null}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <SectionCard title={formatDay(selected)} description={`${dayItems.length} item${dayItems.length === 1 ? "" : "s"}`} bodyPadding={false}>
        {dayItems.length ? (
          <ul className="divide-y divide-border">
            {dayItems.map((e) => {
              const r = e.row;
              return (
                <li key={`${e.type}-${r.id}`} className="flex flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", e.dot || VARIANT_DOT.neutral)} />
                    <div className="min-w-0">
                      {e.type === "reservation" ? (
                        <>
                          <button
                            type="button"
                            className="truncate text-left text-sm font-medium text-foreground hover:underline"
                            onClick={() => r.amenityId && openItem(r.amenityId)}
                          >
                            {r.amenityName || "Amenity"} · {r.tenantName || "Resident"}
                          </button>
                          <p className="truncate text-xs text-text-secondary">
                            {[`${formatTime(r.startsAt)}–${formatTime(r.endsAt)}`, r.unit, r.guests ? `${r.guests} guests` : null, r.fee ? currency(r.fee) : null]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </>
                      ) : e.type === "event" ? (
                        <>
                          <p className="truncate text-sm font-medium text-foreground">{r.name}</p>
                          <p className="truncate text-xs text-text-secondary">
                            {[`${formatTime(r.startsAt)}–${formatTime(r.endsAt)}`, r.location, r.propertyName, r.capacity ? `${r.capacity} spots` : null]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="truncate text-sm font-medium text-foreground">{r.name}</p>
                          <p className="truncate text-xs text-text-secondary">{r.detail || "Maintenance closure"}</p>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-1">
                    {e.type === "reservation" ? <StatusPill status={r.status} map={RESERVATION_STATUS_MAP} /> : null}
                    {e.type === "event" ? <StatusPill status={r.status} map={EVENT_STATUS_MAP} /> : null}
                    {e.type === "reservation" && r.status === "requested" ? (
                      <>
                        <Button size="sm" variant="ghost" className="text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400" onClick={() => setResStatus(r, "approved")}>
                          <Check className="h-4 w-4" /> Approve
                        </Button>
                        <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-500/10 dark:text-red-300" onClick={() => setResStatus(r, "declined")}>
                          <X className="h-4 w-4" /> Decline
                        </Button>
                      </>
                    ) : null}
                    {e.type === "reservation" && r.status === "approved" ? (
                      <Button size="sm" variant="ghost" className="text-text-secondary hover:bg-surface-hover" onClick={() => setResStatus(r, "cancelled")}>
                        <Ban className="h-4 w-4" /> Cancel
                      </Button>
                    ) : null}
                    {e.type === "event" && r.status === "Scheduled" ? (
                      <Button size="sm" variant="ghost" className="text-text-secondary hover:bg-surface-hover" onClick={() => setEventStatus(r, "Cancelled")}>
                        <Ban className="h-4 w-4" /> Cancel
                      </Button>
                    ) : null}
                    {e.type === "event" ? (
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        className="text-red-600 hover:bg-red-500/10 dark:text-red-300"
                        onClick={() => removeEvent(r)}
                        aria-label="Delete event"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState icon={CalendarDays} title="Nothing on this day" description="Add a reservation or a resident event." />
        )}
      </SectionCard>

      <WizardDialog
        open={dialog === "reservation"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="New Reservation"
        description={bookableOptions.length ? "Book a bookable amenity for a resident." : "No bookable amenities yet — turn on booking in an amenity's Booking Rules."}
        steps={reservationStep}
        initial={{ ...reservationDraft(amenityById.get(bookableOptions[0]?.value), selected), amenityId: bookableOptions[0]?.value || "" }}
        finishLabel="Book"
        onFinish={addReservation}
      />
      <WizardDialog
        open={dialog === "event"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="New Resident Event"
        description="Shown on the community calendar."
        steps={eventSteps}
        initial={{ date: selected, startTime: "18:00", endTime: "20:00" }}
        finishLabel="Add Event"
        onFinish={addEvent}
      />
    </MainScreenWrapper>
  );
}

export default CommunityCalendar;
