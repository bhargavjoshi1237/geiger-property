import {
  LayoutDashboard,
  SquarePen,
  FileSignature,
  Wallet,
  UsersRound,
  FileText,
  MessagesSquare,
  Smartphone,
  ShieldCheck,
  Settings,
  Users,
} from "lucide-react";

import { StatusPill } from "@/components/internal/shared/screen_kit";
import { tenantsData } from "@/lib/supabase/tenants";
import {
  makeFieldsSection,
  makeOverviewSection,
} from "@/components/internal/screens/entity/sections/factories";
import {
  TENANT_STATUS_MAP,
  TENANT_STATUS_FILTER_OPTIONS,
  currency,
  formatDate,
  TENANT_CONTACT_FIELDS,
  TENANT_LEASE_FIELDS,
  TENANT_PAYMENT_FIELDS,
  TENANT_SCREENING_FIELDS,
} from "./shared";
import { DocumentsSection } from "./sections/documents";
import { ActivitySection } from "./sections/activity";
import { HouseholdSection } from "./sections/household";
import { ResidentPortalSection } from "./sections/resident_portal";

// Per-area config for the Tenants list + editor (row = a resident/tenant). The
// reusable Entity engine reads this; sections are composed from the shared
// factories plus the tenant-specific child-list sections.

const TENANT_SETTINGS_FIELDS = [
  {
    key: "preferredContact",
    label: "Preferred contact",
    type: "select",
    meta: true,
    options: [
      { value: "Email", label: "Email" },
      { value: "Phone", label: "Phone" },
      { value: "SMS", label: "SMS" },
    ],
  },
  { key: "language", label: "Language", type: "text", meta: true, placeholder: "e.g. English" },
  { key: "doNotContact", label: "Do not contact", type: "switch", meta: true },
];

export const tenantsConfig = {
  key: "tenant",
  singular: "Tenant",
  plural: "Tenants",
  title: "All Tenants",
  description:
    "Every resident and applicant across your portfolio. Search, filter, and open a tenant to manage their lease, payments, and documents.",
  icon: Users,
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
          <span className="text-xs text-text-secondary">{r.email}</span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusPill status={r.status} map={TENANT_STATUS_MAP} />,
    },
    {
      key: "unit",
      header: "Unit",
      render: (r) => (
        <span className="text-sm text-muted-foreground">{r.unit || "—"}</span>
      ),
    },
    {
      key: "balance",
      header: "Balance",
      align: "right",
      className: "text-right font-semibold tabular-nums text-white",
      render: (r) => (
        <span className={Number(r.balance) > 0 ? "text-red-400" : "text-white"}>
          {currency(r.balance)}
        </span>
      ),
    },
  ],

  stats: (rows) => {
    const current = rows.filter((r) => r.status === "Current").length;
    const applicants = rows.filter((r) => r.status === "Applicant").length;
    const owed = rows.reduce((s, r) => s + (Number(r.balance) || 0), 0);
    return [
      { label: "Tenants", value: String(rows.length), footer: `${current} current` },
      { label: "Applicants", value: String(applicants), footer: "In screening" },
      { label: "Current", value: String(current), footer: "Active leases" },
      { label: "Balance due", value: currency(owed), footer: "Across all tenants" },
    ];
  },

  createDraft: { name: "", email: "", unit: "", status: "Applicant" },
  createFields: [
    { key: "name", label: "Full name", type: "text", placeholder: "e.g. Jordan Blake" },
    { key: "email", label: "Email", type: "text", placeholder: "name@example.com" },
    { key: "unit", label: "Unit", type: "text", placeholder: "e.g. Maple Court · 4B" },
    {
      key: "status",
      label: "Status",
      type: "select",
      options: [
        { value: "Applicant", label: "Applicant" },
        { value: "Current", label: "Current" },
        { value: "Draft", label: "Draft" },
      ],
    },
  ],
  newRow: (draft) => ({
    name: draft.name.trim(),
    email: draft.email || "",
    unit: draft.unit || "",
    status: draft.status || "Applicant",
    balance: 0,
  }),

  headerMeta: (r) => [r.email, r.unit].filter(Boolean).join(" · "),

  navGroups: [
    {
      group: null,
      items: [
        { key: "overview", label: "Overview", icon: LayoutDashboard, desc: "A snapshot of this tenant — key details at a glance." },
      ],
    },
    {
      group: "General",
      items: [
        { key: "details", label: "Details", icon: SquarePen, desc: "Contact and identity for this tenant." },
        { key: "lease", label: "Lease & Unit", icon: FileSignature, desc: "Current lease, unit, and rent." },
        { key: "payments", label: "Payments & Balance", icon: Wallet, desc: "Balance, autopay, and payment method." },
        { key: "documents", label: "Documents", icon: FileText, desc: "Leases, IDs, notices, and paperwork." },
        { key: "communication", label: "Communication Log", icon: MessagesSquare, desc: "Emails, calls, SMS, and notes." },
        { key: "settings", label: "Settings", icon: Settings, desc: "Contact preferences for this tenant." },
      ],
    },
    {
      group: "Relationships",
      items: [
        { key: "household", label: "Household & Occupants", icon: UsersRound, desc: "Group this tenant with co-residents." },
      ],
    },
    {
      group: "Screening",
      items: [
        { key: "screening", label: "Screening & Background", icon: ShieldCheck, desc: "Credit, background, and income checks." },
      ],
    },
    {
      group: "Portal",
      items: [
        { key: "portal", label: "Resident Portal", icon: Smartphone, desc: "Portal access and activity." },
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
        { key: "balance", label: "Balance", format: (v) => currency(v) },
        { key: "leaseStart", label: "Lease start", format: (v) => formatDate(v) },
        { key: "leaseEnd", label: "Lease end", format: (v) => formatDate(v) },
        { key: "propertyName", label: "Property", meta: true },
      ],
    }),
    details: makeFieldsSection(TENANT_CONTACT_FIELDS),
    lease: makeFieldsSection(TENANT_LEASE_FIELDS),
    payments: makeFieldsSection(TENANT_PAYMENT_FIELDS),
    documents: DocumentsSection,
    communication: ActivitySection,
    settings: makeFieldsSection(TENANT_SETTINGS_FIELDS),
    household: HouseholdSection,
    screening: makeFieldsSection(TENANT_SCREENING_FIELDS),
    portal: ResidentPortalSection,
  },
};

export default tenantsConfig;
