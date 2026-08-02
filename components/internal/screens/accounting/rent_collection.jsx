"use client";

import {
  LayoutDashboard,
  CalendarClock,
  ReceiptText,
  CircleDollarSign,
  Percent,
  Repeat,
  Clock,
} from "lucide-react";

import { StatusPill } from "@/components/internal/shared/screen_kit";
import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { rentAccountsData } from "@/lib/supabase/rent_collection";
import { tenantsData } from "@/lib/supabase/tenants";
import { unitsData } from "@/lib/supabase/units";
import { propertiesData } from "@/lib/supabase/properties";
import {
  makeFieldsSection,
  makeOverviewSection,
  makeMetaListSection,
  makeNotesSection,
} from "@/components/internal/screens/entity/sections/factories";
import {
  RENT_STATUS_MAP,
  filterOptions,
  currency,
  ordinalDay,
  billedOf,
  collectedOf,
  balanceOf,
} from "./shared";

// Rent Collection — an entity screen over `property.rent_accounts`. Each row is
// a rent-roll obligation; the editor expands into that account's charges and
// payments, and the outstanding balance is derived live from those lists.

const FREQUENCY_OPTIONS = [
  { value: "Monthly", label: "Monthly" },
  { value: "Weekly", label: "Weekly" },
  { value: "Biweekly", label: "Biweekly" },
  { value: "Quarterly", label: "Quarterly" },
];

const METHOD_OPTIONS = [
  { value: "ACH", label: "Bank (ACH)" },
  { value: "Card", label: "Card" },
  { value: "Check", label: "Check" },
  { value: "Cash", label: "Cash" },
];

const rentConfig = {
  key: "rent",
  singular: "Rent account",
  plural: "Rent accounts",
  title: "Rent Collection",
  description:
    "Every rent obligation you're collecting — what's charged, what's been paid, and what's still owed. Track balances, chase delinquencies, and manage late fees and autopay.",
  icon: CircleDollarSign,
  titleField: "name",
  searchFields: ["name", "unit", "tenantName"],
  data: rentAccountsData,

  statusMap: RENT_STATUS_MAP,
  statusFilterOptions: filterOptions(RENT_STATUS_MAP),

  columns: [
    {
      key: "name",
      header: "Account",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="text-xs text-text-secondary">
            {[r.tenantName, r.unit].filter(Boolean).join(" · ") || "—"}
          </span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusPill status={r.status} map={RENT_STATUS_MAP} />,
    },
    {
      key: "rent",
      header: "Rent",
      align: "right",
      className: "text-right tabular-nums text-text-secondary",
      render: (r) => currency(r.rent),
    },
    {
      key: "balance",
      header: "Balance",
      align: "right",
      className: "text-right font-semibold tabular-nums",
      render: (r) => {
        const bal = balanceOf(r);
        return (
          <span className={bal > 0 ? "text-red-400" : "text-emerald-400"}>
            {currency(bal)}
          </span>
        );
      },
    },
    {
      key: "dueDay",
      header: "Due",
      align: "right",
      className: "text-right tabular-nums text-text-tertiary",
      render: (r) => ordinalDay(r.dueDay),
    },
  ],

  stats: (rows) => {
    const billed = rows.reduce((s, r) => s + billedOf(r), 0);
    const collected = rows.reduce((s, r) => s + collectedOf(r), 0);
    const outstanding = rows.reduce((s, r) => s + Math.max(0, balanceOf(r)), 0);
    const overdue = rows.filter(
      (r) => r.status === "Overdue" || r.status === "In collections",
    ).length;
    const rate = billed > 0 ? Math.round((collected / billed) * 100) : 0;
    return [
      { label: "Expected rent", value: currency(billed), footer: `${rows.length} accounts` },
      { label: "Collected", value: currency(collected), footer: "Payments received" },
      { label: "Outstanding", value: currency(outstanding), footer: `${overdue} overdue` },
      { label: "Collection rate", value: `${rate}%`, footer: "Collected of billed" },
    ];
  },

  createDraft: { name: "", unit: "", tenantName: "", rent: "", dueDay: "1" },
  createFields: [
    { key: "name", label: "Account label", type: "text", placeholder: "e.g. Maple Court · 4B — Jordan Blake" },
    {
      key: "tenantName",
      label: "Tenant",
      type: "select",
      optionsFrom: "tenants",
      placeholder: "Select a tenant…",
      emptyLabel: "No tenants yet — add them in Tenants",
    },
    {
      key: "unit",
      label: "Unit",
      type: "select",
      optionsFrom: "units",
      placeholder: "Select a unit…",
      emptyLabel: "No units yet — add them in Units",
    },
    { key: "rent", label: "Monthly rent", type: "number", placeholder: "0" },
    { key: "dueDay", label: "Due day of month", type: "number", placeholder: "1" },
  ],

  // Populate the Tenant / Unit dropdowns from their own listings. Values are the
  // denormalized labels we store; picking a unit prefills its rent.
  loadCreateOptions: async () => {
    const [tenants, units, properties] = await Promise.all([
      tenantsData.list(),
      unitsData.list(),
      propertiesData.list(),
    ]);
    const propName = new Map((properties || []).map((p) => [p.id, p.name]));
    const dedupe = (arr) => {
      const seen = new Set();
      return arr.filter((o) => {
        if (!o.value || seen.has(o.value)) return false;
        seen.add(o.value);
        return true;
      });
    };

    const tenantOptions = dedupe(
      (tenants || [])
        .filter((t) => t.name)
        .map((t) => ({
          value: t.name,
          label: t.unit ? `${t.name} · ${t.unit}` : t.name,
        })),
    );

    const unitOptions = dedupe(
      (units || [])
        .filter((u) => u.label)
        .map((u) => {
          const pName = propName.get(u.propertyId);
          const composed = pName ? `${pName} · ${u.label}` : u.label;
          return {
            value: composed,
            label: u.rent ? `${composed} — ${currency(u.rent)}` : composed,
            patch: { rent: Number(u.rent) || 0 },
          };
        }),
    );

    return { tenants: tenantOptions, units: unitOptions };
  },
  newRow: (draft) => ({
    name: draft.name.trim(),
    tenantName: draft.tenantName || "",
    unit: draft.unit || "",
    rent: Number(draft.rent) || 0,
    dueDay: Number(draft.dueDay) || 1,
    frequency: "Monthly",
    autopay: false,
    status: "Due",
  }),

  headerMeta: (r) =>
    [r.tenantName, r.unit, currency(r.rent)].filter(Boolean).join(" · "),

  navGroups: [
    {
      group: null,
      items: [
        { key: "overview", label: "Overview", icon: LayoutDashboard, desc: "A snapshot of this rent account." },
      ],
    },
    {
      group: "Collection",
      items: [
        { key: "schedule", label: "Rent & Schedule", icon: CalendarClock, desc: "Rent amount, frequency, and due day." },
        { key: "charges", label: "Charges", icon: ReceiptText, desc: "Rent and other charges by period." },
        { key: "payments", label: "Payments", icon: CircleDollarSign, desc: "Payments received against this account." },
      ],
    },
    {
      group: "Policy",
      items: [
        { key: "lateFees", label: "Late Fees", icon: Percent, desc: "When and how much to charge for late rent." },
        { key: "autopay", label: "Autopay & Method", icon: Repeat, desc: "Autopay and the default payment method." },
        { key: "activity", label: "Activity", icon: Clock, desc: "Notes and history." },
      ],
    },
  ],
  sections: {
    overview: makeOverviewSection({
      fields: [
        { key: "tenantName", label: "Tenant" },
        { key: "unit", label: "Unit" },
        { key: "rent", label: "Monthly rent", format: (v) => currency(v) },
        { key: "dueDay", label: "Due day", format: (v) => ordinalDay(v) },
        { key: "billed", label: "Billed", format: (_v, r) => currency(billedOf(r)) },
        { key: "collected", label: "Collected", format: (_v, r) => currency(collectedOf(r)) },
        { key: "balance", label: "Balance", format: (_v, r) => currency(balanceOf(r)) },
        { key: "status", label: "Status" },
      ],
      note: "Balance is derived live from this account's charges and payments.",
    }),
    schedule: makeFieldsSection([
      { key: "rent", label: "Monthly rent", type: "number" },
      {
        key: "frequency",
        label: "Frequency",
        type: "select",
        options: FREQUENCY_OPTIONS,
      },
      { key: "dueDay", label: "Due day of month", type: "number", placeholder: "1" },
      {
        key: "status",
        label: "Status",
        type: "select",
        options: filterOptions(RENT_STATUS_MAP).slice(1),
      },
      { key: "propertyName", label: "Property", type: "text", meta: true },
      { key: "address", label: "Address", type: "text", meta: true, full: true },
    ]),
    charges: makeMetaListSection({
      field: "charges",
      singular: "charge",
      icon: ReceiptText,
      primaryPlaceholder: "e.g. July 2026 rent",
      secondary: { key: "amount", label: "Amount", type: "number", placeholder: "0" },
    }),
    payments: makeMetaListSection({
      field: "payments",
      singular: "payment",
      icon: CircleDollarSign,
      primaryPlaceholder: "e.g. Payment · Jul 3 (ACH)",
      secondary: { key: "amount", label: "Amount", type: "number", placeholder: "0" },
    }),
    lateFees: makeFieldsSection([
      {
        key: "lateFeeType",
        label: "Fee type",
        type: "select",
        meta: true,
        options: [
          { value: "Flat", label: "Flat amount" },
          { value: "Percent", label: "Percent of rent" },
        ],
      },
      { key: "lateFeeAmount", label: "Fee amount", type: "number", meta: true },
      { key: "graceDays", label: "Grace days", type: "number", meta: true, placeholder: "0" },
    ]),
    autopay: makeFieldsSection([
      { key: "autopay", label: "Autopay enabled", type: "switch" },
      {
        key: "paymentMethod",
        label: "Default method",
        type: "select",
        options: METHOD_OPTIONS,
      },
      { key: "paymentReference", label: "Method reference", type: "text", meta: true, placeholder: "e.g. Bank ••4321" },
    ]),
    activity: makeNotesSection({ field: "activityNotes", placeholder: "Log a note about this account…" }),
  },
};

export function RentCollectionScreen() {
  return <EntityListScreen config={rentConfig} />;
}

export default RentCollectionScreen;
