"use client";

import { createClient } from "./client";
import { isSupabaseConfigured } from "@/supabase/components/property-client";
import { scopeQuery } from "./scope";

// Data-access layer for journal imports (CORE-46, owns reads of `property.journal_imports`; only the server routes write).
// Pure: null on failure, console.error, never throw or toast.

const TABLE = "journal_imports";

export function normalizeJournalImport(row) {
  if (!row) return null;
  const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    id: row.id,
    kind: row.kind ?? "journal",
    fileName: row.file_name ?? "",
    format: row.format ?? "",
    status: row.status ?? "preview",
    entryCount: Number(row.entry_count ?? 0),
    postedCount: Number(row.posted_count ?? 0),
    errors: Array.isArray(row.errors) ? row.errors : [],
    asOf: row.as_of ?? "",
    file: meta.file || null,
    result: meta.result || null,
    batchId: meta.batchId || "",
    postedBy: meta.postedBy || meta.previewedBy || "",
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

// The latest imports that got past a preview, newest first.
export async function listJournalImports({ limit = 8 } = {}) {
  if (!isSupabaseConfigured()) return null;
  try {
    const { data, error } = await scopeQuery(createClient().from(TABLE).select("id, kind, file_name, format, status, entry_count, posted_count, errors, as_of, created_at, updated_at, metadata->file, metadata->result, metadata->batchId, metadata->postedBy").is("deleted_at", null))
      .neq("status", "preview")
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return (data || []).map((r) => normalizeJournalImport({ ...r, metadata: { file: r.file, result: r.result, batchId: r.batchId, postedBy: r.postedBy } }));
  } catch (e) {
    console.error("[journal_imports.list]", e?.message || e);
    return null;
  }
}
