"use client";

import { toast } from "sonner";
import {
  LayoutDashboard,
  SquarePen,
  MessageSquareText,
  Clock,
  CalendarClock,
  CalendarDays,
  KeyRound,
  MonitorPlay,
  Flag,
  History,
  ClipboardList,
  FileText,
  StickyNote,
  CheckCircle2,
  BadgeCheck,
  UserX,
  XCircle,
  CalendarSync,
} from "lucide-react";

import { StatusPill } from "@/components/internal/shared/screen_kit";
import { Badge } from "@/components/ui/badge";
import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { DocumentsSection, ActivitySection } from "@/components/internal/screens/entity/shared_sections";
import { makeFieldsSection, makeNotesSection } from "@/components/internal/screens/entity/sections/factories";
import { showingsLayer } from "@/lib/supabase/showings";
import {
  agentOptions,
  listingOptions,
  marketingUnitOptions,
  prospectContactOptions,
} from "@/lib/supabase/marketing_options";
import {
  AccessCodeSection,
  ShowingApplicationsSection,
  ShowingOverviewSection,
  ShowingProspectHistorySection,
  newAccessPatch,
} from "./sections/showing_sections";
import { OWNER, advanceProspect, loadFunnel } from "./flows";
import {
  CANCEL_REASON_OPTIONS,
  DURATION_OPTIONS,
  INTEREST_OPTIONS,
  SHOWING_OPEN,
  SHOWING_OUTCOME_OPTIONS,
  SHOWING_STATUS_MAP,
  SHOWING_TYPE_OPTIONS,
  filterOptions,
  formatDate,
  pct,
  selectOptions,
  todayISO,
  toOptions,
} from "./shared";

// Showings — scheduled tours (owns `property.showings`): schedule, agent,
// in-person / self-guided (generated access code) / virtual, feedback and
// outcome, with Complete / No-show / Cancel / Reschedule actions.

const funnel = { value: null };

const day = (r) => String(r.showingDate || "").slice(0, 10);
const isUpcoming = (r) => SHOWING_OPEN.includes(r.status) && (!r.showingDate || day(r) >= todayISO());
const isToday = (r) => SHOWING_OPEN.includes(r.status) && day(r) === todayISO();
const isOverdue = (r) => SHOWING_OPEN.includes(r.status) && r.showingDate && day(r) < todayISO();

const when = (r) =>
  r.showingDate ? [formatDate(r.showingDate), r.showingTime].filter(Boolean).join(" · ") : "Not scheduled";

const selfGuided = (i) => i.showingType === "Self-guided";
const virtual = (i) => i.showingType === "Virtual";

const DETAILS_FIELDS = [
  { key: "name", label: "Showing title", type: "text", full: true, required: true },
  { key: "prospectId", label: "Prospect", type: "relation", load: prospectContactOptions, displayKey: "prospectName" },
  { key: "prospectContact", label: "Prospect contact", type: "text" },
  { key: "unitId", label: "Unit", type: "relation", load: marketingUnitOptions, displayKey: "unit" },
  { key: "listingId", label: "Listing", type: "relation", load: listingOptions, displayKey: "listingName" },
  { key: "propertyName", label: "Property", type: "readonly" },
  { key: "showingType", label: "Tour type", type: "select", options: SHOWING_TYPE_OPTIONS },
  { key: "status", label: "Status", type: "select", options: selectOptions(SHOWING_STATUS_MAP) },
  { key: "partySize", label: "Party size", type: "number", meta: true, min: 1 },
  { key: "specialRequests", label: "Special requests", type: "textarea", meta: true },
];

const SCHEDULE_FIELDS = [
  { key: "showingDate", label: "Date", type: "date", required: true },
  { key: "showingTime", label: "Start time", type: "time" },
  { key: "durationMinutes", label: "Duration", type: "select", options: DURATION_OPTIONS },
  { key: "agent", label: "Agent", type: "relation", load: agentOptions, displayKey: "agent", showIf: (i) => !selfGuided(i) },
  { key: "meetingPoint", label: "Meeting point", type: "text", meta: true, showIf: (i) => !virtual(i) },
  { key: "confirmationSent", label: "Confirmation sent", type: "switch", meta: true },
  { key: "reminderSent", label: "Reminder sent", type: "switch", meta: true },
  { key: "residentNotified", label: "Current resident notified", type: "switch", meta: true, hint: "When the unit is occupied." },
  { key: "scheduleNotes", label: "Scheduling notes", type: "textarea", meta: true },
];

const VIRTUAL_FIELDS = [
  { key: "platform", label: "Platform", type: "select", meta: true, options: toOptions(["Zoom", "Google Meet", "FaceTime", "WhatsApp", "Teams", "Other"]) },
  { key: "meetingLink", label: "Meeting link", type: "url", meta: true },
  { key: "recordingUrl", label: "Recording link", type: "url", meta: true },
  { key: "virtualNotes", label: "Notes", type: "textarea", meta: true },
];

const FEEDBACK_FIELDS = [
  { key: "interest", label: "Interest level", type: "select", meta: true, options: INTEREST_OPTIONS },
  { key: "rating", label: "Unit rating (1–5)", type: "number", meta: true, min: 1, max: 5 },
  { key: "priceReaction", label: "Price reaction", type: "select", meta: true, options: toOptions(["Good value", "Fair", "Too high"]) },
  { key: "liked", label: "Liked", type: "text", meta: true },
  { key: "concerns", label: "Concerns", type: "text", meta: true },
  { key: "feedback", label: "Feedback", type: "textarea", placeholder: "What did they like or dislike?" },
];

const OUTCOME_FIELDS = [
  { key: "outcome", label: "Outcome", type: "select", meta: true, options: SHOWING_OUTCOME_OPTIONS },
  { key: "nextStep", label: "Next step", type: "text", meta: true },
  { key: "followUpNeeded", label: "Follow-up needed", type: "switch", meta: true },
  { key: "followUpOn", label: "Follow up on", type: "date", meta: true, showIf: (i) => Boolean(i.metadata?.followUpNeeded ?? i.followUpNeeded) },
  { key: "completedAt", label: "Completed", type: "readonly", meta: true, format: (v) => formatDate(v) },
  { key: "cancelReason", label: "Cancellation reason", type: "select", meta: true, options: CANCEL_REASON_OPTIONS, showIf: (i) => i.status === "Cancelled" },
  { key: "noShowNotes", label: "No-show notes", type: "textarea", meta: true, showIf: (i) => i.status === "No-show" },
];

const showingsConfig = {
  key: OWNER.showing,
  singular: "Showing",
  plural: "Showings",
  title: "Showings",
  description:
    "Schedule and run unit tours — in-person, self-guided with an access code, or virtual — and capture feedback and outcomes.",
  icon: CalendarClock,
  titleField: "name",
  searchFields: ["name", "prospectName", "unit", "agent", "listingName"],
  data: showingsLayer.data,
  rowsLoader: async () => {
    const [rows, f] = await Promise.all([showingsLayer.list(), loadFunnel()]);
    funnel.value = f;
    return (rows ?? []).sort((a, b) => `${day(a)} ${a.showingTime}`.localeCompare(`${day(b)} ${b.showingTime}`));
  },

  statusMap: SHOWING_STATUS_MAP,
  statusFilterOptions: filterOptions(SHOWING_STATUS_MAP),

  views: [
    { value: "upcoming", label: "Upcoming", filter: isUpcoming },
    { value: "today", label: "Today", filter: isToday },
    { value: "overdue", label: "Needs outcome", filter: isOverdue },
    { value: "selfGuided", label: "Self-guided", filter: (r) => selfGuided(r) },
    { value: "past", label: "Past", filter: (r) => !isUpcoming(r) },
    { value: "all", label: "All", filter: () => true },
  ],

  columns: [
    {
      key: "name",
      header: "Showing",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="text-xs text-text-secondary">
            {[r.prospectName, r.unit].filter(Boolean).join(" · ") || "No prospect linked"}
          </span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusPill status={r.status} map={SHOWING_STATUS_MAP} />,
    },
    {
      key: "showingType",
      header: "Type",
      render: (r) =>
        r.showingType ? (
          <Badge variant="neutral">{r.showingType}</Badge>
        ) : (
          <span className="text-text-tertiary">—</span>
        ),
    },
    {
      key: "agent",
      header: "Agent",
      className: "text-sm text-text-secondary",
      render: (r) => r.agent || (selfGuided(r) ? "Self-guided" : "—"),
    },
    {
      key: "interest",
      header: "Interest",
      className: "text-sm text-text-secondary",
      render: (r) => r.metadata?.interest || "—",
    },
    {
      key: "showingDate",
      header: "When",
      align: "right",
      className: "text-right text-sm text-muted-foreground",
      render: (r) => (
        <span className={isOverdue(r) ? "text-amber-700 dark:text-amber-400" : undefined}>{when(r)}</span>
      ),
    },
  ],

  stats: (rows) => {
    const completed = rows.filter((r) => r.status === "Completed").length;
    const noShow = rows.filter((r) => r.status === "No-show").length;
    const f = funnel.value;
    return [
      { label: "Upcoming", value: String(rows.filter(isUpcoming).length), footer: `${rows.filter(isToday).length} today` },
      { label: "Completed", value: String(completed), footer: `${rows.filter(isOverdue).length} need an outcome` },
      { label: "Show rate", value: pct(completed, completed + noShow), footer: `${noShow} no-show${noShow === 1 ? "" : "s"}` },
      { label: "Tour → application", value: f ? pct(f.applications, f.toured) : "—", footer: f ? `${f.toured} toured · ${f.applications} applied` : "Leasing funnel" },
    ];
  },

  createDraft: { name: "", prospectId: "", unitId: "", showingDate: "", showingTime: "", showingType: "In-person" },
  createFields: [
    { key: "name", label: "Showing title", type: "text", placeholder: "e.g. Jordan Blake · Maple Court 4B" },
    {
      key: "prospectId",
      label: "Prospect",
      type: "select",
      optionsFrom: "prospects",
      placeholder: "Select a prospect…",
      emptyLabel: "No prospects yet",
    },
    {
      key: "unitId",
      label: "Unit",
      type: "select",
      optionsFrom: "units",
      placeholder: "Select a unit…",
      emptyLabel: "No units yet",
    },
    { key: "showingDate", label: "Date", type: "date" },
    { key: "showingType", label: "Type", type: "select", options: SHOWING_TYPE_OPTIONS },
  ],
  loadCreateOptions: async () => {
    const [prospects, units] = await Promise.all([prospectContactOptions(), marketingUnitOptions()]);
    return { prospects, units };
  },
  newRow: (draft) => ({
    name: draft.name.trim(),
    prospectId: draft.prospectId || "",
    prospectName: draft.prospectName || "",
    prospectContact: draft.prospectContact || "",
    unitId: draft.unitId || "",
    unit: draft.unit || "",
    propertyId: draft.propertyId || "",
    propertyName: draft.propertyName || "",
    showingDate: draft.showingDate || "",
    showingType: draft.showingType || "In-person",
    durationMinutes: 30,
    status: "Scheduled",
  }),

  headerMeta: (r) => [r.prospectName, r.unit, r.showingDate ? when(r) : null, r.showingType].filter(Boolean).join(" · "),

  actions: [
    {
      key: "confirm",
      label: "Confirm",
      icon: BadgeCheck,
      showIf: (i) => i.status === "Scheduled",
      run: async (ctx) => {
        if (!(await ctx.commit({ status: "Confirmed" }))) return;
        await ctx.commitMeta({ confirmedAt: new Date().toISOString(), confirmationSent: true });
        toast.success("Showing confirmed.");
      },
    },
    {
      key: "accessCode",
      label: "Generate access code",
      icon: KeyRound,
      showIf: (i) => selfGuided(i) && SHOWING_OPEN.includes(i.status),
      run: async (ctx) => {
        const patch = newAccessPatch(ctx.item);
        if (await ctx.commitMeta(patch)) {
          ctx.log("Generated a self-guided access code");
          toast.success(`Access code ${patch.accessCode} generated.`);
          ctx.navigate("access");
        }
      },
    },
    {
      key: "complete",
      label: "Complete",
      icon: CheckCircle2,
      showIf: (i) => SHOWING_OPEN.includes(i.status) || i.status === "No-show",
      wizard: {
        title: "Complete showing",
        description: "Record how the tour went. The prospect moves to Toured.",
        initial: (i) => ({ interest: i.metadata?.interest || "", feedback: i.feedback || "", outcome: i.metadata?.outcome || "" }),
        steps: [
          {
            key: "feedback",
            title: "Feedback",
            fields: [
              { key: "interest", label: "Interest level", type: "select", options: INTEREST_OPTIONS, required: true },
              { key: "outcome", label: "Outcome", type: "select", options: SHOWING_OUTCOME_OPTIONS, required: true },
              { key: "feedback", label: "Feedback", type: "textarea" },
              { key: "followUpOn", label: "Follow up on", type: "date" },
            ],
          },
        ],
        finishLabel: "Complete",
        logSummary: "Completed showing",
        finish: async (v, ctx) => {
          const ok = await ctx.commit({ status: "Completed", feedback: v.feedback || "" });
          if (!ok) return false;
          await ctx.commitMeta({
            interest: v.interest,
            outcome: v.outcome,
            completedAt: todayISO(),
            ...(v.followUpOn ? { followUpNeeded: true, followUpOn: v.followUpOn } : {}),
            ...(ctx.item.metadata?.accessCode && ctx.item.metadata?.accessCodeStatus === "Active" ? { accessCodeStatus: "Expired" } : {}),
          });
          if (ctx.item.prospectId) await advanceProspect(ctx.item.prospectId, "Toured", `Toured ${ctx.item.unit || ""}`.trim());
          toast.success("Showing completed.");
          return true;
        },
      },
    },
    {
      key: "reschedule",
      label: "Reschedule",
      icon: CalendarSync,
      showIf: (i) => i.status !== "Completed",
      wizard: {
        title: "Reschedule showing",
        initial: (i) => ({ showingDate: i.showingDate || "", showingTime: i.showingTime || "", reason: "" }),
        steps: [
          {
            key: "when",
            title: "New time",
            fields: [
              { key: "showingDate", label: "Date", type: "date", required: true },
              { key: "showingTime", label: "Time", type: "time", required: true },
              { key: "reason", label: "Reason", type: "text" },
            ],
            validate: (v) => (v.showingDate < todayISO() ? "Pick a date from today on." : null),
          },
        ],
        finishLabel: "Reschedule",
        logSummary: "Rescheduled showing",
        finish: async (v, ctx) => {
          const prev = [ctx.item.showingDate, ctx.item.showingTime].filter(Boolean).join(" ");
          const ok = await ctx.commit({ showingDate: v.showingDate, showingTime: v.showingTime, status: "Scheduled" });
          if (!ok) return false;
          const history = Array.isArray(ctx.item.metadata?.reschedules) ? ctx.item.metadata.reschedules : [];
          await ctx.commitMeta({
            reschedules: [...history, { from: prev, to: `${v.showingDate} ${v.showingTime}`, reason: v.reason || "", at: new Date().toISOString() }],
            ...(ctx.item.metadata?.accessCode ? { accessCodeStatus: "Revoked" } : {}),
          });
          toast.success(`Rescheduled to ${formatDate(v.showingDate)} ${v.showingTime}.`);
          return true;
        },
      },
    },
    {
      key: "noShow",
      label: "Mark no-show",
      icon: UserX,
      separatorBefore: true,
      showIf: (i) => SHOWING_OPEN.includes(i.status),
      run: async (ctx) => {
        if (!(await ctx.commit({ status: "No-show" }))) return;
        await ctx.commitMeta({
          noShowAt: new Date().toISOString(),
          ...(ctx.item.metadata?.accessCode ? { accessCodeStatus: "Revoked" } : {}),
        });
        toast.success("Marked as no-show.");
      },
    },
    {
      key: "cancel",
      label: "Cancel showing",
      icon: XCircle,
      danger: true,
      showIf: (i) => SHOWING_OPEN.includes(i.status),
      wizard: {
        title: "Cancel showing",
        initial: () => ({ cancelReason: "" }),
        steps: [
          {
            key: "reason",
            title: "Reason",
            fields: [
              { key: "cancelReason", label: "Reason", type: "select", options: CANCEL_REASON_OPTIONS, required: true },
              { key: "cancelNotes", label: "Notes", type: "textarea" },
            ],
          },
        ],
        finishLabel: "Cancel Showing",
        logSummary: "Cancelled showing",
        finish: async (v, ctx) => {
          if (!(await ctx.commit({ status: "Cancelled" }))) return false;
          await ctx.commitMeta({
            cancelReason: v.cancelReason,
            cancelNotes: v.cancelNotes || "",
            cancelledAt: new Date().toISOString(),
            ...(ctx.item.metadata?.accessCode ? { accessCodeStatus: "Revoked" } : {}),
          });
          toast.success("Showing cancelled.");
          return true;
        },
      },
    },
  ],

  navGroups: [
    {
      group: null,
      items: [{ key: "overview", label: "Overview", icon: LayoutDashboard, desc: "A snapshot of this showing." }],
    },
    {
      group: "Showing",
      items: [
        { key: "details", label: "Details", icon: SquarePen, desc: "Who and which unit." },
        { key: "schedule", label: "Schedule & agent", icon: CalendarDays, desc: "When, how long, and who's giving the tour." },
        { key: "access", label: "Self-guided access", icon: KeyRound, desc: "Generated access code and its valid window.", showIf: selfGuided },
        { key: "virtual", label: "Virtual tour", icon: MonitorPlay, desc: "Meeting link and platform.", showIf: virtual },
      ],
    },
    {
      group: "Result",
      items: [
        { key: "feedback", label: "Feedback", icon: MessageSquareText, desc: "How the tour went." },
        { key: "outcome", label: "Outcome", icon: Flag, desc: "What happens next." },
      ],
    },
    {
      group: "Related",
      items: [
        { key: "history", label: "Prospect's other tours", icon: History, desc: "Other showings for this prospect." },
        { key: "applications", label: "Applications", icon: ClipboardList, desc: "Applications from this prospect." },
      ],
    },
    {
      group: "Files & history",
      items: [
        { key: "documents", label: "Documents", icon: FileText, desc: "Files for this showing." },
        { key: "notes", label: "Notes", icon: StickyNote, desc: "Internal notes." },
        { key: "activity", label: "Activity", icon: Clock, desc: "Changes and notes." },
      ],
    },
  ],
  sections: {
    overview: ShowingOverviewSection,
    details: makeFieldsSection(DETAILS_FIELDS),
    schedule: makeFieldsSection(SCHEDULE_FIELDS),
    access: AccessCodeSection,
    virtual: makeFieldsSection(VIRTUAL_FIELDS),
    feedback: makeFieldsSection(FEEDBACK_FIELDS),
    outcome: makeFieldsSection(OUTCOME_FIELDS),
    history: ShowingProspectHistorySection,
    applications: ShowingApplicationsSection,
    documents: DocumentsSection,
    notes: makeNotesSection({ field: "notes", placeholder: "Internal notes on this showing…" }),
    activity: ActivitySection,
  },
};

export function ShowingsScreen() {
  return <EntityListScreen config={showingsConfig} />;
}

export default ShowingsScreen;
