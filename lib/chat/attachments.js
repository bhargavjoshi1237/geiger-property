"use client";

import { fileKind, uploadChatFile, createFiles } from "@/lib/supabase/chat_files";

// Attachment helpers shared by the main composer and thread replies. Files are
// uploaded first, the message is inserted with their descriptors in metadata,
// then the chat_files rows are registered against the saved message.

// Pre-upload descriptors for the optimistic bubble; images get an object URL so
// the preview shows at once.
export function buildOptimisticAttachments(files = []) {
  return files.map((f) => {
    const kind = fileKind(f.name);
    return {
      id: crypto.randomUUID(),
      name: f.name,
      kind,
      size: f.size,
      contentType: f.type || "",
      url: kind === "image" ? URL.createObjectURL(f) : "",
      uploading: true,
    };
  });
}

// Upload to storage, reusing the optimistic ids. Returns persisted descriptors
// ({ id, name, kind, size, contentType, url, path }); failed uploads are dropped.
export async function uploadAttachments(files = [], { projectId, ownerId, optimistic = [] }) {
  const results = await Promise.all(
    files.map(async (f, i) => {
      const uploaded = await uploadChatFile(f, { projectId, ownerId });
      if (!uploaded) return null;
      return {
        id: optimistic[i]?.id || crypto.randomUUID(),
        name: f.name,
        kind: fileKind(f.name),
        size: f.size,
        contentType: f.type || "",
        url: uploaded.url,
        path: uploaded.path,
      };
    }),
  );
  return results.filter(Boolean);
}

export function registerAttachments(attachments, context) {
  return createFiles(attachments, context);
}

export function revokeOptimistic(optimistic = []) {
  for (const a of optimistic) {
    if (a?.url?.startsWith("blob:")) URL.revokeObjectURL(a.url);
  }
}
