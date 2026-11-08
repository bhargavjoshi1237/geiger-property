import { authorizeScheduler } from "@/lib/jobs/contract";
import { adminClient } from "@/lib/supabase/admin";
import { jsonError, readJson } from "@/lib/auth/staff";
import { appendThreadMessage, findOrCreateThread, getThread, logCommunication } from "@/lib/messaging/threads";
import { handleInboundIntake } from "@/lib/orchestration/intake";
import { recordOperatorEvent } from "@/lib/operator/events";
import { forProject } from "@/lib/supabase/scope";

// POST — inbound-reply webhook (stub, provider-agnostic). Not wired to a mail
// provider yet: point an inbound-email/SMS webhook (or a small adapter) here with
// `Authorization: Bearer ${INBOUND_EMAIL_SECRET}` and a normalized JSON body:
//   { threadId?, from: "a@b.com" | { email, name }, to?, cc?, subject?, text, channel?: "email"|"sms",
//     receivedAt?, messageId?, attachments?: [{ filename, contentType, contentBase64 }] }
// Mail to an intake address (maintenance+<projectId>@ / bills+<projectId>@) is filed by lib/orchestration/intake.js.
// The project comes from the mail, never the body (PLAT-01f): a thread (threadId, or a `reply+<threadId>@…` address in
// `to`/`cc`) or a project address (`<name>+<projectId>@…`). Inside that project the sender goes to their newest open
// thread → a tenant/owner/vendor/prospect with that email (new thread) → a new unlinked thread. Mail with neither is
// acknowledged (202, so providers stop retrying) and filed for operators only (envelope, no body: /operator), so a sender
// known in two workspaces never lands in the wrong one. Staff can also log inbound replies manually from the Inbox.

const UUIDS = /\+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})@/gi;

const addresses = (list) =>
  [list]
    .flat()
    .map((r) => (r && typeof r === "object" ? r.email || r.address || "" : String(r || "")))
    .filter(Boolean)
    .slice(0, 10);

// The operator record of unattributed mail: who sent it to which addresses, never the message body or attachments.
const unattributedEvent = (body, from, text) => ({
  kind: "inbound_unattributed",
  source: "messages/inbound",
  summary: "Inbound mail matched no thread or project address",
  detail: {
    from,
    to: addresses([body.to, body.cc]),
    subject: String(body.subject || "").slice(0, 200),
    messageId: body.messageId ? String(body.messageId).slice(0, 200) : null,
    receivedAt: body.receivedAt || null,
    chars: text.length,
  },
  dedupeKey: body.messageId ? `inbound:${String(body.messageId).slice(0, 200)}` : null,
});

async function partyByEmail(db, email, projectId) {
  for (const [type, table] of [["tenant", "tenants"], ["owner", "owners"], ["vendor", "vendors"], ["prospect", "prospects"]]) {
    const { data } = await forProject(db.from(table).select("*").ilike("email", email).is("deleted_at", null), projectId).limit(1);
    const r = data?.[0];
    if (r) {
      return {
        type,
        id: r.id,
        name: r.name || "",
        email: r.email,
        phone: r.phone || "",
        leaseId: r.lease_id || null,
        propertyId: r.property_id || null,
        unitId: r.unit_id || null,
        projectId: r.project_id,
      };
    }
  }
  return null;
}

// The thread or project the mail itself names: threadId, then each `+<uuid>@` address as a thread, else as a project.
async function mailTarget(db, body) {
  const thread = body.threadId ? await getThread(db, body.threadId) : null;
  if (thread?.project_id) return { thread, projectId: thread.project_id };
  const recipients = [body.to, body.cc].flat().map((r) => (r && typeof r === "object" ? r.email || r.address || "" : String(r || ""))).join(",");
  for (const [, id] of recipients.matchAll(UUIDS)) {
    const replyTo = await getThread(db, id);
    if (replyTo?.project_id) return { thread: replyTo, projectId: replyTo.project_id };
    const { data: project } = await db.schema("public").from("projects").select("id").eq("id", id).maybeSingle();
    if (project) return { thread: null, projectId: project.id };
  }
  return null;
}

export async function POST(request) {
  if (!authorizeScheduler(request.headers.get("authorization"), process.env.INBOUND_EMAIL_SECRET)) {
    return jsonError(401, "Unauthorized");
  }
  const db = adminClient();
  if (!db) return jsonError(503, "SUPABASE_SERVICE_ROLE_KEY is not configured.");

  const body = await readJson(request);
  const intake = await handleInboundIntake(adminClient({ source: "intake" }), body);
  if (intake) return intake.ok ? Response.json(intake) : jsonError(intake.status || 400, intake.error);

  const fromEmail = String(typeof body.from === "object" ? body.from?.email : body.from || "").trim().toLowerCase();
  const fromName = typeof body.from === "object" ? body.from?.name || "" : "";
  const text = String(body.text || "").trim();
  if (!fromEmail || !text) return jsonError(400, "from and text are required.");
  const channel = body.channel === "sms" ? "sms" : "email";

  const target = await mailTarget(db, body);
  if (!target) {
    await recordOperatorEvent(db, unattributedEvent(body, fromEmail, text));
    return Response.json({ ok: true, unattributed: true }, { status: 202 });
  }
  const { projectId } = target;
  let thread = target.thread;
  if (!thread) {
    const { data } = await forProject(
      db.from("message_threads").select("*").ilike("party_email", fromEmail).neq("status", "Closed").is("deleted_at", null),
      projectId,
    )
      .order("last_message_at", { ascending: false })
      .limit(1);
    thread = data?.[0] || null;
  }
  if (!thread) {
    const party = (await partyByEmail(db, fromEmail, projectId)) || { type: "other", id: null, name: fromName || fromEmail, email: fromEmail, projectId };
    thread = await findOrCreateThread(db, { projectId, party, subject: body.subject || "", channel });
  }
  if (!thread) return jsonError(500, "Couldn't record the message.");

  const message = await appendThreadMessage(db, thread, {
    direction: "inbound",
    channel,
    fromName: fromName || thread.party_name || "",
    fromAddress: fromEmail,
    toAddress: body.to || null,
    subject: body.subject || thread.subject || "",
    body: text,
    deliveryStatus: "received",
    sentAt: body.receivedAt || undefined,
    metadata: { source: "webhook" },
  });
  if (thread.party_type === "tenant" && thread.party_id) {
    await logCommunication(db, {
      projectId: thread.project_id,
      tenantId: thread.party_id,
      channel,
      direction: "inbound",
      subject: body.subject || thread.subject || "",
      body: text,
      metadata: { threadId: thread.id },
    });
  }
  return Response.json({ ok: true, threadId: thread.id, messageId: message?.id || null });
}
