import { createClient } from "./client";
import { isSupabaseConfigured } from "@/supabase/components/property-client";

// createClient() already defaults to `db.schema: "property"` (see
// lib/supabase/client.js) — call it directly; do not use schemaClient().

// Data-access layer for the Tenant Communication Log (the "Communication Log"
// Tenants sub-item). Owns `property.tenant_communications`. Pure actions:
// validate, console.error on failure, return null / false / []. DB is
// snake_case; UI is camelCase.

const TABLE = "tenant_communications";

export function normalizeCommunication(row) {
  if (!row) return null;
  const meta =
    row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    id: row.id,
    tenantId: row.tenant_id ?? null,
    channel: row.channel ?? "email",
    direction: row.direction ?? "outbound",
    subject: row.subject ?? "",
    body: row.body ?? "",
    occurredAt: row.occurred_at ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    metadata: meta,
    ...meta,
  };
}

function toRow(input) {
  const row = {};
  const map = {
    tenantId: "tenant_id",
    channel: "channel",
    direction: "direction",
    subject: "subject",
    body: "body",
    createdBy: "created_by",
  };
  for (const [key, col] of Object.entries(map)) {
    if (key in input) row[col] = input[key];
  }
  if ("occurredAt" in input)
    row.occurred_at = input.occurredAt || new Date().toISOString();
  if ("metadata" in input && input.metadata && typeof input.metadata === "object")
    row.metadata = input.metadata;
  return row;
}

export async function listCommunications(tenantId) {
  if (!isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    let q = sb
      .from(TABLE)
      .select("*")
      .is("deleted_at", null)
      .order("occurred_at", { ascending: false });
    if (tenantId) q = q.eq("tenant_id", tenantId);
    const { data, error } = await q;
    if (error) {
      console.error("[comms.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeCommunication);
  } catch (e) {
    console.error("[comms.list]", e);
    return null;
  }
}

export async function createCommunication(input) {
  if (!isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const payload = toRow(input);
    if (input.id) payload.id = input.id;
    const { data, error } = await sb
      .from(TABLE)
      .insert(payload)
      .select("*")
      .single();
    if (error) {
      console.error("[comms.create]", error.message);
      return null;
    }
    return normalizeCommunication(data);
  } catch (e) {
    console.error("[comms.create]", e);
    return null;
  }
}

export async function updateCommunication(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const { data, error } = await sb
      .from(TABLE)
      .update(toRow(patch))
      .eq("id", id)
      .select("*")
      .single();
    if (error) {
      console.error("[comms.update]", error.message);
      return null;
    }
    return normalizeCommunication(data);
  } catch (e) {
    console.error("[comms.update]", e);
    return null;
  }
}

export async function softDeleteCommunication(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const sb = createClient();
    const { error } = await sb
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("[comms.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[comms.delete]", e);
    return false;
  }
}

export const communicationsData = {
  list: listCommunications,
  create: createCommunication,
  update: updateCommunication,
  softDelete: softDeleteCommunication,
  normalize: normalizeCommunication,
};
