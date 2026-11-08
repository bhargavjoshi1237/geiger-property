import { buildArTransfer, indexAccounts, normalizeEntry, normalizeLine, openItems } from "@/lib/ledger/postings";
import { logActivity } from "@/lib/messaging/threads";
import { renewalLeaseRow, renewalRent } from "@/lib/leasing/renewal_terms";
import { makeBillingContext } from "./context";
import { isoDate, periodOf, round2 } from "./periods";
import {
  BILLABLE_STATUSES,
  PRE_LIVE_STATUSES,
  STEP_SOURCES,
  activeSteps,
  billablePeriods,
  billingWindow,
  chargeDateFor,
  firstCharge,
  initialStepFor,
  leaseFacts,
  projectSteps,
  resolveStepAmount,
} from "./rent";
import { billLeaseRent, loadRentLedger, postOnce } from "./post";

// Server-only billing services (CORE-01): rent steps, the rent account, activation, Bill now and renewal acceptance; every posting is idempotent.

const CHUNK = 150;
const LIVE_PLANS = ["active", "paused", "pending_setup"];
const UNIQUE = "23505";

const fail = (message, status = 400) => Object.assign(new Error(message), { status });

export async function loadLease(admin, leaseId, projectId) {
  const { data, error } = await admin.from("leases").select("*").eq("id", leaseId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.deleted_at) throw fail("Lease not found.", 404);
  if (projectId && data.project_id && data.project_id !== projectId) throw fail("That lease belongs to another project.", 403);
  return data;
}

// Active rent steps per lease → Map leaseId → rows, oldest first.
export async function loadRentSteps(admin, leaseIds) {
  const ids = [...new Set((leaseIds || []).filter(Boolean))];
  const out = new Map(ids.map((id) => [id, []]));
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await admin
      .from("lease_rent_steps")
      .select("*")
      .in("lease_id", ids.slice(i, i + CHUNK))
      .is("deleted_at", null)
      .eq("status", "active")
      .order("effective_date", { ascending: true });
    if (error) throw new Error(`rent steps: ${error.message}`);
    for (const r of data || []) out.get(r.lease_id)?.push(r);
  }
  return out;
}

const stepRow = (lease, s, actor) => ({
  project_id: leaseFacts(lease).projectId,
  lease_id: lease.id,
  effective_date: s.effectiveDate,
  amount: round2(s.amount),
  change_mode: s.changeMode || "amount",
  change_value: s.changeValue ?? round2(s.amount),
  source: s.source || "manual",
  note: s.note || null,
  created_by: actor?.id || null,
  metadata: s.metadata || {},
});

// A lease's steps, creating the initial step from its current rent when it has none.
export async function ensureRentSteps(admin, lease, { actor } = {}) {
  const rows = (await loadRentSteps(admin, [lease.id])).get(lease.id) || [];
  if (rows.length) return rows;
  const { error } = await admin.from("lease_rent_steps").insert(stepRow(lease, { ...initialStepFor(lease), metadata: { auto: true } }, actor));
  if (error && error.code !== UNIQUE) throw new Error(`rent steps: ${error.message}`);
  return (await loadRentSteps(admin, [lease.id])).get(lease.id) || [];
}

// leases.rent ← the step in force on asOf (property.lease_sync_current_rent is its only writer).
export async function syncCurrentRent(admin, lease, asOf) {
  const { data, error } = await admin.rpc("lease_sync_current_rent", { p_lease_id: lease.id, p_as_of: asOf });
  if (error) throw new Error(`sync rent: ${error.message}`);
  const rent = Number(data) || 0;
  lease.rent = rent;
  return rent;
}

// The lease's collection record (autopay, method, collections status, notes), created when missing.
export async function ensureRentAccount(admin, lease, { actor } = {}) {
  const read = async () => {
    const { data, error } = await admin.from("rent_accounts").select("*").eq("lease_id", lease.id).is("deleted_at", null).limit(1);
    if (error) throw new Error(`rent account: ${error.message}`);
    return data?.[0] || null;
  };
  const existing = await read();
  if (existing) return existing;
  const l = leaseFacts(lease);
  let propertyName = "";
  if (l.propertyId) {
    const { data } = await admin.from("properties").select("name").eq("id", l.propertyId).maybeSingle();
    propertyName = data?.name || "";
  }
  const who = [l.unit, l.tenantName].filter(Boolean).join(" — ") || l.name || "Rent account";
  const { error } = await admin.from("rent_accounts").insert({
    project_id: l.projectId,
    name: propertyName ? `${propertyName} · ${who}` : who,
    unit: l.unit || null,
    tenant_name: l.tenantName || null,
    tenant_id: l.tenantId || null,
    unit_id: l.unitId || null,
    property_id: l.propertyId || null,
    lease_id: l.id,
    status: "Current",
    autopay: false,
    created_by: actor?.id || null,
    metadata: { autoCreated: true, ...(propertyName ? { propertyName } : {}) },
  });
  if (error && error.code !== UNIQUE) throw new Error(`rent account: ${error.message}`);
  return read();
}

// Bill a lease's due periods (or opts.periods) → { entries, periods }; opts.catchUpMonths null bills from the lease start.
export async function billLeaseThrough(admin, ctx, lease, opts = {}) {
  const projectId = leaseFacts(lease).projectId;
  const window = billingWindow(lease);
  if (!window.billable) return { entries: [], periods: [] };
  const settings = opts.settings || (await ctx.goLiveSettings(projectId));
  const policies = opts.policies || (await ctx.policies(lease));
  const today = opts.today || (await ctx.today(projectId));
  const steps = opts.steps || (await ensureRentSteps(admin, lease, opts));
  const ledger = opts.ledger || (await loadRentLedger(admin, projectId, [lease.id]));
  const periods =
    opts.periods ||
    billablePeriods({
      window,
      dueDay: policies.rentDueDay,
      today,
      billingStartsOn: settings.billingStartsOn,
      leadDays: settings.rentPostLeadDays,
      catchUpMonths: opts.catchUpMonths === undefined ? 3 : opts.catchUpMonths,
      includeFirst: Boolean(opts.includeFirst),
    });
  const out = { entries: [], periods: [] };
  for (const period of periods) {
    const r = await billLeaseRent(admin, ctx, lease, period, { steps, ledger, today, policies, actor: opts.actor, auto: opts.auto });
    out.periods.push(r);
    out.entries.push(...r.entries);
  }
  return out;
}

// Billed periods from `from` on that a schedule change may true up (never before go-live).
async function billedPeriodsFrom(admin, ctx, lease, from) {
  const l = leaseFacts(lease);
  const [ledger, settings, policies] = await Promise.all([loadRentLedger(admin, l.projectId, [l.id]), ctx.goLiveSettings(l.projectId), ctx.policies(lease)]);
  const window = billingWindow(lease);
  const periods = [...(ledger.get(l.id)?.entries() || [])]
    .filter(([p, sum]) => p >= from && sum.entries.length)
    .map(([p]) => p)
    .filter((p) => !settings.billingStartsOn || chargeDateFor(p, window, policies.rentDueDay) >= settings.billingStartsOn)
    .sort();
  return { ledger, periods, policies };
}

// After a schedule change: re-project percent steps, sync leases.rent, true up open billed periods from `from`.
async function applyScheduleChange(admin, ctx, lease, from, actor) {
  const l = leaseFacts(lease);
  const current = (await loadRentSteps(admin, [l.id])).get(l.id) || [];
  for (const s of projectSteps(current).filter((x) => x.changed)) {
    const { error } = await admin.from("lease_rent_steps").update({ amount: s.amount }).eq("id", s.id);
    if (error) throw new Error(`rent steps: ${error.message}`);
  }
  const steps = (await loadRentSteps(admin, [l.id])).get(l.id) || [];
  const today = await ctx.today(l.projectId);
  const rent = await syncCurrentRent(admin, lease, today);
  if (!billingWindow(lease).billable) return { steps, rent, entries: [] };
  const { ledger, periods, policies } = await billedPeriodsFrom(admin, ctx, lease, from);
  const entries = [];
  for (const period of periods) {
    const r = await billLeaseRent(admin, ctx, lease, period, { steps, ledger, today, policies, actor });
    entries.push(...r.entries);
  }
  return { steps, rent, entries };
}

// Lease went live: steps, current rent, rent account, a renewal's stragglers, then the first (prorated) period and anything due since; CORE-04 adds the deposit.
export async function onLeaseActivated(admin, lease, { actor, ctx, now } = {}) {
  const c = ctx || makeBillingContext(admin, { now });
  const l = leaseFacts(lease);
  if (!BILLABLE_STATUSES.includes(l.status)) throw fail("Activate the lease first — it isn't live yet.", 409);
  const steps = await ensureRentSteps(admin, lease, { actor });
  const today = await c.today(l.projectId);
  const rent = await syncCurrentRent(admin, lease, today);
  const rentAccount = await ensureRentAccount(admin, lease, { actor });
  const entries = [];
  if (l.renewalOfId) {
    const prior = await loadLease(admin, l.renewalOfId).catch(() => null);
    if (prior) entries.push(...(await transferOpenReceivables(admin, c, prior, lease, { actor, date: today })));
  }
  const policies = await c.policies(lease);
  const billed = await billLeaseThrough(admin, c, lease, { steps, today, policies, includeFirst: true, catchUpMonths: null, actor });
  entries.push(...billed.entries);
  return { entries, rent, rentAccountId: rentAccount?.id || null, firstCharge: firstCharge(lease, steps, policies) };
}

// Add a dated rent step (step.replaces swaps one out); Draft/Pending leases edit their initial rent in place (source "initial").
export async function addRentStep(admin, lease, step, { actor, ctx, now } = {}) {
  const c = ctx || makeBillingContext(admin, { now });
  const l = leaseFacts(lease);
  const source = STEP_SOURCES.includes(step.source) ? step.source : "manual";
  const steps = await ensureRentSteps(admin, lease, { actor });
  const preLive = PRE_LIVE_STATUSES.includes(l.status);

  if (source === "initial") {
    if (!preLive) throw fail("A live lease's rent changes with a dated step — add one instead of editing the initial rent.");
    const amount = round2(step.amount ?? step.changeValue);
    if (!(amount >= 0)) throw fail("Enter the monthly rent.");
    const first = activeSteps(steps)[0];
    const date = isoDate(step.effectiveDate) || billingWindow(lease).start || first.effectiveDate;
    const patch = { amount, change_mode: "amount", change_value: amount, effective_date: date };
    const { error } = await admin.from("lease_rent_steps").update(patch).eq("id", first.id);
    if (error) throw fail(error.code === UNIQUE ? "Another rent step already starts on that date." : error.message);
    const out = await applyScheduleChange(admin, c, lease, "0000-00", actor);
    return { step: { ...first, ...patch }, ...out };
  }

  const live = activeSteps(steps);
  const replaced = step.replaces ? live.find((s) => s.id === step.replaces) : null;
  if (step.replaces && !replaced) throw fail("That rent step was already changed — reload and try again.", 409);
  const resolved = resolveStepAmount(steps, { ...step, source });
  if (resolved.error) throw fail(resolved.error);
  const date = isoDate(step.effectiveDate);
  if (live.some((s) => s.effectiveDate === date && s.id !== replaced?.id)) throw fail(`The rent already changes on ${date}. Edit that step instead.`, 409);
  if (replaced) {
    const { error } = await admin
      .from("lease_rent_steps")
      .update({ status: "cancelled", metadata: { ...replaced.metadata, replacedOn: new Date().toISOString(), replacedBy: actor?.id || null } })
      .eq("id", replaced.id);
    if (error) throw new Error(error.message);
  }
  const metadata = { ...(resolved.premium !== undefined ? { premium: resolved.premium } : {}), ...(replaced ? { replaces: replaced.id } : {}) };
  const row = stepRow(lease, { effectiveDate: date, amount: resolved.amount, changeMode: resolved.changeMode, changeValue: resolved.changeValue, source, note: step.note, metadata }, actor);
  const { data: inserted, error } = await admin.from("lease_rent_steps").insert(row).select("*").single();
  if (error) {
    if (replaced) await admin.from("lease_rent_steps").update({ status: "active" }).eq("id", replaced.id);
    throw fail(error.code === UNIQUE ? `The rent already changes on ${date}.` : error.message);
  }
  const from = periodOf(replaced && replaced.effectiveDate < date ? replaced.effectiveDate : date);
  return { step: inserted, ...(await applyScheduleChange(admin, c, lease, from, actor)) };
}

// Cancel a rent step (never a live lease's first one) and true up what it billed.
export async function cancelRentStep(admin, lease, stepId, { actor, ctx, now } = {}) {
  const c = ctx || makeBillingContext(admin, { now });
  const l = leaseFacts(lease);
  const live = activeSteps(await ensureRentSteps(admin, lease, { actor }));
  const target = live.find((s) => s.id === stepId);
  if (!target) throw fail("That rent step isn't active on this lease.", 404);
  if (live.length === 1) throw fail("A lease needs at least one rent step.");
  if (live[0].id === target.id && !PRE_LIVE_STATUSES.includes(l.status)) {
    throw fail("The first rent step can't be cancelled on a live lease. Replace it with the correct amount instead.");
  }
  const { error } = await admin
    .from("lease_rent_steps")
    .update({ status: "cancelled", metadata: { ...target.metadata, cancelledOn: new Date().toISOString(), cancelledBy: actor?.id || null } })
    .eq("id", target.id);
  if (error) throw new Error(error.message);
  return { step: { ...target, status: "cancelled" }, ...(await applyScheduleChange(admin, c, lease, periodOf(target.effectiveDate), actor)) };
}

// "Bill now": bill (or true up) a live lease's current period, due date or not.
export async function billCurrentPeriod(admin, lease, { actor, ctx, now } = {}) {
  const c = ctx || makeBillingContext(admin, { now });
  const l = leaseFacts(lease);
  const window = billingWindow(lease);
  if (!window.billable) throw fail("Only live leases bill rent.", 409);
  const today = await c.today(l.projectId);
  const period = periodOf(today);
  const settings = await c.goLiveSettings(l.projectId);
  const policies = await c.policies(lease);
  const steps = await ensureRentSteps(admin, lease, { actor });
  await syncCurrentRent(admin, lease, today);
  if (period < periodOf(window.start) || (window.end && period > periodOf(window.end))) throw fail("This lease has no rent in the current month.", 409);
  if (settings.billingStartsOn && chargeDateFor(period, window, policies.rentDueDay) < settings.billingStartsOn) {
    throw fail(`Billing starts on ${settings.billingStartsOn} for this project.`, 409);
  }
  const out = await billLeaseThrough(admin, c, lease, { steps, today, settings, policies, periods: [period], actor });
  return { period, entries: out.entries, computed: out.periods[0]?.computed ?? 0, billed: out.periods[0]?.billed ?? 0 };
}

// A lease's open AR → { items, balance, credit, creditSources } from its receivable lines.
async function leaseReceivables(admin, projectId, acct, leaseId) {
  const ar = acct.list.filter((a) => a.subtype === "receivable").map((a) => a.id);
  let q = admin.from("ledger_lines").select("*").eq("lease_id", leaseId).in("gl_account_id", ar).is("deleted_at", null);
  q = projectId ? q.eq("project_id", projectId) : q.is("project_id", null);
  const { data, error } = await q.order("entry_date", { ascending: true });
  if (error) throw new Error(error.message);
  const lines = (data || []).map(normalizeLine);
  const ids = [...new Set(lines.map((l) => l.entryId))];
  const entries = new Map();
  for (let i = 0; i < ids.length; i += CHUNK) {
    const res = await admin.from("ledger_entries").select("*").in("id", ids.slice(i, i + CHUNK));
    if (res.error) throw new Error(res.error.message);
    for (const e of res.data || []) entries.set(e.id, normalizeEntry(e));
  }
  const items = openItems(lines.map((l) => ({ ...l, entry: entries.get(l.entryId) || null })), indexAccounts(acct.list), "receivable");
  const balance = round2(lines.reduce((s, l) => s + l.debit - l.credit, 0));
  const credit = round2(items.reduce((s, i) => s + i.open, 0) - balance);
  // Unapplied credit per source entry: its unapplied AR credit less debits already applied back to it.
  const pool = new Map();
  for (const l of lines) if (!l.appliesToEntryId && l.credit > 0) pool.set(l.entryId, round2((pool.get(l.entryId) || 0) + l.credit));
  for (const l of lines) if (l.appliesToEntryId && pool.has(l.appliesToEntryId) && l.debit > 0) pool.set(l.appliesToEntryId, round2(pool.get(l.appliesToEntryId) - l.debit));
  const creditSources = [...pool.entries()]
    .filter(([, amount]) => amount > 0.004)
    .map(([entryId, amount]) => ({ entryId, amount, date: entries.get(entryId)?.date || "" }))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return { items, balance, credit: credit > 0.004 ? credit : 0, creditSources };
}

// Carry open AR (each item, then any unapplied credit) from one lease to another under xfer: keys → posted entries.
export async function transferOpenReceivables(admin, ctx, fromLease, toLease, { actor, date } = {}) {
  const from = leaseFacts(fromLease);
  const to = leaseFacts(toLease);
  const projectId = to.projectId || from.projectId;
  const acct = await ctx.accounts(projectId);
  const open = await leaseReceivables(admin, projectId, acct, from.id);
  const dims = (l) => ({ tenantId: l.tenantId, unitId: l.unitId, propertyId: l.propertyId });
  const built = buildArTransfer(
    { fromLeaseId: from.id, toLeaseId: to.id, items: open.items, credit: open.credit, creditSources: open.creditSources, date: date || (await ctx.today(projectId)), from: dims(from), to: dims(to) },
    acct,
  );
  if (built.error) throw new Error(built.error);
  const out = [];
  for (const b of built.entries) {
    const key = b.entry.idempotencyKey;
    const res = await postOnce(admin, projectId, key, b, { acct, createdBy: actor?.id || null });
    out.push({ entryId: res.entryId, key, amount: round2(b.lines.reduce((s, x) => s + (Number(x.debit) || 0), 0)), kind: "transfer", created: res.created });
  }
  return out;
}

// Accept a renewal: the Pending renewal lease (once) with its renewal step, people, charges / held deposits, open AR, rent account and live autopay; old lease Renewed; re-runs finish a failed attempt.
export async function onRenewalAccepted(admin, renewal, { actor, ctx, now, transferCharges = true, transferDeposits = true } = {}) {
  const c = ctx || makeBillingContext(admin, { now });
  if (!renewal?.lease_id) throw fail("Link the renewal to a lease first.");
  if (!renewal.new_start || !renewal.new_end) throw fail("Set the new term's start and end first.");
  if (String(renewal.new_end) <= String(renewal.new_start)) throw fail("The new term must end after it starts.");
  if (["Declined", "Moving out"].includes(renewal.status)) throw fail(`This renewal was ${String(renewal.status).toLowerCase()}.`, 409);
  const old = await loadLease(admin, renewal.lease_id, renewal.project_id);
  const meta = renewal.metadata && typeof renewal.metadata === "object" ? renewal.metadata : {};
  const today = await c.today(old.project_id);

  let lease = meta.newLeaseId ? await loadLease(admin, meta.newLeaseId).catch(() => null) : null;
  const created = !lease;
  if (created) {
    const { data, error } = await admin.from("leases").insert(renewalLeaseRow(old, renewal, { id: crypto.randomUUID(), createdBy: actor?.id || null })).select("*").single();
    if (error) throw new Error(`renewal lease: ${error.message}`);
    lease = data;
    await admin.from("renewals").update({ metadata: { ...meta, newLeaseId: lease.id, newLeaseName: lease.name } }).eq("id", renewal.id);
    const [parties, charges, deposits] = await Promise.all([
      admin.from("lease_parties").select("*").eq("lease_id", old.id).is("deleted_at", null),
      transferCharges ? admin.from("recurring_charges").select("id").eq("lease_id", old.id).is("deleted_at", null) : { data: [] },
      transferDeposits ? admin.from("security_deposits").select("id, status").eq("lease_id", old.id).is("deleted_at", null) : { data: [] },
    ]);
    const copies = (parties.data || []).map((p) => ({
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
    if (copies.length) {
      const { error: e } = await admin.from("lease_parties").insert(copies);
      if (e) throw new Error(`lease parties: ${e.message}`);
    }
    const chargeIds = (charges.data || []).map((r) => r.id);
    if (chargeIds.length) await admin.from("recurring_charges").update({ lease_id: lease.id }).in("id", chargeIds);
    const depositIds = (deposits.data || []).filter((d) => d.status === "Held").map((d) => d.id);
    if (depositIds.length) await admin.from("security_deposits").update({ lease_id: lease.id, lease_name: lease.name }).in("id", depositIds);
  }

  // The new term's rent: one renewal step at its start.
  if (!((await loadRentSteps(admin, [lease.id])).get(lease.id) || []).length) {
    const rent = renewalRent(old, renewal);
    const row = stepRow(lease, { effectiveDate: isoDate(lease.term_start), amount: rent, changeMode: "amount", changeValue: rent, source: "renewal", metadata: { renewalId: renewal.id } }, actor);
    const { error } = await admin.from("lease_rent_steps").insert(row);
    if (error && error.code !== UNIQUE) throw new Error(`rent steps: ${error.message}`);
  }
  await syncCurrentRent(admin, lease, today);

  const entries = await transferOpenReceivables(admin, c, old, lease, { actor, date: today });

  // The collection record and live autopay follow the tenant to the new lease.
  const { data: accounts } = await admin.from("rent_accounts").select("id, lease_id").in("lease_id", [old.id, lease.id]).is("deleted_at", null);
  const mine = (accounts || []).find((a) => a.lease_id === lease.id);
  const theirs = (accounts || []).find((a) => a.lease_id === old.id);
  if (!mine && theirs) {
    const { error } = await admin.from("rent_accounts").update({ lease_id: lease.id }).eq("id", theirs.id);
    if (error) throw new Error(`rent account: ${error.message}`);
  } else if (!mine) await ensureRentAccount(admin, lease, { actor });
  const { error: planError } = await admin.from("autopay_plans").update({ lease_id: lease.id }).eq("lease_id", old.id).in("status", LIVE_PLANS).is("deleted_at", null);
  if (planError) throw new Error(`autopay: ${planError.message}`);

  if (old.status !== "Renewed") {
    const { error } = await admin.from("leases").update({ status: "Renewed" }).eq("id", old.id);
    if (error) throw new Error(error.message);
  }
  await admin
    .from("renewals")
    .update({ status: "Accepted", metadata: { ...meta, newLeaseId: lease.id, newLeaseName: lease.name, decidedOn: meta.decidedOn || today } })
    .eq("id", renewal.id);
  if (created) {
    const actorName = actor?.name || actor?.email || "";
    await logActivity(admin, { projectId: lease.project_id, ownerType: "lease", ownerId: old.id, verb: "action", summary: `Renewal accepted — new lease “${lease.name}”`, actorId: actor?.id || null, actorName });
    await logActivity(admin, { projectId: lease.project_id, ownerType: "lease", ownerId: lease.id, verb: "created", summary: `Created by renewing “${old.name || "the prior lease"}”`, actorId: actor?.id || null, actorName });
  }
  return { lease, created, entries };
}
