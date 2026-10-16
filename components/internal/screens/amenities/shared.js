import { listTenants } from "@/lib/supabase/tenants";
import { listAmenities } from "@/lib/supabase/amenities";
import { amenityReservationsLayer } from "@/lib/supabase/amenity_reservations";

// Shared lookups, formatters and reservation helpers for the Amenities area.

export const AMENITY_STATUS_MAP = {
  Active: { label: "Active", variant: "success", dotClass: "bg-emerald-400" },
  Closed: { label: "Temporarily closed", variant: "warning", dotClass: "bg-amber-400" },
  Inactive: { label: "Inactive", variant: "outline", dotClass: "bg-neutral-600" },
  Draft: { label: "Draft", variant: "neutral", dotClass: "bg-neutral-500" },
};

export const RESERVATION_STATUS_MAP = {
  requested: { label: "Requested", variant: "warning", dotClass: "bg-amber-400" },
  approved: { label: "Approved", variant: "success", dotClass: "bg-emerald-400" },
  declined: { label: "Declined", variant: "danger", dotClass: "bg-red-400" },
  cancelled: { label: "Cancelled", variant: "outline", dotClass: "bg-neutral-500" },
};

export const EVENT_STATUS_MAP = {
  Scheduled: { label: "Scheduled", variant: "info", dotClass: "bg-sky-400" },
  Cancelled: { label: "Cancelled", variant: "outline", dotClass: "bg-neutral-500" },
  Completed: { label: "Completed", variant: "success", dotClass: "bg-emerald-400" },
};

export const CATEGORY_OPTIONS = [
  "Community",
  "Unit",
  "Building",
  "Outdoor",
  "Fitness",
  "Parking",
  "Security",
  "Utilities",
  "Accessibility",
].map((v) => ({ value: v, label: v }));

export const SCOPE_OPTIONS = [
  { value: "both", label: "Property & unit" },
  { value: "property", label: "Property only" },
  { value: "unit", label: "Unit only" },
];

export const FEE_OPTIONS = [
  { value: "none", label: "Free" },
  { value: "one-time", label: "One-time fee" },
  { value: "monthly", label: "Monthly fee" },
];

export const WEEKDAYS = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
];
const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
export const DEFAULT_HOURS = { open: true, from: "08:00", to: "22:00" };

export const filterOptions = (map, allLabel = "All statuses") => [
  { value: "all", label: allLabel },
  ...Object.entries(map).map(([value, v]) => ({ value, label: v.label })),
];

export const currency = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(
    Number(n) || 0,
  );

export const feeLabel = (a) =>
  a.feeType && a.feeType !== "none" ? `${currency(a.feeAmount)} ${a.feeType === "monthly" ? "/mo" : "once"}` : "Free";

export const pad = (n) => String(n).padStart(2, "0");
export const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayISO = () => dateKey(new Date());

// "YYYY-MM-DD" + "HH:MM" (local) → ISO timestamp.
export const toISO = (date, time) => {
  if (!date) return "";
  const d = new Date(`${date}T${time || "00:00"}`);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
};

export const formatTime = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
};

export const formatDay = (iso) => {
  if (!iso) return "—";
  const d = new Date(String(iso).length <= 10 ? `${iso}T00:00:00` : iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
};

export const formatSlot = (r) =>
  r.startsAt ? `${formatDay(r.startsAt)} · ${formatTime(r.startsAt)}–${formatTime(r.endsAt)}` : "Not scheduled";

const minutes = (hhmm) => {
  const [h, m] = String(hhmm || "0:0").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

// Hours row for a date from metadata.openHours (default open 8–22).
export const hoursFor = (amenity, date) => {
  const key = DAY_KEYS[new Date(`${date}T00:00:00`).getDay()];
  return { ...DEFAULT_HOURS, ...(amenity?.openHours?.[key] || {}) };
};

const overlaps = (a, b) => new Date(a.startsAt) < new Date(b.endsAt) && new Date(b.startsAt) < new Date(a.endsAt);
const holds = (r) => r.status === "requested" || r.status === "approved";

// Validate a draft booking against the amenity's rules + existing bookings → message | null.
export function checkBooking(amenity, draft, existing = []) {
  if (!draft.date || !draft.startTime || !draft.endTime) return "Pick a date, start and end time.";
  if (minutes(draft.endTime) <= minutes(draft.startTime)) return "End time must be after the start time.";
  if (amenity) {
    const h = hoursFor(amenity, draft.date);
    if (!h.open) return `${amenity.name} is closed that day.`;
    if (minutes(draft.startTime) < minutes(h.from) || minutes(draft.endTime) > minutes(h.to))
      return `${amenity.name} is open ${h.from}–${h.to} that day.`;
    const closures = Array.isArray(amenity.closures) ? amenity.closures : [];
    if (closures.some((c) => c.date === draft.date)) return `${amenity.name} is closed for maintenance that day.`;
    const maxDays = Number(amenity.maxAdvanceDays) || 0;
    const ahead = (new Date(`${draft.date}T00:00:00`) - new Date(`${todayISO()}T00:00:00`)) / 86400000;
    if (maxDays && ahead > maxDays) return `Bookings open at most ${maxDays} days ahead.`;
    const slot = Number(amenity.slotMinutes) || 0;
    if (slot && (minutes(draft.endTime) - minutes(draft.startTime)) % slot !== 0)
      return `Book in ${slot}-minute slots.`;
    const maxLen = Number(amenity.maxDurationMinutes) || 0;
    if (maxLen && minutes(draft.endTime) - minutes(draft.startTime) > maxLen) return `Bookings are capped at ${maxLen} minutes.`;
    const notice = Number(amenity.minNoticeHours) || 0;
    if (notice && new Date(toISO(draft.date, draft.startTime)).getTime() - Date.now() < notice * 3600000)
      return `Bookings need ${notice} hours' notice.`;
    const perMonth = Number(amenity.maxPerMonth) || 0;
    const who = (draft.tenantId || draft.tenantName || "").trim();
    if (perMonth && who) {
      const month = draft.date.slice(0, 7);
      const used = existing.filter(
        (r) => holds(r) && (r.tenantId || r.tenantName) === who && dateKey(new Date(r.startsAt)).startsWith(month),
      ).length;
      if (used >= perMonth) return `That resident already has ${used} booking${used === 1 ? "" : "s"} this month (limit ${perMonth}).`;
    }
    const cap = Math.max(1, Number(amenity.capacity) || 1);
    const slotRange = { startsAt: toISO(draft.date, draft.startTime), endsAt: toISO(draft.date, draft.endTime) };
    const clash = existing.filter((r) => r.id !== draft.id && holds(r) && overlaps(r, slotRange)).length;
    if (clash >= cap) return `That time is fully booked (${cap} at a time).`;
  }
  return null;
}

export async function tenantOptions() {
  const rows = (await listTenants()) ?? [];
  return rows.map((t) => ({
    value: t.id,
    label: t.unit ? `${t.name} · ${t.unit}` : t.name || "Tenant",
    patch: { tenantName: t.name || "", unit: t.unit || "", unitId: t.unitId || "" },
  }));
}

export async function bookableAmenityOptions() {
  const rows = (await listAmenities()) ?? [];
  return rows
    .filter((a) => a.bookable && a.status !== "Inactive")
    .map((a) => ({ value: a.id, label: a.name, patch: { amenityName: a.name } }));
}

// Reservation dialog steps; `withAmenity` adds an amenity picker (calendar screen).
export const reservationSteps = (withAmenity, amenityOptions = []) => [
  {
    key: "booking",
    title: "Booking",
    fields: [
      ...(withAmenity
        ? [{ key: "amenityId", label: "Amenity", type: "select", options: amenityOptions, required: true, full: true }]
        : []),
      { key: "tenantId", label: "Resident", type: "relation", load: tenantOptions, full: true, hint: "Pick a tenant, or type a name below." },
      { key: "tenantName", label: "Resident name", type: "text", required: true },
      { key: "unit", label: "Unit", type: "text" },
      { key: "date", label: "Date", type: "date", required: true },
      { key: "guests", label: "Guests", type: "number", min: 0 },
      { key: "startTime", label: "Start", type: "time", required: true },
      { key: "endTime", label: "End", type: "time", required: true },
      { key: "fee", label: "Fee", type: "currency" },
      { key: "deposit", label: "Deposit", type: "currency" },
      { key: "notes", label: "Notes", type: "textarea" },
    ],
  },
];

// Initial values for a new booking of `amenity`.
export const reservationDraft = (amenity, date = todayISO()) => {
  const h = amenity ? hoursFor(amenity, date) : DEFAULT_HOURS;
  const slot = Number(amenity?.slotMinutes) || 60;
  const end = minutes(h.from) + slot;
  return {
    amenityId: amenity?.id || "",
    date,
    startTime: h.from,
    endTime: `${pad(Math.floor(end / 60) % 24)}:${pad(end % 60)}`,
    guests: 0,
    fee: Number(amenity?.bookingFee) || 0,
    deposit: Number(amenity?.bookingDeposit) || 0,
  };
};

// Persist a new reservation; auto-approves when the amenity needs no approval.
export async function createReservation(amenity, v) {
  return amenityReservationsLayer.create({
    id: crypto.randomUUID(),
    amenityId: amenity.id,
    amenityName: amenity.name,
    tenantId: v.tenantId || "",
    tenantName: (v.tenantName || "").trim(),
    unitId: v.unitId || "",
    unit: v.unit || "",
    startsAt: toISO(v.date, v.startTime),
    endsAt: toISO(v.date, v.endTime),
    guests: Number(v.guests) || 0,
    fee: Number(v.fee) || 0,
    deposit: Number(v.deposit) || 0,
    status: amenity.approvalRequired ? "requested" : "approved",
    metadata: { notes: v.notes || "" },
  });
}
