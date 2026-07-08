"use client";

import {
  LayoutDashboard,
  IdCard,
  Briefcase,
  Car,
  FileText,
  Clock,
  UserRound,
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
  TENANT_IDENTITY_FIELDS,
  TENANT_EMPLOYMENT_FIELDS,
  TENANT_VEHICLES_PETS_FIELDS,
} from "./shared";
import { DocumentsSection } from "./sections/documents";
import { ActivitySection } from "./sections/activity";

// Tenant Profiles — a profile-first lens on the shared `tenants` table. Deep
// per-person detail: identity, employment & income, vehicles & pets.

const profilesConfig = {
  key: "tenant",
  singular: "Profile",
  plural: "Profiles",
  title: "Tenant Profiles",
  description:
    "Detailed resident profiles — identity, employment, income, and household details for every tenant.",
  icon: UserRound,
  titleField: "name",
  searchFields: ["name", "email", "unit"],
  data: tenantsData,

  statusMap: TENANT_STATUS_MAP,
  statusFilterOptions: TENANT_STATUS_FILTER_OPTIONS,

  columns: [
    {
      key: "name",
      header: "Tenant",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="text-xs text-text-secondary">
            {r.employer || r.email || "—"}
          </span>
        </div>
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
    const withEmployer = rows.filter((r) => r.employer).length;
    const verified = rows.filter((r) => r.incomeVerified).length;
    const current = rows.filter((r) => r.status === "Current").length;
    return [
      { label: "Profiles", value: String(rows.length), footer: `${current} current` },
      { label: "Employment on file", value: String(withEmployer), footer: "Has employer" },
      { label: "Income verified", value: String(verified), footer: "Verified applicants" },
      { label: "Current", value: String(current), footer: "Active residents" },
    ];
  },

  createDraft: { name: "", email: "", status: "Applicant" },
  createFields: [
    { key: "name", label: "Full name", type: "text", placeholder: "e.g. Jordan Blake" },
    { key: "email", label: "Email", type: "text", placeholder: "name@example.com" },
  ],
  newRow: (draft) => ({
    name: draft.name.trim(),
    email: draft.email || "",
    unit: "",
    status: "Applicant",
    balance: 0,
  }),

  headerMeta: (r) =>
    [r.employer, r.unit, r.email].filter(Boolean).join(" · "),

  navGroups: [
    {
      group: null,
      items: [
        { key: "overview", label: "Profile", icon: LayoutDashboard, desc: "Profile snapshot for this tenant." },
      ],
    },
    {
      group: "Profile",
      items: [
        { key: "identity", label: "Identity", icon: IdCard, desc: "Date of birth, ID, and demographics." },
        { key: "employment", label: "Employment & Income", icon: Briefcase, desc: "Employer, role, and income." },
        { key: "vehiclesPets", label: "Vehicles & Pets", icon: Car, desc: "Registered vehicles and pets." },
        { key: "documents", label: "Documents", icon: FileText, desc: "Supporting documents on file." },
        { key: "activity", label: "Activity", icon: Clock, desc: "Recent changes and communication." },
      ],
    },
  ],
  sections: {
    overview: makeOverviewSection({
      fields: [
        { key: "email", label: "Email" },
        { key: "unit", label: "Unit" },
        { key: "status", label: "Status" },
        { key: "employer", label: "Employer", meta: true },
        { key: "jobTitle", label: "Job title", meta: true },
        { key: "annualIncome", label: "Annual income", meta: true },
      ],
    }),
    identity: makeFieldsSection(TENANT_IDENTITY_FIELDS),
    employment: makeFieldsSection(TENANT_EMPLOYMENT_FIELDS),
    vehiclesPets: makeFieldsSection(TENANT_VEHICLES_PETS_FIELDS),
    documents: DocumentsSection,
    activity: ActivitySection,
  },
};

export function TenantProfilesScreen() {
  return <EntityListScreen config={profilesConfig} />;
}

export default TenantProfilesScreen;
