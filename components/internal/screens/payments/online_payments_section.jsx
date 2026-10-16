"use client";

import { useEffect, useState } from "react";
import { CreditCard } from "lucide-react";

import { DataTable, EmptyState, ListLoading, SectionCard, StatusPill } from "@/components/internal/shared/screen_kit";
import { listLeaseOnlinePayments, listTenantOnlinePayments } from "@/lib/supabase/online_payments";
import { ONLINE_METHODS, PAYMENT_SOURCE_LABELS, PAYMENT_STATUS_MAP } from "@/lib/payments/constants";
import { AutopayPanel } from "./autopay_panel";
import { CollectPaymentButton } from "./collect_payment";
import { formatDate, money } from "./shared";

// Editor section: a lease's (or tenant's) Stripe payments, the Collect payment
// action and the autopay panel. Wire with makeOnlinePaymentsSection() in an
// area's config `sections` map.

const COLUMNS = [
  {
    key: "date",
    header: "Date",
    render: (r) => <span className="text-text-secondary">{formatDate(r.paidAt || r.createdAt)}</span>,
  },
  {
    key: "description",
    header: "Payment",
    render: (r) => (
      <div className="min-w-0">
        <p className="truncate font-medium text-foreground">{r.description || "Online payment"}</p>
        <p className="truncate text-xs text-text-tertiary">
          {[PAYMENT_SOURCE_LABELS[r.source] || r.source, r.methodLabel || ONLINE_METHODS[r.method]?.label].filter(Boolean).join(" · ")}
        </p>
      </div>
    ),
  },
  { key: "amount", header: "Amount", align: "right", render: (r) => <span className="font-medium text-foreground">{money(r.amount)}</span> },
  { key: "status", header: "Status", render: (r) => <StatusPill status={r.status} map={PAYMENT_STATUS_MAP} /> },
];

function OnlinePaymentsSection({ item, leaseIdOf, tenantIdOf, emailOf, by }) {
  const leaseId = leaseIdOf(item);
  const tenantId = tenantIdOf(item);
  const ownerId = by === "tenant" ? tenantId : leaseId;
  const [rows, setRows] = useState(null);

  useEffect(() => {
    let alive = true;
    if (!ownerId) return undefined;
    (by === "tenant" ? listTenantOnlinePayments(ownerId) : listLeaseOnlinePayments(ownerId)).then((r) => alive && setRows(r ?? []));
    return () => {
      alive = false;
    };
  }, [by, ownerId]);

  return (
    <div className="grid gap-4">
      <SectionCard
        title="Online payments"
        description="Card and ACH payments through Stripe. Each one posts to the lease ledger when it settles."
        bodyPadding={false}
        action={<CollectPaymentButton leaseId={leaseId} tenantId={tenantId} payerEmail={emailOf(item)} />}
      >
        {!ownerId ? (
          <EmptyState icon={CreditCard} title="No lease linked" description="Link a lease to collect payments online." />
        ) : rows === null ? (
          <ListLoading label="Loading payments" className="rounded-none border-0" />
        ) : (
          <DataTable
            className="rounded-none border-0"
            columns={COLUMNS}
            data={rows}
            getRowKey={(r) => r.id}
            empty={<EmptyState icon={CreditCard} title="No online payments yet" description="Send a payment link or take a payment to get started." />}
          />
        )}
      </SectionCard>
      <AutopayPanel leaseId={leaseId} tenantId={tenantId} payerEmail={emailOf(item)} />
    </div>
  );
}

// makeOnlinePaymentsSection({ by: "lease" | "tenant", leaseIdOf?, tenantIdOf?, emailOf? })
export function makeOnlinePaymentsSection({
  by = "lease",
  leaseIdOf = by === "lease" ? (i) => i.id : (i) => i.leaseId,
  tenantIdOf = by === "tenant" ? (i) => i.id : (i) => i.tenantId,
  emailOf = (i) => i.email || i.tenantEmail || "",
} = {}) {
  function Section({ item }) {
    return <OnlinePaymentsSection item={item} by={by} leaseIdOf={leaseIdOf} tenantIdOf={tenantIdOf} emailOf={emailOf} />;
  }
  return Section;
}
