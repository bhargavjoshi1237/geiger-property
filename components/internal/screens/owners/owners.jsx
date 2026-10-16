"use client";

import {
  LayoutDashboard,
  Contact,
  Building2,
  Percent,
  Receipt,
  FileText,
  Clock,
  Landmark,
} from "lucide-react";

import { SectionCard, StatusPill } from "@/components/internal/shared/screen_kit";
import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { ownersData } from "@/lib/supabase/owners";
import {
  makeFieldsSection,
  makeOverviewSection,
  makeMetaListSection,
  makeNotesSection,
} from "@/components/internal/screens/entity/sections/factories";
import {
  OWNER_STATUS_MAP,
  PAYOUT_METHOD_OPTIONS,
  PAYOUT_SCHEDULE_OPTIONS,
  TAX_CLASSIFICATION_OPTIONS,
  filterOptions,
  selectOptions,
  splitsOf,
  totalPctOf,
  percent,
} from "./shared";

// Owners — property owners, their ownership splits, fees, and tax details
// (owns `property.owners`). Splits live in the metadata bag.

const SplitsList = makeMetaListSection({
  field: "properties",
  singular: "property",
  icon: Building2,
  primaryPlaceholder: "Property name, e.g. Maple Court",
  secondary: { key: "pct", label: "Ownership %", type: "number", placeholder: "Ownership %" },
});

// Property splits with a running ownership total (validated ≤ 100% per owner).
function SplitsSection(props) {
  const splits = splitsOf(props.item);
  const total = totalPctOf(props.item);
  const over = splits.some((p) => Number(p.pct) > 100) || splits.some((p) => Number(p.pct) < 0);
  return (
    <div className="space-y-4">
      <SectionCard>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
              Properties
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{splits.length}</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
              Average share
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">
              {splits.length ? percent(Math.round((total / splits.length) * 10) / 10) : "—"}
            </p>
          </div>
        </div>
        <p className={over ? "mt-3 text-sm text-red-600 dark:text-red-400" : "mt-3 text-sm text-text-secondary"}>
          {over
            ? "Each ownership share must be between 0% and 100%."
            : "Enter this owner's share of each property (0–100%). Co-owners each record their own share."}
        </p>
      </SectionCard>
      <SplitsList {...props} />
    </div>
  );
}

const ownersConfig = {
  key: "owner",
  singular: "Owner",
  plural: "Owners",
  title: "Owners",
  description:
    "The people and entities who own your properties. Track ownership splits, management fees, payout preferences, and 1099 details.",
  icon: Landmark,
  titleField: "name",
  searchFields: ["name", "company", "email", "phone"],
  data: ownersData,

  statusMap: OWNER_STATUS_MAP,
  statusFilterOptions: filterOptions(OWNER_STATUS_MAP),

  columns: [
    {
      key: "name",
      header: "Owner",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="text-xs text-text-secondary">{r.company || r.email || "—"}</span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusPill status={r.status} map={OWNER_STATUS_MAP} />,
    },
    {
      key: "properties",
      header: "Properties",
      render: (r) => {
        const n = splitsOf(r).length;
        return (
          <span className="text-sm text-muted-foreground">
            {n ? `${n} ${n === 1 ? "property" : "properties"}` : "None linked"}
          </span>
        );
      },
    },
    {
      key: "payoutMethod",
      header: "Payout",
      render: (r) => <span className="text-sm text-muted-foreground">{r.payoutMethod || "—"}</span>,
    },
    {
      key: "managementFeePct",
      header: "Mgmt fee",
      align: "right",
      className: "text-right tabular-nums text-foreground",
      render: (r) => percent(r.managementFeePct),
    },
  ],

  stats: (rows) => {
    const active = rows.filter((r) => r.status === "Active");
    const onboarding = rows.filter((r) => r.status === "Onboarding").length;
    const fees = active.map((r) => Number(r.managementFeePct) || 0).filter(Boolean);
    const avgFee = fees.length ? fees.reduce((s, n) => s + n, 0) / fees.length : 0;
    const linked = rows.reduce((s, r) => s + splitsOf(r).length, 0);
    return [
      { label: "Owners", value: String(rows.length), footer: `${active.length} active` },
      { label: "Onboarding", value: String(onboarding), footer: "Being set up" },
      { label: "Avg mgmt fee", value: percent(Math.round(avgFee * 10) / 10), footer: "Active owners" },
      { label: "Property splits", value: String(linked), footer: "Ownership records" },
    ];
  },

  createDraft: { name: "", company: "", email: "", status: "Onboarding" },
  createFields: [
    { key: "name", label: "Owner name", type: "text", placeholder: "e.g. Priya Raman" },
    { key: "company", label: "Company", type: "text", placeholder: "Optional, e.g. Raman Holdings LLC" },
    { key: "email", label: "Email", type: "text", placeholder: "owner@example.com" },
    { key: "status", label: "Status", type: "select", options: selectOptions(OWNER_STATUS_MAP) },
  ],
  newRow: (draft) => ({
    name: draft.name.trim(),
    company: draft.company || "",
    email: draft.email || "",
    status: draft.status || "Onboarding",
    payoutMethod: "ACH",
  }),

  headerMeta: (r) =>
    [r.company, r.email, r.managementFeePct ? `${percent(r.managementFeePct)} fee` : null]
      .filter(Boolean)
      .join(" · "),

  navGroups: [
    {
      group: null,
      items: [
        { key: "overview", label: "Overview", icon: LayoutDashboard, desc: "A snapshot of this owner." },
      ],
    },
    {
      group: "Owner",
      items: [
        { key: "contact", label: "Contact", icon: Contact, desc: "Name, company, and how to reach them." },
        { key: "splits", label: "Properties & Splits", icon: Building2, desc: "Properties owned and ownership share." },
        { key: "fees", label: "Management Fees", icon: Percent, desc: "Fee terms and payout preferences." },
        { key: "tax", label: "Tax & 1099", icon: Receipt, desc: "Tax ID and 1099 reporting." },
      ],
    },
    {
      group: "Records",
      items: [
        { key: "documents", label: "Documents", icon: FileText, desc: "Management agreements and paperwork on file." },
        { key: "activity", label: "Activity", icon: Clock, desc: "Notes and history." },
      ],
    },
  ],
  sections: {
    overview: makeOverviewSection({
      fields: [
        { key: "email", label: "Email" },
        { key: "phone", label: "Phone" },
        { key: "company", label: "Company" },
        { key: "status", label: "Status" },
        { key: "managementFeePct", label: "Management fee", format: (v) => percent(v) },
        { key: "payoutMethod", label: "Payout method" },
        {
          key: "properties",
          label: "Properties",
          format: (_v, item) => splitsOf(item).map((p) => p.label).join(", ") || "None linked",
        },
        { key: "requires1099", label: "1099", meta: true, format: (v) => (v ? "Required" : "Not required") },
      ],
    }),
    contact: makeFieldsSection([
      { key: "name", label: "Owner name", type: "text" },
      { key: "company", label: "Company", type: "text" },
      { key: "email", label: "Email", type: "text" },
      { key: "phone", label: "Phone", type: "text" },
      { key: "mailingAddress", label: "Mailing address", type: "textarea", meta: true },
      { key: "status", label: "Status", type: "select", options: selectOptions(OWNER_STATUS_MAP) },
    ]),
    splits: SplitsSection,
    fees: makeFieldsSection([
      { key: "managementFeePct", label: "Management fee (%)", type: "number", hint: "Percent of collected rent." },
      { key: "payoutMethod", label: "Payout method", type: "select", options: PAYOUT_METHOD_OPTIONS },
      { key: "payoutSchedule", label: "Payout schedule", type: "select", meta: true, options: PAYOUT_SCHEDULE_OPTIONS },
      { key: "reserveAmount", label: "Operating reserve", type: "number", meta: true, hint: "Held back from each payout." },
      { key: "leasingFee", label: "Leasing fee", type: "text", meta: true, placeholder: "e.g. 50% of first month" },
      { key: "feeNotes", label: "Fee notes", type: "textarea", meta: true },
    ]),
    tax: makeFieldsSection([
      { key: "taxIdLast4", label: "Tax ID (last 4)", type: "text", placeholder: "1234" },
      { key: "taxClassification", label: "Tax classification", type: "select", meta: true, options: TAX_CLASSIFICATION_OPTIONS },
      { key: "requires1099", label: "1099 required", type: "switch", meta: true },
      { key: "w9OnFile", label: "W-9 on file", type: "switch", meta: true },
    ]),
    documents: makeNotesSection({
      field: "documentNotes",
      placeholder: "Management agreement, W-9, insurance… note what's on file and where. Upload files in the Document Library.",
    }),
    activity: makeNotesSection({ field: "activityNotes", placeholder: "Log a note about this owner…" }),
  },
};

export function OwnersScreen() {
  return <EntityListScreen config={ownersConfig} />;
}

export default OwnersScreen;
