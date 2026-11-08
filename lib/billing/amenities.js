import "server-only";
import { accountLabel, buildCharge, buildOtherDepositCharge, buildOtherDepositForfeit, buildOtherDepositRelease } from "@/lib/ledger/postings";
import { voidPosted } from "@/lib/ledger/store";
import { logActivity } from "@/lib/messaging/threads";
import { forProject } from "@/lib/supabase/scope";
import { makeBillingContext } from "./context";
import { isoDate, round2 } from "./periods";
import { fail, openOnEntries, postOnce } from "./post";
import { isUuid } from "./payment_rules";
import { BILLABLE_STATUSES } from "./rent";
import {
  amenityKey,
  amenityKeys,
  amenityLedger,
  cancelPlan,
  chargeOnOf,
  freeCancelUntil,
  insideFreeWindow,
  isChargeDue,
  planSettlement,
} from "./amenities_math";

// Server-only amenity reservation fees and deposits (CORE-18): charge the fee (Dr 1200 / Cr fee GL) and deposit (Dr 1200 / Cr 2120), release or forfeit the deposit, and void both on a free cancellation; every posting is keyed amenity:<reservationId>:<kind>.

const ENTRY_COLS = "id, idempotency_key, status, total, entry_date, lease_id, tenant_id, unit_id, property_id, deleted_at";
const CLOSED = ["cancelled", "declined"];

const must = ({ data, error }, what) => {
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
};
const usd = (n) => `$${round2(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const metaOf = (row) => (row?.metadata && typeof row.metadata === "object" ? row.metadata : {});

async function rowOf(admin, table, id, projectId, cols = "*") {
  if (!isUuid(id)) return null;
  const row = must(await forProject(admin.from(table).select(cols).eq("id", id), projectId).maybeSingle(), table);
  return row && !row.deleted_at ? row : null;
}

export async function loadReservation(admin, id, projectId) {
  const row = await rowOf(admin, "amenity_reservations", id, projectId);
  if (!row) throw fail("Reservation not found.", 404);
  return row;
}

const amenityOf = (admin, r) => rowOf(admin, "amenities", r.amenity_id, r.project_id, "id, name, metadata, deleted_at");

// The reservation's keyed entries (fee, deposit, release, forfeit).
async function keyedEntries(admin, r) {
  return must(await forProject(admin.from("ledger_entries").select(ENTRY_COLS), r.project_id).in("idempotency_key", amenityKeys(r.id)), "ledger entries");
}
const ledgerOf = async (admin, r) => amenityLedger(await keyedEntries(admin, r), r.id);

// The tenant's live lease on a unit (their own, or one they're a party to), newest first.
async function liveLeaseFor(admin, projectId, tenantId, unitId) {
  if (!tenantId || !unitId) return null;
  const [leases, parties] = await Promise.all([
    forProject(admin.from("leases").select("id, name, tenant_id, unit_id, property_id, status, term_start, deleted_at"), projectId).eq("unit_id", unitId).in("status", BILLABLE_STATUSES).is("deleted_at", null),
    forProject(admin.from("lease_parties").select("lease_id"), projectId).eq("tenant_id", tenantId).is("deleted_at", null),
  ]);
  const party = new Set(must(parties, "lease parties").map((p) => p.lease_id));
  const mine = must(leases, "leases").filter((l) => l.tenant_id === tenantId || party.has(l.id));
  return mine.sort((a, b) => String(b.term_start || "").localeCompare(String(a.term_start || "")))[0] || null;
}

// Who a booking bills: the tenant on their live lease for the booked unit, else the tenant alone (with the unit and property when known).
async function billTo(admin, r) {
  const projectId = r.project_id;
  const tenant = r.tenant_id ? await rowOf(admin, "tenants", r.tenant_id, projectId, "id, name, unit_id, property_id, deleted_at") : null;
  if (!tenant) return { tenant: null, lease: null, dims: {} };
  const unit = await rowOf(admin, "units", r.unit_id || tenant.unit_id, projectId, "id, label, property_id, deleted_at");
  const lease = await liveLeaseFor(admin, projectId, tenant.id, unit?.id);
  const dims = { tenantId: tenant.id, leaseId: lease?.id, unitId: unit?.id, propertyId: lease?.property_id || unit?.property_id || tenant.property_id || undefined };
  return { tenant, lease, dims };
}

// The fee's income account: the amenity's feeGlAccountId when it's a live income account, else Other Income (4100).
function feeGlOf(amenity, acct) {
  const chosen = acct.byId.get(metaOf(amenity).feeGlAccountId);
  return chosen && chosen.accountType === "Income" && chosen.status !== "Inactive" ? chosen.id : acct.byKey.get("other_income")?.id || null;
}

async function labelOf(c, r, amenity) {
  const tz = await c.timeZone(r.project_id);
  const day = r.starts_at ? new Date(r.starts_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: tz }) : "";
  return [amenity?.name || r.amenity_name || "Amenity", day].filter(Boolean).join(" · ");
}

// Cache the ledger state on the reservation (metadata.ledger) for lists; the keyed entries stay the source of truth.
async function syncLedger(admin, r, l, extra = {}) {
  const prev = metaOf(r).ledger && typeof metaOf(r).ledger === "object" ? metaOf(r).ledger : {};
  const ledger = {
    ...prev,
    ...extra,
    feeEntryId: l.fee?.entryId || null,
    depositEntryId: l.deposit?.entryId || null,
    settledEntryId: l.forfeit?.entryId || l.release?.entryId || null,
    releaseEntryId: l.release?.entryId || null,
    forfeitEntryId: l.forfeit?.entryId || null,
    fee: l.fee?.amount || 0,
    deposit: l.deposit?.amount || 0,
    held: l.held,
    status: l.status,
  };
  must(await admin.rpc("merge_meta", { p_table: "amenity_reservations", p_id: r.id, p_patch: { ledger } }), "reservation");
  r.metadata = { ...metaOf(r), ledger };
  return ledger;
}

async function log(admin, r, summary, actor) {
  if (r.amenity_id) await logActivity(admin, { projectId: r.project_id, ownerType: "amenity", ownerId: r.amenity_id, verb: "action", summary, actorId: actor?.id || null, actorName: actor?.name || "" });
}

const entryView = (x) => (x ? { entryId: x.entryId, amount: x.amount, date: x.date, status: x.status } : null);

// The drawer's ledger card: what's posted, what's open on the charges, who it bills, and the free-cancel window.
export async function reservationStatus(admin, r, { ctx, now = new Date() } = {}) {
  const c = ctx || makeBillingContext(admin);
  const amenity = await amenityOf(admin, r);
  const [l, who, acct] = await Promise.all([ledgerOf(admin, r), billTo(admin, r), c.accounts(r.project_id)]);
  const charges = [l.fee, l.deposit].filter((x) => x?.status === "posted").map((x) => x.entryId);
  const open = charges.length ? await openOnEntries(admin, r.project_id, acct, charges) : new Map();
  const am = metaOf(amenity);
  const chargeOn = chargeOnOf(amenity);
  return {
    reservationId: r.id,
    status: r.status,
    fee: round2(r.fee),
    deposit: round2(r.deposit),
    chargeOn,
    chargeDue: isChargeDue(chargeOn, r.status) && !CLOSED.includes(r.status),
    ledger: {
      status: l.status,
      held: l.held,
      fee: l.fee ? { ...entryView(l.fee), open: l.fee.status === "posted" ? round2(open.get(l.fee.entryId)) : 0 } : null,
      deposit: l.deposit ? { ...entryView(l.deposit), open: l.deposit.status === "posted" ? round2(open.get(l.deposit.entryId)) : 0 } : null,
      release: entryView(l.release),
      forfeit: entryView(l.forfeit),
    },
    billTo: who.tenant ? { tenantId: who.tenant.id, tenantName: who.tenant.name || "", leaseId: who.lease?.id || null, leaseName: who.lease?.name || "" } : null,
    feeAccount: accountLabel(acct.byId.get(feeGlOf(amenity, acct))),
    depositAccount: accountLabel(acct.byKey.get("other_deposits")),
    cancelHours: Number(am.cancelHours) || 0,
    freeCancelUntil: freeCancelUntil(r.starts_at, am.cancelHours),
    insideFreeWindow: insideFreeWindow({ startsAt: r.starts_at, cancelHours: am.cancelHours, at: now }),
    cancel: metaOf(r).ledger?.cancel || null,
  };
}

// Charge a booking's fee (Dr 1200 / Cr fee GL, amenity:<id>:fee) and deposit (Dr 1200 / Cr 2120, amenity:<id>:deposit) once it's due under the amenity's chargeOn → { entries, ledger }.
export async function chargeReservation(admin, reservation, { actor, ctx, date } = {}) {
  const c = ctx || makeBillingContext(admin);
  const r = reservation;
  const projectId = r.project_id;
  if (CLOSED.includes(r.status)) throw fail(`This reservation was ${r.status}, so there's nothing to charge.`, 409);
  const amenity = await amenityOf(admin, r);
  if (!isChargeDue(chargeOnOf(amenity), r.status)) throw fail("This amenity charges when a booking is approved — approve the reservation first.", 409);
  const prior = await ledgerOf(admin, r);
  const fee = round2(r.fee);
  const deposit = round2(r.deposit);
  const todo = [
    ...(fee > 0 && !prior.fee ? ["fee"] : []),
    ...(deposit > 0 && !prior.deposit ? ["deposit"] : []),
  ];
  if (!todo.length) return { entries: [], ledger: await syncLedger(admin, r, prior), billTo: null };
  const who = await billTo(admin, r);
  if (!who.tenant) throw fail("Link the reservation to a tenant before charging it.", 409);
  const acct = await c.accounts(projectId);
  const on = await c.openDate(projectId, isoDate(date) || (await c.today(projectId)));
  const label = await labelOf(c, r, amenity);
  const meta = { amenityReservationId: r.id, amenityId: r.amenity_id || null, startsAt: r.starts_at || null };
  const opts = { acct, createdBy: actor?.id || null };
  const entries = [];
  for (const kind of todo) {
    const key = amenityKey(r.id, kind);
    const input = { ...who.dims, amount: kind === "fee" ? fee : deposit, date: on, sourceId: r.id, metadata: { ...meta, kind } };
    const res =
      kind === "fee"
        ? await postOnce(admin, projectId, key, (a) => buildCharge({ ...input, glAccountId: feeGlOf(amenity, a), incomeKey: "other_income", memo: `Amenity fee · ${label}` }, a), opts)
        : await postOnce(admin, projectId, key, (a) => buildOtherDepositCharge({ ...input, memo: `Amenity deposit · ${label}` }, a), opts);
    entries.push({ entryId: res.entryId, key, amount: input.amount, kind, created: res.created });
  }
  const ledger = await syncLedger(admin, r, await ledgerOf(admin, r), { chargedOn: on, leaseId: who.lease?.id || null });
  const posted = entries.filter((e) => e.created);
  if (posted.length) await log(admin, r, `Charged ${posted.map((e) => `the ${usd(e.amount)} ${e.kind}`).join(" and ")} for ${r.tenant_name || who.tenant.name || "a resident"}'s booking`, actor);
  return { entries, ledger, billTo: { tenantId: who.tenant.id, leaseId: who.lease?.id || null, leaseName: who.lease?.name || "" } };
}

// Settle the held deposit: forfeit `forfeit` (Dr 2120 / Cr 4100, amenity:<id>:forfeit) and release the rest to the resident's account (Dr 2120 / Cr 1200, amenity:<id>:release); re-runs finish what's missing and post nothing new.
async function settleDeposit(admin, r, action, { forfeit, reason, actor, ctx, date } = {}) {
  const c = ctx || makeBillingContext(admin);
  const projectId = r.project_id;
  const l = await ledgerOf(admin, r);
  if (!l.deposit) throw fail("There's no deposit on the ledger for this reservation.", 409);
  if (l.deposit.status !== "posted") throw fail("The deposit was reversed, so there's nothing to settle.", 409);
  const done = action === "forfeit" ? l.forfeit : l.release;
  if (!(l.held > 0)) {
    if (done) return { entries: [], ledger: await syncLedger(admin, r, l), replay: true };
    throw fail(`The deposit was already ${l.forfeit ? "forfeited" : "released"}.`, 409);
  }
  // A forfeit already posted (a resumed partial forfeit) leaves only the release.
  const plan = action === "release" || l.forfeit ? { forfeit: 0, release: l.held } : planSettlement(l.held, forfeit);
  if (plan.error) throw fail(plan.error);
  const deposit = must(await forProject(admin.from("ledger_entries").select(ENTRY_COLS), projectId).eq("id", l.deposit.entryId).single(), "deposit entry");
  const dims = { leaseId: deposit.lease_id || undefined, tenantId: deposit.tenant_id || undefined, unitId: deposit.unit_id || undefined, propertyId: deposit.property_id || undefined };
  const amenity = await amenityOf(admin, r);
  const acct = await c.accounts(projectId);
  const on = await c.openDate(projectId, isoDate(date) || (await c.today(projectId)));
  const label = await labelOf(c, r, amenity);
  const note = String(reason || "").trim().slice(0, 300);
  const meta = { amenityReservationId: r.id, amenityId: r.amenity_id || null, depositEntryId: deposit.id, ...(note ? { reason: note } : {}) };
  const opts = { acct, createdBy: actor?.id || null };
  const entries = [];
  if (plan.forfeit > 0) {
    const key = amenityKey(r.id, "forfeit");
    const res = await postOnce(admin, projectId, key, (a) => buildOtherDepositForfeit({ ...dims, amount: plan.forfeit, date: on, sourceId: r.id, memo: `Amenity deposit forfeited · ${label}${note ? ` · ${note}` : ""}`, metadata: { ...meta, kind: "forfeit" } }, a), opts);
    entries.push({ entryId: res.entryId, key, amount: plan.forfeit, kind: "forfeit", created: res.created });
  }
  if (plan.release > 0) {
    const key = amenityKey(r.id, "release");
    // Whatever is still unpaid on the deposit charge is settled first; the rest is a credit on the resident's account.
    const open = Math.max(0, round2((await openOnEntries(admin, projectId, acct, [deposit.id])).get(deposit.id)));
    const applied = round2(Math.min(open, plan.release));
    const allocations = applied > 0 ? [{ entryId: deposit.id, amount: applied }] : [];
    const res = await postOnce(admin, projectId, key, (a) => buildOtherDepositRelease({ ...dims, amount: plan.release, allocations, date: on, sourceId: r.id, memo: `Amenity deposit released · ${label}`, metadata: { ...meta, kind: "release" } }, a), opts);
    entries.push({ entryId: res.entryId, key, amount: plan.release, kind: "release", created: res.created });
  }
  const ledger = await syncLedger(admin, r, await ledgerOf(admin, r), { settledOn: on });
  const parts = entries.filter((e) => e.created).map((e) => `${e.kind === "forfeit" ? "forfeited" : "released"} ${usd(e.amount)}`);
  if (parts.length) await log(admin, r, `Deposit ${parts.join(", ")} for ${r.tenant_name || "a resident"}'s booking${note ? ` · ${note}` : ""}`, actor);
  return { entries, ledger };
}

// Release the whole deposit to the resident's account (no damage).
export const releaseDeposit = (admin, r, opts = {}) => settleDeposit(admin, r, "release", opts);

// Forfeit the deposit (damage): all of it, or opts.amount with the rest released.
export const forfeitDeposit = (admin, r, opts = {}) => settleDeposit(admin, r, "forfeit", { ...opts, forfeit: opts.amount });

// Cancel (or decline) a booking: inside the free-cancel window, or on a decline, void its fee and unsettled deposit; outside it the fee stays and the deposit waits for release or forfeit.
// opts.canVoid() is asked only when something must be voided; the decision is stored first so a retry finishes the same cancellation.
export async function cancelReservation(admin, reservation, { actor, ctx, decline = false, now = new Date(), canVoid = async () => true } = {}) {
  const c = ctx || makeBillingContext(admin);
  const r = reservation;
  const target = decline ? "declined" : "cancelled";
  if (decline && !["requested", "declined"].includes(r.status)) throw fail("Only a requested reservation can be declined.", 409);
  if (!decline && !["requested", "approved", "cancelled"].includes(r.status)) throw fail(`A ${r.status} reservation can't be cancelled.`, 409);
  const amenity = await amenityOf(admin, r);
  const prev = metaOf(r).ledger?.cancel || null;
  const at = prev?.at || now.toISOString();
  const inside = prev ? Boolean(prev.inside) : decline || insideFreeWindow({ startsAt: r.starts_at, cancelHours: metaOf(amenity).cancelHours, at });
  const l = await ledgerOf(admin, r);
  const plan = cancelPlan(l, { inside, decline });
  if ((plan.voidFee || plan.voidDeposit) && !(await canVoid())) throw fail("Reversing this booking's fee and deposit needs the Void ledger entries permission.", 403);
  const cancel = { at, inside, decline, by: actor?.name || actor?.email || "Staff" };
  const changed = r.status !== target;
  if (changed || !prev) {
    must(await forProject(admin.from("amenity_reservations").update({ status: target }), r.project_id).eq("id", r.id).select("id"), "reservation");
    r.status = target;
    await syncLedger(admin, r, l, { cancel });
  }
  const label = await labelOf(c, r, amenity);
  const today = await c.today(r.project_id);
  const voided = [];
  for (const [kind, go] of [["fee", plan.voidFee], ["deposit", plan.voidDeposit]]) {
    if (!go) continue;
    try {
      const reversal = await voidPosted(admin, l[kind].entryId, { date: today, memo: `Reservation ${target} · ${label}` });
      voided.push({ kind, entryId: l[kind].entryId, reversalId: reversal, amount: l[kind].amount });
    } catch (e) {
      if (!/already void/i.test(e.message)) throw e;
    }
  }
  const after = await ledgerOf(admin, r);
  const ledger = await syncLedger(admin, r, after, { cancel });
  const what = voided.map((v) => `the ${usd(v.amount)} ${v.kind}`).join(" and ");
  if (changed || voided.length) await log(admin, r, `${decline ? "Declined" : "Cancelled"} ${r.tenant_name || "a resident"}'s booking${what ? ` and reversed ${what}` : ""}`, actor);
  return {
    status: target,
    inside,
    voided,
    keptFee: plan.keepsFee ? after.fee?.amount || 0 : 0,
    heldDeposit: after.held,
    ledger,
  };
}
