import { buildMergeValues } from "./context";
import { renderMerge } from "./merge_fields";
import { DELIVERY_STATUS, deliver } from "./deliver";
import {
  appendThreadMessage,
  findOrCreateThread,
  getThread,
  loadParty,
  logActivity,
  logCommunication,
} from "./threads";

// Server-only: merge a message (optionally from a template) with real record
// data, deliver it, and record it in the party's inbox thread plus the tenant
// communication log. Shared by /api/messages/send and the automation runner.

export async function loadTemplate(db, id) {
  if (!db || !id) return null;
  try {
    const { data, error } = await db.from("message_templates").select("*").eq("id", id).maybeSingle();
    if (error || !data || data.deleted_at) return null;
    return data;
  } catch {
    return null;
  }
}

const PARTY_OWNER_TYPE = { tenant: "tenant", owner: "owner", vendor: "vendor", prospect: "prospect" };

// Merge refs for a party plus any explicit record links.
function refsFor(projectId, party, extra = {}) {
  return {
    projectId,
    tenantId: party?.type === "tenant" ? party.id : extra.tenantId,
    ownerId: party?.type === "owner" ? party.id : extra.ownerId,
    vendorId: party?.type === "vendor" ? party.id : extra.vendorId,
    leaseId: extra.leaseId || party?.leaseId || undefined,
    unitId: extra.unitId || party?.unitId || undefined,
    propertyId: extra.propertyId || party?.propertyId || undefined,
  };
}

export async function sendPartyMessage({
  db,
  projectId,
  actor,
  party,
  thread: existingThread,
  channel = "email",
  subject = "",
  body = "",
  templateId,
  refs = {},
  notification = "message",
  direction = "outbound",
  toAddress,
  metadata = {},
  skipThread = false,
}) {
  const template = templateId ? await loadTemplate(db, templateId) : null;
  const ch = String(channel || template?.channel || "email").toLowerCase();
  const rawSubject = subject || template?.subject || "";
  const rawBody = body || template?.body || "";
  if (!rawBody.trim()) return { ok: false, error: "The message is empty." };

  const { values } = await buildMergeValues(db, refsFor(projectId, party, refs), { recipientName: party?.name });
  const finalSubject = renderMerge(rawSubject, values, { keepMissing: false }).trim();
  const finalBody = renderMerge(rawBody, values, { keepMissing: false });

  const isNote = ch === "note" || direction === "internal";
  const address = toAddress || (ch === "sms" ? party?.phone : party?.email) || "";
  const result = isNote
    ? { status: DELIVERY_STATUS.logged }
    : await deliver({
        db,
        projectId,
        channel: ch,
        to: address,
        recipientName: party?.name,
        subject: finalSubject || "A message from your property team",
        body: finalBody,
        notification,
      });

  const thread = skipThread
    ? null
    : existingThread ||
    (await findOrCreateThread(db, { projectId, party, subject: finalSubject, channel: ch === "note" ? "email" : ch, actorId: actor?.id }));
  const message = thread
    ? await appendThreadMessage(db, thread, {
        direction: isNote ? "internal" : "outbound",
        channel: ch,
        fromName: actor?.name || "",
        fromAddress: actor?.email || "",
        toAddress: address,
        subject: finalSubject,
        body: finalBody,
        deliveryStatus: result.status,
        deliveryError: result.error,
        providerId: result.providerId,
        templateId: template?.id || null,
        actorId: actor?.id,
        metadata,
      })
    : null;

  if (!isNote && party?.type === "tenant") {
    await logCommunication(db, {
      projectId,
      tenantId: party.id,
      channel: ch,
      direction: "outbound",
      subject: finalSubject,
      body: finalBody,
      actorId: actor?.id,
      metadata: { threadId: thread?.id || null, deliveryStatus: result.status, deliveryError: result.error || null },
    });
  }
  if (!isNote && party?.id && PARTY_OWNER_TYPE[party.type]) {
    await logActivity(db, {
      projectId,
      ownerType: PARTY_OWNER_TYPE[party.type],
      ownerId: party.id,
      verb: "message",
      summary: `${ch === "sms" ? "SMS" : "Email"} "${finalSubject || "Message"}" — ${result.status.replace("_", " ")}`,
      actorId: actor?.id,
      actorName: actor?.name,
    });
  }

  return {
    ok: result.status !== DELIVERY_STATUS.failed,
    status: result.status,
    error: result.error || null,
    threadId: thread?.id || null,
    messageId: message?.id || null,
    subject: finalSubject,
    body: finalBody,
  };
}

// Route entry: resolve the party from a thread or a { type, id } recipient.
export async function sendStaffMessage({ db, projectId, actor, input = {} }) {
  let thread = null;
  let party = null;
  if (input.threadId) {
    thread = await getThread(db, input.threadId);
    if (!thread) return { ok: false, error: "Conversation not found." };
    party = (await loadParty(db, thread.party_type, thread.party_id)) || {
      type: thread.party_type,
      id: thread.party_id,
      name: thread.party_name,
      email: thread.party_email,
      phone: thread.party_phone,
      leaseId: thread.lease_id,
      propertyId: thread.property_id,
      unitId: thread.unit_id,
    };
  } else if (input.recipient?.type && input.recipient?.id) {
    party = await loadParty(db, input.recipient.type, input.recipient.id);
    if (!party) return { ok: false, error: "Recipient not found." };
  } else if (input.recipient?.email) {
    party = { type: "other", id: null, name: input.recipient.name || input.recipient.email, email: input.recipient.email };
  } else {
    return { ok: false, error: "Choose who the message is for." };
  }

  return sendPartyMessage({
    db,
    projectId,
    actor,
    party,
    thread,
    channel: input.channel,
    subject: input.subject,
    body: input.body,
    templateId: input.templateId,
    refs: { leaseId: input.leaseId || thread?.lease_id, propertyId: input.propertyId || thread?.property_id },
    direction: input.channel === "note" ? "internal" : "outbound",
  });
}
