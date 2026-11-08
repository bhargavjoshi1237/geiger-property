import "server-only";
import { createHash } from "node:crypto";
import { buildCreditApplication, buildRecovery, buildWriteOff, creditApplicationKey, recoveryKey, writeOffKey } from "@/lib/ledger/postings";
import { ensureChart, loadAccountIndex } from "@/lib/ledger/store";
import { logActivity } from "@/lib/messaging/threads";
import { forProject } from "@/lib/supabase/scope";
import { makeBillingContext } from "./context";
import { applyLeaseCredits } from "./move_out";
import { deferredRemaining, loadPlans } from "./payment_plans";
import { isUuid } from "./payment_rules";
import { fail, findPosted, postOnce } from "./post";
import { isoDate, maxDate, round2 } from "./periods";
import { leaseReceivables, loadLeaseReceivables } from "./receivables";
import { loadLease } from "./service";
import {
  BAD_DEBT_KEY,
  WRITE_OFF_REASONS,
  collectionsOf,
  itemLabel,
  nextSeq,
  openAfterCredits,
  planRecovery,
  planWriteOff,
  reasonLabel,
  writeOffReasonProblem,
  writtenOffOutstanding,
} from "./write_off_rules";

// Server-only write-offs (CORE-15, direct method): write open charges off to 5800 Bad Debt under wo:<writeOffId>, and record a later payment as a recovery
// (wo-recover:<paymentEntryId> reinstates the written-off items, then CORE-13's credit application applies the payment to them).

const CHUNK = 150;
const usd = (n) => `$${round2(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const must = ({ data, error }, what) => {
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
};
const metaOf = (row) => (row?.metadata && typeof row.metadata === "object" ? row.metadata : {});
const sumOf = (list, f = (x) => x.amount) => round2((list || []).reduce((s, x) => s + (Number(f(x)) || 0), 0));
const dimsOf = (lease) => ({ leaseId: lease.id, tenantId: lease.tenant_id || undefined, unitId: lease.unit_id || undefined, propertyId: lease.property_id || undefined });
const actorOf = (actor) => ({ actorId: actor?.id || null, actorName: actor?.name || actor?.email || "Staff" });
const isLive = (e) => e && e.status === "posted" && !e.reversal_of && !e.deleted_at;

// A stable UUID from a seed (sha-256, version 5 layout): the final account's write-off id per lease and version, so a retry or a second click lands on the same key.
export function seededUuid(seed) {
  const h = createHash("sha256").update(String(seed)).digest("hex").slice(0, 32).split("");
  h[12] = "5";
  h[16] = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  const s = h.join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}

// The chart with 5800 Bad Debt: a project without it gets the default chart topped up (ledger_ensure_default_chart adopts or inserts it).
async function accountsWithBadDebt(admin, c, projectId) {
  const acct = await c.accounts(projectId);
  if (acct.byKey.has(BAD_DEBT_KEY)) return acct;
  await ensureChart(admin, projectId);
  const fresh = await loadAccountIndex(admin, projectId);
  if (!fresh.byKey.has(BAD_DEBT_KEY)) throw fail("There's no Bad Debt account (5800) in the chart of accounts.", 409);
  return fresh;
}

// The lease's open charges typed by key (CORE-06 loader) and its unapplied credits (CORE-01 loader).
async function position(admin, projectId, acct, leaseId) {
  const [rec, typed] = await Promise.all([leaseReceivables(admin, projectId, acct, leaseId), loadLeaseReceivables(admin, projectId, [leaseId], acct)]);
  const kinds = new Map((typed.get(leaseId)?.items || []).map((i) => [i.entryId, i]));
  const items = rec.items.map((i) => {
    const t = kinds.get(i.entryId);
    const item = { entryId: i.entryId, date: i.date, memo: i.memo || "", amount: round2(i.amount), paid: round2(i.paid), open: round2(i.open), kind: t?.kind || i.sourceType || "", period: t?.period || "", key: t?.key || "" };
    return { ...item, label: itemLabel(item) };
  });
  return { items, credits: rec.creditSources.map((s) => ({ entryId: s.entryId, amount: s.amount, date: s.date })), balance: rec.balance };
}

// Write-off and recovery entries on a lease (voids and their reversals included) and their AR lines.
async function writeOffEntries(admin, projectId, acct, leaseId) {
  const entries = must(
    await forProject(admin.from("ledger_entries").select("id, entry_date, memo, status, reversal_of, idempotency_key, total, metadata, created_at, deleted_at"), projectId).eq("lease_id", leaseId).eq("source_type", "write_off").is("deleted_at", null).order("entry_date").order("created_at"),
    "write-off entries",
  );
  const ar = acct.list.filter((a) => a.subtype === "receivable").map((a) => a.id);
  const lines = [];
  const ids = entries.map((e) => e.id);
  for (let i = 0; i < ids.length && ar.length; i += CHUNK) {
    lines.push(...must(await forProject(admin.from("ledger_lines").select("entry_id, debit, credit, applies_to_entry_id"), projectId).in("entry_id", ids.slice(i, i + CHUNK)).in("gl_account_id", ar).is("deleted_at", null), "write-off lines"));
  }
  return { entries, lines };
}

const entryView = (e) => {
  const m = metaOf(e);
  const recovery = Boolean(m.recovery);
  return {
    entryId: e.id,
    key: e.idempotency_key || "",
    date: e.entry_date,
    kind: recovery ? "recovery" : "write_off",
    amount: round2(e.total),
    status: e.status,
    reason: m.reason || "",
    reasonLabel: recovery ? "" : reasonLabel(m.reason),
    note: m.note || "",
    paymentEntryId: m.paymentEntryId || null,
    items: Array.isArray(m.items) ? m.items : [],
    enteredBy: m.enteredBy?.name || "",
    finalAccount: m.finalAccount || null,
  };
};

// The lease's written-off history → { writtenOff, recovered, net, entries } (live entries only; voided ones drop out).
function historyOf(entries) {
  const live = entries.filter(isLive).map(entryView);
  const writtenOff = sumOf(live.filter((e) => e.kind === "write_off"));
  const recovered = sumOf(live.filter((e) => e.kind === "recovery"));
  return { writtenOff, recovered, net: round2(writtenOff - recovered), entries: live.reverse() };
}

// What the write-off wizard shows: open charges after unapplied credits apply, the plan balance not yet due, the lease's written-off history and the posting date.
export async function writeOffPreview(admin, leaseId, { projectId, ctx } = {}) {
  const c = ctx || makeBillingContext(admin);
  const lease = await loadLease(admin, leaseId, projectId);
  const P = lease.project_id;
  const acct = await c.accounts(P);
  const pos = await position(admin, P, acct, lease.id);
  const after = openAfterCredits(pos.items, pos.credits);
  let deferred = 0;
  for (const p of await loadPlans(admin, P, { leaseIds: [lease.id], statuses: ["Active"] })) deferred = round2(deferred + (await deferredRemaining(admin, P, acct, p.id)));
  const [today, lockedThrough, history] = await Promise.all([c.today(P), c.lockedThrough(P), writeOffEntries(admin, P, acct, lease.id)]);
  const days = (d) => Math.max(0, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${String(d).slice(0, 10)}T00:00:00Z`)) / 86400000) || 0);
  return {
    lease: { id: lease.id, name: lease.name || "", status: lease.status || "", tenantName: lease.tenant_name || "", unit: lease.unit || "" },
    today,
    lockedThrough,
    postDate: await c.openDate(P, today),
    balance: pos.balance,
    credits: { total: sumOf(pos.credits), applied: after.applied, applications: after.applications },
    deferred,
    items: after.items.map((i) => ({ ...i, days: days(i.date) })),
    openTotal: sumOf(after.items, (i) => i.open),
    history: historyOf(history.entries),
    reasons: WRITE_OFF_REASONS,
  };
}

// A posted write-off as the routes return it.
function writeOffResult(entry, extra = {}) {
  const v = entryView(entry);
  return { writeOffId: metaOf(entry).writeOffId || null, entryId: entry.id, key: entry.idempotency_key, date: entry.entry_date, amount: v.amount, reason: v.reason, reasonLabel: v.reasonLabel, note: v.note, items: v.items, collections: collectionsOf(v.reason), ...extra };
}

async function entryById(admin, projectId, id) {
  return must(await forProject(admin.from("ledger_entries").select("*"), projectId).eq("id", id).maybeSingle(), "ledger entry");
}

// Write open charges off to Bad Debt (POST …/leases/[leaseId]/write-off) → { writeOffId, entryId, created, replay, amount, items, credits, balance }.
// input: { projectId, writeOffId (a new UUID per wizard), items: [{ entryId, amount? }] | "all", reason, note?, date? }. Unapplied credits apply first; a retry with the same id replays.
export async function writeOff(admin, leaseId, input = {}, { actor = null, ctx, metadata = {} } = {}) {
  const c = ctx || makeBillingContext(admin);
  if (!isUuid(input.writeOffId)) throw fail("writeOffId must be a new UUID for each write-off.");
  const lease = await loadLease(admin, leaseId, input.projectId);
  const P = lease.project_id;
  const key = writeOffKey(input.writeOffId);
  const prior = await findPosted(admin, P, key);
  if (prior) {
    const entry = await entryById(admin, P, prior);
    if (entry?.lease_id && entry.lease_id !== lease.id) throw fail("That write-off belongs to another lease.", 409);
    return writeOffResult(entry, { created: false, replay: true, credits: { applied: 0, entries: [] } });
  }
  const reason = String(input.reason || "");
  const note = String(input.note || "").trim().slice(0, 500);
  const problem = writeOffReasonProblem(reason, note);
  if (problem) throw fail(problem);
  const today = await c.today(P);
  const asked = isoDate(input.date) || today;
  if (asked > today) throw fail("A write-off can't be dated in the future.");
  const acct = await accountsWithBadDebt(admin, c, P);
  // Credits first (CORE-13): a prepayment or overpayment pays what it can before anything is written off.
  const credits = await applyLeaseCredits(admin, c, lease, { date: asked, actor, metadata: { writeOff: input.writeOffId } });
  const pos = await position(admin, P, acct, lease.id);
  const plan = planWriteOff(pos.items, input.items === "all" ? "all" : input.items);
  if (plan.error) throw fail(plan.error, 409);
  const date = await c.openDate(P, plan.items.reduce((d, i) => maxDate(d, isoDate(i.date) || ""), asked));
  const enteredBy = { id: actor?.id || null, name: actor?.name || actor?.email || "Staff" };
  const memo = `Bad debt written off · ${reasonLabel(reason)}${note ? ` · ${note.slice(0, 80)}` : ""}`;
  const res = await postOnce(
    admin,
    P,
    key,
    (a) => buildWriteOff({ ...dimsOf(lease), writeOffId: input.writeOffId, items: plan.items, reason, date, memo, metadata: { ...metadata, note, reasonLabel: reasonLabel(reason), collections: collectionsOf(reason), enteredBy, ...(date !== asked ? { requestedDate: asked } : {}) } }, a),
    { acct, createdBy: actor?.id || null },
  );
  const entry = await entryById(admin, P, res.entryId);
  if (res.created) {
    const summary = `Wrote off ${usd(plan.total)} as bad debt (${reasonLabel(reason)}) · ${plan.items.length} charge${plan.items.length === 1 ? "" : "s"}${note ? ` — ${note}` : ""}`;
    for (const [ownerType, ownerId] of [["lease", lease.id], ["tenant", lease.tenant_id]]) {
      if (ownerId) await logActivity(admin, { projectId: P, ownerType, ownerId, verb: "action", summary, ...actorOf(actor), metadata: { writeOffId: input.writeOffId, entryId: res.entryId, amount: plan.total, reason } });
    }
  }
  const balance = (await leaseReceivables(admin, P, acct, lease.id)).balance;
  return writeOffResult(entry, { created: res.created, replay: !res.created, credits: { applied: credits.applied, entries: credits.entries }, balance, postedOn: date, requestedDate: asked });
}

// Write off everything still open on a lease (the final account's "Write it off" settlement) under a stable id per lease and version.
export async function writeOffLeaseBalance(admin, ctx, lease, { version = 1, reason, note, date, actor, metadata = {} } = {}) {
  const writeOffId = seededUuid(`final-account:${lease.id}:v${version}`);
  const P = lease.project_id;
  if (await findPosted(admin, P, writeOffKey(writeOffId))) return writeOff(admin, lease.id, { projectId: P, writeOffId }, { actor, ctx, metadata });
  const acct = await ctx.accounts(P);
  const { balance } = await leaseReceivables(admin, P, acct, lease.id);
  if (!(balance > 0.004)) return null;
  // A move-out still ahead dates the write-off today; charges dated later carry it to their date.
  const today = await ctx.today(P);
  return writeOff(admin, lease.id, { projectId: P, writeOffId, items: "all", reason, note, date: date && date < today ? date : today }, { actor, ctx, metadata: { ...metadata, finalAccount: version } });
}

// The payment a recovery comes from: a live tenant payment on a lease.
async function paymentOf(admin, projectId, paymentEntryId) {
  if (!projectId) throw fail("projectId is required.");
  if (!isUuid(paymentEntryId)) throw fail("Payment not found.", 404);
  const e = await entryById(admin, projectId, paymentEntryId);
  if (!e || e.deleted_at) throw fail("Payment not found.", 404);
  if (e.source_type !== "payment" || e.reversal_of) throw fail("Only a payment can be recorded as a bad-debt recovery.");
  if (e.status !== "posted") throw fail("This payment is void, so it can't recover anything.", 409);
  if (!e.lease_id) throw fail("This payment isn't on a lease — record it on the lease whose balance was written off.", 409);
  return e;
}

// Every recovery key this payment has used (any status) and its live recovery, if any.
async function recoveriesOf(admin, projectId, paymentEntryId) {
  const rows = must(await forProject(admin.from("ledger_entries").select("*"), projectId).like("idempotency_key", `${recoveryKey(paymentEntryId)}%`), "recoveries");
  return { keys: rows.map((r) => r.idempotency_key), live: rows.find(isLive) || null };
}

// Everything a recovery needs: the payment, its lease, its unapplied credit, what's written off and not yet reinstated, oldest first.
async function recoveryState(admin, c, projectId, paymentEntryId) {
  const payment = await paymentOf(admin, projectId, paymentEntryId);
  const lease = await loadLease(admin, payment.lease_id, projectId);
  const P = lease.project_id;
  const acct = await accountsWithBadDebt(admin, c, P);
  const [rec, wo, prior] = await Promise.all([leaseReceivables(admin, P, acct, lease.id), writeOffEntries(admin, P, acct, lease.id), recoveriesOf(admin, P, payment.id)]);
  const unapplied = round2(rec.creditSources.find((s) => s.entryId === payment.id)?.amount || 0);
  const labels = new Map();
  let lastWriteOff = "";
  for (const e of wo.entries.filter(isLive)) {
    const m = metaOf(e);
    if (m.recovery) continue;
    lastWriteOff = maxDate(lastWriteOff, e.entry_date);
    for (const i of Array.isArray(m.items) ? m.items : []) labels.set(i.entryId, { date: i.date || "", memo: i.memo || "" });
  }
  const outstanding = [...writtenOffOutstanding(wo.lines.map((l) => ({ appliesToEntryId: l.applies_to_entry_id, debit: l.debit, credit: l.credit })))].map(([entryId, amount]) => ({ entryId, amount, ...(labels.get(entryId) || { date: "", memo: "Charge" }) }));
  return { payment, lease, acct, unapplied, outstanding, history: historyOf(wo.entries), prior, lastWriteOff };
}

const paymentView = (e) => {
  const m = metaOf(e);
  return { entryId: e.id, date: e.entry_date, amount: round2(m.amount ?? e.total), method: m.method || "", reference: m.reference || "", memo: e.memo || "" };
};

// A recovery entry as the routes return it.
const recoveryResult = (entry, extra = {}) => ({ ...entryView(entry), ...extra });

// What the recovery dialog shows: the payment, its unapplied credit, what's written off on the lease and what this payment would reinstate.
export async function recoveryPreview(admin, paymentEntryId, { projectId, ctx } = {}) {
  const c = ctx || makeBillingContext(admin);
  const s = await recoveryState(admin, c, projectId, paymentEntryId);
  const P = s.lease.project_id;
  const plan = s.prior.live ? null : planRecovery({ outstanding: s.outstanding, unapplied: s.unapplied });
  const [today, lockedThrough] = await Promise.all([c.today(P), c.lockedThrough(P)]);
  return {
    payment: paymentView(s.payment),
    lease: { id: s.lease.id, name: s.lease.name || "", tenantName: s.lease.tenant_name || "", status: s.lease.status || "" },
    unapplied: s.unapplied,
    writtenOff: sumOf(s.outstanding),
    outstanding: s.outstanding,
    history: s.history,
    recoverable: plan && !plan.error ? plan.amount : 0,
    plan: plan && !plan.error ? plan.items : [],
    blocker: plan?.error || "",
    recovered: s.prior.live ? recoveryResult(s.prior.live) : null,
    postDate: await c.openDate(P, maxDate(s.payment.entry_date, s.lastWriteOff)),
    today,
    lockedThrough,
  };
}

// Apply the payment's credit to each item a recovery reinstated (apply:<payment>:<item>[:n], sequences fixed on the recovery entry) → posted applications.
async function applyRecovery(admin, P, acct, lease, recovery, { actor } = {}) {
  const m = metaOf(recovery);
  const out = [];
  for (const i of Array.isArray(m.items) ? m.items : []) {
    const key = creditApplicationKey(m.paymentEntryId, i.entryId, i.applySeq);
    const res = await postOnce(
      admin,
      P,
      key,
      (a) => buildCreditApplication({ ...dimsOf(lease), creditEntryId: m.paymentEntryId, itemEntryId: i.entryId, amount: i.amount, seq: i.applySeq, date: recovery.entry_date, memo: `Recovered bad debt · ${i.memo || "charge"}`, sourceId: lease.id, metadata: { recovery: recovery.id } }, a),
      { acct, createdBy: actor?.id || null },
    );
    out.push({ entryId: res.entryId, key, amount: round2(i.amount), kind: "credit_application", created: res.created });
  }
  return out;
}

// Earlier apply:<payment>:<item>[:n] keys (any status) per item → Map itemEntryId → keys.
async function applicationKeys(admin, projectId, paymentEntryId) {
  const rows = must(await forProject(admin.from("ledger_entries").select("idempotency_key"), projectId).like("idempotency_key", `apply:${paymentEntryId}:%`), "credit applications");
  return rows.map((r) => r.idempotency_key);
}

// Record a payment as a bad-debt recovery (POST …/payments/[entryId]/recovery) → { entryId, key, amount, items, applications, created, replay }.
// input: { projectId, amount? (default: all it can), date? }. A retry, or a second click, replays the live recovery and finishes its applications.
export async function recordRecovery(admin, paymentEntryId, input = {}, { actor = null, ctx } = {}) {
  const c = ctx || makeBillingContext(admin);
  const s = await recoveryState(admin, c, input.projectId, paymentEntryId);
  const P = s.lease.project_id;
  if (s.prior.live) {
    const applications = await applyRecovery(admin, P, s.acct, s.lease, s.prior.live, { actor });
    return recoveryResult(s.prior.live, { created: false, replay: true, applications });
  }
  const plan = planRecovery({ outstanding: s.outstanding, unapplied: s.unapplied, amount: input.amount });
  if (plan.error) throw fail(plan.error, 409);
  const today = await c.today(P);
  const asked = isoDate(input.date) || "";
  if (asked && asked > today) throw fail("A recovery can't be dated in the future.");
  const date = await c.openDate(P, maxDate(maxDate(asked, s.payment.entry_date), s.lastWriteOff));
  const seq = nextSeq(s.prior.keys, recoveryKey(s.payment.id));
  const used = await applicationKeys(admin, P, s.payment.id);
  const items = plan.items.map((i) => ({ ...i, applySeq: nextSeq(used, creditApplicationKey(s.payment.id, i.entryId)) }));
  const pay = paymentView(s.payment);
  const label = [pay.method, pay.reference ? `#${pay.reference}` : ""].filter(Boolean).join(" ");
  const res = await postOnce(
    admin,
    P,
    recoveryKey(s.payment.id, seq),
    (a) =>
      buildRecovery(
        {
          ...dimsOf(s.lease),
          paymentEntryId: s.payment.id,
          seq,
          items,
          date,
          memo: `Bad debt recovered · payment of ${usd(pay.amount)}${label ? ` · ${label}` : ""}`,
          metadata: { enteredBy: { id: actor?.id || null, name: actor?.name || actor?.email || "Staff" }, paymentDate: s.payment.entry_date },
        },
        a,
      ),
    { acct: s.acct, createdBy: actor?.id || null },
  );
  // A concurrent click that lost the race applies what the winner posted.
  const recovery = await entryById(admin, P, res.entryId);
  const applications = await applyRecovery(admin, P, s.acct, s.lease, recovery, { actor });
  if (res.created) {
    const summary = `Recovered ${usd(plan.amount)} of written-off bad debt from the payment of ${usd(pay.amount)}${label ? ` (${label})` : ""}`;
    for (const [ownerType, ownerId] of [["lease", s.lease.id], ["tenant", s.lease.tenant_id]]) {
      if (ownerId) await logActivity(admin, { projectId: P, ownerType, ownerId, verb: "payment", summary, ...actorOf(actor), metadata: { recoveryEntryId: res.entryId, paymentEntryId: s.payment.id, amount: plan.amount } });
    }
  }
  return recoveryResult(recovery, { created: res.created, replay: !res.created, applications, postedOn: date });
}

