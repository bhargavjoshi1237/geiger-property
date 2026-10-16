"use client";

import { LayoutDashboard, Landmark, Scale, Clock, BookOpen } from "lucide-react";

import { StatusPill } from "@/components/internal/shared/screen_kit";
import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { bankAccountsLayer } from "@/lib/supabase/bank_accounts";
import { cashAccountOptions } from "@/lib/supabase/gl_accounts";
import { propertyOptions } from "@/lib/supabase/options";
import { makeLedgerSection } from "./ledger_section";
import { withMetaMirror } from "./sections";
import {
  makeFieldsSection,
  makeOverviewSection,
  makeNotesSection,
} from "@/components/internal/screens/entity/sections/factories";
import {
  BANK_STATUS_MAP,
  BANK_TYPES,
  filterOptions,
  optionsOf,
  currency,
  money,
  formatDate,
  maskLast4,
  todayISO,
} from "./shared";

// Bank Accounts — operating, trust, deposit, and reserve accounts over
// `property.bank_accounts`. Balances are entered by hand (no bank feed).

const TYPE_OPTIONS = optionsOf(BANK_TYPES);
const STATUS_OPTIONS = filterOptions(BANK_STATUS_MAP).slice(1);
const MANUAL_NOTE = "Balances are entered manually — bank feeds aren't connected.";

// Keep only the last four digits of whatever was typed.
const toLast4 = (v) => String(v || "").replace(/\D/g, "").slice(-4);

const sumBalance = (rows) => rows.reduce((s, r) => s + (Number(r.balance) || 0), 0);

// GL label and property name have no column here; they live in metadata.
const DetailFields = withMetaMirror(
  makeFieldsSection([
    { key: "name", label: "Account name", type: "text", full: true },
    { key: "bankName", label: "Bank", type: "text", placeholder: "e.g. First National" },
    { key: "accountType", label: "Type", type: "select", options: TYPE_OPTIONS },
    { key: "last4", label: "Last 4 digits", type: "text", placeholder: "1234", hint: "Only the last four digits are stored." },
    { key: "status", label: "Status", type: "select", options: STATUS_OPTIONS },
    {
      key: "glAccountId",
      label: "Cash GL account",
      type: "relation",
      load: cashAccountOptions,
      displayKey: "account",
      placeholder: "Default for this type",
      hint: "Ledger account this bank posts to. Empty uses Trust Cash, Security Deposit Trust Cash or Operating Cash by type.",
    },
    { key: "propertyId", label: "Property", type: "relation", load: propertyOptions, displayKey: "propertyName", placeholder: "All properties" },
  ]),
  ["account", "propertyName"],
);

// Strip anything but the last four digits before last4 is stored.
function DetailsSection(props) {
  const sanitize = (partial) => ("last4" in partial ? { ...partial, last4: toLast4(partial.last4) } : partial);
  return (
    <DetailFields
      {...props}
      onPatch={(p) => props.onPatch(sanitize(p))}
      onCommit={(p) => props.onCommit(sanitize(p))}
    />
  );
}

const bankConfig = {
  key: "bankAccount",
  singular: "Bank account",
  plural: "Bank accounts",
  title: "Bank Accounts",
  description: `Operating, trust, security-deposit, and reserve accounts and their balances. ${MANUAL_NOTE}`,
  icon: Landmark,
  titleField: "name",
  searchFields: ["name", "bankName", "accountType", "last4"],
  data: bankAccountsLayer.data,

  statusMap: BANK_STATUS_MAP,
  statusFilterOptions: filterOptions(BANK_STATUS_MAP),

  columns: [
    {
      key: "name",
      header: "Account",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="text-xs text-text-secondary">
            {[r.bankName, r.last4 ? maskLast4(r.last4) : null].filter(Boolean).join(" · ") || "—"}
          </span>
        </div>
      ),
    },
    {
      key: "accountType",
      header: "Type",
      className: "text-sm text-text-secondary",
      render: (r) => r.accountType || "—",
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusPill status={r.status} map={BANK_STATUS_MAP} />,
    },
    {
      key: "asOf",
      header: "Balance as of",
      className: "whitespace-nowrap text-sm tabular-nums text-text-tertiary",
      render: (r) => formatDate(r.metadata?.balanceAsOf),
    },
    {
      key: "balance",
      header: "Balance",
      align: "right",
      className: "text-right font-semibold tabular-nums text-foreground",
      render: (r) => money(r.balance),
    },
  ],

  stats: (rows) => {
    const active = rows.filter((r) => r.status === "Active");
    const operating = active.filter((r) => r.accountType === "Operating");
    const held = active.filter((r) => r.accountType === "Trust" || r.accountType === "Security deposit");
    return [
      { label: "Total balance", value: currency(sumBalance(active)), footer: "Across active accounts" },
      { label: "Operating", value: currency(sumBalance(operating)), footer: `${operating.length} accounts` },
      { label: "Trust + deposits", value: currency(sumBalance(held)), footer: `${held.length} accounts` },
      { label: "Accounts", value: String(rows.length), footer: `${active.length} active` },
    ];
  },

  createDraft: { name: "", bankName: "", accountType: "Operating", last4: "", balance: "" },
  createFields: [
    { key: "name", label: "Account name", type: "text", placeholder: "e.g. Maple Court operating" },
    { key: "bankName", label: "Bank", type: "text", placeholder: "e.g. First National" },
    { key: "accountType", label: "Type", type: "select", options: TYPE_OPTIONS },
    { key: "last4", label: "Last 4 digits", type: "text", placeholder: "1234" },
    { key: "balance", label: "Current balance", type: "number", placeholder: "0.00" },
  ],
  newRow: (draft) => ({
    name: draft.name.trim(),
    bankName: draft.bankName.trim(),
    accountType: draft.accountType || "Operating",
    last4: toLast4(draft.last4),
    balance: Number(draft.balance) || 0,
    status: "Active",
    metadata: { balanceAsOf: todayISO() },
  }),

  headerMeta: (r) => [r.accountType, r.bankName, r.last4 ? maskLast4(r.last4) : null].filter(Boolean).join(" · "),

  navGroups: [
    {
      group: null,
      items: [
        { key: "overview", label: "Overview", icon: LayoutDashboard, desc: "A snapshot of this account." },
      ],
    },
    {
      group: "Account",
      items: [
        { key: "details", label: "Details", icon: Landmark, desc: "Bank, type, and account number." },
        { key: "balance", label: "Balance", icon: Scale, desc: MANUAL_NOTE },
        { key: "ledger", label: "Ledger", icon: BookOpen, desc: "Deposits and withdrawals posted against this bank account, with the book balance." },
        { key: "activity", label: "Activity", icon: Clock, desc: "Notes and history." },
      ],
    },
  ],
  sections: {
    overview: makeOverviewSection({
      fields: [
        { key: "bankName", label: "Bank" },
        { key: "accountType", label: "Type" },
        { key: "last4", label: "Account number", format: (v) => maskLast4(v) },
        { key: "balance", label: "Balance", format: (v) => money(v) },
        { key: "balanceAsOf", label: "Balance as of", meta: true, format: (v) => formatDate(v) },
        { key: "lastReconciled", label: "Last reconciled", meta: true, format: (v) => formatDate(v) },
        { key: "status", label: "Status" },
      ],
      note: MANUAL_NOTE,
    }),
    details: DetailsSection,
    balance: makeFieldsSection([
      { key: "balance", label: "Current balance", type: "number", placeholder: "0.00" },
      { key: "balanceAsOf", label: "Balance as of", type: "date", meta: true },
      { key: "lastReconciled", label: "Last reconciled", type: "date", meta: true },
      { key: "statementBalance", label: "Last statement balance", type: "number", meta: true, placeholder: "0.00" },
    ]),
    ledger: makeLedgerSection({
      scope: "bank_account",
      actions: [],
      emptyDescription: "Payments, bill payments and transfers that pick this bank account appear here. Reconcile them in Bank Reconciliation.",
    }),
    activity: makeNotesSection({ field: "activityNotes", placeholder: "Log a note about this account…" }),
  },
};

export function BankAccountsScreen() {
  return <EntityListScreen config={bankConfig} />;
}

export default BankAccountsScreen;
