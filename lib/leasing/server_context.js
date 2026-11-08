import "server-only";

import { effectivePolicies } from "@/lib/policies";
import { forProject } from "@/lib/supabase/scope";
import { leasesLayer } from "@/lib/supabase/leases";
import { leasePartiesLayer } from "@/lib/supabase/lease_parties";
import { recurringChargesLayer } from "@/lib/supabase/recurring_charges";
import { leaseTemplatesLayer } from "@/lib/supabase/lease_templates";
import { leaseAddendaLayer } from "@/lib/supabase/lease_addenda";
import { normalizeTenant } from "@/lib/supabase/tenants";
import { normalizeUnit } from "@/lib/supabase/units";
import { normalizeProperty } from "@/lib/supabase/properties";

// Server twin of loadLeaseContext (lib/leasing/workflows.js) for routes, jobs and webhooks (LEAS-08): the same output through a
// service-role (or caller) client, every read scoped to the project and filtered to live rows. Throws on a read error.

function rows(res, what) {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data || [];
}

async function one(db, table, id, projectId) {
  if (!id) return null;
  const found = rows(await forProject(db.from(table).select("*"), projectId).eq("id", id).is("deleted_at", null).limit(1), table);
  return found[0] || null;
}

async function setting(db, projectId, key) {
  const found = rows(await forProject(db.from("settings").select("value"), projectId).eq("key", key).is("deleted_at", null).limit(1), key);
  return found[0]?.value || {};
}

// loadLeaseContextServer(db, leaseId, { projectId }) → { lease, tenant, unit, property, parties, charges, rentSteps, company, policies } | null.
export async function loadLeaseContextServer(db, leaseId, { projectId } = {}) {
  const leaseRow = await one(db, "leases", leaseId, projectId);
  if (!leaseRow) return null;
  const lease = leasesLayer.normalize(leaseRow);
  const [tenant, unit, property, parties, charges, rentSteps, fees, profile] = await Promise.all([
    one(db, "tenants", lease.tenantId, projectId),
    one(db, "units", lease.unitId, projectId),
    one(db, "properties", lease.propertyId, projectId),
    forProject(db.from("lease_parties").select("*"), projectId).eq("lease_id", lease.id).is("deleted_at", null).order("created_at", { ascending: true }),
    forProject(db.from("recurring_charges").select("*"), projectId).eq("lease_id", lease.id).is("deleted_at", null).order("created_at", { ascending: false }),
    forProject(db.from("lease_rent_steps").select("*"), projectId).eq("lease_id", lease.id).eq("status", "active").is("deleted_at", null).order("effective_date", { ascending: true }),
    setting(db, projectId, "fees_policies"),
    setting(db, projectId, "company_profile"),
  ]);
  const prop = normalizeProperty(property);
  return {
    lease,
    tenant: normalizeTenant(tenant),
    unit: normalizeUnit(unit),
    property: prop,
    parties: rows(parties, "lease parties").map(leasePartiesLayer.normalize),
    charges: rows(charges, "recurring charges").map(recurringChargesLayer.normalize),
    rentSteps: rows(rentSteps, "rent steps"),
    company: profile || {},
    policies: effectivePolicies({ company: fees || {}, property: prop, lease }),
  };
}

// A lease template (normalized) in the project, or null.
export async function loadTemplateServer(db, templateId, { projectId } = {}) {
  return leaseTemplatesLayer.normalize(await one(db, "lease_templates", templateId, projectId));
}

// The lease's live addenda (normalized), oldest first.
export async function loadAddendaServer(db, leaseId, { projectId } = {}) {
  const res = await forProject(db.from("lease_addenda").select("*"), projectId).eq("lease_id", leaseId).is("deleted_at", null).order("created_at", { ascending: true });
  return rows(res, "lease addenda").map(leaseAddendaLayer.normalize);
}
