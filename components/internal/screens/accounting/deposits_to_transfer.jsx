"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowRightLeft, Loader2 } from "lucide-react";

import { DataTable, SectionCard } from "@/components/internal/shared/screen_kit";
import { Button } from "@geiger/ui/button";
import { RoleGate } from "@/components/internal/shared/role_gate";
import { Callout } from "@/components/internal/screens/leasing/sections/gated";
import { pendingSweepsApi, sweepDepositApi } from "@/lib/billing/api";
import { NO_POST, useCanPost } from "./ledger_dialogs";
import { formatDate, money } from "./shared";

// Bank Accounts → "Deposits to transfer" (CORE-04): deposit money that landed in another account, moved to the Security deposit account one payment at a time.
export function DepositsToTransferCard() {
  const canPost = useCanPost();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState("");
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!canPost) return;
    let alive = true;
    pendingSweepsApi().then((res) => alive && setData(res.ok ? res : { rows: [], error: res.error }));
    return () => {
      alive = false;
    };
  }, [canPost, tick]);

  if (!canPost || !data) return null;
  if (data.error) return <Callout tone="danger">Couldn&apos;t load the deposits to transfer: {data.error}</Callout>;
  if (data.warning) return <Callout tone="warning">{data.warning} Add one (type “Security deposit”) to keep deposits separate.</Callout>;
  if (!data.rows?.length) return null;

  const move = async (rows) => {
    setBusy(rows.length > 1 ? "all" : rows[0].key);
    let moved = 0;
    for (const r of rows) {
      const res = await sweepDepositApi(r.depositId, r.paymentEntryId);
      if (!res.ok) {
        toast.error(res.error || "Couldn't move the deposit.");
        break;
      }
      moved += (res.entries || []).filter((e) => e.created).reduce((s, e) => s + (Number(e.amount) || 0), 0);
    }
    setBusy("");
    if (moved > 0) toast.success(`Moved ${money(moved)} to ${data.bank?.name || "the deposit account"}.`);
    reload();
  };

  const columns = [
    { key: "date", header: "Paid", className: "whitespace-nowrap text-sm tabular-nums text-text-secondary", render: (r) => formatDate(r.date) },
    {
      key: "deposit",
      header: "Deposit",
      render: (r) => (
        <div className="flex min-w-0 flex-col gap-1">
          <span className="truncate font-medium text-foreground">{r.depositName}</span>
          <span className="truncate text-xs text-text-secondary">{[r.tenantName, r.unit, r.kind].filter(Boolean).join(" · ")}</span>
        </div>
      ),
    },
    { key: "from", header: "Landed in", className: "text-sm text-text-secondary", render: (r) => `${r.fromBankName || "Default trust cash"}${r.source === "received" ? " · recorded as received" : ""}` },
    { key: "amount", header: "Amount", align: "right", className: "text-right font-semibold tabular-nums text-foreground", render: (r) => money(r.amount) },
    {
      key: "move",
      header: "",
      align: "right",
      className: "w-28 text-right",
      render: (r) => (
        <Button size="sm" variant="outline" className="border-border bg-surface-card" disabled={Boolean(busy)} onClick={() => move([r])}>
          {busy === r.key ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Move
        </Button>
      ),
    },
  ];

  return (
    <SectionCard
      title="Deposits to transfer"
      description={`Security deposit money that landed outside ${data.bank?.name || "the deposit account"}. Moving it posts the transfer between the two bank accounts.`}
      action={
        <RoleGate allowed={canPost} reason={NO_POST}>
          <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={Boolean(busy)} onClick={() => move(data.rows)}>
            {busy === "all" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightLeft className="h-4 w-4" />} Move All {money(data.total)}
          </Button>
        </RoleGate>
      }
      bodyPadding={false}
    >
      <DataTable columns={columns} data={data.rows} getRowKey={(r) => r.key} />
    </SectionCard>
  );
}

export default DepositsToTransferCard;
