import { jsonError, readJson, requireStaff } from "@/lib/auth/staff";
import { billingError } from "@/lib/billing/http";
import { loadStatementSettings, saveStatementSettings } from "@/lib/billing/statements";

// GET ?projectId= / PATCH { projectId, statements } — billing_settings.statements (CORE-12): whether statements send on a day each
// month and who gets one. PATCH merges into billing_settings, so the other keys (e.g. jobsPaused) stay as stored.

export async function GET(request) {
  const projectId = request.nextUrl.searchParams.get("projectId");
  const auth = await requireStaff(request, projectId, { anyOf: ["property.rent.manage", "property.settings.manage", "property.accounting.view"] });
  if (!auth.ok) return jsonError(auth.status, auth.error);
  if (!auth.admin) return jsonError(503, "SUPABASE_SERVICE_ROLE_KEY isn't set, so settings can't load.");
  try {
    return Response.json({ ok: true, statements: await loadStatementSettings(auth.admin, projectId) });
  } catch (e) {
    return billingError(e, "Couldn't load the statement settings.");
  }
}

export async function PATCH(request) {
  const body = await readJson(request);
  const auth = await requireStaff(request, body.projectId, { permission: "property.rent.manage", denied: "Changing statement settings needs the rent and billing settings permission." });
  if (!auth.ok) return jsonError(auth.status, auth.error);
  if (!auth.admin) return jsonError(503, "SUPABASE_SERVICE_ROLE_KEY isn't set, so settings can't save.");
  try {
    const patch = body.statements && typeof body.statements === "object" ? body.statements : {};
    return Response.json({ ok: true, statements: await saveStatementSettings(auth.admin, body.projectId, patch) });
  } catch (e) {
    return billingError(e, "Couldn't save the statement settings.");
  }
}
