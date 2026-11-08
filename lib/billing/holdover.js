import "server-only";
import { logActivity } from "@/lib/messaging/threads";
import { projectError } from "@/lib/jobs/contract";
import { forProject } from "@/lib/supabase/scope";
import { round2 } from "./periods";
import { activeSteps, billingWindow, leaseFacts } from "./rent";
import { addRentStep, loadRentSteps } from "./steps";
import { HOLDOVER_STATUSES, holdoverOf } from "./lease_end";

// Server-only holdover step of the billing job (CORE-02): a fixed lease past its term end with no accepted renewal rolls to month-to-month once (autoMonthToMonth) or is flagged "Holdover" (metadata.holdover) and keeps billing its current rent.

const CHUNK = 150;
const money = (n) => `$${round2(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Lease ids (of `ids`) with an accepted renewal: a renewal row marked Accepted, or a successor lease that bills.
async function renewedIds(admin, projectId, ids) {
  const out = new Set();
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const [renewals, successors] = await Promise.all([
      forProject(admin.from("renewals").select("lease_id").in("lease_id", chunk).eq("status", "Accepted").is("deleted_at", null), projectId),
      forProject(admin.from("leases").select("*").in("renewal_of_id", chunk).is("deleted_at", null), projectId),
    ]);
    if (renewals.error) throw new Error(`renewals: ${renewals.error.message}`);
    if (successors.error) throw new Error(`renewal leases: ${successors.error.message}`);
    for (const r of renewals.data || []) out.add(r.lease_id);
    for (const s of successors.data || []) if (billingWindow(s).billable) out.add(s.renewal_of_id);
  }
  return out;
}

const mergeMeta = async (admin, lease, patch) => {
  const { error } = await admin.rpc("merge_meta", { p_table: "leases", p_id: lease.id, p_patch: patch });
  if (error) throw new Error(`lease: ${error.message}`);
  lease.metadata = { ...(lease.metadata || {}), ...patch };
};

// Roll a holdover lease to month-to-month: the premium step first (so a refused one leaves the lease unchanged), then the status, once.
async function convert(admin, ctx, lease, h, { today, res }) {
  const l = leaseFacts(lease);
  if (h.premium > 0) {
    const steps = activeSteps((await loadRentSteps(admin, [l.id])).get(l.id) || []);
    if (!steps.some((s) => s.effectiveDate === h.since)) {
      const added = await addRentStep(admin, lease, { source: "mtm_premium", effectiveDate: h.since, premium: h.premium, note: "Month-to-month premium (holdover)" }, { ctx }).catch((e) => {
        // A concurrent run added it first (the unique step date).
        if (e.status !== 409 && !/already changes/.test(e.message)) throw e;
        return null;
      });
      // Months already billed from the premium date are trued up by the step.
      res.created += (added?.entries || []).filter((e) => e.created).length;
    }
  }
  const { data, error } = await forProject(admin.from("leases").update({ term_type: "mtm", status: "Month-to-month" }).eq("id", l.id), l.projectId)
    .eq("status", l.status)
    .or("term_type.is.null,term_type.neq.mtm")
    .select("id");
  if (error) throw new Error(`lease: ${error.message}`);
  if (!data?.length) return false;
  Object.assign(lease, { status: "Month-to-month", term_type: "mtm" });
  await mergeMeta(admin, lease, { mtmSince: h.since, mtmPremium: h.premium, holdover: null, autoMtmOn: today });
  const premium = h.premium > 0 ? ` with a ${money(h.premium)} premium` : "";
  await logActivity(admin, { projectId: l.projectId, ownerType: "lease", ownerId: l.id, verb: "action", summary: `Term ended ${h.termEnd} with no renewal — rolled to month-to-month from ${h.since}${premium}`, actorName: "Billing", metadata: { holdover: h } });
  return true;
}

// The billing job's holdover step for one project's billable leases (before charges and rent, so a premium bills in the same run) → { converted, flagged, cleared }.
export async function applyHoldovers(admin, ctx, projectId, leases, { today, res }) {
  const out = { converted: 0, flagged: 0, cleared: 0 };
  const candidates = leases.filter((l) => HOLDOVER_STATUSES.includes(l.status) && l.term_type !== "mtm" && l.term_end && l.term_end < today);
  const renewed = candidates.length ? await renewedIds(admin, projectId, candidates.map((l) => l.id)) : new Set();
  for (const lease of leases) {
    try {
      const flagged = lease.metadata?.holdover;
      const h = candidates.includes(lease) ? holdoverOf(lease, { today, policies: await ctx.policies(lease), renewed: renewed.has(lease.id) }) : null;
      if (!h) {
        // No longer holding over (renewed, rolled, ended): clear the flag.
        if (flagged) {
          await mergeMeta(admin, lease, { holdover: null });
          out.cleared += 1;
        }
        continue;
      }
      if (h.convert) {
        if (await convert(admin, ctx, lease, h, { today, res })) out.converted += 1;
        continue;
      }
      if (flagged?.since === h.since) continue;
      await mergeMeta(admin, lease, { holdover: { since: h.since, flaggedOn: today } });
      await logActivity(admin, { projectId, ownerType: "lease", ownerId: lease.id, verb: "action", summary: `Holdover — the term ended ${h.termEnd} with no renewal; rent keeps billing at the current rate`, actorName: "Billing", metadata: { holdover: h } });
      out.flagged += 1;
    } catch (e) {
      res.errors.push(projectError(projectId, `holdover ${lease.name || lease.id}: ${e.message}`));
    }
  }
  return out;
}
