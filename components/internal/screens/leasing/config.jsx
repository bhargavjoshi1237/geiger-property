import {
  LayoutDashboard,
  FileSignature,
  Users,
  Home,
  Wallet,
  FileText,
  Repeat,
  Clock,
} from "lucide-react";

import { StatusPill } from "@/components/internal/shared/screen_kit";
import { leasesData } from "@/lib/supabase/leases";
import {
  makeFieldsSection,
  makeOverviewSection,
  makeMetaListSection,
  makeNotesSection,
} from "@/components/internal/screens/entity/sections/factories";
import {
  LEASE_STATUS_MAP,
  filterOptions,
  currency,
  formatDate,
} from "./shared";

// Per-area config for the Leasing list + editor (row = a lease). Backed by the
// `property.leases` data layer; sections composed from the shared factories.

const term = (r) =>
  r.termStart || r.termEnd
    ? `${formatDate(r.termStart)} – ${formatDate(r.termEnd)}`
    : "Term not set";

export const leasingConfig = {
  key: "lease",
  singular: "Lease",
  plural: "Leases",
  title: "All Leases",
  description:
    "Every lease across your portfolio — active, pending, and expiring. Search, filter, and open a lease to manage terms, renewals, and documents.",
  icon: FileSignature,
  titleField: "name",
  searchFields: ["name", "unit", "tenantName"],
  data: leasesData,

  statusMap: LEASE_STATUS_MAP,
  statusFilterOptions: filterOptions(LEASE_STATUS_MAP),

  columns: [
    {
      key: "name",
      header: "Lease",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="text-xs text-text-secondary">{term(r)}</span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusPill status={r.status} map={LEASE_STATUS_MAP} />,
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
    status: draft.status || "Draft",
  }),

  headerMeta: (r) =>
    [r.unit, term(r), r.rent ? `${currency(r.rent)}/mo` : null].filter(Boolean).join(" · "),

  navGroups: [
    {
      group: null,
      items: [
        { key: "overview", label: "Overview", icon: LayoutDashboard, desc: "A snapshot of this lease." },
      ],
    },
    {
      group: "Terms",
      items: [
        { key: "terms", label: "Terms & Rent", icon: FileSignature, desc: "Rent, deposit, and term dates." },
        { key: "parties", label: "Parties", icon: Users, desc: "Tenant, landlord, and guarantor." },
        { key: "unit", label: "Unit & Property", icon: Home, desc: "The unit this lease covers." },
        { key: "charges", label: "Charges & Deposits", icon: Wallet, desc: "Recurring charges and deposits." },
      ],
    },
    {
      group: "Lifecycle",
      items: [
        { key: "documents", label: "Documents", icon: FileText, desc: "Signed lease and attachments." },
        { key: "renewal", label: "Renewal", icon: Repeat, desc: "Renewal options and notice." },
        { key: "activity", label: "Activity", icon: Clock, desc: "Notes and history." },
      ],
    },
  ],
  sections: {
    overview: makeOverviewSection({
      fields: [
        { key: "unit", label: "Unit" },
        { key: "tenantName", label: "Tenant" },
        { key: "status", label: "Status" },
        { key: "rent", label: "Rent", format: (v) => `${currency(v)}/mo` },
        { key: "deposit", label: "Deposit", format: (v) => currency(v) },
        { key: "termStart", label: "Term start", format: (v) => formatDate(v) },
        { key: "termEnd", label: "Term end", format: (v) => formatDate(v) },
      ],
    }),
    terms: makeFieldsSection([
      { key: "rent", label: "Monthly rent", type: "number" },
      { key: "deposit", label: "Security deposit", type: "number" },
      { key: "termStart", label: "Term start", type: "date" },
      { key: "termEnd", label: "Term end", type: "date" },
      {
        key: "status",
        label: "Status",
        type: "select",
        options: filterOptions(LEASE_STATUS_MAP).slice(1),
      },
    ]),
    parties: makeFieldsSection([
      { key: "tenantName", label: "Tenant", type: "text", placeholder: "e.g. Jordan Blake" },
      { key: "landlord", label: "Landlord / manager", type: "text", meta: true },
      { key: "guarantor", label: "Guarantor", type: "text", meta: true },
      { key: "coSigner", label: "Co-signer", type: "text", meta: true },
    ]),
    unit: makeFieldsSection([
      { key: "unit", label: "Unit", type: "text" },
      { key: "propertyName", label: "Property", type: "text", meta: true },
      { key: "address", label: "Address", type: "text", meta: true, full: true },
    ]),
    charges: makeMetaListSection({
      field: "charges",
      singular: "charge",
      icon: Wallet,
      primaryPlaceholder: "e.g. Parking",
      secondary: { key: "amount", label: "Amount", type: "number", placeholder: "0" },
    }),
    documents: makeMetaListSection({
      field: "documents",
      singular: "document",
      icon: FileText,
      primaryPlaceholder: "Document name",
    }),
    renewal: makeFieldsSection([
      {
        key: "renewalOption",
        label: "Renewal",
        type: "select",
        meta: true,
        options: [
          { value: "Auto-renew", label: "Auto-renew" },
          { value: "Manual", label: "Manual" },
          { value: "Month-to-month", label: "Month-to-month" },
          { value: "Do not renew", label: "Do not renew" },
        ],
      },
      { key: "noticeDays", label: "Notice period (days)", type: "number", meta: true },
      { key: "increasePct", label: "Renewal increase (%)", type: "number", meta: true },
    ]),
    activity: makeNotesSection({ field: "activityNotes", placeholder: "Log a note about this lease…" }),
  },
};

export default leasingConfig;
