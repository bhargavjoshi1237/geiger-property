import { round2 } from "./periods";

// Amenity reservation fees and deposits on the ledger (CORE-18), pure and browser-safe: keys, when a booking is charged, the free-cancel window, and the ledger state.

export const AMENITY_KINDS = ["fee", "deposit", "release", "forfeit"];
export const amenityKey = (reservationId, kind) => `amenity:${reservationId}:${kind}`;
export const amenityKeys = (reservationId) => AMENITY_KINDS.map((kind) => amenityKey(reservationId, kind));

// amenity:<reservationId>:<kind> → kind when it belongs to this reservation, else "".
export function amenityKindOf(key, reservationId) {
  const parts = String(key || "").split(":");
  if (parts.length !== 3 || parts[0] !== "amenity" || (reservationId && parts[1] !== reservationId)) return "";
  return AMENITY_KINDS.includes(parts[2]) ? parts[2] : "";
}

export const CHARGE_ON_OPTIONS = [
  { value: "approval", label: "When the booking is approved" },
  { value: "reservation", label: "When the booking is made" },
];

// Amenity metadata.chargeOn (default approval).
export const chargeOnOf = (amenity) => ((amenity?.metadata?.chargeOn ?? amenity?.chargeOn) === "reservation" ? "reservation" : "approval");

// A booking is charged once approved, or as soon as it is made when the amenity charges at reservation.
export const isChargeDue = (chargeOn, status) => status === "approved" || (chargeOn === "reservation" && status === "requested");

export const hasCharges = (r) => round2(r?.fee) > 0 || round2(r?.deposit) > 0;

// Last moment a booking cancels for free: its start less the amenity's cancelHours ("" without a start).
export function freeCancelUntil(startsAt, cancelHours) {
  const start = new Date(startsAt || "").getTime();
  if (!startsAt || !Number.isFinite(start)) return "";
  return new Date(start - Math.max(0, Number(cancelHours) || 0) * 3600000).toISOString();
}

// Is `at` inside the free-cancel window? An unscheduled booking always is.
export function insideFreeWindow({ startsAt, cancelHours, at = new Date() }) {
  const until = freeCancelUntil(startsAt, cancelHours);
  if (!until) return true;
  return new Date(at).getTime() <= new Date(until).getTime();
}

const live = (x) => (x && x.status === "posted" ? x.amount : 0);

// A reservation's keyed ledger entries → { fee, deposit, release, forfeit } ({ entryId, amount, date, status } or null), held (2120 still held) and status.
export function amenityLedger(entries, reservationId) {
  const out = { fee: null, deposit: null, release: null, forfeit: null };
  for (const e of entries || []) {
    const kind = amenityKindOf(e.idempotency_key ?? e.idempotencyKey, reservationId);
    if (!kind || e.deleted_at || e.deletedAt) continue;
    out[kind] = { entryId: e.id, amount: round2(e.total), date: String(e.entry_date ?? e.date ?? ""), status: e.status || "posted" };
  }
  const held = Math.max(0, round2(live(out.deposit) - live(out.release) - live(out.forfeit)));
  const ledger = { ...out, held };
  return { ...ledger, status: ledgerStatusOf(ledger) };
}

export const LEDGER_STATUS_MAP = {
  not_charged: { label: "Not charged", variant: "neutral" },
  charged: { label: "Charged", variant: "success" },
  deposit_held: { label: "Deposit held", variant: "info" },
  released: { label: "Deposit released", variant: "success" },
  forfeited: { label: "Deposit forfeited", variant: "warning" },
  reversed: { label: "Reversed", variant: "outline" },
};

export function ledgerStatusOf(l) {
  if (!l?.fee && !l?.deposit) return "not_charged";
  if (!live(l.fee) && !live(l.deposit)) return "reversed";
  if (live(l.deposit)) {
    if (l.held > 0) return "deposit_held";
    if (live(l.forfeit)) return "forfeited";
    if (live(l.release)) return "released";
  }
  return "charged";
}

// Forfeit `forfeit` of the deposit still held (all of it when blank) and release the rest → { forfeit, release } or { error }.
export function planSettlement(held, forfeit) {
  const h = round2(held);
  if (!(h > 0)) return { error: "There's no deposit held for this reservation." };
  const f = forfeit === undefined || forfeit === null || forfeit === "" ? h : round2(forfeit);
  if (!(f >= 0)) return { error: "Enter the amount to forfeit." };
  if (f - h > 0.004) return { error: `Only ${h.toFixed(2)} is held; forfeit that much at most.` };
  return { forfeit: f, release: round2(h - f) };
}

// What cancelling voids: inside the free window (or on a decline) the fee and a deposit not yet settled; outside it nothing (the fee stays, the deposit waits for release or forfeit).
export function cancelPlan(l, { inside, decline = false } = {}) {
  const free = Boolean(inside || decline);
  const settled = Boolean(l?.release || l?.forfeit);
  return {
    voidFee: free && l?.fee?.status === "posted",
    voidDeposit: free && l?.deposit?.status === "posted" && !settled,
    keepsFee: !free && l?.fee?.status === "posted",
    keepsDeposit: l?.deposit?.status === "posted" && !settled && !free,
  };
}
