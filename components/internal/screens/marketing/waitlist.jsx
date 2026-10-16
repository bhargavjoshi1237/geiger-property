"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  LayoutDashboard,
  Contact,
  SlidersHorizontal,
  Clock,
  ListOrdered,
  Flag,
  DoorOpen,
  Send,
  Link2,
  FileText,
  StickyNote,
  Bell,
  FilePlus2,
  ArrowUp,
  ArrowDown,
  CheckCircle2,
  UserMinus,
  RotateCcw,
  Loader2,
} from "lucide-react";

import { StatusPill } from "@/components/internal/shared/screen_kit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { DocumentsSection, ActivitySection } from "@/components/internal/screens/entity/shared_sections";
import { makeFieldsSection, makeNotesSection } from "@/components/internal/screens/entity/sections/factories";
import { waitlistLayer } from "@/lib/supabase/waitlist";
import { applicationsLayer } from "@/lib/supabase/applications";
import { prospectsLayer } from "@/lib/supabase/prospects";
import { propertyOptions } from "@/lib/supabase/options";
import {
  applicationOptions,
  marketingUnitOptions,
  prospectContactOptions,
} from "@/lib/supabase/marketing_options";
import { MatchingUnitsSection, OffersSection, WaitlistOverviewSection, offerUnit } from "./sections/waitlist_sections";
import { OWNER, createApplicationFor } from "./flows";
import {
  CONTACT_METHOD_OPTIONS,
  WAITLIST_PRIORITY_OPTIONS,
  WAITLIST_STATUS_MAP,
  addDaysISO,
  currency,
  daysSince,
  filterOptions,
  formatDate,
  formatDateTime,
  selectOptions,
  todayISO,
} from "./shared";

// Waitlist — people waiting for a unit (owns `property.waitlist_entries`):
// priority + position, matching available units, offers with response windows,
// notification log, and hand-off to an application.

const ACTIVE = ["Waiting", "Offered"];
const PRIORITY_RANK = { Accessibility: 0, Transfer: 1, Employee: 2, High: 3, Standard: 4 };

// Queue order: position (unranked last), then priority, then join date.
const rank = (r) => Number(r.position) || Number.MAX_SAFE_INTEGER;
const byQueue = (a, b) =>
  rank(a) - rank(b) ||
  (PRIORITY_RANK[a.metadata?.priority] ?? 4) - (PRIORITY_RANK[b.metadata?.priority] ?? 4) ||
  String(a.joinedOn || a.createdAt).localeCompare(String(b.joinedOn || b.createdAt));

const sameQueue = (a, b) => (a.propertyId || "") === (b.propertyId || "");

// Rewrite positions 1..n per property for active entries (priority first, then current order).
async function renumber() {
  const rows = ((await waitlistLayer.list()) ?? []).filter((r) => ACTIVE.includes(r.status));
  const groups = new Map();
  for (const r of rows) groups.set(r.propertyId || "", [...(groups.get(r.propertyId || "") || []), r]);
  let changed = 0;
  for (const list of groups.values()) {
    list.sort(
      (a, b) =>
        (PRIORITY_RANK[a.metadata?.priority] ?? 4) - (PRIORITY_RANK[b.metadata?.priority] ?? 4) || byQueue(a, b),
    );
    for (const [i, r] of list.entries()) {
      if (Number(r.position) !== i + 1 && (await waitlistLayer.update(r.id, { position: i + 1 }))) changed += 1;
    }
  }
  return changed;
}

function RenumberButton({ reload }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      className="border-border bg-surface-card hover:bg-surface-hover"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const n = await renumber();
        setBusy(false);
        toast.success(n ? `Renumbered ${n} entr${n === 1 ? "y" : "ies"}.` : "Positions are already in order.");
        reload();
      }}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ListOrdered className="h-4 w-4" />}
      Renumber queue
    </Button>
  );
}

// Swap position with the neighbor above/below in the same property's queue.
async function move(ctx, dir) {
  const rows = ((await waitlistLayer.list()) ?? []).filter((r) => ACTIVE.includes(r.status) && sameQueue(r, ctx.item)).sort(byQueue);
  const i = rows.findIndex((r) => r.id === ctx.item.id);
  const other = rows[i + dir];
  if (i < 0 || !other) {
    toast.error(dir < 0 ? "Already first in line." : "Already last in line.");
    return;
  }
  const mine = Number(ctx.item.position) || i + 1;
  const theirs = Number(other.position) || i + 1 + dir;
  const ok = (await ctx.commit({ position: theirs })) && (await waitlistLayer.update(other.id, { position: mine }));
  if (!ok) {
    toast.error("Couldn't reorder the waitlist.");
    return;
  }
  ctx.log(`Moved ${dir < 0 ? "up" : "down"} to #${theirs}`);
  toast.success(`Now #${theirs} in line.`);
  ctx.reload();
}

const CONTACT_FIELDS = [
  { key: "name", label: "Full name", type: "text", full: true, required: true },
  { key: "email", label: "Email", type: "email" },
  { key: "phone", label: "Phone", type: "phone" },
  { key: "preferredContact", label: "Preferred contact", type: "select", meta: true, options: CONTACT_METHOD_OPTIONS },
  { key: "consentToNotify", label: "Consented to opening alerts", type: "switch", meta: true },
];

const PREFERENCE_FIELDS = [
  { key: "propertyId", label: "Property", type: "relation", load: propertyOptions, displayKey: "propertyName" },
  { key: "unitPreference", label: "Unit preference", type: "text", placeholder: "e.g. Ground floor, corner unit" },
  { key: "desiredBedrooms", label: "Bedrooms (minimum)", type: "number", min: 0 },
  { key: "budget", label: "Max budget (monthly)", type: "currency" },
  { key: "moveInDate", label: "Desired move-in", type: "date" },
  { key: "flexibleMoveIn", label: "Flexible on move-in", type: "switch", meta: true },
  { key: "pets", label: "Has pets", type: "switch", meta: true },
  { key: "accessibleUnit", label: "Needs an accessible unit", type: "switch", meta: true },
  { key: "parkingNeeded", label: "Needs parking", type: "switch", meta: true },
  { key: "occupants", label: "Occupants", type: "number", meta: true, min: 1 },
];

const PRIORITY_FIELDS = [
  { key: "position", label: "Position", type: "number", min: 0, hint: "Use Renumber queue on the list to compact positions." },
  { key: "priority", label: "Priority", type: "select", meta: true, options: WAITLIST_PRIORITY_OPTIONS },
  { key: "priorityReason", label: "Priority reason", type: "text", meta: true, showIf: (i) => (i.metadata?.priority ?? i.priority ?? "Standard") !== "Standard" },
  { key: "joinedOn", label: "Joined on", type: "date" },
  { key: "expiresOn", label: "Entry expires", type: "date", meta: true, hint: "Ask them to re-confirm interest after this date." },
  { key: "waitlistFee", label: "Waitlist deposit / fee", type: "currency", meta: true },
  { key: "feePaid", label: "Fee paid", type: "switch", meta: true },
  { key: "status", label: "Status", type: "select", options: selectOptions(WAITLIST_STATUS_MAP) },
];

const LINK_FIELDS = [
  { key: "prospectId", label: "Prospect", type: "relation", load: prospectContactOptions },
  { key: "applicationId", label: "Application", type: "relation", load: applicationOptions },
  { key: "unitId", label: "Offered / placed unit", type: "relation", load: marketingUnitOptions, displayKey: "unit" },
  { key: "lastNotifiedAt", label: "Last notified", type: "readonly", meta: true, format: (v) => formatDateTime(v) },
  { key: "notifyCount", label: "Times notified", type: "readonly", meta: true, format: (v) => String(v || 0) },
];

const waitlistConfig = {
  key: OWNER.waitlist,
  singular: "Waitlist entry",
  plural: "Waitlist entries",
  title: "Waitlist",
  description:
    "An ordered queue of people waiting for a unit. Match them to openings, offer units with a response window, and hand them off to an application.",
  icon: ListOrdered,
  titleField: "name",
  searchFields: ["name", "email", "phone", "propertyName", "unitPreference", "unit"],
  data: waitlistLayer.data,
  rowsLoader: async () => ((await waitlistLayer.list()) ?? []).sort(byQueue),
  headerActions: ({ reload }) => <RenumberButton reload={reload} />,

  statusMap: WAITLIST_STATUS_MAP,
  statusFilterOptions: filterOptions(WAITLIST_STATUS_MAP),

  views: [
    { value: "active", label: "In line", filter: (r) => ACTIVE.includes(r.status) },
    { value: "offered", label: "Offered", filter: (r) => r.status === "Offered" },
    { value: "priority", label: "Priority", filter: (r) => ACTIVE.includes(r.status) && (r.metadata?.priority || "Standard") !== "Standard" },
    { value: "placed", label: "Placed", filter: (r) => ["Placed", "Converted"].includes(r.status) },
    { value: "all", label: "All", filter: () => true },
  ],

  columns: [
    {
      key: "position",
      header: "#",
      className: "w-12 tabular-nums text-text-secondary",
      render: (r) => (Number(r.position) ? r.position : "—"),
    },
    {
      key: "name",
      header: "Name",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="text-xs text-text-secondary">
            {[r.email, r.phone].filter(Boolean).join(" · ") || "No contact set"}
          </span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusPill status={r.status} map={WAITLIST_STATUS_MAP} />,
    },
    {
      key: "priority",
      header: "Priority",
      render: (r) =>
        (r.metadata?.priority || "Standard") !== "Standard" ? (
          <Badge variant="purple">{r.metadata.priority}</Badge>
        ) : (
          <span className="text-text-tertiary">Standard</span>
        ),
    },
    {
      key: "preference",
      header: "Looking for",
      className: "text-sm text-text-secondary",
      render: (r) =>
        [r.propertyName, Number(r.desiredBedrooms) ? `${r.desiredBedrooms}+ bd` : null, r.budget ? `≤ ${currency(r.budget)}` : null]
          .filter(Boolean)
          .join(" · ") || "—",
    },
    {
      key: "waiting",
      header: "Waiting",
      align: "right",
      className: "text-right text-sm text-muted-foreground tabular-nums",
      render: (r) => `${daysSince(r.joinedOn || r.createdAt) ?? 0}d`,
    },
  ],

  stats: (rows) => {
    const waiting = rows.filter((r) => r.status === "Waiting");
    const waits = waiting.map((r) => daysSince(r.joinedOn || r.createdAt) || 0);
    const placed = rows.filter((r) => ["Placed", "Converted"].includes(r.status)).length;
    return [
      { label: "In line", value: String(waiting.length), footer: `${new Set(waiting.map((r) => r.propertyId || "any")).size} queues` },
      { label: "Offered", value: String(rows.filter((r) => r.status === "Offered").length), footer: "Awaiting a reply" },
      { label: "Placed", value: String(placed), footer: `${rows.filter((r) => r.status === "Declined").length} declined` },
      { label: "Avg wait", value: waits.length ? `${Math.round(waits.reduce((s, n) => s + n, 0) / waits.length)}d` : "—", footer: "For people still waiting" },
    ];
  },

  createDraft: { name: "", email: "", phone: "", propertyId: "", desiredBedrooms: "", position: "" },
  createFields: [
    { key: "name", label: "Full name", type: "text", placeholder: "e.g. Jordan Blake" },
    { key: "email", label: "Email", type: "text", placeholder: "jordan@example.com" },
    { key: "phone", label: "Phone", type: "text", placeholder: "(555) 123-4567" },
    {
      key: "propertyId",
      label: "Property",
      type: "select",
      optionsFrom: "properties",
      placeholder: "Select a property…",
      emptyLabel: "No properties yet",
    },
    { key: "desiredBedrooms", label: "Bedrooms (minimum)", type: "number", placeholder: "e.g. 2" },
    { key: "position", label: "Position (optional)", type: "number", placeholder: "Blank = unranked — use Renumber queue" },
  ],
  loadCreateOptions: async () => ({ properties: await propertyOptions() }),
  newRow: (draft) => ({
    name: draft.name.trim(),
    email: draft.email?.trim() || "",
    phone: draft.phone?.trim() || "",
    propertyId: draft.propertyId || "",
    propertyName: draft.propertyName || "",
    desiredBedrooms: Number(draft.desiredBedrooms) || 0,
    position: Number(draft.position) || 0,
    joinedOn: todayISO(),
    status: "Waiting",
  }),

  headerMeta: (r) =>
    [Number(r.position) ? `#${r.position}` : null, r.propertyName, r.unitPreference, `waiting ${daysSince(r.joinedOn || r.createdAt) ?? 0} days`]
      .filter(Boolean)
      .join(" · "),

  actions: [
    {
      key: "notify",
      label: "Log opening notice",
      icon: Bell,
      showIf: (i) => ACTIVE.includes(i.status),
      run: async (ctx) => {
        const m = ctx.item.metadata || {};
        const ok = await ctx.commitMeta({
          lastNotifiedAt: new Date().toISOString(),
          notifyCount: (Number(m.notifyCount) || 0) + 1,
        });
        if (!ok) return;
        ctx.log("Notified of an opening (logged — send the message from Communications)");
        toast.success("Notification logged.");
      },
    },
    {
      key: "offer",
      label: "Offer unit",
      icon: Send,
      showIf: (i) => ACTIVE.includes(i.status),
      wizard: {
        title: "Offer a unit",
        description: "Marks the entry Offered with a response deadline. Find candidates under Matching units.",
        initial: (i) => ({ unitId: i.unitId || "", respondBy: addDaysISO(3), rent: "", note: "" }),
        steps: [
          {
            key: "offer",
            title: "Offer",
            fields: [
              { key: "unitId", label: "Unit", type: "relation", load: marketingUnitOptions, required: true, full: true },
              { key: "respondBy", label: "Respond by", type: "date", required: true },
              { key: "rent", label: "Offered rent", type: "currency", hint: "Blank = the unit's rent." },
              { key: "note", label: "Note", type: "text" },
            ],
          },
        ],
        finishLabel: "Offer unit",
        logSummary: "Offered a unit",
        finish: async (v, ctx) => {
          const opts = await marketingUnitOptions();
          const u = opts.find((o) => o.value === v.unitId);
          const ok = await offerUnit(ctx, { id: v.unitId, name: u?.patch.unit || v.unit || "Unit", rent: u?.unit?.rent }, { respondBy: v.respondBy, rent: v.rent === "" ? undefined : v.rent, note: v.note });
          if (ok) toast.success(`Offer sent — respond by ${formatDate(v.respondBy)}.`);
          return ok;
        },
      },
    },
    {
      key: "toApplication",
      label: "Convert to application",
      icon: FilePlus2,
      showIf: (i) => ACTIVE.includes(i.status) && !i.applicationId,
      wizard: {
        title: "Convert to application",
        description: "Creates an application for this person and links it to the entry.",
        initial: (i) => ({ unitId: i.unitId || "", unit: i.unit || "", moveInDate: i.moveInDate || "", monthlyIncome: "" }),
        steps: [
          {
            key: "app",
            title: "Application",
            fields: [
              { key: "unitId", label: "Unit", type: "relation", load: marketingUnitOptions, required: true, full: true },
              { key: "moveInDate", label: "Requested move-in", type: "date" },
              { key: "monthlyIncome", label: "Gross monthly income", type: "currency" },
            ],
          },
        ],
        finishLabel: "Create application",
        logSummary: "Converted to application",
        finish: async (v, ctx) => {
          const i = ctx.item;
          const prospect = i.prospectId ? await prospectsLayer.get(i.prospectId) : null;
          const values = { ...v, name: i.name, email: i.email, phone: i.phone, occupants: i.metadata?.occupants || 1 };
          const app = prospect
            ? await createApplicationFor(prospect, values)
            : await applicationsLayer.create({
                id: crypto.randomUUID(),
                name: i.name,
                email: i.email || "",
                phone: i.phone || "",
                unitId: v.unitId,
                unit: v.unit || "",
                propertyId: v.propertyId || i.propertyId || "",
                propertyName: v.propertyName || i.propertyName || "",
                moveInDate: v.moveInDate || "",
                monthlyIncome: Number(v.monthlyIncome) || 0,
                source: "Waitlist",
                appliedOn: todayISO(),
                status: "Submitted",
              });
          if (!app) {
            toast.error("Couldn't create the application.");
            return false;
          }
          await ctx.commit({ applicationId: app.id });
          toast.success(`Application created for ${i.name}.`);
          return true;
        },
      },
    },
    { key: "moveUp", label: "Move up", icon: ArrowUp, separatorBefore: true, showIf: (i) => ACTIVE.includes(i.status), run: (ctx) => move(ctx, -1) },
    { key: "moveDown", label: "Move down", icon: ArrowDown, showIf: (i) => ACTIVE.includes(i.status), run: (ctx) => move(ctx, 1) },
    {
      key: "placed",
      label: "Mark placed",
      icon: CheckCircle2,
      separatorBefore: true,
      showIf: (i) => ACTIVE.includes(i.status),
      run: async (ctx) => {
        if (await ctx.commit({ status: "Placed" })) {
          await ctx.commitMeta({ placedOn: todayISO() });
          toast.success("Marked placed.");
        }
      },
    },
    {
      key: "remove",
      label: "Remove from waitlist",
      icon: UserMinus,
      danger: true,
      showIf: (i) => i.status !== "Removed",
      wizard: {
        title: "Remove from waitlist",
        initial: () => ({ removedReason: "" }),
        steps: [
          {
            key: "reason",
            title: "Reason",
            fields: [
              {
                key: "removedReason",
                label: "Reason",
                type: "select",
                required: true,
                options: ["Found housing elsewhere", "No response", "Declined offers", "Did not qualify", "Asked to be removed", "Other"].map((v) => ({ value: v, label: v })),
              },
              { key: "removedNotes", label: "Notes", type: "textarea" },
            ],
          },
        ],
        finishLabel: "Remove",
        logSummary: "Removed from waitlist",
        finish: async (v, ctx) => {
          if (!(await ctx.commit({ status: "Removed" }))) return false;
          await ctx.commitMeta({ removedReason: v.removedReason, removedNotes: v.removedNotes || "", removedOn: todayISO() });
          toast.success("Removed from the waitlist.");
          return true;
        },
      },
    },
    {
      key: "requeue",
      label: "Put back in line",
      icon: RotateCcw,
      showIf: (i) => ["Removed", "Declined"].includes(i.status),
      run: async (ctx) => {
        if (await ctx.commit({ status: "Waiting" })) toast.success("Back in line.");
      },
    },
  ],

  navGroups: [
    {
      group: null,
      items: [{ key: "overview", label: "Overview", icon: LayoutDashboard, desc: "Position, preferences and open offers." }],
    },
    {
      group: "Entry",
      items: [
        { key: "contact", label: "Contact", icon: Contact, desc: "How to reach them." },
        { key: "preferences", label: "Preferences", icon: SlidersHorizontal, desc: "Property, size, budget and timing." },
        { key: "priority", label: "Priority & position", icon: Flag, desc: "Where they are in line and why." },
      ],
    },
    {
      group: "Placement",
      items: [
        { key: "matches", label: "Matching units", icon: DoorOpen, desc: "Open units that fit — offer one in a click." },
        { key: "offers", label: "Offers", icon: Send, desc: "Units offered and how they responded." },
        { key: "links", label: "Linked records", icon: Link2, desc: "Prospect, application and unit." },
      ],
    },
    {
      group: "Files & history",
      items: [
        { key: "documents", label: "Documents", icon: FileText, desc: "Files for this entry." },
        { key: "notes", label: "Notes", icon: StickyNote, desc: "Internal notes." },
        { key: "activity", label: "Activity", icon: Clock, desc: "Changes, notices and offers." },
      ],
    },
  ],
  sections: {
    overview: WaitlistOverviewSection,
    contact: makeFieldsSection(CONTACT_FIELDS),
    preferences: makeFieldsSection(PREFERENCE_FIELDS),
    priority: makeFieldsSection(PRIORITY_FIELDS),
    matches: MatchingUnitsSection,
    offers: OffersSection,
    links: makeFieldsSection(LINK_FIELDS),
    documents: DocumentsSection,
    notes: makeNotesSection({ field: "notes", placeholder: "Internal notes on this entry…" }),
    activity: ActivitySection,
  },
};

export function WaitlistScreen() {
  return <EntityListScreen config={waitlistConfig} />;
}

export default WaitlistScreen;
