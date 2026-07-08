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
  FileText,
  Clock,
  Settings,
} from "lucide-react";

import {
  makeFieldsSection,
  makeOverviewSection,
  makeMetaListSection,
  makeNotesSection,
} from "@/components/internal/screens/entity/sections/factories";
import {
  WORK_ORDER_STATUS_MAP,
  PRIORITY_OPTIONS,
  CATEGORY_OPTIONS,
  selectOptions,
  currency,
  formatDate,
} from "./shared";

// The full, tailored right-hand editor for a work order (row = a maintenance
// record). Shared by All Maintenance and the Work Orders lens so both open the
// same rich editor. Composed entirely from the shared section factories.

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
      { key: "details", label: "Details", icon: SquarePen, desc: "Summary, category, property, and tenant." },
      { key: "schedule", label: "Schedule", icon: CalendarClock, desc: "When this work is planned." },
      { key: "assignment", label: "Assignment", icon: HardHat, desc: "Assigned vendor and technician." },
      { key: "priority", label: "Priority & Status", icon: Flag, desc: "Priority, status, and category." },
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
      { key: "photos", label: "Photos & Attachments", icon: Camera, desc: "Images and files for this job." },
      { key: "timeline", label: "Timeline", icon: ListChecks, desc: "Key events and status changes." },
      { key: "documents", label: "Documents", icon: FileText, desc: "Invoices, quotes, and paperwork." },
      { key: "activity", label: "Activity", icon: Clock, desc: "Notes and history." },
    ],
  },
  {
    group: "General",
    items: [
      { key: "settings", label: "Settings", icon: Settings, desc: "Status and configuration." },
    ],
  },
];

export const workOrderSections = {
  overview: makeOverviewSection({
    fields: [
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
    { key: "category", label: "Category", type: "select", options: CATEGORY_OPTIONS },
    { key: "propertyLabel", label: "Property & Unit", type: "text" },
    { key: "tenantName", label: "Tenant", type: "text" },
    { key: "description", label: "Description", type: "textarea", meta: true },
  ]),
  schedule: makeFieldsSection([
    { key: "scheduledDate", label: "Scheduled date", type: "date" },
    { key: "dueDate", label: "Due date", type: "date", meta: true },
    { key: "estimatedHours", label: "Estimated hours", type: "number", meta: true },
    { key: "accessNotes", label: "Access notes", type: "textarea", meta: true },
  ]),
  assignment: makeFieldsSection([
    { key: "vendorName", label: "Assigned vendor", type: "text" },
    { key: "technician", label: "Assigned technician", type: "text" },
    { key: "assignmentNotes", label: "Assignment notes", type: "textarea", meta: true },
  ]),
  priority: makeFieldsSection([
    { key: "priority", label: "Priority", type: "select", options: PRIORITY_OPTIONS },
    { key: "status", label: "Status", type: "select", options: selectOptions(WORK_ORDER_STATUS_MAP) },
    { key: "category", label: "Category", type: "select", options: CATEGORY_OPTIONS },
  ]),
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
  photos: makeMetaListSection({
    field: "photos",
    singular: "attachment",
    icon: Camera,
    primaryPlaceholder: "Attachment name or URL",
  }),
  timeline: makeMetaListSection({
    field: "timeline",
    singular: "event",
    icon: ListChecks,
    primaryPlaceholder: "e.g. Vendor dispatched",
    secondary: { key: "date", label: "Date", type: "text", placeholder: "When" },
  }),
  documents: makeMetaListSection({
    field: "documents",
    singular: "document",
    icon: FileText,
    primaryPlaceholder: "Document name",
  }),
  activity: makeNotesSection({ field: "activityNotes", placeholder: "Log a note about this work order…" }),
  settings: makeFieldsSection([
    { key: "status", label: "Status", type: "select", options: selectOptions(WORK_ORDER_STATUS_MAP) },
    { key: "priority", label: "Priority", type: "select", options: PRIORITY_OPTIONS },
    { key: "isField", label: "Field / mobile visit", type: "switch" },
  ]),
};
