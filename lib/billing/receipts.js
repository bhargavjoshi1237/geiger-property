import "server-only";
import { normalizeEntry, normalizeLine, round2, runningLedger } from "@/lib/ledger/postings";
import { loadAccountIndex } from "@/lib/ledger/store";
import { sendNotificationEmail } from "@/lib/email/notifications";
import { ONLINE_METHODS } from "@/lib/payments/constants";
import { forProject } from "@/lib/supabase/scope";
import { classifyEntry } from "./ar_summary";
import { HOUSING_AUTHORITY, chargeLabel, receiptDedupeKey, receiptNumber, receiptRequirement } from "./payment_rules";
import { fail } from "./post";
import { receiptEmailData } from "./receipt_html";

// Server-only payment receipts (CORE-11): what a payment entry paid (receiptData) and the rent_receipt email, deduped per entry and address on notification_sends.

const PAGE = 1000;
const CHUNK = 150;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");

const must = ({ data, error }, what) => {
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
};

async function rowById(admin, table, id, projectId) {
  if (!id) return null;
  const row = must(await forProject(admin.from(table).select("*").eq("id", id), projectId).maybeSingle(), table);
  return row && !row.deleted_at ? row : null;
}

async function setting(admin, projectId, key) {
  const rows = must(await forProject(admin.from("settings").select("value").eq("key", key).is("deleted_at", null), projectId).limit(1), "settings");
  return rows?.[0]?.value || {};
}

// Receivable lines (with their entry) of one subtype for a lease or tenant (column lease_id / tenant_id), paged.
export async function receivableLines(admin, projectId, acct, { column, id, subtype }) {
  const gl = acct.list.filter((a) => a.subtype === subtype).map((a) => a.id);
  if (!gl.length || !id) return [];
  const lines = [];
  for (let from = 0; ; from += PAGE) {
    const q = admin.from("ledger_lines").select("*").eq(column, id).in("gl_account_id", gl).is("deleted_at", null);
    const data = must(await forProject(q, projectId).order("entry_date").order("id").range(from, from + PAGE - 1), "ledger lines");
    lines.push(...data.map(normalizeLine));
    if (data.length < PAGE) break;
  }
  const entries = await entriesById(admin, projectId, lines.map((l) => l.entryId));
  return lines.map((l) => ({ ...l, entry: entries.get(l.entryId) || null }));
}

async function entriesById(admin, projectId, ids) {
  const out = new Map();
  const want = [...new Set(ids.filter(Boolean))];
  for (let i = 0; i < want.length; i += CHUNK) {
    for (const e of must(await forProject(admin.from("ledger_entries").select("*").in("id", want.slice(i, i + CHUNK)), projectId), "ledger entries")) out.set(e.id, normalizeEntry(e));
  }
  return out;
}

// Everything a receipt shows for one payment entry: payer, lease / unit / property, amount, method, reference, the charges it paid, the balance after it and the receipt number.
export async function receiptData(admin, entryId, { projectId } = {}) {
  if (!projectId) throw fail("projectId is required.");
  const row = await rowById(admin, "ledger_entries", entryId, projectId);
  if (!row) throw fail("Receipt not found.", 404);
  const entry = normalizeEntry(row);
  if (entry.sourceType !== "payment" || entry.reversalOf) throw fail("Only payments have receipts.", 400);
  const acct = await loadAccountIndex(admin, projectId);
  const lines = must(await forProject(admin.from("ledger_lines").select("*").eq("entry_id", entry.id), projectId).is("deleted_at", null).order("line_no"), "payment lines").map(normalizeLine);
  const arLines = lines.filter((l) => ["receivable", "subsidy_receivable"].includes(acct.byId.get(l.glAccountId)?.subtype) && l.credit > 0);
  const subtype = arLines.some((l) => acct.byId.get(l.glAccountId)?.subtype === "subsidy_receivable") ? "subsidy_receivable" : "receivable";
  const m = entry.metadata;
  const authority = subtype === "subsidy_receivable" || m.payer === HOUSING_AUTHORITY;

  const [lease, tenant, online] = await Promise.all([
    rowById(admin, "leases", entry.leaseId, projectId),
    authority ? null : rowById(admin, "tenants", entry.tenantId, projectId),
    m.onlinePaymentId ? rowById(admin, "online_payments", m.onlinePaymentId, projectId) : null,
  ]);
  const [unit, property, company] = await Promise.all([
    rowById(admin, "units", entry.unitId || lease?.unit_id, projectId),
    rowById(admin, "properties", entry.propertyId || lease?.property_id, projectId),
    setting(admin, projectId, "company_profile"),
  ]);

  // The charges it paid, each with what it was for.
  const applied = arLines.filter((l) => l.appliesToEntryId);
  const charges = await entriesById(admin, projectId, applied.map((l) => l.appliesToEntryId));
  const allocations = applied.map((l) => {
    const c = charges.get(l.appliesToEntryId) || {};
    const { kind, period } = classifyEntry(c);
    return { entryId: l.appliesToEntryId, date: c.metadata?.originalDate || c.date || "", kind, period, label: chargeLabel({ kind, period, memo: c.memo }), amount: round2(l.credit) };
  });
  const unapplied = round2(arLines.filter((l) => !l.appliesToEntryId).reduce((s, l) => s + l.credit, 0));

  // Balance after this payment and today, as the record's ledger shows them (running balance over every line).
  const scope = authority ? "lease_subsidy" : entry.leaseId ? "lease" : "tenant";
  const ledger = runningLedger(scope, await receivableLines(admin, projectId, acct, entry.leaseId ? { column: "lease_id", id: entry.leaseId, subtype } : { column: "tenant_id", id: entry.tenantId, subtype }), acct);
  const at = ledger.find((r) => r.entryId === entry.id);

  const amount = round2(lines.reduce((s, l) => s + l.debit, 0));
  const method = online ? [ONLINE_METHODS[online.method]?.ledgerLabel || "Online", online.method_label].filter(Boolean).join(" · ") : m.method || String(entry.memo || "").replace(/^Payment · /, "") || "";
  const tenantName = tenant?.name || lease?.tenant_name || "";
  return {
    entryId: entry.id,
    projectId,
    receiptNo: m.receiptNo || receiptNumber(entry.id),
    date: entry.date,
    amount,
    method,
    reference: m.reference || "",
    memo: entry.memo,
    status: entry.status,
    online: Boolean(online),
    payer: authority
      ? { kind: HOUSING_AUTHORITY, name: m.payerName || "Housing authority", email: "", tenantName }
      : { kind: "tenant", name: online?.payer_name || tenantName || "Resident", email: online?.payer_email || tenant?.email || "", tenantId: tenant?.id || entry.tenantId || null },
    lease: lease ? { id: lease.id, name: lease.name || "" } : null,
    unit: unit ? { id: unit.id, label: unit.label || lease?.unit || "" } : lease?.unit ? { id: null, label: lease.unit } : null,
    property: property ? { id: property.id, name: property.name || "", address: [property.address, property.city, property.state, property.zip].filter(Boolean).join(", "), state: property.state || "" } : null,
    company: { name: company.dba || company.legalName || "", address: [company.address, company.city, company.state, company.zip].filter(Boolean).join(", "), phone: company.phone || "", email: company.email || "" },
    allocations,
    unapplied,
    balanceAfter: at ? at.balance : null,
    balanceNow: ledger.length ? ledger[ledger.length - 1].balance : 0,
    receivedBy: online ? "Online payment" : m.enteredBy?.name || "",
    requirement: receiptRequirement({ state: property?.state, method: m.method || method }),
  };
}

// Claim a send before delivering it; a duplicate key is final unless that send failed → { id, fresh, status }.
async function claimSend(admin, { projectId, dedupeKey, recipient, entryId, receiptNo, resend }) {
  const { data, error } = await admin
    .from("notification_sends")
    .insert({ project_id: projectId, dedupe_key: dedupeKey, job_key: "receipts", notification: "rent_receipt", channel: "email", recipient, record_type: "ledger_entry", record_id: entryId, status: "sending", metadata: { receiptNo, resend: Boolean(resend) } })
    .select("id")
    .maybeSingle();
  if (!error && data) return { id: data.id, fresh: true };
  if (error && error.code !== "23505") throw new Error(`notification_sends: ${error.message}`);
  const prior = must(await admin.from("notification_sends").select("id, status").eq("dedupe_key", dedupeKey).maybeSingle(), "notification_sends");
  if (prior?.status !== "failed") return { id: prior?.id || null, fresh: false, status: prior?.status || "sending" };
  const retry = must(await admin.from("notification_sends").update({ status: "sending", error: null }).eq("id", prior.id).eq("status", "failed").select("id"), "notification_sends");
  return { id: prior.id, fresh: retry.length > 0, status: retry.length ? "sending" : "failed" };
}

// Email the receipt (notification rent_receipt) once per entry and address; `resend` sends another under a fresh key → { ok, status, dedupeKey, duplicate? }.
export async function sendReceipt(admin, entryId, { projectId, to, resend = false, receipt } = {}) {
  const r = receipt || (await receiptData(admin, entryId, { projectId }));
  const email = String(to || r.payer.email || "").trim().toLowerCase();
  if (!email) return { ok: false, status: "no_address", error: "There's no email address on file for this payer." };
  if (!EMAIL.test(email)) return { ok: false, status: "invalid", error: "That email address doesn't look right." };
  const dedupeKey = receiptDedupeKey(r.entryId, email, resend ? new Date().toISOString() : "");
  const claim = await claimSend(admin, { projectId: r.projectId, dedupeKey, recipient: email, entryId: r.entryId, receiptNo: r.receiptNo, resend });
  if (!claim.fresh) return { ok: true, duplicate: true, status: claim.status, dedupeKey, to: email };
  const res = await sendNotificationEmail({ db: admin, projectId: r.projectId, notification: "rent_receipt", to: email, data: receiptEmailData(r, { appUrl: appUrl() }) });
  const status = res.ok ? "sent" : res.skipped ? "disabled" : res.error === "not_configured" ? "not_configured" : "failed";
  if (claim.id) await admin.from("notification_sends").update({ status, error: res.ok ? null : String(res.error || "") }).eq("id", claim.id);
  return { ok: Boolean(res.ok), status, dedupeKey, to: email, sendId: claim.id, ...(res.ok ? {} : { error: res.error }) };
}
