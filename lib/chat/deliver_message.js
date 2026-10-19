"use client";

import { ME } from "./people_store";
import { registerAttachments, uploadAttachments } from "./attachments";
import { sendMessage } from "@/lib/supabase/chat_messages";
import { notifyPeople } from "@/lib/supabase/chat_notifications";

// Persist one message the screen has already shown optimistically: upload its
// files, insert the row (reusing the optimistic id), register the files against
// it and notify anyone @mentioned. Returns { saved, failedUploads }; saved is
// null when the insert failed.
export async function deliverMessage({ projectId, conversation, threadId = null, id, text, files = [], optimistic = [], replyTo = null, mentions = [] }) {
  const attachments = files.length ? await uploadAttachments(files, { projectId, ownerId: ME.id, optimistic }) : [];
  const saved = await sendMessage({
    id,
    conversationId: conversation.id,
    authorId: ME.id,
    text,
    threadId,
    replyTo,
    mentions,
    attachments,
  });
  if (!saved) return { saved: null, failedUploads: files.length - attachments.length };

  if (attachments.length) {
    await registerAttachments(attachments, { projectId, conversationId: conversation.id, messageId: saved.id, ownerId: ME.id });
  }

  const others = mentions.filter((pid) => pid !== ME.id && (conversation.memberIds || []).includes(pid));
  if (others.length) {
    notifyPeople(others, {
      projectId,
      type: "mention",
      title: conversation.type === "channel" ? `${ME.name} mentioned you in #${conversation.name}` : `${ME.name} mentioned you`,
      body: text.length > 160 ? `${text.slice(0, 157)}…` : text,
      actorId: ME.id,
      conversationId: conversation.id,
      messageId: saved.id,
      meta: { conversationType: conversation.type, ...(threadId ? { threadId } : {}) },
    });
  }
  return { saved, failedUploads: files.length - attachments.length };
}
