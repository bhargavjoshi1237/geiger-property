"use client";

import { createClient } from "./client";
import { schemaClient, isSupabaseConfigured } from "@/supabase/components/property-client";

// Data layer for property.chat_files plus the public `property-chat` storage
// bucket (<projectId>/<ownerId>/<timestamp>-<name>). The file row keeps the
// public URL and the storage path. Pure: console.error, return null / [] / false.

const TABLE = "chat_files";
const BUCKET = "property-chat";

const EXT_KIND = {
  pdf: "pdf",
  png: "image", jpg: "image", jpeg: "image", gif: "image", webp: "image", svg: "image", heic: "image",
  zip: "archive", rar: "archive", "7z": "archive", tar: "archive", gz: "archive",
  csv: "sheet", xls: "sheet", xlsx: "sheet",
  ppt: "slides", pptx: "slides", key: "slides",
};

// A filename's icon kind: pdf | image | archive | sheet | slides | doc.
export function fileKind(name = "") {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  return EXT_KIND[ext] || "doc";
}

export function normalizeFile(row) {
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.project_id,
    conversationId: row.conversation_id ?? null,
    messageId: row.message_id ?? null,
    ownerId: row.owner_id ?? null,
    name: row.name || "file",
    kind: row.kind || fileKind(row.name),
    size: Number(row.size_bytes ?? 0),
    contentType: row.content_type ?? "",
    url: row.url ?? "",
    storagePath: row.storage_path ?? "",
    createdAt: row.created_at,
  };
}

// Upload one File; returns { url, path } or null.
export async function uploadChatFile(file, { projectId, ownerId }) {
  if (!file || !projectId || !ownerId || !isSupabaseConfigured()) return null;
  try {
    const storage = createClient().storage.from(BUCKET);
    const safe = file.name.replace(/[^\w.-]+/g, "_");
    const path = `${projectId}/${ownerId}/${Date.now()}-${safe}`;
    const { error } = await storage.upload(path, file, { cacheControl: "3600", upsert: false });
    if (error) {
      console.error("[chat_files.upload]", error.message);
      return null;
    }
    const { data } = storage.getPublicUrl(path);
    return data?.publicUrl ? { url: data.publicUrl, path } : null;
  } catch (e) {
    console.error("[chat_files.upload]", e);
    return null;
  }
}

// Register uploaded files (after their message exists, so message_id resolves).
// `files`: [{ id, name, kind, size, contentType, url, path }].
export async function createFiles(files, { projectId, conversationId, messageId, ownerId }) {
  if (!files?.length || !projectId || !isSupabaseConfigured()) return [];
  try {
    const rows = files.map((f) => ({
      id: f.id,
      project_id: projectId,
      conversation_id: conversationId || null,
      message_id: messageId || null,
      owner_id: ownerId || null,
      name: f.name,
      kind: f.kind || fileKind(f.name),
      size_bytes: Number(f.size) || 0,
      content_type: f.contentType || null,
      url: f.url || null,
      storage_path: f.path || null,
    }));
    const { data, error } = await schemaClient().from(TABLE).insert(rows).select("*");
    if (error) {
      console.error("[chat_files.create]", error.message);
      return [];
    }
    return (data || []).map(normalizeFile);
  } catch (e) {
    console.error("[chat_files.create]", e);
    return [];
  }
}

// Every file shared in a project, newest first.
export async function listFiles(projectId) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[chat_files.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeFile);
  } catch (e) {
    console.error("[chat_files.list]", e);
    return null;
  }
}

export async function listFilesByConversation(conversationId) {
  if (!conversationId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .select("*")
      .eq("conversation_id", conversationId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[chat_files.listByConversation]", error.message);
      return null;
    }
    return (data || []).map(normalizeFile);
  } catch (e) {
    console.error("[chat_files.listByConversation]", e);
    return null;
  }
}

// Soft-delete the row, then best-effort remove the binary (only its uploader may).
export async function softDeleteFile(file) {
  if (!file?.id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient().from(TABLE).update({ deleted_at: new Date().toISOString() }).eq("id", file.id);
    if (error) {
      console.error("[chat_files.delete]", error.message);
      return false;
    }
    if (file.storagePath) {
      const { error: removeError } = await createClient().storage.from(BUCKET).remove([file.storagePath]);
      if (removeError) console.warn("[chat_files.delete.storage]", removeError.message);
    }
    return true;
  } catch (e) {
    console.error("[chat_files.delete]", e);
    return false;
  }
}
