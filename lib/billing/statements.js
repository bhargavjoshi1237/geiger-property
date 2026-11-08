import "server-only";
import { normalizeEntry, normalizeLine, round2 } from "@/lib/ledger/postings";
import { loadAccountIndex } from "@/lib/ledger/store";
import { partyReceivables } from "@/lib/ledger/ar_reads";
import { sendNotificationEmail } from "@/lib/email/notifications";
import { canContact } from "@/lib/messaging/consent";
import { logActivity } from "@/lib/messaging/threads";
import { effectivePolicies } from "@/lib/policies";
import { projectToday } from "@/lib/jobs/business_date";
import { forProject } from "@/lib/supabase/scope";
import { fail } from "./post";
import { BILLABLE_STATUSES } from "./rent";
import { BILLING_SETTINGS_KEY } from "./settings";
import { statementDueDate, statementMath, statementPeriodLabel } from "./statement_math";
import { statementEmailData } from "./statement_html";
import {
  channelsOf,
  isStatementPeriod,
  lastMonth,
  normalizeStatementSettings,
  statementKey,
  statementNoAddressKey,
  statementPeriods,
  statementPrintKey,
  statementRange,
  statementRecipients,
  statementSelected,
} from "./statement_rules";

// Server-only resident statements (CORE-12): build a lease's statement for a month from its ledger lines, list its recipients, and
// send statements (email through the notification path, deduped on notification_sends; paper preferences go to a print batch).
// Read-only on the ledger: nothing here posts.

const PAGE = 1000;
const CHUNK = 150;
export const JOB_KEY = "resident-statements";
export const MAX_LEASES = 500;
const NOTIFICATION = "resident_statement";
// Plan tables that don't exist until CORE-14 lands read as "no plan".
const MISSING = new Set(["42P01", "42703", "PGRST200", "PGRST204", "PGRST205"]);
const RETRY = ["failed", "disabled", "not_configured"];

const must = ({ data, error }, what) => {
  if (error) throw Object.assign(new Error(`${what}: ${error.message}`), { code: error.code });
  return data || [];
};
const unique = (ids) => [...new Set((ids || []).filter(Boolean))];

// Every page of a query.
async function paged(build, what) {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const data = must(await build().range(from, from + PAGE - 1), what);
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out;
}

// One project's live rows of `table` whose `col` is in `ids` (chunked).
async function rowsIn(admin, projectId, table, col, ids, apply = (q) => q) {
  const out = [];
  const want = unique(ids);
  for (let i = 0; i < want.length; i += CHUNK) out.push(...must(await apply(forProject(admin.from(table).select("*"), projectId).in(col, want.slice(i, i + CHUNK)).is("deleted_at", null)), table));
  return out;
}

async function setting(admin, projectId, key) {
  const rows = must(await forProject(admin.from("settings").select("value").eq("key", key).is("deleted_at", null), projectId).limit(1), "settings");
  return rows[0]?.value && typeof rows[0].value === "object" ? rows[0].value : {};
}

// The resident portal's address (env first, else the request's origin), or "" when neither is known.
export function portalLink(origin = "") {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const root = String(process.env.NEXT_PUBLIC_APP_URL || origin || "").replace(/\/+$/, "");
  if (!root) return "";
  return `${root.endsWith(basePath) ? root : `${root}${basePath}`}/portal`;
}

// Active payment plans and their installments per lease (CORE-14), or none before its tables exist.
async function loadPlans(admin, projectId, leaseIds) {
  try {
    const plans = await rowsIn(admin, projectId, "payment_plans", "lease_id", leaseIds, (q) => q.eq("status", "Active"));
    if (!plans.length) return new Map();
    const inst = await rowsIn(admin, projectId, "payment_plan_installments", "plan_id", plans.map((p) => p.id));
    const out = new Map();
    for (const p of plans) {
      const rows = inst.filter((i) => i.plan_id === p.id).sort((a, b) => a.seq - b.seq);
      const installments = rows.map((i) => ({ id: i.id, seq: i.seq, dueDate: i.due_date, amount: round2(i.amount), status: i.status || "" }));
      out.set(p.lease_id, { id: p.id, name: p.name || "Payment plan", status: p.status, remaining: round2(installments.filter((i) => i.status === "Scheduled").reduce((s, i) => s + i.amount, 0)), installments });
    }
    return out;
  } catch (e) {
    if (MISSING.has(e?.code)) return new Map();
    throw e;
  }
}

const camelTenant = (t) => ({ id: t.id, name: t.name || "", email: t.email || "", metadata: t.metadata || {} });
const camelParty = (p) => ({ tenantId: p.tenant_id || "", name: p.name || "", email: p.email || "", role: p.role || "tenant", isPrimary: Boolean(p.is_primary), metadata: p.metadata || {} });

// Everything the statements of some leases need, in batched reads → { leases, accounts, lines, tenants, parties, contacts, … }.
export async function loadStatementData(admin, projectId, leaseIds) {
  if (!projectId) throw fail("projectId is required.");
  const ids = unique(leaseIds);
  const [leaseRows, accounts, company, fees] = await Promise.all([rowsIn(admin, projectId, "leases", "id", ids), loadAccountIndex(admin, projectId), setting(admin, projectId, "company_profile"), setting(admin, projectId, "fees_policies")]);
  const leases = new Map(leaseRows.map((l) => [l.id, l]));
  const gl = accounts.list.filter((a) => ["receivable", "deposits"].includes(a.subtype)).map((a) => a.id);
  const lineRows = [];
  const live = [...leases.keys()];
  for (let i = 0; gl.length && i < live.length; i += CHUNK) {
    const part = live.slice(i, i + CHUNK);
    lineRows.push(...(await paged(() => forProject(admin.from("ledger_lines").select("*"), projectId).in("lease_id", part).in("gl_account_id", gl).is("deleted_at", null).order("entry_date").order("id"), "ledger lines")));
  }
  const lines = lineRows.map(normalizeLine);
  const entryIds = unique(lines.map((l) => l.entryId));
  const entries = new Map();
  for (let i = 0; i < entryIds.length; i += CHUNK) {
    for (const e of must(await forProject(admin.from("ledger_entries").select("*"), projectId).in("id", entryIds.slice(i, i + CHUNK)), "ledger entries")) entries.set(e.id, normalizeEntry(e));
  }
  const payments = entryIds.filter((id) => entries.get(id)?.sourceType === "payment");
  const [parties, receiptRows, plans] = await Promise.all([rowsIn(admin, projectId, "lease_parties", "lease_id", live), rowsIn(admin, projectId, "payment_receipts", "entry_id", payments), loadPlans(admin, projectId, live)]);
  const tenantIds = unique([...leaseRows.map((l) => l.tenant_id), ...parties.map((p) => p.tenant_id)]);
  const [tenantRows, contacts, units] = await Promise.all([
    rowsIn(admin, projectId, "tenants", "id", tenantIds),
    rowsIn(admin, projectId, "record_items", "owner_id", tenantIds, (q) => q.eq("owner_type", "tenant").eq("kind", "contact")),
    rowsIn(admin, projectId, "units", "id", leaseRows.map((l) => l.unit_id)),
  ]);
  const properties = await rowsIn(admin, projectId, "properties", "id", [...leaseRows.map((l) => l.property_id), ...units.map((u) => u.property_id)]);
  const linesByLease = new Map(live.map((id) => [id, []]));
  for (const l of lines) linesByLease.get(l.leaseId)?.push({ ...l, entry: entries.get(l.entryId) || null });
  const group = (rows, key) => rows.reduce((m, r) => m.set(r[key], [...(m.get(r[key]) || []), r]), new Map());
  return {
    projectId,
    leases,
    accounts,
    company,
    fees,
    linesByLease,
    receipts: new Map(receiptRows.map((r) => [r.entry_id, r.receipt_no])),
    tenants: new Map(tenantRows.map((t) => [t.id, t])),
    partiesByLease: group(parties, "lease_id"),
    contactsByTenant: group(contacts, "owner_id"),
    units: new Map(units.map((u) => [u.id, u])),
    properties: new Map(properties.map((p) => [p.id, p])),
    plans,
  };
}

// A lease's statement recipients from loaded data (lib/billing/statement_rules.js statementRecipients).
export function recipientsOf(data, lease) {
  const parties = data.partiesByLease.get(lease.id) || [];
  const tenantIds = unique([lease.tenant_id, ...parties.map((p) => p.tenant_id)]);
  const tenants = new Map(tenantIds.map((id) => data.tenants.get(id)).filter(Boolean).map((t) => [t.id, camelTenant(t)]));
  const contacts = tenantIds.flatMap((id) => data.contactsByTenant.get(id) || []).map((c) => ({ id: c.id, ownerId: c.owner_id, name: c.name || "", metadata: c.metadata || {} }));
  return statementRecipients({ lease: { id: lease.id, tenantId: lease.tenant_id || "", tenantName: lease.tenant_name || "" }, tenants, parties: parties.map(camelParty), contacts });
}

// One lease's statement for a window (range from statementRange) out of loaded data.
export function assembleStatement(data, lease, range, { today, portalUrl = "" } = {}) {
  const unit = data.units.get(lease.unit_id) || null;
  const property = data.properties.get(lease.property_id || unit?.property_id) || null;
  const math = statementMath({ lines: data.linesByLease.get(lease.id) || [], accounts: data.accounts, leaseId: lease.id, from: range.from, to: range.to, receipts: data.receipts });
  const policies = effectivePolicies({ company: data.fees, property, lease });
  const parties = (data.partiesByLease.get(lease.id) || []).filter((p) => p.role === "tenant");
  const primary = data.tenants.get(lease.tenant_id);
  const names = unique([primary?.name || lease.tenant_name, ...parties.map((p) => data.tenants.get(p.tenant_id)?.name || p.name)]);
  const c = data.company || {};
  return {
    leaseId: lease.id,
    projectId: data.projectId,
    period: range.period || null,
    from: range.from,
    to: range.to,
    toDate: Boolean(range.toDate),
    generatedOn: today,
    dueDate: statementDueDate(range.to, policies.rentDueDay),
    company: { name: c.dba || c.legalName || "", address: [c.address, c.city, c.state, c.zip].filter(Boolean).join(", "), phone: c.phone || "", email: c.email || "" },
    resident: { name: names[0] || "Resident", names },
    lease: { id: lease.id, name: lease.name || "", status: lease.status || "" },
    unit: unit || lease.unit ? { id: unit?.id || null, label: unit?.label || lease.unit || "" } : null,
    property: property ? { id: property.id, name: property.name || "", address: [property.address, property.city, property.state, property.zip].filter(Boolean).join(", ") } : null,
    portalUrl,
    plan: data.plans.get(lease.id) || null,
    ...math,
  };
}

// The statement window for a period (default: last month on the project's business date) → { range, today }.
export async function resolveStatementRange(admin, projectId, period, today) {
  const day = today || (await projectToday(admin, projectId));
  const p = period || lastMonth(day);
  if (!isStatementPeriod(p)) throw fail("Pick a month (YYYY-MM) for the statement.");
  const range = statementRange(p, day);
  if (!range) throw fail("Statements can't be made for a month that hasn't started.");
  return { range, today: day };
}

// Statements of many leases for one month → Map leaseId → statement (leases not in the project are left out).
export async function buildStatements(admin, projectId, leaseIds, { period, today, origin = "", data } = {}) {
  const { range, today: day } = await resolveStatementRange(admin, projectId, period, today);
  const loaded = data || (await loadStatementData(admin, projectId, leaseIds));
  const portalUrl = portalLink(origin);
  const out = new Map();
  for (const id of unique(leaseIds)) {
    const lease = loaded.leases.get(id);
    if (lease) out.set(id, assembleStatement(loaded, lease, range, { today: day, portalUrl }));
  }
  return { range, today: day, statements: out, data: loaded };
}

// One lease's statement for a month, with its recipients.
export async function buildStatement(admin, leaseId, { projectId, period, today, origin = "" } = {}) {
  const res = await buildStatements(admin, projectId, [leaseId], { period, today, origin });
  const st = res.statements.get(leaseId);
  if (!st) throw fail("Lease not found.", 404);
  return { ...st, recipients: recipientsOf(res.data, res.data.leases.get(leaseId)) };
}

// Months a lease's statements can be opened for (current month first), each with its closing balance.
export async function statementMonths(admin, projectId, leaseId, { today } = {}) {
  const day = today || (await projectToday(admin, projectId));
  const data = await loadStatementData(admin, projectId, [leaseId]);
  const lease = data.leases.get(leaseId);
  if (!lease) return [];
  const ar = (data.linesByLease.get(leaseId) || []).filter((l) => data.accounts.byId.get(l.glAccountId)?.subtype === "receivable");
  if (!ar.length) return [];
  return statementPeriods(ar[0].date, day).map((p) => {
    const range = statementRange(p, day);
    const closing = round2(ar.filter((l) => l.date <= range.to).reduce((s, l) => s + l.debit - l.credit, 0));
    return { period: p, label: statementPeriodLabel(range), closing, toDate: range.toDate };
  });
}

// Live leases in a Rent Collection view: all, owing (ledger balance above zero) or credit (below zero).
export async function leasesForView(admin, projectId, view = "all") {
  const rows = await paged(() => forProject(admin.from("leases").select("id"), projectId).in("status", BILLABLE_STATUSES).is("deleted_at", null).order("id"), "leases");
  const ids = rows.map((r) => r.id);
  if (view !== "owing" && view !== "credit") return ids;
  const balances = await partyReceivables(admin, (q) => forProject(q, projectId), "lease", ids);
  return ids.filter((id) => (view === "owing" ? (balances.get(id) || 0) > 0.004 : (balances.get(id) || 0) < -0.004));
}

// Statement send rows already recorded for some leases and month → Map dedupe key → status.
async function priorSends(admin, projectId, leaseIds, period) {
  const rows = await rowsIn(admin, projectId, "notification_sends", "record_id", leaseIds, (q) => q.eq("job_key", JOB_KEY).like("dedupe_key", `stmt:%:${period}:%`));
  return new Map(rows.map((r) => [r.dedupe_key, r.status]));
}

// Claim a send before delivering it: a duplicate key is final unless that send was turned off, unconfigured or failed → { id, fresh, status }.
async function claim(admin, projectId, row) {
  const { data, error } = await admin.from("notification_sends").insert({ project_id: projectId, job_key: JOB_KEY, notification: NOTIFICATION, record_type: "lease", ...row }).select("id").maybeSingle();
  if (!error && data) return { id: data.id, fresh: true, status: row.status };
  if (error && error.code !== "23505") throw new Error(`notification_sends: ${error.message}`);
  const prior = (await forProject(admin.from("notification_sends").select("id, status").eq("dedupe_key", row.dedupe_key), projectId).maybeSingle()).data;
  if (!prior) return { id: null, fresh: false, status: "sending" };
  if (!RETRY.includes(prior.status) || row.channel !== "email") return { id: prior.id, fresh: false, status: prior.status };
  const retry = must(await forProject(admin.from("notification_sends").update({ status: "sending", error: null }), projectId).eq("id", prior.id).eq("status", prior.status).select("id"), "notification_sends");
  return { id: prior.id, fresh: retry.length > 0, status: retry.length ? "sending" : prior.status };
}

const emptySummary = () => ({ leases: 0, sent: 0, duplicate: 0, disabled: 0, notConfigured: 0, failed: 0, noAddress: 0, excluded: 0, dnc: 0, print: 0, notSelected: 0, pending: 0, missing: 0 });
const SUMMARY_OF = { sent: "sent", duplicate: "duplicate", disabled: "disabled", not_configured: "notConfigured", failed: "failed", no_address: "noAddress", excluded: "excluded", dnc: "dnc", print: "print", pending: "pending" };

// Send (or, with dryRun, preview) statements for some leases or a view and one month.
// A staff send goes to every lease picked; a scheduled one passes `selection` (the statements setting) to skip leases it leaves out.
// `resend` emails again under a fresh key; deps.send replaces the email sender (tests capture it, nothing is delivered).
export async function sendStatements(admin, { projectId, leaseIds, view, period, today, dryRun = false, resend = false, selection = null, trigger = "manual", actor = null, origin = "", deps = {} } = {}) {
  if (!projectId) throw fail("projectId is required.");
  const send = deps.send || sendNotificationEmail;
  const ids = leaseIds?.length ? unique(leaseIds) : await leasesForView(admin, projectId, view || "all");
  if (ids.length > MAX_LEASES) throw fail(`Send statements to at most ${MAX_LEASES} leases at a time.`);
  const { range, today: day, statements, data } = await buildStatements(admin, projectId, ids, { period, today, origin });
  const prior = dryRun ? await priorSends(admin, projectId, ids, range.period) : new Map();
  const stamp = resend ? new Date().toISOString() : "";
  // printLeaseIds: every lease with a paper recipient; queuedLeaseIds: those whose print-batch row this call added.
  const out = { period: range.period, from: range.from, to: range.to, toDate: range.toDate, label: statementPeriodLabel(range), leases: [], printLeaseIds: [], queuedLeaseIds: [], summary: emptySummary() };
  const tally = (status) => {
    if (SUMMARY_OF[status]) out.summary[SUMMARY_OF[status]] += 1;
  };

  for (const id of ids) {
    const st = statements.get(id);
    if (!st) {
      out.summary.missing += 1;
      out.leases.push({ leaseId: id, status: "missing", recipients: [] });
      continue;
    }
    out.summary.leases += 1;
    const lease = data.leases.get(id);
    const item = { leaseId: id, name: lease.name || "", tenantName: st.resident.name, unit: st.unit?.label || "", closing: st.closing, selected: true, recipients: [] };
    out.leases.push(item);
    if (selection && !statementSelected(st, selection)) {
      item.selected = false;
      out.summary.notSelected += 1;
      continue;
    }
    let printed = false;
    let queued = false;
    const emailed = [];
    for (const r of recipientsOf(data, lease)) {
      const channels = channelsOf(r);
      const base = { key: r.key, name: r.name, email: r.email, delivery: r.delivery };
      if (!channels.length) {
        const status = r.dnc ? "dnc" : "excluded";
        item.recipients.push({ ...base, channel: null, status });
        tally(status);
        continue;
      }
      for (const channel of channels) {
        let status;
        if (channel === "print") {
          status = "print";
          printed = true;
          if (!dryRun) queued = (await claim(admin, projectId, { dedupe_key: statementPrintKey(id, range.period, r.key), channel: "print", recipient: r.name || null, record_id: id, status: "queued", metadata: { period: range.period, closing: st.closing, trigger } })).fresh || queued;
        } else if (!canContact({ email: r.email, metadata: {} }, { channel: "email", category: "statement" }).ok) {
          status = "no_address";
          if (!dryRun) await claim(admin, projectId, { dedupe_key: statementNoAddressKey(id, range.period, r.key), channel: "email", recipient: null, record_id: id, status: "no_address", metadata: { period: range.period, trigger } });
        } else {
          const dedupe = statementKey(id, range.period, r.email, stamp);
          if (dryRun) {
            const was = prior.get(dedupe);
            status = was && !RETRY.includes(was) ? "duplicate" : "pending";
          } else {
            const c = await claim(admin, projectId, { dedupe_key: dedupe, channel: "email", recipient: r.email, record_id: id, status: "sending", metadata: { period: range.period, closing: st.closing, trigger, resend: Boolean(resend) } });
            if (!c.fresh) status = "duplicate";
            else {
              const res = await send({ db: admin, projectId, notification: NOTIFICATION, to: r.email, data: statementEmailData(st, r) });
              status = res?.ok ? "sent" : res?.skipped ? "disabled" : res?.error === "not_configured" ? "not_configured" : "failed";
              if (c.id) await forProject(admin.from("notification_sends").update({ status, error: res?.ok ? null : String(res?.error || "") }), projectId).eq("id", c.id);
              if (status === "sent") emailed.push(r.email);
            }
          }
        }
        item.recipients.push({ ...base, channel, status });
        tally(status);
      }
    }
    if (printed) out.printLeaseIds.push(id);
    if (queued) out.queuedLeaseIds.push(id);
    if (!dryRun && (emailed.length || queued)) {
      const parts = [emailed.length ? `emailed to ${emailed.join(", ")}` : "", queued ? "added to the print batch" : ""].filter(Boolean).join(" and ");
      await logActivity(admin, { projectId, ownerType: "lease", ownerId: id, verb: "statement", summary: `Statement for ${out.label} ${parts}`, actorId: actor?.id || null, actorName: actor?.name || (trigger === "job" ? "Scheduler" : "") });
    }
  }
  return out;
}

// billing_settings.statements, normalized.
export async function loadStatementSettings(admin, projectId) {
  return normalizeStatementSettings((await setting(admin, projectId, BILLING_SETTINGS_KEY)).statements);
}

// Merge the statements setting into billing_settings (other keys such as jobsPaused stay as stored); a soft-deleted row is restored.
export async function saveStatementSettings(admin, projectId, patch) {
  const read = () => forProject(admin.from("settings").select("id, value, deleted_at").eq("key", BILLING_SETTINGS_KEY), projectId).limit(1);
  let rows = must(await read(), "billing_settings");
  if (!rows[0]) {
    const next = normalizeStatementSettings(patch);
    const { error } = await admin.from("settings").insert({ project_id: projectId, key: BILLING_SETTINGS_KEY, value: { statements: next } });
    if (!error) return next;
    if (error.code !== "23505") throw new Error(`billing_settings: ${error.message}`);
    rows = must(await read(), "billing_settings");
  }
  const row = rows[0];
  const stored = row.deleted_at ? {} : row.value || {};
  const statements = normalizeStatementSettings({ ...normalizeStatementSettings(stored.statements), ...(patch || {}) });
  must(await forProject(admin.from("settings").update({ value: { ...stored, statements }, deleted_at: null }), projectId).eq("id", row.id).select("id"), "billing_settings");
  return statements;
}
