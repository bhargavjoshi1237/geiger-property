import { effectivePolicies } from "@/lib/policies";

// Resolves real record data into merge-field values (see ./merge_fields.js).
// Isomorphic: pass any Supabase client pinned to the `property` schema — the
// browser createClient() for live previews, adminClient() on the server. Never
// throws; missing records simply leave their tokens empty.

const money = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 })
    .format(Number(n) || 0)
    .replace(/\.00$/, "");

export const formatMergeDate = (v) =>
  v
    ? new Date(String(v).length === 10 ? `${v}T00:00:00` : v).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "";

const isoDay = (d) => d.toISOString().slice(0, 10);

// Next rent due date (ISO) on or after `from` for a 1–28 due day.
export function nextDueDate(dueDay, from = new Date()) {
  const day = Math.min(28, Math.max(1, Number(dueDay) || 1));
  const base = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const candidate = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), day));
  if (candidate < base) candidate.setUTCMonth(candidate.getUTCMonth() + 1);
  return isoDay(candidate);
}

export const daysBetween = (fromISO, toISO) =>
  Math.round((new Date(`${toISO}T00:00:00Z`) - new Date(`${fromISO}T00:00:00Z`)) / 86400000);

async function one(sb, table, id) {
  if (!sb || !id) return null;
  try {
    const { data, error } = await sb.from(table).select("*").eq("id", id).maybeSingle();
    if (error) {
      console.error(`[merge.${table}]`, error.message);
      return null;
    }
    return data && !data.deleted_at ? data : null;
  } catch (e) {
    console.error(`[merge.${table}]`, e);
    return null;
  }
}

async function first(sb, table, column, value, order = "created_at") {
  if (!sb || !value) return null;
  try {
    const { data, error } = await sb
      .from(table)
      .select("*")
      .eq(column, value)
      .is("deleted_at", null)
      .order(order, { ascending: false })
      .limit(1);
    if (error) return null;
    return data?.[0] ?? null;
  } catch {
    return null;
  }
}

export async function getProjectSetting(sb, projectId, key) {
  if (!sb || !key) return null;
  try {
    let q = sb.from("settings").select("value").eq("key", key).is("deleted_at", null);
    q = projectId ? q.eq("project_id", projectId) : q.is("project_id", null);
    const { data, error } = await q.limit(1);
    if (error) return null;
    return data?.[0]?.value ?? null;
  } catch {
    return null;
  }
}

// Load the records behind a set of refs, walking lease → tenant → unit → property → owner.
export async function loadMergeRecords(sb, refs = {}) {
  let lease = await one(sb, "leases", refs.leaseId);
  let tenant = await one(sb, "tenants", refs.tenantId || lease?.tenant_id);
  if (!lease && tenant) {
    lease = (await one(sb, "leases", tenant.lease_id)) || (await first(sb, "leases", "tenant_id", tenant.id));
  }
  if (!tenant && lease?.tenant_id) tenant = await one(sb, "tenants", lease.tenant_id);
  const unit = await one(sb, "units", refs.unitId || lease?.unit_id || tenant?.unit_id);
  const property = await one(
    sb,
    "properties",
    refs.propertyId || unit?.property_id || lease?.property_id || tenant?.property_id,
  );
  let owner = await one(sb, "owners", refs.ownerId);
  if (!owner && property) {
    const link = await first(sb, "property_owners", "property_id", property.id);
    owner = link ? await one(sb, "owners", link.owner_id) : null;
  }
  const vendor = await one(sb, "vendors", refs.vendorId);
  return { lease, tenant, unit, property, owner, vendor };
}

// { token: value } for every merge field, from real records.
export async function buildMergeValues(sb, refs = {}, { now = new Date(), recipientName } = {}) {
  const r = await loadMergeRecords(sb, refs);
  const [company, feesPolicies] = await Promise.all([
    getProjectSetting(sb, refs.projectId, "company_profile"),
    getProjectSetting(sb, refs.projectId, "fees_policies"),
  ]);
  const policies = effectivePolicies({ company: feesPolicies, property: r.property, lease: r.lease });
  const today = isoDay(now);
  const rent = r.lease?.rent ?? r.unit?.rent;
  const balance = Number(r.tenant?.balance ?? 0);
  const unitLabel = r.unit?.label || r.lease?.unit || r.tenant?.unit || "";
  const tenantName = r.tenant?.name || r.lease?.tenant_name || "";
  return {
    values: {
      tenant_name: tenantName,
      tenant_first_name: tenantName.split(" ")[0] || "",
      tenant_email: r.tenant?.email || "",
      tenant_phone: r.tenant?.phone || "",
      lease_name: r.lease?.name || "",
      lease_start: formatMergeDate(r.lease?.term_start),
      lease_end: formatMergeDate(r.lease?.term_end),
      days_until_lease_end: r.lease?.term_end ? String(daysBetween(today, r.lease.term_end)) : "",
      rent: rent != null && rent !== "" ? money(rent) : "",
      deposit: r.lease?.deposit != null ? money(r.lease.deposit) : "",
      due_date: r.lease || r.tenant ? formatMergeDate(nextDueDate(policies.rentDueDay, now)) : "",
      unit: r.property?.name && unitLabel ? `${r.property.name} · ${unitLabel}` : unitLabel,
      unit_label: unitLabel,
      property: r.property?.name || "",
      property_address: r.property?.address || "",
      property_city: r.property?.city || "",
      owner_name: r.owner?.name || "",
      owner_email: r.owner?.email || "",
      vendor_name: r.vendor?.name || "",
      vendor_email: r.vendor?.email || "",
      balance: r.tenant ? money(balance) : "",
      balance_due: r.tenant ? money(Math.max(0, balance)) : "",
      company_name: company?.dba || company?.legalName || "",
      today: formatMergeDate(today),
      recipient_name: recipientName || tenantName || r.owner?.name || r.vendor?.name || "",
    },
    records: r,
    policies,
  };
}
