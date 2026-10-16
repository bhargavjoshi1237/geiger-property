import { effectivePolicies } from "@/lib/policies";
import { normalizeEntry, normalizeLine, openItems, round2 } from "@/lib/ledger/postings";
import { loadAccountIndex } from "@/lib/ledger/store";
import { PAYMENT_SETTINGS_KEY, ONLINE_METHODS, withPaymentDefaults } from "./constants";

// Server-only: everything a payment decision needs for one lease — the lease,
// tenant, property, effective policies, online-payment settings and the lease's
// open receivable from the general ledger — plus the policy gate every online
// payment (portal, staff link, autopay) passes through. Takes the service-role
// client (lib/supabase/admin.js); never throws, returns { ok:false, error }.

export const meta = (row) => (row?.metadata && typeof row.metadata === "object" ? row.metadata : {});

const forProject = (q, projectId) => (projectId ? q.eq("project_id", projectId) : q.is("project_id", null));

export async function readSetting(admin, projectId, key) {
  const { data, error } = await forProject(
    admin.from("settings").select("value").eq("key", key).is("deleted_at", null),
    projectId,
  ).limit(1);
  if (error) throw new Error(error.message);
  return data?.[0]?.value ?? null;
}

export async function readPaymentSettings(admin, projectId) {
  return withPaymentDefaults(await readSetting(admin, projectId, PAYMENT_SETTINGS_KEY));
}

async function one(admin, table, id) {
  if (!id) return null;
  const { data, error } = await admin.from(table).select("*").eq("id", id).is("deleted_at", null).maybeSingle();
  if (error) throw new Error(error.message);
  return data || null;
}

export async function primaryOwnerOf(admin, propertyId) {
  if (!propertyId) return "";
  const { data } = await admin
    .from("property_owners")
    .select("owner_id, is_primary")
    .eq("property_id", propertyId)
    .is("deleted_at", null);
  const rows = data || [];
  return (rows.find((r) => r.is_primary) || rows[0])?.owner_id || "";
}

// Open AR items (oldest first) and the receivable balance for a lease.
export async function leaseReceivable(admin, projectId, leaseId, acct) {
  const ar = acct.list.filter((a) => a.subtype === "receivable").map((a) => a.id);
  if (!ar.length || !leaseId) return { items: [], balance: 0 };
  const { data, error } = await forProject(
    admin.from("ledger_lines").select("*").eq("lease_id", leaseId).in("gl_account_id", ar).is("deleted_at", null),
    projectId,
  );
  if (error) throw new Error(error.message);
  const lines = (data || []).map(normalizeLine);
  const ids = [...new Set(lines.map((l) => l.entryId))];
  const entries = new Map();
  for (let i = 0; i < ids.length; i += 150) {
    const { data: rows, error: e2 } = await admin.from("ledger_entries").select("*").in("id", ids.slice(i, i + 150));
    if (e2) throw new Error(e2.message);
    for (const r of rows || []) entries.set(r.id, normalizeEntry(r));
  }
  const withEntry = lines.map((l) => ({ ...l, entry: entries.get(l.entryId) }));
  const balance = round2(lines.reduce((s, l) => s + l.debit - l.credit, 0));
  return { items: openItems(withEntry, acct, "receivable"), balance };
}

// Online methods (policy keys "card" / "ach") this lease accepts.
export function allowedOnlineMethods(policies) {
  const accepted = Array.isArray(policies?.paymentMethods) ? policies.paymentMethods : [];
  return Object.keys(ONLINE_METHODS).filter((m) => accepted.includes(m));
}

// Lease + tenant + policies + settings + balance for a payment.
// → { ok:true, lease, tenant, property, policies, settings, methods, acct, items, balance, projectId } | { ok:false, error, status }
export async function loadPaymentContext(admin, { projectId, leaseId, tenantId } = {}) {
  if (!admin) return { ok: false, status: 503, error: "SUPABASE_SERVICE_ROLE_KEY is not configured." };
  if (!leaseId) return { ok: false, status: 400, error: "A lease is required." };
  try {
    const lease = await one(admin, "leases", leaseId);
    if (!lease || (projectId && lease.project_id && lease.project_id !== projectId)) {
      return { ok: false, status: 404, error: "Lease not found." };
    }
    const pid = lease.project_id || projectId || null;
    let tenantRowId = tenantId || lease.tenant_id || null;
    if (tenantId && lease.tenant_id && tenantId !== lease.tenant_id) {
      const { data: party } = await admin
        .from("lease_parties")
        .select("id")
        .eq("lease_id", leaseId)
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
        .limit(1);
      if (!party?.length) return { ok: false, status: 403, error: "This tenant isn't on the lease." };
      tenantRowId = tenantId;
    }
    const [tenant, property, company, settings, acct] = await Promise.all([
      one(admin, "tenants", tenantRowId),
      one(admin, "properties", lease.property_id),
      readSetting(admin, pid, "fees_policies"),
      readPaymentSettings(admin, pid),
      loadAccountIndex(admin, pid),
    ]);
    const policies = effectivePolicies({ company: company || {}, property, lease });
    const { items, balance } = await leaseReceivable(admin, pid, leaseId, acct);
    return {
      ok: true,
      projectId: pid,
      lease,
      tenant,
      property,
      policies,
      settings,
      methods: allowedOnlineMethods(policies),
      acct,
      items,
      balance,
    };
  } catch (e) {
    console.error("[payments.context]", e);
    return { ok: false, status: 500, error: "Couldn't load the lease for payment." };
  }
}

const usd = (n) => `$${round2(n).toFixed(2)}`;

// Convenience fee per online method for `amount` (0 when fees aren't passed on).
export function quoteFees(ctx, amount) {
  const pass = ctx?.settings?.passFees !== false;
  const p = ctx?.policies || {};
  return {
    card: pass ? round2((round2(amount) * (Number(p.cardFeePct) || 0)) / 100) : 0,
    ach: pass ? round2(Number(p.achFee) || 0) : 0,
  };
}

// Policy gate for an online payment → { ok:true } | { ok:false, error }.
// `method` ("card" | "ach") is optional; amount is skipped for autopay setup.
export function assessPayment(ctx, { amount, method, setupOnly = false } = {}) {
  const deny = (error) => ({ ok: false, status: 409, error });
  const { lease, tenant, policies, settings, methods, balance } = ctx;
  const lm = meta(lease);
  const tm = meta(tenant);
  if (settings.enabled === false) return deny("Online payments are turned off.");
  if (!methods.length) return deny("This lease doesn't accept card or bank payments online.");
  if (method && !methods.includes(method)) return deny(`${ONLINE_METHODS[method]?.label || method} payments aren't accepted for this lease.`);
  if (policies.blockAfterEviction !== false && (lm.evictionActive || String(lease.status).toLowerCase() === "eviction")) {
    return deny("Online payments are blocked while an eviction is in progress. Contact the office.");
  }
  if (tm.restrictNoOnline) return deny("Online payments aren't available for this resident. Contact the office.");
  if (policies.certifiedFundsOnly || tm.restrictCertifiedOnly) {
    return deny("Only certified funds (cashier's check or money order) are accepted for this lease.");
  }
  if (setupOnly) return { ok: true };
  const amt = round2(amount);
  if (!(amt > 0)) return deny("Enter an amount greater than zero.");
  const max = Number(settings.maxPaymentAmount) || 0;
  if (max > 0 && amt > max) return deny(`Online payments are limited to ${usd(max)}.`);
  const noPartial = policies.allowPartialPayments === false || tm.restrictNoPartial;
  if (noPartial && balance > 0 && amt + 0.005 < balance) {
    return deny(`Partial payments aren't accepted — pay the full balance of ${usd(balance)}.`);
  }
  return { ok: true };
}

// Tenant display name + email for receipts and Stripe customers.
export function payerOf(ctx, payerEmail) {
  const t = ctx.tenant || {};
  return {
    name: t.name || ctx.lease?.tenant_name || "",
    email: payerEmail || t.email || "",
  };
}
