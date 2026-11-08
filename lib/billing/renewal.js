import "server-only";
import { logActivity } from "@/lib/messaging/threads";
import { renewalLeaseRow, renewalRent } from "@/lib/leasing/renewal_terms";
import { makeBillingContext } from "./context";
import { addDays, addPeriods, isoDate, periodLabel, periodOf, round2 } from "./periods";
import { billingWindow, rentForPeriod } from "./rent";
import { fail, loadHapLedger, loadRentLedger } from "./post";
import { ensureRentSteps, loadRentSteps, stepRow, syncCurrentRent } from "./steps";
import { successorOf, transferOpenReceivables } from "./receivables";
import { ensureRentAccount, loadLease } from "./service";
import { transferDepositsToLease } from "./deposits";
import { forProject } from "@/lib/supabase/scope";

// Server-only renewal acceptance (CORE-01): one renewed lease per renewal, a clean billing handoff, and the tenant's AR, rent account and autopay moved to it.

const LIVE_PLANS = ["active", "paused", "pending_setup"];
const UNIQUE = "23505";
const metaOf = (r) => (r?.metadata && typeof r.metadata === "object" ? r.metadata : {});
const must = (res, what) => {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
};
// Shallow-merge a metadata patch (property.merge_meta) and mirror it on the in-memory row.
async function mergeMeta(admin, table, row, patch) {
  must(await admin.rpc("merge_meta", { p_table: table, p_id: row.id, p_patch: patch }), table);
  row.metadata = { ...metaOf(row), ...patch };
}

// The old lease bills through the day before the new term → that date; refuses a start that overlaps rent the old lease already billed.
async function checkHandoff(admin, ctx, old, newStart) {
  const end = addDays(newStart, -1);
  const window = billingWindow({ ...old, status: "Renewed", metadata: { ...metaOf(old), billingEndsOn: end } });
  if (!window.start || end < window.start) throw fail(`The new term must start after the current lease starts (${window.start || "it has no start date"}).`);
  const [ledger, hapLedger, steps, policies] = await Promise.all([
    loadRentLedger(admin, old.project_id, [old.id]),
    loadHapLedger(admin, old.project_id, [old.id]),
    ensureRentSteps(admin, old),
    ctx.policies(old),
  ]);
  // A voucher lease's period is billed to the tenant and the housing authority (HOUS-01): compare both against the rent.
  const rentBy = ledger.get(old.id) || new Map();
  const hapBy = hapLedger.get(old.id) || new Map();
  const totalOf = (p) => round2((rentBy.get(p)?.total || 0) + (hapBy.get(p)?.total || 0));
  const billed = [...new Set([...rentBy.keys(), ...hapBy.keys()])].filter((p) => totalOf(p) > 0.004).sort();
  const over = billed.find((p) => p >= periodOf(newStart) && totalOf(p) > rentForPeriod(steps, p, window, policies).total + 0.004);
  if (over) {
    const earliest = `${addPeriods(billed[billed.length - 1], 1)}-01`;
    throw fail(
      `${periodLabel(over)} is already billed on the current lease. Start the new term on ${earliest} or later, or first add a $0 rent step on the current lease from ${newStart} so the overlap is credited back.`,
      409,
    );
  }
  return end;
}

// The renewal's lease, created once: its id is claimed on the renewal (metadata.claimedLeaseId) by an update against the version just read → { lease, created }.
async function claimRenewalLease(admin, renewalId, makeRow) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const current = must(await admin.from("renewals").select("metadata, updated_at").eq("id", renewalId).single(), "renewal");
    const meta = metaOf(current);
    const id = meta.newLeaseId || meta.claimedLeaseId || null;
    if (id) {
      const row = must(await admin.from("leases").select("*").eq("id", id).maybeSingle(), "renewal lease");
      if (row && !row.deleted_at) return { lease: row, created: false };
      if (!row) {
        const ins = await admin.from("leases").insert(makeRow(id)).select("*").single();
        if (!ins.error) return { lease: ins.data, created: true };
        if (ins.error.code !== UNIQUE) throw new Error(`renewal lease: ${ins.error.message}`);
        continue;
      }
    }
    // No lease yet (or it was deleted): claim a fresh id only if nobody touched the row since this read, so no claim or edit is lost.
    const next = { ...meta, newLeaseId: undefined, newLeaseName: undefined, claimedLeaseId: crypto.randomUUID() };
    must(await admin.from("renewals").update({ metadata: next }).eq("id", renewalId).eq("updated_at", current.updated_at).select("id"), "renewal");
  }
  throw fail("This renewal is being accepted elsewhere — try again in a moment.", 409);
}

// Copy the old lease's people and move its recurring charges / held deposits to the renewed lease (once, by the accept that created it).
async function carryLeaseRecords(admin, old, lease, { transferCharges, transferDeposits }) {
  const [parties, charges, deposits] = await Promise.all([
    admin.from("lease_parties").select("*").eq("lease_id", old.id).is("deleted_at", null),
    transferCharges ? admin.from("recurring_charges").select("id").eq("lease_id", old.id).is("deleted_at", null) : { data: [] },
    transferDeposits ? admin.from("security_deposits").select("id, status").eq("lease_id", old.id).is("deleted_at", null) : { data: [] },
  ]);
  const copies = must(parties, "lease parties").map((p) => ({
    project_id: lease.project_id,
    lease_id: lease.id,
    tenant_id: p.tenant_id,
    role: p.role,
    name: p.name,
    email: p.email,
    phone: p.phone,
    responsibility_pct: p.responsibility_pct,
    is_primary: p.is_primary,
    metadata: p.metadata || {},
  }));
  if (copies.length) must(await admin.from("lease_parties").insert(copies), "lease parties");
  const chargeIds = must(charges, "recurring charges").map((r) => r.id);
  if (chargeIds.length) must(await admin.from("recurring_charges").update({ lease_id: lease.id }).in("id", chargeIds), "recurring charges");
  const depositIds = must(deposits, "security deposits").filter((d) => d.status === "Held").map((d) => d.id);
  if (depositIds.length) must(await admin.from("security_deposits").update({ lease_id: lease.id, lease_name: lease.name }).in("id", depositIds), "security deposits");
}

// Accept a renewal: the Pending renewal lease (once, billing from its start) with its step, people, charges, deposits, open AR, rent account and autopay; the old lease is Renewed through the day before; re-runs finish a failed attempt.
export async function onRenewalAccepted(admin, renewal, { actor, ctx, now, transferCharges = true, transferDeposits = true } = {}) {
  const c = ctx || makeBillingContext(admin, { now });
  if (!renewal?.lease_id) throw fail("Link the renewal to a lease first.");
  if (!renewal.new_start || !renewal.new_end) throw fail("Set the new term's start and end first.");
  if (String(renewal.new_end) <= String(renewal.new_start)) throw fail("The new term must end after it starts.");
  if (["Declined", "Moving out"].includes(renewal.status)) throw fail(`This renewal was ${String(renewal.status).toLowerCase()}.`, 409);
  const old = await loadLease(admin, renewal.lease_id, renewal.project_id);
  const today = await c.today(old.project_id);
  const newStart = isoDate(renewal.new_start);
  const claimed = metaOf(renewal).newLeaseId || metaOf(renewal).claimedLeaseId;
  if (old.status === "Renewed") {
    const other = await successorOf(admin, old.id);
    if (other && other.id !== claimed) throw fail(`This lease was already renewed as “${other.name}”.`, 409);
  }
  const billingEndsOn = await checkHandoff(admin, c, old, newStart);

  const { lease, created } = await claimRenewalLease(admin, renewal.id, (id) => renewalLeaseRow(old, renewal, { id, createdBy: actor?.id || null, acceptedOn: today }));
  if (created) await carryLeaseRecords(admin, old, lease, { transferCharges, transferDeposits });
  if (!metaOf(lease).renewalAcceptedOn) await mergeMeta(admin, "leases", lease, { renewalAcceptedOn: today });

  // The new term's rent: one renewal step at its start.
  if (!((await loadRentSteps(admin, [lease.id])).get(lease.id) || []).length) {
    const rent = renewalRent(old, renewal);
    const row = stepRow(lease, { effectiveDate: isoDate(lease.term_start), amount: rent, changeMode: "amount", changeValue: rent, source: "renewal", metadata: { renewalId: renewal.id } }, actor);
    const { error } = await admin.from("lease_rent_steps").insert(row);
    if (error && error.code !== UNIQUE) throw new Error(`rent steps: ${error.message}`);
  }
  await syncCurrentRent(admin, lease, today);

  // The old lease: Renewed, billing through the day before the new term.
  if (metaOf(old).billingEndsOn !== billingEndsOn) await mergeMeta(admin, "leases", old, { billingEndsOn });
  if (old.status !== "Renewed") {
    must(await admin.from("leases").update({ status: "Renewed" }).eq("id", old.id), "lease");
    old.status = "Renewed";
  }
  const entries = await transferOpenReceivables(admin, c, old, lease, { actor, date: today });
  // Deposits that moved to the new lease take their ledger liability along (CORE-04); keyed, so re-runs post nothing.
  const moved = must(await forProject(admin.from("security_deposits").select("id"), lease.project_id).eq("lease_id", lease.id).is("deleted_at", null), "security deposits").map((d) => d.id);
  entries.push(...(await transferDepositsToLease(admin, moved, old, lease, { ctx: c, actor, date: today })));

  // The collection record and live autopay follow the tenant to the new lease.
  const accounts = must(await admin.from("rent_accounts").select("id, lease_id").in("lease_id", [old.id, lease.id]).is("deleted_at", null), "rent account");
  const mine = accounts.find((a) => a.lease_id === lease.id);
  const theirs = accounts.find((a) => a.lease_id === old.id);
  if (!mine && theirs) must(await admin.from("rent_accounts").update({ lease_id: lease.id }).eq("id", theirs.id), "rent account");
  else if (!mine) await ensureRentAccount(admin, lease, { actor });
  must(await admin.from("autopay_plans").update({ lease_id: lease.id }).eq("lease_id", old.id).in("status", LIVE_PLANS).is("deleted_at", null), "autopay");

  const row = must(await admin.from("renewals").select("id, metadata").eq("id", renewal.id).single(), "renewal");
  await mergeMeta(admin, "renewals", row, { claimedLeaseId: null, newLeaseId: lease.id, newLeaseName: lease.name, decidedOn: metaOf(row).decidedOn || today });
  must(await admin.from("renewals").update({ status: "Accepted" }).eq("id", renewal.id), "renewal");
  if (created) {
    const actorName = actor?.name || actor?.email || "";
    await logActivity(admin, { projectId: lease.project_id, ownerType: "lease", ownerId: old.id, verb: "action", summary: `Renewal accepted — new lease “${lease.name}”`, actorId: actor?.id || null, actorName });
    await logActivity(admin, { projectId: lease.project_id, ownerType: "lease", ownerId: lease.id, verb: "created", summary: `Created by renewing “${old.name || "the prior lease"}”`, actorId: actor?.id || null, actorName });
  }
  return { lease, created, entries };
}
