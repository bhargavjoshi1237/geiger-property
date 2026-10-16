"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Ban,
  Copy,
  CreditCard,
  ExternalLink,
  Eye,
  Landmark,
  Loader2,
  MoreHorizontal,
  Power,
  RefreshCw,
  Repeat,
  Settings,
  Undo2,
  Webhook,
} from "lucide-react";

import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import {
  DataTable,
  EmptyState,
  Field,
  ListLoading,
  ScreenHeader,
  SearchInput,
  StatsBar,
  StatusPill,
  Toolbar,
} from "@/components/internal/shared/screen_kit";
import { SegmentedTabs } from "@/components/internal/shared/segmented_tabs";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { usePermission } from "@/context/rbac-context";
import { RoleGate, RoleNote } from "@/components/internal/shared/role_gate";
import { leaseOptions } from "@/lib/supabase/options";
import { listAutopayPlans, listOnlinePayments, listStripeEvents } from "@/lib/supabase/online_payments";
import {
  autopayAction,
  cancelOnlinePayment,
  getPaymentsStatus,
  refundOnlinePayment,
  syncOnlinePayment,
} from "@/lib/payments/api";
import {
  AUTOPAY_STATUS_MAP,
  COLLECTED_STATUSES,
  ONLINE_METHODS,
  PAYMENT_SOURCE_LABELS,
  PAYMENT_STATUS_MAP,
} from "@/lib/payments/constants";
import { CollectPaymentDialog, NO_COLLECT, usePaymentReturnNotice } from "./collect_payment";
import { Notice, dateTime, formatDate, money } from "./shared";

// Online Payments — every Stripe card / ACH payment and payment link, autopay
// enrollments, payouts and the webhook log. Rows are written by the server
// (lib/payments/*, the Stripe webhook and the autopay job); staff refund,
// cancel links, refresh from Stripe and collect new payments here.

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || "";
const DAY = 86400000;

const TABS = [
  { value: "payments", label: "Payments", icon: CreditCard },
  { value: "autopay", label: "Autopay", icon: Repeat },
  { value: "payouts", label: "Payouts", icon: Landmark },
  { value: "events", label: "Webhook log", icon: Webhook },
];

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  ...Object.entries(PAYMENT_STATUS_MAP).map(([value, m]) => ({ value, label: m.label })),
];
const METHOD_OPTIONS = [
  { value: "all", label: "All methods" },
  ...Object.entries(ONLINE_METHODS).map(([value, m]) => ({ value, label: m.label })),
];
const EVENT_STATUS_MAP = {
  processed: { label: "Processed", variant: "success", dotClass: "bg-emerald-400" },
  received: { label: "Received", variant: "info", dotClass: "bg-sky-400" },
  failed: { label: "Failed", variant: "danger", dotClass: "bg-red-400" },
  ignored: { label: "Ignored", variant: "neutral", dotClass: "bg-text-tertiary" },
};

const linkUrl = (token) => (token ? `${window.location.origin}${BASE}/api/payments/link/${token}` : "");
const net = (r) => (Number(r.amount) || 0) - (Number(r.refundedAmount) || 0);
const methodText = (r) => r.methodLabel || ONLINE_METHODS[r.method]?.label || "—";

function copy(text, message = "Copied.") {
  navigator.clipboard?.writeText(text).then(
    () => toast.success(message),
    () => toast.error("Couldn't copy."),
  );
}

// --- Dialogs -----------------------------------------------------------------

function LeasePickerDialog({ open, onOpenChange, onPick }) {
  const [options, setOptions] = useState(null);
  const [value, setValue] = useState("");
  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    leaseOptions().then((o) => alive && setOptions(o));
    return () => {
      alive = false;
    };
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Collect payment</DialogTitle>
          <DialogDescription>Pick the lease this payment applies to.</DialogDescription>
        </DialogHeader>
        <Field label="Lease" htmlFor="pick-lease">
          <Select value={value} onValueChange={setValue}>
            <SelectTrigger id="pick-lease" className="w-full bg-surface-card">
              <SelectValue placeholder={options ? "Select a lease…" : "Loading…"} />
            </SelectTrigger>
            <SelectContent>
              {(options || []).map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={!value}
            onClick={() => onPick(options.find((o) => o.value === value))}
          >
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Advisory RBAC: collecting / refunding posts to the ledger, canceling a link or autopay is void-like.
const NO_REFUND = "Your role can't refund payments.";

function RefundDialog({ payment, onOpenChange, onDone }) {
  const left = payment ? (Number(payment.total) || Number(payment.amount) || 0) - (Number(payment.refundedAmount) || 0) : 0;
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const canPost = usePermission("accounting.post");
  const [lastId, setLastId] = useState(null);
  if ((payment?.id || null) !== lastId) {
    setLastId(payment?.id || null);
    setAmount(left ? left.toFixed(2) : "");
    setReason("");
  }
  const submit = async () => {
    if (!canPost) {
      toast.error(NO_REFUND);
      return;
    }
    const n = Number(amount) || 0;
    if (!(n > 0) || n - left > 0.005) {
      toast.error(`Refund between $0.01 and ${money(left)}.`);
      return;
    }
    setBusy(true);
    const res = await refundOnlinePayment({ paymentId: payment.id, amount: n, reason });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error || "Couldn't refund the payment.");
      return;
    }
    toast.success(`Refunded ${money(n)}.`);
    onOpenChange(false);
    onDone();
  };
  return (
    <Dialog open={Boolean(payment)} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Refund payment</DialogTitle>
          <DialogDescription>
            Refunds go back to the payer through Stripe. A full refund voids the ledger entry; a partial refund re-opens that amount on the lease.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Amount" htmlFor="refund-amount" hint={`Up to ${money(left)}.`}>
            <Input id="refund-amount" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="bg-surface-card" />
          </Field>
          <Field label="Reason" htmlFor="refund-reason">
            <Input id="refund-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Overpayment" className="bg-surface-card" />
          </Field>
        </div>
        {!canPost ? <RoleNote>{NO_REFUND}</RoleNote> : null}
        <DialogFooter>
          <Button variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={busy || !canPost} onClick={submit}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
            Refund
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Detail({ label, children, mono }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-text-tertiary">{label}</p>
      <p className={`mt-0.5 truncate text-sm text-foreground ${mono ? "font-mono text-xs" : ""}`}>{children || "—"}</p>
    </div>
  );
}

function PaymentDetailDialog({ payment, onOpenChange, onOpenLease }) {
  const r = payment;
  return (
    <Dialog open={Boolean(r)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        {r ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {money(r.amount)} <StatusPill status={r.status} map={PAYMENT_STATUS_MAP} />
              </DialogTitle>
              <DialogDescription>{r.description || "Online payment"}</DialogDescription>
            </DialogHeader>
            <div className="grid max-h-[60vh] gap-4 overflow-y-auto pr-1">
              {r.returnReason ? (
                <Notice tone="danger" title={r.status === "failed" ? "Payment failed" : "Payment reversed"}>
                  {r.returnReason}
                  {r.nsfEntryId ? " · NSF fee charged to the lease." : ""}
                </Notice>
              ) : null}
              <div className="grid gap-4 rounded-lg border border-border bg-surface-card p-4 sm:grid-cols-3">
                <Detail label="Payer">{r.payerName}</Detail>
                <Detail label="Email">{r.payerEmail}</Detail>
                <Detail label="Source">{PAYMENT_SOURCE_LABELS[r.source] || r.source}</Detail>
                <Detail label="Method">{methodText(r)}</Detail>
                <Detail label="Convenience fee">{money(r.convenienceFee)}</Detail>
                <Detail label="Total charged">{money(r.total)}</Detail>
                <Detail label="Stripe fee">{r.processorFee ? money(r.processorFee) : "—"}</Detail>
                <Detail label="Refunded">{r.refundedAmount ? money(r.refundedAmount) : "—"}</Detail>
                <Detail label="Payout">{r.payoutArrivalDate ? `${formatDate(r.payoutArrivalDate)}` : "—"}</Detail>
                <Detail label="Created">{dateTime(r.createdAt)}</Detail>
                <Detail label="Paid">{dateTime(r.paidAt)}</Detail>
                <Detail label={r.status === "failed" ? "Failed" : "Returned"}>{dateTime(r.returnedAt || r.failedAt)}</Detail>
              </div>
              <div className="grid gap-4 rounded-lg border border-border bg-surface-card p-4 sm:grid-cols-2">
                <Detail label="Payment intent" mono>{r.stripePaymentIntentId}</Detail>
                <Detail label="Charge" mono>{r.stripeChargeId}</Detail>
                <Detail label="Ledger entry" mono>{r.ledgerEntryId}</Detail>
                <Detail label="Fee entry" mono>{r.feeEntryId}</Detail>
                <Detail label="NSF entry" mono>{r.nsfEntryId}</Detail>
                <Detail label="Payout id" mono>{r.payoutId}</Detail>
              </div>
              {Array.isArray(r.refunds) && r.refunds.length ? (
                <div className="rounded-lg border border-border bg-surface-card p-4 text-sm">
                  <p className="mb-2 text-xs text-text-tertiary">Refunds</p>
                  {r.refunds.map((x) => (
                    <div key={x.id} className="flex justify-between gap-3 py-1">
                      <span className="text-text-secondary">{dateTime(x.at)}{x.reason ? ` · ${x.reason}` : ""}</span>
                      <span className="font-medium text-foreground">{money(x.amount)}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
            <DialogFooter>
              {r.linkToken ? (
                <Button variant="outline" onClick={() => copy(linkUrl(r.linkToken), "Payment link copied.")}>
                  <Copy className="h-4 w-4" /> Copy link
                </Button>
              ) : null}
              {r.leaseId ? (
                <Button variant="outline" onClick={() => onOpenLease(r.leaseId)}>
                  <ExternalLink className="h-4 w-4" /> Open lease
                </Button>
              ) : null}
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

// --- Screen ------------------------------------------------------------------

export function OnlinePaymentsScreen() {
  const { openItemInTab, setTab } = useWorkspaceUrl();
  usePaymentReturnNotice();
  const [payments, setPayments] = useState([]);
  const [plans, setPlans] = useState([]);
  const [events, setEvents] = useState([]);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setView] = useState("payments");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [method, setMethod] = useState("all");
  const [detail, setDetail] = useState(null);
  const [refundTarget, setRefundTarget] = useState(null);
  const [pickOpen, setPickOpen] = useState(false);
  const canPost = usePermission("accounting.post");
  const canVoid = usePermission("accounting.void");
  const [collectLease, setCollectLease] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [loadedAt, setLoadedAt] = useState(0);

  const reload = useCallback(
    () =>
      Promise.all([listOnlinePayments(), listAutopayPlans(), listStripeEvents()]).then(([p, a, e]) => {
        setPayments(p ?? []);
        setPlans(a ?? []);
        setEvents(e ?? []);
      }),
    [],
  );

  useEffect(() => {
    let alive = true;
    Promise.all([listOnlinePayments(), listAutopayPlans(), listStripeEvents(), getPaymentsStatus()]).then(([p, a, e, s]) => {
      if (!alive) return;
      setPayments(p ?? []);
      setPlans(a ?? []);
      setEvents(e ?? []);
      setConfig(s);
      setLoadedAt(Date.now());
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  const stats = useMemo(() => {
    const since = loadedAt - 30 * DAY;
    const recent = payments.filter((p) => Date.parse(p.paidAt || p.createdAt || 0) >= since);
    const collected = recent.filter((p) => COLLECTED_STATUSES.includes(p.status)).reduce((s, p) => s + net(p), 0);
    const processing = payments.filter((p) => p.status === "processing");
    const bad = recent.filter((p) => ["failed", "returned", "disputed"].includes(p.status));
    const fees = recent.filter((p) => COLLECTED_STATUSES.includes(p.status)).reduce((s, p) => s + (Number(p.processorFee) || 0), 0);
    const active = plans.filter((p) => p.status === "active").length;
    return [
      { label: "Collected · 30 days", value: money(collected), footer: `${money(fees)} in Stripe fees` },
      { label: "Processing", value: money(processing.reduce((s, p) => s + (Number(p.amount) || 0), 0)), footer: `${processing.length} ACH payment${processing.length === 1 ? "" : "s"} settling` },
      { label: "Failed & returned · 30 days", value: String(bad.length), footer: bad.length ? money(bad.reduce((s, p) => s + (Number(p.amount) || 0), 0)) : "None" },
      { label: "Autopay enrolled", value: String(active), footer: `${plans.filter((p) => p.status === "pending_setup").length} awaiting setup` },
    ];
  }, [payments, plans, loadedAt]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return payments.filter((p) => {
      if (status !== "all" && p.status !== status) return false;
      if (method !== "all" && p.method !== method) return false;
      if (!q) return true;
      return [p.payerName, p.payerEmail, p.description, p.methodLabel, p.stripePaymentIntentId].some((v) => String(v || "").toLowerCase().includes(q));
    });
  }, [payments, search, status, method]);

  const payouts = useMemo(() => {
    const by = new Map();
    for (const p of payments) {
      if (!p.payoutId) continue;
      const g = by.get(p.payoutId) || { id: p.payoutId, arrival: p.payoutArrivalDate, count: 0, gross: 0, fees: 0 };
      g.count += 1;
      g.gross += Number(p.total) || 0;
      g.fees += Number(p.processorFee) || 0;
      by.set(p.payoutId, g);
    }
    return [...by.values()].sort((a, b) => String(b.arrival).localeCompare(String(a.arrival)));
  }, [payments]);

  const visibleEvents = useMemo(() => events.filter((e) => e.status !== "ignored"), [events]);

  const openLease = (leaseId) => {
    setDetail(null);
    openItemInTab(leaseId, "Leases");
  };

  const runRow = async (row, fn, ok) => {
    setBusyId(row.id);
    const res = await fn();
    setBusyId(null);
    if (!res.ok) {
      toast.error(res.error || "Something went wrong.");
      return;
    }
    toast.success(ok);
    reload();
  };

  const paymentColumns = [
    {
      key: "payer",
      header: "Payment",
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{r.payerName || r.payerEmail || "Payer"}</p>
          <p className="truncate text-xs text-text-tertiary">{r.description || "Online payment"}</p>
        </div>
      ),
    },
    { key: "date", header: "Date", render: (r) => <span className="text-text-secondary">{formatDate(r.paidAt || r.createdAt)}</span> },
    {
      key: "method",
      header: "Method",
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate text-text-secondary">{methodText(r)}</p>
          <p className="truncate text-xs text-text-tertiary">{PAYMENT_SOURCE_LABELS[r.source] || r.source}</p>
        </div>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      render: (r) => (
        <div>
          <p className="font-medium text-foreground">{money(r.amount)}</p>
          {r.convenienceFee ? <p className="text-xs text-text-tertiary">+{money(r.convenienceFee)} fee</p> : null}
        </div>
      ),
    },
    { key: "status", header: "Status", render: (r) => <StatusPill status={r.status} map={PAYMENT_STATUS_MAP} /> },
    { key: "payout", header: "Payout", render: (r) => <span className="text-text-secondary">{r.payoutArrivalDate ? formatDate(r.payoutArrivalDate) : "—"}</span> },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (r) => (
        <div onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Payment actions" disabled={busyId === r.id}>
                {busyId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="border-border bg-surface-subtle">
              <DropdownMenuItem onClick={() => setDetail(r)}>
                <Eye className="h-4 w-4" /> View details
              </DropdownMenuItem>
              {r.linkToken && ["link_sent", "pending", "expired"].includes(r.status) ? (
                <DropdownMenuItem onClick={() => copy(linkUrl(r.linkToken), "Payment link copied.")}>
                  <Copy className="h-4 w-4" /> Copy payment link
                </DropdownMenuItem>
              ) : null}
              {r.stripePaymentIntentId ? (
                <DropdownMenuItem onClick={() => runRow(r, () => syncOnlinePayment(r.id), "Refreshed from Stripe.")}>
                  <RefreshCw className="h-4 w-4" /> Refresh from Stripe
                </DropdownMenuItem>
              ) : null}
              {r.leaseId ? (
                <DropdownMenuItem onClick={() => openLease(r.leaseId)}>
                  <ExternalLink className="h-4 w-4" /> Open lease
                </DropdownMenuItem>
              ) : null}
              {canPost && COLLECTED_STATUSES.includes(r.status) ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setRefundTarget(r)} className="text-red-600 focus:bg-red-500/10 dark:text-red-400">
                    <Undo2 className="h-4 w-4" /> Refund
                  </DropdownMenuItem>
                </>
              ) : null}
              {canVoid && ["link_sent", "pending"].includes(r.status) ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => runRow(r, () => cancelOnlinePayment(r.id), "Payment link canceled.")}
                    className="text-red-600 focus:bg-red-500/10 dark:text-red-400"
                  >
                    <Ban className="h-4 w-4" /> Cancel link
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ];

  const planColumns = [
    {
      key: "name",
      header: "Lease",
      render: (p) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{p.name || "Autopay"}</p>
          <p className="truncate text-xs text-text-tertiary">{p.payerEmail || "—"}</p>
        </div>
      ),
    },
    { key: "status", header: "Status", render: (p) => <StatusPill status={p.status} map={AUTOPAY_STATUS_MAP} /> },
    { key: "method", header: "Method", render: (p) => <span className="text-text-secondary">{p.methodLabel || "—"}</span> },
    {
      key: "charge",
      header: "Charges",
      render: (p) => (
        <span className="text-text-secondary">
          {p.amountMode === "fixed" ? money(p.fixedAmount) : "Open balance"}
          {p.chargeDay ? ` · day ${p.chargeDay}` : " · due day"}
        </span>
      ),
    },
    {
      key: "last",
      header: "Last run",
      render: (p) => (
        <div className="min-w-0">
          <p className="text-text-secondary">{p.lastRunOn ? formatDate(p.lastRunOn) : "—"}</p>
          {p.lastError ? <p className="max-w-64 truncate text-xs text-red-600 dark:text-red-400">{p.lastError}</p> : null}
        </div>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (p) =>
        p.status === "canceled" || !canVoid ? null : (
          <div onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="sm"
              disabled={busyId === p.id}
              className="text-red-600 dark:text-red-400"
              onClick={() => runRow(p, () => autopayAction("cancel", { leaseId: p.leaseId, planId: p.id }), "Autopay turned off.")}
            >
              {busyId === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />} Turn off
            </Button>
          </div>
        ),
    },
  ];

  const payoutColumns = [
    { key: "arrival", header: "Arrives", render: (g) => <span className="font-medium text-foreground">{formatDate(g.arrival)}</span> },
    { key: "id", header: "Payout", render: (g) => <span className="font-mono text-xs text-text-secondary">{g.id}</span> },
    { key: "count", header: "Payments", align: "right", render: (g) => g.count },
    { key: "gross", header: "Gross", align: "right", render: (g) => money(g.gross) },
    { key: "fees", header: "Stripe fees", align: "right", render: (g) => <span className="text-text-secondary">−{money(g.fees)}</span> },
    { key: "net", header: "Net", align: "right", render: (g) => <span className="font-medium text-foreground">{money(g.gross - g.fees)}</span> },
  ];

  const eventColumns = [
    { key: "at", header: "Received", render: (e) => <span className="text-text-secondary">{dateTime(e.createdAt)}</span> },
    { key: "type", header: "Event", render: (e) => <code className="font-mono text-xs text-foreground">{e.eventType}</code> },
    { key: "object", header: "Object", render: (e) => <span className="font-mono text-xs text-text-tertiary">{e.objectId || "—"}</span> },
    { key: "status", header: "Status", render: (e) => <StatusPill status={e.status} map={EVENT_STATUS_MAP} /> },
    { key: "error", header: "", render: (e) => (e.error ? <span className="max-w-72 truncate text-xs text-red-600 dark:text-red-400">{e.error}</span> : null) },
  ];

  const stripeOff = config && config.ok !== false && config.stripe && !config.stripe.configured;
  const filtersOn = status !== "all" || method !== "all" || search;

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Online Payments"
        description="Card and ACH payments through Stripe, autopay, returns, and payouts — posted to the ledger automatically."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => setTab("Payment Processing")}>
              <Settings className="h-4 w-4" /> Settings
            </Button>
            <RoleGate allowed={canPost} reason={NO_COLLECT}>
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={!canPost} onClick={() => setPickOpen(true)}>
                <CreditCard className="h-4 w-4" /> Collect payment
              </Button>
            </RoleGate>
          </div>
        }
      />

      {stripeOff ? (
        <Notice
          tone="warning"
          title="Stripe isn't connected"
          action={
            <Button variant="outline" size="sm" onClick={() => setTab("Payment Processing")}>
              Set up
            </Button>
          }
        >
          Add STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET and NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY to start collecting card and ACH payments.
        </Notice>
      ) : null}
      {config?.stripe?.configured && !config.stripe.webhookConfigured ? (
        <Notice tone="warning" title="Webhook secret missing">
          Without STRIPE_WEBHOOK_SECRET, ACH settlements, returns and refunds made in Stripe won&apos;t reach the ledger.
        </Notice>
      ) : null}

      <StatsBar stats={stats} />

      <SegmentedTabs tabs={TABS} value={tab} onChange={setView} />

      {loading ? (
        <ListLoading label="Loading payments" />
      ) : tab === "payments" ? (
        <>
          <Toolbar>
            <div className="flex flex-wrap items-center gap-2">
              <FilterDropdown value={status} onValueChange={setStatus} options={STATUS_OPTIONS} />
              <FilterDropdown value={method} onValueChange={setMethod} options={METHOD_OPTIONS} />
            </div>
            <SearchInput value={search} onChange={setSearch} placeholder="Search payer, description…" />
          </Toolbar>
          <DataTable
            columns={paymentColumns}
            data={filtered}
            getRowKey={(r) => r.id}
            onRowClick={setDetail}
            empty={
              <div className="rounded-xl border border-border bg-surface-subtle">
                {payments.length ? (
                  <EmptyState
                    icon={CreditCard}
                    title="No payments match these filters"
                    action={
                      filtersOn ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setStatus("all");
                            setMethod("all");
                            setSearch("");
                          }}
                        >
                          Clear filters
                        </Button>
                      ) : null
                    }
                  />
                ) : (
                  <EmptyState
                    icon={CreditCard}
                    title="No online payments yet"
                    description="Send a payment link or take a payment — residents can also pay from the portal."
                    action={
                      canPost ? (
                        <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => setPickOpen(true)}>
                          <CreditCard className="h-4 w-4" /> Collect payment
                        </Button>
                      ) : null
                    }
                  />
                )}
              </div>
            }
          />
        </>
      ) : tab === "autopay" ? (
        <DataTable
          columns={planColumns}
          data={plans}
          getRowKey={(p) => p.id}
          onRowClick={(p) => p.leaseId && openLease(p.leaseId)}
          empty={
            <div className="rounded-xl border border-border bg-surface-subtle">
              <EmptyState icon={Repeat} title="No autopay enrollments" description="Set up autopay from a lease's Online payments section." />
            </div>
          }
        />
      ) : tab === "payouts" ? (
        <DataTable
          columns={payoutColumns}
          data={payouts}
          getRowKey={(g) => g.id}
          empty={
            <div className="rounded-xl border border-border bg-surface-subtle">
              <EmptyState icon={Landmark} title="No payouts yet" description="Stripe payouts appear here once they're paid to your bank." />
            </div>
          }
        />
      ) : (
        <DataTable
          columns={eventColumns}
          data={visibleEvents}
          getRowKey={(e) => e.id}
          empty={
            <div className="rounded-xl border border-border bg-surface-subtle">
              <EmptyState icon={Webhook} title="No webhook events yet" description="Verified Stripe events are logged here as they arrive." />
            </div>
          }
        />
      )}

      <LeasePickerDialog
        open={pickOpen}
        onOpenChange={setPickOpen}
        onPick={(opt) => {
          setPickOpen(false);
          setCollectLease(opt);
        }}
      />
      <CollectPaymentDialog
        open={Boolean(collectLease)}
        onOpenChange={(o) => !o && setCollectLease(null)}
        leaseId={collectLease?.value}
        tenantId={collectLease?.patch?.tenantId || undefined}
        onDone={reload}
      />
      <RefundDialog payment={refundTarget} onOpenChange={(o) => !o && setRefundTarget(null)} onDone={reload} />
      <PaymentDetailDialog payment={detail} onOpenChange={(o) => !o && setDetail(null)} onOpenLease={openLease} />
    </MainScreenWrapper>
  );
}

export default OnlinePaymentsScreen;
