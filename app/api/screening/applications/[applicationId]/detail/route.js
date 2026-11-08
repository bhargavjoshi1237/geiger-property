import { jsonError, readJson, requireStaff } from "@/lib/auth/staff";
import { staffCan } from "@/lib/auth/permissions";
import { moduleEnabled } from "@/lib/modules";
import { logScreeningAccess, storeFingerprints } from "@/lib/screening/protect";
import { SCREENING_CHECK_KEYS, loadParties, loadScreeningDetail, saveScreeningDetail } from "@/lib/screening/detail_server";
import { IDENTITY_KEYS, ORDER_KEYS, PRIMARY, cleanDetailPatch, isDetailScope } from "@/lib/screening/sensitive";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_STORE = { "Cache-Control": "no-store" };
const DENIED = "Your role can't open identity details or screening findings.";

// An application's protected detail (RISK-02): identity and disclosures (scope identity), the report reference and findings
// (scope report). Only property.screening.view_reports holders; every read is written to the screening access log first.

async function findApplication(auth, applicationId) {
  const { data, error } = await auth.scoped("applications").select("id, name, email, phone").eq("id", applicationId).is("deleted_at", null).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

// GET ?projectId=&scope=identity|report
export async function GET(request, { params }) {
  const { applicationId } = await params;
  const projectId = request.nextUrl.searchParams.get("projectId");
  const scope = request.nextUrl.searchParams.get("scope") || "identity";
  const auth = await requireStaff(request, projectId, { permission: "property.screening.view_reports", denied: DENIED });
  if (!auth.ok) return jsonError(auth.status, auth.error);
  if (!UUID.test(String(applicationId))) return jsonError(400, "applicationId isn't valid.");
  if (!isDetailScope(scope)) return jsonError(400, "scope must be identity or report.");
  if (!auth.admin) return jsonError(503, "Protected screening data needs the server's service role.");
  try {
    if (!(await moduleEnabled(auth.db, projectId, "leasing"))) return jsonError(404, "Leasing & screening is switched off for this project.");
    if (!(await findApplication(auth, applicationId))) return jsonError(404, "Application not found.");
    await logScreeningAccess(auth.admin, { projectId, actor: auth.user, applicationId, objectType: scope, objectId: applicationId, action: "view", request });
    const detail = await loadScreeningDetail(auth.admin, projectId, applicationId, scope);
    return Response.json({ ok: true, scope, detail }, { headers: NO_STORE });
  } catch (e) {
    console.error("[screening.detail]", e?.message || e);
    return jsonError(500, "Couldn't load the protected details.");
  }
}

// PATCH { projectId, partyRef: "primary" | co-applicant id, patch } — findings and the report reference also need screening.order.
export async function PATCH(request, { params }) {
  const { applicationId } = await params;
  const body = await readJson(request);
  const projectId = body.projectId;
  const auth = await requireStaff(request, projectId, { permission: "property.screening.view_reports", denied: DENIED });
  if (!auth.ok) return jsonError(auth.status, auth.error);
  if (!UUID.test(String(applicationId))) return jsonError(400, "applicationId isn't valid.");
  const partyRef = body.partyRef || PRIMARY;
  const party = partyRef !== PRIMARY;
  if (party && !UUID.test(String(partyRef))) return jsonError(400, "partyRef isn't valid.");
  const clean = cleanDetailPatch(body.patch, { party, checks: SCREENING_CHECK_KEYS });
  if (clean.error) return jsonError(400, clean.error);
  const keys = Object.keys(clean.patch);
  if (keys.some((k) => ORDER_KEYS.includes(k)) && !(await staffCan(auth, "property.screening.order"))) {
    return jsonError(403, "Your role can't record screening findings.");
  }
  if (!auth.admin) return jsonError(503, "Protected screening data needs the server's service role.");
  try {
    if (!(await moduleEnabled(auth.db, projectId, "leasing"))) return jsonError(404, "Leasing & screening is switched off for this project.");
    const app = await findApplication(auth, applicationId);
    if (!app) return jsonError(404, "Application not found.");
    const parties = await loadParties(auth.admin, projectId, applicationId);
    if (party && !parties.has(partyRef)) return jsonError(404, "Co-applicant not found.");
    const saved = await saveScreeningDetail(auth.admin, { projectId, applicationId, partyRef, patch: clean.patch, actor: auth.user });
    // Duplicate-check fingerprints when identity changes (best effort): contact details, and date of birth with the name.
    if (keys.some((k) => IDENTITY_KEYS.includes(k))) {
      const who = party ? parties.get(partyRef) : app;
      try {
        await storeFingerprints(auth.admin, {
          projectId,
          applicationId,
          partyRef,
          actorId: auth.user.id,
          values: { email: who.email, phone: who.phone, dob_name: { dob: saved.dateOfBirth, name: who.name } },
        });
      } catch (e) {
        console.error("[screening.fingerprints]", e?.message || e);
      }
    }
    return Response.json({ ok: true, partyRef, saved: clean.patch }, { headers: NO_STORE });
  } catch (e) {
    console.error("[screening.detail.save]", e?.message || e);
    return jsonError(500, "Couldn't save the protected details.");
  }
}
