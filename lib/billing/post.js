import "server-only";
import { buildCharge, buildHapAdjustment, buildHapCharge, buildRentAdjustment } from "@/lib/ledger/postings";
import { loadAccountIndex, postBuilt } from "@/lib/ledger/store";
import { maxDate, periodLabel, round2 } from "./periods";
import { billingWindow, chargeDateFor, leaseFacts, rentForPeriod } from "./rent";
import { emptyPeriod, rentAdjKey, rentKey, summarizeRentEntries } from "./keys";
import { emptyHapPeriod, frozenHapRate, hapAdjKey, hapKey, splitPeriod, summarizeHapEntries } from "@/lib/housing/hap";

// Server-only rent posting (CORE-01): one idempotent entry per key, billed-vs-computed per period, and true-ups; voucher leases split tenant / housing authority (HOUS-01).

const CHUNK = 150;

// A user-facing billing error; `status` picks the HTTP code in lib/billing/http.js.
export const fail = (message, status = 400) => Object.assign(new Error(message), { status });

// Id of the entry already holding an idempotency key in a project (any status), else null.
export async function findPosted(admin, projectId, key) {
  let q = admin.from("ledger_entries").select("id").eq("idempotency_key", key).limit(1);
  q = projectId ? q.eq("project_id", projectId) : q.is("project_id", null);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data?.[0]?.id || null;
}

// Post `build(acct)` (or a built entry) once under `key` → { entryId, created }; a concurrent duplicate resolves to the winner.
export async function postOnce(admin, projectId, key, build, { acct, createdBy } = {}) {
  const existing = await findPosted(admin, projectId, key);
  if (existing) return { entryId: existing, created: false };
  const accounts = acct || (await loadAccountIndex(admin, projectId || null));
  const built = typeof build === "function" ? build(accounts) : build;
  if (!built || built.error) throw new Error(built?.error || "Nothing to post.");
  const id = built.entry.id || crypto.randomUUID();
  const entryId = await postBuilt(admin, { ...built, entry: { ...built.entry, id, idempotencyKey: key } }, { projectId, createdBy });
  return { entryId, created: entryId === id };
}

const LEDGER_COLS = "id, lease_id, entry_date, source_type, status, reversal_of, idempotency_key, total, deleted_at, created_at";

// Billed rent per lease and period (see summarizeRentEntries) from the lease's rent-family entries.
export async function loadRentLedger(admin, projectId, leaseIds) {
  const ids = [...new Set((leaseIds || []).filter(Boolean))];
  const rows = [];
  const scoped = (q) => (projectId ? q.eq("project_id", projectId) : q.is("project_id", null));
  const cols = `${LEDGER_COLS}, hap_rate:metadata->hapRate`;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const [rent, movein] = await Promise.all([
      scoped(admin.from("ledger_entries").select(cols).in("lease_id", chunk).like("idempotency_key", "rent%")),
      scoped(admin.from("ledger_entries").select(cols).in("idempotency_key", chunk.map((id) => `movein:${id}:rent`))),
    ]);
    if (rent.error) throw new Error(rent.error.message);
    if (movein.error) throw new Error(movein.error.message);
    rows.push(...(rent.data || []), ...(movein.data || []));
  }
  return summarizeRentEntries(rows, ids);
}

// Billed HAP per lease and period (see summarizeHapEntries) from the lease's hap: / hap-adj: entries.
export async function loadHapLedger(admin, projectId, leaseIds) {
  const ids = [...new Set((leaseIds || []).filter(Boolean))];
  const rows = [];
  const scoped = (q) => (projectId ? q.eq("project_id", projectId) : q.is("project_id", null));
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await scoped(
      admin.from("ledger_entries").select(`${LEDGER_COLS}, hap_rate:metadata->hapRate`).in("lease_id", ids.slice(i, i + CHUNK)).like("idempotency_key", "hap%"),
    );
    if (error) throw new Error(error.message);
    rows.push(...(data || []));
  }
  return summarizeHapEntries(rows, ids);
}

// What a lease has billed the housing authority for a period.
export async function hapBilledForPeriod(admin, lease, period, { ledger } = {}) {
  const l = leaseFacts(lease);
  const map = ledger?.has(l.id) ? ledger : await loadHapLedger(admin, l.projectId, [l.id]);
  return map.get(l.id)?.get(period) || emptyHapPeriod();
}

// What a lease has been billed for a period: { total, entries, charges, primaryEntryId, mainKeyTaken, maxAdj }.
export async function billedForPeriod(admin, lease, period, { ledger } = {}) {
  const l = leaseFacts(lease);
  const map = ledger?.has(l.id) ? ledger : await loadRentLedger(admin, l.projectId, [l.id]);
  return map.get(l.id)?.get(period) || emptyPeriod();
}

// Open AR (or another receivable subtype) on charge entries (their debit less whatever applies to them) → Map entryId → open.
export async function openOnEntries(admin, projectId, acct, entryIds, subtype = "receivable") {
  const ids = [...new Set(entryIds.filter(Boolean))];
  const ar = new Set(acct.list.filter((a) => a.subtype === subtype).map((a) => a.id));
  const open = new Map(ids.map((id) => [id, 0]));
  if (!ids.length) return open;
  const scoped = (q) => (projectId ? q.eq("project_id", projectId) : q.is("project_id", null));
  const [own, applied] = await Promise.all([
    scoped(admin.from("ledger_lines").select("entry_id, gl_account_id, debit, credit, applies_to_entry_id").in("entry_id", ids).is("deleted_at", null)),
    scoped(admin.from("ledger_lines").select("gl_account_id, debit, credit, applies_to_entry_id").in("applies_to_entry_id", ids).is("deleted_at", null)),
  ]);
  if (own.error) throw new Error(own.error.message);
  if (applied.error) throw new Error(applied.error.message);
  for (const l of own.data || []) {
    if (!ar.has(l.gl_account_id) || l.applies_to_entry_id) continue;
    open.set(l.entry_id, round2(open.get(l.entry_id) + Number(l.debit) - Number(l.credit)));
  }
  for (const l of applied.data || []) {
    if (!ar.has(l.gl_account_id)) continue;
    open.set(l.applies_to_entry_id, round2(open.get(l.applies_to_entry_id) + Number(l.debit) - Number(l.credit)));
  }
  return open;
}

// Spread a credit over a period's charges in order, up to what each still has open → allocations.
async function creditAllocations(admin, projectId, acct, charges, amount, subtype) {
  const open = await openOnEntries(admin, projectId, acct, charges.map((c) => c.id), subtype);
  const allocations = [];
  let left = round2(amount);
  for (const c of charges) {
    const take = round2(Math.min(left, Math.max(0, open.get(c.id) || 0)));
    if (take > 0) {
      allocations.push({ entryId: c.id, amount: take });
      left = round2(left - take);
    }
    if (left <= 0) break;
  }
  return allocations;
}

// Bill one period: post the computed rent when nothing is billed, else true up billed ≠ computed (open periods) as rent-adj:<lease>:<period>:<n> → { period, computed, billed, split, entries, skipped? }.
// Voucher leases (HOUS-01): the tenant's share bills as rent, the housing authority's as hap:<lease>:<period> (true-ups hap-adj:); a billed period keeps the HAP rate it was billed at unless opts.resplit.
export async function billLeaseRent(admin, ctx, lease, period, opts = {}) {
  const l = leaseFacts(lease);
  const projectId = l.projectId;
  const policies = opts.policies || (await ctx.policies(lease));
  const window = billingWindow(lease);
  const steps = opts.steps;
  if (!steps) throw new Error("billLeaseRent needs the lease's rent steps.");
  const computed = rentForPeriod(steps, period, window, policies);
  const [billed, hapBilled] = await Promise.all([
    billedForPeriod(admin, lease, period, { ledger: opts.ledger }),
    hapBilledForPeriod(admin, lease, period, { ledger: opts.hapLedger }),
  ]);
  const frozenRate = opts.resplit ? null : frozenHapRate(billed, hapBilled);
  const split = splitPeriod(lease, computed, period, { hapIndex: opts.hapIndex, method: policies.prorationMethod, frozenRate });
  const delta = round2(split.tenant - billed.total);
  const hapDelta = round2(split.hap - hapBilled.total);
  const result = { period, computed: computed.total, billed: round2(billed.total + hapBilled.total), split: { tenant: split.tenant, hap: split.hap }, entries: [] };
  if (Math.abs(delta) < 0.005 && Math.abs(hapDelta) < 0.005) return result;
  if (!(await ctx.isPeriodOpen(projectId, period))) return { ...result, skipped: "closed" };

  const acct = await ctx.accounts(projectId);
  const today = opts.today || (await ctx.today(projectId));
  const dims = { leaseId: l.id, tenantId: l.tenantId, unitId: l.unitId, propertyId: l.propertyId };
  const chargeDate = chargeDateFor(period, window, policies.rentDueDay);
  // True-ups: dated the business date, or the period's charge date when that is later.
  const adjDate = maxDate(chargeDate, today);
  const label = periodLabel(period);
  const splitMeta = { ...(split.hapRate === null ? {} : { hapRate: split.hapRate }), hapSource: split.source, split: { tenant: split.tenant, hap: split.hap } };
  const metadata = { billing: "rent", period, computed: computed.total, billed: billed.total, segments: computed.segments, ...splitMeta, ...(opts.auto ? { auto: true } : {}) };
  const createdBy = opts.actor?.id || null;
  // Record the posting and refresh a preloaded ledger so later periods / re-runs see it.
  const remember = async (key, res, amount, kind) => {
    result.entries.push({ entryId: res.entryId, key, amount, kind, created: res.created });
    if (kind.startsWith("hap")) {
      if (opts.hapLedger) opts.hapLedger.set(l.id, (await loadHapLedger(admin, projectId, [l.id])).get(l.id));
    } else if (opts.ledger) opts.ledger.set(l.id, (await loadRentLedger(admin, projectId, [l.id])).get(l.id));
  };

  // The housing authority's share first, so a failed run never leaves the tenant's share without the rate it was split at.
  if (Math.abs(hapDelta) >= 0.005) {
    const hapDims = { leaseId: l.id, unitId: l.unitId, propertyId: l.propertyId, period, hapContractId: split.contractId || undefined };
    const hapMeta = { ...metadata, billing: "hap", computed: split.hap, billed: hapBilled.total };
    if (!hapBilled.entries.length && !hapBilled.mainKeyTaken && hapDelta > 0) {
      const key = hapKey(l.id, period);
      const memo = `Housing assistance · ${label}${computed.full ? "" : " (prorated)"}`;
      const res = await postOnce(admin, projectId, key, (a) => buildHapCharge({ ...hapDims, date: chargeDate, amount: hapDelta, memo, sourceId: l.id, metadata: hapMeta }, a), { acct, createdBy });
      await remember(key, res, hapDelta, "hap");
    } else {
      const key = hapAdjKey(l.id, period, hapBilled.maxAdj + 1);
      const allocations = hapDelta < 0 ? await creditAllocations(admin, projectId, acct, hapBilled.charges, -hapDelta, "subsidy_receivable") : [];
      const memo = `Housing assistance adjustment · ${label}`;
      const res = await postOnce(
        admin,
        projectId,
        key,
        (a) => buildHapAdjustment({ ...hapDims, date: adjDate, amount: hapDelta, allocations, memo, sourceId: l.id, metadata: { ...hapMeta, adjustment: hapDelta } }, a),
        { acct, createdBy },
      );
      await remember(key, res, hapDelta, hapDelta > 0 ? "hap-charge" : "hap-credit");
    }
  }

  if (Math.abs(delta) < 0.005) return result;
  if (!billed.entries.length && !billed.mainKeyTaken && delta > 0) {
    const key = rentKey(l.id, period);
    const res = await postOnce(
      admin,
      projectId,
      key,
      (a) => buildCharge({ ...dims, date: chargeDate, amount: delta, memo: `Rent · ${label}${computed.full ? "" : " (prorated)"}`, sourceId: l.id, metadata }, a),
      { acct, createdBy },
    );
    await remember(key, res, delta, "rent");
    return result;
  }

  const key = rentAdjKey(l.id, period, billed.maxAdj + 1);
  const allocations = delta < 0 ? await creditAllocations(admin, projectId, acct, billed.charges, -delta, "receivable") : [];
  const res = await postOnce(
    admin,
    projectId,
    key,
    (a) =>
      buildRentAdjustment(
        { ...dims, date: adjDate, amount: delta, allocations, memo: `Rent adjustment · ${label}`, sourceId: l.id, metadata: { ...metadata, adjustment: delta } },
        a,
      ),
    { acct, createdBy },
  );
  await remember(key, res, delta, delta > 0 ? "charge" : "credit");
  return result;
}
