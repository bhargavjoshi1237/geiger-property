import "server-only";
import { allocateOldestFirst } from "@/lib/ledger/postings";
import { forProject } from "@/lib/supabase/scope";
import { splitPeriod } from "@/lib/housing/hap";
import { makeBillingContext } from "./context";
import { addPeriods, isoDate, maxDate, periodLabel, periodOf, periodRange, round2 } from "./periods";
import { activeSteps, billingStartFor, billingWindow, chargeDateFor, initialStepFor, leaseFacts, meta, rentForPeriod } from "./rent";
import { fail, loadRentLedger, openOnEntries, postOnce } from "./post";
import { leaseReceivables } from "./receivables";
import {
  CONCESSION_STATUSES,
  PERIOD_LIST_TYPES,
  POSTING_TYPES,
  SPREADABLE_TYPES,
  buildConcessionCredit,
  buildConcessionReversal,
  concAdjKey,
  concKey,
  concOnceKey,
  concessionFacts,
  concessionSchedule,
  concessionStartDate,
  creditedPeriods,
  emptyConcessionSlot,
  normalizePeriods,
  planLeaseConcessions,
  renewalConcession,
  specialIsActive,
  specialToConcession,
  summarizeConcessionEntries,
} from "./concessions";

// Server-only lease concessions (CORE-05): post each concession's credits against the tenant's billed rent (conc: / conc-adj: keys, Dr 4050 / Cr 1200), save edits with a true-up, copy listing specials and renewal incentives.

const CHUNK = 150;
const TYPES = [...POSTING_TYPES, "waived_fee"];
const must = (res, what) => {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
};

// Live concession record_items per lease → Map leaseId → rows, oldest first.
export async function loadLeaseConcessions(admin, projectId, leaseIds) {
  const ids = [...new Set((leaseIds || []).filter(Boolean))];
  const out = new Map(ids.map((id) => [id, []]));
  for (let i = 0; i < ids.length; i += CHUNK) {
    const q = admin.from("record_items").select("*").eq("owner_type", "lease").eq("kind", "concession").in("owner_id", ids.slice(i, i + CHUNK)).is("deleted_at", null);
    const rows = must(await forProject(q, projectId).order("created_at", { ascending: true }), "concessions");
    for (const r of rows || []) out.get(r.owner_id)?.push(r);
  }
  return out;
}

// Posted concession credits of leases (see summarizeConcessionEntries) → Map concessionId → { slots, onceTaken }.
export async function loadConcessionLedger(admin, projectId, leaseIds) {
  const ids = [...new Set((leaseIds || []).filter(Boolean))];
  const rows = [];
  const cols = "id, lease_id, entry_date, status, reversal_of, idempotency_key, total, deleted_at, created_at, credit:metadata->credit, period:metadata->>period";
  for (let i = 0; i < ids.length; i += CHUNK) {
    const q = admin.from("ledger_entries").select(cols).in("lease_id", ids.slice(i, i + CHUNK)).like("idempotency_key", "conc%");
    rows.push(...(must(await forProject(q, projectId), "concession ledger") || []));
  }
  return summarizeConcessionEntries(rows);
}

// Billed tenant rent per period (rent-family entries, HOUS-01: the tenant's share) → Map period → amount.
const billedRent = (rentSums) => new Map([...(rentSums || new Map()).entries()].filter(([, s]) => s.entries.length).map(([p, s]) => [p, s.total]));

// Up to `amount` over entries in order, each up to `cap(entryId)` → allocations.
function allocateUpTo(entryIds, amount, cap) {
  const allocations = [];
  let left = round2(amount);
  for (const id of entryIds) {
    if (left <= 0) break;
    const take = round2(Math.min(left, Math.max(0, cap(id))));
    if (take > 0) {
      allocations.push({ entryId: id, amount: take });
      left = round2(left - take);
    }
  }
  return allocations;
}

// Post one concession slot's difference: a credit applied to the period's rent (oldest open items for the one-time piece), or a reversal taking back unapplied credit first and re-opening the rent with the rest.
async function postDelta(admin, lease, w, { acct, rentSums, today, fresh, actor, auto, window, dueDay }) {
  const l = leaseFacts(lease);
  const { c, period, delta, slot } = w;
  const rentSum = rentSums.get(period) || { charges: [], entries: [], primaryEntryId: null };
  const start = concessionStartDate(c, lease);
  const slotDate = w.once && periodOf(start) === period ? start : chargeDateFor(period, window, dueDay);
  const main = delta > 0 && !slot.entries.length && (w.once ? !w.onceTaken : !slot.mainKeyTaken);
  const key = main ? (w.once ? concOnceKey(c.id) : concKey(c.id, period)) : concAdjKey(c.id, period, slot.maxAdj + 1);
  const date = main && fresh.has(period) ? slotDate : maxDate(slotDate, today);
  const label = periodLabel(period);
  const name = c.name || "Concession";
  const metadata = {
    billing: "concession",
    concessionId: c.id,
    concessionType: c.type,
    period,
    credit: delta,
    computed: w.target,
    posted: slot.total,
    rentBilled: round2(rentSum.total || 0),
    ...(w.once ? { once: true } : {}),
    ...(auto ? { auto: true } : {}),
  };
  const dims = { leaseId: l.id, tenantId: l.tenantId, unitId: l.unitId, propertyId: l.propertyId, sourceId: c.id, date, metadata };
  let build;
  if (delta > 0) {
    let allocations;
    if (w.once) {
      const open = await leaseReceivables(admin, l.projectId, acct, l.id);
      allocations = allocateOldestFirst(open.items, delta).allocations;
    } else {
      const ids = rentSum.charges.map((x) => x.id);
      const open = await openOnEntries(admin, l.projectId, acct, ids);
      allocations = allocateUpTo(ids, delta, (id) => open.get(id) || 0);
    }
    const memo = `${main ? "Concession" : "Concession adjustment"} · ${name} · ${label}`;
    build = (a) => buildConcessionCredit({ ...dims, amount: delta, allocations, memo }, a);
  } else {
    // Unapplied credit (this concession's or a rent true-up's in the period) is taken back first, so no open charge sits beside a credit.
    const pools = [...slot.entries.map((e) => e.id), ...rentSum.entries.filter((e) => e.amount < 0).map((e) => e.id)];
    const open = await openOnEntries(admin, l.projectId, acct, pools);
    const allocations = allocateUpTo(pools, -delta, (id) => -(open.get(id) || 0));
    const rest = round2(-delta - allocations.reduce((s, a) => s + a.amount, 0));
    if (rest > 0 && rentSum.primaryEntryId) allocations.push({ entryId: rentSum.primaryEntryId, amount: rest });
    build = (a) => buildConcessionReversal({ ...dims, amount: -delta, allocations, memo: `Concession adjustment · ${name} · ${label}` }, a);
  }
  const res = await postOnce(admin, l.projectId, key, build, { acct, createdBy: actor?.id || null });
  return { entryId: res.entryId, key, amount: delta, kind: delta > 0 ? "concession" : "concession-reversal", created: res.created };
}

// Post every concession's credits for a lease's billed periods (opts.periods narrows them) → posted entries; a bounded concession whose periods all posted becomes Used.
// opts: concessions (preloaded rows), removed (rows whose posted credits go back to 0), ledger (rent ledger), fresh (periods whose rent this run posted: credits share its date), periods, today, policies, settings, actor, auto.
export async function billLeaseConcessions(admin, ctx, lease, opts = {}) {
  const l = leaseFacts(lease);
  const projectId = l.projectId;
  const rows = opts.concessions ?? (await loadLeaseConcessions(admin, projectId, [l.id])).get(l.id) ?? [];
  const removed = (opts.removed || []).map(concessionFacts);
  const live = rows.map(concessionFacts).filter((c) => POSTING_TYPES.includes(c.type));
  if (!live.length && !removed.length) return [];
  const window = billingWindow(lease);
  if (!window.billable) return [];
  const policies = opts.policies || (await ctx.policies(lease));
  const settings = opts.settings || (await ctx.settings(projectId));
  const today = opts.today || (await ctx.today(projectId));
  const rentLedger = opts.ledger?.has(l.id) ? opts.ledger : await loadRentLedger(admin, projectId, [l.id]);
  const rentSums = rentLedger.get(l.id) || new Map();
  const posted = await loadConcessionLedger(admin, projectId, [l.id]);
  const plans = planLeaseConcessions(live, lease, billedRent(rentSums), { floor: billingStartFor(lease, settings), dueDay: policies.rentDueDay, posted: creditedPeriods(posted) });
  const scope = opts.periods ? new Set(opts.periods) : null;

  const work = [];
  const totals = new Map();
  for (const c of [...live, ...removed]) {
    const plan = plans.get(c.id) || { slots: new Map() };
    const mine = posted.get(c.id) || { slots: new Map(), onceTaken: false };
    const periods = [...new Set([...plan.slots.keys(), ...[...mine.slots.entries()].filter(([, s]) => s.entries.length).map(([p]) => p)])].sort();
    const now = new Map();
    for (const period of periods) {
      const slot = mine.slots.get(period) || emptyConcessionSlot();
      const target = plan.slots.get(period)?.amount || 0;
      now.set(period, { target, total: slot.total });
      if (scope && !scope.has(period)) continue;
      const delta = round2(target - slot.total);
      if (Math.abs(delta) >= 0.005) work.push({ c, period, delta, target, slot, once: Boolean(plan.slots.get(period)?.once), onceTaken: mine.onceTaken });
    }
    totals.set(c.id, now);
  }
  if (!work.length && !live.some((c) => c.status === "Active")) return [];

  const acct = await ctx.accounts(projectId);
  const entries = [];
  // Reversals first, so rent they re-open can take a credit posted in the same run.
  work.sort((a, b) => Number(a.delta > 0) - Number(b.delta > 0) || a.period.localeCompare(b.period));
  const base = { acct, rentSums, today, fresh: opts.fresh || new Set(), actor: opts.actor, auto: opts.auto, window, dueDay: policies.rentDueDay };
  for (const w of work) {
    if (!(await ctx.isPeriodOpen(projectId, w.period))) continue;
    const res = await postDelta(admin, lease, w, base);
    entries.push(res);
    totals.get(w.c.id).get(w.period).total = round2(w.slot.total + w.delta);
  }

  // Used: a bounded concession with nothing left to bill, whose posted credits all match.
  for (const c of live.filter((x) => x.status === "Active")) {
    const plan = plans.get(c.id);
    const slots = totals.get(c.id) || new Map();
    const done = plan && plan.bounded && !plan.waiting && slots.size > 0 && [...slots.values()].every((s) => Math.abs(s.target - s.total) < 0.005);
    if (!done || ![...slots.values()].some((s) => s.total > 0)) continue;
    must(await admin.from("record_items").update({ status: "Used" }).eq("id", c.id).eq("status", "Active").select("id"), "concession");
    must(await admin.rpc("merge_meta", { p_table: "record_items", p_id: c.id, p_patch: { usedOn: today, usedBy: "billing" } }), "concession");
  }
  return entries;
}

// --- Staff edits ------------------------------------------------------------------------------

const text = (v) => (v === null || v === undefined ? "" : String(v).trim());

// Form values → a valid record_item patch, or a thrown 400 naming what's wrong.
function concessionRow(lease, input, existing) {
  const type = text(input.concessionType ?? existing?.metadata?.concessionType);
  if (!TYPES.includes(type)) throw fail("Pick the concession type.");
  const name = text(input.name ?? existing?.name);
  if (!name) throw fail("Describe the concession.");
  const amount = round2(input.amount ?? existing?.amount ?? 0);
  const months = Math.max(0, Number(input.months ?? existing?.metadata?.months) || 0);
  const spread = SPREADABLE_TYPES.includes(type) && (input.spread === true || input.spread === "true");
  const periods = PERIOD_LIST_TYPES.includes(type) && !spread ? normalizePeriods(input.periods) : [];
  if (amount < 0) throw fail("The value can't be negative.");
  if (["amount_off", "one_time"].includes(type) && !(amount > 0)) throw fail("Enter the credit amount.");
  if (type === "percent_off" && !(amount > 0 && amount <= 100)) throw fail("Enter a percent between 0 and 100.");
  if (spread && type === "one_time" && !(amount > 0)) throw fail("Enter the total value to spread.");
  const startsOn = isoDate(input.startsOn) || null;
  const endsOn = isoDate(input.endsOn) || null;
  if (startsOn && endsOn && endsOn < startsOn) throw fail("The concession must end after it starts.");
  const status = CONCESSION_STATUSES.includes(input.status) ? input.status : existing?.status || "Active";
  const keep = { ...meta(existing || {}) };
  for (const k of ["concessionType", "months", "periods", "spread", "waivesItemId", "reason", "approvedBy"]) delete keep[k];
  const metadata = {
    ...keep,
    concessionType: type,
    ...(months ? { months } : {}),
    ...(periods.length ? { periods } : {}),
    ...(spread ? { spread: true } : {}),
    ...(type === "waived_fee" && text(input.waivesItemId) ? { waivesItemId: text(input.waivesItemId) } : {}),
    ...(text(input.reason) ? { reason: text(input.reason) } : {}),
    ...(text(input.approvedBy) ? { approvedBy: text(input.approvedBy) } : {}),
  };
  return { project_id: leaseFacts(lease).projectId, owner_type: "lease", owner_id: lease.id, kind: "concession", name, status, starts_on: startsOn, ends_on: endsOn, amount, metadata };
}

// A waived_fee marks its move-in charge Waived; one already on the ledger has to be credited there instead.
async function waiveMoveInCharge(admin, lease, itemId) {
  const item = must(await admin.from("record_items").select("id, status, owner_id, kind").eq("id", itemId).is("deleted_at", null).maybeSingle(), "move-in charge");
  if (!item || item.owner_id !== lease.id || item.kind !== "move_in_charge") throw fail("Pick one of this lease's move-in charges to waive.");
  const key = `movein:${lease.id}:${itemId}`;
  const postedEntry = must(await forProject(admin.from("ledger_entries").select("id").eq("idempotency_key", key).neq("status", "void").is("deleted_at", null).limit(1), lease.project_id), "ledger");
  if (postedEntry?.length) throw fail("That fee is already on the lease ledger — credit it there instead of waiving it.", 409);
  if (item.status === "Paid") throw fail("That fee is already paid.", 409);
  if (item.status !== "Waived") must(await admin.from("record_items").update({ status: "Waived" }).eq("id", itemId).select("id"), "move-in charge");
}

async function loadConcession(admin, lease, id) {
  const row = must(await admin.from("record_items").select("*").eq("id", id).maybeSingle(), "concession");
  if (!row || row.deleted_at || row.kind !== "concession" || row.owner_id !== lease.id) throw fail("That concession isn't on this lease.", 404);
  return row;
}

// Create or edit a lease concession, then true up its billed periods → { concession, entries }.
export async function saveConcession(admin, lease, input, { actor, ctx, now, id } = {}) {
  const c = ctx || makeBillingContext(admin, { now });
  const existing = id ? await loadConcession(admin, lease, id) : null;
  const row = concessionRow(lease, input || {}, existing);
  if (row.metadata.concessionType === "waived_fee" && row.metadata.waivesItemId) await waiveMoveInCharge(admin, lease, row.metadata.waivesItemId);
  const saved = existing
    ? must(await admin.from("record_items").update(row).eq("id", existing.id).select("*").single(), "concession")
    : must(await admin.from("record_items").insert({ ...row, created_by: actor?.id || null }).select("*").single(), "concession");
  const entries = billingWindow(lease).billable ? await billLeaseConcessions(admin, c, lease, { actor }) : [];
  return { concession: saved, entries };
}

// Remove a concession: its posted credits are taken back first, then the record is soft-deleted → { entries }.
export async function removeConcession(admin, lease, id, { actor, ctx, now } = {}) {
  const c = ctx || makeBillingContext(admin, { now });
  const row = await loadConcession(admin, lease, id);
  const rest = ((await loadLeaseConcessions(admin, leaseFacts(lease).projectId, [lease.id])).get(lease.id) || []).filter((r) => r.id !== id);
  const entries = billingWindow(lease).billable ? await billLeaseConcessions(admin, c, lease, { actor, concessions: rest, removed: [row] }) : [];
  must(await admin.from("record_items").update({ deleted_at: new Date().toISOString() }).eq("id", id).select("id"), "concession");
  return { entries };
}

// --- Listing specials and renewals -----------------------------------------------------------

// Copy a listing's live specials to a lease as concessions (once per special) → { created, skipped }.
export async function copyListingSpecials(admin, lease, listingId, { ctx, now, actor } = {}) {
  const c = ctx || makeBillingContext(admin, { now });
  const projectId = leaseFacts(lease).projectId;
  if (!listingId) return { created: [], skipped: [] };
  const specials = must(
    await forProject(admin.from("record_items").select("*").eq("owner_type", "listing").eq("owner_id", listingId).eq("kind", "special").is("deleted_at", null), projectId).order("sort", { ascending: true }),
    "listing specials",
  );
  const today = await c.today(projectId);
  const have = new Set(((await loadLeaseConcessions(admin, projectId, [lease.id])).get(lease.id) || []).map((r) => meta(r).sourceSpecialId).filter(Boolean));
  const created = [];
  const skipped = [];
  for (const s of specials || []) {
    if (have.has(s.id) || !specialIsActive(s, today)) continue;
    const mapped = specialToConcession(s, lease);
    if (!mapped) continue;
    if (mapped.skip) {
      skipped.push(mapped.skip);
      continue;
    }
    const v = mapped.values;
    const row = { project_id: projectId, owner_type: "lease", owner_id: lease.id, kind: "concession", name: v.name, status: v.status, starts_on: v.startsOn, ends_on: v.endsOn, amount: v.amount, metadata: v.metadata, created_by: actor?.id || null };
    created.push(must(await admin.from("record_items").insert(row).select("*").single(), "concession"));
  }
  return { created, skipped };
}

// The accepted renewal's structured incentive as a concession on the renewed lease (once) → the row, else null.
export async function copyRenewalConcession(admin, renewal, lease, { actor } = {}) {
  const v = renewalConcession(renewal, lease);
  if (!v) return null;
  const q = admin.from("record_items").select("*").eq("owner_type", "lease").eq("owner_id", lease.id).eq("kind", "concession").eq("metadata->>sourceRenewalId", renewal.id).is("deleted_at", null).limit(1);
  const found = must(await q, "concession");
  if (found?.length) return found[0];
  const row = { project_id: lease.project_id, owner_type: "lease", owner_id: lease.id, kind: "concession", name: v.name, status: v.status, starts_on: v.startsOn, ends_on: v.endsOn, amount: v.amount, metadata: v.metadata, created_by: actor?.id || null };
  return must(await admin.from("record_items").insert(row).select("*").single(), "concession");
}

// --- Preview -------------------------------------------------------------------------------------

const PREVIEW_MONTHS = 60;

// Per-period schedule for a lease's concessions: billed months from the ledger, later ones from the rent schedule → { rows, concessions: [{ id, posted, scheduled }] }.
export async function concessionPreview(admin, lease, { ctx, now } = {}) {
  const c = ctx || makeBillingContext(admin, { now });
  const l = leaseFacts(lease);
  const window = billingWindow(lease);
  const [rowsBy, rentLedger, posted, stepRes, policies, settings, today] = await Promise.all([
    loadLeaseConcessions(admin, l.projectId, [l.id]),
    loadRentLedger(admin, l.projectId, [l.id]),
    loadConcessionLedger(admin, l.projectId, [l.id]),
    admin.from("lease_rent_steps").select("*").eq("lease_id", l.id).is("deleted_at", null).eq("status", "active").order("effective_date", { ascending: true }),
    c.policies(lease),
    c.settings(l.projectId),
    c.today(l.projectId),
  ]);
  const rows = rowsBy.get(l.id) || [];
  const billed = billedRent(rentLedger.get(l.id));
  const stepRows = must(stepRes, "rent steps") || [];
  const steps = activeSteps(stepRows).length ? stepRows : [initialStepFor(lease)];
  const projected = new Map();
  if (window.start) {
    const from = periodOf(window.start);
    const horizon = [l.termEnd ? periodOf(l.termEnd) : "", addPeriods(periodOf(today), 12)].sort().pop();
    const to = [addPeriods(from, PREVIEW_MONTHS - 1), window.end ? periodOf(window.end) : horizon, horizon].sort()[0];
    for (const p of periodRange(from, to)) {
      if (billed.has(p)) continue;
      const computed = rentForPeriod(steps, p, window, policies);
      if (computed.total > 0) projected.set(p, splitPeriod(lease, computed, p, { method: policies.prorationMethod }).tenant);
    }
  }
  const schedule = concessionSchedule(rows, lease, { billed, projected, ledger: posted, floor: billingStartFor(lease, settings), dueDay: policies.rentDueDay });
  const per = new Map();
  for (const r of schedule) {
    const t = per.get(r.concessionId) || { id: r.concessionId, posted: 0, scheduled: 0 };
    t.posted = round2(t.posted + r.posted);
    t.scheduled = round2(t.scheduled + r.credit);
    per.set(r.concessionId, t);
  }
  return { rows: schedule, concessions: [...per.values()] };
}
