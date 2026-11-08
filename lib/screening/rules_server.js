import "server-only";
import { forProject } from "@/lib/supabase/scope";
import { loadScreeningRules, mergeEffects, resolveJurisdiction, todayISO } from "./jurisdictions";

// Server reads of the screening rules in force at a property (RISK-05) for the API, the engine, notices and fee rules
// (RISK-06/07/10/13). `db` is a server client; property reads are scoped to the project; failures throw.

const propertyView = (p) => ({
  id: p.id,
  name: p.name || "",
  city: p.city || "",
  state: p.state || "",
  zip: p.zip || "",
  county: p.metadata?.county || "",
  screeningJurisdictionOverride: p.metadata?.screeningJurisdictionOverride || "",
});

// → { property, jurisdiction, rules, merged } for one property (null property: the federal rules only).
export async function loadPropertyScreeningRules(db, { projectId, propertyId = null, asOf = todayISO() } = {}) {
  let property = null;
  if (propertyId) {
    const res = await forProject(db.from("properties").select("id, name, city, state, zip, metadata").eq("id", propertyId).is("deleted_at", null), projectId).maybeSingle();
    if (res.error) throw new Error(`screening rules property: ${res.error.message}`);
    if (!res.data) {
      const e = new Error("Property not found.");
      e.status = 404;
      throw e;
    }
    property = propertyView(res.data);
  }
  const jurisdiction = resolveJurisdiction(property);
  const rules = await loadScreeningRules(db, jurisdiction.codes, { projectId, asOf });
  return { property, jurisdiction, rules, merged: mergeEffects(rules, { asOf }), asOf };
}

// An application's rules: its property column, else its unit's property.
export async function loadApplicationScreeningRules(db, { projectId, applicationId, asOf = todayISO() }) {
  const app = await forProject(db.from("applications").select("id, property_id, unit_id").eq("id", applicationId).is("deleted_at", null), projectId).maybeSingle();
  if (app.error) throw new Error(`screening rules application: ${app.error.message}`);
  if (!app.data) throw new Error("screening rules: application not found");
  let propertyId = app.data.property_id || null;
  if (!propertyId && app.data.unit_id) {
    const unit = await forProject(db.from("units").select("property_id").eq("id", app.data.unit_id), projectId).maybeSingle();
    if (unit.error) throw new Error(`screening rules unit: ${unit.error.message}`);
    propertyId = unit.data?.property_id || null;
  }
  return loadPropertyScreeningRules(db, { projectId, propertyId, asOf });
}
