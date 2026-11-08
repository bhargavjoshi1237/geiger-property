"use client";

import { createClient } from "./client";
import { isSupabaseConfigured } from "@/supabase/components/property-client";
import { scopeQuery } from "./scope";
import { getSetting } from "./settings";

// Data-access layer for data imports (PLAT-03; reads of `property.import_jobs` / `import_rows` — only /api/import writes).
// Pure: null on failure, console.error, never throw or toast.

export function normalizeImportJob(row) {
  if (!row) return null;
  const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    id: row.id,
    entity: row.entity || "",
    sourceSystem: row.source_system || "generic",
    fileName: row.file_name || "",
    file: row.bucket && row.storage_path ? { bucket: row.bucket, path: row.storage_path } : null,
    mapping: row.mapping || {},
    options: row.options || {},
    status: row.status || "uploaded",
    counts: row.counts || {},
    error: row.error || "",
    committedAt: row.committed_at || null,
    rolledBackAt: row.rolled_back_at || null,
    createdAt: row.created_at || null,
    createdByName: meta.createdByName || "",
    headers: Array.isArray(meta.headers) ? meta.headers : [],
    detected: meta.detected || null,
  };
}

export function normalizeImportRow(row) {
  return {
    id: row.id,
    rowNo: row.row_no,
    status: row.status,
    messages: Array.isArray(row.messages) ? row.messages : [],
    raw: row.raw || {},
    mapped: row.mapped || {},
    targetTable: row.target_table || "",
    targetId: row.target_id || "",
  };
}

// Import history, newest first.
export async function listImportJobs({ limit = 50 } = {}) {
  if (!isSupabaseConfigured()) return null;
  try {
    const { data, error } = await scopeQuery(createClient().from("import_jobs").select("*").is("deleted_at", null)).order("created_at", { ascending: false }).limit(limit);
    if (error) throw new Error(error.message);
    return (data || []).map(normalizeImportJob);
  } catch (e) {
    console.error("[import_jobs.list]", e?.message || e);
    return null;
  }
}

export async function getImportJob(id) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await scopeQuery(createClient().from("import_jobs").select("*").eq("id", id)).maybeSingle();
    if (error) throw new Error(error.message);
    return normalizeImportJob(data);
  } catch (e) {
    console.error("[import_jobs.get]", e?.message || e);
    return null;
  }
}

// One page of a job's rows (optionally one status), in file order.
export async function listImportRows(jobId, { status, from = 0, limit = 200 } = {}) {
  if (!jobId || !isSupabaseConfigured()) return null;
  try {
    let q = scopeQuery(createClient().from("import_rows").select("id, row_no, status, messages, raw, mapped, target_table, target_id", { count: "exact" }).eq("job_id", jobId));
    if (status) q = Array.isArray(status) ? q.in("status", status) : q.eq("status", status);
    const { data, count, error } = await q.order("row_no").range(from, from + limit - 1);
    if (error) throw new Error(error.message);
    return { rows: (data || []).map(normalizeImportRow), count: count ?? 0 };
  } catch (e) {
    console.error("[import_rows.list]", e?.message || e);
    return null;
  }
}

// Saved column mappings (settings key import_mappings), newest first.
export async function listImportMappings() {
  const value = await getSetting("import_mappings", { mappings: [] });
  if (value === null) return null;
  return Array.isArray(value?.mappings) ? value.mappings : [];
}
