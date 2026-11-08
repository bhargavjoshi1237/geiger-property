import { readJson } from "@/lib/auth/staff";
import { billingAccess, billingError, entryView } from "@/lib/billing/http";
import { billingWindow } from "@/lib/billing/rent";
import { fail, loadRentLedger } from "@/lib/billing/post";
import { loadLease } from "@/lib/billing/service";
import { copyListingSpecials, removeConcession, saveConcession } from "@/lib/billing/concessions_server";

// POST — a lease's concessions (CORE-05); body { projectId, action: "create" | "update" | "remove" | "copy_specials", concession?, concessionId?, listingId? }.
// A billing lease needs property.rent.manage (its credits post); a lease not billing yet, and copying its application's listing specials before rent posts, need property.lease.manage.

export async function POST(request, { params }) {
  const { leaseId } = await params;
  const { projectId, action = "create", concession, concessionId, listingId } = await readJson(request);
  const gate = await billingAccess(request, projectId, ["property.rent.manage", "property.lease.manage"], "Your role can't change concessions.");
  if (gate.response) return gate.response;
  try {
    const lease = await loadLease(gate.admin, leaseId, projectId);
    const opts = { actor: gate.auth.user };
    if (action === "copy_specials") {
      // Only the listing the lease was converted from; once rent has posted, adding credits needs rent.manage.
      const appId = lease.metadata?.applicationId;
      const app = appId ? (await gate.admin.from("applications").select("listing_id, project_id").eq("id", appId).maybeSingle()).data : null;
      if (!app || app.project_id !== projectId || app.listing_id !== listingId) throw fail("This lease wasn't converted from an application on that listing.");
      const billed = (await loadRentLedger(gate.admin, projectId, [lease.id])).get(lease.id);
      if (billed?.size && !gate.can("property.rent.manage")) throw fail("This lease already bills rent, so adding concessions needs the rent-management permission.", 403);
      const res = await copyListingSpecials(gate.admin, lease, listingId, opts);
      return Response.json({ ok: true, created: res.created.map((r) => ({ id: r.id, name: r.name })), skipped: res.skipped });
    }
    if (billingWindow(lease).billable && !gate.can("property.rent.manage")) throw fail("This lease is billing, so changing its concessions needs the rent-management permission.", 403);
    if (action === "remove") {
      const res = await removeConcession(gate.admin, lease, concessionId, opts);
      return Response.json({ ok: true, entries: entryView(res.entries) });
    }
    if (action === "create" || action === "update") {
      const res = await saveConcession(gate.admin, lease, concession || {}, { ...opts, id: action === "update" ? concessionId : null });
      return Response.json({ ok: true, concession: res.concession, entries: entryView(res.entries) });
    }
    return billingError({ message: `Unknown action "${action}".` });
  } catch (e) {
    return billingError(e, "Couldn't save the concession.");
  }
}
