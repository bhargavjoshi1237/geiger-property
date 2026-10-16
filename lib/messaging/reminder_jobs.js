import { effectivePolicies } from "@/lib/policies";
import { emptyResult } from "@/lib/jobs/contract";
import { EXPIRING_WINDOW_DAYS, complianceOf, daysUntil } from "@/lib/compliance";
import { getNotificationConfig, sendNotificationEmail } from "@/lib/email/notifications";
import { daysBetween, formatMergeDate, getProjectSetting, nextDueDate } from "./context";
import { appUrl } from "./deliver";
import { deliverAnnouncement } from "./announcements";
import { logActivity } from "./threads";

// Server-only reminder jobs (lease expiry + renewal window, rent reminders,
// expiring documents, scheduled announcements). Each iterates every project's
// rows with the service-role client; sends are de-duplicated through
// property.notification_sends so a re-run on the same day never double-sends.

const DAY = 86400000;
const isoDay = (d) => d.toISOString().slice(0, 10);
const money = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 })
    .format(Number(n) || 0)
    .replace(/\.00$/, "");

const scoped = (q, projectId) => (projectId ? q.or(`project_id.eq.${projectId},project_id.is.null`) : q);

async function select(admin, table, apply = (q) => q) {
  const { data, error } = await apply(admin.from(table).select("*").is("deleted_at", null));
  if (error) throw new Error(`${table}: ${error.message}`);
  return data || [];
}

const byId = (rows) => new Map(rows.map((r) => [r.id, r]));

// Per-project lookups shared by a job pass.
function projectCache(admin) {
  const configs = new Map();
  const fees = new Map();
  return {
    config: async (pid) => {
      const k = pid || "none";
      if (!configs.has(k)) configs.set(k, await getNotificationConfig(pid, admin));
      return configs.get(k);
    },
    fees: async (pid) => {
      const k = pid || "none";
      if (!fees.has(k)) fees.set(k, await getProjectSetting(admin, pid, "fees_policies"));
      return fees.get(k);
    },
  };
}

// Send once per dedupe key; only a delivered (or permanently unaddressable) send is final.
async function sendOnce(admin, { dedupeKey, projectId, jobKey, notification, to, data, subject, recordType, recordId }, result) {
  const { data: prior } = await admin
    .from("notification_sends")
    .select("id, status")
    .eq("dedupe_key", dedupeKey)
    .maybeSingle();
  if (prior && ["sent", "no_address"].includes(prior.status)) {
    result.skipped += 1;
    return "duplicate";
  }

  let status;
  let error = null;
  if (!to) {
    status = "no_address";
  } else {
    const res = await sendNotificationEmail({ db: admin, projectId, notification, to, data, subject });
    status = res.ok ? "sent" : res.skipped ? "disabled" : res.error === "not_configured" ? "not_configured" : "failed";
    error = res.ok ? null : String(res.error || "");
  }

  const row = {
    project_id: projectId || null,
    dedupe_key: dedupeKey,
    job_key: jobKey,
    notification,
    channel: "email",
    recipient: to || null,
    record_type: recordType || null,
    record_id: recordId || null,
    status,
    error,
  };
  await admin.from("notification_sends").upsert(row, { onConflict: "dedupe_key" });

  if (status === "sent") result.created += 1;
  else if (status === "failed") result.errors.push(`${notification} → ${to}: ${error}`);
  else result.skipped += 1;
  return status;
}

// Team alert to every alert recipient in the project's notification settings.
async function alertTeam(admin, cfg, { projectId, jobKey, dedupeKey, subject, body, result }) {
  for (const email of cfg.alertEmails || []) {
    await sendOnce(
      admin,
      {
        dedupeKey: `${dedupeKey}:${email.toLowerCase()}`,
        projectId,
        jobKey,
        notification: "staff_alerts",
        to: email,
        subject,
        data: { recipientName: "", subject, body, paragraphs: body.split(/\n{2,}/), ctaUrl: appUrl() || undefined },
      },
      result,
    );
  }
}

// Tenant (plus lease-party tenants) to notify about a lease.
async function leaseRecipients(admin, lease, tenantsById) {
  const out = new Map();
  const t = tenantsById.get(lease.tenant_id);
  if (t?.email) out.set(t.email.toLowerCase(), { name: t.name, email: t.email });
  const { data: parties } = await admin
    .from("lease_parties")
    .select("name, email, role")
    .eq("lease_id", lease.id)
    .is("deleted_at", null);
  for (const p of parties || []) {
    if (p.email && p.role === "tenant") out.set(p.email.toLowerCase(), { name: p.name, email: p.email });
  }
  if (!out.size) out.set(`none:${lease.id}`, { name: lease.tenant_name || t?.name || "", email: "" });
  return [...out.values()];
}

// --- Lease expiry reminders + renewal-window alerts --------------------------

export const leaseRemindersJob = {
  key: "lease-reminders",
  label: "Lease expiry & renewal alerts",
  description: "Emails residents before their lease ends (60/30 days by default) and alerts your team when a lease enters its renewal window (Fees & Policies → renewal lead time).",
  schedule: "0 13 * * *",
  async run({ admin, now = new Date(), projectId }) {
    const result = emptyResult();
    const today = isoDay(now);
    const horizon = isoDay(new Date(now.getTime() + 366 * DAY));
    const leases = await select(admin, "leases", (q) =>
      scoped(q, projectId).gte("term_end", today).lte("term_end", horizon).in("status", ["Active", "Expiring soon", "Pending"]),
    );
    if (!leases.length) return result;
    const tenantsById = byId(await select(admin, "tenants", (q) => scoped(q, projectId)));
    const props = byId(await select(admin, "properties", (q) => scoped(q, projectId)));
    const units = byId(await select(admin, "units", (q) => scoped(q, projectId)));
    const cache = projectCache(admin);

    for (const lease of leases) {
      result.processed += 1;
      try {
        const pid = lease.project_id || null;
        const cfg = await cache.config(pid);
        const property = props.get(lease.property_id) || props.get(units.get(lease.unit_id)?.property_id);
        const policies = effectivePolicies({ company: await cache.fees(pid), property, lease });
        const days = daysBetween(today, lease.term_end);
        const unitLabel = units.get(lease.unit_id)?.label || lease.unit || "";

        // Resident heads-up at the smallest reminder bucket reached.
        const buckets = [...(cfg.leaseReminderDays || [60, 30])].map(Number).filter((n) => n > 0).sort((a, b) => a - b);
        const bucket = buckets.find((b) => days <= b);
        if (bucket) {
          for (const r of await leaseRecipients(admin, lease, tenantsById)) {
            await sendOnce(
              admin,
              {
                dedupeKey: `lease-expiring:${lease.id}:${lease.term_end}:${bucket}:${r.email.toLowerCase() || "none"}`,
                projectId: pid,
                jobKey: "lease-reminders",
                notification: "lease_expiring",
                to: r.email,
                recordType: "lease",
                recordId: lease.id,
                data: {
                  recipientName: r.name,
                  propertyName: property?.name || "",
                  unitLabel,
                  leaseEnd: formatMergeDate(lease.term_end),
                  daysLeft: String(days),
                  rent: money(lease.rent),
                  ctaUrl: appUrl() || undefined,
                },
              },
              result,
            );
          }
        }

        // Renewal window opens once per lease term.
        const window = Number(policies.renewalNoticeDays) || 90;
        if (days <= window) {
          const key = `renewal-window:${lease.id}:${lease.term_end}`;
          const { data: prior } = await admin.from("notification_sends").select("id").eq("dedupe_key", key).maybeSingle();
          if (!prior) {
            await admin.from("notification_sends").upsert(
              { project_id: pid, dedupe_key: key, job_key: "lease-reminders", notification: "staff_alerts", record_type: "lease", record_id: lease.id, status: "sent" },
              { onConflict: "dedupe_key" },
            );
            await logActivity(admin, {
              projectId: pid,
              ownerType: "lease",
              ownerId: lease.id,
              verb: "reminder",
              summary: `Renewal window open — lease ends ${formatMergeDate(lease.term_end)} (${days} days)`,
              actorName: "Scheduler",
            });
            await alertTeam(admin, cfg, {
              projectId: pid,
              jobKey: "lease-reminders",
              dedupeKey: key,
              subject: `Renewal window open: ${lease.name || lease.tenant_name || "lease"}`,
              body: `${lease.name || "A lease"}${unitLabel ? ` (${unitLabel})` : ""} ends on ${formatMergeDate(lease.term_end)} — ${days} days from today.\n\nYour renewal lead time is ${window} days. Prepare a renewal offer from the Renewals screen.`,
              result,
            });
            result.created += 1;
          }
        }
      } catch (e) {
        result.errors.push(`${lease.name || lease.id}: ${e?.message || e}`);
      }
    }
    return result;
  },
};

// --- Rent reminders ------------------------------------------------------------

export const rentRemindersJob = {
  key: "rent-reminders",
  label: "Rent reminders",
  description: "Emails residents on active leases a few days before rent is due (Notifications → reminder timing; due day from Fees & Policies).",
  schedule: "0 14 * * *",
  async run({ admin, now = new Date(), projectId }) {
    const result = emptyResult();
    const today = isoDay(now);
    const leases = await select(admin, "leases", (q) => scoped(q, projectId).eq("status", "Active").gt("rent", 0));
    if (!leases.length) return result;
    const tenantsById = byId(await select(admin, "tenants", (q) => scoped(q, projectId)));
    const props = byId(await select(admin, "properties", (q) => scoped(q, projectId)));
    const units = byId(await select(admin, "units", (q) => scoped(q, projectId)));
    const cache = projectCache(admin);

    for (const lease of leases) {
      result.processed += 1;
      try {
        const pid = lease.project_id || null;
        const cfg = await cache.config(pid);
        const property = props.get(lease.property_id) || props.get(units.get(lease.unit_id)?.property_id);
        const policies = effectivePolicies({ company: await cache.fees(pid), property, lease });
        const due = nextDueDate(policies.rentDueDay, now);
        const days = daysBetween(today, due);
        if (days > (Number(cfg.rentReminderDays) || 3)) {
          result.skipped += 1;
          continue;
        }
        const tenant = tenantsById.get(lease.tenant_id);
        for (const r of await leaseRecipients(admin, lease, tenantsById)) {
          await sendOnce(
            admin,
            {
              dedupeKey: `rent-reminder:${lease.id}:${due}:${r.email.toLowerCase() || "none"}`,
              projectId: pid,
              jobKey: "rent-reminders",
              notification: "rent_reminder",
              to: r.email,
              recordType: "lease",
              recordId: lease.id,
              data: {
                recipientName: r.name,
                amount: money(lease.rent),
                dueDate: formatMergeDate(due),
                daysUntilDue: String(days),
                balance: tenant ? money(tenant.balance) : "",
                propertyName: property?.name || "",
                unitLabel: units.get(lease.unit_id)?.label || lease.unit || "",
                ctaUrl: appUrl() || undefined,
              },
            },
            result,
          );
        }
      } catch (e) {
        result.errors.push(`${lease.name || lease.id}: ${e?.message || e}`);
      }
    }
    return result;
  },
};

// --- Expiring documents (COI / licenses / renters insurance / compliance) -----

// record_items row (snake) → the camel shape lib/compliance.js expects.
const toItem = (r) => ({
  id: r.id,
  projectId: r.project_id || null,
  ownerType: r.owner_type,
  ownerId: r.owner_id,
  kind: r.kind,
  name: r.name || "",
  status: r.status || "",
  endsOn: r.ends_on || null,
  metadata: r.metadata || {},
});

// Smallest milestone reached (days ≤ m), "0" once expired; null before the first.
const milestone = (days, marks) => {
  if (days === null) return null;
  const hit = [...marks].sort((a, b) => a - b).find((m) => days <= m);
  return hit === undefined ? null : String(Math.max(0, hit));
};

// The record to remind about: the soonest in-force one, else the latest expired.
function reminderTarget(items, windowDays) {
  const live = items.filter((i) => String(i.status).toLowerCase() !== "cancelled");
  if (!live.length) return null;
  const c = complianceOf(live, { windowDays });
  if (c.state === "compliant") return null;
  const dated = live.filter((i) => i.endsOn).sort((a, b) => String(a.endsOn).localeCompare(String(b.endsOn)));
  return dated.find((i) => i.endsOn === c.soonest) || dated[dated.length - 1] || null;
}

const INACTIVE_VENDOR = new Set(["inactive", "do not use"]);
const ACTIVE_TENANT = new Set(["Current", "Late", "Notice"]);
const W9_MESSAGE = "We don't have a W-9 on file. Please send one before January so we can issue your 1099.";

export const expiringDocumentsJob = {
  key: "expiring-documents",
  label: "Expiring documents",
  description:
    "Vendor COIs (30/14/0 days) and required licenses (30/0), renters insurance (30/7/0, plus missing-policy reminders), pet vaccinations, parking permits, owner agreements, and missing W-9s before January — with a daily team digest.",
  schedule: "0 15 * * *",
  async run({ admin, now = new Date(), projectId }) {
    const result = emptyResult();
    const today = isoDay(now);
    const cache = projectCache(admin);
    const digest = new Map();
    const note = (pid, line) => digest.set(pid || "none", [...(digest.get(pid || "none") || []), line]);

    const items = (
      await select(admin, "record_items", (q) =>
        scoped(q, projectId).in("kind", ["insurance_policy", "license", "compliance_item", "pet", "vehicle"]),
      )
    ).map(toItem);
    const vendors = await select(admin, "vendors", (q) => scoped(q, projectId));
    const tenants = await select(admin, "tenants", (q) => scoped(q, projectId));
    const owners = await select(admin, "owners", (q) => scoped(q, projectId));
    const parties = { vendor: byId(vendors), tenant: byId(tenants), owner: byId(owners) };
    const itemsOf = (ownerType, ownerId, kind) =>
      items.filter((i) => i.ownerType === ownerType && i.ownerId === ownerId && i.kind === kind);

    // Remind a party once per (subject, milestone); staff-worthy ones also go to the digest.
    const remind = async ({ pid, party, partyType, subjectKey, mark, documentName, documentType, endsOn, days, message, staff }) => {
      result.processed += 1;
      const status = await sendOnce(
        admin,
        {
          dedupeKey: `doc-expiring:${subjectKey}:${endsOn || "none"}:${mark}`,
          projectId: pid,
          jobKey: "expiring-documents",
          notification: "document_expiring",
          to: party?.email || "",
          recordType: partyType,
          recordId: party?.id,
          data: {
            recipientName: party?.contact_name || party?.name || "",
            documentName,
            documentType,
            expiresOn: endsOn ? formatMergeDate(endsOn) : "",
            daysLeft: days === null ? "" : String(days),
            expired: days !== null && days < 0 ? "yes" : "",
            missing: endsOn ? "" : "yes",
            message: message || "",
            ctaUrl: appUrl() || undefined,
          },
        },
        result,
      );
      if (status !== "duplicate" && staff) {
        const when = message || (days < 0 ? `expired ${formatMergeDate(endsOn)}` : `expires ${formatMergeDate(endsOn)}`);
        note(pid, `• ${documentName} — ${party?.name || "Unknown"}: ${when}`);
      }
    };

    const runPolicy = async ({ pid, party, partyType, kind, marks, label, staffOnExpiry }) => {
      const cfg = await cache.config(pid);
      const window = Math.max(...marks, Number(cfg.documentExpiryDays) || EXPIRING_WINDOW_DAYS);
      const target = reminderTarget(itemsOf(partyType, party.id, kind), window);
      if (!target?.endsOn) return;
      const days = daysUntil(target.endsOn, now);
      const mark = milestone(days, marks);
      if (mark === null) return;
      await remind({
        pid,
        party,
        partyType,
        subjectKey: `${kind}:${target.id}`,
        mark,
        documentName: target.name || label,
        documentType: label,
        endsOn: target.endsOn,
        days,
        staff: staffOnExpiry && days <= 0,
      });
    };

    for (const v of vendors) {
      try {
        const m = v.metadata || {};
        if (INACTIVE_VENDOR.has(String(v.status || "").toLowerCase())) continue;
        const pid = v.project_id || null;
        // (a) COI at 30/14/0 days, staff alert on expiry; the legacy insurance_expiry column is a fallback.
        if (!m.coiWaived) {
          if (itemsOf("vendor", v.id, "insurance_policy").length) {
            await runPolicy({ pid, party: v, partyType: "vendor", kind: "insurance_policy", marks: [30, 14, 0], label: "Certificate of insurance (COI)", staffOnExpiry: true });
          } else if (v.insurance_expiry) {
            const days = daysUntil(v.insurance_expiry, now);
            const mark = milestone(days, [30, 14, 0]);
            if (mark !== null) {
              await remind({ pid, party: v, partyType: "vendor", subjectKey: `vendor-coi:${v.id}`, mark, documentName: "Certificate of insurance (COI)", documentType: "Certificate of insurance (COI)", endsOn: v.insurance_expiry, days, staff: days <= 0 });
            }
          }
        }
        // (b) License at 30/0 days when one is required.
        if (m.licenseRequired) {
          await runPolicy({ pid, party: v, partyType: "vendor", kind: "license", marks: [30, 0], label: "License", staffOnExpiry: true });
        }
        // Missing W-9 before January (December only, once a year).
        if (now.getUTCMonth() === 11 && !m.w9OnFile) {
          await remind({ pid, party: v, partyType: "vendor", subjectKey: `w9:vendor:${v.id}:${now.getUTCFullYear()}`, mark: "dec", documentName: "W-9", documentType: "W-9 tax form", endsOn: null, days: null, message: W9_MESSAGE, staff: true });
        }
      } catch (e) {
        result.errors.push(`${v.name || v.id}: ${e?.message || e}`);
      }
    }

    for (const t of tenants) {
      try {
        if (t.status === "Past") continue;
        const pid = t.project_id || null;
        const m = t.metadata || {};
        // (c) Renters insurance at 30/7/0 days, or a monthly missing-policy reminder.
        if (!m.insuranceWaived) {
          const policies = itemsOf("tenant", t.id, "insurance_policy").filter((i) => String(i.status).toLowerCase() !== "cancelled");
          if (policies.length) {
            await runPolicy({ pid, party: t, partyType: "tenant", kind: "insurance_policy", marks: [30, 7, 0], label: "Renters insurance" });
          } else if (ACTIVE_TENANT.has(t.status)) {
            await remind({ pid, party: t, partyType: "tenant", subjectKey: `renters-missing:${t.id}:${today.slice(0, 7)}`, mark: "missing", documentName: "Renters insurance", documentType: "Renters insurance", endsOn: null, days: null, message: "Your lease requires renters insurance and there's no policy on file. Please upload your declarations page in the resident portal." });
          }
        }
        // Lower priority: pet vaccinations and parking permits (30/0 days).
        for (const [kind, label] of [["pet", "Pet vaccination"], ["vehicle", "Parking permit"]]) {
          for (const it of itemsOf("tenant", t.id, kind)) {
            if (!it.endsOn || String(it.status).toLowerCase() === "cancelled") continue;
            const days = daysUntil(it.endsOn, now);
            const mark = milestone(days, [30, 0]);
            if (mark === null || days < -30) continue;
            await remind({ pid, party: t, partyType: "tenant", subjectKey: `${kind}:${it.id}`, mark, documentName: it.name ? `${label} — ${it.name}` : label, documentType: label, endsOn: it.endsOn, days });
          }
        }
      } catch (e) {
        result.errors.push(`${t.name || t.id}: ${e?.message || e}`);
      }
    }

    for (const o of owners) {
      try {
        if (o.status === "Inactive") continue;
        const pid = o.project_id || null;
        const m = o.metadata || {};
        // Management agreement ending within 60 days (60/30/0).
        if (m.agreementEnd) {
          const days = daysUntil(m.agreementEnd, now);
          const mark = milestone(days, [60, 30, 0]);
          if (mark !== null && days >= -30) {
            await remind({ pid, party: o, partyType: "owner", subjectKey: `owner-agreement:${o.id}`, mark, documentName: "Management agreement", documentType: "Management agreement", endsOn: m.agreementEnd, days, staff: true });
          }
        }
        if (now.getUTCMonth() === 11 && !m.w9OnFile && m.requires1099 !== false) {
          await remind({ pid, party: o, partyType: "owner", subjectKey: `w9:owner:${o.id}:${now.getUTCFullYear()}`, mark: "dec", documentName: "W-9", documentType: "W-9 tax form", endsOn: null, days: null, message: W9_MESSAGE, staff: true });
        }
      } catch (e) {
        result.errors.push(`${o.name || o.id}: ${e?.message || e}`);
      }
    }

    // Generic compliance items (any owner): staff digest at 30/0 days.
    for (const it of items.filter((i) => i.kind === "compliance_item" && i.endsOn && String(i.status).toLowerCase() !== "cancelled")) {
      const days = daysUntil(it.endsOn, now);
      const mark = milestone(days, [30, 0]);
      if (mark === null || days < -30) continue;
      const key = `doc-staff:compliance:${it.id}:${it.endsOn}:${mark}`;
      const { data: prior } = await admin.from("notification_sends").select("id").eq("dedupe_key", key).maybeSingle();
      if (prior) continue;
      await admin.from("notification_sends").upsert(
        { project_id: it.projectId, dedupe_key: key, job_key: "expiring-documents", notification: "staff_alerts", record_type: it.ownerType, record_id: it.ownerId, status: "sent" },
        { onConflict: "dedupe_key" },
      );
      const owner = parties[it.ownerType]?.get(it.ownerId);
      note(it.projectId, `• ${it.name || "Compliance item"}${owner?.name ? ` — ${owner.name}` : ""}: ${days < 0 ? "expired" : "expires"} ${formatMergeDate(it.endsOn)}`);
      result.created += 1;
    }

    // One team digest per project per day.
    for (const [pidKey, lines] of digest) {
      const pid = pidKey === "none" ? null : pidKey;
      await alertTeam(admin, await cache.config(pid), {
        projectId: pid,
        jobKey: "expiring-documents",
        dedupeKey: `doc-digest:${pidKey}:${today}`,
        subject: `${lines.length} compliance item${lines.length === 1 ? "" : "s"} need attention`,
        body: `These documents are expiring, expired, or missing:\n\n${lines.join("\n")}`,
        result,
      });
    }
    return result;
  },
};

// --- Scheduled announcements -----------------------------------------------------

export const scheduledAnnouncementsJob = {
  key: "scheduled-announcements",
  label: "Scheduled announcements",
  description: "Sends announcements whose scheduled date has arrived.",
  schedule: "0 12 * * *",
  async run({ admin, now = new Date(), projectId }) {
    const result = emptyResult();
    const rows = await select(admin, "announcements", (q) =>
      scoped(q, projectId).eq("status", "Scheduled").lte("scheduled_for", isoDay(now)),
    );
    for (const a of rows) {
      result.processed += 1;
      try {
        const { delivery } = await deliverAnnouncement(admin, a, { now });
        result.created += delivery.sent + delivery.logged;
        if (delivery.failed) result.errors.push(`${a.name}: ${delivery.failed} failed`);
      } catch (e) {
        result.errors.push(`${a.name}: ${e?.message || e}`);
      }
    }
    return result;
  },
};
