import { createClient } from "./client";
import { isSupabaseConfigured } from "@/supabase/components/property-client";
import { getActiveProjectId, scopeReference } from "./scope";
import { getUser } from "./user";
import { normalizeScreeningRule, toScreeningRuleRow } from "@/lib/screening/rules_schema";

// Data-access layer for Settings → Screening Rules (RISK-05). Owns `property.screening_rules`: the shared catalog
// (project_id null, read-only here; it ships as a seed) plus the active project's own rules from counsel, which need
// property.screening.criteria to write. Pure actions: console.error on failure, return null / [] / false.

const TABLE = "screening_rules";

// The shared catalog and this project's rules, every status.
export async function listScreeningRules() {
  if (!isSupabaseConfigured()) return null;
  try {
    const { data, error } = await scopeReference(
      createClient().from(TABLE).select("*").is("deleted_at", null).order("jurisdiction_code", { ascending: true }).order("title", { ascending: true }),
    );
    if (error) {
      console.error("[screeningRules.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeScreeningRule);
  } catch (e) {
    console.error("[screeningRules.list]", e);
    return null;
  }
}

// A project rule (caller-supplied id honoured); the database refuses roles without screening.criteria.
export async function createScreeningRule(input) {
  const projectId = getActiveProjectId();
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const user = await getUser();
    const payload = { ...toScreeningRuleRow(input), project_id: projectId, created_by: user?.id || null };
    if (input.id) payload.id = input.id;
    const { data, error } = await createClient().from(TABLE).insert(payload).select("*").single();
    if (error) {
      console.error("[screeningRules.create]", error.message);
      return null;
    }
    return normalizeScreeningRule(data);
  } catch (e) {
    console.error("[screeningRules.create]", e);
    return null;
  }
}

export async function updateScreeningRule(id, patch) {
  const projectId = getActiveProjectId();
  if (!id || !projectId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await createClient().from(TABLE).update(toScreeningRuleRow(patch)).eq("id", id).eq("project_id", projectId).select("*").single();
    if (error) {
      console.error("[screeningRules.update]", error.message);
      return null;
    }
    return normalizeScreeningRule(data);
  } catch (e) {
    console.error("[screeningRules.update]", e);
    return null;
  }
}

export async function softDeleteScreeningRule(id) {
  const projectId = getActiveProjectId();
  if (!id || !projectId || !isSupabaseConfigured()) return false;
  try {
    const { error } = await createClient().from(TABLE).update({ deleted_at: new Date().toISOString() }).eq("id", id).eq("project_id", projectId);
    if (error) {
      console.error("[screeningRules.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[screeningRules.delete]", e);
    return false;
  }
}
