import { emptyResult, projectError } from "@/lib/jobs/contract";
import { getProjectSetting } from "@/lib/messaging/context";
import { getNotificationConfig, sendNotificationEmail } from "@/lib/email/notifications";
import { notifyMembers } from "@/lib/notifications/server";
import { money } from "@/lib/reports/format";
import { AREAS, areasForRole, roleKeyOf } from "./constants";
import { changesSince, moneyAtStake, rankSignals } from "./rank";

// Daily briefings (ORCH-06, server-only, hourly job). Once the project's send time has passed in the
// company timezone, each recipient gets one briefing a day (property.briefings is unique per member per
// day): what changed since their last briefing (new, worse, resolved), the top 5 signals for their role's
// areas and their open review items. Recipients are the active members with an email, plus the project's
// creator when they aren't a member (as Owner). In-app through @geiger/notify (which applies each person's
// mute preferences); email for the configured roles via the geiger-dash template property.daily_briefing,
// falling back to property.message. ORCH_BRIEFING_DRY_RUN=1 writes the rows without sending anything.

const DAY = 86400000;
const TOP = 5;
const appBase = () => `${(process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "")}${process.env.NEXT_PUBLIC_BASE_PATH || ""}`;
const norm = (s) => String(s || "").trim().toLowerCase();

// Local date and HH:MM in a timezone (UTC when the zone is missing or invalid).
export function localClock(now, timeZone) {
  const fmt = (tz) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  let parts;
  try {
    parts = fmt(timeZone || "UTC");
  } catch {
    parts = fmt("UTC");
  }
  const get = (t) => parts.find((p) => p.type === t)?.value || "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

async function briefingProjects(admin) {
  const { data, error } = await admin.from("team_members").select("project_id").is("deleted_at", null).not("project_id", "is", null);
  if (error) throw new Error(`team_members: ${error.message}`);
  return [...new Set((data || []).map((r) => r.project_id))];
}

const snapshot = (s) => ({
  id: s.id,
  title: s.title,
  why: s.why,
  area: s.area,
  category: s.category,
  urgency: s.urgency,
  impact: s.impact_amount === null ? null : Number(s.impact_amount),
  score: Number(s.score) || 0,
});

// The briefing content for one recipient (pure; exported for tests).
export function buildBriefing({ signals, areas, since, reviewOpen = 0, reviewAssigned = 0 }) {
  const changes = changesSince(signals, since, { areas });
  return {
    areas,
    since,
    counts: {
      open: rankSignals(signals, { areas }).length,
      new: changes.new.length,
      worse: changes.worse.length,
      resolved: changes.resolved.length,
      moneyAtStake: moneyAtStake(signals, { areas }),
      reviewOpen,
      reviewAssigned,
    },
    new: changes.new.map((s) => s.id),
    worse: changes.worse.map((s) => s.id),
    resolved: changes.resolved.map((s) => s.id),
    changes: [
      ...changes.new.slice(0, 5).map((s) => ({ kind: "New", title: s.title })),
      ...changes.worse.slice(0, 5).map((s) => ({ kind: "Worse", title: s.title })),
      ...changes.resolved.slice(0, 5).map((s) => ({ kind: "Resolved", title: s.title })),
    ],
    top: rankSignals(signals, { areas, limit: TOP }).map(snapshot),
  };
}

const headlineOf = (b) =>
  b.counts.open
    ? `${b.counts.open} signal${b.counts.open === 1 ? "" : "s"} for your attention${b.counts.new ? ` · ${b.counts.new} new` : ""}`
    : "Nothing needs your attention today";

function plainBody(b, url) {
  const lines = [
    `Since your last briefing: ${b.counts.new} new, ${b.counts.worse} worse, ${b.counts.resolved} resolved. ${b.counts.reviewOpen} review item${b.counts.reviewOpen === 1 ? "" : "s"} open${b.counts.reviewAssigned ? `, ${b.counts.reviewAssigned} assigned to you` : ""}.`,
  ];
  if (b.top.length) lines.push(b.top.map((s, i) => `${i + 1}. ${s.title}${s.impact ? ` (${money(s.impact)})` : ""}\n${s.why}`).join("\n\n"));
  if (url) lines.push(`Open your briefing: ${url}`);
  return lines.join("\n\n");
}

async function sendEmail(admin, projectId, r, b, url) {
  const data = {
    recipientName: r.name || "",
    headline: headlineOf(b),
    areas: b.areas.map((a) => AREAS[a]?.label || a).join(", "),
    counts: { ...b.counts, moneyAtStake: money(b.counts.moneyAtStake) },
    signals: b.top.map((s) => ({ title: s.title, why: s.why, impact: s.impact ? money(s.impact) : "", area: AREAS[s.area]?.label || s.area, urgency: s.urgency })),
    changes: b.changes,
    briefingUrl: url,
  };
  const subject = `Your briefing · ${headlineOf(b)}`;
  const first = await sendNotificationEmail({ projectId, notification: "daily_briefing", template: "property.daily_briefing", to: r.email, data, subject, db: admin });
  if (first.ok || first.skipped || first.error === "not_configured") return first.ok ? "sent" : first.skipped ? "disabled" : "not_configured";
  const fallback = await sendNotificationEmail({
    projectId,
    notification: "daily_briefing",
    template: "property.message",
    to: r.email,
    data: { recipientName: r.name || "", subject, body: plainBody(b, url), ctaUrl: url },
    subject,
    db: admin,
  });
  return fallback.ok ? "sent_fallback" : `failed: ${fallback.error || first.error}`;
}

// Active members with an email, plus the project creator (as Owner) when no member has their address.
async function recipientsOf(admin, projectId, members) {
  const out = (members || [])
    .filter((m) => m.status === "Active" && m.email)
    .map((m) => ({ memberId: m.id, userId: m.metadata?.userId || null, name: m.name, email: m.email, roleKey: roleKeyOf(m.role || "manager") }));
  const { data: project } = await admin.schema("public").from("projects").select("created_by").eq("id", projectId).maybeSingle();
  if (project?.created_by && !out.some((r) => r.userId === project.created_by)) {
    const { data } = await admin.auth.admin.getUserById(project.created_by).catch(() => ({ data: null }));
    const user = data?.user;
    if (user && !out.some((r) => norm(r.email) === norm(user.email))) {
      out.push({ memberId: null, userId: user.id, name: user.user_metadata?.full_name || user.user_metadata?.name || "", email: user.email || "", roleKey: "owner" });
    }
  }
  return out;
}

export async function runProjectBriefings(admin, projectId, { now = new Date(), dryRun = process.env.ORCH_BRIEFING_DRY_RUN === "1", force = false } = {}) {
  const out = { processed: 0, created: 0, skipped: 0, errors: [] };
  const config = await getNotificationConfig(projectId, admin);
  const prefs = config.briefing || {};
  if (prefs.enabled === false) return { ...out, skipped: 1 };
  const company = (await getProjectSetting(admin, projectId, "company_profile")) || {};
  const clock = localClock(now, company.timezone);
  if (!force && clock.time < (prefs.sendTime || "07:00")) return out;

  const [{ data: members, error: mErr }, { data: done }, { data: signals, error: sErr }, { data: reviews }] = await Promise.all([
    admin.from("team_members").select("id, name, email, role, status, metadata").eq("project_id", projectId).is("deleted_at", null),
    admin.from("briefings").select("member_id, user_id").eq("project_id", projectId).eq("date", clock.date),
    admin
      .from("signals")
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .or(`status.in.(open,acknowledged,actioned),resolved_at.gte.${new Date(now.getTime() - 3 * DAY).toISOString()}`),
    admin.from("review_items").select("id, assignee_id").eq("project_id", projectId).eq("status", "open").is("deleted_at", null),
  ]);
  if (mErr) throw new Error(`team_members: ${mErr.message}`);
  if (sErr) throw new Error(`signals: ${sErr.message}`);
  const sentTo = new Set((done || []).map((r) => r.member_id || `user:${r.user_id}`));
  const emailRoles = new Set((prefs.emailRoles || []).map((r) => roleKeyOf(r)));
  const url = `${appBase()}/project/${projectId}/briefing`;

  for (const r of await recipientsOf(admin, projectId, members)) {
    out.processed += 1;
    if (sentTo.has(r.memberId || `user:${r.userId}`)) {
      out.skipped += 1;
      continue;
    }
    try {
      const areas = areasForRole(r.roleKey, prefs.roleAreas);
      let prevQ = admin.from("briefings").select("sent_at, created_at").eq("project_id", projectId).lt("date", clock.date);
      prevQ = r.memberId ? prevQ.eq("member_id", r.memberId) : prevQ.is("member_id", null).eq("user_id", r.userId);
      const { data: prev } = await prevQ.order("date", { ascending: false }).limit(1);
      const since = prev?.[0]?.sent_at || prev?.[0]?.created_at || new Date(now.getTime() - DAY).toISOString();
      const b = buildBriefing({
        signals: signals || [],
        areas,
        since,
        reviewOpen: (reviews || []).length,
        reviewAssigned: r.memberId ? (reviews || []).filter((x) => x.assignee_id === r.memberId).length : 0,
      });
      // The unique (project, member, date) row is the once-a-day lock; a lost race skips the send.
      const { data: claimed, error } = await admin
        .from("briefings")
        .upsert(
          { project_id: projectId, member_id: r.memberId, user_id: r.userId, email: r.email, role_key: r.roleKey, date: clock.date, summary: b },
          { onConflict: "project_id,member_id,date", ignoreDuplicates: true },
        )
        .select("id");
      if (error) throw new Error(error.message);
      if (!claimed?.length) {
        out.skipped += 1;
        continue;
      }
      let emailStatus = emailRoles.has(r.roleKey) && r.email ? "dry_run" : "not_sent";
      let inApp = null;
      if (!dryRun) {
        inApp = await notifyMembers(admin, {
          projectId,
          ...(r.memberId ? { memberIds: [r.memberId] } : { userIds: [r.userId] }),
          type: "daily_briefing",
          category: "update",
          icon: "Sunrise",
          title: headlineOf(b),
          body: b.top[0] ? `Top: ${b.top[0].title}` : "All clear for your areas.",
          url: `/project/${projectId}/briefing`,
          dedupeKey: `briefing:${projectId}:${r.memberId || r.userId}:${clock.date}`,
          expiresIn: "3d",
        });
        emailStatus = emailRoles.has(r.roleKey) && r.email ? await sendEmail(admin, projectId, r, b, url) : "not_sent";
      }
      await admin
        .from("briefings")
        .update({ sent_at: new Date().toISOString(), email_status: emailStatus, metadata: { inApp: inApp ? { delivered: inApp.delivered } : null, dryRun } })
        .eq("id", claimed[0].id);
      out.created += 1;
    } catch (e) {
      out.errors.push(`${r.name || r.email}: ${e?.message || e}`);
    }
  }
  return out;
}

export async function runBriefings({ admin, now = new Date(), projectId = null } = {}) {
  const result = emptyResult();
  if (!admin) return { ...result, errors: ["Service role not configured"] };
  let projects;
  try {
    projects = projectId ? [projectId] : await briefingProjects(admin);
  } catch (e) {
    return { ...result, errors: [e?.message || String(e)] };
  }
  for (const pid of projects) {
    try {
      const r = await runProjectBriefings(admin, pid, { now });
      result.processed += r.processed;
      result.created += r.created;
      result.skipped += r.skipped;
      result.errors.push(...r.errors.map((e) => projectError(pid, e)));
    } catch (e) {
      result.errors.push(projectError(pid, e?.message || e));
    }
  }
  return result;
}
