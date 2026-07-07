import { FileText } from "lucide-react";

import { StatusPill } from "@/components/internal/shared/screen_kit";
import { buildNavGroups } from "@/components/internal/screens/entity/default_sections";
import { OverviewSection } from "./sections/overview";
import { DetailsSection } from "./sections/details";
import { DocumentsSection } from "./sections/documents";
import { ActivitySection } from "./sections/activity";
import { SettingsSection } from "./sections/settings";

// Per-area config for the Leasing list + editor (row = a lease).

const STATUS_MAP = {
  Active: { label: "Active", variant: "success", dotClass: "bg-emerald-400" },
  Pending: { label: "Pending", variant: "info", dotClass: "bg-sky-400" },
  "Expiring soon": { label: "Expiring soon", variant: "warning", dotClass: "bg-amber-400" },
  Draft: { label: "Draft", variant: "neutral", dotClass: "bg-[#737373]" },
  Ended: { label: "Ended", variant: "outline", dotClass: "bg-[#525252]" },
};

const currency = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(n) || 0);

// TEMP demo rows — replaced by lib/supabase/leasing.js fetch-on-mount later.
const DEMO_ROWS = [
  { id: "l-4001", name: "Maple Court · 4B — Jordan Blake", unit: "Maple Court · 4B", rent: 1850, term: "Jan 2026 – Dec 2026", status: "Active" },
  { id: "l-4002", name: "The Beacon · 12A — Priya Nair", unit: "The Beacon · 12A", rent: 2400, term: "Mar 2026 – Feb 2027", status: "Active" },
  { id: "l-4003", name: "The Beacon · 3C — Marcus Reed", unit: "The Beacon · 3C", rent: 2200, term: "Aug 2025 – Jul 2026", status: "Expiring soon" },
  { id: "l-4004", name: "Riverside · A — Elena Rossi", unit: "Riverside · A", rent: 1600, term: "Pending start", status: "Pending" },
  { id: "l-4005", name: "Cedar Lane — Sam Okafor", unit: "Cedar Lane", rent: 2100, term: "2024 – 2025", status: "Ended" },
];

export const leasingConfig = {
  key: "lease",
  singular: "Lease",
  plural: "Leases",
  title: "All Leases",
  description:
    "Every lease across your portfolio — active, pending, and expiring. Search, filter, and open a lease to manage terms, renewals, and documents.",
  icon: FileText,
  titleField: "name",
  searchFields: ["name", "unit", "term"],
  demoRows: DEMO_ROWS,

  statusMap: STATUS_MAP,
  statusFilterOptions: [
    { value: "all", label: "All statuses" },
    { value: "Active", label: "Active" },
    { value: "Pending", label: "Pending" },
    { value: "Expiring soon", label: "Expiring soon" },
    { value: "Ended", label: "Ended" },
    { value: "Draft", label: "Draft" },
  ],

  columns: [
    {
      key: "name",
      header: "Lease",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="text-xs text-text-secondary">{r.term}</span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusPill status={r.status} map={STATUS_MAP} />,
    },
    {
      key: "rent",
      header: "Rent",
      align: "right",
      className: "text-right font-semibold tabular-nums text-white",
      render: (r) => (
        <span>
          {currency(r.rent)}
          <span className="text-xs font-normal text-text-secondary">/mo</span>
        </span>
      ),
    },
  ],

  stats: (rows) => {
    const active = rows.filter((r) => r.status === "Active").length;
    const pending = rows.filter((r) => r.status === "Pending").length;
    const expiring = rows.filter((r) => r.status === "Expiring soon").length;
    const monthly = rows
      .filter((r) => r.status === "Active" || r.status === "Expiring soon")
      .reduce((s, r) => s + (Number(r.rent) || 0), 0);
    return [
      { label: "Leases", value: String(rows.length), footer: `${active} active` },
      { label: "Monthly rent", value: currency(monthly), footer: "Active leases" },
      { label: "Pending", value: String(pending), footer: "Awaiting signature" },
      { label: "Expiring soon", value: String(expiring), footer: "Renew or turn over" },
    ];
  },

  createDraft: { name: "", unit: "", status: "Draft" },
  createFields: [
    { key: "name", label: "Lease name", type: "text", placeholder: "e.g. Maple Court · 4B — Jordan Blake" },
    { key: "unit", label: "Unit", type: "text", placeholder: "e.g. Maple Court · 4B" },
    {
      key: "status",
      label: "Status",
      type: "select",
      options: [
        { value: "Draft", label: "Draft" },
        { value: "Pending", label: "Pending" },
        { value: "Active", label: "Active" },
      ],
    },
  ],
  newRow: (draft) => ({
    name: draft.name.trim(),
    unit: draft.unit || "",
    rent: 0,
    term: "Not set",
    status: draft.status || "Draft",
  }),

  headerMeta: (r) =>
    [r.unit, r.term, r.rent ? `${currency(r.rent)}/mo` : null].filter(Boolean).join(" · "),

  navGroups: buildNavGroups("Lease"),
  sections: {
    overview: OverviewSection,
    details: DetailsSection,
    documents: DocumentsSection,
    activity: ActivitySection,
    settings: SettingsSection,
  },
};

export default leasingConfig;
