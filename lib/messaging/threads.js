// Server-side thread + communication-log writes (any Supabase client pinned to
// the `property` schema; the routes pass the service-role client). Pure: return
// null on failure and console.error, never throw.

const preview = (text) => String(text || "").replace(/\s+/g, " ").trim().slice(0, 160);

// Party lookup: a tenant / owner / vendor / prospect row as a thread party.
const PARTY_TABLES = { tenant: "tenants", owner: "owners", vendor: "vendors", prospect: "prospects" };

export async function loadParty(db, type, id) {
  const table = PARTY_TABLES[type];
  if (!db || !table || !id) return null;
  try {
    const { data, error } = await db.from(table).select("*").eq("id", id).maybeSingle();
    if (error || !data || data.deleted_at) return null;
    return {
      type,
      id: data.id,
      name: data.name || "",
      email: data.email || "",
      phone: data.phone || "",
      leaseId: data.lease_id || null,
      propertyId: data.property_id || null,
      unitId: data.unit_id || null,
      projectId: data.project_id || null,
    };
  } catch (e) {
    console.error("[threads.party]", e);
    return null;
  }
}

export async function getThread(db, id) {
  if (!db || !id) return null;
  try {
    const { data, error } = await db.from("message_threads").select("*").eq("id", id).maybeSingle();
    if (error) {
      console.error("[threads.get]", error.message);
      return null;
    }
    return data && !data.deleted_at ? data : null;
  } catch (e) {
    console.error("[threads.get]", e);
    return null;
  }
}

// Reuse the party's open thread, else open a new one.
export async function findOrCreateThread(db, { projectId, party, subject, channel = "email", actorId }) {
  if (!db) return null;
  try {
    if (party?.id) {
      let q = db
        .from("message_threads")
        .select("*")
        .eq("party_type", party.type)
        .eq("party_id", party.id)
        .neq("status", "Closed")
        .is("deleted_at", null)
        .order("last_message_at", { ascending: false })
        .limit(1);
      if (projectId) q = q.eq("project_id", projectId);
      const { data } = await q;
      if (data?.[0]) return data[0];
    }
    const { data, error } = await db
      .from("message_threads")
      .insert({
        project_id: projectId || party?.projectId || null,
        subject: subject || "",
        channel,
        status: "Open",
        party_type: party?.type || null,
        party_id: party?.id || null,
        party_name: party?.name || "",
        party_email: party?.email || null,
        party_phone: party?.phone || null,
        lease_id: party?.leaseId || null,
        property_id: party?.propertyId || null,
        unit_id: party?.unitId || null,
        created_by: actorId || null,
      })
      .select("*")
      .single();
    if (error) {
      console.error("[threads.create]", error.message);
      return null;
    }
    return data;
  } catch (e) {
    console.error("[threads.create]", e);
    return null;
  }
}

// Append a message and roll the thread's summary columns forward.
export async function appendThreadMessage(db, thread, msg) {
  if (!db || !thread?.id) return null;
  try {
    const now = new Date().toISOString();
    const { data, error } = await db
      .from("thread_messages")
      .insert({
        project_id: thread.project_id || null,
        thread_id: thread.id,
        direction: msg.direction || "outbound",
        channel: msg.channel || thread.channel || "email",
        from_name: msg.fromName || null,
        from_address: msg.fromAddress || null,
        to_address: msg.toAddress || null,
        subject: msg.subject || thread.subject || "",
        body: msg.body || "",
        delivery_status: msg.deliveryStatus || "logged",
        delivery_error: msg.deliveryError || null,
        provider_id: msg.providerId || null,
        template_id: msg.templateId || null,
        sent_at: msg.sentAt || now,
        created_by: msg.actorId || null,
        metadata: msg.metadata || {},
      })
      .select("*")
      .single();
    if (error) {
      console.error("[threads.append]", error.message);
      return null;
    }
    const inbound = msg.direction === "inbound";
    await db
      .from("message_threads")
      .update({
        last_message_at: data.sent_at,
        last_message_preview: preview(msg.body),
        last_direction: msg.direction || "outbound",
        message_count: Number(thread.message_count || 0) + 1,
        unread_count: inbound ? Number(thread.unread_count || 0) + 1 : 0,
        status: inbound ? "Open" : thread.status === "Closed" ? "Open" : thread.status || "Open",
        ...(thread.subject ? {} : { subject: msg.subject || "" }),
      })
      .eq("id", thread.id);
    return data;
  } catch (e) {
    console.error("[threads.append]", e);
    return null;
  }
}

// Mirror a message into the tenant's communication log (tenant timeline).
export async function logCommunication(db, { projectId, tenantId, channel, direction, subject, body, actorId, metadata }) {
  if (!db || !tenantId) return null;
  try {
    const { data, error } = await db
      .from("tenant_communications")
      .insert({
        project_id: projectId || null,
        tenant_id: tenantId,
        channel: String(channel || "email").toLowerCase(),
        direction: direction || "outbound",
        subject: subject || "",
        body: body || "",
        occurred_at: new Date().toISOString(),
        created_by: actorId || null,
        metadata: metadata || {},
      })
      .select("id")
      .single();
    if (error) {
      console.error("[comms.log]", error.message);
      return null;
    }
    return data;
  } catch (e) {
    console.error("[comms.log]", e);
    return null;
  }
}

// Record an activity row on any record (owner_type = the screen config key).
export async function logActivity(db, { projectId, ownerType, ownerId, verb = "message", summary, actorId, actorName, metadata }) {
  if (!db || !ownerType || !ownerId) return null;
  try {
    const { error } = await db.from("activity").insert({
      project_id: projectId || null,
      owner_type: ownerType,
      owner_id: ownerId,
      verb,
      summary: summary || "",
      actor_id: actorId || null,
      actor_name: actorName || "",
      occurred_at: new Date().toISOString(),
      metadata: { system: true, ...(metadata || {}) },
    });
    if (error) console.error("[activity.log]", error.message);
    return !error;
  } catch (e) {
    console.error("[activity.log]", e);
    return null;
  }
}
