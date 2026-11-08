import "server-only";
import { createHash } from "node:crypto";

import { businessDate } from "@/lib/billing/periods";
import { sendNotificationEmail, getNotificationConfig } from "@/lib/email/notifications";
import { projectTimeZone } from "@/lib/jobs/business_date";
import { canContact } from "@/lib/messaging/consent";
import { sendPartyMessage } from "@/lib/messaging/send";
import { logActivity } from "@/lib/messaging/threads";
import { notifyMembers } from "@/lib/notifications/server";
import { normalizeRoleId } from "@/lib/rbac";
import { forProject } from "@/lib/supabase/scope";
import { LEAD_ACK_NOTIFICATION, ackedRecently, leadAckMessage } from "./ack";
import { LEAD_CHANNELS, NEW_LEAD_STAGE, channelOf, inquiryLabel, responseGoalHours } from "./channels";
import { clip, cleanUrl, cleanUtm, contactName, formatPhone, normalizeEmail, normalizePhone } from "./contact";
import { advanceProspect, nextStageHistory } from "./stages";

// Lead intake (LEAS-02, server-only): every channel — the public inquiry form, listing-site email, staff-logged calls
// and walk-ins — lands here. ingestLead matches the contact to a prospect in the project (email, then phone; full dedupe
// is LEAS-12), appends an inquiry record item, keeps first/last-touch attribution, re-opens a Lost prospect, schedules a
// response follow-up, alerts the agent and staff, records SMS consent with its proof and acknowledges the lead by email.
// `db` is the service-role client; every read and write stays inside input.projectId. `deps` swaps the senders in tests.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const RAW_LIMIT = 20 * 1024;
const MESSAGE_LIMIT = 4000;
const LISTING_COLUMNS = "id, name, property_id, property_name, unit_id, unit, status, contact_phone, metadata";
const CLOSED_FOLLOW_UP = ["Done", "Skipped"];
const AGENT_FALLBACK_ROLES = new Set(["owner", "admin", "manager", "leasing_agent"]);

const isUuid = (v) => UUID.test(String(v || ""));
const iso = (v, fallback) => {
  const t = Date.parse(v || "");
  return Number.isFinite(t) ? new Date(t).toISOString() : fallback.toISOString();
};
export const sha256 = (v) => createHash("sha256").update(String(v ?? "")).digest("hex");

// The raw email body kept on the inquiry: at most RAW_LIMIT bytes of text, never attachments.
export function clipRaw(raw) {
  const s = String(raw ?? "");
  if (Buffer.byteLength(s) <= RAW_LIMIT) return s;
  return Buffer.from(s).subarray(0, RAW_LIMIT).toString("utf8").replace(/�+$/, "");
}

async function one(query) {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? data[0] || null : data || null;
}

async function loadListing(db, projectId, listingId) {
  if (!isUuid(listingId)) return null;
  return one(forProject(db.from("listings").select(LISTING_COLUMNS).eq("id", listingId).is("deleted_at", null), projectId).limit(1));
}

// The project's prospect with this email, else this phone → { row, matchedBy }.
export async function findProspect(db, projectId, { email, phone }) {
  const by = async (col, value) =>
    value ? one(forProject(db.from("prospects").select("*").eq(col, value).is("deleted_at", null), projectId).order("created_at", { ascending: false }).limit(1)) : null;
  const byEmail = await by("email_lc", email);
  if (byEmail) return { row: byEmail, matchedBy: "email" };
  const byPhone = await by("phone_e164", phone);
  if (byPhone) return { row: byPhone, matchedBy: "phone" };
  return { row: null, matchedBy: null };
}

// An earlier inquiry with this provider id (a webhook retry) → its row, else null.
async function seenInquiry(db, projectId, externalId) {
  if (!externalId) return null;
  return one(
    forProject(db.from("record_items").select("id, owner_id").eq("kind", "inquiry").eq("metadata->>externalId", externalId).is("deleted_at", null), projectId).limit(1),
  );
}

const addUnique = (list, value) => (value && !(list || []).includes(value) ? [...(list || []), value] : list || []);

// Team member ids to alert: the assigned agent (team_members by name), else the project's owners, admins, managers and agents.
async function alertMemberIds(db, projectId, agentName) {
  const { data } = await forProject(db.from("team_members").select("id, name, role, status").is("deleted_at", null), projectId);
  const live = (data || []).filter((m) => m.status !== "Disabled" && m.status !== "Removed");
  const agent = agentName ? live.find((m) => String(m.name || "").trim().toLowerCase() === agentName.trim().toLowerCase()) : null;
  if (agent) return { ids: [agent.id], agent: true };
  return { ids: live.filter((m) => AGENT_FALLBACK_ROLES.has(normalizeRoleId(m.role))).map((m) => m.id), agent: false };
}

// The in-app alert (the agent; with alerts "all", everyone in leasing when no agent is set) and the staff_alerts email. Never throws.
async function alertStaff(db, { projectId, prospect, inquiryId, created, label, listingName, message, agentName, alerts, notify, sendEmail }) {
  const out = { inApp: null, emails: [] };
  if (alerts === "none") return out;
  const who = prospect.name || prospect.email || "A new lead";
  const title = created ? `New lead: ${who}` : `New inquiry from ${who}`;
  const body = [`${label}${listingName ? ` · ${listingName}` : ""}`, clip(message, 200)].filter(Boolean).join(" — ");
  const url = `/project/${projectId}/prospects?item=${prospect.id}`;
  try {
    const { ids, agent } = await alertMemberIds(db, projectId, agentName);
    if (ids.length && (agent || alerts === "all")) {
      out.inApp = await notify(db, {
        projectId,
        memberIds: ids,
        title,
        body,
        url,
        category: "leads",
        priority: "high",
        dedupeKey: `lead:${inquiryId}`,
        data: { prospectId: prospect.id, created },
      });
    }
    if (alerts !== "all") return out;
    const cfg = await getNotificationConfig(projectId, db);
    const base = `${(process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "")}${process.env.NEXT_PUBLIC_BASE_PATH || ""}`;
    const paragraphs = [`${who} sent an inquiry by ${label.toLowerCase()}${listingName ? ` about ${listingName}` : ""}.`, clip(message, 600), "Open the prospect to reply and log the follow-up."].filter(Boolean);
    for (const to of new Set((cfg.alertEmails || []).map((e) => String(e).trim().toLowerCase()).filter(Boolean))) {
      const res = await sendEmail({
        db,
        projectId,
        notification: "staff_alerts",
        to,
        subject: title,
        data: { recipientName: "", subject: title, body: paragraphs.join("\n\n"), paragraphs, ctaUrl: base ? `${base}${url}` : undefined },
      });
      out.emails.push({ to, status: res.ok ? "sent" : res.skipped ? "disabled" : res.error || "failed" });
    }
  } catch (e) {
    console.error("[leads.alert]", e?.message || e);
  }
  return out;
}

// The acknowledgement email, unless the prospect is do-not-contact, has no email, or was acknowledged recently.
async function acknowledge(db, { projectId, prospect, listing, inquiryId, now, send }) {
  const party = {
    type: "prospect",
    id: prospect.id,
    name: prospect.name || "",
    email: prospect.email || "",
    phone: prospect.phone || "",
    propertyId: prospect.property_id || null,
    unitId: prospect.unit_id || null,
    projectId,
    metadata: prospect.metadata || {},
  };
  const gate = canContact(party, { channel: "email", category: "transactional", now });
  if (!gate.ok) return { status: "blocked", reason: gate.reason };
  if (ackedRecently(party.metadata, now)) return { status: "skipped", reason: "recent" };
  const { subject, body } = leadAckMessage({ listingName: listing?.name || prospect.listing_name || "", officePhone: listing?.contact_phone || "" });
  const res = await send({
    db,
    projectId,
    party,
    channel: "email",
    subject,
    body,
    notification: LEAD_ACK_NOTIFICATION,
    refs: { propertyId: party.propertyId || undefined, unitId: party.unitId || undefined },
    metadata: { auto: true, kind: "lead_ack", inquiryId },
  });
  if (res?.status === "sent") await db.rpc("merge_meta", { p_table: "prospects", p_id: prospect.id, p_patch: { lastAckAt: now.toISOString() } });
  return { status: res?.status || "failed", error: res?.error || null, threadId: res?.threadId || null };
}

// ingestLead(db, input, deps) → { ok, prospectId, created, matchedBy, inquiryId, followUpId, reopened, duplicate, acknowledged, alerts } | { ok: false, error }.
export async function ingestLead(db, input = {}, deps = {}) {
  const now = deps.now ? new Date(deps.now) : new Date();
  const send = deps.send || sendPartyMessage;
  const notify = deps.notify || notifyMembers;
  const sendEmail = deps.sendEmail || sendNotificationEmail;
  const { projectId } = input;
  if (!db) return { ok: false, error: "The database isn't configured." };
  if (!isUuid(projectId)) return { ok: false, error: "A project is required." };

  const channel = LEAD_CHANNELS[input.channel] ? input.channel : "email";
  const ch = channelOf(channel);
  const email = normalizeEmail(input.contact?.email);
  const phoneRaw = clip(input.contact?.phone, 40);
  const phone = normalizePhone(phoneRaw);
  const name = contactName({ name: input.contact?.name, email, phone: phoneRaw }) || `New lead (${ch.label.toLowerCase()})`;
  const message = clip(input.message, MESSAGE_LIMIT);
  const source = clip(input.source, 60) || ch.source;
  const receivedAt = iso(input.receivedAt, now);
  const utm = cleanUtm(input.utm);
  const referrer = cleanUrl(input.referrer);
  const landingUrl = cleanUrl(input.landingUrl);
  const externalId = clip(input.externalId, 300) || null;

  try {
    const seen = await seenInquiry(db, projectId, externalId);
    if (seen) return { ok: true, duplicate: true, prospectId: seen.owner_id, inquiryId: seen.id, created: false, matchedBy: "externalId" };

    const listing = await loadListing(db, projectId, input.listingId);
    const lm = listing?.metadata || {};
    const place = {
      listing_id: listing?.id || null,
      listing_name: listing?.name || "",
      property_id: listing?.property_id || (isUuid(input.propertyId) ? input.propertyId : null),
      property_name: listing?.property_name || "",
      unit_id: listing?.unit_id || (isUuid(input.unitId) ? input.unitId : null),
      unit: listing?.unit || "",
    };
    const tz = await projectTimeZone(db, projectId);
    const touch = {
      at: receivedAt,
      channel,
      source,
      listingId: place.listing_id,
      listingName: place.listing_name,
      ...(Object.keys(utm).length ? { utm } : {}),
      ...(referrer ? { referrer } : {}),
    };
    const consentGiven = Boolean(input.consent?.given) && Boolean(phone);

    // Match, else create the prospect.
    const { row: match, matchedBy } = await findProspect(db, projectId, { email, phone });
    let prospect = match;
    let created = false;
    let reopened = false;
    if (!prospect) {
      const metadata = {
        firstTouch: touch,
        lastTouch: touch,
        stageHistory: nextStageHistory(null, NEW_LEAD_STAGE, `Lead from ${inquiryLabel(channel, source).toLowerCase()}`, receivedAt),
        inquiryChannel: ch.inquiryChannel,
        firstContactOn: businessDate(new Date(receivedAt), tz),
        ...(message ? { inquiryMessage: message } : {}),
        ...(utm.campaign ? { campaign: utm.campaign } : {}),
        ...(lm.agent ? { assignedAgent: lm.agent } : {}),
        ...(ch.live ? { firstResponseAt: receivedAt } : {}),
        ...(consentGiven ? { smsOptIn: true, consentToText: true } : {}),
        leadIntake: true,
      };
      const insert = {
        project_id: projectId,
        name: clip(name, 120),
        email,
        phone: phone ? formatPhone(phoneRaw) : phoneRaw,
        source,
        status: NEW_LEAD_STAGE,
        ...place,
        ...(input.moveInDate && /^\d{4}-\d{2}-\d{2}$/.test(input.moveInDate) ? { move_in_date: input.moveInDate } : {}),
        first_touch_at: receivedAt,
        created_by: input.actor?.id || null,
        metadata,
      };
      prospect = await one(db.from("prospects").insert(insert).select("*").single());
      created = true;
    } else {
      // Fill what the prospect lacks, keep other addresses for LEAS-12, and re-open a Lost lead.
      const m = prospect.metadata || {};
      const fill = {};
      if (!prospect.email && email) fill.email = email;
      if (!prospect.phone && phoneRaw) fill.phone = phone ? formatPhone(phoneRaw) : phoneRaw;
      if (!prospect.listing_id && place.listing_id) Object.assign(fill, place);
      if (Object.keys(fill).length) {
        prospect = (await one(forProject(db.from("prospects").update(fill).eq("id", prospect.id), projectId).select("*").maybeSingle())) || { ...prospect, ...fill };
      }
      const patch = {
        lastTouch: touch,
        ...(email && prospect.email_lc && email !== prospect.email_lc ? { altEmails: addUnique(m.altEmails, email) } : {}),
        ...(phone && prospect.phone_e164 && phone !== prospect.phone_e164 ? { altPhones: addUnique(m.altPhones, phone) } : {}),
        ...(consentGiven ? { smsOptIn: true, consentToText: true } : {}),
      };
      const merged = await db.rpc("merge_meta", { p_table: "prospects", p_id: prospect.id, p_patch: patch });
      prospect = { ...prospect, metadata: merged.data || { ...m, ...patch } };
      if (prospect.status === "Lost") {
        const row = await advanceProspect(db, prospect.id, NEW_LEAD_STAGE, `Re-opened by a new ${inquiryLabel(channel, source).toLowerCase()} inquiry`, {
          force: true,
          projectId,
          actor: input.actor,
          at: receivedAt,
        });
        if (row) {
          prospect = row;
          reopened = true;
        }
      }
    }

    // The inquiry itself.
    const inquiry = await one(
      db
        .from("record_items")
        .insert({
          project_id: projectId,
          owner_type: "prospect",
          owner_id: prospect.id,
          kind: "inquiry",
          name: inquiryLabel(channel, source),
          status: "Received",
          starts_on: businessDate(new Date(receivedAt), tz),
          created_by: input.actor?.id || null,
          metadata: {
            channel,
            source,
            receivedAt,
            listingId: place.listing_id,
            listingName: place.listing_name,
            propertyId: place.property_id,
            unitId: place.unit_id,
            message,
            contact: { name: clip(input.contact?.name, 120), email, phone: phoneRaw },
            utm,
            referrer,
            ...(landingUrl ? { landingUrl } : {}),
            ...(input.subject ? { subject: clip(input.subject, 300) } : {}),
            externalId,
            rawRef: clip(input.rawRef, 300) || null,
            ...(input.raw ? { raw: clipRaw(input.raw) } : {}),
            ...(input.ipHash ? { ipHash: input.ipHash } : {}),
            consent: consentGiven,
            matchedBy: matchedBy || null,
            loggedBy: input.actor?.name || null,
          },
        })
        .select("id")
        .single(),
    );
    await db.rpc("merge_meta", { p_table: "prospects", p_id: prospect.id, p_patch: { lastTouch: { ...touch, inquiryId: inquiry.id } } });

    // SMS consent from the form, with its proof (LEAS-40's ledger).
    if (consentGiven) {
      const wording = clip(input.consent.text, 1000);
      const { error } = await db.from("message_consents").insert({
        project_id: projectId,
        party_type: "prospect",
        party_id: prospect.id,
        channel: "sms",
        address: phone,
        status: "opted_in",
        scope: "transactional",
        source: "web_form",
        occurred_at: receivedAt,
        proof: { ip: clip(input.consent.ip, 64) || null, userAgent: clip(input.consent.userAgent, 400) || null, wordingHash: sha256(wording), wording, inquiryId: inquiry.id },
      });
      if (error) console.error("[leads.consent]", error.message);
    }

    // A response follow-up due at receipt + the listing's goal, unless one is already open or the lead was handled live.
    let followUpId = null;
    if (input.followUp !== false) {
      const { data: tasks, error: taskError } = await forProject(
        db.from("record_items").select("id, status").eq("owner_type", "prospect").eq("owner_id", prospect.id).eq("kind", "follow_up").is("deleted_at", null),
        projectId,
      );
      if (taskError) throw new Error(taskError.message);
      if (!(tasks || []).some((t) => !CLOSED_FOLLOW_UP.includes(t.status))) {
        const hours = responseGoalHours(listing);
        const dueAt = new Date(Date.parse(receivedAt) + hours * 3600 * 1000);
        const task = await one(
          db
            .from("record_items")
            .insert({
              project_id: projectId,
              owner_type: "prospect",
              owner_id: prospect.id,
              kind: "follow_up",
              name: `Respond to ${inquiryLabel(channel, source).toLowerCase()} inquiry`,
              status: "Open",
              starts_on: businessDate(dueAt, tz),
              metadata: {
                channel: email ? "Email" : "Call",
                assignee: prospect.metadata?.assignedAgent || lm.agent || "",
                dueAt: dueAt.toISOString(),
                responseGoalHours: hours,
                inquiryId: inquiry.id,
                auto: true,
              },
            })
            .select("id")
            .single(),
        );
        followUpId = task?.id || null;
      }
    }

    const label = inquiryLabel(channel, source);
    await logActivity(db, {
      projectId,
      ownerType: "prospect",
      ownerId: prospect.id,
      verb: "inquiry",
      summary: `${created ? "New lead" : "New inquiry"} by ${label.toLowerCase()}${place.listing_name ? ` about ${place.listing_name}` : ""}`,
      actorId: input.actor?.id,
      actorName: input.actor?.name,
      metadata: { inquiryId: inquiry.id },
    });

    const alerts = await alertStaff(db, {
      projectId,
      prospect,
      inquiryId: inquiry.id,
      created,
      label,
      listingName: place.listing_name,
      message,
      agentName: prospect.metadata?.assignedAgent || lm.agent || "",
      alerts: input.alerts || "all",
      notify,
      sendEmail,
    });
    const acknowledged = input.acknowledge === false ? { status: "off" } : await acknowledge(db, { projectId, prospect, listing, inquiryId: inquiry.id, now, send });

    return { ok: true, prospectId: prospect.id, created, matchedBy: created ? null : matchedBy, inquiryId: inquiry.id, followUpId, reopened, duplicate: false, acknowledged, alerts };
  } catch (e) {
    console.error("[leads.ingest]", e?.message || e);
    return { ok: false, error: "Couldn't record the inquiry." };
  }
}
