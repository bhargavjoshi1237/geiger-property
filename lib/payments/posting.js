import { allocateOldestFirst, buildCashTransaction, buildCharge, buildPayment, round2 } from "@/lib/ledger/postings";
import { loadAccountIndex, postBuilt, voidPosted } from "@/lib/ledger/store";
import { sendNotificationEmail } from "@/lib/email/notifications";
import { ONLINE_METHODS } from "./constants";
import { leaseReceivable, meta, primaryOwnerOf, readPaymentSettings, readSetting } from "./context";
import { effectivePolicies } from "@/lib/policies";

// Server-only side effects of an online payment: post it to the general ledger
// (Dr deposit cash / Cr AR, oldest-first, remainder = unapplied credit), book the
// convenience fee, reverse it when it comes back (void + NSF fee), flag the
// tenant, log activity, emit the automation event and email the receipt.
// Idempotency keys: stripe:<pi>, stripe-fee:<pi>, nsf:<pi>, stripe-refund:<re> (+ ":reinstated" after a won dispute).

const BANK_TYPE_KEY = { Trust: "trust_cash", "Security deposit": "deposit_cash", Operating: "operating_cash", Reserve: "operating_cash" };

const ref = (row) => row.stripe_payment_intent_id || row.id;
const methodLabel = (row) => ONLINE_METHODS[row.method]?.ledgerLabel || "Online";
const isoDate = (ts) => String(ts || new Date().toISOString()).slice(0, 10);

export async function updatePayment(admin, id, patch) {
  const { data, error } = await admin.from("online_payments").update(patch).eq("id", id).select("*").single();
  if (error) throw new Error(error.message);
  return data;
}

// Deposit cash GL (+ bank account dimension) from the payment settings.
async function depositCash(admin, settings, acct) {
  const bankId = settings.depositBankAccountId || "";
  if (bankId) {
    const { data: bank } = await admin.from("bank_accounts").select("*").eq("id", bankId).is("deleted_at", null).maybeSingle();
    if (bank) {
      const gl = bank.gl_account_id && acct.byId.has(bank.gl_account_id)
        ? bank.gl_account_id
        : acct.byKey.get(BANK_TYPE_KEY[bank.account_type] || "trust_cash")?.id;
      if (gl) return { cashGlAccountId: gl, bankAccountId: bank.id };
    }
  }
  return { cashGlAccountId: acct.byKey.get("trust_cash")?.id || "", bankAccountId: "" };
}

// Post the payment (and its convenience fee) once → the updated row.
// `keySuffix` re-posts under a fresh key (a won dispute); `skipFee` leaves the fee alone.
export async function postPaymentToLedger(admin, row, { keySuffix = "", skipFee = false } = {}) {
  const projectId = row.project_id || null;
  const feeDone = skipFee || row.fee_entry_id || !(Number(row.convenience_fee) > 0);
  if (row.ledger_entry_id && feeDone) return row;
  const acct = await loadAccountIndex(admin, projectId);
  const settings = await readPaymentSettings(admin, projectId);
  const cash = await depositCash(admin, settings, acct);
  const ownerId = await primaryOwnerOf(admin, row.property_id);
  const date = isoDate(row.paid_at);
  const dims = {
    leaseId: row.lease_id || undefined,
    tenantId: row.tenant_id || undefined,
    unitId: row.unit_id || undefined,
    propertyId: row.property_id || undefined,
    ownerId: ownerId || undefined,
  };
  const patch = {};

  if (!row.ledger_entry_id) {
    const { items } = row.lease_id ? await leaseReceivable(admin, projectId, row.lease_id, acct) : { items: [] };
    const { allocations } = allocateOldestFirst(items, row.amount);
    const built = buildPayment(
      {
        ...dims,
        ...cash,
        date,
        amount: row.amount,
        allocations,
        method: methodLabel(row),
        memo: `Online payment · ${methodLabel(row)}${row.method_label ? ` · ${row.method_label}` : ""}`,
        sourceId: row.id,
        idempotencyKey: `stripe:${ref(row)}${keySuffix}`,
        metadata: { onlinePaymentId: row.id, stripePaymentIntentId: row.stripe_payment_intent_id || null, source: row.source },
      },
      acct,
    );
    if (built.error) throw new Error(built.error);
    patch.ledger_entry_id = await postBuilt(admin, built, { projectId });
  }

  const fee = round2(row.convenience_fee);
  if (fee > 0 && !feeDone) {
    const income = acct.byKey.get("other_income")?.id;
    if (income) {
      const built = buildCashTransaction(
        {
          direction: "in",
          amount: fee,
          ...cash,
          glAccountId: income,
          date,
          memo: `Convenience fee · ${methodLabel(row)} payment`,
          leaseId: dims.leaseId,
          tenantId: dims.tenantId,
          propertyId: dims.propertyId,
          sourceId: row.id,
          idempotencyKey: `stripe-fee:${ref(row)}`,
          metadata: { onlinePaymentId: row.id, convenienceFee: true },
        },
        acct,
      );
      if (!built.error) patch.fee_entry_id = await postBuilt(admin, built, { projectId });
    }
  }
  return Object.keys(patch).length ? updatePayment(admin, row.id, patch) : row;
}

// Void a posted entry; an already-void entry counts as done.
export async function voidIfPosted(admin, entryId, memo) {
  if (!entryId) return null;
  try {
    return await voidPosted(admin, entryId, { memo });
  } catch (e) {
    if (/already void/i.test(e.message)) return null;
    throw e;
  }
}

// Effective policies for a payment row's lease.
async function policiesFor(admin, row) {
  const [lease, company] = await Promise.all([
    row.lease_id ? admin.from("leases").select("*").eq("id", row.lease_id).maybeSingle().then((r) => r.data) : null,
    readSetting(admin, row.project_id || null, "fees_policies"),
  ]);
  const property = row.property_id
    ? (await admin.from("properties").select("id, metadata").eq("id", row.property_id).maybeSingle()).data
    : null;
  return effectivePolicies({ company: company || {}, property, lease });
}

// NSF / returned-payment fee from the effective policy → entry id or null.
export async function postNsfFee(admin, row) {
  const policies = await policiesFor(admin, row);
  const fee = round2(policies.nsfFee);
  if (!(fee > 0) || (!row.lease_id && !row.tenant_id)) return null;
  const projectId = row.project_id || null;
  const acct = await loadAccountIndex(admin, projectId);
  const ownerId = await primaryOwnerOf(admin, row.property_id);
  const built = buildCharge(
    {
      amount: fee,
      incomeKey: "other_income",
      date: isoDate(),
      memo: "Returned payment (NSF) fee",
      leaseId: row.lease_id || undefined,
      tenantId: row.tenant_id || undefined,
      unitId: row.unit_id || undefined,
      propertyId: row.property_id || undefined,
      ownerId: ownerId || undefined,
      sourceId: row.id,
      idempotencyKey: `nsf:${ref(row)}`,
      metadata: { onlinePaymentId: row.id, nsf: true },
    },
    acct,
  );
  if (built.error) throw new Error(built.error);
  return postBuilt(admin, built, { projectId });
}

// Re-open a partial refund on the lease: Dr AR / Cr deposit cash.
// `keySuffix` re-posts under a fresh key (refunds re-booked after a won dispute).
export async function postRefundEntry(admin, row, refund, { keySuffix = "" } = {}) {
  const projectId = row.project_id || null;
  const amount = round2((Number(refund.amount) || 0) / 100);
  if (!(amount > 0)) return null;
  const acct = await loadAccountIndex(admin, projectId);
  const settings = await readPaymentSettings(admin, projectId);
  const cash = await depositCash(admin, settings, acct);
  const ar = acct.byKey.get("accounts_receivable")?.id;
  if (!ar || !cash.cashGlAccountId) throw new Error("The chart of accounts is missing AR or cash.");
  const ownerId = await primaryOwnerOf(admin, row.property_id);
  const built = {
    entry: {
      date: isoDate(),
      memo: `Refund · online payment${refund.reason ? ` · ${refund.reason}` : ""}`,
      sourceType: "adjustment",
      sourceId: row.id,
      idempotencyKey: `stripe-refund:${refund.id}${keySuffix}`,
      metadata: { onlinePaymentId: row.id, stripeRefundId: refund.id },
      leaseId: row.lease_id || undefined,
      tenantId: row.tenant_id || undefined,
      unitId: row.unit_id || undefined,
      propertyId: row.property_id || undefined,
      ownerId: ownerId || undefined,
    },
    lines: [
      { glAccountId: ar, debit: amount, memo: "Refunded payment" },
      { glAccountId: cash.cashGlAccountId, credit: amount, bankAccountId: cash.bankAccountId || null },
    ],
  };
  return postBuilt(admin, built, { projectId });
}

// Refunds recorded on the row (metadata.refunds).
export const refundsOf = (row) => (Array.isArray(meta(row).refunds) ? meta(row).refunds : []);

// Returned / disputed payment: void every live refund re-open entry so the
// refunded amount isn't re-opened twice (once by the refund, again by the
// payment void) → the updated refunds list.
export async function voidRefundEntries(admin, row, memo) {
  const at = new Date().toISOString();
  const out = [];
  for (const r of refundsOf(row)) {
    if (r.entryId && !r.voidedAt) {
      await voidIfPosted(admin, r.entryId, memo);
      out.push({ ...r, voidedAt: at });
    } else out.push(r);
  }
  return out;
}

// Won dispute: re-book every refund the return voided (or deferred) under a
// fresh `:reinstated` key → the updated refunds list.
export async function rebookRefundEntries(admin, row) {
  const out = [];
  for (const r of refundsOf(row)) {
    if ((r.entryId && r.voidedAt) || r.deferred) {
      const entryId = await postRefundEntry(admin, row, { id: r.id, amount: Math.round(round2(r.amount) * 100), reason: r.reason }, { keySuffix: ":reinstated" });
      out.push({ ...r, entryId, voidedAt: null, deferred: false, rebookedAt: new Date().toISOString() });
    } else out.push(r);
  }
  return out;
}

// Timeline entry on the lease and tenant (property.activity).
export async function logPaymentActivity(admin, row, verb, summary, extra = {}) {
  const owners = [
    ["lease", row.lease_id],
    ["tenant", row.tenant_id],
  ].filter(([, id]) => id);
  if (!owners.length) return;
  const { error } = await admin.from("activity").insert(
    owners.map(([ownerType, ownerId]) => ({
      project_id: row.project_id || null,
      owner_type: ownerType,
      owner_id: ownerId,
      verb,
      summary,
      actor_name: "Online payments",
      metadata: { onlinePaymentId: row.id, ...extra },
    })),
  );
  if (error) console.error("[payments.activity]", error.message);
}

// Automation trigger (property.emit_record_event); never blocks the payment.
export async function emitPaymentEvent(admin, row, event) {
  const { error } = await admin.rpc("emit_record_event", {
    p_project: row.project_id || null,
    p_event: event,
    p_table: "online_payments",
    p_record: row.id,
    p_payload: {
      status: row.status,
      amount: Number(row.amount) || 0,
      method: row.method || null,
      leaseId: row.lease_id || null,
      tenantId: row.tenant_id || null,
      propertyId: row.property_id || null,
      source: row.source || null,
    },
  });
  if (error) console.error("[payments.event]", error.message);
}

// Returned payment: mark the tenant, and switch to certified funds at the threshold.
export async function flagTenantReturn(admin, row) {
  if (!row.tenant_id) return;
  const settings = await readPaymentSettings(admin, row.project_id || null);
  const { data: tenant } = await admin.from("tenants").select("id, metadata").eq("id", row.tenant_id).maybeSingle();
  const count = (Number(meta(tenant).returnedPayments) || 0) + 1;
  const threshold = Number(settings.certifiedAfterReturns) || 0;
  const patch = {
    returnedPayments: count,
    lastReturnedPaymentAt: new Date().toISOString(),
    certifiedFundsRecommended: true,
    ...(threshold > 0 && count >= threshold ? { restrictCertifiedOnly: true } : {}),
  };
  const { error } = await admin.rpc("merge_meta", { p_table: "tenants", p_id: row.tenant_id, p_patch: patch });
  if (error) console.error("[payments.flagTenant]", error.message);
}

const usd = (n) => `$${(Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");

// Receipt email (notification `rent_receipt`, template property.rent_receipt).
export async function sendPaymentReceipt(admin, row) {
  try {
    const settings = await readPaymentSettings(admin, row.project_id || null);
    if (settings.sendReceipts === false || !row.payer_email) return { ok: false, skipped: true };
    const acct = await loadAccountIndex(admin, row.project_id || null);
    const [{ balance }, property, unit] = await Promise.all([
      row.lease_id ? leaseReceivable(admin, row.project_id || null, row.lease_id, acct) : { balance: 0 },
      row.property_id ? admin.from("properties").select("name").eq("id", row.property_id).maybeSingle().then((r) => r.data) : null,
      row.unit_id ? admin.from("units").select("label").eq("id", row.unit_id).maybeSingle().then((r) => r.data) : null,
    ]);
    return await sendNotificationEmail({
      projectId: row.project_id || null,
      notification: "rent_receipt",
      to: row.payer_email,
      db: admin,
      data: {
        recipientName: String(row.payer_name || "").split(" ")[0] || "there",
        amount: usd(row.amount),
        paidOn: new Date(row.paid_at || Date.now()).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
        method: [methodLabel(row), row.method_label].filter(Boolean).join(" · "),
        reference: `PMT-${String(row.id).slice(0, 8).toUpperCase()}`,
        balance: usd(Math.max(0, balance)),
        propertyName: property?.name || "",
        unitLabel: unit?.label || "",
        ctaUrl: appUrl(),
      },
    });
  } catch (e) {
    console.error("[payments.receipt]", e);
    return { ok: false, error: e.message };
  }
}
