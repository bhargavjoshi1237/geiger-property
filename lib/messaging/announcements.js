import { buildMergeValues } from "./context";
import { renderMerge } from "./merge_fields";
import { DELIVERY_STATUS, deliver } from "./deliver";
import { logActivity } from "./threads";

// Server-only announcement delivery: resolve the audience to real recipients,
// send per recipient (idempotent via announcement_deliveries' unique
// (announcement_id, recipient_key)), then stamp the announcement Sent with stats.

const scoped = (q, projectId) => (projectId ? q.or(`project_id.eq.${projectId},project_id.is.null`) : q);

async function rows(db, table, projectId, apply = (q) => q) {
  try {
    const { data, error } = await apply(scoped(db.from(table).select("*").is("deleted_at", null), projectId));
    if (error) {
      console.error(`[announce.${table}]`, error.message);
      return [];
    }
    return data || [];
  } catch (e) {
    console.error(`[announce.${table}]`, e);
    return [];
  }
}

// [{ key, type, id, name, email, phone, propertyId, unitId, leaseId }]
export async function resolveAudience(db, a) {
  const projectId = a.project_id || null;
  const audience = a.audience || "All tenants";
  const toRecipient = (type) => (r) => ({
    key: `${type}:${r.id}`,
    type,
    id: r.id,
    name: r.name || "",
    email: r.email || "",
    phone: r.phone || "",
    propertyId: r.property_id || null,
    unitId: r.unit_id || null,
    leaseId: r.lease_id || null,
  });

  if (audience === "Owners") {
    let owners = await rows(db, "owners", projectId);
    if (a.property_id) {
      const links = await rows(db, "property_owners", projectId, (q) => q.eq("property_id", a.property_id));
      const ids = new Set(links.map((l) => l.owner_id));
      owners = owners.filter((o) => ids.has(o.id));
    }
    return owners.filter((o) => o.status !== "Inactive").map(toRecipient("owner"));
  }
  if (audience === "Vendors") {
    const vendors = await rows(db, "vendors", projectId);
    return vendors.filter((v) => v.status !== "Inactive").map(toRecipient("vendor"));
  }

  let tenants = (await rows(db, "tenants", projectId)).filter((t) => t.status !== "Past");
  if (audience === "Property tenants") {
    if (!a.property_id) return [];
    tenants = tenants.filter((t) => t.property_id === a.property_id);
  } else if (audience === "Building tenants") {
    if (!a.building_id) return [];
    const units = await rows(db, "units", projectId, (q) => q.eq("building_id", a.building_id));
    const unitIds = new Set(units.map((u) => u.id));
    tenants = tenants.filter((t) => t.unit_id && unitIds.has(t.unit_id));
  }
  return tenants.map(toRecipient("tenant"));
}

const DONE = new Set([DELIVERY_STATUS.sent, DELIVERY_STATUS.logged, DELIVERY_STATUS.skipped]);

export async function deliverAnnouncement(db, a, { actor, now = new Date() } = {}) {
  const projectId = a.project_id || null;
  const channel = String(a.channel || "Email").toLowerCase();
  const recipients = await resolveAudience(db, a);
  const existing = await rows(db, "announcement_deliveries", null, (q) => q.eq("announcement_id", a.id));
  const doneKeys = new Set(existing.filter((d) => DONE.has(d.status)).map((d) => d.recipient_key));

  const counts = { total: recipients.length, sent: 0, failed: 0, notSent: 0, skipped: 0, logged: 0 };
  const errors = [];

  for (const r of recipients) {
    if (doneKeys.has(r.key)) {
      counts.skipped += 1;
      continue;
    }
    const { values } = await buildMergeValues(
      db,
      {
        projectId,
        tenantId: r.type === "tenant" ? r.id : undefined,
        ownerId: r.type === "owner" ? r.id : undefined,
        vendorId: r.type === "vendor" ? r.id : undefined,
        leaseId: r.leaseId || undefined,
        propertyId: r.propertyId || a.property_id || undefined,
      },
      { now, recipientName: r.name },
    );
    const subject = renderMerge(a.name, values, { keepMissing: false });
    const body = renderMerge(a.body, values, { keepMissing: false });
    const result =
      channel === "portal"
        ? { status: DELIVERY_STATUS.logged }
        : await deliver({
            db,
            projectId,
            channel,
            to: channel === "sms" ? r.phone : r.email,
            recipientName: r.name,
            subject,
            body,
            notification: "announcement",
            data: { announcementTitle: subject, propertyName: values.property || "" },
          });

    if (result.status === DELIVERY_STATUS.sent) counts.sent += 1;
    else if (result.status === DELIVERY_STATUS.failed) counts.failed += 1;
    else if (result.status === DELIVERY_STATUS.notSent) counts.notSent += 1;
    else if (result.status === DELIVERY_STATUS.logged) counts.logged += 1;
    else counts.skipped += 1;
    if (result.error && errors.length < 20) errors.push(`${r.name || r.email || r.key}: ${result.error}`);

    try {
      await db.from("announcement_deliveries").upsert(
        {
          project_id: projectId,
          announcement_id: a.id,
          recipient_key: r.key,
          recipient_type: r.type,
          recipient_id: r.id,
          recipient_name: r.name,
          address: channel === "sms" ? r.phone : r.email,
          channel,
          status: result.status,
          error: result.error || null,
          sent_at: now.toISOString(),
        },
        { onConflict: "announcement_id,recipient_key" },
      );
    } catch (e) {
      console.error("[announce.delivery]", e);
    }
  }

  const delivery = { ...counts, errors, at: now.toISOString() };
  try {
    await db
      .from("announcements")
      .update({ status: "Sent", sent_at: now.toISOString() })
      .eq("id", a.id);
    await db.rpc("merge_meta", { p_table: "announcements", p_id: a.id, p_patch: { delivery, sentAt: now.toISOString() } });
  } catch (e) {
    console.error("[announce.stamp]", e);
  }
  await logActivity(db, {
    projectId,
    ownerType: "announcement",
    ownerId: a.id,
    verb: "sent",
    summary: `Sent to ${counts.total} recipient${counts.total === 1 ? "" : "s"} — ${counts.sent} delivered, ${counts.notSent} not sent, ${counts.failed} failed`,
    actorId: actor?.id,
    actorName: actor?.name || (actor ? "" : "Scheduler"),
  });
  return { ok: true, delivery };
}
