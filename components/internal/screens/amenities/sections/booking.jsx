"use client";

import { Input } from "@geiger/ui/input";
import { Switch } from "@geiger/ui/switch";
import { SectionCard } from "@/components/internal/shared/screen_kit";
import { FieldsForm } from "@/components/internal/screens/entity/fields_form";
import { DEFAULT_HOURS, WEEKDAYS } from "../shared";

// Amenity · Booking rules — whether residents can reserve it, capacity, slot
// length, advance window, fees, approval, and per-weekday open hours
// (metadata.openHours = { mon: { open, from, to }, … }).

const bookable = (a) => Boolean(a.bookable);

const RULE_FIELDS = [
  { key: "bookable", label: "Residents can reserve this amenity", type: "switch", meta: true },
  { key: "approvalRequired", label: "Requires staff approval", type: "switch", meta: true, showIf: bookable },
  { key: "capacity", label: "Bookings at a time", type: "number", meta: true, min: 1, showIf: bookable, hint: "How many reservations can overlap." },
  { key: "maxOccupancy", label: "Max people", type: "number", meta: true, min: 0, showIf: bookable },
  { key: "slotMinutes", label: "Slot length", type: "number", meta: true, min: 15, step: 15, suffix: "min", showIf: bookable },
  { key: "maxDurationMinutes", label: "Longest booking", type: "number", meta: true, min: 0, step: 15, suffix: "min", showIf: bookable },
  { key: "maxAdvanceDays", label: "Book up to", type: "number", meta: true, min: 0, suffix: "days ahead", showIf: bookable },
  { key: "minNoticeHours", label: "Minimum notice", type: "number", meta: true, min: 0, suffix: "hours", showIf: bookable },
  { key: "maxPerMonth", label: "Bookings per resident / month", type: "number", meta: true, min: 0, showIf: bookable },
  { key: "cancelHours", label: "Free cancellation until", type: "number", meta: true, min: 0, suffix: "hours before", showIf: bookable },
  { key: "bookingFee", label: "Booking fee", type: "currency", meta: true, showIf: bookable },
  { key: "bookingDeposit", label: "Refundable deposit", type: "currency", meta: true, showIf: bookable },
  { key: "guestsAllowed", label: "Guests allowed", type: "switch", meta: true, showIf: bookable },
  { key: "guestLimit", label: "Guest limit", type: "number", meta: true, min: 0, showIf: (a) => bookable(a) && Boolean(a.guestsAllowed) },
  { key: "rulesText", label: "Rules residents agree to", type: "textarea", meta: true, showIf: bookable },
];

export function AmenityBookingSection({ item, onPatch, onCommit, onCommitMeta }) {
  const hours = item.openHours && typeof item.openHours === "object" ? item.openHours : {};
  const row = (key) => ({ ...DEFAULT_HOURS, ...(hours[key] || {}) });

  // Each weekday edit persists the whole hours map through the merge RPC.
  const setDay = (key, patch) => onCommitMeta({ openHours: { ...hours, [key]: { ...row(key), ...patch } } });

  return (
    <div className="space-y-5">
      <SectionCard title="Reservations">
        <FieldsForm item={item} fields={RULE_FIELDS} onPatch={onPatch} onCommit={onCommit} onCommitMeta={onCommitMeta} />
      </SectionCard>

      <SectionCard title="Open hours" description="Bookings must fall inside these hours." bodyPadding={false}>
        <ul className="divide-y divide-border">
          {WEEKDAYS.map((d) => {
            const h = row(d.key);
            return (
              <li key={d.key} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="flex min-w-[140px] items-center gap-3">
                  <Switch
                    checked={Boolean(h.open)}
                    onCheckedChange={(v) => setDay(d.key, { open: v })}
                    aria-label={`${d.label} open`}
                  />
                  <span className="text-sm font-medium text-foreground">{d.label}</span>
                </div>
                {h.open ? (
                  <div className="flex items-center gap-2">
                    <Input
                      type="time"
                      defaultValue={h.from}
                      key={`${d.key}-from-${h.from}`}
                      onBlur={(e) => e.target.value !== h.from && setDay(d.key, { from: e.target.value })}
                      className="h-8 w-32"
                      aria-label={`${d.label} opens`}
                    />
                    <span className="text-sm text-text-tertiary">to</span>
                    <Input
                      type="time"
                      defaultValue={h.to}
                      key={`${d.key}-to-${h.to}`}
                      onBlur={(e) => e.target.value !== h.to && setDay(d.key, { to: e.target.value })}
                      className="h-8 w-32"
                      aria-label={`${d.label} closes`}
                    />
                  </div>
                ) : (
                  <span className="text-sm text-text-tertiary">Closed</span>
                )}
              </li>
            );
          })}
        </ul>
      </SectionCard>
    </div>
  );
}

export default AmenityBookingSection;
