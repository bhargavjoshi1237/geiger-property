"use client";

import { toast } from "sonner";
import {
  LayoutDashboard,
  Contact,
  SlidersHorizontal,
  ListChecks,
  Clock,
  UserPlus,
  GitBranch,
  Megaphone,
  Receipt,
  Lock,
  CalendarClock,
  ClipboardList,
  FileText,
  Tags,
  StickyNote,
  CalendarPlus,
  FilePlus2,
  XCircle,
  RotateCcw,
  PhoneCall,
  ListOrdered,
} from "lucide-react";

import { StatusPill } from "@/components/internal/shared/screen_kit";
import { Badge } from "@/components/ui/badge";
import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { DocumentsSection, ActivitySection } from "@/components/internal/screens/entity/shared_sections";
import {
  makeFieldsSection,
  makeNotesSection,
  makeCustomFieldsSection,
} from "@/components/internal/screens/entity/sections/factories";
import { makeRecordItemsSection } from "@/components/internal/screens/entity/sections/child_records";
import { prospectsLayer } from "@/lib/supabase/prospects";
import { waitlistLayer } from "@/lib/supabase/waitlist";
import { listRecordItemsByKind } from "@/lib/supabase/record_items";
import { propertyOptions, unitOptions } from "@/lib/supabase/options";
import { agentOptions, listingOptions, listingOptionsWithUnit, marketingUnitOptions } from "@/lib/supabase/marketing_options";
import { ProspectApplicationsSection, ProspectShowingsSection, makeAsyncFieldsSection } from "./sections/common";
import { PipelineSection, ProspectOverviewSection, UnitHoldSection } from "./sections/prospect_sections";
import { OWNER, createApplicationFor, loadFunnel, nextStageHistory, scheduleShowingFor } from "./flows";
import {
  CONTACT_METHOD_OPTIONS,
  DURATION_OPTIONS,
  FOLLOW_UP_CHANNEL_OPTIONS,
  LEASE_TERM_OPTIONS,
  LISTING_FEATURE_OPTIONS,
  LOST_REASON_OPTIONS,
  PROSPECT_CLOSED,
  PROSPECT_STATUS_MAP,
  PROSPECT_WON,
  SHOWING_TYPE_OPTIONS,
  SOURCE_OPTIONS,
  currency,
  filterOptions,
  formatDate,
  isPast,
  pct,
  todayISO,
  toOptions,
} from "./shared";

// Prospects — leads in the leasing pipeline (owns `property.prospects`): stage
// history, source attribution, preferences, rent quotes, unit holds, follow-ups,
// and the hand-offs to showings and applications.

const funnel = { value: null };
const stageLabel = (s) => PROSPECT_STATUS_MAP[s]?.label || s;

// Stage change from a header action: column + history + activity.
async function changeStage(ctx, to, note, extraMeta = {}) {
  const from = ctx.item.status;
  if (!(await ctx.commit({ status: to }))) return false;
  await ctx.commitMeta({ stageHistory: nextStageHistory(ctx.item, to, note), ...extraMeta });
  ctx.log(`Stage: ${stageLabel(from)} → ${stageLabel(to)}${note ? ` (${note})` : ""}`);
  return true;
}

// Join each prospect's next open follow-up for the list column.
async function loadProspects() {
  const [rows, followUps, f] = await Promise.all([prospectsLayer.list(), listRecordItemsByKind("follow_up"), loadFunnel()]);
  funnel.value = f;
  const next = new Map();
  for (const t of followUps ?? []) {
    if (t.ownerType !== OWNER.prospect || t.status === "Done" || !t.startsOn) continue;
    const cur = next.get(t.ownerId);
    if (!cur || String(t.startsOn) < String(cur.startsOn)) next.set(t.ownerId, t);
  }
  return (rows ?? []).map((p) => ({ ...p, nextFollowUp: next.get(p.id) || null }));
}

const CONTACT_FIELDS = [
  { key: "name", label: "Full name", type: "text", full: true, required: true },
  { key: "email", label: "Email", type: "email" },
  { key: "phone", label: "Phone", type: "phone" },
  { key: "preferredContact", label: "Preferred contact", type: "select", meta: true, options: CONTACT_METHOD_OPTIONS },
  { key: "bestTime", label: "Best time to reach", type: "text", meta: true, placeholder: "e.g. Weekday evenings" },
  { key: "language", label: "Preferred language", type: "text", meta: true },
  { key: "assignedAgent", label: "Assigned agent", optionsFrom: "agents", meta: true, placeholder: "Select a team member…" },
  { key: "currentAddress", label: "Current address", type: "text", meta: true, full: true },
  { key: "currentRent", label: "Current rent", type: "currency", meta: true },
  { key: "reasonForMoving", label: "Reason for moving", type: "text", meta: true },
  { key: "consentToText", label: "Consented to texts", type: "switch", meta: true },
  { key: "doNotContact", label: "Do not contact", type: "switch", meta: true },
];

const SOURCE_FIELDS = [
  { key: "source", label: "Lead source", type: "select", options: SOURCE_OPTIONS },
  { key: "listingId", label: "Listing", type: "relation", load: listingOptions, displayKey: "listingName" },
  { key: "inquiryChannel", label: "Inquiry channel", type: "select", meta: true, options: toOptions(["Phone", "Email", "Web form", "Text", "Chat", "Walk-in", "Listing site"]) },
  { key: "firstContactOn", label: "First contact", type: "date", meta: true },
  { key: "campaign", label: "Campaign", type: "text", meta: true },
  { key: "referredBy", label: "Referred by", type: "text", meta: true, showIf: (i) => i.source === "Referral" },
  { key: "referralBonus", label: "Referral bonus", type: "currency", meta: true, showIf: (i) => i.source === "Referral" },
  { key: "inquiryMessage", label: "Original inquiry", type: "textarea", meta: true },
];

const hasPets = (i) => Boolean(i.metadata?.pets ?? i.pets);

const PREFERENCE_FIELDS = [
  { key: "heading1", label: "Where", type: "heading" },
  { key: "propertyId", label: "Property", type: "relation", load: propertyOptions, displayKey: "propertyName" },
  { key: "unitId", label: "Unit of interest", type: "relation", load: unitOptions, displayKey: "unit" },
  { key: "desiredAreas", label: "Desired areas / neighborhoods", type: "text", meta: true, full: true },
  { key: "heading2", label: "What", type: "heading" },
  { key: "bedrooms", label: "Bedrooms", type: "number", meta: true, min: 0 },
  { key: "bathrooms", label: "Bathrooms", type: "number", meta: true, min: 0, step: 0.5 },
  { key: "budgetMin", label: "Budget from", type: "currency", meta: true },
  { key: "budget", label: "Budget up to", type: "currency" },
  { key: "mustHaves", label: "Must-haves", type: "multiselect", meta: true, options: LISTING_FEATURE_OPTIONS },
  { key: "parkingNeeded", label: "Needs parking", type: "switch", meta: true },
  { key: "accessibilityNeeds", label: "Accessibility needs", type: "text", meta: true },
  { key: "heading3", label: "When & who", type: "heading" },
  { key: "moveInDate", label: "Desired move-in", type: "date" },
  { key: "leaseTermWanted", label: "Lease term", type: "select", meta: true, options: LEASE_TERM_OPTIONS },
  { key: "occupants", label: "Occupants", type: "number", meta: true, min: 1 },
  { key: "furnishedNeeded", label: "Needs furnished", type: "switch", meta: true },
  { key: "midTermStay", label: "Mid-term stay (30+ days)", type: "switch", meta: true },
  { key: "pets", label: "Has pets", type: "switch", meta: true },
  { key: "petDetails", label: "Pet details", type: "text", meta: true, showIf: hasPets, placeholder: "e.g. 1 cat, 1 dog (40 lbs)" },
];

const QUOTE_FIELDS = [
  { key: "unitId", label: "Unit", type: "relation", load: marketingUnitOptions, full: true },
  { key: "name", label: "Quote label", type: "text", placeholder: "e.g. 12-month quote", required: true },
  { key: "amount", label: "Monthly rent", type: "currency", required: true },
  { key: "termMonths", label: "Term (months)", type: "number", min: 1 },
  { key: "deposit", label: "Deposit", type: "currency" },
  { key: "concessions", label: "Concessions", type: "text", placeholder: "e.g. 1 month free" },
  { key: "startsOn", label: "Quoted on", type: "date" },
  { key: "endsOn", label: "Expires", type: "date" },
  { key: "status", label: "Status", type: "select", options: toOptions(["Draft", "Sent", "Accepted", "Declined", "Expired"]) },
  { key: "quoteNotes", label: "Notes", type: "textarea" },
];

const FOLLOW_UP_FIELDS = [
  { key: "name", label: "Task", type: "text", required: true, full: true, placeholder: "e.g. Send floor plans" },
  { key: "startsOn", label: "Due", type: "date", required: true },
  { key: "channel", label: "Channel", type: "select", options: FOLLOW_UP_CHANNEL_OPTIONS },
  { key: "assignee", label: "Assigned to", type: "relation", load: agentOptions },
  { key: "status", label: "Status", type: "select", options: toOptions(["Open", "Done", "Skipped"]) },
  { key: "outcome", label: "Outcome / notes", type: "textarea" },
];

const LOST_FIELDS = [
  { key: "lostReason", label: "Lost reason", type: "select", meta: true, options: LOST_REASON_OPTIONS },
  { key: "lostAt", label: "Lost on", type: "date", meta: true },
  { key: "lostCompetitor", label: "Went with", type: "text", meta: true, placeholder: "Competitor or other property" },
  { key: "reengageOn", label: "Re-engage on", type: "date", meta: true },
  { key: "lostNotes", label: "Notes", type: "textarea", meta: true },
];

const prospectsConfig = {
  key: OWNER.prospect,
  singular: "Prospect",
  plural: "Prospects",
  title: "Prospects",
  description:
    "Every lead in your leasing pipeline — stage history, source, preferences, quotes and holds, follow-ups, and the hand-off to showings and applications.",
  icon: UserPlus,
  titleField: "name",
  searchFields: ["name", "email", "phone", "source", "unit", "listingName", "propertyName"],
  data: prospectsLayer.data,
  rowsLoader: loadProspects,

  statusMap: PROSPECT_STATUS_MAP,
  statusFilterOptions: filterOptions(PROSPECT_STATUS_MAP, "All stages"),

  views: [
    { value: "pipeline", label: "Active pipeline", filter: (r) => !PROSPECT_CLOSED.includes(r.status) },
    { value: "new", label: "New", filter: (r) => r.status === "New", createDefaults: { status: "New" } },
    { value: "touring", label: "Touring", filter: (r) => ["Touring", "Toured"].includes(r.status) },
    { value: "applied", label: "Applied", filter: (r) => r.status === "Applied" },
    { value: "due", label: "Follow-up due", filter: (r) => Boolean(r.nextFollowUp && r.nextFollowUp.startsOn <= todayISO()) },
    { value: "won", label: "Won", filter: (r) => PROSPECT_WON.includes(r.status) },
    { value: "lost", label: "Lost", filter: (r) => r.status === "Lost" },
    { value: "all", label: "All", filter: () => true },
  ],

  columns: [
    {
      key: "name",
      header: "Prospect",
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
      header: "Stage",
      render: (r) => <StatusPill status={r.status} map={PROSPECT_STATUS_MAP} />,
    },
    {
      key: "source",
      header: "Source",
      render: (r) =>
        r.source ? <Badge variant="neutral">{r.source}</Badge> : <span className="text-text-tertiary">—</span>,
    },
    {
      key: "interest",
      header: "Interested in",
      className: "text-sm text-text-secondary",
      render: (r) => r.listingName || r.unit || r.propertyName || "—",
    },
    {
      key: "followUp",
      header: "Next follow-up",
      className: "text-sm",
      render: (r) =>
        r.nextFollowUp ? (
          <span className={isPast(r.nextFollowUp.startsOn) ? "text-amber-700 dark:text-amber-400" : "text-text-secondary"}>
            {formatDate(r.nextFollowUp.startsOn)}
          </span>
        ) : (
          <span className="text-text-tertiary">—</span>
        ),
    },
    {
      key: "budget",
      header: "Budget",
      align: "right",
      className: "text-right tabular-nums text-foreground",
      render: (r) => (r.budget ? `${currency(r.budget)}/mo` : "—"),
    },
  ],

  stats: () => {
    const f = funnel.value;
    if (!f) return [
      { label: "Leads", value: "—", footer: "Loading funnel" },
      { label: "Toured", value: "—", footer: "" },
      { label: "Applied", value: "—", footer: "" },
      { label: "Leased", value: "—", footer: "" },
    ];
    return [
      { label: "Leads", value: String(f.leads), footer: `${f.showings} showings booked` },
      { label: "Toured", value: String(f.toured), footer: `${pct(f.toured, f.leads)} of leads` },
      { label: "Applications", value: String(f.applications), footer: `${pct(f.applications, f.toured || f.leads)} of toured` },
      { label: "Leases", value: String(f.leases), footer: `${pct(f.leases, f.leads)} lead → lease` },
    ];
  },

  createDraft: { name: "", email: "", phone: "", source: "Website", listingId: "" },
  createFields: [
    { key: "name", label: "Full name", type: "text", placeholder: "e.g. Jordan Blake" },
    { key: "email", label: "Email", type: "text", placeholder: "jordan@example.com" },
    { key: "phone", label: "Phone", type: "text", placeholder: "(555) 123-4567" },
    { key: "source", label: "Source", type: "select", options: SOURCE_OPTIONS },
    { key: "listingId", label: "Listing (optional)", type: "select", optionsFrom: "listings", placeholder: "Select a listing…", emptyLabel: "No listings yet" },
  ],
  loadCreateOptions: async () => ({ listings: await listingOptionsWithUnit() }),
  newRow: (draft) => ({
    name: draft.name.trim(),
    email: draft.email?.trim() || "",
    phone: draft.phone?.trim() || "",
    source: draft.source || "",
    listingId: draft.listingId || "",
    listingName: draft.listingName || "",
    unitId: draft.unitId || "",
    unit: draft.unit || "",
    propertyId: draft.propertyId || "",
    propertyName: draft.propertyName || "",
    status: "New",
    metadata: { firstContactOn: todayISO(), stageHistory: [{ id: crypto.randomUUID(), from: "", to: "New", note: "Lead created", at: new Date().toISOString() }] },
  }),

  headerMeta: (r) => [r.source, r.email, r.phone, r.listingName].filter(Boolean).join(" · "),

  actions: [
    {
      key: "contacted",
      label: "Mark contacted",
      icon: PhoneCall,
      showIf: (i) => i.status === "New",
      run: async (ctx) => {
        if (await changeStage(ctx, "Contacted", "First contact made", { lastContactedOn: todayISO() })) toast.success("Marked contacted.");
      },
    },
    {
      key: "scheduleShowing",
      label: "Schedule showing",
      icon: CalendarPlus,
      showIf: (i) => !PROSPECT_CLOSED.includes(i.status),
      wizard: {
        title: "Schedule a showing",
        description: "Books a tour on Showings and moves this prospect to Showing scheduled.",
        initial: (i) => ({
          unitId: i.unitId || "",
          unit: i.unit || "",
          propertyId: i.propertyId || "",
          propertyName: i.propertyName || "",
          listingId: i.listingId || "",
          listingName: i.listingName || "",
          showingType: "In-person",
          durationMinutes: "30",
          showingDate: "",
          showingTime: "",
        }),
        steps: [
          {
            key: "what",
            title: "What",
            fields: [
              { key: "unitId", label: "Unit", type: "relation", load: marketingUnitOptions, full: true, required: true },
              { key: "listingId", label: "Listing", type: "relation", load: listingOptions, full: true },
              { key: "showingType", label: "Type", type: "select", options: SHOWING_TYPE_OPTIONS },
            ],
          },
          {
            key: "when",
            title: "When",
            fields: [
              { key: "showingDate", label: "Date", type: "date", required: true },
              { key: "showingTime", label: "Time", type: "time", required: true },
              { key: "durationMinutes", label: "Duration", type: "select", options: DURATION_OPTIONS },
              { key: "agent", label: "Agent", type: "relation", load: agentOptions },
            ],
            validate: (v) => (v.showingDate && v.showingDate < todayISO() ? "Pick a date from today on." : null),
          },
        ],
        finishLabel: "Schedule Showing",
        logSummary: "Scheduled a showing",
        finish: async (v, ctx) => {
          const row = await scheduleShowingFor(ctx.item, v);
          if (!row) {
            toast.error("Couldn't schedule the showing.");
            return false;
          }
          toast.success(`Showing booked for ${formatDate(v.showingDate)}.`);
          ctx.reload();
          return true;
        },
      },
    },
    {
      key: "convertApplication",
      label: "Convert to application",
      icon: FilePlus2,
      showIf: (i) => !PROSPECT_CLOSED.includes(i.status),
      wizard: {
        title: "Convert to application",
        description: "Creates an application linked to this prospect and moves them to Applied.",
        initial: (i) => ({
          name: i.name || "",
          email: i.email || "",
          phone: i.phone || "",
          unitId: i.metadata?.holdUnitId || i.unitId || "",
          unit: i.metadata?.holdUnit || i.unit || "",
          propertyId: i.propertyId || "",
          propertyName: i.propertyName || "",
          listingId: i.listingId || "",
          listingName: i.listingName || "",
          moveInDate: i.moveInDate || "",
          occupants: i.metadata?.occupants || 1,
          monthlyIncome: "",
          applicationFee: "",
        }),
        steps: [
          {
            key: "unit",
            title: "Unit",
            fields: [
              { key: "unitId", label: "Unit", type: "relation", load: marketingUnitOptions, full: true, required: true },
              { key: "listingId", label: "Listing", type: "relation", load: listingOptions, full: true },
              { key: "moveInDate", label: "Requested move-in", type: "date" },
              { key: "occupants", label: "Occupants", type: "number", min: 1 },
            ],
          },
          {
            key: "applicant",
            title: "Applicant",
            fields: [
              { key: "name", label: "Applicant name", type: "text", required: true, full: true },
              { key: "email", label: "Email", type: "email" },
              { key: "phone", label: "Phone", type: "phone" },
              { key: "monthlyIncome", label: "Gross monthly income", type: "currency" },
              { key: "applicationFee", label: "Application fee", type: "currency", hint: "Recorded only — not charged here." },
            ],
          },
        ],
        finishLabel: "Create Application",
        logSummary: "Converted to application",
        finish: async (v, ctx) => {
          const row = await createApplicationFor(ctx.item, v);
          if (!row) {
            toast.error("Couldn't create the application.");
            return false;
          }
          toast.success(`Application created for ${row.name}. Find it under Applications.`);
          ctx.reload();
          return true;
        },
      },
    },
    {
      key: "placeHold",
      label: "Hold a unit",
      icon: Lock,
      showIf: (i) => !PROSPECT_CLOSED.includes(i.status),
      wizard: {
        title: "Reserve a unit",
        description: "Hold a unit for this prospect until a date. Tracked on the prospect only.",
        initial: (i) => ({ unitId: i.metadata?.holdUnitId || i.unitId || "", holdUntil: "", holdDeposit: "" }),
        steps: [
          {
            key: "hold",
            title: "Hold",
            fields: [
              { key: "unitId", label: "Unit", type: "relation", load: marketingUnitOptions, required: true, full: true },
              { key: "holdUntil", label: "Hold until", type: "date", required: true },
              { key: "holdDeposit", label: "Holding deposit", type: "currency" },
            ],
          },
        ],
        finishLabel: "Place Hold",
        logSummary: "Placed a unit hold",
        finish: async (v, ctx) => {
          const ok = await ctx.commitMeta({
            holdUnitId: v.unitId,
            holdUnit: v.unit || "",
            holdUntil: v.holdUntil,
            holdDeposit: Number(v.holdDeposit) || 0,
            holdStatus: "Active",
          });
          if (ok) toast.success(`Unit held until ${formatDate(v.holdUntil)}.`);
          return ok;
        },
      },
    },
    {
      key: "addWaitlist",
      label: "Add to waitlist",
      icon: ListOrdered,
      showIf: (i) => !PROSPECT_CLOSED.includes(i.status),
      run: async (ctx) => {
        const i = ctx.item;
        const all = (await waitlistLayer.list()) ?? [];
        if (all.some((e) => e.prospectId === i.id && !["Removed", "Placed"].includes(e.status))) {
          toast.error("This prospect is already on the waitlist.");
          return;
        }
        const position = all.filter((e) => e.status === "Waiting" && (!i.propertyId || e.propertyId === i.propertyId)).length + 1;
        const row = await waitlistLayer.create({
          id: crypto.randomUUID(),
          name: i.name,
          email: i.email || "",
          phone: i.phone || "",
          prospectId: i.id,
          propertyId: i.propertyId || "",
          propertyName: i.propertyName || "",
          desiredBedrooms: Number(i.metadata?.bedrooms) || 0,
          budget: Number(i.budget) || 0,
          moveInDate: i.moveInDate || "",
          joinedOn: todayISO(),
          position,
          status: "Waiting",
        });
        if (!row) {
          toast.error("Couldn't add to the waitlist.");
          return;
        }
        ctx.log(`Added to waitlist at #${position}`);
        toast.success(`Added to the waitlist at #${position}.`);
      },
    },
    {
      key: "markLost",
      label: "Mark lost",
      icon: XCircle,
      danger: true,
      separatorBefore: true,
      showIf: (i) => i.status !== "Lost" && !PROSPECT_WON.includes(i.status),
      wizard: {
        title: "Mark prospect lost",
        description: "Closes this lead with a reason so you can report on why leads drop out.",
        initial: () => ({ lostReason: "", lostAt: todayISO() }),
        steps: [
          {
            key: "reason",
            title: "Reason",
            fields: [
              { key: "lostReason", label: "Reason", type: "select", options: LOST_REASON_OPTIONS, required: true },
              { key: "lostAt", label: "Lost on", type: "date" },
              { key: "lostCompetitor", label: "Went with", type: "text" },
              { key: "reengageOn", label: "Re-engage on", type: "date" },
              { key: "lostNotes", label: "Notes", type: "textarea" },
            ],
          },
        ],
        finishLabel: "Mark Lost",
        logSummary: "Marked lost",
        finish: async (v, ctx) => {
          const ok = await changeStage(ctx, "Lost", v.lostReason, {
            lostReason: v.lostReason,
            lostAt: v.lostAt || todayISO(),
            lostCompetitor: v.lostCompetitor || "",
            reengageOn: v.reengageOn || "",
            lostNotes: v.lostNotes || "",
            ...(ctx.item.metadata?.holdStatus === "Active" ? { holdStatus: "Released" } : {}),
          });
          if (ok) toast.success("Prospect marked lost.");
          return ok;
        },
      },
    },
    {
      key: "reopen",
      label: "Reopen",
      icon: RotateCcw,
      showIf: (i) => i.status === "Lost",
      run: async (ctx) => {
        if (await changeStage(ctx, "Contacted", "Reopened")) toast.success("Prospect reopened.");
      },
    },
  ],

  navGroups: [
    {
      group: null,
      items: [{ key: "overview", label: "Overview", icon: LayoutDashboard, desc: "Stage, what they want, and what's next." }],
    },
    {
      group: "Pipeline",
      items: [
        { key: "pipeline", label: "Stage & history", icon: GitBranch, desc: "Move through the pipeline; every move is logged." },
        { key: "source", label: "Source & attribution", icon: Megaphone, desc: "Where this lead came from." },
        { key: "lost", label: "Lost reason", icon: XCircle, desc: "Why this lead dropped out.", showIf: (i) => i.status === "Lost" },
      ],
    },
    {
      group: "Prospect",
      items: [
        { key: "contact", label: "Contact", icon: Contact, desc: "How to reach this prospect." },
        { key: "preferences", label: "Preferences", icon: SlidersHorizontal, desc: "Beds, budget, move-in, pets and areas." },
      ],
    },
    {
      group: "Leasing",
      items: [
        { key: "quotes", label: "Rent quotes", icon: Receipt, desc: "Quoted rent per unit and term, with expiry." },
        { key: "hold", label: "Unit hold", icon: Lock, desc: "A unit reserved for this prospect." },
        { key: "followups", label: "Follow-ups", icon: ListChecks, desc: "Tasks with due dates and channels." },
        { key: "showings", label: "Showings", icon: CalendarClock, desc: "Tours booked for this prospect." },
        { key: "applications", label: "Applications", icon: ClipboardList, desc: "Applications from this prospect." },
      ],
    },
    {
      group: "Files & history",
      items: [
        { key: "documents", label: "Documents", icon: FileText, desc: "Files shared with or by this prospect." },
        { key: "custom", label: "Custom Fields", icon: Tags, desc: "Fields defined in Settings → Custom Fields." },
        { key: "notes", label: "Notes", icon: StickyNote, desc: "Internal notes." },
        { key: "activity", label: "Activity", icon: Clock, desc: "Stage changes, edits and notes." },
      ],
    },
  ],
  sections: {
    overview: ProspectOverviewSection,
    pipeline: PipelineSection,
    source: makeFieldsSection(SOURCE_FIELDS),
    lost: makeFieldsSection(LOST_FIELDS),
    contact: makeAsyncFieldsSection(CONTACT_FIELDS, { agents: agentOptions }),
    preferences: makeFieldsSection(PREFERENCE_FIELDS),
    quotes: makeRecordItemsSection({
      kind: "quote",
      fields: QUOTE_FIELDS,
      singular: "Quote",
      plural: "Quotes",
      icon: Receipt,
      defaults: (i) => ({ unitId: i.unitId || "", unit: i.unit || "", amount: i.budget || "", termMonths: 12, startsOn: todayISO(), status: "Sent" }),
      emptyDescription: "Record the rent you quoted for a unit and term, with an expiry.",
      summary: (q) => {
        const expired = q.endsOn && isPast(q.endsOn) && !["Accepted", "Declined"].includes(q.status);
        return {
          title: q.unit || q.name,
          meta: [q.name, q.termMonths ? `${q.termMonths} mo` : null, q.concessions, q.endsOn ? `Expires ${formatDate(q.endsOn)}` : null].filter(Boolean).join(" · "),
          badge: expired ? "Expired" : q.status || "Sent",
          badgeVariant: expired ? "outline" : q.status === "Accepted" ? "success" : q.status === "Declined" ? "danger" : "info",
          aside: q.amount ? `${currency(q.amount)}/mo` : null,
        };
      },
    }),
    hold: UnitHoldSection,
    followups: makeRecordItemsSection({
      kind: "follow_up",
      fields: FOLLOW_UP_FIELDS,
      singular: "Follow-up",
      plural: "Follow-ups",
      icon: ListChecks,
      defaults: () => ({ startsOn: todayISO(), channel: "Call", status: "Open" }),
      emptyDescription: "Add a follow-up task with a due date so this lead doesn't go cold.",
      summary: (t) => {
        const overdue = t.status !== "Done" && t.startsOn && isPast(t.startsOn);
        return {
          title: t.name,
          meta: [t.channel, t.startsOn ? `Due ${formatDate(t.startsOn)}` : null, t.assignee].filter(Boolean).join(" · "),
          badge: t.status === "Done" ? "Done" : overdue ? "Overdue" : t.status || "Open",
          badgeVariant: t.status === "Done" ? "success" : overdue ? "warning" : "neutral",
        };
      },
    }),
    showings: ProspectShowingsSection,
    applications: ProspectApplicationsSection,
    documents: DocumentsSection,
    custom: makeCustomFieldsSection("prospects"),
    notes: makeNotesSection({ field: "notes", placeholder: "Internal notes on this prospect…" }),
    activity: ActivitySection,
  },
};

export function ProspectsScreen() {
  return <EntityListScreen config={prospectsConfig} />;
}

export default ProspectsScreen;
