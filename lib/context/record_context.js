"use client";

import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/supabase/components/property-client";
import { receivableByParty } from "@/lib/supabase/ledger";
import { listActivity } from "@/lib/supabase/activity_log";
import { RECORD_TYPES, recordTitle } from "@/lib/automations/catalog";
import { recordOwnerType } from "@/lib/orchestration/records";

// Compact context for one record (PLAT-18 step 2 slice, browser): the facts a person needs to act on a case —
// balance from the ledger, lease terms, status, vendor, dates — plus its latest activity (messages, notes,
// automation). Feeds the guided case sheet (ORCH-08); later the AI page assistant reads the same builders.

const usd = (n) => `$${(Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = (v) =>
  v ? new Date(String(v).length === 10 ? `${v}T00:00:00` : v).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
const fact = (label, value) => (value === null || value === undefined || value === "" ? null : { label, value: String(value) });

async function arBalance(dimension, id) {
  const map = await receivableByParty(dimension);
  return map ? map.get(id) || 0 : null;
}

function factsFor(type, row, balance) {
  const m = row.metadata || {};
  switch (type) {
    case "tenant":
      return [
        fact("Balance (ledger)", balance === null ? null : usd(balance)),
        fact("Unit", row.unit),
        fact("Status", row.status),
        fact("Email", row.email || "None on file"),
        fact("Phone", row.phone),
        fact("Lease ends", date(row.lease_end)),
        fact("Contact", m.doNotContact ? "Do not contact" : m.preferredContact),
      ];
    case "lease":
      return [
        fact("Balance (ledger)", balance === null ? null : usd(balance)),
        fact("Tenant", row.tenant_name),
        fact("Unit", row.unit),
        fact("Rent", row.rent ? usd(row.rent) : null),
        fact("Term", row.term_start || row.term_end ? `${date(row.term_start)} – ${date(row.term_end)}` : null),
        fact("Status", row.status),
        fact("Market rent", m.marketRent ? usd(m.marketRent) : null),
      ];
    case "work_order":
      return [
        fact("Status", row.status),
        fact("Priority", row.priority),
        fact("Category", row.category),
        fact("Vendor", row.vendor_name || "Unassigned"),
        fact("Due", date(m.dueDate)),
        fact("Opened", date(row.created_at)),
        fact("Tenant", row.tenant_name),
      ];
    case "vendor":
      return [fact("Trade", row.specialty), fact("Status", row.status), fact("Email", row.email || "None on file"), fact("Phone", row.phone), fact("Insurance expires", date(row.insurance_expiry))];
    case "bill":
      return [
        fact("Vendor", row.vendor_name),
        fact("Amount", usd(row.amount)),
        fact("Due", date(row.due_date)),
        fact("Approval", row.approval_status),
        fact("Status", row.status),
        fact("Property", row.property_name),
      ];
    default:
      return [fact("Status", row.status), fact("Unit", row.unit), fact("Date", date(row.move_date || row.applied_on))];
  }
}

// → { title, facts: [{ label, value }], recent: [{ id, summary, at, verb }] } or null.
export async function loadRecordContext(type, id) {
  const table = RECORD_TYPES[type]?.table;
  if (!table || !id || !isSupabaseConfigured()) return null;
  try {
    const { data: row, error } = await createClient().from(table).select("*").eq("id", id).maybeSingle();
    if (error || !row || row.deleted_at) return null;
    const balance = type === "tenant" ? await arBalance("tenantId", id) : type === "lease" ? await arBalance("leaseId", id) : null;
    const activity = (await listActivity(recordOwnerType(type), id)) || [];
    return {
      title: recordTitle(type, row),
      facts: factsFor(type, row, balance).filter(Boolean),
      recent: activity.slice(0, 5).map((a) => ({ id: a.id, summary: a.summary, at: a.occurredAt || a.createdAt, verb: a.verb })),
    };
  } catch (e) {
    console.error("[context.record]", e);
    return null;
  }
}
