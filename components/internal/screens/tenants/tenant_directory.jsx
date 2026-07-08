"use client";

import {
  LayoutDashboard,
  Contact,
  LifeBuoy,
  FileText,
  MessagesSquare,
  BookUser,
} from "lucide-react";

import { StatusPill } from "@/components/internal/shared/screen_kit";
import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { tenantsData } from "@/lib/supabase/tenants";
import {
  makeFieldsSection,
  makeOverviewSection,
} from "@/components/internal/screens/entity/sections/factories";
import {
  TENANT_STATUS_MAP,
  TENANT_STATUS_FILTER_OPTIONS,
  TENANT_CONTACT_FIELDS,
  TENANT_EMERGENCY_FIELDS,
} from "./shared";
import { DocumentsSection } from "./sections/documents";
import { ActivitySection } from "./sections/activity";

// Tenant Directory — a contact-first lens on the shared `tenants` table. Same
// data as All Tenants, surfaced as a directory (name, phone, email, unit).

const directoryConfig = {
  key: "tenant",
  singular: "Tenant",
  plural: "Tenants",
  title: "Tenant Directory",
  description:
    "A searchable directory of every resident and applicant — names, contact details, and units in one place.",
  icon: BookUser,
  titleField: "name",
  searchFields: ["name", "email", "phone", "unit"],
  data: tenantsData,

  statusMap: TENANT_STATUS_MAP,
  statusFilterOptions: TENANT_STATUS_FILTER_OPTIONS,

  columns: [
    {
      key: "name",
      header: "Name",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="text-xs text-text-secondary">{r.phone || "No phone"}</span>
        </div>
      ),
    },
    {
      key: "email",
      header: "Email",
      render: (r) => (
        <span className="text-sm text-muted-foreground">{r.email || "—"}</span>
      ),
    },
    {
      key: "unit",
      header: "Unit",
      render: (r) => (
        <span className="text-sm text-muted-foreground">{r.unit || "—"}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusPill status={r.status} map={TENANT_STATUS_MAP} />,
    },
  ],

  stats: (rows) => {
    const withEmail = rows.filter((r) => r.email).length;
    const withPhone = rows.filter((r) => r.phone).length;
    const current = rows.filter((r) => r.status === "Current").length;
    return [
      { label: "Contacts", value: String(rows.length), footer: `${current} current` },
      { label: "With email", value: String(withEmail), footer: "Reachable by email" },
      { label: "With phone", value: String(withPhone), footer: "Reachable by phone" },
      { label: "Current", value: String(current), footer: "Active residents" },
    ];
  },

  createDraft: { name: "", email: "", phone: "", status: "Applicant" },
  createFields: [
    { key: "name", label: "Full name", type: "text", placeholder: "e.g. Jordan Blake" },
    { key: "email", label: "Email", type: "text", placeholder: "name@example.com" },
    { key: "phone", label: "Phone", type: "text", placeholder: "(555) 123-4567" },
  ],
  newRow: (draft) => ({
    name: draft.name.trim(),
    email: draft.email || "",
    phone: draft.phone || "",
    unit: "",
    status: "Applicant",
    balance: 0,
  }),

  headerMeta: (r) => [r.phone, r.email, r.unit].filter(Boolean).join(" · "),

  navGroups: [
    {
      group: null,
      items: [
        { key: "overview", label: "Overview", icon: LayoutDashboard, desc: "Contact snapshot for this tenant." },
      ],
    },
    {
      group: "General",
      items: [
        { key: "contact", label: "Contact", icon: Contact, desc: "Name, email, phone, and unit." },
        { key: "emergency", label: "Emergency Contacts", icon: LifeBuoy, desc: "Who to reach in an emergency." },
        { key: "documents", label: "Documents", icon: FileText, desc: "Paperwork on file for this tenant." },
        { key: "activity", label: "Activity", icon: MessagesSquare, desc: "Recent communication and notes." },
      ],
    },
  ],
  sections: {
    overview: makeOverviewSection({
      fields: [
        { key: "email", label: "Email" },
        { key: "phone", label: "Phone" },
        { key: "unit", label: "Unit" },
        { key: "status", label: "Status" },
        { key: "emergencyName", label: "Emergency contact", meta: true },
        { key: "emergencyPhone", label: "Emergency phone", meta: true },
      ],
    }),
    contact: makeFieldsSection(TENANT_CONTACT_FIELDS),
    emergency: makeFieldsSection(TENANT_EMERGENCY_FIELDS),
    documents: DocumentsSection,
    activity: ActivitySection,
  },
};

export function TenantDirectoryScreen() {
  return <EntityListScreen config={directoryConfig} />;
}

export default TenantDirectoryScreen;
