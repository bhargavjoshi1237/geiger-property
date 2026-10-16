"use client";

import {
  LayoutDashboard,
  SquarePen,
  CalendarClock,
  HardHat,
  Flag,
  Clock3,
  Package,
  DollarSign,
  Camera,
  ListChecks,
  ClipboardCheck,
  FileText,
  UserRound,
  CheckCircle2,
  Clock,
  Settings,
  ArrowRightLeft,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/internal/shared/screen_kit";
import {
  FieldsForm,
  makeFieldsSection,
  makeOverviewSection,
  makeMetaListSection,
  makeNotesSection,
  makeUploadSection,
  makeChildListSection,
} from "@/components/internal/screens/entity/sections/factories";
import { propertyOptions, tenantOptions, unitOptions, vendorOptions } from "@/lib/supabase/options";
import { vendorAssignmentsLayer } from "@/lib/supabase/vendor_assignments";
import {
  MAINTENANCE_STATUS_MAP,
  REQUEST_STATUS_MAP,
  WORK_KIND_MAP,
  WORK_KIND_OPTIONS,
  PRIORITY_OPTIONS,
  CATEGORY_OPTIONS,
  selectOptions,
  currency,
  formatDate,
} from "./shared";

// The full right-hand editor for a work order (row = any maintenance record —
// work order, tenant request, or field visit) used by the merged Work Orders screen.

// Work orders have no unit/property name columns, so unit/property relations keep
// the `propertyLabel` display column in sync instead.
const unitLoader = async () =>
  ((await unitOptions()) ?? []).map((o) => ({
    value: o.value,
    label: o.label,
    patch: { propertyId: o.patch.propertyId, propertyLabel: o.label },
  }));

const propertyLoader = async () =>
  ((await propertyOptions()) ?? []).map((o) => ({
    value: o.value,
    label: o.label,
    patch: { propertyLabel: o.label },
  }));

const LOCATION_FIELDS = [
  { key: "unitId", label: "Unit", type: "relation", load: unitLoader, displayKey: "propertyLabel" },
  { key: "propertyId", label: "Property", type: "relation", load: propertyLoader },
  { key: "tenantId", label: "Tenant", type: "relation", load: tenantOptions, displayKey: "tenantName" },
];

export const workOrderNavGroups = [
  {
    group: null,
    items: [
      { key: "overview", label: "Overview", icon: LayoutDashboard, desc: "A snapshot of this work order." },
    ],
  },
  {
    group: "Work order",
    items: [
      { key: "details", label: "Details", icon: SquarePen, desc: "Summary, type, category, unit, and tenant." },
      { key: "schedule", label: "Schedule", icon: CalendarClock, desc: "When this work is planned." },
      { key: "assignment", label: "Assignment", icon: HardHat, desc: "Assigned vendor and technician." },
      { key: "vendorAssignments", label: "Vendor Assignments", icon: ClipboardCheck, desc: "Vendors dispatched to this job." },
      { key: "priority", label: "Priority & Status", icon: Flag, desc: "Priority, status, and category." },
    ],
  },
  {
    group: "Request",
    items: [
      { key: "requester", label: "Requester", icon: UserRound, desc: "Who reported it and how to reach them." },
      { key: "approval", label: "Approval", icon: CheckCircle2, desc: "Triage, approve, reject, or convert to a work order." },
    ],
  },
  {
    group: "Field",
    items: [
      { key: "checklist", label: "On-site Checklist", icon: ListChecks, desc: "Tasks for the technician on site." },
      { key: "fieldReport", label: "Field Report", icon: FileText, desc: "The technician's report from the visit." },
    ],
  },
  {
    group: "Costs & work",
    items: [
      { key: "labor", label: "Labor", icon: Clock3, desc: "Labor entries and hours." },
      { key: "materials", label: "Materials", icon: Package, desc: "Parts and materials used." },
      { key: "costs", label: "Costs", icon: DollarSign, desc: "Labor, materials, and total cost." },
    ],
  },
  {
    group: "Records",
    items: [
      { key: "photos", label: "Photos & Attachments", icon: Camera, desc: "Photos of the issue and the finished work." },
      { key: "timeline", label: "Timeline", icon: ListChecks, desc: "Key events and status changes." },
      { key: "activity", label: "Activity", icon: Clock, desc: "Notes and history." },
    ],
  },
  {
    group: "General",
    items: [
      { key: "settings", label: "Settings", icon: Settings, desc: "Type, status, and field visit." },
    ],
  },
];

const APPROVAL_FIELDS = [
  { key: "status", label: "Status", type: "select", options: selectOptions(REQUEST_STATUS_MAP) },
  { key: "priority", label: "Priority", type: "select", options: PRIORITY_OPTIONS },
  { key: "approvedBy", label: "Reviewed by", type: "text", meta: true },
  { key: "resolutionNotes", label: "Decision notes", type: "textarea", meta: true },
];

// Request triage; converting flips the same record to an open work order.
function ApprovalSection({ item, onPatch, onCommit }) {
  const isRequest = item.kind === "request";
  const convert = () => {
    onCommit({ kind: "work_order", status: "Open" });
    toast.success(`"${item.name}" converted to a work order.`);
  };
  return (
    <div className="space-y-4">
      <SectionCard
        title={isRequest ? "Convert to work order" : "Already a work order"}
        description={
          isRequest
            ? "Approve the request and turn it into an open work order you can dispatch."
            : "This record is a work order. Approval applies to tenant and staff requests."
        }
        action={
          isRequest ? (
            <Button
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={convert}
            >
              <ArrowRightLeft className="h-4 w-4" /> Convert
            </Button>
          ) : null
        }
      >
        <p className="text-sm text-text-secondary">
          Type: {WORK_KIND_MAP[item.kind]?.label || "Work order"}
        </p>
      </SectionCard>
      <FieldsForm item={item} fields={APPROVAL_FIELDS} onPatch={onPatch} onCommit={onCommit} />
    </div>
  );
}

export const workOrderSections = {
  overview: makeOverviewSection({
    fields: [
      { key: "kind", label: "Type", format: (v) => WORK_KIND_MAP[v]?.label || "Work order" },
      { key: "propertyLabel", label: "Property & Unit" },
      { key: "tenantName", label: "Tenant" },
      { key: "category", label: "Category" },
      { key: "priority", label: "Priority" },
      { key: "status", label: "Status" },
      { key: "vendorName", label: "Vendor" },
      { key: "technician", label: "Technician" },
      { key: "scheduledDate", label: "Scheduled", format: (v) => formatDate(v) },
      { key: "totalCost", label: "Total cost", format: (v) => currency(v) },
    ],
  }),
  details: makeFieldsSection([
    { key: "name", label: "Summary", type: "text", full: true },
    { key: "kind", label: "Type", type: "select", options: WORK_KIND_OPTIONS },
    { key: "category", label: "Category", type: "select", options: CATEGORY_OPTIONS },
    ...LOCATION_FIELDS,
    { key: "description", label: "Description", type: "textarea", meta: true },
  ]),
  schedule: makeFieldsSection([
    { key: "scheduledDate", label: "Scheduled date", type: "date" },
    { key: "dueDate", label: "Due date", type: "date", meta: true },
    { key: "arrivalWindow", label: "Arrival window", type: "text", meta: true, placeholder: "e.g. 9am–12pm" },
    { key: "estimatedHours", label: "Estimated hours", type: "number", meta: true },
    { key: "accessNotes", label: "Access notes", type: "textarea", meta: true },
  ]),
  assignment: makeFieldsSection([
    { key: "vendorId", label: "Assigned vendor", type: "relation", load: vendorOptions, displayKey: "vendorName" },
    { key: "technician", label: "Assigned technician", type: "text" },
    { key: "technicianPhone", label: "Technician phone", type: "text", meta: true },
    { key: "crew", label: "Crew", type: "text", meta: true },
    { key: "assignmentNotes", label: "Assignment notes", type: "textarea", meta: true },
  ]),
  vendorAssignments: makeChildListSection({
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
  priority: makeFieldsSection([
    { key: "priority", label: "Priority", type: "select", options: PRIORITY_OPTIONS },
    { key: "status", label: "Status", type: "select", options: selectOptions(MAINTENANCE_STATUS_MAP) },
    { key: "category", label: "Category", type: "select", options: CATEGORY_OPTIONS },
  ]),
  requester: makeFieldsSection([
    { key: "requestedBy", label: "Requested by", type: "text", meta: true },
    { key: "requesterContact", label: "Contact", type: "text", meta: true },
    { key: "submittedDate", label: "Submitted date", type: "date", meta: true },
    { key: "preferredTime", label: "Preferred time", type: "text", meta: true },
    { key: "permissionToEnter", label: "Permission to enter", type: "switch", meta: true },
  ]),
  approval: ApprovalSection,
  checklist: makeMetaListSection({
    field: "checklist",
    singular: "task",
    icon: ListChecks,
    primaryPlaceholder: "e.g. Photograph unit condition",
    check: true,
  }),
  fieldReport: makeNotesSection({ field: "fieldReport", placeholder: "The technician's on-site report…" }),
  labor: makeMetaListSection({
    field: "labor",
    singular: "labor entry",
    icon: Clock3,
    primaryPlaceholder: "e.g. Diagnose leak",
    secondary: { key: "hours", label: "Hours", type: "number", placeholder: "0" },
  }),
  materials: makeMetaListSection({
    field: "materials",
    singular: "material",
    icon: Package,
    primaryPlaceholder: "e.g. Faucet cartridge",
    secondary: { key: "cost", label: "Cost", type: "number", placeholder: "0" },
  }),
  costs: makeFieldsSection([
    { key: "laborCost", label: "Labor cost", type: "number" },
    { key: "materialCost", label: "Materials cost", type: "number" },
    { key: "totalCost", label: "Total cost", type: "number" },
  ]),
  photos: makeUploadSection({ field: "photos", ownerType: "work_order", singular: "photo" }),
  timeline: makeMetaListSection({
    field: "timeline",
    singular: "event",
    icon: ListChecks,
    primaryPlaceholder: "e.g. Vendor dispatched",
    secondary: { key: "date", label: "Date", type: "text", placeholder: "When" },
  }),
  activity: makeNotesSection({ field: "activityNotes", placeholder: "Log a note about this work order…" }),
  settings: makeFieldsSection([
    { key: "kind", label: "Type", type: "select", options: WORK_KIND_OPTIONS },
    { key: "status", label: "Status", type: "select", options: selectOptions(MAINTENANCE_STATUS_MAP) },
    { key: "priority", label: "Priority", type: "select", options: PRIORITY_OPTIONS },
    { key: "isField", label: "Field / mobile visit", type: "switch", hint: "Shows this job in the Field view." },
  ]),
};
