import { meta } from "./context";

// Server-only: one Stripe customer per tenant, remembered in the tenant's
// metadata (stripeCustomerId) so payments, saved methods and autopay share it.

export async function findOrCreateCustomer(admin, stripe, { projectId, tenant, leaseId, email, name }) {
  const known = meta(tenant).stripeCustomerId;
  if (known) {
    try {
      const existing = await stripe.customers.retrieve(known);
      if (existing && !existing.deleted) {
        if (email && !existing.email) await stripe.customers.update(known, { email });
        return known;
      }
    } catch (e) {
      console.warn("[payments.customer] stored customer unusable, creating a new one:", e?.message);
    }
  }
  const customer = await stripe.customers.create({
    ...(email ? { email } : {}),
    ...(name ? { name } : {}),
    metadata: {
      app: "geiger-property",
      projectId: projectId || "",
      tenantId: tenant?.id || "",
      leaseId: leaseId || "",
    },
  });
  if (tenant?.id) {
    const { error } = await admin.rpc("merge_meta", {
      p_table: "tenants",
      p_id: tenant.id,
      p_patch: { stripeCustomerId: customer.id },
    });
    if (error) console.error("[payments.customer] couldn't remember the customer", error.message);
  }
  return customer.id;
}

// "Visa •••• 4242" / "Chase •••• 6789" for a Stripe PaymentMethod.
export function describePaymentMethod(pm) {
  if (!pm || typeof pm !== "object") return "";
  if (pm.card) return `${(pm.card.brand || "Card").replace(/^\w/, (c) => c.toUpperCase())} •••• ${pm.card.last4 || ""}`.trim();
  if (pm.us_bank_account) return `${pm.us_bank_account.bank_name || "Bank"} •••• ${pm.us_bank_account.last4 || ""}`.trim();
  return pm.type || "";
}
