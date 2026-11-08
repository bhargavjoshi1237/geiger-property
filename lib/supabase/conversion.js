import { createClient } from "./client";
import { isSupabaseConfigured } from "@/supabase/components/property-client";
import { makeEntityData } from "./entity_factory";
import { scopeQuery, stampProject } from "./scope";
import { normalizeConversionLine } from "@/lib/ledger/conversion";

// Data layer for opening balances (INTL-04): conversion_batches and conversion_lines; browsers edit Draft, unposted rows only (conversion_guard), posting is server-side.

export const conversionBatchesLayer = makeEntityData({
  table: "conversion_batches",
  tag: "conversionBatches",
  fields: [
    { key: "name", col: "name", type: "text" },
    { key: "cutoverDate", col: "cutover_date", type: "date" },
    { key: "status", col: "status", type: "text", default: "Draft" },
    { key: "totals", col: "totals", type: "text", default: {} },
    { key: "postedAt", col: "posted_at", type: "date" },
    { key: "postedBy", col: "posted_by", type: "uuid" },
  ],
});

const TABLE = "conversion_lines";
const CHUNK = 200;
const nullable = (v) => (v === "" || v === undefined ? null : v);

function lineRow(batchId, line) {
  return stampProject({
    id: line.id,
    batch_id: batchId,
    kind: line.kind,
    property_id: nullable(line.propertyId),
    unit_id: nullable(line.unitId),
    lease_id: nullable(line.leaseId),
    tenant_id: nullable(line.tenantId),
    owner_id: nullable(line.ownerId),
    vendor_id: nullable(line.vendorId),
    bank_account_id: nullable(line.bankAccountId),
    gl_account_id: nullable(line.glAccountId),
    item_date: nullable(line.itemDate),
    amount: Number(line.amount) || 0,
    memo: line.memo || null,
    ref: line.ref || null,
    metadata: line.metadata && typeof line.metadata === "object" ? line.metadata : {},
  });
}

// A batch's live lines as view models (null when the read fails).
export async function listConversionLines(batchId) {
  if (!batchId || !isSupabaseConfigured()) return null;
  try {
    const out = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await scopeQuery(createClient().from(TABLE).select("*").eq("batch_id", batchId).is("deleted_at", null).order("created_at").order("id").range(from, from + 999));
      if (error) {
        console.error("[conversion.lines]", error.message);
        return null;
      }
      out.push(...(data || []).map(normalizeConversionLine));
      if (!data || data.length < 1000) return out;
    }
  } catch (e) {
    console.error("[conversion.lines]", e);
    return null;
  }
}

// Upsert edited lines of a Draft batch (lines already on the ledger are skipped) → true / false.
export async function saveConversionLines(batchId, lines) {
  if (!batchId || !isSupabaseConfigured()) return false;
  const rows = (lines || []).filter((l) => !l.postedEntryId).map((l) => lineRow(batchId, l));
  try {
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error } = await createClient().from(TABLE).upsert(rows.slice(i, i + CHUNK), { onConflict: "id" });
      if (error) {
        console.error("[conversion.save]", error.message);
        return false;
      }
    }
    return true;
  } catch (e) {
    console.error("[conversion.save]", e);
    return false;
  }
}

// Soft-delete removed lines → true / false.
export async function removeConversionLines(ids) {
  const list = (ids || []).filter(Boolean);
  if (!list.length) return true;
  if (!isSupabaseConfigured()) return false;
  try {
    for (let i = 0; i < list.length; i += CHUNK) {
      const { error } = await createClient().from(TABLE).update({ deleted_at: new Date().toISOString() }).in("id", list.slice(i, i + CHUNK));
      if (error) {
        console.error("[conversion.remove]", error.message);
        return false;
      }
    }
    return true;
  } catch (e) {
    console.error("[conversion.remove]", e);
    return false;
  }
}
