import { emptyResult, projectError } from "./contract";
import { forProjectOrAll } from "@/lib/supabase/scope";
import { isStripeConfigured } from "@/lib/stripe/server";
import { chargeAutopayPlan } from "@/lib/payments/autopay";

// Autopay job (server-only): on each plan's charge day (business date) bill the lease's due rent, then charge the saved method for the open balance; idempotent per plan + month (`autopay:<plan>:<YYYY-MM>`).

const PAGE = 500;

async function runAutopay({ admin, now = new Date(), projectId = null }) {
  const res = emptyResult();
  const plans = [];
  for (let from = 0; ; from += PAGE) {
    const q = admin.from("autopay_plans").select("*").eq("status", "active").is("deleted_at", null).range(from, from + PAGE - 1);
    const { data, error } = await forProjectOrAll(q, projectId);
    if (error) throw new Error(error.message);
    plans.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  if (!plans.length) return res;
  if (!isStripeConfigured()) {
    res.skipped = plans.length;
    res.errors.push("Stripe isn't configured (STRIPE_SECRET_KEY) — autopay charges were skipped.");
    return res;
  }
  for (const plan of plans) {
    res.processed += 1;
    try {
      const out = await chargeAutopayPlan(admin, plan, { now });
      if (out.result === "created") res.created += 1;
      else if (out.result === "skipped") res.skipped += 1;
      else res.errors.push(projectError(plan.project_id, out.message || `autopay ${plan.id}: failed`));
    } catch (e) {
      res.errors.push(projectError(plan.project_id, `autopay ${plan.id}: ${e.message}`));
    }
  }
  return res;
}

export const autopayJob = {
  key: "autopay",
  label: "Autopay charges",
  description: "Charges each active autopay plan's saved card or bank account for the open lease balance on its charge day.",
  schedule: "0 8 * * *",
  run: runAutopay,
};

export const PAYMENTS_JOBS = [autopayJob];
