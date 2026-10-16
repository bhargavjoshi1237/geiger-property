"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { LayoutDashboard, ArrowLeftRight, StickyNote, Clock, BookOpen, Ban, Send } from "lucide-react";

import { DataTable, EmptyState, StatusPill } from "@/components/internal/shared/screen_kit";
import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { transactionsLayer } from "@/lib/supabase/transactions";
import { glAccountIdOptions } from "@/lib/supabase/gl_accounts";
import { bankAccountsLayer } from "@/lib/supabase/bank_accounts";
import { propertyOptions } from "@/lib/supabase/options";
import {
  getLedgerEntry,
  ledgerErrorMessage,
  listLedgerAccounts,
  postCashTransaction,
  voidEntry,
} from "@/lib/supabase/ledger";
import { accountLabel } from "@/lib/ledger/postings";
import {
  makeFieldsSection,
  makeOverviewSection,
  makeNotesSection,
} from "@/components/internal/screens/entity/sections/factories";
import { SectionLoading, SummaryTiles, withMetaMirror } from "./sections";
import { NO_POST, useCanPost } from "./ledger_dialogs";
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

// Transactions — cash-basis income, expenses and transfers over
// `property.transactions`. Each one posts a balanced entry to the general
// ledger (GL account by id, bank account → its cash GL); voiding or deleting a
// transaction posts the reversal.

const TYPE_OPTIONS = optionsOf(TXN_TYPES);
const STATUS_OPTIONS = filterOptions(TXN_STATUS_MAP).slice(1);
const DIRECTION = { Income: "in", Expense: "out", Transfer: "transfer" };

async function bankOptions() {
  const rows = (await bankAccountsLayer.list()) ?? [];
  return rows
    .filter((b) => b.status !== "Closed")
    .map((b) => ({ value: b.id, label: [b.name, b.accountType].filter(Boolean).join(" · "), patch: { bankAccountName: b.name } }));
}

// Transfer targets carry no display patch (bankAccountName is the source's).
const transferOptions = async () => (await bankOptions()).map((o) => ({ ...o, patch: {} }));

const accountOptionsFor = (type) =>
  type === "Income" ? glAccountIdOptions({ types: ["Income"] }) : type === "Expense" ? glAccountIdOptions({ types: ["Expense", "Asset", "Liability"] }) : glAccountIdOptions();

// Post a transaction row to the ledger → entry id or null.
async function postTransaction(row) {
  const posted = await postCashTransaction({
    direction: DIRECTION[row.txnType] || "in",
    amount: row.amount,
    date: row.txnDate || todayISO(),
    memo: row.name,
    glAccountId: row.glAccountId,
    bankAccountId: row.bankAccountId || undefined,
    toBankAccountId: row.metadata?.toBankAccountId || undefined,
    propertyId: row.propertyId || undefined,
    unitId: row.unitId || undefined,
    leaseId: row.leaseId || undefined,
    tenantId: row.tenantId || undefined,
    vendorId: row.vendorId || undefined,
    ownerId: row.ownerId || undefined,
    sourceId: row.id,
    idempotencyKey: `txn:${row.id}`,
  });
  return posted?.entryId || null;
}

// Data contract: creating posts to the ledger; deleting voids the posted entry.
const txnData = {
  ...transactionsLayer.data,
  create: async (input) => {
    const row = await transactionsLayer.create(input);
    if (!row || row.ledgerEntryId || row.status === "Void" || row.status === "Draft") return row;
    const entryId = await postTransaction(row);
    if (!entryId) {
      toast.error(`Saved, but not posted to the ledger: ${ledgerErrorMessage() || "unknown error"}`);
      return row;
    }
    return (await transactionsLayer.update(row.id, { ledgerEntryId: entryId })) || { ...row, ledgerEntryId: entryId };
  },
  softDelete: async (id) => {
    const row = await transactionsLayer.get(id);
    if (row?.ledgerEntryId && row.status !== "Void") {
      const voided = await voidEntry(row.ledgerEntryId, { memo: `Deleted: ${row.name}` });
      if (!voided && !/already void/.test(ledgerErrorMessage())) return false;
    }
    return transactionsLayer.softDelete(id);
  },
};

// Signed, coloured amount: income +, expense −, transfers neutral.
function Amount({ row }) {
  const n = Number(row.amount) || 0;
  if (row.txnType === "Income") return <span className="text-emerald-600 dark:text-emerald-400">+{money(n)}</span>;
  if (row.txnType === "Expense") return <span className="text-red-600 dark:text-red-400">−{money(n)}</span>;
  return <span className="text-text-secondary">{money(n)}</span>;
}

// The balanced ledger lines this transaction posted.
function LedgerEntrySection({ item, runAction }) {
  const [state, setState] = useState(null);
  const canPost = useCanPost();
  useEffect(() => {
    let alive = true;
    if (!item.ledgerEntryId) {
      Promise.resolve().then(() => alive && setState({ entry: null }));
    } else {
      Promise.all([getLedgerEntry(item.ledgerEntryId), listLedgerAccounts()]).then(
        ([entry, accounts]) => alive && setState({ entry, accounts }),
      );
    }
    return () => {
      alive = false;
    };
  }, [item.ledgerEntryId]);

  if (!state) return <SectionLoading />;
  if (!state.entry) {
    return (
      <div className="rounded-xl border border-border bg-surface-subtle">
        <EmptyState
          icon={BookOpen}
          title="Not posted to the ledger"
          description="Older or draft transactions may not have a ledger entry yet."
          action={
            item.status !== "Void" && canPost ? (
              <button type="button" className="text-sm font-medium text-foreground underline-offset-4 hover:underline" onClick={() => runAction("post")}>
                Post to ledger
              </button>
            ) : null
          }
        />
      </div>
    );
  }
  const { entry, accounts } = state;
  const dr = entry.lines.reduce((s, l) => s + l.debit, 0);
  return (
    <div className="space-y-4">
      <SummaryTiles
        items={[
          { label: "Entry date", value: formatDate(entry.date) },
          { label: "Total", value: money(dr) },
          { label: "Status", value: entry.status === "void" ? "Void" : "Posted", className: entry.status === "void" ? "text-text-tertiary" : "text-emerald-600 dark:text-emerald-400" },
        ]}
      />
      <DataTable
        columns={[
          { key: "account", header: "Account", render: (l) => <span className="text-foreground">{accountLabel(accounts?.byId.get(l.glAccountId)) || "—"}</span> },
          { key: "memo", header: "Memo", className: "text-sm text-text-secondary", render: (l) => l.memo || "—" },
          { key: "debit", header: "Debit", align: "right", className: "text-right tabular-nums", render: (l) => (l.debit ? money(l.debit) : "—") },
          { key: "credit", header: "Credit", align: "right", className: "text-right tabular-nums", render: (l) => (l.credit ? money(l.credit) : "—") },
        ]}
        data={entry.lines}
        getRowKey={(l) => l.id}
      />
    </div>
  );
}

// Bank names and the transfer target have no column; they live in metadata.
const DetailFields = withMetaMirror(makeFieldsSection([
  { key: "name", label: "Description", type: "text", full: true },
  { key: "txnType", label: "Type", type: "select", options: TYPE_OPTIONS, disabled: (i) => Boolean(i.ledgerEntryId) },
  { key: "status", label: "Status", type: "select", options: STATUS_OPTIONS.filter((o) => o.value !== "Void") },
  { key: "txnDate", label: "Date", type: "date", disabled: (i) => Boolean(i.ledgerEntryId) },
  { key: "amount", label: "Amount", type: "currency", placeholder: "0.00", disabled: (i) => Boolean(i.ledgerEntryId) },
  { key: "glAccountId", label: "GL account", type: "relation", load: glAccountIdOptions, displayKey: "account", placeholder: "Select an account…", disabled: (i) => Boolean(i.ledgerEntryId), showIf: (i) => i.txnType !== "Transfer" },
  { key: "bankAccountId", label: "Bank account", type: "relation", load: bankOptions, displayKey: "bankAccountName", placeholder: "Default operating cash", disabled: (i) => Boolean(i.ledgerEntryId) },
  { key: "toBankAccountId", label: "Transfer to", type: "relation", load: transferOptions, placeholder: "Select a bank account…", showIf: (i) => i.txnType === "Transfer", disabled: (i) => Boolean(i.ledgerEntryId) },
  { key: "propertyId", label: "Property", type: "relation", load: propertyOptions, displayKey: "propertyName" },
  { key: "payee", label: "Payee / payer", type: "text", placeholder: "e.g. City Water Co." },
  { key: "reference", label: "Reference", type: "text", placeholder: "Check #, invoice #…" },
  { key: "posted", label: "Ledger", type: "readonly", format: (_v, i) => (i.ledgerEntryId ? "Posted — void to change amounts or accounts" : "Not posted") },
]), ["bankAccountName", "toBankAccountId"]);

const txnConfig = {
  key: "transaction",
  singular: "Transaction",
  plural: "Transactions",
  title: "Transactions",
  description:
    "Every dollar in and out — income, expenses, and transfers, each posted to the general ledger against a GL account and bank account.",
  icon: ArrowLeftRight,
  titleField: "name",
  // Creating posts to the ledger; deleting voids the posted entry.
  createPermission: "accounting.post",
  createPermissionNote: NO_POST,
  deletePermission: "accounting.void",
  searchFields: ["name", "payee", "account", "propertyName", "reference"],
  data: txnData,

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
            {[r.txnType, r.payee, r.account, r.ledgerEntryId ? "Posted" : null].filter(Boolean).join(" · ") || "—"}
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
    const unposted = live.filter((r) => !r.ledgerEntryId && r.status !== "Draft");
    return [
      { label: "Income", value: currency(income), footer: `${live.filter((r) => r.txnType === "Income").length} entries` },
      { label: "Expenses", value: currency(expense), footer: `${live.filter((r) => r.txnType === "Expense").length} entries` },
      { label: "Net", value: currency(net), footer: "Income less expenses" },
      { label: "Not in ledger", value: String(unposted.length), footer: "Post them from the editor" },
    ];
  },

  createDraft: { name: "", txnType: "", amount: "", txnDate: "", glAccountId: "", account: "", bankAccountId: "", propertyId: "", propertyName: "" },
  createFields: [
    { key: "name", label: "Description", type: "text", placeholder: "e.g. October water bill" },
    { key: "txnType", label: "Type", type: "select", options: TYPE_OPTIONS, placeholder: "Matches the current view…" },
    { key: "amount", label: "Amount", type: "number", placeholder: "0.00" },
    { key: "txnDate", label: "Date", type: "date" },
    {
      key: "glAccountId",
      label: "GL account (income / expense)",
      type: "select",
      optionsFrom: "accounts",
      placeholder: "Select an account…",
      emptyLabel: "No accounts yet — add them in Chart of Accounts",
    },
    {
      key: "bankAccountId",
      label: "Bank account",
      type: "select",
      optionsFrom: "banks",
      placeholder: "Default operating cash",
      emptyLabel: "No bank accounts yet",
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
    const [accounts, banks, properties] = await Promise.all([accountOptionsFor(), bankOptions(), propertyOptions()]);
    return { accounts, banks, properties };
  },
  // Type is only set when picked, so the active view's default applies otherwise.
  newRow: (draft) => ({
    name: draft.name.trim(),
    ...(draft.txnType ? { txnType: draft.txnType } : {}),
    amount: Math.abs(Number(draft.amount) || 0),
    txnDate: draft.txnDate || todayISO(),
    glAccountId: draft.glAccountId || "",
    account: draft.account || "",
    bankAccountId: draft.bankAccountId || "",
    propertyId: draft.propertyId || "",
    propertyName: draft.propertyName || "",
    status: "Cleared",
    metadata: draft.bankAccountName ? { bankAccountName: draft.bankAccountName } : {},
  }),

  headerMeta: (r) =>
    [r.txnType, formatDate(r.txnDate), money(r.amount), r.ledgerEntryId ? "In ledger" : "Not in ledger"].filter(Boolean).join(" · "),

  actions: [
    {
      key: "post",
      label: "Post to ledger",
      icon: Send,
      permission: "accounting.post",
      showIf: (i) => !i.ledgerEntryId && i.status !== "Void",
      run: async ({ item, commit }) => {
        const entryId = await postTransaction(item);
        if (!entryId) {
          toast.error(ledgerErrorMessage() || "Couldn't post to the ledger.");
          return;
        }
        if (await commit({ ledgerEntryId: entryId, ...(item.status === "Draft" ? { status: "Cleared" } : {}) })) toast.success("Posted to the ledger.");
      },
    },
    {
      key: "void",
      label: "Void transaction",
      icon: Ban,
      permission: "accounting.void",
      danger: true,
      separatorBefore: true,
      showIf: (i) => i.status !== "Void",
      run: async ({ item, commit }) => {
        if (item.ledgerEntryId) {
          const voided = await voidEntry(item.ledgerEntryId, { memo: `Void: ${item.name}` });
          if (!voided && !/already void/.test(ledgerErrorMessage())) {
            toast.error(ledgerErrorMessage() || "Couldn't void the ledger entry.");
            return;
          }
        }
        if (await commit({ status: "Void" })) toast.success("Transaction voided — the ledger entry was reversed.");
      },
    },
  ],

  navGroups: [
    {
      group: null,
      items: [{ key: "overview", label: "Overview", icon: LayoutDashboard, desc: "A snapshot of this transaction." }],
    },
    {
      group: "Ledger",
      items: [
        { key: "details", label: "Details", icon: ArrowLeftRight, desc: "Type, amount, GL account, bank account, and property." },
        { key: "entry", label: "Ledger entry", icon: BookOpen, desc: "The balanced debit and credit lines this transaction posted." },
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
        { key: "account", label: "GL account" },
        { key: "bankAccountName", label: "Bank account", meta: true },
        { key: "propertyName", label: "Property" },
        { key: "payee", label: "Payee / payer" },
        { key: "reference", label: "Reference" },
        { key: "status", label: "Status" },
      ],
      note: "Amounts are entered as positive numbers — the type decides the debit and credit side in the ledger.",
    }),
    details: DetailFields,
    entry: LedgerEntrySection,
    memo: makeNotesSection({ field: "memo", placeholder: "Add a memo for this entry…" }),
    activity: makeNotesSection({ field: "activityNotes", placeholder: "Log a note about this transaction…" }),
  },
};

export function TransactionsScreen() {
  return <EntityListScreen config={txnConfig} />;
}

export default TransactionsScreen;
