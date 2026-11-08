import { getNotificationConfig, sendNotificationEmail } from "@/lib/email/notifications";
import { sendSuiteEmail } from "@/lib/email/client";
import { notifyMembers } from "@/lib/notifications/server";
import { normalizeRoleId } from "@/lib/rbac";
import { alertReason } from "./schedule";
import { projectToday } from "./business_date";

// Scheduled-job alerts (CORE-10, server-only). A project's failed or partial scheduled run, a second skipped_locked in a row, or a
// missed run → an in-app notice to the project's admins (@geiger/notify), the staff_alerts email to its alert recipients and a
// [jobs.alert] log line, at most once per job per project per business day (claimed in notification_sends). Operator alerts
// (a broken cross-project run, a job the scheduler stopped triggering) go by email to JOBS_ALERT_EMAILS. `deps` swaps the senders in tests.

const ALERT_ROLES = new Set(["owner", "admin", "manager"]);
const UNIQUE = "23505";
const appBase = () => `${(process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "")}${process.env.NEXT_PUBLIC_BASE_PATH || ""}`;
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const when = (at) => (at ? new Date(at).toISOString().replace("T", " ").slice(0, 16) + " UTC" : "a while");

export const jobsUrl = (projectId) => `/project/${projectId}/automations?jobs=open`;

// Alert wording per kind: failed | partial | locked | missed (pure).
export function alertCopy({ label, kind, errors = [], since = null, rerun = "" }) {
  const first = errors[0] ? `First error: ${errors[0]}` : "";
  const more = errors.length > 1 ? ` (+${errors.length - 1} more)` : "";
  const fix = "Open Automations → Scheduled Jobs to see the run and its runbook, then use Run now once it's fixed.";
  const byKind = {
    failed: { title: `${label} failed`, lead: `The scheduled ${label} run failed${errors.length ? ` with ${plural(errors.length, "error")}` : ""}.` },
    partial: { title: `${label} finished with errors`, lead: `The scheduled ${label} run finished, but ${plural(errors.length, "item")} failed.` },
    locked: { title: `${label} is stuck`, lead: `The scheduled ${label} run was skipped twice in a row because an earlier run was still in progress.` },
    missed: {
      title: `${label} didn't run on schedule`,
      lead: `${label} hasn't completed a scheduled run since ${when(since)}.${rerun ? ` The watchdog ran it now: ${rerun}.` : ""}`,
    },
  };
  const c = byKind[kind] || byKind.failed;
  const paragraphs = [c.lead, first && `${first}${more}`, fix].filter(Boolean);
  return { title: c.title, subject: c.title, body: paragraphs.join("\n\n"), paragraphs };
}

// The project's admins (Owner, Admin and Manager roles; the project's creator is added by notifyMembers).
async function alertMembers(admin, projectId) {
  const { data } = await admin.from("team_members").select("id, role, status").eq("project_id", projectId).is("deleted_at", null);
  return (data || []).filter((m) => m.status !== "Disabled" && ALERT_ROLES.has(normalizeRoleId(m.role))).map((m) => m.id);
}

const sendStatus = (res) => (res.ok ? "sent" : res.skipped ? "disabled" : res.error === "not_configured" ? "not_configured" : "failed");

// One alert for a project: claim the day's dedupe key, then in-app, then email; a claimed key means it already went out today.
async function raiseAlert(admin, { job, projectId, runId, kind, errors, since, rerun, now }, deps = {}) {
  const label = job.label || job.key;
  console.error("[jobs.alert]", JSON.stringify({ job: job.key, projectId, kind, runId: runId || null, errors: (errors || []).slice(0, 3) }));
  const day = await projectToday(admin, projectId, now);
  const key = `job-alert:${job.key}:${projectId}:${day}`;
  const claim = { project_id: projectId, dedupe_key: key, job_key: job.key, notification: "staff_alerts", channel: "in_app", record_type: "job_run", record_id: runId || null, status: "sent", metadata: { kind } };
  const { error } = await admin.from("notification_sends").insert(claim);
  if (error) {
    if (error.code !== UNIQUE) console.error("[jobs.alert.claim]", error.message);
    return { key, deduped: error.code === UNIQUE };
  }
  const copy = alertCopy({ label, kind, errors, since, rerun });
  const path = jobsUrl(projectId);
  const inApp = await (deps.notify || notifyMembers)(admin, {
    projectId,
    memberIds: await alertMembers(admin, projectId),
    includeOwner: true,
    title: copy.title,
    body: copy.paragraphs[0],
    url: path,
    category: "jobs",
    tone: "danger",
    priority: kind === "partial" ? "normal" : "high",
    dedupeKey: key,
    data: { jobKey: job.key, runId: runId || null, kind },
  });
  const cfg = await getNotificationConfig(projectId, admin);
  const emails = [];
  const recipients = new Map((cfg.alertEmails || []).map((e) => String(e).trim()).filter(Boolean).map((e) => [e.toLowerCase(), e]));
  for (const to of recipients.values()) {
    const data = { recipientName: "", subject: copy.subject, body: copy.body, paragraphs: copy.paragraphs, ctaUrl: appBase() ? `${appBase()}${path}` : undefined };
    const res = await (deps.sendEmail || sendNotificationEmail)({ db: admin, projectId, notification: "staff_alerts", to, subject: copy.subject, data });
    const status = sendStatus(res);
    await admin
      .from("notification_sends")
      .upsert({ ...claim, dedupe_key: `${key}:${to.toLowerCase()}`, channel: "email", recipient: to, status, error: res.ok ? null : String(res.error || "") }, { onConflict: "dedupe_key" });
    emails.push({ to, status });
  }
  return { key, inApp, emails };
}

// After a scheduled project run: alert on failed, partial, or a second skipped_locked in a row.
export async function alertJobOutcome(admin, { job, projectId, runId, status, prevStatus, errors = [], now = new Date() }, deps = {}) {
  const kind = alertReason(status, prevStatus);
  if (!kind || !projectId) return null;
  try {
    return await raiseAlert(admin, { job, projectId, runId, kind, errors, now }, deps);
  } catch (e) {
    console.error("[jobs.alert]", e);
    return null;
  }
}

// Watchdog: the project's last scheduled success is too old (rerun = what the watchdog's own run did).
export async function alertMissedRun(admin, { job, projectId, since, rerun = "", now = new Date() }, deps = {}) {
  try {
    return await raiseAlert(admin, { job, projectId, kind: "missed", since, rerun, now }, deps);
  } catch (e) {
    console.error("[jobs.alert]", e);
    return null;
  }
}

export const opsRecipients = () => (process.env.JOBS_ALERT_EMAILS || "").split(",").map((s) => s.trim()).filter(Boolean);

// Operator alert (no project): one email per day per subject key, recorded on the operator run row (metadata.opsAlertedOn).
export async function alertOps(admin, { jobKey, runId, subject, paragraphs, now = new Date() }, deps = {}) {
  console.error("[jobs.alert]", JSON.stringify({ scope: "operator", job: jobKey, runId: runId || null, subject }));
  const to = opsRecipients();
  if (!to.length || !runId) return { emails: [] };
  const day = now.toISOString().slice(0, 10);
  try {
    const { data: sent } = await admin
      .from("job_runs")
      .select("id")
      .eq("job_key", jobKey)
      .is("project_id", null)
      .eq("metadata->>opsAlertedOn", day)
      .is("deleted_at", null)
      .limit(1);
    if (sent?.length) return { emails: [], deduped: true };
    const emails = [];
    for (const address of to) {
      const res = await (deps.sendSuiteEmail || sendSuiteEmail)({ template: "property.message", to: address, subject, data: { recipientName: "", subject, body: paragraphs.join("\n\n"), paragraphs } });
      emails.push({ to: address, status: sendStatus(res) });
    }
    const { data: row } = await admin.from("job_runs").select("metadata").eq("id", runId).maybeSingle();
    await admin.from("job_runs").update({ metadata: { ...(row?.metadata || {}), opsAlertedOn: day } }).eq("id", runId);
    return { emails };
  } catch (e) {
    console.error("[jobs.alert.ops]", e);
    return { emails: [] };
  }
}
