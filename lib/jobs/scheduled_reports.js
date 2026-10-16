import { emptyResult } from "./contract";
import { sendSuiteEmail } from "@/lib/email/client";
import { getReport, resolveFilters, runReport } from "@/lib/reports/catalog";
import { loadServerSources } from "@/lib/reports/sources_server";
import { rowsWithTotals, sectionsCsv } from "@/lib/reports/csv";
import { reportHtml } from "@/lib/reports/html";
import { cellText } from "@/lib/reports/format";
import { isDue, periodKeyFor } from "@/lib/reports/schedule";

// Scheduled reports (server-only): for every Active schedule in
// property.report_schedules that is due today, compute the report from the
// project's data, render a summary + CSV + HTML, and email the summary to each
// recipient via the suite email API (template "property.scheduled_report").
// Each schedule × period is recorded once in property.report_runs (unique), so
// re-runs on the same day never re-send; failed / unconfigured runs retry.

const TEMPLATE = "property.scheduled_report";
const EMAIL_ROWS = 15;
const EMAIL_COLS = 6;

const appBase = () => `${(process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "")}${process.env.NEXT_PUBLIC_BASE_PATH || ""}`;
const slug = (title) => String(title || "").toLowerCase().replace(/[^a-z0-9]+/g, "");

// The first table worth previewing in the email body.
function previewTable(sections) {
  const s = sections.find((x) => x.kind !== "chart" && x.columns?.length && x.rows?.length) || null;
  if (!s) return { tableTitle: "", tableColumns: [], tableRows: [], moreRows: 0 };
  const cols = s.columns.slice(0, EMAIL_COLS);
  const rows = rowsWithTotals(s);
  const head = rows.slice(0, EMAIL_ROWS);
  return {
    tableTitle: s.title,
    tableColumns: cols.map((c) => c.header),
    tableRows: head.map((r) =>
      cols.map((c, i) => (r === s.totals && i === 0 ? r.label || r[c.key] || "Totals" : r === s.totals && (r[c.key] === undefined || r[c.key] === "") ? "" : cellText(c, r))),
    ),
    moreRows: Math.max(0, rows.length - head.length),
  };
}

async function existingRun(admin, scheduleId, periodKey) {
  const { data, error } = await admin
    .from("report_runs")
    .select("id, status")
    .eq("schedule_id", scheduleId)
    .eq("period_key", periodKey)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data || null;
}

async function runSchedule(admin, s, { now, cache }) {
  const def = getReport(s.report_key);
  if (!def) throw new Error(`Unknown report "${s.report_key}"`);
  const data = await loadServerSources(admin, s.project_id, def.sources, cache);
  const filters = resolveFilters(def, s.filters || {}, data, now);
  const result = runReport(def, data, filters, now);
  const sections = result.empty ? [] : result.sections.filter((x) => x.columns?.length);
  const generatedAt = now.toISOString().slice(0, 16).replace("T", " ") + " UTC";
  const csv = sectionsCsv(sections);
  const html = reportHtml({
    title: result.title,
    subtitle: [result.subtitle, result.periodLabel].filter(Boolean).join(" · "),
    generatedAt,
    stats: result.stats,
    sections,
  });
  const rowCount = sections.reduce((n, x) => n + (x.rows?.length || 0), 0);
  const reportUrl = appBase() && s.project_id ? `${appBase()}/project/${s.project_id}/${slug(def.title)}` : "";
  const base = {
    reportName: s.name || def.title,
    reportTitle: result.title,
    period: result.periodLabel,
    subtitle: result.subtitle || "",
    generatedAt,
    summary: result.empty ? [{ label: result.empty.title, value: "", footer: result.empty.description }] : result.stats,
    rowCount,
    reportUrl,
    ...previewTable(sections),
  };
  const recipients = Array.isArray(s.recipients) ? s.recipients.filter(Boolean) : [];
  let sent = 0;
  const failures = [];
  let notConfigured = false;
  for (const to of recipients) {
    const res = await sendSuiteEmail({
      template: TEMPLATE,
      to,
      subject: `${base.reportName} · ${base.period}`,
      data: { ...base, recipientName: to.split("@")[0] },
    });
    if (res.ok) sent += 1;
    else if (res.error === "not_configured") notConfigured = true;
    else failures.push(`${to}: ${res.error}`);
  }
  const status = sent === recipients.length && sent > 0 ? "sent" : sent > 0 ? "partial" : notConfigured ? "not_configured" : "failed";
  return { status, sent, recipients, failures, csv, html, rowCount, summary: base.summary };
}

export async function runScheduledReports({ admin, now = new Date(), projectId = null }) {
  const result = emptyResult();
  let q = admin.from("report_schedules").select("*").is("deleted_at", null).eq("status", "Active");
  if (projectId) q = q.eq("project_id", projectId);
  const { data: schedules, error } = await q;
  if (error) {
    result.errors.push(`report_schedules: ${error.message}`);
    return result;
  }
  const cache = new Map();
  for (const row of schedules || []) {
    const s = { ...row, dayOfWeek: row.day_of_week, dayOfMonth: row.day_of_month };
    if (!isDue(s, now)) {
      result.skipped += 1;
      continue;
    }
    const periodKey = periodKeyFor(s, now);
    try {
      const prior = await existingRun(admin, s.id, periodKey);
      if (prior?.status === "sent") {
        result.skipped += 1;
        continue;
      }
      result.processed += 1;
      const run = await runSchedule(admin, s, { now, cache });
      const { error: logError } = await admin.from("report_runs").upsert(
        {
          project_id: s.project_id,
          schedule_id: s.id,
          report_key: s.report_key,
          period_key: periodKey,
          status: run.status,
          recipients: run.recipients,
          sent_count: run.sent,
          row_count: run.rowCount,
          summary: run.summary,
          csv: run.csv,
          html: run.html,
          error: run.failures.join("; ") || (run.status === "not_configured" ? "Email delivery is not configured" : null),
          created_by: s.created_by || null,
        },
        { onConflict: "schedule_id,period_key" },
      );
      if (logError) result.errors.push(`report_runs ${s.id}: ${logError.message}`);
      await admin.from("report_schedules").update({ last_run_at: now.toISOString(), last_status: run.status }).eq("id", s.id);
      if (run.sent) result.created += 1;
      for (const f of run.failures) result.errors.push(`${s.name || s.report_key} → ${f}`);
    } catch (e) {
      result.errors.push(`${s.name || s.report_key}: ${e?.message || e}`);
    }
  }
  return result;
}

export const scheduledReportsJob = {
  key: "scheduled_reports",
  label: "Scheduled reports",
  description: "Emails saved report schedules (daily, weekly or monthly) with a summary, and archives each run's CSV and HTML.",
  schedule: "0 12 * * *",
  run: ({ admin, now, projectId }) => runScheduledReports({ admin, now, projectId }),
};
