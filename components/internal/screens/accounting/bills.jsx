"use client";

import { useState } from "react";
import { toast } from "sonner";
import { LayoutDashboard, FileText, CircleDollarSign, Clock, Loader2, Plus, Trash2 } from "lucide-react";

import { EmptyState, Field, StatusPill } from "@/components/internal/shared/screen_kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { billsLayer } from "@/lib/supabase/bills";
import { transactionsLayer } from "@/lib/supabase/transactions";
import { glAccountOptions, propertyOptions, vendorOptions } from "@/lib/supabase/options";
import {
  makeFieldsSection,
  makeOverviewSection,
  makeNotesSection,
} from "@/components/internal/screens/entity/sections/factories";
import {
  BILL_STATUS_MAP,
  filterOptions,
  currency,
  money,
  formatDate,
  todayISO,
  isThisMonth,
  billBalance,
  isBillOverdue,
} from "./shared";
import { SummaryTiles, withMetaMirror } from "./sections";

// Bills & Payables — vendor bills over `property.bills`. Payments live in
// `metadata.payments`; recording one updates amountPaid/status and posts an
// Expense to Transactions.

const STATUS_OPTIONS = filterOptions(BILL_STATUS_MAP).slice(1);
const METHODS = ["ACH", "Check", "Card", "Wire", "Cash"];

const sumPaid = (payments) => payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);

// Status after a payment change; Draft/Void bills keep their status.
const statusFor = (bill, paid) => {
  if (bill.status === "Void") return "Void";
  const amount = Number(bill.amount) || 0;
  if (paid <= 0) return bill.status === "Draft" ? "Draft" : "Open";
  return amount > 0 && paid >= amount ? "Paid" : "Partially paid";
};

// Payments panel: record/remove payments against this bill.
function PaymentsSection({ item, onCommit }) {
  const payments = Array.isArray(item?.metadata?.payments) ? item.metadata.payments : [];
  const balance = billBalance(item);
  const [date, setDate] = useState(todayISO());
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("ACH");
  const [busy, setBusy] = useState(false);
  const locked = item.status === "Void";

  const commitPayments = (next) => {
    const paid = sumPaid(next);
    onCommit({
      amountPaid: paid,
      status: statusFor(item, paid),
      metadata: { ...(item.metadata || {}), payments: next },
    });
  };

  const add = async () => {
    const value = Number(amount || balance);
    if (!(value > 0)) {
      toast.error("Enter a payment amount.");
      return;
    }
    setBusy(true);
    const payment = { id: crypto.randomUUID(), date: date || todayISO(), amount: value, method };
    // Post the matching expense to the ledger, then record the payment on the bill.
    const txn = await transactionsLayer.create({
      id: crypto.randomUUID(),
      name: `Bill: ${item.name}`,
      txnType: "Expense",
      amount: value,
      account: item.account || "",
      payee: item.vendorName || "",
      propertyName: item.propertyName || "",
      propertyId: item.propertyId || "",
      txnDate: payment.date,
      reference: method,
      status: "Cleared",
      metadata: { billId: item.id, paymentId: payment.id },
    });
    setBusy(false);
    if (txn) payment.transactionId = txn.id;
    commitPayments([...payments, payment]);
    setAmount("");
    if (txn) toast.success(`Recorded a ${money(value)} payment.`);
    else toast.error("Payment recorded, but the expense couldn't be posted to Transactions.");
  };

  const remove = async (p) => {
    commitPayments(payments.filter((x) => x.id !== p.id));
    if (p.transactionId && !(await transactionsLayer.softDelete(p.transactionId))) {
      toast.error("Payment removed, but its transaction couldn't be deleted.");
    }
  };

  return (
    <div className="space-y-4">
      <SummaryTiles
        items={[
          { label: "Bill amount", value: money(item.amount) },
          { label: "Paid", value: money(item.amountPaid), className: "text-emerald-600 dark:text-emerald-400" },
          { label: "Balance due", value: money(balance), className: balance > 0 ? "text-red-600 dark:text-red-400" : "text-foreground" },
        ]}
      />

      {locked ? (
        <p className="text-sm text-text-secondary">This bill is void — payments can&apos;t be recorded.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
          <Field label="Date" htmlFor="pay-date">
            <Input id="pay-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="bg-surface-card" />
          </Field>
          <Field label="Amount" htmlFor="pay-amount">
            <Input
              id="pay-amount"
              type="number"
              value={amount}
              placeholder={balance ? balance.toFixed(2) : "0.00"}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              className="bg-surface-card"
            />
          </Field>
          <Field label="Method" htmlFor="pay-method">
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger id="pay-method" className="bg-surface-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={busy} onClick={add}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Record payment
          </Button>
        </div>
      )}

      {payments.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface-subtle">
          <EmptyState
            icon={CircleDollarSign}
            title="No payments yet"
            description="Record a payment — it's posted to Transactions as an expense."
          />
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface-subtle">
          {payments.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{formatDate(p.date)}</p>
                <p className="truncate text-xs text-text-secondary">
                  {[p.method, p.transactionId ? "Posted to Transactions" : null].filter(Boolean).join(" · ")}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-sm font-semibold tabular-nums text-foreground">{money(p.amount)}</span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-red-600 dark:text-red-300 hover:bg-red-500/10"
                  onClick={() => remove(p)}
                  aria-label="Remove payment"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Bills have no property_id column; the picked id lives in the metadata bag.
const DetailFields = withMetaMirror(
  makeFieldsSection([
    { key: "name", label: "Bill", type: "text", full: true },
    { key: "vendorId", label: "Vendor", type: "relation", load: vendorOptions, displayKey: "vendorName" },
    { key: "propertyId", label: "Property", type: "relation", load: propertyOptions, displayKey: "propertyName" },
    { key: "billDate", label: "Bill date", type: "date" },
    { key: "dueDate", label: "Due date", type: "date" },
    { key: "amount", label: "Amount", type: "number", placeholder: "0.00" },
    { key: "status", label: "Status", type: "select", options: STATUS_OPTIONS },
    { key: "account", label: "Expense account", type: "relation", load: glAccountOptions, displayKey: "account" },
    { key: "invoiceNumber", label: "Invoice #", type: "text", meta: true, placeholder: "e.g. INV-1042" },
  ]),
  ["propertyId"],
);

const billsConfig = {
  key: "bill",
  singular: "Bill",
  plural: "Bills",
  title: "Bills & Payables",
  description:
    "Vendor bills you owe — what's due, what's overdue, and what's been paid. Recording a payment posts the expense to Transactions.",
  icon: FileText,
  titleField: "name",
  searchFields: ["name", "vendorName", "propertyName", "account"],
  data: billsLayer.data,

  statusMap: BILL_STATUS_MAP,
  statusFilterOptions: filterOptions(BILL_STATUS_MAP),

  columns: [
    {
      key: "name",
      header: "Bill",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="text-xs text-text-secondary">
            {[r.vendorName, r.propertyName].filter(Boolean).join(" · ") || "—"}
          </span>
        </div>
      ),
    },
    {
      key: "dueDate",
      header: "Due",
      className: "whitespace-nowrap text-sm tabular-nums",
      render: (r) => (
        <span className={isBillOverdue(r) ? "text-red-600 dark:text-red-400" : "text-text-secondary"}>
          {formatDate(r.dueDate)}
          {isBillOverdue(r) ? " · Overdue" : ""}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusPill status={r.status} map={BILL_STATUS_MAP} />,
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      className: "text-right tabular-nums text-text-secondary",
      render: (r) => money(r.amount),
    },
    {
      key: "balance",
      header: "Balance",
      align: "right",
      className: "text-right font-semibold tabular-nums",
      render: (r) =>
        r.status === "Void" ? (
          <span className="text-text-tertiary">—</span>
        ) : (
          <span className={billBalance(r) > 0 ? "text-foreground" : "text-emerald-600 dark:text-emerald-400"}>
            {money(billBalance(r))}
          </span>
        ),
    },
  ],

  stats: (rows) => {
    const open = rows.filter((r) => r.status === "Open" || r.status === "Partially paid");
    const overdue = rows.filter(isBillOverdue);
    const paidThisMonth = rows.reduce((s, r) => {
      const list = Array.isArray(r.metadata?.payments) ? r.metadata.payments : [];
      return s + list.filter((p) => isThisMonth(p.date)).reduce((a, p) => a + (Number(p.amount) || 0), 0);
    }, 0);
    return [
      { label: "Open payables", value: currency(open.reduce((s, r) => s + billBalance(r), 0)), footer: `${open.length} open bills` },
      { label: "Overdue", value: currency(overdue.reduce((s, r) => s + billBalance(r), 0)), footer: `${overdue.length} past due` },
      { label: "Paid this month", value: currency(paidThisMonth), footer: "Payments recorded" },
      { label: "Bills", value: String(rows.length), footer: `${rows.filter((r) => r.status === "Draft").length} drafts` },
    ];
  },

  createDraft: { name: "", vendorId: "", vendorName: "", amount: "", dueDate: "", account: "" },
  createFields: [
    { key: "name", label: "Bill", type: "text", placeholder: "e.g. October landscaping" },
    {
      key: "vendorId",
      label: "Vendor",
      type: "select",
      optionsFrom: "vendors",
      placeholder: "Select a vendor…",
      emptyLabel: "No vendors yet — add them in Vendors",
    },
    { key: "amount", label: "Amount", type: "number", placeholder: "0.00" },
    { key: "dueDate", label: "Due date", type: "date" },
    {
      key: "account",
      label: "Expense account",
      type: "select",
      optionsFrom: "accounts",
      placeholder: "Select an account…",
      emptyLabel: "No accounts yet — add them in Chart of Accounts",
    },
  ],
  loadCreateOptions: async () => {
    const [vendors, accounts] = await Promise.all([vendorOptions(), glAccountOptions()]);
    return { vendors, accounts };
  },
  newRow: (draft) => ({
    name: draft.name.trim(),
    vendorId: draft.vendorId || "",
    vendorName: draft.vendorName || "",
    amount: Math.abs(Number(draft.amount) || 0),
    amountPaid: 0,
    billDate: todayISO(),
    dueDate: draft.dueDate || "",
    account: draft.account || "",
    status: "Open",
  }),

  headerMeta: (r) =>
    [r.vendorName, money(r.amount), r.dueDate ? `Due ${formatDate(r.dueDate)}` : null].filter(Boolean).join(" · "),

  navGroups: [
    {
      group: null,
      items: [
        { key: "overview", label: "Overview", icon: LayoutDashboard, desc: "A snapshot of this bill." },
      ],
    },
    {
      group: "Bill",
      items: [
        { key: "details", label: "Details", icon: FileText, desc: "Vendor, dates, amount, and account." },
        { key: "payments", label: "Payments", icon: CircleDollarSign, desc: "Payments recorded against this bill." },
        { key: "activity", label: "Activity", icon: Clock, desc: "Notes and history." },
      ],
    },
  ],
  sections: {
    overview: makeOverviewSection({
      fields: [
        { key: "vendorName", label: "Vendor" },
        { key: "propertyName", label: "Property" },
        { key: "billDate", label: "Bill date", format: (v) => formatDate(v) },
        { key: "dueDate", label: "Due date", format: (v) => formatDate(v) },
        { key: "amount", label: "Amount", format: (v) => money(v) },
        { key: "amountPaid", label: "Paid", format: (v) => money(v) },
        { key: "balance", label: "Balance due", format: (_v, r) => money(billBalance(r)) },
        { key: "account", label: "Expense account" },
      ],
      note: "Paid and status update automatically as you record payments.",
    }),
    details: DetailFields,
    payments: PaymentsSection,
    activity: makeNotesSection({ field: "activityNotes", placeholder: "Log a note about this bill…" }),
  },
};

export function BillsScreen() {
  return <EntityListScreen config={billsConfig} />;
}

export default BillsScreen;
