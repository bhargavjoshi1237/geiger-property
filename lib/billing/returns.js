import "server-only";
import { buildCharge, buildReturnedDeposit } from "@/lib/ledger/postings";
import { voidPosted } from "@/lib/ledger/store";
import { logActivity } from "@/lib/messaging/threads";
import { readPaymentSettings } from "@/lib/payments/context";
import { forProject } from "@/lib/supabase/scope";
import { depositLabel } from "./bank_deposits_math";
import { makeBillingContext } from "./context";
import { cashGlOf } from "./deposits";
import { isoDate, round2 } from "./periods";
import { fail, postOnce } from "./post";
import { HOUSING_AUTHORITY, isUuid } from "./payment_rules";
import {
  RETURN_REASONS,
  moneyLocation,
  nsfBankKey,
  nsfKey,
  postingDate,
  reachesCertified,
  reasonLabel,
  reopenedCharges,
  returnBlocker,
  returnDateProblem,
  returnedPaymentsOf,
} from "./returns_rules";

// Server-only returned payments (CORE-17): the NSF fee and tenant flag shared with online returns (lib/payments/fulfill.js), and office-payment returns: void the payment, move a deposited check's shortfall to its bank (nsf-bank:<id>), charge the NSF fee (nsf:<id>), flag the tenant and emit payment.returned, once per payment (property.payment_returns).

const must = ({ data, error }, what) => {
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
};
const usd = (n) => `$${round2(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function rowOf(admin, table, id, projectId, cols = "*") {
  if (!isUuid(id)) return null;
  const row = must(await forProject(admin.from(table).select(cols).eq("id", id), projectId).maybeSingle(), table);
  return row && !row.deleted_at ? row : null;
}

// Side effects never undo a return: a failure comes back as a warning.
async function safely(warnings, label, run) {
  try {
    return await run();
  } catch (e) {
    console.error(`[billing.returns] ${label}`, e);
    warnings.push(`${label}: ${e?.message || e}`);
    return null;
  }
}

// The NSF fee from the effective policy (company → property → lease).
export async function nsfFeeFor(admin, { projectId, leaseId, propertyId }, { ctx } = {}) {
  const c = ctx || makeBillingContext(admin);
  const lease = leaseId ? await rowOf(admin, "leases", leaseId, projectId, "id, project_id, property_id, metadata, deleted_at") : null;
  const policies = await c.policies(lease || { project_id: projectId, property_id: propertyId || null });
  return Math.max(0, round2(policies.nsfFee));
}

// Charge the NSF / returned-payment fee once under nsf:<ref> (Dr 1200 AR / Cr 4100 Other Income) → { entryId, created, amount }, or null with no fee or no one to charge.
export async function postNsfFee(admin, { projectId, leaseId, tenantId, unitId, propertyId, ref, sourceId, date, amount, memo, metadata } = {}, { ctx, createdBy } = {}) {
  if (!projectId) throw new Error("The NSF fee needs the project.");
  if (!ref) throw new Error("The NSF fee needs the returned payment's reference.");
  if (!leaseId && !tenantId) return null;
  const c = ctx || makeBillingContext(admin);
  const fee = round2(amount ?? (await nsfFeeFor(admin, { projectId, leaseId, propertyId }, { ctx: c })));
  if (!(fee > 0)) return null;
  const on = isoDate(date) || (await c.today(projectId));
  const res = await postOnce(
    admin,
    projectId,
    nsfKey(ref),
    (a) =>
      buildCharge(
        {
          amount: fee,
          incomeKey: "other_income",
          date: on,
          memo: memo || "Returned payment (NSF) fee",
          leaseId: leaseId || undefined,
          tenantId: tenantId || undefined,
          unitId: unitId || undefined,
          propertyId: propertyId || undefined,
          sourceId: sourceId || undefined,
          metadata: { nsf: true, ...(metadata || {}) },
        },
        a,
      ),
    { acct: await c.accounts(projectId), createdBy },
  );
  return { ...res, amount: fee };
}

// Count a returned payment on the tenant; at the certifiedAfterReturns threshold (online-payment settings) switch them to certified funds → { count, threshold, restricted, newlyRestricted } or null.
export async function flagTenantReturn(admin, { projectId, tenantId, ref, at } = {}) {
  if (!projectId || !tenantId) return null;
  const [settings, tenant] = await Promise.all([readPaymentSettings(admin, projectId), rowOf(admin, "tenants", tenantId, projectId, "id, metadata, deleted_at")]);
  if (!tenant) return null;
  const m = tenant.metadata || {};
  const count = returnedPaymentsOf(tenant) + 1;
  const threshold = Number(settings.certifiedAfterReturns) || 0;
  const restricted = reachesCertified(count, threshold);
  const newlyRestricted = restricted && m.restrictCertifiedOnly !== true;
  const when = at || new Date().toISOString();
  const patch = {
    returnedPayments: count,
    lastReturnedPaymentAt: when,
    ...(ref ? { lastReturnedPaymentRef: String(ref) } : {}),
    certifiedFundsRecommended: true,
    ...(restricted ? { restrictCertifiedOnly: true } : {}),
    ...(newlyRestricted && !m.restrictionReason ? { restrictionReason: `${count} returned payments`, restrictionSetBy: "Returned payments", restrictionSetOn: when.slice(0, 10) } : {}),
  };
  const { error } = await admin.rpc("merge_meta", { p_table: "tenants", p_id: tenantId, p_patch: patch });
  if (error) throw new Error(`tenant flag: ${error.message}`);
  return { count, threshold, restricted, newlyRestricted };
}

// The last closed accounting day (CORE-40), else null.
async function lockedThroughOf(admin, projectId) {
  const { data, error } = await admin.rpc("ledger_locked_through", { p_project: projectId });
  if (error) {
    console.error("[billing.returns] locked through", error.message);
    return null;
  }
  return data || null;
}

const liveReturnOf = async (admin, projectId, paymentEntryId) =>
  must(await forProject(admin.from("payment_returns").select("*").eq("payment_entry_id", paymentEntryId).is("deleted_at", null), projectId).limit(1), "returned payments")[0] || null;

// Everything a return needs about one payment: the entry and lines, where its money is (1050, a bank deposit, a bank), who paid, the fee policy and any return already recorded.
async function paymentFacts(admin, c, projectId, paymentEntryId) {
  if (!projectId) throw fail("projectId is required.");
  const entry = await rowOf(admin, "ledger_entries", paymentEntryId, projectId);
  if (!entry) throw fail("Payment not found.", 404);
  const acct = await c.accounts(projectId);
  const lines = must(await forProject(admin.from("ledger_lines").select("*").eq("entry_id", entry.id).is("deleted_at", null), projectId).order("line_no"), "payment lines");
  const und = acct.byKey.get("undeposited_funds")?.id || null;
  const cashLine = lines.find((l) => Number(l.debit) > 0) || null;
  const stamped = und && cashLine?.gl_account_id === und ? cashLine.bank_deposit_id : null;
  const deposit = stamped ? await rowOf(admin, "bank_deposits", stamped, projectId) : null;
  const location = moneyLocation({ cashLine, undepositedGlId: und, deposit });
  const bank = location.bankAccountId ? await rowOf(admin, "bank_accounts", location.bankAccountId, projectId, "id, name, account_type, status, gl_account_id, deleted_at") : null;
  const m = entry.metadata || {};
  const authority = m.payer === HOUSING_AUTHORITY;
  const tenantId = authority ? null : entry.tenant_id || cashLine?.tenant_id || null;
  const leaseId = entry.lease_id || cashLine?.lease_id || null;
  const propertyId = entry.property_id || cashLine?.property_id || null;
  const [tenant, receipt, returned] = await Promise.all([
    tenantId ? rowOf(admin, "tenants", tenantId, projectId, "id, name, metadata, deleted_at") : null,
    forProject(admin.from("payment_receipts").select("receipt_no").eq("entry_id", entry.id).is("deleted_at", null), projectId).limit(1).then((r) => must(r, "receipts")[0] || null),
    liveReturnOf(admin, projectId, entry.id),
  ]);
  const arIds = acct.list.filter((a) => a.subtype === "receivable" || a.subtype === "subsidy_receivable").map((a) => a.id);
  return {
    entry,
    acct,
    und,
    location,
    deposit,
    bank,
    bankGl: bank ? cashGlOf(bank, acct) : null,
    authority,
    tenant,
    tenantId,
    leaseId,
    propertyId,
    unitId: entry.unit_id || cashLine?.unit_id || null,
    amount: round2(m.amount ?? cashLine?.debit ?? entry.total),
    method: m.method || "",
    reference: m.reference || "",
    receiptNo: receipt?.receipt_no || "",
    reopened: reopenedCharges(lines, arIds),
    returned,
  };
}

const paymentLabel = (f) => [f.method, f.reference ? `#${f.reference}` : ""].filter(Boolean).join(" ");
const depositName = (d) => (d ? depositLabel({ slipNumber: d.slip_number, depositDate: d.deposit_date }) : "");

// A payment_returns row as the routes return it.
function returnView(row, f) {
  if (!row) return null;
  const m = row.metadata || {};
  return {
    returnId: row.id,
    paymentEntryId: row.payment_entry_id,
    status: row.status,
    returnedOn: row.returned_on,
    postedOn: m.postOn || row.returned_on,
    reason: row.reason,
    reasonLabel: reasonLabel(row.reason),
    amount: round2(row.amount),
    location: m.location || "",
    bankDepositId: row.bank_deposit_id || null,
    depositLabel: m.depositLabel || depositName(f?.deposit),
    bankName: m.bankName || f?.bank?.name || "",
    chargeFee: Boolean(row.charge_fee),
    feeAmount: round2(row.fee_amount),
    voidEntryId: row.void_entry_id || null,
    bankEntryId: row.bank_entry_id || null,
    feeEntryId: row.fee_entry_id || null,
    tenantFlag: m.tenantFlag || null,
    enteredBy: m.enteredBy?.name || "",
    completedAt: row.completed_at || null,
  };
}

// What the return wizard shows before anything posts: the payment, where its money is, the fee policy and the tenant's return count.
export async function returnPreview(admin, paymentEntryId, { projectId, ctx } = {}) {
  const c = ctx || makeBillingContext(admin);
  const f = await paymentFacts(admin, c, projectId, paymentEntryId);
  const [today, lockedThrough, settings, fee] = await Promise.all([
    c.today(projectId),
    lockedThroughOf(admin, projectId),
    readPaymentSettings(admin, projectId),
    nsfFeeFor(admin, { projectId, leaseId: f.leaseId, propertyId: f.propertyId }, { ctx: c }),
  ]);
  const threshold = Number(settings.certifiedAfterReturns) || 0;
  const count = f.tenant ? returnedPaymentsOf(f.tenant) : 0;
  const feeAllowed = !f.authority && Boolean(f.leaseId || f.tenantId);
  return {
    paymentEntryId: f.entry.id,
    date: f.entry.entry_date,
    amount: f.amount,
    method: f.method,
    reference: f.reference,
    receiptNo: f.receiptNo,
    memo: f.entry.memo || "",
    authority: f.authority,
    blocker: f.returned ? "" : returnBlocker(f.entry),
    returned: returnView(f.returned, f),
    location: f.location.kind,
    bankName: f.bank?.name || "",
    deposit: f.deposit ? { depositId: f.deposit.id, label: depositName(f.deposit), date: f.deposit.deposit_date } : null,
    fee: { amount: fee, allowed: feeAllowed, default: feeAllowed && fee > 0 },
    tenant: f.tenant
      ? { id: f.tenant.id, name: f.tenant.name || "", returnedPayments: count, threshold, certifiedOnly: f.tenant.metadata?.restrictCertifiedOnly === true, nextRestricts: reachesCertified(count + 1, threshold) && f.tenant.metadata?.restrictCertifiedOnly !== true }
      : null,
    reopened: f.reopened,
    today,
    lockedThrough,
    reasons: RETURN_REASONS,
  };
}

// Record that an office payment came back (NSF, account closed, stop payment) → { returnId, created, replay, …, warnings }.
// input: { projectId, returnedOn, reason, chargeFee (default: the policy fee when there is one), memo }. A retry or a second click replays the first return.
export async function processReturnedPayment(admin, paymentEntryId, input = {}, actor = null, { ctx } = {}) {
  const c = ctx || makeBillingContext(admin);
  const projectId = input.projectId;
  const f = await paymentFacts(admin, c, projectId, paymentEntryId);
  let row = f.returned;
  if (!row) {
    const blocker = returnBlocker(f.entry);
    if (blocker) throw fail(blocker, f.entry.status === "void" ? 409 : 400);
    const reason = RETURN_REASONS.some((r) => r.value === input.reason) ? input.reason : "";
    if (!reason) throw fail(`Pick why it came back: ${RETURN_REASONS.map((r) => r.label).join(", ")}.`);
    const today = await c.today(projectId);
    const returnedOn = isoDate(input.returnedOn) || today;
    const problem = returnDateProblem({ returnedOn, paymentDate: f.entry.entry_date, depositDate: f.location.kind === "deposited" ? f.deposit?.deposit_date : "", today });
    if (problem) throw fail(problem);
    if (f.location.kind === "deposited" && (!f.bank || !f.bankGl || f.bankGl === f.und)) throw fail("The bank account this check was deposited into wasn't found or has no cash GL account.", 409);
    const feeAllowed = !f.authority && Boolean(f.leaseId || f.tenantId);
    const fee = feeAllowed && input.chargeFee !== false ? await nsfFeeFor(admin, { projectId, leaseId: f.leaseId, propertyId: f.propertyId }, { ctx: c }) : 0;
    const lockedThrough = await lockedThroughOf(admin, projectId);
    const postOn = postingDate(returnedOn, lockedThrough);
    const by = { id: actor?.id || null, name: actor?.name || actor?.email || "Staff" };
    const memo = String(input.memo || "").trim().slice(0, 300);
    const { data, error } = await admin
      .from("payment_returns")
      .insert({
        project_id: projectId,
        payment_entry_id: f.entry.id,
        lease_id: f.leaseId,
        tenant_id: f.tenantId,
        property_id: f.propertyId,
        amount: f.amount,
        returned_on: returnedOn,
        reason,
        charge_fee: fee > 0,
        fee_amount: fee > 0 ? fee : 0,
        status: "Pending",
        bank_deposit_id: f.location.bankDepositId,
        bank_account_id: f.location.bankAccountId,
        metadata: {
          postOn,
          location: f.location.kind,
          depositLabel: depositName(f.deposit),
          bankName: f.bank?.name || "",
          method: f.method,
          reference: f.reference,
          receiptNo: f.receiptNo,
          enteredBy: by,
          ...(memo ? { memo } : {}),
          ...(postOn !== returnedOn ? { closedThrough: lockedThrough } : {}),
        },
        created_by: actor?.id || null,
      })
      .select("*")
      .single();
    // A concurrent click claimed it first (payment_returns_entry_uidx): finish that one instead.
    if (error && error.code !== "23505") throw new Error(`returned payment: ${error.message}`);
    row = data || (await liveReturnOf(admin, projectId, f.entry.id));
    if (!row) throw fail("Couldn't record the returned payment; try again.", 409);
  }
  return completeReturn(admin, c, f, row, actor);
}

// Live deposit sweeps (CORE-04) this payment paid for: that money already moved to the deposit bank.
async function sweptDeposits(admin, projectId, paymentEntryId) {
  const rows = must(
    await forProject(admin.from("ledger_entries").select("id, total, idempotency_key"), projectId).like("idempotency_key", `deposit:%:sweep:${paymentEntryId}`).eq("status", "posted").is("deleted_at", null),
    "deposit sweeps",
  );
  return rows.map((e) => ({ entryId: e.id, amount: round2(e.total) }));
}

// Run (or finish) a claimed return from its stored row: each ledger step is idempotent, and only the request that marks it Returned flags, logs and emits.
async function completeReturn(admin, c, f, row, actor) {
  const projectId = row.project_id;
  const id = row.payment_entry_id;
  const m = row.metadata || {};
  const postOn = m.postOn || row.returned_on;
  const createdBy = actor?.id || null;
  const label = paymentLabel(f);
  const why = reasonLabel(row.reason);

  // 1 · Void the payment: the reversal re-opens the charges it paid and takes its money back out of 1050 or its bank.
  let voidEntryId = row.void_entry_id || f.entry.metadata?.voidEntryId || null;
  if (f.entry.status === "posted") {
    try {
      voidEntryId = await voidPosted(admin, id, { date: row.returned_on, memo: `Returned payment · ${why}${label ? ` · ${label}` : ""}` });
    } catch (e) {
      if (!/already void/i.test(e.message)) throw e;
      voidEntryId = (await rowOf(admin, "ledger_entries", id, projectId, "id, metadata, deleted_at"))?.metadata?.voidEntryId || null;
    }
  }

  // 2 · A deposited check: the void credited 1050, so move the shortfall to the deposit's bank (Dr 1050 / Cr bank) under nsf-bank:<payment>.
  let bankEntryId = row.bank_entry_id || null;
  if (row.bank_deposit_id) {
    const bank = f.bank?.id === row.bank_account_id ? f.bank : await rowOf(admin, "bank_accounts", row.bank_account_id, projectId, "id, name, account_type, status, gl_account_id, deleted_at");
    const res = await postOnce(
      admin,
      projectId,
      nsfBankKey(id),
      (a) =>
        buildReturnedDeposit(
          {
            amount: row.amount,
            date: postOn,
            bankGlAccountId: bank ? cashGlOf(bank, a) : null,
            bankAccountId: row.bank_account_id,
            leaseId: row.lease_id || undefined,
            tenantId: row.tenant_id || undefined,
            unitId: f.unitId || undefined,
            propertyId: row.property_id || undefined,
            paymentEntryId: id,
            bankDepositId: row.bank_deposit_id,
            sourceId: id,
            memo: `Returned check · ${why}${label ? ` · ${label}` : ""}${m.depositLabel ? ` · ${m.depositLabel}` : ""}`,
            metadata: { returnOf: id, paymentReturnId: row.id, bankDepositId: row.bank_deposit_id, reason: row.reason, reference: m.reference || "", ...(m.closedThrough ? { closedThrough: m.closedThrough } : {}) },
          },
          a,
        ),
      { acct: f.acct, createdBy },
    );
    bankEntryId = res.entryId;
    // The 1050 line belongs to the deposit the check went out in, so it never lists as undeposited and a signed-in void of it is refused.
    must(
      await forProject(admin.from("ledger_lines").update({ bank_deposit_id: row.bank_deposit_id }), projectId).eq("entry_id", bankEntryId).eq("gl_account_id", f.und).is("bank_deposit_id", null).select("id"),
      "returned check line",
    );
  }

  // 3 · The NSF fee (nsf:<payment>), dated with the return.
  let feeEntryId = row.fee_entry_id || null;
  if (row.charge_fee && Number(row.fee_amount) > 0) {
    const fee = await postNsfFee(
      admin,
      {
        projectId,
        leaseId: row.lease_id,
        tenantId: row.tenant_id,
        unitId: f.unitId,
        propertyId: row.property_id,
        ref: id,
        sourceId: id,
        date: postOn,
        amount: row.fee_amount,
        memo: `Returned payment fee · ${why}${label ? ` · ${label}` : ""}`,
        metadata: { returnOf: id, paymentReturnId: row.id, reason: row.reason },
      },
      { ctx: c, createdBy },
    );
    feeEntryId = fee?.entryId || null;
  }

  // 4 · Mark it Returned; the request that does so is the one that flags the tenant, logs and emits.
  const completedAt = new Date().toISOString();
  const claimed = must(
    await forProject(admin.from("payment_returns").update({ status: "Returned", void_entry_id: voidEntryId, bank_entry_id: bankEntryId, fee_entry_id: feeEntryId, completed_at: completedAt }), projectId)
      .eq("id", row.id)
      .eq("status", "Pending")
      .select("*"),
    "returned payment",
  );
  const first = claimed.length > 0;
  let current = first ? claimed[0] : (await rowOf(admin, "payment_returns", row.id, projectId)) || row;
  const warnings = [];
  if (first) {
    const flag = await safely(warnings, "Tenant flag", () => flagTenantReturn(admin, { projectId, tenantId: row.tenant_id, ref: id, at: completedAt }));
    if (flag) {
      const saved = await safely(warnings, "Return record", async () =>
        must(await forProject(admin.from("payment_returns").update({ metadata: { ...(current.metadata || {}), tenantFlag: flag } }), projectId).eq("id", row.id).select("*"), "returned payment")[0],
      );
      if (saved) current = saved;
    }
    const swept = (await safely(warnings, "Deposit transfer check", () => sweptDeposits(admin, projectId, id))) || [];
    for (const s of swept) warnings.push(`${usd(s.amount)} of this payment was already moved to the security deposit bank; move it back from Bank Accounts.`);
    const enteredBy = m.enteredBy || { id: createdBy, name: actor?.name || "Staff" };
    const fee = feeEntryId ? `; ${usd(row.fee_amount)} NSF fee charged` : "";
    const certified = flag?.newlyRestricted ? "; tenant switched to certified funds" : "";
    const summary = `${f.authority ? "Housing authority payment" : "Office payment"} of ${usd(row.amount)} returned (${why})${label ? ` · ${label}` : ""}${m.receiptNo ? ` · ${m.receiptNo}` : ""} — reversed on the ledger${fee}${certified}`;
    await safely(warnings, "Activity", async () => {
      for (const [ownerType, ownerId] of [["lease", row.lease_id], ["tenant", row.tenant_id]]) {
        if (ownerId) await logActivity(admin, { projectId, ownerType, ownerId, verb: "payment", summary, actorId: enteredBy.id, actorName: enteredBy.name, metadata: { paymentEntryId: id, paymentReturnId: row.id, reason: row.reason } });
      }
    });
    // CORE-14 payment plans and workflows react to this (the read-only ledger_payment record type gives them the tenant and lease).
    await safely(warnings, "Automation event", async () => {
      const { error } = await admin.rpc("emit_record_event", {
        p_project: projectId,
        p_event: "payment.returned",
        p_table: "ledger_entries",
        p_record: id,
        p_payload: {
          status: "returned",
          source: "office",
          payer: f.authority ? HOUSING_AUTHORITY : "tenant",
          amount: round2(row.amount),
          method: m.method || null,
          reference: m.reference || null,
          receiptNo: m.receiptNo || null,
          reason: row.reason,
          returnedOn: row.returned_on,
          leaseId: row.lease_id || null,
          tenantId: row.tenant_id || null,
          propertyId: row.property_id || null,
          bankDepositId: row.bank_deposit_id || null,
          voidEntryId,
          feeEntryId,
          nsfFee: feeEntryId ? round2(row.fee_amount) : 0,
          reopened: f.reopened,
          returnedPayments: flag?.count ?? null,
          certifiedOnly: Boolean(flag?.restricted),
        },
      });
      if (error) throw new Error(error.message);
    });
  }
  return { ...returnView(current, f), created: first, replay: !first, reopened: f.reopened, warnings };
}
