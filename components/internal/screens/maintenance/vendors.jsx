"use client";

import {
  LayoutDashboard,
  SquarePen,
  Wrench,
  ShieldCheck,
  DollarSign,
  Star,
  FileText,
  Clock,
  Settings,
  Truck,
} from "lucide-react";

import { StatusPill } from "@/components/internal/shared/screen_kit";
import { Badge } from "@/components/ui/badge";
import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { vendorsData } from "@/lib/supabase/vendors";
import {
  makeFieldsSection,
  makeOverviewSection,
  makeMetaListSection,
  makeNotesSection,
} from "@/components/internal/screens/entity/sections/factories";
import {
  VENDOR_STATUS_MAP,
  SPECIALTY_OPTIONS,
  selectOptions,
  filterOptions,
  currency,
  formatDate,
} from "./shared";

// Vendors — the vendor directory (owns `property.vendors`). Profiles, contacts,
// specialties, ratings, insurance, and rates.

const vendorsConfig = {
  key: "vendor",
  singular: "Vendor",
  plural: "Vendors",
  title: "Vendors",
  description:
    "Your directory of contractors and service providers. Track specialties, ratings, insurance, and rates, and open a vendor to manage their profile.",
  icon: Truck,
  titleField: "name",
  searchFields: ["name", "contactName", "specialty", "email", "phone"],
  data: vendorsData,

  statusMap: VENDOR_STATUS_MAP,
  statusFilterOptions: filterOptions(VENDOR_STATUS_MAP),

  columns: [
    {
      key: "name",
      header: "Vendor",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="text-xs text-text-secondary">
            {[r.contactName, r.phone].filter(Boolean).join(" · ") || "No contact set"}
          </span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusPill status={r.status} map={VENDOR_STATUS_MAP} />,
    },
    {
      key: "specialty",
      header: "Specialty",
      render: (r) =>
        r.specialty ? <Badge variant="neutral">{r.specialty}</Badge> : <span className="text-text-tertiary">—</span>,
    },
    {
      key: "rating",
      header: "Rating",
      align: "right",
      className: "text-right font-semibold tabular-nums text-white",
      render: (r) => (r.rating ? `${Number(r.rating).toFixed(1)} ★` : "—"),
    },
  ],

  stats: (rows) => {
    const active = rows.filter((r) => r.status === "Active").length;
    const preferred = rows.filter((r) => r.status === "Preferred").length;
    const rated = rows.filter((r) => Number(r.rating) > 0);
    const avg = rated.length
      ? (rated.reduce((s, r) => s + Number(r.rating), 0) / rated.length).toFixed(1)
      : "—";
    return [
      { label: "Vendors", value: String(rows.length), footer: `${active} active` },
      { label: "Preferred", value: String(preferred), footer: "Top providers" },
      { label: "Avg rating", value: String(avg), footer: "Across rated vendors" },
      { label: "Specialties", value: String(new Set(rows.map((r) => r.specialty).filter(Boolean)).size), footer: "Trades covered" },
    ];
  },

  createDraft: { name: "", specialty: "General contractor", status: "Active" },
  createFields: [
    { key: "name", label: "Vendor name", type: "text", placeholder: "e.g. Ace Mechanical" },
    { key: "specialty", label: "Specialty", type: "select", options: SPECIALTY_OPTIONS },
    {
      key: "status",
      label: "Status",
      type: "select",
      options: selectOptions(VENDOR_STATUS_MAP),
    },
  ],
  newRow: (draft) => ({
    name: draft.name.trim(),
    specialty: draft.specialty || "",
    status: draft.status || "Active",
  }),

  headerMeta: (r) =>
    [r.specialty, r.contactName, r.phone].filter(Boolean).join(" · "),

  navGroups: [
    {
      group: null,
      items: [{ key: "overview", label: "Overview", icon: LayoutDashboard, desc: "A snapshot of this vendor." }],
    },
    {
      group: "Vendor",
      items: [
        { key: "details", label: "Details", icon: SquarePen, desc: "Contact information." },
        { key: "specialty", label: "Specialties", icon: Wrench, desc: "Trades and service areas." },
        { key: "compliance", label: "Compliance", icon: ShieldCheck, desc: "Insurance and licensing." },
      ],
    },
    {
      group: "Engagement",
      items: [
        { key: "rates", label: "Rates", icon: DollarSign, desc: "Pricing and payment terms." },
        { key: "ratings", label: "Ratings", icon: Star, desc: "Performance and reviews." },
        { key: "documents", label: "Documents", icon: FileText, desc: "Contracts and certificates." },
      ],
    },
    {
      group: "General",
      items: [
        { key: "notes", label: "Notes", icon: Clock, desc: "Notes about this vendor." },
        { key: "settings", label: "Settings", icon: Settings, desc: "Status and configuration." },
      ],
    },
  ],
  sections: {
    overview: makeOverviewSection({
      fields: [
        { key: "contactName", label: "Contact" },
        { key: "email", label: "Email" },
        { key: "phone", label: "Phone" },
        { key: "specialty", label: "Specialty" },
        { key: "status", label: "Status" },
        { key: "rating", label: "Rating", format: (v) => (v ? `${Number(v).toFixed(1)} ★` : "—") },
        { key: "hourlyRate", label: "Hourly rate", format: (v) => (v ? `${currency(v)}/hr` : "—") },
        { key: "insuranceExpiry", label: "Insurance expiry", format: (v) => formatDate(v) },
      ],
    }),
    details: makeFieldsSection([
      { key: "name", label: "Vendor name", type: "text", full: true },
      { key: "contactName", label: "Contact name", type: "text" },
      { key: "email", label: "Email", type: "text" },
      { key: "phone", label: "Phone", type: "text" },
      { key: "address", label: "Address", type: "text", meta: true, full: true },
    ]),
    specialty: makeFieldsSection([
      { key: "specialty", label: "Primary specialty", type: "select", options: SPECIALTY_OPTIONS },
      { key: "serviceAreas", label: "Service areas", type: "text", meta: true, full: true },
      { key: "availability", label: "Availability", type: "text", meta: true },
      { key: "emergencyService", label: "24/7 emergency service", type: "switch", meta: true },
    ]),
    compliance: makeFieldsSection([
      { key: "insuranceExpiry", label: "Insurance expiry", type: "date" },
      { key: "insuranceProvider", label: "Insurance provider", type: "text", meta: true },
      { key: "licenseNumber", label: "License number", type: "text", meta: true },
      { key: "w9OnFile", label: "W-9 on file", type: "switch", meta: true },
    ]),
    rates: makeFieldsSection([
      { key: "hourlyRate", label: "Hourly rate", type: "number" },
      { key: "calloutFee", label: "Call-out fee", type: "number", meta: true },
      { key: "paymentTerms", label: "Payment terms", type: "text", meta: true },
    ]),
    ratings: makeFieldsSection([
      { key: "rating", label: "Rating (0–5)", type: "number" },
      { key: "jobsCompleted", label: "Jobs completed", type: "number", meta: true },
      { key: "reviewNotes", label: "Review notes", type: "textarea", meta: true },
    ]),
    documents: makeMetaListSection({
      field: "documents",
      singular: "document",
      icon: FileText,
      primaryPlaceholder: "e.g. Certificate of insurance",
    }),
    notes: makeNotesSection({ field: "notes", placeholder: "Notes about this vendor…" }),
    settings: makeFieldsSection([
      { key: "status", label: "Status", type: "select", options: selectOptions(VENDOR_STATUS_MAP) },
      { key: "specialty", label: "Specialty", type: "select", options: SPECIALTY_OPTIONS },
    ]),
  },
};

export function VendorsScreen() {
  return <EntityListScreen config={vendorsConfig} />;
}

export default VendorsScreen;
