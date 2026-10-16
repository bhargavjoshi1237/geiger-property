import {
  LayoutDashboard,
  FileSignature,
  Users,
  Home,
  Wallet,
  FileText,
  Repeat,
  Clock,
  ListChecks,
  Eye,
  FilePlus2,
  PenLine,
  SlidersHorizontal,
} from "lucide-react";

import { StatusPill } from "@/components/internal/shared/screen_kit";
import { leasesData } from "@/lib/supabase/leases";
import { leaseAddendaLayer } from "@/lib/supabase/lease_addenda";
import { listUnits } from "@/lib/supabase/units";
import { propertyOptions, tenantOptions, unitOptions } from "@/lib/supabase/options";
import {
  makeFieldsSection,
  makeOverviewSection,
  makeMetaListSection,
  makeNotesSection,
  makeChildListSection,
  makeCustomFieldsSection,
} from "@/components/internal/screens/entity/sections/factories";
import { LeaseEsignSection, LeasePreviewSection } from "./lease_sections";
import {
  LEASE_STATUS_MAP,
  filterOptions,
  currency,
  formatDate,
  daysUntil,
  withinDays,
} from "./shared";

// Per-area config for the Leases list + editor (row = a lease), including the
// builder tabs (clauses, assembled preview), addenda, and e-signature tracking.

const term = (r) =>
  r.termStart || r.termEnd
    ? `${formatDate(r.termStart)} – ${formatDate(r.termEnd)}`
    : "Term not set";

const isLive = (r) => r.status === "Active" || r.status === "Expiring soon";
const endingSoon = (r) => r.status !== "Ended" && r.status !== "Draft" && withinDays(r.termEnd, 60);

// Unit options for the create dialog, carrying the unit's rent into the draft.
async function unitOptionsWithRent() {
  const [opts, units] = await Promise.all([unitOptions(), listUnits()]);
  const rentById = new Map((units ?? []).map((u) => [u.id, Number(u.rent) || 0]));
  return opts.map((o) => {
    const rent = rentById.get(o.value) || 0;
    return {
      ...o,
      label: rent ? `${o.label} — ${currency(rent)}` : o.label,
      patch: { ...o.patch, rent },
    };
  });
}

const addendaChildData = {
  list: (leaseId) => leaseAddendaLayer.list({ leaseId }),
  create: leaseAddendaLayer.create,
  softDelete: leaseAddendaLayer.softDelete,
};

export const leasingConfig = {
  key: "lease",
  singular: "Lease",
  plural: "Leases",
  title: "Leases",
  description:
    "Every lease across your portfolio — draft, active, and ending. Build agreements clause by clause, attach addenda, and track signatures.",
  icon: FileSignature,
  titleField: "name",
  searchFields: ["name", "unit", "tenantName"],
  data: leasesData,

  statusMap: LEASE_STATUS_MAP,
  statusFilterOptions: filterOptions(LEASE_STATUS_MAP),

  views: [
    { value: "all", label: "All", filter: () => true },
    { value: "active", label: "Active", filter: isLive },
    { value: "drafts", label: "Drafts", filter: (r) => r.status === "Draft", createDefaults: { status: "Draft" } },
    { value: "ending", label: "Ending soon", filter: endingSoon },
    { value: "ended", label: "Ended", filter: (r) => r.status === "Ended" },
  ],

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
      key: "tenantName",
      header: "Tenant · Unit",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="text-sm text-foreground">{r.tenantName || "—"}</span>
          <span className="text-xs text-text-secondary">{r.unit || "No unit linked"}</span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusPill status={r.status} map={LEASE_STATUS_MAP} />,
    },
    {
      key: "termEnd",
      header: "Ends",
      className: "text-sm text-muted-foreground",
      render: (r) => {
        const d = daysUntil(r.termEnd);
        if (d === null) return "—";
        return (
          <span className={endingSoon(r) ? "text-amber-700 dark:text-amber-400" : undefined}>
            {formatDate(r.termEnd)}
            {endingSoon(r) ? ` · ${d}d` : ""}
          </span>
        );
      },
    },
    {
      key: "rent",
      header: "Rent",
      align: "right",
      className: "text-right font-semibold tabular-nums text-foreground",
      render: (r) => (
        <span>
          {currency(r.rent)}
          <span className="text-xs font-normal text-text-secondary">/mo</span>
        </span>
      ),
    },
  ],

  stats: (rows) => {
    const active = rows.filter(isLive);
    const drafts = rows.filter((r) => r.status === "Draft" || r.status === "Pending").length;
    const ending = rows.filter(endingSoon).length;
    const monthly = active.reduce((s, r) => s + (Number(r.rent) || 0), 0);
    return [
      { label: "Leases", value: String(rows.length), footer: `${active.length} active` },
      { label: "Monthly rent", value: currency(monthly), footer: "Active leases" },
      { label: "In progress", value: String(drafts), footer: "Drafts and pending" },
      { label: "Ending ≤60 days", value: String(ending), footer: "Renew or turn over" },
    ];
  },

  createDraft: { name: "", unitId: "", tenantId: "", status: "Draft" },
  createFields: [
    { key: "name", label: "Lease name", type: "text", placeholder: "e.g. Maple Court · 4B — Jordan Blake" },
    {
      key: "unitId",
      label: "Unit",
      type: "select",
      optionsFrom: "units",
      placeholder: "Select a unit…",
      emptyLabel: "No units yet — add them in Units",
    },
    {
      key: "tenantId",
      label: "Tenant",
      type: "select",
      optionsFrom: "tenants",
      placeholder: "Select a tenant…",
      emptyLabel: "No tenants yet — add them in Tenants",
    },
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
  loadCreateOptions: async () => {
    const [units, tenants] = await Promise.all([unitOptionsWithRent(), tenantOptions()]);
    return { units, tenants };
  },
  newRow: (draft) => ({
    name: draft.name.trim(),
    unitId: draft.unitId || "",
    unit: draft.unit || "",
    propertyId: draft.propertyId || "",
    tenantId: draft.tenantId || "",
    tenantName: draft.tenantName || "",
    rent: Number(draft.rent) || 0,
    status: draft.status || "Draft",
  }),

  headerMeta: (r) =>
    [r.tenantName, r.unit, term(r), r.rent ? `${currency(r.rent)}/mo` : null]
      .filter(Boolean)
      .join(" · "),

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
        { key: "charges", label: "Charges & Deposits", icon: Wallet, desc: "Recurring charges beyond rent." },
      ],
    },
    {
      group: "Builder",
      items: [
        { key: "clauses", label: "Clauses", icon: ListChecks, desc: "Additional terms, in the order they appear." },
        { key: "preview", label: "Preview", icon: Eye, desc: "The assembled lease agreement." },
      ],
    },
    {
      group: "Lifecycle",
      items: [
        { key: "addenda", label: "Addenda", icon: FilePlus2, desc: "Addenda attached to this lease." },
        { key: "esign", label: "E-signature", icon: PenLine, desc: "Signing requests for this lease." },
        { key: "documents", label: "Documents", icon: FileText, desc: "Signed lease and attachments." },
        { key: "renewal", label: "Renewal", icon: Repeat, desc: "Renewal options and notice." },
        { key: "custom", label: "Custom Fields", icon: SlidersHorizontal, desc: "Fields defined in Settings → Custom Fields." },
        { key: "activity", label: "Activity", icon: Clock, desc: "Notes and history." },
      ],
    },
  ],
  sections: {
    overview: makeOverviewSection({
      fields: [
        { key: "tenantName", label: "Tenant" },
        { key: "unit", label: "Unit" },
        { key: "status", label: "Status" },
        { key: "rent", label: "Rent", format: (v) => `${currency(v)}/mo` },
        { key: "deposit", label: "Deposit", format: (v) => currency(v) },
        { key: "termStart", label: "Term start", format: (v) => formatDate(v) },
        { key: "termEnd", label: "Term end", format: (v) => formatDate(v) },
        {
          key: "daysLeft",
          label: "Days remaining",
          format: (_v, r) => {
            const d = daysUntil(r.termEnd);
            return d === null ? "—" : d < 0 ? "Ended" : `${d} days`;
          },
        },
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
      { key: "tenantId", label: "Tenant", type: "relation", load: tenantOptions, displayKey: "tenantName" },
      { key: "landlord", label: "Landlord / manager", type: "text", meta: true },
      { key: "guarantor", label: "Guarantor", type: "text", meta: true },
      { key: "coSigner", label: "Co-signer", type: "text", meta: true },
    ]),
    unit: makeFieldsSection([
      { key: "unitId", label: "Unit", type: "relation", load: unitOptions, displayKey: "unit" },
      { key: "propertyId", label: "Property", type: "relation", load: propertyOptions },
      { key: "address", label: "Address", type: "text", meta: true, full: true },
    ]),
    charges: makeMetaListSection({
      field: "charges",
      singular: "charge",
      icon: Wallet,
      primaryPlaceholder: "e.g. Parking",
      secondary: { key: "amount", label: "Amount", type: "number", placeholder: "0" },
    }),
    clauses: makeMetaListSection({
      field: "clauses",
      singular: "clause",
      icon: ListChecks,
      primaryPlaceholder: "e.g. No smoking",
      secondary: { key: "detail", label: "Detail", placeholder: "Clause wording (optional)" },
    }),
    preview: LeasePreviewSection,
    addenda: makeChildListSection({
      data: addendaChildData,
      parentKey: "leaseId",
      singular: "addendum",
      icon: FilePlus2,
      fields: [
        { key: "name", placeholder: "e.g. Pet agreement" },
        { key: "body", placeholder: "Summary (optional)" },
      ],
    }),
    esign: LeaseEsignSection,
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
    custom: makeCustomFieldsSection("leases"),
    activity: makeNotesSection({ field: "activityNotes", placeholder: "Log a note about this lease…" }),
  },
};

export default leasingConfig;
