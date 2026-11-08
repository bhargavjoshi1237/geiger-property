import { emptyResult, projectError } from "./contract";
import { projectToday } from "./business_date";
import { forProjectOrAll } from "@/lib/supabase/scope";
import { getNotificationConfig } from "@/lib/email/notifications";
import { alertTeam } from "@/lib/messaging/reminder_jobs";
import { BILLABLE_STATUSES } from "@/lib/billing/rent";
import { lastMonth, normalizeStatementSettings } from "@/lib/billing/statement_rules";
import { JOB_KEY, loadStatementSettings, sendStatements } from "@/lib/billing/statements";

// Scheduled resident statements (CORE-12): from the configured day of each month, last month's statement goes to every live lease the
// setting selects (only those owing by default). Sends dedupe per lease, month and address, so later runs that month send nothing again;
// residents who prefer paper are queued for print and the team is told once per month.

const PAGE = 1000;

async function liveLeases(admin, projectId, leaseIds) {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    let q = forProjectOrAll(admin.from("leases").select("id, project_id"), projectId).in("status", BILLABLE_STATUSES).is("deleted_at", null);
    if (leaseIds?.length) q = q.in("id", leaseIds);
    const { data, error } = await q.order("id").range(from, from + PAGE - 1);
    if (error) throw new Error(`leases: ${error.message}`);
    out.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

// opts.settings stands in for billing_settings.statements and opts.leaseIds narrows the run (tests); deps.send / deps.alert replace the senders.
export async function runResidentStatements({ admin, now = new Date(), projectId = null, leaseIds = null, settings = null, deps = {} }) {
  const res = emptyResult();
  const byProject = new Map();
  for (const l of await liveLeases(admin, projectId, leaseIds)) byProject.set(l.project_id, [...(byProject.get(l.project_id) || []), l.id]);
  for (const [pid, ids] of byProject) {
    try {
      const cfg = settings ? normalizeStatementSettings(settings) : await loadStatementSettings(admin, pid);
      const today = await projectToday(admin, pid, now);
      if (!cfg.enabled || Number(today.slice(8, 10)) < cfg.day) {
        res.skipped += ids.length;
        continue;
      }
      const out = await sendStatements(admin, { projectId: pid, leaseIds: ids, period: lastMonth(today), today, selection: cfg, trigger: "job", actor: { name: "Scheduler" }, deps });
      const s = out.summary;
      res.processed += s.leases;
      res.created += s.sent;
      res.skipped += s.duplicate + s.disabled + s.notConfigured + s.noAddress + s.excluded + s.dnc + s.notSelected;
      if (s.failed) res.errors.push(projectError(pid, `${s.failed} statement email${s.failed === 1 ? "" : "s"} for ${out.label} failed`));
      const paper = out.leases.filter((l) => out.queuedLeaseIds.includes(l.leaseId));
      if (paper.length) {
        const alert = deps.alert || alertTeam;
        const names = paper.map((l) => `• ${[l.tenantName, l.unit].filter(Boolean).join(" · ") || l.name}`).join("\n");
        await alert(admin, await getNotificationConfig(pid, admin), {
          projectId: pid,
          jobKey: JOB_KEY,
          dedupeKey: `stmt-print:${pid}:${out.period}`,
          subject: `${paper.length} resident statement${paper.length === 1 ? "" : "s"} to print for ${out.label}`,
          body: `These residents get paper statements for ${out.label}:\n\n${names}\n\nPrint them from Accounting → Rent Collection → Send Statements → Print Mail Batch.`,
          result: res,
        });
      }
    } catch (e) {
      res.errors.push(projectError(pid, `statements: ${e?.message || e}`));
    }
  }
  return res;
}

export const residentStatementsJob = {
  key: JOB_KEY,
  label: "Resident statements",
  description:
    "From the day set in Fees & Policies → Resident statements, emails last month's statement to residents on live leases (only those who owe, unless set otherwise) with a link to the resident portal. Residents who prefer paper are queued for a print batch and the team is told. Each resident gets one statement per month; nothing posts to the ledger.",
  schedule: "30 12 * * *",
  run: runResidentStatements,
};
