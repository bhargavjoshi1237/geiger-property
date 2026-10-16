"use client";

import { LayoutDashboard, Link2, Landmark, Scissors, Undo2, FileText, Clock, PiggyBank } from "lucide-react";

import { StatusPill } from "@/components/internal/shared/screen_kit";
import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { securityDepositsData } from "@/lib/supabase/security_deposits";
import { leasesLayer } from "@/lib/supabase/leases";
import { leaseOptions, tenantOptions, unitOptions } from "@/lib/supabase/options";
import {
  makeFieldsSection,
  makeOverviewSection,
  makeMetaListSection,
  makeNotesSection,
} from "@/components/internal/screens/entity/sections/factories";
import { tenantJoinedLoader } from "./joins";
import { DEPOSIT_STATUS_MAP, filterOptions, currency, formatDate } from "./shared";

// Security Deposits — an entity screen over `property.security_deposits`. Track
// deposits held against a lease, deductions, and refunds through their lifecycle.

const deductionsOf = (r) =>
  (Array.isArray(r?.metadata?.deductions) ? r.metadata.deductions : []).reduce(
    (s, d) => s + (Number(d.amount) || 0),
    0,
  );

// Lease options for the create dialog, carrying the lease's deposit as the amount.
async function depositLeaseOptions() {
  const rows = (await leasesLayer.list()) ?? [];
  return rows.map((l) => ({
    value: l.id,
    label: l.deposit ? `${l.name} — ${currency(l.deposit)}` : l.name || "Lease",
    patch: {
      unitId: l.unitId || "",
      unit: l.unit || "",
      tenantId: l.tenantId || "",
      tenantName: l.tenantName || "",
      amount: Number(l.deposit) || 0,
    },
  }));
}

const depositsConfig = {
  key: "deposit",
  singular: "Deposit",
  plural: "Deposits",
  title: "Security Deposits",
  description:
    "Every security deposit you hold — where it's held, what's been deducted, and how much is due back. Search, filter, and reconcile.",
  icon: PiggyBank,
  titleField: "name",
  searchFields: ["name", "unit", "tenantName"],
  data: securityDepositsData,
  rowsLoader: tenantJoinedLoader(securityDepositsData),

  statusMap: DEPOSIT_STATUS_MAP,
  statusFilterOptions: filterOptions(DEPOSIT_STATUS_MAP),

  columns: [
    {
      key: "name",
      header: "Deposit",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="text-xs text-text-secondary">
            {[r.tenantName, r.unit].filter(Boolean).join(" · ") || "No unit linked"}
          </span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusPill status={r.status} map={DEPOSIT_STATUS_MAP} />,
    },
    {
      key: "deductions",
      header: "Deductions",
      align: "right",
      className: "text-right tabular-nums text-text-secondary",
      render: (r) => (deductionsOf(r) ? currency(deductionsOf(r)) : "—"),
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      className: "text-right font-semibold tabular-nums text-foreground",
      render: (r) => currency(r.amount),
    },
  ],

  stats: (rows) => {
    const held = rows.filter((r) => r.status === "Held").length;
    const total = rows
      .filter((r) => r.status === "Held" || r.status === "Partially returned")
      .reduce((s, r) => s + (Number(r.amount) || 0), 0);
    return [
      { label: "Deposits", value: String(rows.length), footer: `${held} held` },
      { label: "Total held", value: currency(total), footer: "Liability on the books" },
      { label: "Returned", value: String(rows.filter((r) => r.status === "Returned").length), footer: "Fully refunded" },
      { label: "Forfeited", value: String(rows.filter((r) => r.status === "Forfeited").length), footer: "Kept" },
    ];
  },

  createDraft: { name: "", leaseId: "", amount: "" },
  createFields: [
    { key: "name", label: "Deposit label", type: "text", placeholder: "e.g. Maple Court · 4B — Jordan Blake" },
    {
      key: "leaseId",
      label: "Lease",
      type: "select",
      optionsFrom: "leases",
      placeholder: "Select a lease…",
      emptyLabel: "No leases yet — add them in Leases",
    },
    { key: "amount", label: "Amount", type: "number", placeholder: "0" },
  ],
  loadCreateOptions: async () => ({ leases: await depositLeaseOptions() }),
  newRow: (draft) => ({
    name: draft.name.trim(),
    leaseId: draft.leaseId || "",
    unitId: draft.unitId || "",
    unit: draft.unit || "",
    tenantId: draft.tenantId || "",
    tenantName: draft.tenantName || "",
    amount: Number(draft.amount) || 0,
    status: "Held",
  }),

  headerMeta: (r) => [r.tenantName, r.unit, currency(r.amount)].filter(Boolean).join(" · "),

  navGroups: [
    {
      group: null,
      items: [
        { key: "overview", label: "Overview", icon: LayoutDashboard, desc: "A snapshot of this deposit." },
        { key: "links", label: "Lease & Tenant", icon: Link2, desc: "The lease, unit, and tenant this deposit secures." },
      ],
    },
    {
      group: "General",
      items: [
        { key: "holding", label: "Amount & Holding", icon: Landmark, desc: "Amount and where it's held." },
        { key: "deductions", label: "Deductions", icon: Scissors, desc: "Charges against the deposit." },
        { key: "refund", label: "Refund", icon: Undo2, desc: "Refund amount and method." },
        { key: "documents", label: "Documents", icon: FileText, desc: "Receipts and statements." },
        { key: "activity", label: "Activity", icon: Clock, desc: "Notes and history." },
      ],
    },
  ],
  sections: {
    overview: makeOverviewSection({
      fields: [
        { key: "tenantName", label: "Tenant" },
        { key: "unit", label: "Unit" },
        { key: "amount", label: "Amount", format: (v) => currency(v) },
        { key: "status", label: "Status" },
        { key: "heldLocation", label: "Held at" },
        { key: "deductionsTotal", label: "Deductions", format: (_v, r) => currency(deductionsOf(r)) },
        {
          key: "balance",
          label: "Refundable balance",
          format: (_v, r) => currency(Math.max(0, (Number(r.amount) || 0) - deductionsOf(r))),
        },
        { key: "refundDate", label: "Refunded on", meta: true, format: (v) => formatDate(v) },
      ],
    }),
    links: makeFieldsSection([
      { key: "leaseId", label: "Lease", type: "relation", load: leaseOptions, full: true },
      { key: "unitId", label: "Unit", type: "relation", load: unitOptions, displayKey: "unit" },
      { key: "tenantId", label: "Tenant", type: "relation", load: tenantOptions, displayKey: "tenantName" },
    ]),
    holding: makeFieldsSection([
      { key: "amount", label: "Amount", type: "number" },
      { key: "heldLocation", label: "Held at", type: "text", placeholder: "e.g. First National — Trust acct" },
      { key: "receivedOn", label: "Received on", type: "date", meta: true },
      { key: "interestBearing", label: "Interest-bearing", type: "switch", meta: true },
      { key: "status", label: "Status", type: "select", options: filterOptions(DEPOSIT_STATUS_MAP).slice(1) },
    ]),
    deductions: makeMetaListSection({
      field: "deductions",
      singular: "deduction",
      icon: Scissors,
      primaryPlaceholder: "e.g. Carpet cleaning",
      secondary: { key: "amount", label: "Amount", type: "number", placeholder: "0" },
    }),
    refund: makeFieldsSection([
      {
        key: "suggestedRefund",
        label: "Suggested refund",
        type: "readonly",
        format: (_v, r) => currency(Math.max(0, (Number(r.amount) || 0) - deductionsOf(r))),
        hint: "Amount minus itemized deductions.",
      },
      { key: "refundAmount", label: "Refund amount", type: "number", meta: true },
      { key: "refundDate", label: "Refund date", type: "date", meta: true },
      {
        key: "refundMethod",
        label: "Method",
        type: "select",
        meta: true,
        options: [
          { value: "Check", label: "Check" },
          { value: "ACH", label: "Bank (ACH)" },
          { value: "Card", label: "Card" },
        ],
      },
    ]),
    documents: makeMetaListSection({
      field: "documents",
      singular: "document",
      icon: FileText,
      primaryPlaceholder: "Document name",
    }),
    activity: makeNotesSection({ field: "activityNotes", placeholder: "Log a note about this deposit…" }),
  },
};

export function SecurityDepositsScreen() {
  return <EntityListScreen config={depositsConfig} />;
}

export default SecurityDepositsScreen;
