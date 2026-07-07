import { Users } from "lucide-react";

import { StatusPill } from "@/components/internal/shared/screen_kit";
import { buildNavGroups } from "@/components/internal/screens/entity/default_sections";
import { OverviewSection } from "./sections/overview";
import { DetailsSection } from "./sections/details";
import { DocumentsSection } from "./sections/documents";
import { ActivitySection } from "./sections/activity";
import { SettingsSection } from "./sections/settings";

// Per-area config for the Tenants list + editor (row = a resident/tenant).

const STATUS_MAP = {
  Current: { label: "Current", variant: "success", dotClass: "bg-emerald-400" },
  Applicant: { label: "Applicant", variant: "info", dotClass: "bg-sky-400" },
  Late: { label: "Late", variant: "warning", dotClass: "bg-amber-400" },
  Past: { label: "Past", variant: "outline", dotClass: "bg-[#525252]" },
  Draft: { label: "Draft", variant: "neutral", dotClass: "bg-[#737373]" },
};

const currency = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(n) || 0);

// TEMP demo rows — replaced by lib/supabase/tenants.js fetch-on-mount later.
const DEMO_ROWS = [
  { id: "t-2001", name: "Jordan Blake", email: "jordan.blake@example.com", unit: "Maple Court · 4B", status: "Current", balance: 0 },
  { id: "t-2002", name: "Priya Nair", email: "priya.nair@example.com", unit: "The Beacon · 12A", status: "Current", balance: 0 },
  { id: "t-2003", name: "Marcus Reed", email: "marcus.reed@example.com", unit: "The Beacon · 3C", status: "Late", balance: 1450 },
  { id: "t-2004", name: "Elena Rossi", email: "elena.rossi@example.com", unit: "Riverside · A", status: "Applicant", balance: 0 },
  { id: "t-2005", name: "Sam Okafor", email: "sam.okafor@example.com", unit: "Cedar Lane", status: "Past", balance: 0 },
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
  demoRows: DEMO_ROWS,

  statusMap: STATUS_MAP,
  statusFilterOptions: [
    { value: "all", label: "All statuses" },
    { value: "Current", label: "Current" },
    { value: "Applicant", label: "Applicant" },
    { value: "Late", label: "Late" },
    { value: "Past", label: "Past" },
    { value: "Draft", label: "Draft" },
  ],

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
      render: (r) => <StatusPill status={r.status} map={STATUS_MAP} />,
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

  navGroups: buildNavGroups("Tenant"),
  sections: {
    overview: OverviewSection,
    details: DetailsSection,
    documents: DocumentsSection,
    activity: ActivitySection,
    settings: SettingsSection,
  },
};

export default tenantsConfig;
