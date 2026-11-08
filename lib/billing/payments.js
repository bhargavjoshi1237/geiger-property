import "server-only";
import { buildPayment, openItems } from "@/lib/ledger/postings";
import { logActivity } from "@/lib/messaging/threads";
import { forProject } from "@/lib/supabase/scope";
import { makeBillingContext } from "./context";
import { cashGlOf, pendingSweeps } from "./deposits";
import { isoDate, round2 } from "./periods";
import { fail, findPosted, postOnce } from "./post";
import { loadLeaseReceivables } from "./receivables";
import { receivableLines, sendReceipt } from "./receipts";
import { loadLease } from "./service";
import {
  HOUSING_AUTHORITY,
  PAYMENT_METHODS,
  cashRoute,
  isUuid,
  payKey,
  paymentRestrictions,
  planAllocations,
  receiptNumber,
  receiptRequirement,
} from "./payment_rules";

// Server-only office payments (CORE-11): check the tenant's restrictions, allocate oldest first (CORE-06), post Dr cash / Cr AR once under pay:<requestId>, then log, emit payment.received and send the receipt.

const must = ({ data, error }, what) => {
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
};
const usd = (n) => `$${round2(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function rowOf(admin, table, id, projectId, cols = "*") {
  if (!id) return null;
  const row = must(await forProject(admin.from(table).select(cols).eq("id", id), projectId).maybeSingle(), table);
  return row && !row.deleted_at ? row : null;
}

// Open items and balance the payment settles: the lease's tenant AR (shared CORE-06 loader), the housing authority's receivable (HOUS-01), or a lease-less tenant's AR.
async function openFor(admin, projectId, acct, { lease, tenantId, authority }) {
  if (lease && !authority) {
    const r = (await loadLeaseReceivables(admin, projectId, [lease.id], acct)).get(lease.id);
    return { items: r.items, balance: r.balance };
  }
  const subtype = authority ? "subsidy_receivable" : "receivable";
  const lines = await receivableLines(admin, projectId, acct, authority ? { column: "lease_id", id: lease.id, subtype } : { column: "tenant_id", id: tenantId, subtype });
  return { items: openItems(lines, acct, subtype), balance: round2(lines.reduce((s, l) => s + l.debit - l.credit, 0)) };
}

// The cash GL (and bank) the money lands in: 1050 for undeposited paper payments, the chosen bank's GL, else default trust cash.
async function cashFor(admin, projectId, acct, ctx, { method, bankAccountId, undeposited }) {
  const settings = await ctx.settings(projectId);
  const route = cashRoute({ method, bankAccountId, undeposited, useUndepositedFunds: settings.useUndepositedFunds });
  if (route.systemKey) {
    const id = acct.byKey.get(route.systemKey)?.id;
    if (!id) throw fail(`The chart of accounts has no ${route.systemKey === "undeposited_funds" ? "Undeposited Funds (1050)" : "Trust Cash"} account.`);
    return { glAccountId: id, bankAccountId: null, undeposited: route.systemKey === "undeposited_funds" };
  }
  const bank = await rowOf(admin, "bank_accounts", route.bankAccountId, projectId, "id, name, account_type, status, gl_account_id, deleted_at");
  if (!bank) throw fail("Bank account not found.", 404);
  if (bank.status === "Closed") throw fail("That bank account is closed.");
  const gl = cashGlOf(bank, acct);
  if (!gl) throw fail("That bank account has no cash GL account.");
  return { glAccountId: gl, bankAccountId: bank.id, bankName: bank.name || "", undeposited: false };
}

// An already-posted request: the entry it made, with no side effects repeated.
async function replay(admin, projectId, entryId) {
  const e = await rowOf(admin, "ledger_entries", entryId, projectId, "id, total, metadata, deleted_at");
  return { entryId, created: false, replay: true, receiptNo: e?.metadata?.receiptNo || receiptNumber(entryId), amount: round2(e?.total) };
}

// Deposit money this payment paid that sits outside the deposit bank (CORE-04's queue), so staff can move it; nothing is posted here.
async function depositSweepsFor(admin, ctx, projectId, entryId, allocations) {
  const ids = allocations.map((a) => a.entryId);
  if (!ids.length) return [];
  const deposits = must(await forProject(admin.from("security_deposits").select("id"), projectId).in("charge_entry_id", ids).is("deleted_at", null), "deposits");
  if (!deposits.length) return [];
  const { bank, rows } = await pendingSweeps(admin, projectId, { ctx, depositIds: deposits.map((d) => d.id) });
  return rows.filter((r) => r.paymentEntryId === entryId).map((r) => ({ depositId: r.depositId, depositName: r.depositName, amount: r.amount, toBankName: bank?.name || "" }));
}

async function logBoth(admin, projectId, { leaseId, tenantId }, entry) {
  for (const [ownerType, ownerId] of [["lease", leaseId], ["tenant", tenantId]]) if (ownerId) await logActivity(admin, { projectId, ownerType, ownerId, ...entry });
}

// Side effects never undo a posted payment: a failure comes back as a warning.
async function safely(warnings, label, run) {
  try {
    return await run();
  } catch (e) {
    console.error(`[billing.payments] ${label}`, e);
    warnings.push(`${label}: ${e?.message || e}`);
    return null;
  }
}

// Record an office payment → { entryId, created, receiptNo, allocations, unapplied, cash, receipt, requirement, depositSweeps, overridden, warnings }.
// input: { projectId, requestId, leaseId | tenantId, payer, amount, date, method, reference, bankAccountId | undeposited, allocations?, memo, sendReceipt, receiptTo, override: { reason } }.
export async function recordManualPayment(admin, input, actor, { canOverride = false, ctx } = {}) {
  const c = ctx || makeBillingContext(admin);
  const projectId = input?.projectId;
  if (!projectId) throw fail("projectId is required.");
  if (!isUuid(input.requestId)) throw fail("requestId must be a new UUID for each submit.");
  const key = payKey(input.requestId);
  const prior = await findPosted(admin, projectId, key);
  if (prior) return replay(admin, projectId, prior);

  const amount = round2(input.amount);
  if (!(amount > 0)) throw fail("Enter an amount greater than zero.");
  const method = PAYMENT_METHODS.includes(input.method) ? input.method : "";
  if (!method) throw fail(`Pick a payment method: ${PAYMENT_METHODS.join(", ")}.`);
  const authority = input.payer === HOUSING_AUTHORITY;
  const lease = input.leaseId ? await loadLease(admin, input.leaseId, projectId) : null;
  if (authority && !lease) throw fail("A housing authority payment needs the lease it's for.");
  if (!lease && !input.tenantId) throw fail("Pick the lease or tenant this payment is for.");
  const tenant = authority ? null : await rowOf(admin, "tenants", input.tenantId || lease?.tenant_id, projectId);
  if (!authority && input.tenantId && !tenant) throw fail("Tenant not found.", 404);
  const date = isoDate(input.date) || (await c.today(projectId));
  const acct = await c.accounts(projectId);
  const propertyId = lease?.property_id || tenant?.property_id || null;
  const [property, policies, open] = await Promise.all([
    rowOf(admin, "properties", propertyId, projectId, "id, name, state, deleted_at"),
    c.policies(lease || { project_id: projectId, property_id: propertyId }),
    openFor(admin, projectId, acct, { lease, tenantId: tenant?.id || input.tenantId, authority }),
  ]);

  // Tenant restrictions: refused unless overridden with a reason by a role that may.
  const restrictions = paymentRestrictions({ tenant, lease, policies, method, amount, balance: open.balance, payer: authority ? HOUSING_AUTHORITY : "tenant" });
  const reason = String(input.override?.reason || "").trim().slice(0, 500);
  if (restrictions.length && !reason) throw Object.assign(fail(restrictions.map((r) => r.message).join(" "), 409), { restrictions });
  if (restrictions.length && !canOverride) throw Object.assign(fail("Your role can't override payment restrictions.", 403), { restrictions });

  const plan = planAllocations(open.items, amount, input.allocations);
  if (plan.error) throw fail(plan.error);
  const cash = await cashFor(admin, projectId, acct, c, { method, bankAccountId: input.bankAccountId, undeposited: input.undeposited === true });
  const requirement = receiptRequirement({ state: property?.state, method });
  const entryId = crypto.randomUUID();
  const receiptNo = receiptNumber(entryId);
  const enteredBy = { id: actor?.id || null, name: actor?.name || actor?.email || "Staff" };
  const override = restrictions.length ? { reason, restrictions: restrictions.map((r) => r.key), by: enteredBy, at: new Date().toISOString() } : null;
  const dims = {
    leaseId: lease?.id || undefined,
    tenantId: authority ? undefined : tenant?.id || input.tenantId || undefined,
    unitId: lease?.unit_id || tenant?.unit_id || undefined,
    propertyId: propertyId || undefined,
  };
  const reference = String(input.reference || "").trim().slice(0, 120);
  const built = buildPayment(
    {
      ...dims,
      entryId,
      date,
      amount,
      method,
      arKey: authority ? "subsidy_receivable" : "accounts_receivable",
      cashGlAccountId: cash.glAccountId,
      bankAccountId: cash.bankAccountId || undefined,
      allocations: plan.allocations,
      memo: String(input.memo || "").trim().slice(0, 300) || undefined,
      metadata: {
        method,
        reference,
        receiptNo,
        enteredBy,
        manual: true,
        amount,
        ...(authority ? { payer: HOUSING_AUTHORITY } : {}),
        ...(cash.undeposited ? { undeposited: true } : {}),
        ...(requirement.required ? { receiptRequired: requirement.citation || true } : {}),
        ...(override ? { restrictionOverride: override } : {}),
      },
    },
    acct,
  );
  if (built.error) throw fail(built.error);
  const res = await postOnce(admin, projectId, key, built, { acct, createdBy: actor?.id || null });
  // A concurrent duplicate (double click) lost the race: the winner owns the event and the receipt.
  if (!res.created) return replay(admin, projectId, res.entryId);

  const warnings = [];
  const label = [method, reference ? `#${reference}` : ""].filter(Boolean).join(" ");
  const actorFields = { actorId: enteredBy.id, actorName: enteredBy.name };
  await safely(warnings, "Activity", async () => {
    await logBoth(admin, projectId, dims, { verb: "payment", summary: `${authority ? "Housing authority payment" : "Office payment"} of ${usd(amount)} recorded · ${label} · ${receiptNo}`, ...actorFields, metadata: { entryId, receiptNo, method, amount } });
    if (override) {
      const names = restrictions.map((r) => r.label).join(", ");
      await logBoth(admin, projectId, dims, { verb: "action", summary: `Payment restriction overridden (${names}) on ${receiptNo}: ${reason}`, ...actorFields, metadata: { entryId, restrictionOverride: override } });
    }
  });
  await safely(warnings, "Automation event", async () => {
    const { error } = await admin.rpc("emit_record_event", {
      p_project: projectId,
      p_event: "payment.received",
      p_table: "ledger_entries",
      p_record: entryId,
      p_payload: { status: "posted", amount, method, reference, source: "office", payer: authority ? HOUSING_AUTHORITY : "tenant", leaseId: dims.leaseId || null, tenantId: dims.tenantId || null, propertyId: dims.propertyId || null, receiptNo },
    });
    if (error) throw new Error(error.message);
  });
  const wantsReceipt = !authority && (input.sendReceipt === true || requirement.required);
  const receipt = wantsReceipt
    ? (await safely(warnings, "Receipt", () => sendReceipt(admin, entryId, { projectId, to: input.receiptTo }))) || { ok: false, status: "failed" }
    : { ok: false, status: "not_requested" };
  const depositSweeps = (await safely(warnings, "Deposit transfer check", () => depositSweepsFor(admin, c, projectId, entryId, plan.allocations))) || [];
  return {
    entryId,
    created: true,
    receiptNo,
    amount,
    date,
    allocations: plan.allocations,
    unapplied: plan.unapplied,
    cash,
    receipt,
    requirement,
    depositSweeps,
    overridden: override ? override.restrictions : [],
    warnings,
  };
}
