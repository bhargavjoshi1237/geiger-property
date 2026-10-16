"use client";

import {
  LayoutDashboard,
  SquarePen,
  MapPin,
  KeyRound,
  HardHat,
  ClipboardCheck,
  Inbox,
  BadgeCheck,
  Share2,
  FileSpreadsheet,
  DollarSign,
  Receipt,
  ListChecks,
  Clock3,
  Package,
  FileText,
  CircleCheckBig,
  Star,
  UserRound,
  History,
  Camera,
  Link2,
  FolderOpen,
  Clock,
  NotebookPen,
  SlidersHorizontal,
  Settings,
} from "lucide-react";

import {
  makeCustomFieldsSection,
  makeFieldsSection,
  makeMetaListSection,
  makeNotesSection,
  makeChildListSection,
} from "@/components/internal/screens/entity/sections/factories";
import { makeRecordItemsSection } from "@/components/internal/screens/entity/sections/child_records";
import { ActivitySection, DocumentsSection } from "@/components/internal/screens/entity/shared_sections";
import { FieldsForm } from "@/components/internal/screens/entity/fields_form";
import { vendorOptions } from "@/lib/supabase/options";
import { vendorAssignmentsLayer } from "@/lib/supabase/vendor_assignments";
import {
  ESTIMATE_STATUS_OPTIONS,
  ESTIMATE_STATUS_VARIANT,
  MAINTENANCE_STATUS_MAP,
  PRIORITY_OPTIONS,
  WORK_KIND_OPTIONS,
  formatDate,
  money,
  selectOptions,
  todayString,
} from "./shared";
import { AssignmentSection, DetailsSection, EntrySection, LocationSection } from "./sections/wo_general";
import { ApprovalSection, SharingSection, TriageSection } from "./sections/wo_approval";
import { BillingSection, CostsSection } from "./sections/wo_costs";
import {
  CompletionSection,
  FeedbackSection,
  MaterialsSection,
  PhotosSection,
  RelatedSection,
  TimelineSection,
} from "./sections/wo_execution";
import { WorkOrderOverview } from "./sections/wo_overview";
import { withStatusHistory } from "./sections/wo_shared";

// The full right-hand editor for a work order (row = any maintenance record —
// work order, tenant request, or field visit) used by the merged Work Orders screen.

const isRequestLike = (i) => i.kind === "request" || i.metadata?.source === "tenant";

export const workOrderNavGroups = [
  {
    group: null,
    items: [{ key: "overview", label: "Overview", icon: LayoutDashboard, desc: "Status, cost, approval and the next step." }],
  },
  {
    group: "Work order",
    items: [
      { key: "details", label: "Details", icon: SquarePen, desc: "Summary, category, priority, source and due date." },
      { key: "location", label: "Location", icon: MapPin, desc: "Property, unit, tenant, room and equipment." },
      { key: "entry", label: "Entry & Access", icon: KeyRound, desc: "Permission to enter, keys, codes, pets and preferred times." },
      { key: "requester", label: "Requester", icon: UserRound, desc: "Who reported it and how to reach them.", showIf: isRequestLike },
      { key: "triage", label: "Request Triage", icon: Inbox, desc: "Review the request and convert it to a work order.", showIf: (i) => i.kind === "request" },
    ],
  },
  {
    group: "Dispatch",
    items: [
      { key: "assignment", label: "Assignment & Schedule", icon: HardHat, desc: "Vendor, technician, visit window and terms." },
      { key: "dispatch", label: "Dispatch History", icon: ClipboardCheck, desc: "Vendors dispatched to this job." },
      { key: "approval", label: "Owner Approval", icon: BadgeCheck, desc: "Sign-off above the property's approval limit." },
      { key: "sharing", label: "Sharing", icon: Share2, desc: "What the owner and tenant can see." },
    ],
  },
  {
    group: "Money",
    items: [
      { key: "estimates", label: "Estimates", icon: FileSpreadsheet, desc: "Vendor quotes for this job." },
      { key: "costs", label: "Costs", icon: DollarSign, desc: "Labor, materials and trip line items." },
      { key: "billing", label: "Billing", icon: Receipt, desc: "Tenant chargeback, owner billing and vendor bills." },
    ],
  },
  {
    group: "On site",
    items: [
      { key: "checklist", label: "Checklist", icon: ListChecks, desc: "Tasks for the technician on site." },
      { key: "labor", label: "Time Log", icon: Clock3, desc: "Labor entries and hours." },
      { key: "materials", label: "Materials Used", icon: Package, desc: "Parts from inventory used on this job." },
      { key: "fieldReport", label: "Field Report", icon: FileText, desc: "The technician's report from the visit." },
      { key: "photos", label: "Photos", icon: Camera, desc: "Before and after photos." },
    ],
  },
  {
    group: "Close-out",
    items: [
      { key: "completion", label: "Completion", icon: CircleCheckBig, desc: "Resolution, hours, root cause and sign-off." },
      { key: "feedback", label: "Tenant Feedback", icon: Star, desc: "How the resident rated the job." },
    ],
  },
  {
    group: "Files & history",
    items: [
      { key: "timeline", label: "Timeline", icon: History, desc: "Every status change, plus other events." },
      { key: "related", label: "Related Records", icon: Link2, desc: "Linked records and the unit's other work orders." },
      { key: "documents", label: "Documents", icon: FolderOpen, desc: "Invoices, quotes, manuals and other files." },
      { key: "activity", label: "Activity", icon: Clock, desc: "Changes and notes on this work order." },
      { key: "notes", label: "Internal Notes", icon: NotebookPen, desc: "Private notes for your team." },
    ],
  },
  {
    group: "Settings",
    items: [
      { key: "customFields", label: "Custom Fields", icon: SlidersHorizontal, desc: "Fields defined in Settings → Custom Fields." },
      { key: "settings", label: "Settings", icon: Settings, desc: "Type, status, field visit and tags." },
    ],
  },
];

const meta = (field) => ({ ...field, meta: true });

const TAG_OPTIONS = ["Warranty", "Insurance claim", "Capital expense", "Recurring", "Turn", "Emergency", "Owner request"].map(
  (v) => ({ value: v, label: v }),
);

const SETTINGS_FIELDS = [
  { key: "kind", label: "Type", type: "select", options: WORK_KIND_OPTIONS },
  { key: "status", label: "Status", type: "select", options: selectOptions(MAINTENANCE_STATUS_MAP) },
  { key: "priority", label: "Priority", type: "select", options: PRIORITY_OPTIONS },
  { key: "isField", label: "Field / mobile visit", type: "switch", hint: "Shows this job in the Field view." },
  meta({ key: "tags", label: "Tags", type: "multiselect", options: TAG_OPTIONS }),
  meta({ key: "autoCloseDays", label: "Auto-close after (days)", type: "number", min: 0, hint: "Reminder to close completed jobs." }),
  meta({ key: "internalOnly", label: "Internal only", type: "switch", hint: "Never shown in owner or tenant portals." }),
  meta({ key: "excludeFromReports", label: "Exclude from reports", type: "switch" }),
];

// Status edits here record history like the header actions do.
function SettingsSection({ item, onPatch, onCommit, onCommitMeta }) {
  return (
    <FieldsForm
      item={item}
      fields={SETTINGS_FIELDS}
      onPatch={onPatch}
      onCommit={withStatusHistory(item, onCommit)}
      onCommitMeta={onCommitMeta}
    />
  );
}

export const workOrderSections = {
  overview: WorkOrderOverview,
  details: DetailsSection,
  location: LocationSection,
  entry: EntrySection,
  requester: makeFieldsSection([
    meta({ key: "requestedBy", label: "Requested by", type: "text" }),
    meta({ key: "requesterContact", label: "Contact", type: "text" }),
    meta({ key: "submittedDate", label: "Submitted on", type: "date" }),
    meta({ key: "preferredTime", label: "Preferred time", type: "text" }),
    meta({ key: "permissionToEnter", label: "Permission to enter", type: "switch" }),
    meta({ key: "requestNotes", label: "Request in their words", type: "textarea" }),
  ]),
  triage: TriageSection,
  assignment: AssignmentSection,
  dispatch: makeChildListSection({
    data: {
      list: (id) => vendorAssignmentsLayer.list({ workOrderId: id }),
      create: vendorAssignmentsLayer.create,
      softDelete: vendorAssignmentsLayer.softDelete,
    },
    parentKey: "workOrderId",
    singular: "assignment",
    icon: HardHat,
    fields: [
      { key: "name", placeholder: "Scope, e.g. Replace water heater" },
      { key: "vendorId", type: "relation", load: vendorOptions, displayKey: "vendorName", placeholder: "Vendor" },
    ],
  }),
  approval: ApprovalSection,
  sharing: SharingSection,
  estimates: makeRecordItemsSection({
    kind: "estimate",
    singular: "Estimate",
    plural: "Estimates",
    icon: FileSpreadsheet,
    emptyDescription: "Record vendor quotes and mark the one you accept.",
    defaults: (i) => ({ vendorId: i.vendorId || "", vendorName: i.vendorName || "", status: "Received", startsOn: todayString() }),
    fields: [
      { key: "name", label: "Scope", type: "text", required: true, full: true },
      { key: "vendorId", label: "Vendor", type: "relation", load: vendorOptions, displayKey: "vendorName" },
      { key: "amount", label: "Amount", type: "currency", required: true },
      { key: "status", label: "Status", type: "select", options: ESTIMATE_STATUS_OPTIONS },
      { key: "startsOn", label: "Received on", type: "date" },
      { key: "endsOn", label: "Valid until", type: "date" },
      { key: "accepted", label: "Accepted", type: "switch" },
      { key: "notes", label: "Notes", type: "textarea" },
    ],
    summary: (r) => {
      const status = r.metadata?.accepted ? "Accepted" : r.status || "Received";
      return {
        title: r.name,
        meta: [r.metadata?.vendorName, r.startsOn && `Received ${formatDate(r.startsOn)}`, r.endsOn && `Valid to ${formatDate(r.endsOn)}`]
          .filter(Boolean)
          .join(" · "),
        badge: status,
        badgeVariant: ESTIMATE_STATUS_VARIANT[status] || "neutral",
        aside: money(r.amount),
      };
    },
  }),
  costs: CostsSection,
  billing: BillingSection,
  checklist: makeMetaListSection({
    field: "checklist",
    singular: "task",
    icon: ListChecks,
    primaryPlaceholder: "e.g. Photograph unit condition",
    check: true,
  }),
  labor: makeMetaListSection({
    field: "labor",
    singular: "labor entry",
    icon: Clock3,
    primaryPlaceholder: "e.g. Diagnose leak",
    secondary: { key: "hours", label: "Hours", type: "number", placeholder: "Hours" },
  }),
  materials: MaterialsSection,
  fieldReport: makeNotesSection({ field: "fieldReport", placeholder: "The technician's on-site report…" }),
  photos: PhotosSection,
  completion: CompletionSection,
  feedback: FeedbackSection,
  timeline: TimelineSection,
  related: RelatedSection,
  documents: DocumentsSection,
  activity: ActivitySection,
  notes: makeNotesSection({ field: "activityNotes", placeholder: "Private notes about this work order…" }),
  customFields: makeCustomFieldsSection("work_orders"),
  settings: SettingsSection,
};
