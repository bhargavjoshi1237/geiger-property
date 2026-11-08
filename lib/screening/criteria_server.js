import "server-only";
import { forProject } from "@/lib/supabase/scope";
import { criteriaHash, resolveScreeningCriteria, screeningCriteriaValues } from "./criteria_policy";

// Server reads of the screening criteria (RISK-04) for the engine, fee rules and providers (RISK-05/06/10/12).
// `db` is a server client (service role or the caller's); every read is scoped to the project; failures throw.

// The criteria in force at a property (none: company only) → { resolved, values, hash }.
export async function loadScreeningCriteriaFor(db, { projectId, propertyId = null } = {}) {
  const settings = await forProject(
    db.from("settings").select("key, value").in("key", ["fees_policies", "screening_criteria"]).is("deleted_at", null),
    projectId,
  );
  if (settings.error) throw new Error(`screening criteria settings: ${settings.error.message}`);
  const setting = (key) => (settings.data || []).find((r) => r.key === key)?.value || {};
  let property = null;
  if (propertyId) {
    const res = await forProject(db.from("properties").select("id, metadata").eq("id", propertyId).is("deleted_at", null), projectId).maybeSingle();
    if (res.error) throw new Error(`screening criteria property: ${res.error.message}`);
    property = res.data;
  }
  const resolved = resolveScreeningCriteria({ company: setting("fees_policies"), legacy: setting("screening_criteria"), property });
  return { resolved, values: screeningCriteriaValues(resolved), hash: await criteriaHash(resolved) };
}

// An application's criteria: its property column, else its unit's property → { propertyId, resolved, values, hash }.
export async function loadApplicationCriteria(db, { projectId, applicationId }) {
  const app = await forProject(db.from("applications").select("id, property_id, unit_id").eq("id", applicationId).is("deleted_at", null), projectId).maybeSingle();
  if (app.error) throw new Error(`screening criteria application: ${app.error.message}`);
  if (!app.data) throw new Error("screening criteria: application not found");
  let propertyId = app.data.property_id || null;
  if (!propertyId && app.data.unit_id) {
    const unit = await forProject(db.from("units").select("property_id").eq("id", app.data.unit_id), projectId).maybeSingle();
    if (unit.error) throw new Error(`screening criteria unit: ${unit.error.message}`);
    propertyId = unit.data?.property_id || null;
  }
  return { propertyId, ...(await loadScreeningCriteriaFor(db, { projectId, propertyId })) };
}
