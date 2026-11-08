import { createClient } from "./client";
import { isSupabaseConfigured } from "@/supabase/components/property-client";
import { scopeQuery } from "./scope";

// Browser reads for payment plans (CORE-14; owns nothing it writes — plans change only through /api/billing/payment-plans).
// Pure: null on failure, never throws or toasts.

// Active plans per lease with what each still defers (ledger_party_balances.deferred_receivable) → Map leaseId → { id, name, deferred }.
export async function activePlansByLease() {
  if (!isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const [plans, balances] = await Promise.all([
      scopeQuery(sb.from("lease_payment_plans").select("id, lease_id, name")).eq("status", "Active").is("deleted_at", null),
      scopeQuery(sb.from("ledger_party_balances").select("dimension_id, deferred_receivable")).eq("dimension", "lease").neq("deferred_receivable", 0),
    ]);
    if (plans.error) throw plans.error;
    if (balances.error) throw balances.error;
    const deferred = new Map((balances.data || []).map((b) => [b.dimension_id, Math.round(Number(b.deferred_receivable) * 100) / 100]));
    return new Map((plans.data || []).map((p) => [p.lease_id, { id: p.id, name: p.name || "Payment plan", deferred: deferred.get(p.lease_id) || 0 }]));
  } catch (e) {
    console.error("[payment_plans.active]", e?.message || e);
    return null;
  }
}
