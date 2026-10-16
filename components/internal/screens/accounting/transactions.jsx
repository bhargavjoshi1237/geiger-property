"use client";

import { LayoutDashboard, ArrowLeftRight, StickyNote, Clock } from "lucide-react";

import { StatusPill } from "@/components/internal/shared/screen_kit";
import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { transactionsLayer } from "@/lib/supabase/transactions";
import { glAccountOptions, propertyOptions } from "@/lib/supabase/options";
import {
  makeFieldsSection,
  makeOverviewSection,
  makeNotesSection,
} from "@/components/internal/screens/entity/sections/factories";
import {
  TXN_STATUS_MAP,
  TXN_TYPES,
  filterOptions,
  optionsOf,
  currency,
  money,
  formatDate,
  todayISO,
  signedAmount,
} from "./shared";

// Transactions — the general ledger over `property.transactions`: income,
// expenses, and transfers, each posted to a chart-of-accounts account.

const TYPE_OPTIONS = optionsOf(TXN_TYPES);
const STATUS_OPTIONS = filterOptions(TXN_STATUS_MAP).slice(1);

// Signed, coloured amount: income +, expense −, transfers neutral.
function Amount({ row }) {
  const n = Number(row.amount) || 0;
  if (row.txnType === "Income") return <span className="text-emerald-600 dark:text-emerald-400">+{money(n)}</span>;
  if (row.txnType === "Expense") return <span className="text-red-600 dark:text-red-400">−{money(n)}</span>;
  return <span className="text-text-secondary">{money(n)}</span>;
}

const DetailFields = makeFieldsSection([
  { key: "name", label: "Description", type: "text", full: true },
  { key: "txnType", label: "Type", type: "select", options: TYPE_OPTIONS },
  { key: "status", label: "Status", type: "select", options: STATUS_OPTIONS },
  { key: "txnDate", label: "Date", type: "date" },
  { key: "amount", label: "Amount", type: "number", placeholder: "0.00" },
  { key: "account", label: "Account", type: "relation", load: glAccountOptions, displayKey: "account", placeholder: "Select an account…" },
  { key: "propertyId", label: "Property", type: "relation", load: propertyOptions, displayKey: "propertyName" },
  { key: "payee", label: "Payee / payer", type: "text", placeholder: "e.g. City Water Co." },
  { key: "reference", label: "Reference", type: "text", placeholder: "Check #, invoice #…" },
]);

const txnConfig = {
  key: "transaction",
  singular: "Transaction",
  plural: "Transactions",
  title: "Transactions",
  description:
    "Every dollar in and out — income, expenses, and transfers posted to your chart of accounts, by property.",
  icon: ArrowLeftRight,
  titleField: "name",
  searchFields: ["name", "payee", "account", "propertyName", "reference"],
  data: transactionsLayer.data,

  statusMap: TXN_STATUS_MAP,
  statusFilterOptions: filterOptions(TXN_STATUS_MAP),

  views: [
    { value: "all", label: "All", createDefaults: { txnType: "Income" } },
    { value: "income", label: "Income", filter: (r) => r.txnType === "Income", createDefaults: { txnType: "Income" } },
    { value: "expense", label: "Expenses", filter: (r) => r.txnType === "Expense", createDefaults: { txnType: "Expense" } },
    { value: "transfer", label: "Transfers", filter: (r) => r.txnType === "Transfer", createDefaults: { txnType: "Transfer" } },
  ],

  columns: [
    {
      key: "txnDate",
      header: "Date",
      className: "whitespace-nowrap text-sm tabular-nums text-text-secondary",
      render: (r) => formatDate(r.txnDate),
    },
    {
      key: "name",
      header: "Transaction",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="text-xs text-text-secondary">
            {[r.txnType, r.payee, r.account].filter(Boolean).join(" · ") || "—"}
          </span>
        </div>
      ),
    },
    {
      key: "propertyName",
      header: "Property",
      className: "text-sm text-text-secondary",
      render: (r) => r.propertyName || "—",
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusPill status={r.status} map={TXN_STATUS_MAP} />,
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      className: "text-right font-semibold tabular-nums",
      render: (r) => <Amount row={r} />,
    },
  ],

  stats: (rows) => {
    const live = rows.filter((r) => r.status !== "Void");
    const income = live.filter((r) => r.txnType === "Income").reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const expense = live.filter((r) => r.txnType === "Expense").reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const net = live.reduce((s, r) => s + signedAmount(r), 0);
    const pending = rows.filter((r) => r.status === "Pending");
    return [
      { label: "Income", value: currency(income), footer: `${live.filter((r) => r.txnType === "Income").length} entries` },
      { label: "Expenses", value: currency(expense), footer: `${live.filter((r) => r.txnType === "Expense").length} entries` },
      { label: "Net", value: currency(net), footer: "Income less expenses" },
      { label: "Uncleared", value: String(pending.length), footer: `${currency(pending.reduce((s, r) => s + (Number(r.amount) || 0), 0))} pending` },
    ];
  },

  createDraft: { name: "", txnType: "", amount: "", txnDate: "", account: "", propertyId: "", propertyName: "" },
  createFields: [
    { key: "name", label: "Description", type: "text", placeholder: "e.g. October water bill" },
    { key: "txnType", label: "Type", type: "select", options: TYPE_OPTIONS, placeholder: "Matches the current view…" },
    { key: "amount", label: "Amount", type: "number", placeholder: "0.00" },
    { key: "txnDate", label: "Date", type: "date" },
    {
      key: "account",
      label: "Account",
      type: "select",
      optionsFrom: "accounts",
      placeholder: "Select an account…",
      emptyLabel: "No accounts yet — add them in Chart of Accounts",
    },
    {
      key: "propertyId",
      label: "Property",
      type: "select",
      optionsFrom: "properties",
      placeholder: "Select a property…",
      emptyLabel: "No properties yet",
    },
  ],
  loadCreateOptions: async () => {
    const [accounts, properties] = await Promise.all([glAccountOptions(), propertyOptions()]);
    return { accounts, properties };
  },
  // Type is only set when picked, so the active view's default applies otherwise.
  newRow: (draft) => ({
    name: draft.name.trim(),
    ...(draft.txnType ? { txnType: draft.txnType } : {}),
    amount: Math.abs(Number(draft.amount) || 0),
    txnDate: draft.txnDate || todayISO(),
    account: draft.account || "",
    propertyId: draft.propertyId || "",
    propertyName: draft.propertyName || "",
    status: "Cleared",
  }),

  headerMeta: (r) =>
    [r.txnType, formatDate(r.txnDate), money(r.amount)].filter(Boolean).join(" · "),

  navGroups: [
    {
      group: null,
      items: [
        { key: "overview", label: "Overview", icon: LayoutDashboard, desc: "A snapshot of this transaction." },
      ],
    },
    {
      group: "Ledger",
      items: [
        { key: "details", label: "Details", icon: ArrowLeftRight, desc: "Type, amount, account, and property." },
        { key: "memo", label: "Memo", icon: StickyNote, desc: "Internal memo for this entry." },
        { key: "activity", label: "Activity", icon: Clock, desc: "Notes and history." },
      ],
    },
  ],
  sections: {
    overview: makeOverviewSection({
      fields: [
        { key: "txnType", label: "Type" },
        { key: "amount", label: "Amount", format: (v) => money(v) },
        { key: "txnDate", label: "Date", format: (v) => formatDate(v) },
        { key: "account", label: "Account" },
        { key: "propertyName", label: "Property" },
        { key: "payee", label: "Payee / payer" },
        { key: "reference", label: "Reference" },
        { key: "status", label: "Status" },
      ],
      note: "Amounts are entered as positive numbers — the type decides whether it adds to or subtracts from net.",
    }),
    details: DetailFields,
    memo: makeNotesSection({ field: "memo", placeholder: "Add a memo for this entry…" }),
    activity: makeNotesSection({ field: "activityNotes", placeholder: "Log a note about this transaction…" }),
  },
};

export function TransactionsScreen() {
  return <EntityListScreen config={txnConfig} />;
}

export default TransactionsScreen;
