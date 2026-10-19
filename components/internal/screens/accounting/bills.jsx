"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  LayoutDashboard,
  FileText,
  CircleDollarSign,
  Clock,
  Loader2,
  Plus,
  Ban,
  BookOpen,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Send,
  SlidersHorizontal,
} from "lucide-react";

import { EmptyState, Field, StatusPill } from "@/components/internal/shared/screen_kit";
import { Button } from "@geiger/ui/button";
import { Input } from "@geiger/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@geiger/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@geiger/ui/select";
import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { billsLayer } from "@/lib/supabase/bills";
import { transactionsLayer } from "@/lib/supabase/transactions";
import { glAccountIdOptions } from "@/lib/supabase/gl_accounts";
import { costJobOptions } from "@/lib/supabase/cost_jobs";
import { getSetting, saveSetting } from "@/lib/supabase/settings";
import { getUser } from "@/lib/supabase/user";
import { propertyOptions, unitOptions, vendorOptions, workOrderOptions } from "@/lib/supabase/options";
import { ledgerErrorMessage, payBill, postBill, voidEntry } from "@/lib/supabase/ledger";
import {
  makeFieldsSection,
  makeOverviewSection,
  makeNotesSection,
} from "@/components/internal/screens/entity/sections/factories";
import { RoleGate } from "@/components/internal/shared/role_gate";
import { BankAccountSelect, NO_POST, useCanPost, useCanVoid } from "./ledger_dialogs";
import { makeLedgerSection } from "./ledger_section";
import {
  APPROVAL_STATUS_MAP,
  BILL_STATUS_MAP,
  AGING_BUCKETS,
  agingBucket,
  filterOptions,
  currency,
  money,
  formatDate,
  todayISO,
  isThisMonth,
  billBalance,
  isBillOverdue,
  isBillApproved,
} from "./shared";
import { SummaryTiles, withMetaMirror } from "./sections";

// Bills & Payables — vendor bills over `property.bills`. An approved bill posts
// to Accounts Payable (Dr expense / Cr AP); each payment posts Dr AP / Cr cash
// and is mirrored to Transactions. Bills above the approval limit (setting
// `accounting_settings.billApprovalLimit`) wait for approval before posting.

const STATUS_OPTIONS = filterOptions(BILL_STATUS_MAP).slice(1);
const METHODS = ["ACH", "Check", "Card", "Wire", "Cash"];
const SETTINGS_KEY = "accounting_settings";
const OPEN = (b) => b.status === "Open" || b.status === "Partially paid";

// Approval limit cached from settings so newRow (sync) can apply it.
let approvalLimit = 0;
const loadApprovalLimit = async () => {
  const s = await getSetting(SETTINGS_KEY, {});
  approvalLimit = Number(s?.billApprovalLimit) || 0;
  return s || {};
};

const sumPaid = (payments) => payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);

// Status after a payment change; Draft/Void bills keep their status.
const statusFor = (bill, paid) => {
  if (bill.status === "Void") return "Void";
  const amount = Number(bill.amount) || 0;
  if (paid <= 0) return bill.status === "Draft" ? "Draft" : "Open";
  return amount > 0 && paid >= amount ? "Paid" : "Partially paid";
};

// Post the bill to AP → entry id or null.
async function postBillToLedger(bill) {
  const posted = await postBill({
    date: bill.billDate || todayISO(),
    amount: bill.amount,
    glAccountId: bill.glAccountId || undefined,
    vendorId: bill.vendorId || undefined,
    propertyId: bill.propertyId || undefined,
    unitId: bill.unitId || undefined,
    jobId: bill.jobId || undefined,
    memo: `Bill: ${bill.name}${bill.vendorName ? ` · ${bill.vendorName}` : ""}`,
    sourceId: bill.id,
    idempotencyKey: `bill:${bill.id}`,
  });
  return posted?.entryId || null;
}

const canPostToAp = (b) => !b.ledgerEntryId && OPEN(b) && isBillApproved(b);

// Data contract: creating an approved, open bill posts it to AP.
const billsData = {
  ...billsLayer.data,
  create: async (input) => {
    const row = await billsLayer.create(input);
    if (!row || !canPostToAp(row)) return row;
    const entryId = await postBillToLedger(row);
    if (!entryId) {
      toast.error(`Saved, but not posted to AP: ${ledgerErrorMessage() || "unknown error"}`);
      return row;
    }
    return (await billsLayer.update(row.id, { ledgerEntryId: entryId })) || { ...row, ledgerEntryId: entryId };
  },
};

// Payments panel: each payment posts Dr AP / Cr cash and a Transactions row.
function PaymentsSection({ item, onCommit }) {
  const payments = Array.isArray(item?.metadata?.payments) ? item.metadata.payments : [];
  const balance = billBalance(item);
  const [date, setDate] = useState(todayISO());
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("ACH");
  const [bankAccountId, setBankAccountId] = useState("");
  const [busy, setBusy] = useState(false);
  const locked = item.status === "Void" || item.status === "Draft";
  const approved = isBillApproved(item);
  const canPost = useCanPost();
  const canVoid = useCanVoid();

  const commitPayments = (next, extra = {}) => {
    const paid = sumPaid(next);
    return onCommit({
      amountPaid: paid,
      status: statusFor(item, paid),
      metadata: { ...(item.metadata || {}), payments: next },
      ...extra,
    });
  };

  const add = async () => {
    if (!canPost) {
      toast.error(NO_POST);
      return;
    }
    const value = Number(amount || balance);
    if (!(value > 0)) {
      toast.error("Enter a payment amount.");
      return;
    }
    setBusy(true);
    // Make sure the bill itself is in AP before paying it.
    let billEntryId = item.ledgerEntryId;
    if (!billEntryId) billEntryId = await postBillToLedger(item);
    if (!billEntryId) {
      setBusy(false);
      toast.error(ledgerErrorMessage() || "Couldn't post the bill to Accounts Payable.");
      return;
    }
    const payment = { id: crypto.randomUUID(), date: date || todayISO(), amount: value, method, bankAccountId };
    const posted = await payBill({
      date: payment.date,
      amount: value,
      billEntryId,
      vendorId: item.vendorId || undefined,
      propertyId: item.propertyId || undefined,
      bankAccountId: bankAccountId || undefined,
      method,
      memo: `Payment: ${item.name}`,
      sourceId: item.id,
      idempotencyKey: `billpay:${payment.id}`,
    });
    if (!posted) {
      setBusy(false);
      toast.error(ledgerErrorMessage() || "Couldn't post the payment to the ledger.");
      return;
    }
    payment.ledgerEntryId = posted.entryId;
    // Mirror to Transactions (already posted, so the row carries the entry id).
    const txn = await transactionsLayer.create({
      id: crypto.randomUUID(),
      name: `Bill: ${item.name}`,
      txnType: "Expense",
      amount: value,
      glAccountId: item.glAccountId || "",
      account: item.account || "",
      payee: item.vendorName || "",
      vendorId: item.vendorId || "",
      billId: item.id,
      bankAccountId: bankAccountId || "",
      propertyName: item.propertyName || "",
      propertyId: item.propertyId || "",
      txnDate: payment.date,
      reference: method,
      status: "Cleared",
      ledgerEntryId: posted.entryId,
      metadata: { billId: item.id, paymentId: payment.id },
    });
    setBusy(false);
    if (txn) payment.transactionId = txn.id;
    await commitPayments([...payments, payment], item.ledgerEntryId ? {} : { ledgerEntryId: billEntryId });
    setAmount("");
    toast.success(`Recorded a ${money(value)} payment.`);
  };

  // Removing a payment voids its ledger entry and voids the mirrored transaction.
  const remove = async (p) => {
    if (p.ledgerEntryId) {
      const voided = await voidEntry(p.ledgerEntryId, { memo: `Payment removed: ${item.name}` });
      if (!voided && !/already void/.test(ledgerErrorMessage())) {
        toast.error(ledgerErrorMessage() || "Couldn't void the payment entry.");
        return;
      }
    }
    commitPayments(payments.filter((x) => x.id !== p.id));
    if (p.transactionId) await transactionsLayer.update(p.transactionId, { status: "Void" });
    toast.success("Payment removed and reversed in the ledger.");
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
        <p className="text-sm text-text-secondary">
          {item.status === "Void" ? "This bill is void — payments can't be recorded." : "Open this draft bill before paying it."}
        </p>
      ) : !approved ? (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          This bill needs approval before it can be paid — use Actions → Approve bill.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_auto] lg:items-end">
          <Field label="Date" htmlFor="pay-date">
            <Input id="pay-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Amount" htmlFor="pay-amount">
            <Input
              id="pay-amount"
              type="number"
              value={amount}
              placeholder={balance ? balance.toFixed(2) : "0.00"}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
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
          <Field label="Pay from" htmlFor="pay-bank">
            <BankAccountSelect id="pay-bank" value={bankAccountId} onChange={setBankAccountId} />
          </Field>
          <RoleGate allowed={canPost} reason={NO_POST}>
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={busy || !canPost} onClick={add}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Record Payment
            </Button>
          </RoleGate>
        </div>
      )}

      {payments.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface-subtle">
          <EmptyState
            icon={CircleDollarSign}
            title="No payments yet"
            description="Each payment posts Dr Accounts Payable / Cr cash and shows up in Transactions."
          />
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface-subtle">
          {payments.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{formatDate(p.date)}</p>
                <p className="truncate text-xs text-text-secondary">
                  {[p.method, p.ledgerEntryId ? "Posted to ledger" : p.transactionId ? "Posted to Transactions" : null].filter(Boolean).join(" · ")}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-sm font-semibold tabular-nums text-foreground">{money(p.amount)}</span>
                {canVoid ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-red-600 dark:text-red-300 hover:bg-red-500/10"
                    onClick={() => remove(p)}
                    aria-label="Void payment"
                  >
                    <Ban className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Approval panel: status, approver, limit in force.
function ApprovalSection({ item, runAction }) {
  const [limit, setLimit] = useState(null);
  const canPost = useCanPost();
  useEffect(() => {
    let alive = true;
    loadApprovalLimit().then(() => alive && setLimit(approvalLimit));
    return () => {
      alive = false;
    };
  }, []);
  const status = item.approvalStatus || "Not required";
  return (
    <div className="space-y-4">
      <SummaryTiles
        items={[
          { label: "Approval", value: APPROVAL_STATUS_MAP[status]?.label || status },
          { label: "Approver", value: item.approverName || "—" },
          { label: "Approved on", value: formatDate(item.approvedAt) },
          { label: "Approval limit", value: limit === null ? "…" : limit ? money(limit) : "None" },
        ]}
      />
      <div className="flex flex-wrap gap-2">
        {status === "Pending" || status === "Rejected" ? (
          <RoleGate allowed={canPost} reason={NO_POST}>
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={!canPost} onClick={() => runAction("approve")}>
              <CheckCircle2 className="h-4 w-4" /> Approve Bill
            </Button>
          </RoleGate>
        ) : null}
        {status === "Pending" ? (
          <Button variant="outline" className="border-border bg-surface-card" onClick={() => runAction("reject")}>
            <XCircle className="h-4 w-4" /> Reject
          </Button>
        ) : null}
        {status === "Not required" || status === "Approved" ? (
          <Button variant="outline" className="border-border bg-surface-card" onClick={() => runAction("request")}>
            <ShieldCheck className="h-4 w-4" /> Require Approval
          </Button>
        ) : null}
      </div>
      <p className="text-sm text-text-secondary">
        Bills above the approval limit start as pending. They post to Accounts Payable and become payable once approved.
      </p>
    </div>
  );
}

// Header action: edit the approval limit setting.
function ApprovalRulesButton({ reload }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const show = async () => {
    setOpen(true);
    await loadApprovalLimit();
    setValue(approvalLimit ? String(approvalLimit) : "");
  };
  const save = async () => {
    setBusy(true);
    const current = (await getSetting(SETTINGS_KEY, {})) || {};
    const ok = await saveSetting(SETTINGS_KEY, { ...current, billApprovalLimit: Number(value) || 0 });
    setBusy(false);
    if (!ok) {
      toast.error("Couldn't save the approval limit.");
      return;
    }
    approvalLimit = Number(value) || 0;
    toast.success(approvalLimit ? `Bills over ${money(approvalLimit)} now need approval.` : "Bill approvals turned off.");
    setOpen(false);
    reload();
  };
  return (
    <>
      <Button variant="outline" className="border-border bg-surface-card" onClick={show}>
        <SlidersHorizontal className="h-4 w-4" /> Approval Rules
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Bill approval rules</DialogTitle>
            <DialogDescription>New bills above this amount wait for approval before posting to Accounts Payable.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <Field label="Approval limit" htmlFor="appr-limit" hint="Leave blank or 0 to skip approvals.">
              <Input id="appr-limit" type="number" placeholder="e.g. 1000" value={value} onChange={(e) => setValue(e.target.value)} />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={busy} onClick={save}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save Rules
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Columns without a dedicated column (names) are mirrored into metadata.
const DetailFields = withMetaMirror(
  makeFieldsSection([
    { key: "name", label: "Bill", type: "text", full: true },
    { key: "vendorId", label: "Vendor", type: "relation", load: vendorOptions, displayKey: "vendorName" },
    { key: "invoiceNumber", label: "Invoice #", type: "text", meta: true, placeholder: "e.g. INV-1042" },
    { key: "billDate", label: "Bill date", type: "date", disabled: (i) => Boolean(i.ledgerEntryId) },
    { key: "dueDate", label: "Due date", type: "date" },
    { key: "amount", label: "Amount", type: "currency", placeholder: "0.00", disabled: (i) => Boolean(i.ledgerEntryId) },
    { key: "status", label: "Status", type: "select", options: STATUS_OPTIONS.filter((o) => o.value !== "Void") },
    { key: "glAccountId", label: "Expense account", type: "relation", load: () => glAccountIdOptions({ types: ["Expense", "Asset"] }), displayKey: "account", disabled: (i) => Boolean(i.ledgerEntryId) },
    { key: "propertyId", label: "Property", type: "relation", load: propertyOptions, displayKey: "propertyName" },
    { key: "unitId", label: "Unit", type: "relation", load: unitOptions, displayKey: "unit" },
    { key: "jobId", label: "Job", type: "relation", load: costJobOptions, displayKey: "jobName", hint: "Tag this cost to a unit turn or capital project." },
    { key: "workOrderId", label: "Work order", type: "relation", load: workOrderOptions, displayKey: "workOrderLabel" },
    { key: "ledger", label: "Ledger", type: "readonly", format: (_v, i) => (i.ledgerEntryId ? "Posted to Accounts Payable — void to change the amount or account" : "Not posted yet") },
  ]),
  ["unit", "jobName", "workOrderLabel"],
);

const billsConfig = {
  key: "bill",
  singular: "Bill",
  plural: "Bills",
  title: "Bills & Payables",
  description:
    "Vendor bills you owe — approvals, AP aging, and payments. Approved bills post to Accounts Payable; payments post to the ledger and Transactions.",
  icon: FileText,
  titleField: "name",
  // Approved bills post to AP on create.
  createPermission: "accounting.post",
  createPermissionNote: NO_POST,
  searchFields: ["name", "vendorName", "propertyName", "account"],
  data: billsData,
  rowsLoader: async () => {
    await loadApprovalLimit();
    return billsLayer.list();
  },

  statusMap: BILL_STATUS_MAP,
  statusFilterOptions: filterOptions(BILL_STATUS_MAP),

  views: [
    { value: "all", label: "All" },
    { value: "open", label: "Open", filter: OPEN },
    { value: "approval", label: "Needs approval", filter: (r) => r.approvalStatus === "Pending" },
    { value: "overdue", label: "Overdue", filter: isBillOverdue },
    { value: "paid", label: "Paid", filter: (r) => r.status === "Paid" },
  ],

  headerActions: ({ reload }) => <ApprovalRulesButton reload={reload} />,

  columns: [
    {
      key: "name",
      header: "Bill",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="text-xs text-text-secondary">
            {[r.vendorName, r.propertyName, r.account].filter(Boolean).join(" · ") || "—"}
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
        </span>
      ),
    },
    {
      key: "aging",
      header: "Aging",
      className: "whitespace-nowrap text-sm tabular-nums",
      render: (r) =>
        OPEN(r) ? (
          <span className={agingBucket(r) === "Current" ? "text-text-secondary" : "text-red-600 dark:text-red-400"}>
            {agingBucket(r) === "Current" ? "Current" : `${agingBucket(r)} days`}
          </span>
        ) : (
          <span className="text-text-tertiary">—</span>
        ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <div className="flex flex-wrap gap-1">
          <StatusPill status={r.status} map={BILL_STATUS_MAP} />
          {r.approvalStatus === "Pending" || r.approvalStatus === "Rejected" ? (
            <StatusPill status={r.approvalStatus} map={APPROVAL_STATUS_MAP} />
          ) : null}
        </div>
      ),
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

  // AP aging: open balance by days past due.
  stats: (rows) => {
    const open = rows.filter(OPEN);
    const by = Object.fromEntries(AGING_BUCKETS.map((b) => [b, 0]));
    for (const r of open) by[agingBucket(r)] += billBalance(r);
    const total = open.reduce((s, r) => s + billBalance(r), 0);
    const pending = rows.filter((r) => r.approvalStatus === "Pending");
    const paidThisMonth = rows.reduce((s, r) => {
      const list = Array.isArray(r.metadata?.payments) ? r.metadata.payments : [];
      return s + list.filter((p) => isThisMonth(p.date)).reduce((a, p) => a + (Number(p.amount) || 0), 0);
    }, 0);
    return [
      { label: "Open payables", value: currency(total), footer: `${currency(by.Current)} current · ${open.length} bills` },
      { label: "1–30 days", value: currency(by["1–30"]), footer: `${currency(by["31–60"])} at 31–60 days` },
      { label: "61+ days", value: currency(by["61–90"] + by["90+"]), footer: `${currency(by["90+"])} over 90 days` },
      { label: "Paid this month", value: currency(paidThisMonth), footer: `${pending.length} awaiting approval` },
    ];
  },

  createDraft: { name: "", vendorId: "", vendorName: "", amount: "", dueDate: "", glAccountId: "", account: "", propertyId: "", propertyName: "" },
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
      key: "glAccountId",
      label: "Expense account",
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
    const [vendors, accounts, properties] = await Promise.all([
      vendorOptions(),
      glAccountIdOptions({ types: ["Expense", "Asset"] }),
      propertyOptions(),
      loadApprovalLimit(),
    ]);
    return { vendors, accounts, properties };
  },
  // Over the approval limit → pending approval (not posted until approved).
  newRow: (draft) => {
    const amount = Math.abs(Number(draft.amount) || 0);
    return {
      name: draft.name.trim(),
      vendorId: draft.vendorId || "",
      vendorName: draft.vendorName || "",
      amount,
      amountPaid: 0,
      billDate: todayISO(),
      dueDate: draft.dueDate || "",
      glAccountId: draft.glAccountId || "",
      account: draft.account || "",
      propertyId: draft.propertyId || "",
      propertyName: draft.propertyName || "",
      approvalStatus: approvalLimit && amount > approvalLimit ? "Pending" : "Not required",
      status: "Open",
    };
  },

  headerMeta: (r) =>
    [r.vendorName, money(r.amount), r.dueDate ? `Due ${formatDate(r.dueDate)}` : null, r.ledgerEntryId ? "In AP" : "Not in AP"]
      .filter(Boolean)
      .join(" · "),

  actions: (item) => [
    {
      key: "approve",
      label: "Approve bill",
      icon: CheckCircle2,
      permission: "accounting.post",
      showIf: (i) => i.approvalStatus === "Pending" || i.approvalStatus === "Rejected",
      wizard: {
        title: "Approve bill",
        description: `Approving ${money(item.amount)} posts it to Accounts Payable.`,
        finishLabel: "Approve",
        logSummary: "Approved bill",
        initial: () => ({ approverName: "" }),
        steps: [
          {
            key: "approve",
            title: "Approver",
            fields: [
              { key: "approverName", label: "Approved by", type: "text", placeholder: "Leave blank to use your name" },
              { key: "approvalNote", label: "Note", type: "textarea" },
            ],
          },
        ],
        finish: async (values, ctx) => {
          const user = await getUser();
          const patch = {
            approvalStatus: "Approved",
            approverName: values.approverName?.trim() || user?.name || "Approver",
            approvedAt: todayISO(),
          };
          const next = { ...ctx.item, ...patch };
          if (canPostToAp(next)) {
            const entryId = await postBillToLedger(next);
            if (!entryId) {
              toast.error(ledgerErrorMessage() || "Couldn't post the bill to Accounts Payable.");
              return false;
            }
            patch.ledgerEntryId = entryId;
          }
          if (values.approvalNote) await ctx.commitMeta({ approvalNote: values.approvalNote });
          const ok = await ctx.commit(patch);
          if (ok) toast.success("Bill approved and posted to Accounts Payable.");
          return ok;
        },
      },
    },
    {
      key: "reject",
      label: "Reject bill",
      icon: XCircle,
      showIf: (i) => i.approvalStatus === "Pending",
      run: async ({ commit }) => {
        if (await commit({ approvalStatus: "Rejected" })) toast.success("Bill rejected.");
      },
    },
    {
      key: "request",
      label: "Require approval",
      icon: ShieldCheck,
      showIf: (i) => !i.ledgerEntryId && (i.approvalStatus === "Not required" || i.approvalStatus === "Approved"),
      run: async ({ commit }) => {
        if (await commit({ approvalStatus: "Pending", approverName: "", approvedAt: "" })) toast.success("Bill sent for approval.");
      },
    },
    {
      key: "post",
      label: "Post to Accounts Payable",
      icon: Send,
      permission: "accounting.post",
      showIf: canPostToAp,
      run: async ({ item: bill, commit }) => {
        const entryId = await postBillToLedger(bill);
        if (!entryId) {
          toast.error(ledgerErrorMessage() || "Couldn't post the bill.");
          return;
        }
        if (await commit({ ledgerEntryId: entryId })) toast.success("Bill posted to Accounts Payable.");
      },
    },
    {
      key: "void",
      label: "Void bill",
      icon: Ban,
      permission: "accounting.void",
      danger: true,
      separatorBefore: true,
      showIf: (i) => i.status !== "Void",
      run: async ({ item: bill, commit }) => {
        if ((Number(bill.amountPaid) || 0) > 0) {
          toast.error("Void this bill's payments first (Payments tab).");
          return;
        }
        if (bill.ledgerEntryId) {
          const voided = await voidEntry(bill.ledgerEntryId, { memo: `Void bill: ${bill.name}` });
          if (!voided && !/already void/.test(ledgerErrorMessage())) {
            toast.error(ledgerErrorMessage() || "Couldn't reverse the bill in the ledger.");
            return;
          }
        }
        if (await commit({ status: "Void" })) toast.success("Bill voided and reversed out of Accounts Payable.");
      },
    },
  ],

  navGroups: [
    {
      group: null,
      items: [{ key: "overview", label: "Overview", icon: LayoutDashboard, desc: "A snapshot of this bill." }],
    },
    {
      group: "Bill",
      items: [
        { key: "details", label: "Details", icon: FileText, desc: "Vendor, dates, amount, expense account, and job." },
        { key: "approval", label: "Approval", icon: ShieldCheck, desc: "Approval status, approver, and the limit in force." },
        { key: "payments", label: "Payments", icon: CircleDollarSign, desc: "Payments recorded against this bill." },
        { key: "ledger", label: "Vendor ledger", icon: BookOpen, desc: "This vendor's payable activity with a running balance." },
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
        { key: "approvalStatus", label: "Approval", format: (v) => APPROVAL_STATUS_MAP[v]?.label || v || "—" },
        { key: "aging", label: "Aging", format: (_v, r) => (OPEN(r) ? agingBucket(r) : "—") },
      ],
      note: "Paid and status update automatically as you record payments.",
    }),
    details: DetailFields,
    approval: ApprovalSection,
    payments: PaymentsSection,
    ledger: makeLedgerSection({
      scope: "vendor",
      dims: (i) => ({ vendorId: i.vendorId, propertyId: i.propertyId }),
      actions: [],
      emptyDescription: "Bills and payments for this vendor appear here once posted.",
    }),
    activity: makeNotesSection({ field: "activityNotes", placeholder: "Log a note about this bill…" }),
  },
};

export function BillsScreen() {
  return <EntityListScreen config={billsConfig} />;
}

export default BillsScreen;
