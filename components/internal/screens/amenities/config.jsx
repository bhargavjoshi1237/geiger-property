import {
  Sparkles,
  LayoutDashboard,
  SquarePen,
  Link2,
  FileText,
  Clock,
  Settings,
  CalendarClock,
  CalendarCog,
  Image as ImageIcon,
  Wrench,
  CalendarOff,
  StickyNote,
  Power,
  PowerOff,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";

import { StatusPill } from "@/components/internal/shared/screen_kit";
import { Badge } from "@/components/ui/badge";
import { amenitiesData, listAmenities } from "@/lib/supabase/amenities";
import { listAllAmenityReservations } from "@/lib/supabase/amenity_reservations";
import {
  SettingsSection,
  DocumentsSection,
  ActivitySection,
  AmenityAttachedSection,
  MediaSection,
} from "@/components/internal/screens/entity/shared_sections";
import {
  makeFieldsSection,
  makeMetaListSection,
  makeNotesSection,
} from "@/components/internal/screens/entity/sections/factories";
import { AmenityOverviewSection } from "./sections/overview";
import { AmenityBookingSection } from "./sections/booking";
import { AmenityReservationsSection } from "./sections/reservations";
import {
  AMENITY_STATUS_MAP,
  CATEGORY_OPTIONS,
  FEE_OPTIONS,
  SCOPE_OPTIONS,
  currency,
  feeLabel,
  filterOptions,
  todayISO,
} from "./shared";

// Per-area config for Amenities (row = a reusable amenity definition, optionally
// bookable by residents with rules, hours and reservations).

// List rows joined with reservation counts (pending requests, upcoming bookings).
async function loadAmenityRows() {
  const [rows, res] = await Promise.all([listAmenities(), listAllAmenityReservations()]);
  if (!rows) return null;
  const now = Date.now();
  const pending = new Map();
  const upcoming = new Map();
  for (const r of res ?? []) {
    if (r.status === "requested") pending.set(r.amenityId, (pending.get(r.amenityId) || 0) + 1);
    if (r.status === "approved" && new Date(r.endsAt) >= now) upcoming.set(r.amenityId, (upcoming.get(r.amenityId) || 0) + 1);
  }
  return rows.map((a) => ({ ...a, pendingCount: pending.get(a.id) || 0, upcomingCount: upcoming.get(a.id) || 0 }));
}

const DETAIL_FIELDS = [
  { key: "name", label: "Amenity name", type: "text", required: true },
  { key: "category", label: "Category", type: "select", options: CATEGORY_OPTIONS },
  { key: "scope", label: "Applies to", type: "select", options: SCOPE_OPTIONS },
  { key: "icon", label: "Icon (Lucide name)", type: "text", placeholder: "e.g. Dumbbell" },
  { key: "feeType", label: "Resident fee", type: "select", options: FEE_OPTIONS },
  { key: "feeAmount", label: "Fee amount", type: "currency", showIf: (a) => a.feeType && a.feeType !== "none" },
  { key: "location", label: "Location", type: "text", meta: true, placeholder: "e.g. Building A · Level 2" },
  { key: "contact", label: "Staff contact", type: "text", meta: true },
  { key: "highlight", label: "Show in marketing", type: "switch", meta: true, hint: "Feature this amenity on listings and the website." },
  { key: "accessible", label: "Accessible", type: "switch", meta: true },
  { key: "accessMethod", label: "Access", type: "select", meta: true, options: ["Open", "Key fob", "Smart lock", "Staff unlock", "Code"].map((v) => ({ value: v, label: v })) },
  { key: "description", label: "Description", type: "textarea" },
];

const OPERATIONS_FIELDS = [
  { key: "vendorName", label: "Service vendor", type: "text", meta: true },
  { key: "serviceFrequency", label: "Service frequency", type: "select", meta: true, options: ["Weekly", "Monthly", "Quarterly", "Annually", "As needed"].map((v) => ({ value: v, label: v })) },
  { key: "lastServicedOn", label: "Last serviced", type: "date", meta: true },
  { key: "nextServiceDue", label: "Next service due", type: "date", meta: true },
  { key: "monthlyCost", label: "Monthly operating cost", type: "currency", meta: true },
  { key: "insuranceRequired", label: "Requires resident insurance / waiver", type: "switch", meta: true },
  { key: "waiverText", label: "Waiver text", type: "textarea", meta: true, showIf: (a) => Boolean(a.insuranceRequired) },
  { key: "operationsNotes", label: "Operations notes", type: "textarea", meta: true },
];

export const amenitiesConfig = {
  key: "amenity",
  singular: "Amenity",
  plural: "Amenities",
  title: "Amenities",
  description:
    "Your library of amenities — attach them to properties and units, set booking rules for shared spaces, and approve resident reservations.",
  icon: Sparkles,
  titleField: "name",
  searchFields: ["name", "category", "location"],
  data: amenitiesData,
  rowsLoader: loadAmenityRows,

  statusMap: AMENITY_STATUS_MAP,
  statusFilterOptions: filterOptions(AMENITY_STATUS_MAP),

  views: [
    { value: "all", label: "All", filter: () => true },
    { value: "bookable", label: "Bookable", filter: (r) => Boolean(r.bookable), createDefaults: { metadata: { bookable: true } } },
    { value: "requests", label: "Has requests", filter: (r) => r.pendingCount > 0 },
    { value: "paid", label: "Paid", filter: (r) => (r.feeType && r.feeType !== "none") || Number(r.bookingFee) > 0 },
  ],

  columns: [
    {
      key: "name",
      header: "Amenity",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="text-xs text-text-secondary">{[r.location, r.description].filter(Boolean).join(" · ") || "—"}</span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusPill status={r.status} map={AMENITY_STATUS_MAP} />,
    },
    {
      key: "category",
      header: "Category",
      render: (r) => <Badge variant="purple">{r.category}</Badge>,
    },
    {
      key: "booking",
      header: "Booking",
      render: (r) =>
        r.bookable ? (
          <div className="flex flex-col gap-0.5">
            <span className="text-sm text-foreground">{r.upcomingCount} upcoming</span>
            <span className={r.pendingCount ? "text-xs text-amber-700 dark:text-amber-400" : "text-xs text-text-secondary"}>
              {r.pendingCount ? `${r.pendingCount} awaiting approval` : r.approvalRequired ? "Approval required" : "Instant booking"}
            </span>
          </div>
        ) : (
          <span className="text-sm text-text-tertiary">Not bookable</span>
        ),
    },
    {
      key: "fee",
      header: "Fee",
      align: "right",
      className: "text-right text-sm text-muted-foreground",
      render: (r) => (Number(r.bookingFee) > 0 ? `${feeLabel(r)} · ${currency(r.bookingFee)}/booking` : feeLabel(r)),
    },
  ],

  stats: (rows) => {
    const active = rows.filter((r) => r.status === "Active").length;
    const bookable = rows.filter((r) => r.bookable).length;
    const pending = rows.reduce((s, r) => s + (r.pendingCount || 0), 0);
    const upcoming = rows.reduce((s, r) => s + (r.upcomingCount || 0), 0);
    return [
      { label: "Amenities", value: String(rows.length), footer: `${active} active` },
      { label: "Bookable", value: String(bookable), footer: "Residents can reserve" },
      { label: "Requests", value: String(pending), footer: pending ? "Awaiting approval" : "All caught up" },
      { label: "Upcoming", value: String(upcoming), footer: "Approved bookings" },
    ];
  },

  createDraft: { name: "", category: "Community", status: "Active" },
  createFields: [
    { key: "name", label: "Amenity name", type: "text", placeholder: "e.g. Rooftop Lounge" },
    { key: "category", label: "Category", type: "select", options: CATEGORY_OPTIONS },
    { key: "status", label: "Status", type: "select", options: filterOptions(AMENITY_STATUS_MAP).slice(1) },
  ],
  newRow: (draft) => ({
    name: draft.name.trim(),
    category: draft.category || "Community",
    scope: "both",
    status: draft.status || "Active",
  }),

  headerMeta: (r) => [r.category, r.location, feeLabel(r), r.bookable ? "Bookable" : null].filter(Boolean).join(" · "),

  actions: [
    {
      key: "enableBooking",
      label: "Enable booking",
      icon: CalendarCog,
      showIf: (a) => !a.bookable,
      run: async (ctx) => {
        if (!(await ctx.commitMeta({ bookable: true }))) return;
        ctx.log("Enabled resident booking");
        toast.success("Residents can now reserve this amenity.");
        ctx.navigate("booking");
      },
    },
    {
      key: "disableBooking",
      label: "Disable booking",
      icon: CalendarOff,
      showIf: (a) => Boolean(a.bookable),
      run: async (ctx) => {
        if (!(await ctx.commitMeta({ bookable: false }))) return;
        ctx.log("Disabled resident booking");
        toast.success("Booking turned off.");
      },
    },
    {
      key: "closeTemporarily",
      label: "Close temporarily",
      icon: PowerOff,
      showIf: (a) => a.status === "Active",
      wizard: {
        title: "Close temporarily",
        description: "Marks the amenity closed and adds the dates to its closure list (blocked on the calendar).",
        finishLabel: "Close amenity",
        logSummary: "Closed amenity temporarily",
        initial: () => ({ date: todayISO(), label: "Maintenance" }),
        steps: [
          {
            key: "closure",
            title: "Closure",
            fields: [
              { key: "label", label: "Reason", type: "text", required: true },
              { key: "date", label: "Closed on", type: "date", required: true },
            ],
          },
        ],
        finish: async (v, ctx) => {
          if (!(await ctx.commit({ status: "Closed" }))) return false;
          const closures = Array.isArray(ctx.item.closures) ? ctx.item.closures : [];
          await ctx.commitMeta({ closures: [...closures, { id: crypto.randomUUID(), label: v.label, date: v.date }] });
          toast.success("Amenity closed.");
          return true;
        },
      },
    },
    {
      key: "reopen",
      label: "Reopen",
      icon: Power,
      showIf: (a) => a.status === "Closed" || a.status === "Inactive",
      run: async (ctx) => {
        if (!(await ctx.commit({ status: "Active" }))) return;
        ctx.log("Reopened amenity");
        toast.success("Amenity reopened.");
      },
    },
    {
      key: "deactivate",
      label: "Deactivate",
      icon: CheckCircle2,
      separatorBefore: true,
      showIf: (a) => a.status !== "Inactive",
      run: async (ctx) => {
        if (!(await ctx.commit({ status: "Inactive" }))) return;
        ctx.log("Deactivated amenity");
        toast.success("Amenity deactivated.");
      },
    },
  ],

  navGroups: [
    { group: null, items: [{ key: "overview", label: "Overview", icon: LayoutDashboard, desc: "Bookings, hours and where it's used." }] },
    {
      group: "Amenity",
      items: [
        { key: "details", label: "Details", icon: SquarePen, desc: "Name, category, scope, fee and location." },
        { key: "attached", label: "Attached To", icon: Link2, desc: "Everywhere this amenity is used." },
        { key: "media", label: "Photos", icon: ImageIcon, desc: "Photos shown on listings and the resident portal." },
      ],
    },
    {
      group: "Booking",
      items: [
        { key: "booking", label: "Booking Rules", icon: CalendarCog, desc: "Bookable, capacity, open hours, slots, fees and approval." },
        { key: "reservations", label: "Reservations", icon: CalendarClock, desc: "Resident bookings — approve, decline or cancel.", showIf: (a) => Boolean(a.bookable) || a.upcomingCount > 0 || a.pendingCount > 0 },
        { key: "closures", label: "Closures", icon: CalendarOff, desc: "Dates the amenity is closed (blocked on the calendar)." },
      ],
    },
    {
      group: "General",
      items: [
        { key: "operations", label: "Operations", icon: Wrench, desc: "Service vendor, schedule, cost and waivers." },
        { key: "documents", label: "Documents", icon: FileText, desc: "Waivers, manuals and paperwork." },
        { key: "notes", label: "Notes", icon: StickyNote, desc: "Internal notes." },
        { key: "activity", label: "Activity", icon: Clock, desc: "Recent changes and notes." },
        { key: "settings", label: "Settings", icon: Settings, desc: "Status and configuration." },
      ],
    },
  ],
  sections: {
    overview: AmenityOverviewSection,
    details: makeFieldsSection(DETAIL_FIELDS),
    attached: AmenityAttachedSection,
    media: MediaSection,
    booking: AmenityBookingSection,
    reservations: AmenityReservationsSection,
    closures: makeMetaListSection({
      field: "closures",
      singular: "closure",
      icon: CalendarOff,
      primaryPlaceholder: "Reason, e.g. Pool resurfacing",
      secondary: { key: "date", label: "Date", type: "date" },
    }),
    operations: makeFieldsSection(OPERATIONS_FIELDS),
    documents: DocumentsSection,
    notes: makeNotesSection({ field: "amenityNotes", placeholder: "Internal notes about this amenity…" }),
    activity: ActivitySection,
    settings: SettingsSection,
  },
};

export default amenitiesConfig;
