import { jsonError, requireStaff } from "@/lib/auth/staff";
import { moduleEnabled } from "@/lib/modules";
import { loadScreeningReport } from "@/lib/screening/report";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET ?projectId= — an application's recorded screening report (RISK-03); only roles holding property.screening.view_reports.

export async function GET(request, { params }) {
  const { applicationId } = await params;
  const projectId = request.nextUrl.searchParams.get("projectId");
  const auth = await requireStaff(request, projectId, {
    permission: "property.screening.view_reports",
    denied: "Your role can't open screening reports.",
  });
  if (!auth.ok) return jsonError(auth.status, auth.error);
  if (!UUID.test(String(applicationId))) return jsonError(400, "applicationId isn't valid.");
  try {
    if (!(await moduleEnabled(auth.db, projectId, "leasing"))) return jsonError(404, "Leasing & screening is switched off for this project.");
    const report = await loadScreeningReport(auth.scoped, applicationId);
    if (!report) return jsonError(404, "Application not found.");
    return Response.json({ ok: true, report }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[screening.report]", e);
    return jsonError(500, "Couldn't load the screening report.");
  }
}
