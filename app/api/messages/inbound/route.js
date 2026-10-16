import { authorizeScheduler } from "@/lib/jobs/contract";
import { adminClient } from "@/lib/supabase/admin";
import { jsonError, readJson } from "@/lib/messaging/auth";
import { appendThreadMessage, findOrCreateThread, getThread, logCommunication } from "@/lib/messaging/threads";

// POST — inbound-reply webhook (stub, provider-agnostic). Not wired to a mail
// provider yet: point an inbound-email/SMS webhook (or a small adapter) here with
// `Authorization: Bearer ${INBOUND_EMAIL_SECRET}` and a normalized JSON body:
//   { projectId?, threadId?, from: "a@b.com" | { email, name }, to?, subject?, text, channel?: "email"|"sms", receivedAt? }
// Thread matching: explicit threadId → a `reply+<threadId>@…` address in `to` →
// the newest open thread for the sender's address → a tenant/owner/vendor with
// that email (new thread) → a new unlinked thread. Staff can also log inbound
// replies manually from the Inbox.

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

async function partyByEmail(db, email, projectId) {
  for (const [type, table] of [["tenant", "tenants"], ["owner", "owners"], ["vendor", "vendors"], ["prospect", "prospects"]]) {
    let q = db.from(table).select("*").ilike("email", email).is("deleted_at", null).limit(1);
    if (projectId) q = q.eq("project_id", projectId);
    const { data } = await q;
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
        projectId: r.project_id || null,
      };
    }
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
  const fromEmail = String(typeof body.from === "object" ? body.from?.email : body.from || "").trim().toLowerCase();
  const fromName = typeof body.from === "object" ? body.from?.name || "" : "";
  const text = String(body.text || "").trim();
  if (!fromEmail || !text) return jsonError(400, "from and text are required.");
  const channel = body.channel === "sms" ? "sms" : "email";

  let thread = body.threadId ? await getThread(db, body.threadId) : null;
  if (!thread) {
    const token = String(body.to || "").match(/\+([^@]+)@/)?.[1];
    if (token && UUID.test(token)) thread = await getThread(db, token.match(UUID)[0]);
  }
  if (!thread) {
    let q = db
      .from("message_threads")
      .select("*")
      .ilike("party_email", fromEmail)
      .neq("status", "Closed")
      .is("deleted_at", null)
      .order("last_message_at", { ascending: false })
      .limit(1);
    if (body.projectId) q = q.eq("project_id", body.projectId);
    const { data } = await q;
    thread = data?.[0] || null;
  }
  let party = null;
  if (!thread) {
    party = (await partyByEmail(db, fromEmail, body.projectId)) || {
      type: "other",
      id: null,
      name: fromName || fromEmail,
      email: fromEmail,
      projectId: body.projectId || null,
    };
    thread = await findOrCreateThread(db, {
      projectId: body.projectId || party.projectId,
      party,
      subject: body.subject || "",
      channel,
    });
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
