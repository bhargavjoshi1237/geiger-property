import { jsonError, requireStaff } from "@/lib/auth/staff";
import { projectToday } from "@/lib/jobs/business_date";
import { moduleEnabled } from "@/lib/modules";
import { loadPropertyScreeningRules } from "@/lib/screening/rules_server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// GET ?projectId=&propertyId=[&asOf=YYYY-MM-DD] — the screening rules at a property (RISK-05): { ok, property, jurisdiction,
// rules, effects, fields, ignored, asOf }. effects are the merged values; fields keep each value's sources. Not legal advice.

export async function GET(request) {
  const params = request.nextUrl.searchParams;
  const projectId = params.get("projectId");
  const auth = await requireStaff(request, projectId, {
    anyOf: ["property.screening.order", "property.screening.decide", "property.screening.criteria"],
    denied: "Your role can't see screening rules.",
  });
  if (!auth.ok) return jsonError(auth.status, auth.error);
  const propertyId = params.get("propertyId") || null;
  if (propertyId && !UUID.test(propertyId)) return jsonError(400, "propertyId isn't valid.");
  const asOfParam = params.get("asOf");
  if (asOfParam && !DATE.test(asOfParam)) return jsonError(400, "asOf must be a YYYY-MM-DD date.");
  try {
    if (!(await moduleEnabled(auth.db, projectId, "leasing"))) return jsonError(404, "Leasing & screening is switched off for this project.");
    const asOf = asOfParam || (await projectToday(auth.db, projectId));
    const { property, jurisdiction, rules, merged } = await loadPropertyScreeningRules(auth.db, { projectId, propertyId, asOf });
    return Response.json(
      { ok: true, property, jurisdiction, rules, effects: merged.values, fields: merged.fields, ignored: merged.ignored, asOf },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    if (e?.status === 404) return jsonError(404, e.message);
    console.error("[screening.rules]", e);
    return jsonError(500, "Couldn't load the screening rules.");
  }
}
