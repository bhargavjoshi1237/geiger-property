import { appendThreadMessage, findOrCreateThread, logActivity, logCommunication } from "@/lib/messaging/threads";
import { PORTAL_ROLES } from "./constants";
import { mergeMeta, meta, rowsIn, rowsOf, str, todayISO } from "./http";

// Server-only reads/writes every portal shares: announcements for the member's
// audience, documents, the member's inbox thread with the office, and profile /
// contact preferences on their own party record.

const scoped = (q, projectId) => (projectId ? q.or(`project_id.eq.${projectId},project_id.is.null`) : q);

// --- Announcements -------------------------------------------------------------

// Sent, unexpired announcements whose audience covers this member.
export async function listAnnouncements(ctx, { propertyId, buildingId } = {}) {
  const rows = await rowsOf(
    scoped(ctx.admin.from("announcements").select("*").is("deleted_at", null).eq("status", "Sent"), ctx.projectId)
      .order("created_at", { ascending: false })
      .limit(100),
    "announcements",
  );
  const today = todayISO();
  const role = ctx.member.role;
  return rows
    .filter((a) => !a.expires_on || a.expires_on >= today)
    .filter((a) => {
      const aud = a.audience || "All tenants";
      if (role === "owner") return aud === "Owners";
      if (role === "vendor") return aud === "Vendors";
      if (aud === "All tenants") return true;
      if (aud === "Property tenants") return Boolean(propertyId) && a.property_id === propertyId;
      if (aud === "Building tenants") return Boolean(buildingId) && a.building_id === buildingId;
      return false;
    })
    .map((a) => ({
      id: a.id,
      title: a.name || "Announcement",
      body: a.body || meta(a).body || "",
      priority: a.priority || "",
      propertyName: a.property_name || "",
      date: a.sent_at || a.publish_on || a.scheduled_for || a.created_at,
    }))
    .sort((x, y) => String(y.date || "").localeCompare(String(x.date || "")));
}

// --- Documents -----------------------------------------------------------------

const docView = (d, source) => ({
  id: d.id,
  name: d.name || "Document",
  kind: d.kind || "other",
  url: d.url || "",
  sizeBytes: Number(d.size_bytes || 0),
  createdAt: d.created_at,
  source,
});

// Documents for the given owner refs [{ type, ids, label }] minus anything marked internal.
export async function listDocumentsFor(admin, refs) {
  const out = [];
  for (const ref of refs) {
    const ids = (ref.ids || []).filter(Boolean);
    if (!ids.length) continue;
    const rows = await rowsOf(
      admin
        .from("documents")
        .select("*")
        .eq("owner_type", ref.type)
        .in("owner_id", ids)
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
      "documents",
    );
    for (const d of rows) if (!meta(d).internal) out.push(docView(d, ref.label));
  }
  return out;
}

export async function listTenantDocuments(admin, tenantId) {
  const rows = await rowsIn(admin, "tenant_documents", "tenant_id", [tenantId], "tenant_documents");
  return rows.filter((d) => !meta(d).internal).map((d) => docView(d, "Your file"));
}

// --- Messages ------------------------------------------------------------------

const partyOf = (ctx) => {
  const cfg = PORTAL_ROLES[ctx.member.role];
  const p = ctx.party;
  return {
    type: cfg.partyType,
    id: p.id,
    name: p.name || ctx.member.name || "",
    email: p.email || ctx.member.email || "",
    phone: p.phone || "",
    leaseId: p.lease_id || null,
    propertyId: p.property_id || null,
    unitId: p.unit_id || null,
    projectId: ctx.projectId,
  };
};

// The member's threads with the office (internal notes excluded), newest first.
export async function listMessages(ctx) {
  const cfg = PORTAL_ROLES[ctx.member.role];
  const threads = await rowsOf(
    ctx.admin
      .from("message_threads")
      .select("*")
      .eq("party_type", cfg.partyType)
      .eq("party_id", ctx.party.id)
      .is("deleted_at", null)
      .order("last_message_at", { ascending: false, nullsFirst: false }),
    "threads",
  );
  const msgs = await rowsIn(ctx.admin, "thread_messages", "thread_id", threads.map((t) => t.id), "thread_messages");
  const byThread = new Map();
  for (const m of msgs) {
    if (m.channel === "note") continue;
    const list = byThread.get(m.thread_id) || [];
    list.push({
      id: m.id,
      direction: m.direction,
      fromName: m.direction === "inbound" ? "You" : m.from_name || "Property team",
      subject: m.subject || "",
      body: m.body || "",
      sentAt: m.sent_at || m.created_at,
      channel: m.channel,
    });
    byThread.set(m.thread_id, list);
  }
  return threads
    .map((t) => ({
      id: t.id,
      subject: t.subject || "Conversation",
      status: t.status || "Open",
      lastMessageAt: t.last_message_at || t.created_at,
      messages: (byThread.get(t.id) || []).sort((a, b) => String(a.sentAt).localeCompare(String(b.sentAt))),
    }))
    .filter((t) => t.messages.length);
}

// Post a message to the office (reuses the open thread unless threadId says otherwise).
export async function sendMessage(ctx, { threadId, subject, body, attachments = [] }) {
  const text = str(body, 5000);
  if (!text) return { ok: false, error: "Write a message first." };
  const cfg = PORTAL_ROLES[ctx.member.role];
  const party = partyOf(ctx);
  let thread = null;
  if (threadId) {
    const rows = await rowsOf(
      ctx.admin.from("message_threads").select("*").eq("id", threadId).eq("party_type", cfg.partyType).eq("party_id", party.id),
      "threads.get",
    );
    thread = rows[0] || null;
    if (!thread) return { ok: false, error: "That conversation isn't available." };
  } else {
    thread = await findOrCreateThread(ctx.admin, {
      projectId: ctx.projectId,
      party,
      subject: str(subject, 200) || "Message from the portal",
      channel: "portal",
      actorId: ctx.user.id,
    });
  }
  if (!thread) return { ok: false, error: "We couldn't start the conversation." };
  const msg = await appendThreadMessage(ctx.admin, thread, {
    direction: "inbound",
    channel: "portal",
    fromName: party.name,
    fromAddress: party.email,
    subject: str(subject, 200) || thread.subject || "",
    body: text,
    deliveryStatus: "received",
    metadata: { source: "portal", portalMemberId: ctx.member.id, attachments },
  });
  if (!msg) return { ok: false, error: "We couldn't send your message." };
  if (party.type === "tenant") {
    await logCommunication(ctx.admin, {
      projectId: ctx.projectId,
      tenantId: party.id,
      channel: "portal",
      direction: "inbound",
      subject: msg.subject,
      body: text,
      metadata: { threadId: thread.id },
    });
  }
  return { ok: true, threadId: thread.id };
}

// --- Profile -------------------------------------------------------------------

const PROFILE_META_KEYS = {
  resident: ["preferredName", "altEmail", "homePhone", "workPhone", "language", "preferredContact", "emailOptIn", "smsOptIn", "quietHoursStart", "quietHoursEnd"],
  owner: ["preferredContact", "altEmail", "language", "statementDelivery"],
  vendor: ["preferredContact", "altEmail", "dispatchPhone", "dispatchEmail"],
};

export function profileView(ctx) {
  const m = ctx.partyMeta;
  const keys = PROFILE_META_KEYS[ctx.member.role] || [];
  return {
    role: ctx.member.role,
    name: ctx.party.name || "",
    email: ctx.party.email || ctx.member.email || "",
    loginEmail: ctx.member.email || "",
    phone: ctx.party.phone || "",
    company: ctx.party.company || "",
    contactName: ctx.party.contact_name || "",
    prefs: Object.fromEntries(keys.map((k) => [k, m[k] ?? (k === "emailOptIn" ? true : "")])),
  };
}

export async function updateProfile(ctx, input) {
  const cfg = PORTAL_ROLES[ctx.member.role];
  const keys = PROFILE_META_KEYS[ctx.member.role] || [];
  const prefs = input?.prefs && typeof input.prefs === "object" ? input.prefs : {};
  const patch = {};
  for (const k of keys) {
    if (!(k in prefs)) continue;
    patch[k] = typeof prefs[k] === "boolean" ? prefs[k] : str(prefs[k], 200);
  }
  if (patch.smsOptIn === true && !ctx.partyMeta.smsOptIn) patch.smsConsentOn = todayISO();
  patch.portalProfileUpdatedAt = new Date().toISOString();

  if ("phone" in (input || {})) {
    const { error } = await ctx.admin.from(cfg.partyTable).update({ phone: str(input.phone, 40) }).eq("id", ctx.party.id);
    if (error) {
      console.error("[portal.profile]", error.message);
      return { ok: false, error: "We couldn't save your phone number." };
    }
  }
  if (!(await mergeMeta(ctx.admin, cfg.partyTable, ctx.party.id, patch))) {
    return { ok: false, error: "We couldn't save your preferences." };
  }
  await logActivity(ctx.admin, {
    projectId: ctx.projectId,
    ownerType: cfg.partyType,
    ownerId: ctx.party.id,
    verb: "updated",
    summary: "Updated contact preferences in the portal",
    actorId: ctx.user.id,
    actorName: ctx.actorName,
  });
  return { ok: true };
}

// Activity row on the member's own record (and optionally another record).
export function logPortalActivity(ctx, summary, extra) {
  const cfg = PORTAL_ROLES[ctx.member.role];
  const base = { projectId: ctx.projectId, verb: "portal", summary, actorId: ctx.user.id, actorName: ctx.actorName };
  return Promise.all([
    logActivity(ctx.admin, { ...base, ownerType: cfg.partyType, ownerId: ctx.party.id }),
    extra?.ownerId ? logActivity(ctx.admin, { ...base, ownerType: extra.ownerType, ownerId: extra.ownerId }) : null,
  ]);
}
