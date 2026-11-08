import "server-only";

import { SCREENING_CHECKS } from "@/components/internal/screens/marketing/shared";
import { PRIMARY, detailView, mergeDetail } from "./sensitive";

// An application's protected detail (RISK-02): property.screening_details, read and written with the service role only.

export const SCREENING_CHECK_KEYS = SCREENING_CHECKS.map((c) => c.key);

// Every live stored row of one application: [{ party_ref, detail }].
export async function loadDetailRows(admin, projectId, applicationId) {
  const { data, error } = await admin
    .from("screening_details")
    .select("party_ref, detail")
    .eq("project_id", projectId)
    .eq("application_id", applicationId)
    .is("deleted_at", null);
  if (error) throw new Error(error.message);
  return data || [];
}

// { primary, parties } for one read scope (identity | report).
export const loadScreeningDetail = async (admin, projectId, applicationId, scope) => detailView(await loadDetailRows(admin, projectId, applicationId), scope);

// The application's co-applicants (record_items) → Map(id → { name, email, phone }).
export async function loadParties(admin, projectId, applicationId) {
  const { data, error } = await admin
    .from("record_items")
    .select("id, name, metadata")
    .eq("project_id", projectId)
    .eq("owner_type", "application")
    .eq("owner_id", applicationId)
    .eq("kind", "co_applicant")
    .is("deleted_at", null);
  if (error) throw new Error(error.message);
  return new Map((data || []).map((r) => [r.id, { name: r.name || "", email: r.metadata?.email || "", phone: r.metadata?.phone || "" }]));
}

// Apply a validated patch to one party's detail (read, merge, write) → the party's stored detail.
export async function saveScreeningDetail(admin, { projectId, applicationId, partyRef = PRIMARY, patch, actor }) {
  const cur = await admin
    .from("screening_details")
    .select("id, detail, metadata")
    .eq("project_id", projectId)
    .eq("application_id", applicationId)
    .eq("party_ref", partyRef)
    .is("deleted_at", null)
    .maybeSingle();
  if (cur.error) throw new Error(cur.error.message);
  const detail = mergeDetail(cur.data?.detail, patch);
  const metadata = { ...(cur.data?.metadata || {}), updatedBy: { id: actor?.id || null, name: actor?.name || "" }, updatedAt: new Date().toISOString() };
  const write = cur.data
    ? admin.from("screening_details").update({ detail, metadata }).eq("id", cur.data.id)
    : admin.from("screening_details").insert({ project_id: projectId, application_id: applicationId, party_ref: partyRef, detail, metadata, created_by: actor?.id || null });
  const { error } = await write;
  if (error) throw new Error(error.message);
  return detail;
}
