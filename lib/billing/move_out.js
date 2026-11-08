import "server-only";
import { buildCharge, buildCreditApplication, creditApplicationKey } from "@/lib/ledger/postings";
import { voidPosted } from "@/lib/ledger/store";
import { storeProjectFile } from "@/lib/files/server";
import { sendNotificationEmail } from "@/lib/email/notifications";
import { logActivity } from "@/lib/messaging/threads";
import { forProject } from "@/lib/supabase/scope";
import { makeBillingContext } from "./context";
import { previewCloseOut, closeOutLease } from "./close_out";
import { disposeDeposit, loadDeposit } from "./deposits";
import { DEFAULT_DEPOSIT_KIND, depositApplyKey, depositDeductionKey, depositKindOf, depositReleaseKey, isOpenDeposit } from "./deposits_math";
import { cancelPlan, deferredRemaining, loadPlans } from "./payment_plans";
import { fail, findPosted, postOnce } from "./post";
import { isoDate, maxDate, round2 } from "./periods";
import { leaseReceivables, loadLeaseReceivables } from "./receivables";
import { billingEndOf } from "./rent";
import { loadLease } from "./service";
import { assembleStatement, loadStatementData } from "./statements";
import { statementHtml } from "./statement_html";
import {
  FINAL_ACCOUNT_STATUSES,
  RULE_KIND,
  SODA_COMMITTED,
  SODA_DRAFT,
  accelRows,
  chargesTotal,
  depositRuleFor,
  earlyTermKey,
  finalAccountPlan,
  finalAccountWarnings,
  finalStatementRange,
  isCommitted,
  mailRequiredFor,
  normalizeCharges,
  planCreditApplications,
  returnDeadline,
  revisePlan,
  ruleParams,
  sodaAccelKey,
  sodaOf,
} from "./move_out_math";
import { depositSectionHtml, finalAccountEmailData, letterHtml } from "./move_out_html";

// Server-only move-out final account (CORE-13): close out, move-out charges, credits, the deposits, the refund or balance, then the final
// statement and the disposition letter (saved privately, emailed or flagged for mail). Preview with commit:false; revise voids a version.

const NOTIFICATION = "move_out_statement";
const JOB_KEY = "final-account";
const RETRY = ["failed", "disabled", "not_configured"];
const CHUNK = 150;

const must = (res, what) => {
  if (res.error) throw Object.assign(new Error(`${what}: ${res.error.message}`), { code: res.error.code });
  return res.data;
};
const metaOf = (row) => (row?.metadata && typeof row.metadata === "object" ? row.metadata : {});
const sumOf = (list, f) => round2((list || []).reduce((s, x) => s + (Number(f(x)) || 0), 0));
const dimsOf = (lease) => ({ leaseId: lease.id, tenantId: lease.tenant_id || undefined, unitId: lease.unit_id || undefined, propertyId: lease.property_id || undefined });
const actorOf = (actor) => ({ actorId: actor?.id || null, actorName: actor?.name || actor?.email || (actor ? "Staff" : "Billing") });

// Deposit records on the lease, the security deposit first (it carries the move-out charges).
async function leaseDeposits(admin, lease) {
  const rows = must(await forProject(admin.from("security_deposits").select("*"), lease.project_id).eq("lease_id", lease.id).is("deleted_at", null).order("created_at"), "deposits");
  return rows.sort((a, b) => Number(depositKindOf(b) === DEFAULT_DEPOSIT_KIND) - Number(depositKindOf(a) === DEFAULT_DEPOSIT_KIND));
}

// The final account's own record: the primary deposit's soda, else the lease's (a lease with no deposit).
function sodaHolder(deposits, lease) {
  const owned = deposits.filter((d) => sodaOf(d));
  const primary = owned.find((d) => metaOf(d).soda?.primary) || owned[0] || null;
  return primary ? { soda: sodaOf(primary), primary } : { soda: metaOf(lease).finalAccount ? { ...metaOf(lease).finalAccount, version: Number(metaOf(lease).finalAccount.version) || 1 } : null, primary: null };
}

async function mergeMeta(admin, table, id, patch) {
  must(await admin.rpc("merge_meta", { p_table: table, p_id: id, p_patch: patch }), `${table} metadata`);
}

// The property's state (legal_jurisdictions code and name) and city.
async function placeOf(admin, projectId, propertyId) {
  const property = propertyId ? must(await forProject(admin.from("properties").select("name, state, city"), projectId).eq("id", propertyId).maybeSingle(), "property") : null;
  const raw = String(property?.state || "").trim();
  const out = { code: "", name: "", city: String(property?.city || "").trim() };
  if (!raw) return out;
  const places = must(await admin.from("legal_jurisdictions").select("code, name").eq("kind", "state").or(`project_id.is.null,project_id.eq.${projectId}`).is("deleted_at", null), "jurisdictions");
  const v = raw.toLowerCase().replace(/\.$/, "");
  const hit = (places || []).find((j) => j.code.toLowerCase() === v || j.name.toLowerCase() === v);
  return { ...out, code: hit?.code || raw.toUpperCase(), name: hit?.name || raw };
}

// The project's deposit rules (jurisdiction_rules, kind deposit_disposition); an absent table reads as none.
async function depositRules(admin, projectId) {
  const res = await forProject(admin.from("jurisdiction_rules").select("*"), projectId).eq("kind", RULE_KIND).is("deleted_at", null);
  if (res.error && ["PGRST205", "42P01"].includes(res.error.code)) return [];
  return must(res, "deposit rules");
}

// Official deposit sources for the state from Legal Resources (topic security_deposit), statutes first.
async function legalSources(admin, projectId, stateCode) {
  if (!stateCode) return [];
  const rows = must(
    await admin.from("legal_resources").select("title, url, citation, category, scope").eq("jurisdiction_code", stateCode).contains("topics", ["security_deposit"]).or(`project_id.is.null,project_id.eq.${projectId}`).is("deleted_at", null),
    "legal resources",
  );
  const rank = (r) => (r.category === "statute" ? 0 : r.scope === "state" ? 1 : 2);
  return (rows || []).sort((a, b) => rank(a) - rank(b)).slice(0, 4);
}

// Where the documents go: the lease's forwarding email / address, else the tenant's (Move to past), else the deposit's address.
async function forwardingOf(admin, lease, deposit) {
  const lm = metaOf(lease);
  const tenant = lease.tenant_id ? must(await forProject(admin.from("tenants").select("name, email, metadata"), lease.project_id).eq("id", lease.tenant_id).maybeSingle(), "tenant") : null;
  const tm = metaOf(tenant);
  const tenantAddress = [tm.forwardingLine1, [tm.forwardingCity, [tm.forwardingState, tm.forwardingZip].filter(Boolean).join(" ")].filter(Boolean).join(", ")].filter(Boolean).join("\n");
  return {
    email: String(lm.forwardingEmail || tm.forwardingEmail || "").trim(),
    address: String(lm.forwardingAddress || tenantAddress || metaOf(deposit).forwardingAddress || "").trim(),
    tenantEmail: String(tenant?.email || "").trim(),
    name: tenant?.name || lease.tenant_name || "",
  };
}

// Open items typed by key, kind and month (CORE-06 loader) with the credit sources (CORE-01 loader) → { items, credits, balance }.
async function openPosition(admin, projectId, acct, leaseId) {
  const [rec, typed] = await Promise.all([leaseReceivables(admin, projectId, acct, leaseId), loadLeaseReceivables(admin, projectId, [leaseId], acct)]);
  const kinds = new Map((typed.get(leaseId)?.items || []).map((i) => [i.entryId, i]));
  const items = rec.items.map((i) => ({ entryId: i.entryId, date: i.date, memo: i.memo, open: i.open, key: kinds.get(i.entryId)?.key || "", kind: kinds.get(i.entryId)?.kind || i.sourceType, period: kinds.get(i.entryId)?.period || "" }));
  return { items, credits: rec.creditSources.map((c) => ({ entryId: c.entryId, amount: c.amount, date: c.date })), balance: rec.balance };
}

// Everything a preview, a commit or a revise reads → the final account's state.
async function loadState(admin, c, lease, input = {}) {
  const P = lease.project_id;
  const deposits = await leaseDeposits(admin, lease);
  const { soda, primary: owner } = sodaHolder(deposits, lease);
  const committed = isCommitted(soda);
  const inAccount = (d) => Boolean(d.charge_entry_id) && (isOpenDeposit(d) || (sodaOf(d) && sodaOf(d).version === soda?.version));
  const onLedger = deposits.filter(inAccount);
  const open = onLedger.filter(isOpenDeposit);
  const primary = owner && onLedger.some((d) => d.id === owner.id) ? owner : onLedger[0] || null;
  const ordered = primary ? [primary, ...onLedger.filter((d) => d.id !== primary.id)] : onLedger;
  const notOnLedger = deposits.filter((d) => isOpenDeposit(d) && !d.charge_entry_id && Number(d.amount) > 0).map((d) => `The ${depositKindOf(d).toLowerCase()} (${d.name || "deposit"})`);
  const version = soda?.version || 1;
  const moveOut = isoDate(soda?.moveOut) || isoDate(input.moveOutDate) || isoDate(lease.move_out_date) || billingEndOf(lease) || "";
  const today = await c.today(P);
  const postDate = moveOut ? await c.openDate(P, maxDate(moveOut, today)) : today;
  const charges = normalizeCharges(committed ? soda.charges : (input.charges ?? metaOf(primary).deductions ?? []));
  // A draft a revise opened keeps the earlier version's accelerated rent unless the request changes it.
  const asked = input.accelerate ?? soda?.accelerate;
  const accelerate = committed ? soda.accelerate || { months: 0, amount: 0 } : { months: Math.max(0, Math.floor(Number(asked?.months) || 0)), amount: round2(asked?.amount ?? lease.rent) };
  const accel = accelRows(moveOut, accelerate);
  const fee = round2(metaOf(lease).earlyTermFee);
  const feeEntry = fee > 0 ? await findPosted(admin, P, earlyTermKey(lease.id)) : null;
  // A fee this final account posted stays part of it (a revise keeps it); one the Terminate wizard posted is just an open charge.
  const earlier = Boolean(soda?.earlyTerm?.include);
  const earlyTerm = { fee, posted: Boolean(feeEntry) && !earlier, include: committed ? earlier : earlier || (fee > 0 && !feeEntry && input.earlyTermFee !== false) };
  const acct = await c.accounts(P);
  const position = await openPosition(admin, P, acct, lease.id);
  const plans = [];
  for (const p of await loadPlans(admin, P, { leaseIds: [lease.id], statuses: ["Active"] })) plans.push({ id: p.id, name: p.name, deferred: await deferredRemaining(admin, P, acct, p.id) });
  const policies = await c.policies(lease);
  const place = await placeOf(admin, P, lease.property_id);
  const rule = depositRuleFor(await depositRules(admin, P), { stateCode: place.code, city: place.city, propertyId: lease.property_id, asOf: moveOut });
  const forwarding = await forwardingOf(admin, lease, primary);
  const email = input.email !== undefined ? String(input.email || "").trim() : committed ? soda.email?.to || forwarding.email : forwarding.email;
  // A committed account previews a revise: the proposed charges against the recorded result.
  const proposed = committed && (input.charges || input.accelerate) ? { charges: input.charges ?? soda.charges ?? [], accel: input.accelerate ? accelRows(moveOut, input.accelerate) : soda.accel || [], earlyTerm: soda.earlyTerm } : null;
  return {
    proposed,
    lease,
    deposits,
    soda,
    committed,
    primary,
    open,
    ordered,
    notOnLedger,
    version,
    moveOut,
    today,
    postDate,
    charges,
    accelerate,
    accel,
    earlyTerm,
    acct,
    position,
    plans,
    policies,
    place,
    rule,
    forwarding,
    email,
    returnDue: returnDeadline({ moveOut, depositReturnDue: isoDate(primary?.return_due), rule, policyDays: policies.depositReturnDays }),
  };
}

const ruleView = (rule) =>
  rule
    ? { id: rule.id, name: rule.name || "", jurisdictionCode: rule.jurisdiction_code, locality: rule.locality || "", enforcement: rule.enforcement || "warn", citation: rule.citation || "", sourceUrl: rule.source_url || "", params: ruleParams(rule) }
    : null;

// The letter model from the preview's cascade (the committed letter reads the ledger instead).
function plannedLetter(s, plan, extras) {
  const oldOpen = round2(plan.openAfterCharges - (plan.planDeferred + plan.chargesTotal + plan.accelTotal + plan.earlyTermFee));
  const creditsToOld = round2(Math.min(plan.creditsApplied, oldOpen));
  const toOld = round2(Math.min(plan.applied, oldOpen - creditsToOld));
  return {
    ...extras,
    version: s.version,
    issuedOn: s.today,
    moveOut: s.moveOut,
    returnDue: s.returnDue,
    deposits: plan.deposits.map((d) => ({ id: d.id, kind: d.kind, held: d.held, interest: d.interest })),
    available: plan.available,
    charges: chargeRows(s),
    creditsApplied: plan.creditsApplied > 0 ? [{ id: "credits", label: "Credits on your account", amount: plan.creditsApplied }] : [],
    appliedTo: [
      { id: "open", label: "Rent and charges open at move-out (after the final rent)", amount: toOld },
      { id: "moveout", label: "Move-out charges", amount: round2(plan.applied - toOld) },
    ].filter((r) => r.amount > 0),
    applied: plan.applied,
    refund: plan.refund,
    creditRefund: plan.creditRefund,
    balanceOwed: plan.balanceOwed,
  };
}

// The move-out charges a final account posts (or posted), as letter rows.
function chargeRows(s) {
  return [
    ...(s.earlyTerm.include ? [{ id: "early-term", label: "Early termination fee", category: "Lease", amount: s.earlyTerm.fee }] : []),
    ...s.accel.map((a) => ({ id: `accel-${a.period}`, label: a.label, category: "Accelerated rent", amount: a.amount })),
    ...s.charges.filter((x) => x.posts).map((x) => ({ id: x.id, label: x.label, category: x.category, amount: x.amount, notes: x.notes, invoiceNumber: x.invoiceNumber })),
  ];
}

// Company, residents and premises for the letter (CORE-12 statement data).
async function letterBasics(admin, lease, today) {
  const data = await loadStatementData(admin, lease.project_id, [lease.id], { today });
  const L = data.leases.get(lease.id);
  const st = assembleStatement(data, L, { from: today, to: today, period: null, toDate: false }, { today });
  return { data, basics: { company: st.company, residents: st.resident.names, premises: [st.property?.name, st.unit?.label ? `Unit ${st.unit.label}` : ""].filter(Boolean).join(" · "), propertyAddress: st.property?.address || "" } };
}

// Preview (commit:false): what each step posts and the result, with warnings, rule, sources and the letter as it would read.
async function previewOf(admin, c, s) {
  const lease = s.lease;
  let closeOut = null;
  let closeOutError = "";
  if (!s.committed && s.moveOut) {
    try {
      closeOut = await previewCloseOut(admin, lease, s.moveOut, { ctx: c });
    } catch (e) {
      if (!e?.status) throw e;
      closeOutError = e.message;
    }
  }
  const deposits = [];
  for (const d of s.ordered) {
    if (s.committed || !isOpenDeposit(d)) {
      const disp = metaOf(d).disposition || {};
      deposits.push({ id: d.id, name: d.name, kind: depositKindOf(d), status: d.status, held: round2(disp.held), interest: round2(disp.interest), cash: 0, applied: round2(disp.applied), refund: round2(disp.refund), refundBillId: d.refund_bill_id || null, warning: "" });
      continue;
    }
    const pv = (await disposeDeposit(admin, d, { commit: false, date: s.postDate, deductions: [], ctx: c })).preview;
    deposits.push({ id: d.id, name: d.name, kind: depositKindOf(d), status: d.status, held: pv.balance.held, interest: pv.balance.interest, cash: pv.balance.cash, warning: pv.regime?.warning || "" });
  }
  const plan = finalAccountPlan({
    items: s.position.items,
    credits: s.position.credits,
    closeOut,
    planDeferred: sumOf(s.plans, (p) => p.deferred),
    charges: s.charges,
    accel: s.accel,
    earlyTermFee: s.earlyTerm.include ? s.earlyTerm.fee : 0,
    deposits: s.committed ? [] : deposits,
  });
  const sources = await legalSources(admin, lease.project_id, s.place.code);
  const warnings = s.committed
    ? []
    : finalAccountWarnings({ today: s.today, moveOut: s.moveOut, returnDue: s.returnDue, rule: s.rule, stateName: s.place.name, accelMonths: s.accel.length, termEnd: isoDate(lease.term_end), email: s.email, address: s.forwarding.address, charges: s.charges, notOnLedger: s.notOnLedger });
  if (closeOutError) warnings.unshift({ tone: "warning", text: closeOutError });
  if (s.open.length && plan.creditLeft > 0) warnings.push({ tone: "info", text: "A credit is left after every charge is paid — it's refunded with the deposit." });
  if (!s.open.length && !s.committed && plan.creditLeft > 0) warnings.push({ tone: "warning", text: "A credit is left and there's no deposit on the ledger to refund it with; it stays on the lease ledger." });
  for (const d of deposits) if (d.warning) warnings.push({ tone: "warning", text: d.warning });
  const { basics } = await letterBasics(admin, lease, s.today);
  const letter = s.committed ? null : plannedLetter(s, plan, { ...basics, forwarding: s.forwarding, wording: ruleParams(s.rule).wording, rule: ruleView(s.rule), refundMethod: "", payableTo: [] });
  return {
    lease: { id: lease.id, name: lease.name || "", status: lease.status, rent: round2(lease.rent), termEnd: isoDate(lease.term_end), moveOut: s.moveOut, tenantName: lease.tenant_name || "", unit: lease.unit || "" },
    canFinalize: FINAL_ACCOUNT_STATUSES.includes(lease.status),
    soda: s.soda,
    committed: s.committed,
    version: s.version,
    moveOut: s.moveOut,
    postDate: s.postDate,
    today: s.today,
    returnDue: s.returnDue,
    closeOut: closeOut ? { through: closeOut.through, billing: closeOut.billing, final: closeOut.final, credit: closeOut.credit, charge: closeOut.charge, lines: closeOut.lines, message: closeOut.message || "" } : null,
    plans: s.plans,
    charges: s.charges,
    accelerate: s.accelerate,
    accel: s.accel,
    earlyTerm: s.earlyTerm,
    position: { balance: s.position.balance, items: s.position.items, credits: s.position.credits },
    deposits,
    primaryDepositId: s.primary?.id || null,
    notOnLedger: s.notOnLedger,
    plan,
    revise: s.committed && s.soda?.result ? revisePlan(s.soda.result, chargesTotal(s.soda), chargesTotal(s.proposed || s.soda)) : null,
    rule: ruleView(s.rule),
    place: s.place,
    sources,
    forwarding: s.forwarding,
    email: s.email,
    mailRequired: mailRequiredFor({ email: s.email, rule: s.rule }),
    warnings,
    letterHtml: letter ? letterHtml(letter) : "",
  };
}

// Earlier apply:<credit>:<item>[:n] keys per pair (any status) → Map "credit:item" → count.
async function priorApplications(admin, projectId, creditIds) {
  const out = new Map();
  const ids = [...new Set(creditIds.filter(Boolean))];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const rows = must(await forProject(admin.from("ledger_entries").select("idempotency_key"), projectId).like("idempotency_key", "apply:%").in("metadata->>creditEntryId", ids.slice(i, i + CHUNK)), "credit applications");
    for (const r of rows) {
      const [, credit, item] = String(r.idempotency_key).split(":");
      out.set(`${credit}:${item}`, (out.get(`${credit}:${item}`) || 0) + 1);
    }
  }
  return out;
}

// Apply a lease's unapplied credits (prepayments, overpayments) to its open items, oldest first (CORE-13; reused by CORE-15 before a write-off) → { planned, entries, applied }.
// Keys apply:<creditEntryId>:<itemEntryId>[:n]; the pair counts are read once, so a concurrent run lands on the same keys and posts nothing twice.
export async function applyLeaseCredits(admin, ctx, lease, { date, actor = null, commit = true, metadata = {} } = {}) {
  const c = ctx || makeBillingContext(admin);
  const P = lease.project_id;
  const acct = await c.accounts(P);
  const rec = await leaseReceivables(admin, P, acct, lease.id);
  const planned = planCreditApplications(rec.items, rec.creditSources);
  const out = { planned, entries: [], applied: sumOf(planned, (p) => p.amount) };
  if (!commit || !planned.length) return out;
  const day = await c.openDate(P, isoDate(date) || (await c.today(P)));
  const prior = await priorApplications(admin, P, planned.map((p) => p.creditEntryId));
  const memos = new Map(rec.items.map((i) => [i.entryId, i.memo || ""]));
  for (const p of planned) {
    const seq = (prior.get(`${p.creditEntryId}:${p.itemEntryId}`) || 0) + 1;
    const key = creditApplicationKey(p.creditEntryId, p.itemEntryId, seq);
    const memo = memos.get(p.itemEntryId) || "open charge";
    const res = await postOnce(
      admin,
      P,
      key,
      (a) => buildCreditApplication({ ...dimsOf(lease), creditEntryId: p.creditEntryId, itemEntryId: p.itemEntryId, amount: p.amount, seq, date: day, memo: `Credit applied · ${memo}`, sourceId: lease.id, metadata }, a),
      { acct, createdBy: actor?.id || null },
    );
    out.entries.push({ entryId: res.entryId, key, amount: p.amount, kind: "credit_application", created: res.created, creditEntryId: p.creditEntryId, itemEntryId: p.itemEntryId, memo });
  }
  return out;
}

// Store an HTML document privately (PLAT-01g storeProjectFile) and list it on each owner's Documents → { id, ids, bucket, path }.
async function saveHtmlDocument(admin, { projectId, owners, kind, name, html, actor, metadata = {} }) {
  const [first] = owners;
  const body = Buffer.from(html, "utf8");
  const file = await storeProjectFile(admin, { projectId, ownerType: first.type, ownerId: first.id, name: `${kind}.html`, body, contentType: "text/html;charset=utf-8" });
  const ids = [];
  for (const o of owners) {
    const row = { project_id: projectId, owner_type: o.type, owner_id: o.id, kind, name, bucket: file.bucket, storage_path: file.path, size_bytes: body.length, created_by: actor?.id || null, metadata };
    ids.push(must(await admin.from("documents").insert(row).select("id").single(), "document").id);
  }
  return { id: ids[0], ids, bucket: file.bucket, path: file.path };
}

// Email the documents once per version and address (notification_sends claims the key first; a disabled or failed send retries) → { to, status }.
async function sendDocuments(admin, { projectId, leaseId, version, to, model, deps, name }) {
  const dedupe = `final-stmt:${leaseId}:v${version}:${to.toLowerCase()}`;
  const row = { project_id: projectId, job_key: JOB_KEY, notification: NOTIFICATION, record_type: "lease", record_id: leaseId, dedupe_key: dedupe, channel: "email", recipient: to, status: "sending", metadata: { version } };
  let claim = await admin.from("notification_sends").insert(row).select("id").maybeSingle();
  let id = claim.data?.id || null;
  if (claim.error) {
    if (claim.error.code !== "23505") throw new Error(`notification_sends: ${claim.error.message}`);
    const prior = must(await forProject(admin.from("notification_sends").select("id, status").eq("dedupe_key", dedupe), projectId).maybeSingle(), "notification_sends");
    if (!prior || !RETRY.includes(prior.status)) return { to, status: "duplicate" };
    claim = must(await forProject(admin.from("notification_sends").update({ status: "sending", error: null }), projectId).eq("id", prior.id).eq("status", prior.status).select("id"), "notification_sends");
    if (!claim.length) return { to, status: "duplicate" };
    id = prior.id;
  }
  const send = deps?.send || sendNotificationEmail;
  const res = await send({ db: admin, projectId, notification: NOTIFICATION, to, data: finalAccountEmailData(model, { name }) });
  const status = res?.ok ? "sent" : res?.skipped ? "disabled" : res?.error === "not_configured" ? "not_configured" : "failed";
  if (id) await forProject(admin.from("notification_sends").update({ status, error: res?.ok ? null : String(res?.error || "") }), projectId).eq("id", id);
  return { to, status };
}

// Live ledger entries holding some keys → Map key → { id, total, memo }.
async function entriesByKey(admin, projectId, keys) {
  const out = new Map();
  const want = [...new Set(keys.filter(Boolean))];
  for (let i = 0; i < want.length; i += CHUNK) {
    const rows = must(await forProject(admin.from("ledger_entries").select("id, idempotency_key, total, memo, status, reversal_of"), projectId).in("idempotency_key", want.slice(i, i + CHUNK)).is("deleted_at", null), "entries");
    for (const e of rows) if (e.status === "posted" && !e.reversal_of) out.set(e.idempotency_key, { id: e.id, total: round2(e.total), memo: e.memo || "" });
  }
  return out;
}

// The committed letter, read from the ledger: deposits (dispositions), posted move-out charges, credits applied, what each deposit apply paid, refund bills.
async function ledgerLetter(admin, s, soda, { basics, closing }) {
  const P = s.lease.project_id;
  const deposits = s.ordered.map((d) => ({ d, disp: metaOf(d).disposition || {} }));
  const primaryId = soda.primaryDepositId || s.primary?.id;
  const keyOf = (row) =>
    row.id === "early-term" ? earlyTermKey(s.lease.id) : row.id.startsWith("accel-") ? sodaAccelKey(primaryId, row.id.slice(6), soda.version) : depositDeductionKey(primaryId, row.id, soda.version);
  const planned = chargeRows({ ...s, charges: normalizeCharges(soda.charges), accel: soda.accel || [], earlyTerm: { include: Boolean(soda.earlyTerm?.include), fee: round2(soda.earlyTerm?.fee) } });
  const posted = await entriesByKey(admin, P, planned.map(keyOf));
  const charges = planned.filter((r) => posted.has(keyOf(r))).map((r) => ({ ...r, amount: posted.get(keyOf(r)).total }));
  const applyIds = deposits.map(({ d }) => d.apply_entry_id).filter(Boolean);
  const applyLines = applyIds.length ? must(await forProject(admin.from("ledger_lines").select("entry_id, credit, applies_to_entry_id, gl_account_id"), P).in("entry_id", applyIds).is("deleted_at", null), "apply lines") : [];
  const ar = new Set(s.acct.list.filter((a) => a.subtype === "receivable").map((a) => a.id));
  const paid = applyLines.filter((l) => ar.has(l.gl_account_id) && Number(l.credit) > 0);
  const itemIds = [...new Set(paid.map((l) => l.applies_to_entry_id).filter(Boolean))];
  const items = itemIds.length ? must(await forProject(admin.from("ledger_entries").select("id, memo"), P).in("id", itemIds), "applied items") : [];
  const memo = new Map(items.map((e) => [e.id, e.memo || "Charge"]));
  const appliedTo = paid.map((l, i) => ({ id: `${l.applies_to_entry_id || i}-${i}`, label: memo.get(l.applies_to_entry_id) || "Charge", amount: round2(l.credit) }));
  const billIds = deposits.map(({ d }) => d.refund_bill_id).filter(Boolean);
  const bills = billIds.length ? must(await forProject(admin.from("bills").select("id, amount, status, metadata, deleted_at"), P).in("id", billIds), "refund bills").filter((b) => !b.deleted_at && b.status !== "Void") : [];
  const creditRefund = round2(bills.reduce((s2, b) => s2 + sumOf((b.metadata?.lines || []).filter((l) => l.appliesToEntryId), (l) => l.amount), 0));
  const creditsApplied = (soda.creditApplications || []).map((a, i) => ({ id: `credit-${i}`, label: `Credit applied to ${a.memo || "a charge"}`, amount: a.amount }));
  return {
    ...basics,
    version: soda.version,
    issuedOn: String(soda.committedAt || s.today).slice(0, 10),
    moveOut: soda.moveOut || s.moveOut,
    returnDue: s.returnDue,
    forwarding: soda.forwarding || s.forwarding,
    deposits: deposits.map(({ d, disp }) => ({ id: d.id, kind: depositKindOf(d), held: round2(disp.held), interest: round2(disp.interest) })),
    available: sumOf(deposits, ({ disp }) => round2(disp.held) + round2(disp.interest)),
    charges,
    creditsApplied,
    appliedTo,
    applied: sumOf(paid, (l) => l.credit),
    refund: sumOf(bills, (b) => b.amount),
    creditRefund,
    balanceOwed: Math.max(0, round2(closing)),
    refundMethod: soda.refundMethod || bills[0]?.metadata?.refundMethod || "",
    payableTo: bills[0]?.metadata?.payableTo || [],
    wording: ruleParams(s.rule).wording,
    rule: ruleView(s.rule),
  };
}

// The final statement (move-in to the final postings, with the deposit section) and the letter, from the ledger.
async function buildDocuments(admin, s, soda) {
  const lease = s.lease;
  const { data, basics } = await letterBasics(admin, lease, s.today);
  const L = data.leases.get(lease.id);
  const ar = (data.linesByLease.get(lease.id) || []).filter((l) => data.accounts.byId.get(l.glAccountId)?.subtype === "receivable");
  const last = ar.reduce((m, l) => maxDate(m, l.date), "");
  const range = finalStatementRange({ moveIn: isoDate(lease.move_in_date) || isoDate(lease.term_start) || ar[0]?.date || "", postDate: soda.date || s.postDate, lastLineDate: last });
  const st = assembleStatement(data, L, { ...range, period: null, toDate: false }, { today: s.today, portalUrl: "" });
  const model = await ledgerLetter(admin, s, soda, { basics, closing: st.closing });
  const statement = { ...st, title: "Final statement", final: true, extraHtml: depositSectionHtml(model) };
  return { model, statement, statementHtml: statementHtml(statement), letterHtml: letterHtml(model) };
}

// Write the SODA record on every deposit in the final account (the primary flagged), or on the lease when it has none.
async function writeSoda(admin, s, soda) {
  if (!s.ordered.length) return mergeMeta(admin, "leases", s.lease.id, { finalAccount: soda });
  for (const d of s.ordered) await mergeMeta(admin, "security_deposits", d.id, { soda: { ...soda, primary: d.id === (s.primary?.id || null) } });
}

const view = (s, soda, extra = {}) => ({
  committed: isCommitted(soda),
  version: soda.version,
  soda,
  moveOut: soda.moveOut,
  result: soda.result || null,
  documents: soda.documents || null,
  email: soda.email || null,
  mailRequired: Boolean(soda.mailRequired),
  leaseId: s.lease.id,
  ...extra,
});

// Commit: the steps in order, each keyed, then the documents and the SODA record; a committed version replays without posting.
async function commitOf(admin, c, s, input, { actor, deps }) {
  const lease = s.lease;
  const P = lease.project_id;
  if (input.version && Number(input.version) !== s.version) throw fail("This final account changed since you opened it — close the wizard and open it again.", 409);
  if (s.committed) return view(s, s.soda, { replay: true, entries: [] });
  if (!FINAL_ACCOUNT_STATUSES.includes(lease.status)) throw fail("Record the notice to vacate, terminate or end the lease before its final account.", 409);
  if (!s.moveOut) throw fail("Set the move-out date first.", 409);
  const posting = s.charges.filter((x) => x.posts);
  if (!s.primary && (posting.length || s.accel.length)) throw fail("Move-out charges post against a deposit on the ledger — bill or record the deposit first, or charge them from the lease ledger.", 409);
  if (s.accel.length && s.rule?.enforcement === "block" && ruleParams(s.rule).acceleratedRent === "prohibited") throw fail("Your deposit rule doesn't allow accelerated rent.", 409);
  const version = s.version;
  const createdBy = actor?.id || null;
  const dims = dimsOf(lease);
  const base = { version, moveOut: s.moveOut, date: s.postDate, primaryDepositId: s.primary?.id || null, history: s.soda?.history || [], startedAt: s.soda?.startedAt || new Date().toISOString(), startedBy: s.soda?.startedBy || createdBy };
  // 0 · claim the version as a Draft, so a crash resumes it.
  await writeSoda(admin, s, { ...(s.soda || {}), ...base, status: SODA_DRAFT });
  const entries = [];
  // 1 · close out at the move-out date (CORE-02).
  const closeOut = await closeOutLease(admin, lease, s.moveOut, { actor, ctx: c });
  entries.push(...closeOut.entries);
  // 2 · a payment plan's deferred balance comes due (CORE-14).
  for (const p of s.plans) entries.push(...(await cancelPlan(admin, c, p.id, { projectId: P, reason: "Moved out — final account", actor })).entries);
  // 3 · move-out charges: early-termination fee, accelerated rent, deductions (CORE-04 7a keys and builder).
  if (s.earlyTerm.include) {
    const key = earlyTermKey(lease.id);
    const res = await postOnce(admin, P, key, (a) => buildCharge({ ...dims, amount: s.earlyTerm.fee, date: s.postDate, incomeKey: "other_income", memo: "Early termination fee", sourceId: lease.id, metadata: { earlyTermination: true, finalAccount: version } }, a), { acct: s.acct, createdBy });
    entries.push({ entryId: res.entryId, key, amount: s.earlyTerm.fee, kind: "charge", created: res.created });
  }
  for (const row of s.accel) {
    const key = sodaAccelKey(s.primary.id, row.period, version);
    const res = await postOnce(admin, P, key, (a) => buildCharge({ ...dims, amount: row.amount, date: s.postDate, incomeKey: "rent_income", memo: row.label, sourceId: s.primary.id, metadata: { depositId: s.primary.id, soda: version, accelerated: true, period: row.period } }, a), { acct: s.acct, createdBy });
    entries.push({ entryId: res.entryId, key, amount: row.amount, kind: "accelerated_rent", created: res.created });
  }
  for (const x of posting) {
    const key = depositDeductionKey(s.primary.id, x.id, version);
    const res = await postOnce(
      admin,
      P,
      key,
      (a) => buildCharge({ ...dims, amount: x.amount, date: s.postDate, glAccountId: x.glAccountId || undefined, incomeKey: x.glKey, memo: `Deposit deduction · ${x.label}`, sourceId: s.primary.id, metadata: { depositId: s.primary.id, deductionId: x.id, category: x.category, version } }, a),
      { acct: s.acct, createdBy },
    );
    entries.push({ entryId: res.entryId, key, amount: x.amount, kind: "deduction", created: res.created });
  }
  const deductions = s.charges.map(({ posts: _p, glKey: _g, ...x }) => x);
  if (s.primary) await mergeMeta(admin, "security_deposits", s.primary.id, { deductions });
  // 4 · unapplied credits to open items.
  const credits = await applyLeaseCredits(admin, c, lease, { date: s.postDate, actor, metadata: { finalAccount: version } });
  entries.push(...credits.entries);
  // 5 · the deposits (and interest), the primary first; a credit left once nothing is open is refunded with it (CORE-04 7b, 7c, 7e).
  const after = await leaseReceivables(admin, P, s.acct, lease.id);
  const creditRefunds = after.items.length ? [] : after.creditSources.map((x) => ({ entryId: x.entryId, amount: x.amount }));
  const dispositions = [];
  for (const d of s.ordered) {
    const row = await loadDeposit(admin, d.id, P);
    if (!isOpenDeposit(row) && !(metaOf(row).disposition?.committedAt && Number(metaOf(row).disposition.version) === version)) continue;
    const first = d.id === s.primary?.id;
    const res = await disposeDeposit(admin, row, { deductions: first ? deductions : [], version, date: s.postDate, commit: true, actor, ctx: c, creditRefunds: first ? creditRefunds : [], refundMethod: input.refundMethod || "" });
    entries.push(...res.entries);
    dispositions.push({ depositId: d.id, status: res.status, disposition: res.disposition, billId: res.bill?.id || null, pendingApproval: Boolean(res.pendingApproval), postError: res.postError || "" });
  }
  // 6 · the documents and the SODA record.
  const fresh = await loadState(admin, c, await loadLease(admin, lease.id, P), { email: s.email });
  const soda = {
    ...base,
    status: SODA_DRAFT,
    charges: deductions,
    accelerate: s.accelerate,
    accel: s.accel,
    earlyTerm: { include: s.earlyTerm.include, fee: s.earlyTerm.fee },
    creditApplications: credits.entries.map((e) => ({ entryId: e.entryId, creditEntryId: e.creditEntryId, itemEntryId: e.itemEntryId, amount: e.amount, memo: e.memo })),
    refundMethod: input.refundMethod || "",
    settlement: input.settlement === "plan" ? "plan" : "open",
    forwarding: { email: s.email, address: s.forwarding.address },
    documents: s.soda?.documents?.version === version ? s.soda.documents : null,
  };
  const docs = await buildDocuments(admin, fresh, soda);
  const m = docs.model;
  soda.result = { available: m.available, applied: m.applied, refund: m.refund, creditRefund: m.creditRefund, balanceOwed: m.balanceOwed, creditsApplied: sumOf(soda.creditApplications, (a) => a.amount), closing: docs.statement.closing };
  soda.refundBillIds = dispositions.map((x) => x.billId).filter(Boolean);
  if (!soda.documents) {
    const tag = version > 1 ? ` (revised v${version})` : "";
    const owners = [{ type: "lease", id: lease.id }];
    const statement = await saveHtmlDocument(admin, { projectId: P, owners, kind: "final_statement", name: `Final statement${tag} — ${lease.name || "lease"}.html`, html: docs.statementHtml, actor, metadata: { finalAccount: version } });
    const letter = await saveHtmlDocument(admin, { projectId: P, owners: [...owners, ...(s.primary ? [{ type: "deposit", id: s.primary.id }] : [])], kind: "deposit_disposition", name: `Deposit accounting${tag} — ${lease.name || "lease"}.html`, html: docs.letterHtml, actor, metadata: { finalAccount: version } });
    soda.documents = { version, statementId: statement.id, letterId: letter.id, letterIds: letter.ids };
  }
  // 7 · email the forwarding address; flag mail when there's none or the rule requires a mailed copy.
  const send = input.sendEmail !== false && s.email;
  soda.email = send ? await sendDocuments(admin, { projectId: P, leaseId: lease.id, version, to: s.email, model: m, deps, name: s.forwarding.name }) : { to: s.email || "", status: s.email ? "skipped" : "no_email" };
  soda.mailRequired = mailRequiredFor({ email: send ? s.email : "", rule: s.rule });
  soda.status = SODA_COMMITTED;
  soda.committedAt = new Date().toISOString();
  soda.committedBy = createdBy;
  await writeSoda(admin, fresh, soda);
  const summary = `Final account${version > 1 ? ` revised (v${version})` : " committed"}: deposit applied ${m.applied.toFixed(2)}, ${m.refund > 0 ? `refund ${m.refund.toFixed(2)}` : m.balanceOwed > 0 ? `balance owed ${m.balanceOwed.toFixed(2)}` : "nothing owed"}${soda.mailRequired ? " — mail the statement and letter" : ""}`;
  for (const [ownerType, ownerId] of [["lease", lease.id], ["deposit", s.primary?.id]]) if (ownerId) await logActivity(admin, { projectId: P, ownerType, ownerId, verb: "action", summary, ...actorOf(actor), metadata: { finalAccount: version } });
  return view(fresh, soda, { entries, dispositions, closeOut: { credit: closeOut.credit, charge: closeOut.charge }, credits: credits.applied });
}

// Final account for a lease (POST …/final-account): commit:false previews every step; commit:true runs them once (re-runs post nothing).
export async function finalAccount(admin, leaseId, input = {}, { commit = false, actor = null, ctx, deps = {} } = {}) {
  const c = ctx || makeBillingContext(admin);
  const lease = await loadLease(admin, leaseId, input.projectId);
  const s = await loadState(admin, c, lease, input);
  return commit ? commitOf(admin, c, s, input, { actor, deps }) : previewOf(admin, c, s);
}

// The committed final statement and letter as HTML, rebuilt from the ledger (GET …/final-account).
export async function finalAccountDocuments(admin, leaseId, { projectId, ctx } = {}) {
  const c = ctx || makeBillingContext(admin);
  const lease = await loadLease(admin, leaseId, projectId);
  const s = await loadState(admin, c, lease, {});
  if (!isCommitted(s.soda)) throw fail("This lease's final account isn't committed yet.", 404);
  const docs = await buildDocuments(admin, s, s.soda);
  return { soda: s.soda, letterHtml: docs.letterHtml, statementHtml: docs.statementHtml, letter: docs.model, statement: { from: docs.statement.from, to: docs.statement.to, closing: docs.statement.closing } };
}

// The entries a committed version posted that a revise voids: its deductions, accelerated rent, deposit applies and releases, and credits applied to those charges.
async function versionEntries(admin, s, soda) {
  const P = s.lease.project_id;
  const v = soda.version;
  const primaryId = soda.primaryDepositId || s.primary?.id;
  const suffix = new RegExp(v > 1 ? `:v${v}$` : "^deposit:[^:]+:ded:[^:]+$");
  const keys = s.ordered.flatMap((d) => [depositApplyKey(d.id, v), depositReleaseKey(d.id, v)]);
  const rows = [];
  if (keys.length) rows.push(...must(await forProject(admin.from("ledger_entries").select("id, idempotency_key, status, reversal_of"), P).in("idempotency_key", keys).is("deleted_at", null), "version entries"));
  if (primaryId) {
    const ded = must(await forProject(admin.from("ledger_entries").select("id, idempotency_key, status, reversal_of"), P).like("idempotency_key", `deposit:${primaryId}:ded:%`).is("deleted_at", null), "deductions");
    rows.push(...ded.filter((e) => suffix.test(e.idempotency_key)));
    rows.push(...must(await forProject(admin.from("ledger_entries").select("id, idempotency_key, status, reversal_of"), P).like("idempotency_key", `soda:${primaryId}:accel:%:v${v}`).is("deleted_at", null), "accelerated rent"));
  }
  const live = rows.filter((e) => e.status === "posted" && !e.reversal_of);
  const charged = new Set(live.filter((e) => !/:(apply|release)(:v\d+)?$/.test(e.idempotency_key)).map((e) => e.id));
  const applied = charged.size
    ? must(await forProject(admin.from("ledger_entries").select("id, idempotency_key, status, reversal_of, metadata"), P).eq("lease_id", s.lease.id).like("idempotency_key", "apply:%").is("deleted_at", null), "credit applications").filter(
        (e) => e.status === "posted" && !e.reversal_of && charged.has(e.metadata?.itemEntryId),
      )
    : [];
  return [...applied, ...live];
}

// Revise a committed final account (POST /deposits/[id]/revise): refused once a refund is paid; voids the version's entries and its unpaid refund bills, reopens the deposits, then commits v<n+1> with the new charges.
export async function reviseFinalAccount(admin, depositId, input = {}, { actor = null, ctx, deps = {} } = {}) {
  const c = ctx || makeBillingContext(admin);
  const P = input.projectId;
  const deposit = await loadDeposit(admin, depositId, P);
  if (!deposit.lease_id) throw fail("This deposit isn't linked to a lease.", 409);
  const lease = await loadLease(admin, deposit.lease_id, P);
  const s = await loadState(admin, c, lease, {});
  const soda = s.soda;
  if (!isCommitted(soda)) throw fail("Only a committed final account can be revised.", 409);
  if (input.version && Number(input.version) !== soda.version) throw fail("This final account changed since you opened it — close the wizard and open it again.", 409);
  const billIds = [...new Set([...s.ordered.map((d) => d.refund_bill_id), ...(soda.refundBillIds || [])].filter(Boolean))];
  const bills = billIds.length ? must(await forProject(admin.from("bills").select("*"), P).in("id", billIds).is("deleted_at", null), "refund bills") : [];
  for (const b of bills) {
    const payments = b.ledger_entry_id ? must(await forProject(admin.from("ledger_lines").select("entry_id, debit"), P).eq("applies_to_entry_id", b.ledger_entry_id).gt("debit", 0).is("deleted_at", null), "refund payments") : [];
    const livePayments = payments.length ? must(await forProject(admin.from("ledger_entries").select("id, status, reversal_of, source_type"), P).in("id", [...new Set(payments.map((p) => p.entry_id))]), "payments").filter((e) => e.source_type === "bill_payment" && e.status === "posted" && !e.reversal_of) : [];
    if (b.status !== "Void" && (Number(b.amount_paid) > 0 || ["Paid", "Partially paid"].includes(b.status) || livePayments.length)) {
      throw fail("The refund has been paid, so this final account can't be revised — post an adjustment on the lease ledger instead.", 409);
    }
  }
  const memo = `Final account revised · v${soda.version} voided`;
  const day = await c.openDate(P, maxDate(soda.date || s.postDate, s.today));
  const voided = [];
  const voidOne = async (id) => {
    try {
      voided.push(await voidPosted(admin, id, { date: day, memo }));
    } catch (e) {
      if (!/already void/.test(e?.message || "")) throw e;
    }
  };
  for (const e of await versionEntries(admin, s, soda)) await voidOne(e.id);
  for (const b of bills) {
    if (b.status === "Void") continue;
    if (b.ledger_entry_id) await voidOne(b.ledger_entry_id);
    must(await forProject(admin.from("bills").update({ status: "Void", metadata: { ...metaOf(b), voidedBy: "final_account_revise", revisedFrom: soda.version } }), P).eq("id", b.id).select("id"), "refund bill");
  }
  const history = [...(soda.history || []), { version: soda.version, committedAt: soda.committedAt || null, committedBy: soda.committedBy || null, result: soda.result || null, documents: soda.documents || null, revisedAt: new Date().toISOString(), revisedBy: actor?.id || null }];
  for (const d of s.ordered) {
    must(await forProject(admin.from("security_deposits").update({ status: "Awaiting disposition", apply_entry_id: null, refund_bill_id: null, refund_amount: 0, returned_on: null }), P).eq("id", d.id).select("id"), "deposit");
    await mergeMeta(admin, "security_deposits", d.id, { disposition: null, soda: { status: SODA_DRAFT, version: soda.version + 1, moveOut: soda.moveOut, date: soda.date, earlyTerm: soda.earlyTerm || null, accelerate: soda.accelerate || null, primaryDepositId: soda.primaryDepositId || s.primary?.id || null, primary: d.id === (soda.primaryDepositId || s.primary?.id), history } });
  }
  const out = await finalAccount(admin, lease.id, { ...input, projectId: P, version: soda.version + 1, moveOutDate: soda.moveOut }, { commit: true, actor, ctx: c, deps });
  return { ...out, voided: voided.length, revisedFrom: soda.version };
}
