"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Ban, Check, ExternalLink, Gavel, Loader2, ReceiptText, Undo2, X } from "lucide-react";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@geiger/ui/sheet";
import { Button } from "@geiger/ui/button";
import { ListLoading, StatusPill } from "@/components/internal/shared/screen_kit";
import { WizardDialog } from "@/components/internal/shared/wizard_dialog";
import { RoleGate } from "@/components/internal/shared/role_gate";
import { Callout } from "@/components/internal/screens/leasing/sections/gated";
import { usePermission } from "@/context/rbac-context";
import { logSystemActivity } from "@/lib/supabase/activity_log";
import { isSandbox } from "@/lib/sandbox/sandbox_mode";
import { LEDGER_LOCKED, LEDGER_VIEW } from "@/lib/ledger/access";
import { chargeReservationApi, forfeitReservationDepositApi, releaseReservationDepositApi, reservationLedgerApi } from "@/lib/billing/api";
import { CHARGE_ON_OPTIONS, LEDGER_STATUS_MAP, hasCharges } from "@/lib/billing/amenities_math";
import { RESERVATION_STATUS_MAP, changeReservationStatus, formatDay, formatSlot, formatTime, ledgerOf, money2 } from "./shared";

// Reservation drawer (CORE-18): the booking, its fee and deposit on the ledger, and approve / charge / release / forfeit / cancel.

const NO_POST = "Your role can't post to the ledger.";
const sectionLabel = "mb-2 text-xs font-semibold uppercase tracking-wider text-text-tertiary";
const outlineButton = "border-border bg-surface-card text-muted-foreground hover:bg-surface-hover hover:text-foreground";

const withLedger = (r, ledger) => (ledger ? { ...r, ledger, metadata: { ...(r.metadata || {}), ledger } } : r);
const when = (iso) => (iso ? `${formatDay(iso)}, ${formatTime(iso)}` : "");

function Fact({ label, children }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-text-tertiary">{label}</p>
      <p className="truncate text-foreground">{children || "—"}</p>
    </div>
  );
}

function LedgerRow({ label, amount, children }) {
  return (
    <li className="flex items-start justify-between gap-3 px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-text-secondary">{children}</p>
      </div>
      <span className="shrink-0 text-sm tabular-nums text-foreground">{money2(amount)}</span>
    </li>
  );
}

function feeDetail(fee, card) {
  if (!fee) return card.chargeDue ? "Not charged yet" : "Charged once the booking is approved";
  if (fee.status !== "posted") return `Reversed · charged ${formatDay(fee.date)}`;
  return `Charged ${formatDay(fee.date)} · ${card.feeAccount}${fee.open > 0 ? ` · ${money2(fee.open)} unpaid` : " · paid"}`;
}

function depositDetail(card) {
  const { deposit, release, forfeit, held } = card.ledger;
  if (!deposit) return card.chargeDue ? "Not charged yet" : "Charged once the booking is approved";
  if (deposit.status !== "posted") return `Reversed · charged ${formatDay(deposit.date)}`;
  if (held > 0) return `Held in ${card.depositAccount}${deposit.open > 0 ? ` · ${money2(deposit.open)} unpaid` : " · paid"}`;
  const parts = [forfeit ? `${money2(forfeit.amount)} forfeited` : "", release ? `${money2(release.amount)} released to the resident's account` : ""].filter(Boolean);
  return `${parts.join(" · ")} · ${formatDay((release || forfeit)?.date)}`;
}

function billToLabel(card) {
  if (!card.billTo) return "No tenant linked";
  return card.billTo.leaseName ? `${card.billTo.tenantName} · ${card.billTo.leaseName}` : `${card.billTo.tenantName} · tenant only (no live lease on this unit)`;
}

function cancelSummary(r, card) {
  const fee = card?.ledger?.fee?.status === "posted" ? card.ledger.fee.amount : 0;
  const deposit = card?.ledger?.deposit?.status === "posted" && card.ledger.held > 0 ? card.ledger.held : 0;
  if (!fee && !deposit) return "Nothing is on the ledger for this booking.";
  const what = [fee ? `the ${money2(fee)} fee` : "", deposit ? `the ${money2(deposit)} deposit` : ""].filter(Boolean).join(" and ");
  if (card.insideFreeWindow) return `Inside the free-cancellation window, so ${what} will be reversed.`;
  const kept = [fee ? `the ${money2(fee)} fee stays charged` : "", deposit ? `the ${money2(deposit)} deposit stays held until you release or forfeit it` : ""].filter(Boolean).join(", and ");
  return `The free-cancellation window ended ${when(card.freeCancelUntil)}, so ${kept}.`;
}

export function ReservationSheet({ reservation, amenity, onClose, onChange, onOpenAmenity }) {
  const r = reservation;
  const canPost = usePermission("accounting.post");
  // The playground has no server routes, so the ledger card stays hidden there.
  const live = !isSandbox();
  const canView = (usePermission(LEDGER_VIEW) || canPost) && live;
  const [tick, setTick] = useState(0);
  const [loaded, setLoaded] = useState({ key: "", value: null });
  const [busy, setBusy] = useState("");
  const [dialog, setDialog] = useState(null);
  const [now] = useState(() => Date.now());

  const id = r?.id || "";
  const key = `${id}:${r?.status || ""}:${tick}`;
  useEffect(() => {
    if (!id || !canView) return undefined;
    let alive = true;
    reservationLedgerApi(id).then((res) => alive && setLoaded({ key, value: res.ok ? res : { error: res.error || "Couldn't read the ledger." } }));
    return () => {
      alive = false;
    };
  }, [id, key, canView]);
  const card = loaded.key === key ? loaded.value : null;
  const ledger = card?.ledger;
  const held = ledger?.held || 0;

  const update = (row) => {
    onChange?.(row);
    setTick((t) => t + 1);
  };

  const run = async (label, call, done) => {
    setBusy(label);
    const res = await call();
    setBusy("");
    if (!res.ok) return toast.error(res.error || "Something went wrong.");
    update(withLedger(r, res.ledger));
    toast.success(done(res));
  };

  const charge = () =>
    run("charge", () => chargeReservationApi(r.id), (res) => {
      const posted = (res.entries || []).filter((e) => e.created);
      return posted.length ? `Charged the ${posted.map((e) => `${money2(e.amount)} ${e.kind}`).join(" and ")}.` : "Already on the ledger.";
    });
  const release = () => run("release", () => releaseReservationDepositApi(r.id), () => `Released the ${money2(held)} deposit to the resident's account.`);

  const setStatus = async (status) => {
    setBusy(status);
    const res = await changeReservationStatus(r, status, { amenity, canPost });
    setBusy("");
    if (res.error) return toast.error(res.error);
    update(res.row);
    if (!res.logged && r.amenityId) logSystemActivity("amenity", r.amenityId, "action", `${RESERVATION_STATUS_MAP[status].label} reservation for ${r.tenantName || "a resident"}`);
    toast.success(res.message);
    if (res.warning) toast.warning(res.warning);
    return true;
  };

  const forfeit = async (v) => {
    const res = await forfeitReservationDepositApi(r.id, { amount: Number(v.amount), reason: v.reason });
    if (!res.ok) {
      toast.error(res.error || "Couldn't forfeit the deposit.");
      return false;
    }
    update(withLedger(r, res.ledger));
    const parts = (res.entries || []).map((e) => `${e.kind === "forfeit" ? "forfeited" : "released"} ${money2(e.amount)}`);
    toast.success(`Deposit ${parts.join(", ") || "settled"}.`);
    return true;
  };

  const forfeitSteps = [
    {
      key: "forfeit",
      title: "Forfeit",
      fields: [
        { key: "amount", label: "Amount to forfeit", type: "currency", required: true, hint: `Up to ${money2(held)}; the rest is released to the resident's account.` },
        { key: "reason", label: "Reason", type: "textarea", required: true, placeholder: "e.g. Broken patio chair" },
      ],
      validate: (v) => (!(Number(v.amount) > 0) ? "Enter the amount to forfeit." : Number(v.amount) > held ? `Only ${money2(held)} is held.` : null),
    },
  ];
  const cancelSteps = [
    {
      key: "confirm",
      title: "Cancel",
      render: () => <p className="text-sm text-text-secondary">{canView && card && !card.error ? cancelSummary(r, card) : "The booking is cancelled; its fee and deposit follow the amenity's cancellation window."}</p>,
    },
  ];

  // Due under the amenity's chargeOn and a fee or deposit still missing from the ledger.
  const needsCharge = Boolean(card && !card.error && card.chargeDue && ((Number(r.fee) > 0 && !ledger.fee) || (Number(r.deposit) > 0 && !ledger.deposit)));
  const upcoming = r && new Date(r.endsAt).getTime() >= now;
  const ledgerStatus = ledgerOf(r).status;

  return (
    <Sheet open={Boolean(r)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{r ? `${r.amenityName || "Amenity"} · ${r.tenantName || "Resident"}` : "Reservation"}</SheetTitle>
          <SheetDescription>{r ? formatSlot(r) : ""}</SheetDescription>
        </SheetHeader>

        {r ? (
          <div className="space-y-6 px-4 pb-8 pt-2">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status={r.status} map={RESERVATION_STATUS_MAP} />
              {hasCharges(r) && live ? <StatusPill status={ledgerStatus || "not_charged"} map={LEDGER_STATUS_MAP} /> : null}
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <Fact label="Resident">{r.tenantName}</Fact>
              <Fact label="Unit">{r.unit}</Fact>
              <Fact label="Guests">{r.guests ? String(r.guests) : "None"}</Fact>
              <Fact label="Booked via">{r.requestedVia || "Staff"}</Fact>
              <Fact label="Fee">{money2(r.fee)}</Fact>
              <Fact label="Deposit">{money2(r.deposit)}</Fact>
            </div>
            {r.notes ? <p className="whitespace-pre-wrap rounded-lg border border-border bg-surface-subtle p-3 text-sm text-text-secondary">{r.notes}</p> : null}

            {hasCharges(r) && live ? (
              <div>
                <p className={sectionLabel}>On the ledger</p>
                {!canView ? (
                  <p className="rounded-lg border border-border bg-surface-subtle p-3 text-sm text-text-tertiary">{LEDGER_LOCKED}</p>
                ) : !card ? (
                  <ListLoading label="Loading the ledger" className="py-6" />
                ) : card.error ? (
                  <Callout tone="danger">{card.error}</Callout>
                ) : (
                  <div className="space-y-3">
                    <ul className="divide-y divide-border rounded-lg border border-border bg-surface-subtle">
                      {Number(r.fee) > 0 || ledger.fee ? <LedgerRow label="Fee" amount={ledger.fee?.amount ?? r.fee}>{feeDetail(ledger.fee, card)}</LedgerRow> : null}
                      {Number(r.deposit) > 0 || ledger.deposit ? <LedgerRow label="Deposit" amount={ledger.deposit?.amount ?? r.deposit}>{depositDetail(card)}</LedgerRow> : null}
                    </ul>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <Fact label="Billed to">{billToLabel(card)}</Fact>
                      <Fact label="Charged">{CHARGE_ON_OPTIONS.find((o) => o.value === card.chargeOn)?.label}</Fact>
                      <Fact label="Free cancellation">
                        {card.freeCancelUntil ? `${card.insideFreeWindow ? "Until" : "Ended"} ${when(card.freeCancelUntil)}` : "Any time before the start"}
                      </Fact>
                    </div>
                    {r.status === "cancelled" && held > 0 ? (
                      <Callout tone="warning">Cancelled after the free-cancellation window — the {money2(held)} deposit is still held. Release it, or forfeit it if anything was damaged.</Callout>
                    ) : null}
                    {needsCharge && !r.tenantId ? <Callout tone="warning">Link this booking to a tenant to charge its fee and deposit.</Callout> : null}
                  </div>
                )}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              {r.status === "requested" ? (
                <>
                  <Button className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={Boolean(busy)} onClick={() => setStatus("approved")}>
                    {busy === "approved" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Approve
                  </Button>
                  <Button variant="ghost" className="text-red-600 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400" disabled={Boolean(busy)} onClick={() => setStatus("declined")}>
                    {busy === "declined" ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />} Decline
                  </Button>
                </>
              ) : null}
              {needsCharge && r.tenantId ? (
                <RoleGate allowed={canPost} reason={NO_POST}>
                  <Button variant="outline" className={outlineButton} disabled={Boolean(busy) || !canPost} onClick={charge}>
                    {busy === "charge" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ReceiptText className="h-4 w-4" />} Charge fee &amp; deposit
                  </Button>
                </RoleGate>
              ) : null}
              {held > 0 ? (
                <>
                  <RoleGate allowed={canPost} reason={NO_POST}>
                    <Button variant="outline" className={outlineButton} disabled={Boolean(busy) || !canPost} onClick={release}>
                      {busy === "release" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />} Release deposit
                    </Button>
                  </RoleGate>
                  <RoleGate allowed={canPost} reason={NO_POST}>
                    <Button variant="outline" className={outlineButton} disabled={Boolean(busy) || !canPost} onClick={() => setDialog("forfeit")}>
                      <Gavel className="h-4 w-4" /> Forfeit deposit
                    </Button>
                  </RoleGate>
                </>
              ) : null}
              {r.status === "approved" && upcoming ? (
                <Button variant="ghost" className="text-text-secondary hover:bg-surface-hover" disabled={Boolean(busy)} onClick={() => setDialog("cancel")}>
                  {busy === "cancelled" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />} Cancel booking
                </Button>
              ) : null}
              {onOpenAmenity && r.amenityId ? (
                <Button variant="outline" className={outlineButton} onClick={() => onOpenAmenity(r.amenityId)}>
                  <ExternalLink className="h-4 w-4" /> Open amenity
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}

        <WizardDialog
          open={dialog === "forfeit"}
          onOpenChange={(o) => !o && setDialog(null)}
          title="Forfeit deposit"
          description="Keeps the deposit as Other Income for damage; whatever you don't forfeit is released to the resident's account."
          steps={forfeitSteps}
          initial={{ amount: held, reason: "" }}
          finishLabel="Forfeit"
          onFinish={forfeit}
        />
        <WizardDialog
          open={dialog === "cancel"}
          onOpenChange={(o) => !o && setDialog(null)}
          title="Cancel booking"
          description={r ? `${r.amenityName || "Amenity"} · ${formatSlot(r)}` : ""}
          steps={cancelSteps}
          initial={{}}
          finishLabel="Cancel Booking"
          onFinish={() => setStatus("cancelled")}
        />
      </SheetContent>
    </Sheet>
  );
}

export default ReservationSheet;
