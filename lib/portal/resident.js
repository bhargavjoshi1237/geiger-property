import { openItems, round2, runningLedger, summarize, SOURCE_LABELS } from "@/lib/ledger/postings";
import { CLOSED_REQUEST_STATUSES } from "./constants";
import { ownFiles } from "./files";
import { amountOf, dateOf, meta, rowOf, rowsIn, rowsOf, str, todayISO } from "./http";
import { accountIndex, residentLines } from "./ledger";
import { listDocumentsFor, listTenantDocuments, logPortalActivity } from "./common";

// Server-only data for the resident portal. Everything is keyed off the
// session's own tenant row (ctx.party), never ids from the browser.

const LIVE_LEASE = ["Active", "Expiring soon", "Month-to-month", "Notice given", "Pending"];

// Permission switches staff set on the tenant (Portal tab); unset = allowed.
export const residentPermissions = (ctx) => {
  const m = ctx.partyMeta;
  return {
    payments: m.portalAllowPayments !== false && !m.restrictNoOnline,
    paymentsBlockedReason: m.restrictNoOnline ? "Online payments are turned off for your account — contact the office." : "",
    requests: m.portalAllowRequests !== false,
    documents: m.portalAllowDocuments !== false,
    messages: m.portalAllowMessages !== false,
    ledger: m.portalShowLedger !== false,
  };
};

// The tenant's leases, current lease, unit, property and building.
export async function residentContext(ctx) {
  const { admin, party: tenant } = ctx;
  const parties = await rowsOf(
    admin.from("lease_parties").select("lease_id").eq("tenant_id", tenant.id).is("deleted_at", null),
    "lease_parties",
  );
  const [own, linked] = await Promise.all([
    rowsOf(admin.from("leases").select("*").eq("tenant_id", tenant.id).is("deleted_at", null), "leases"),
    rowsIn(admin, "leases", "id", [tenant.lease_id, ...parties.map((p) => p.lease_id)], "leases"),
  ]);
  const leases = [...new Map([...own, ...linked].map((l) => [l.id, l])).values()].sort((a, b) =>
    String(b.term_start || "").localeCompare(String(a.term_start || "")),
  );
  const lease =
    leases.find((l) => l.id === tenant.lease_id) || leases.find((l) => LIVE_LEASE.includes(l.status)) || leases[0] || null;
  const unitId = tenant.unit_id || lease?.unit_id || null;
  const unit = unitId ? await rowOf(admin.from("units").select("*").eq("id", unitId).maybeSingle(), "unit") : null;
  const propertyId = tenant.property_id || lease?.property_id || unit?.property_id || null;
  const property = propertyId
    ? await rowOf(admin.from("properties").select("*").eq("id", propertyId).maybeSingle(), "property")
    : null;
  return { tenant, leases, lease, unit, property, buildingId: unit?.building_id || null };
}

const leaseView = (l) =>
  l && {
    id: l.id,
    name: l.name || "Lease",
    status: l.status || "",
    rent: Number(l.rent || 0),
    deposit: Number(l.deposit || 0),
    termStart: l.term_start || "",
    termEnd: l.term_end || "",
    unit: l.unit || "",
    dueDay: Number(meta(l).rentDueDay || meta(l).dueDay || 1) || 1,
  };

export function homeView(rc) {
  const p = rc.property;
  return {
    property: p ? { id: p.id, name: p.name || "", address: [p.address, p.city, p.state, p.zip].filter(Boolean).join(", "), coverUrl: p.cover_url || "" } : null,
    unit: rc.unit ? { id: rc.unit.id, label: rc.unit.label || "", bedrooms: rc.unit.bedrooms, bathrooms: rc.unit.bathrooms, sqft: rc.unit.sqft } : null,
    lease: leaseView(rc.lease),
    leases: rc.leases.map(leaseView),
  };
}

// --- Ledger --------------------------------------------------------------------

export async function residentLedger(ctx, rc) {
  const [lines, idx] = await Promise.all([
    residentLines(ctx.admin, ctx.party.id, rc.leases.map((l) => l.id)),
    accountIndex(ctx.admin, ctx.projectId),
  ]);
  if (!lines.length) {
    return { source: "account", balance: round2(Number(ctx.party.balance || 0)), credit: 0, rows: [], openCharges: [] };
  }
  const rows = runningLedger("tenant", lines, idx).map((r) => ({
    id: r.entryId,
    date: r.date,
    memo: r.memo || SOURCE_LABELS[r.sourceType] || "Entry",
    type: SOURCE_LABELS[r.sourceType] || "Entry",
    sourceType: r.sourceType,
    charge: r.charge,
    payment: r.payment,
    balance: r.balance,
  }));
  const sum = summarize(lines, idx);
  const open = openItems(lines, idx, "receivable").map((i) => ({
    id: i.entryId,
    date: i.date,
    memo: i.memo || SOURCE_LABELS[i.sourceType] || "Charge",
    amount: i.amount,
    paid: i.paid,
    open: i.open,
  }));
  return {
    source: "ledger",
    balance: rows.length ? rows[rows.length - 1].balance : 0,
    credit: round2(Math.max(0, sum.prepaid)),
    rows: rows.reverse(),
    openCharges: open,
  };
}

// Online payments + autopay plans recorded for this tenant (read-only view).
export async function residentPayments(ctx) {
  const [payments, plans] = await Promise.all([
    rowsOf(
      ctx.admin.from("online_payments").select("*").eq("tenant_id", ctx.party.id).is("deleted_at", null).order("created_at", { ascending: false }).limit(50),
      "online_payments",
    ),
    rowsOf(
      ctx.admin.from("autopay_plans").select("*").eq("tenant_id", ctx.party.id).is("deleted_at", null).order("created_at", { ascending: false }),
      "autopay_plans",
    ),
  ]);
  const plan = plans.find((p) => p.status === "active") || plans.find((p) => p.status !== "canceled") || null;
  return {
    payments: payments.map((p) => ({
      id: p.id,
      amount: Number(p.amount || 0),
      total: Number(p.total || p.amount || 0),
      fee: Number(p.convenience_fee || 0),
      status: p.status,
      method: p.method_label || p.method || "",
      source: p.source,
      date: p.paid_at || p.created_at,
      description: p.description || "",
    })),
    autopay: plan
      ? {
          id: plan.id,
          status: plan.status,
          leaseId: plan.lease_id,
          method: plan.method_label || plan.method || "",
          chargeDay: plan.charge_day,
          amountMode: plan.amount_mode,
          lastRunOn: plan.last_run_on,
          lastStatus: plan.last_status,
        }
      : null,
  };
}

// --- Maintenance requests ----------------------------------------------------------

function requestView(w) {
  const m = meta(w);
  const history = Array.isArray(m.statusHistory) ? m.statusHistory : [];
  return {
    id: w.id,
    name: w.name || "Request",
    kind: w.kind,
    status: w.status || "Submitted",
    priority: w.priority || "Medium",
    category: w.category || "",
    subcategory: m.subcategory || "",
    area: m.area || "",
    description: m.description || "",
    emergency: Boolean(m.emergency),
    entryPermission: m.entryPermission || "",
    preferredTimes: Array.isArray(m.preferredTimes) ? m.preferredTimes : [],
    scheduledDate: w.scheduled_date || "",
    completedDate: m.completedDate || "",
    assigned: Boolean(w.vendor_id || w.vendor_name || w.technician),
    createdAt: w.created_at,
    photos: Array.isArray(m.photos) ? m.photos : [],
    afterPhotos: Array.isArray(m.afterPhotos) ? m.afterPhotos : [],
    comments: (Array.isArray(m.portalComments) ? m.portalComments : []).slice().reverse(),
    // Timeline oldest → newest; staff names stay internal.
    timeline: history
      .map((h) => ({ id: h.id, status: h.status, at: h.at, note: h.note && !/^owner/i.test(h.note) ? h.note : "" }))
      .reverse(),
    open: !CLOSED_REQUEST_STATUSES.includes(w.status),
  };
}

export async function listRequests(ctx) {
  const rows = await rowsOf(
    ctx.admin.from("work_orders").select("*").eq("tenant_id", ctx.party.id).is("deleted_at", null).order("created_at", { ascending: false }),
    "requests",
  );
  return rows.filter((w) => w.status !== "Draft" && meta(w).hideFromTenant !== true).map(requestView);
}

async function ownRequest(ctx, id) {
  const w = await rowOf(ctx.admin.from("work_orders").select("*").eq("id", id).is("deleted_at", null).maybeSingle(), "request");
  return w && w.tenant_id === ctx.party.id ? w : null;
}

const PRIORITIES = ["Low", "Medium", "High", "Urgent"];

export async function createRequest(ctx, rc, input) {
  const name = str(input.name, 160);
  if (!name) return { ok: false, error: "Describe the problem in a few words." };
  const emergency = Boolean(input.emergency);
  const priority = emergency ? "Urgent" : PRIORITIES.includes(input.priority) ? input.priority : "Medium";
  const now = new Date().toISOString();
  const tenant = ctx.party;
  const label = [rc.property?.name, rc.unit?.label].filter(Boolean).join(" · ");
  const row = {
    id: crypto.randomUUID(),
    project_id: ctx.projectId,
    name,
    kind: "request",
    status: "Submitted",
    priority,
    category: str(input.category, 60),
    tenant_id: tenant.id,
    tenant_name: tenant.name || "",
    unit_id: rc.unit?.id || null,
    property_id: rc.property?.id || null,
    lease_id: rc.lease?.id || null,
    property_label: label,
    created_by: ctx.user.id,
    metadata: {
      source: "tenant",
      channel: "Resident portal",
      reportedBy: tenant.name || "",
      reportedOn: todayISO(),
      subcategory: str(input.subcategory, 60),
      area: str(input.area, 60),
      description: str(input.description, 4000),
      emergency,
      entryPermission: ["allowed", "call_first", "present"].includes(input.entryPermission) ? input.entryPermission : "",
      preferredTimes: (Array.isArray(input.preferredTimes) ? input.preferredTimes : []).map((t) => str(t, 40)).slice(0, 6),
      petsPresent: Boolean(input.petsPresent),
      petDetails: str(input.petDetails, 200),
      accessNotes: str(input.accessNotes, 1000),
      contactPhone: str(input.contactPhone, 40) || tenant.phone || "",
      photos: ownFiles(input.photos, ctx.member.id),
      portalMemberId: ctx.member.id,
      statusHistory: [{ id: crypto.randomUUID(), status: "Submitted", from: "", at: now, by: tenant.name || "Resident", note: "Submitted from the resident portal" }],
    },
  };
  const { data, error } = await ctx.admin.from("work_orders").insert(row).select("*").single();
  if (error) {
    console.error("[portal.requests.create]", error.message);
    return { ok: false, error: "We couldn't submit your request." };
  }
  await logPortalActivity(ctx, `Submitted a maintenance request: ${name}`, { ownerType: "workorder", ownerId: data.id });
  return { ok: true, request: requestView(data) };
}

// Resident follow-ups: comment, add photos, or cancel a request not yet underway.
export async function updateRequest(ctx, id, input) {
  const w = await ownRequest(ctx, id);
  if (!w) return { ok: false, status: 404, error: "That request isn't available." };
  const m = meta(w);
  const now = new Date().toISOString();
  const by = ctx.party.name || "Resident";
  const patch = { metadata: { ...m } };
  let summary = "";

  if (input.action === "comment") {
    const body = str(input.body, 2000);
    const photos = ownFiles(input.photos, ctx.member.id);
    if (!body && !photos.length) return { ok: false, error: "Write a comment first." };
    patch.metadata.portalComments = [...(m.portalComments || []), { id: crypto.randomUUID(), body, at: now, by, from: "resident" }].slice(-100);
    if (photos.length) patch.metadata.photos = [...(m.photos || []), ...photos];
    summary = "Added an update to a maintenance request";
  } else if (input.action === "cancel") {
    if (!["Submitted", "In review", "Open"].includes(w.status)) {
      return { ok: false, error: "This request is already underway — message the office to cancel it." };
    }
    patch.status = "Cancelled";
    patch.metadata.cancelReason = "Resolved by tenant";
    patch.metadata.statusHistory = [
      { id: crypto.randomUUID(), status: "Cancelled", from: w.status, at: now, by, note: str(input.reason, 500) || "Cancelled by the resident" },
      ...(m.statusHistory || []),
    ].slice(0, 100);
    summary = "Cancelled a maintenance request";
  } else {
    return { ok: false, error: "Unknown action." };
  }

  const { data, error } = await ctx.admin.from("work_orders").update(patch).eq("id", w.id).select("*").single();
  if (error) {
    console.error("[portal.requests.update]", error.message);
    return { ok: false, error: "We couldn't update your request." };
  }
  await logPortalActivity(ctx, `${summary}: ${w.name}`, { ownerType: "workorder", ownerId: w.id });
  return { ok: true, request: requestView(data) };
}

// --- Documents & insurance -----------------------------------------------------------

export async function residentDocuments(ctx, rc) {
  const [docs, files] = await Promise.all([
    listDocumentsFor(ctx.admin, [
      { type: "tenant", ids: [ctx.party.id], label: "Your file" },
      { type: "lease", ids: rc.leases.map((l) => l.id), label: "Lease" },
    ]),
    listTenantDocuments(ctx.admin, ctx.party.id),
  ]);
  const seen = new Set();
  return [...docs, ...files]
    .filter((d) => (seen.has(d.id) ? false : seen.add(d.id)))
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

const policyView = (r) => {
  const m = meta(r);
  const expired = r.ends_on && r.ends_on < todayISO();
  return {
    id: r.id,
    carrier: r.name || "",
    policyNumber: m.policyNumber || "",
    status: expired ? "Expired" : r.status || "Pending",
    startsOn: r.starts_on || "",
    endsOn: r.ends_on || "",
    liability: Number(r.amount || 0),
    personalProperty: Number(m.personalProperty || 0),
    interestedPartyListed: Boolean(m.interestedPartyListed),
    documentUrl: m.documentUrl || "",
    source: m.source || "",
    createdAt: r.created_at,
  };
};

export async function listInsurance(ctx) {
  const rows = await rowsOf(
    ctx.admin
      .from("record_items")
      .select("*")
      .eq("owner_type", "tenant")
      .eq("owner_id", ctx.party.id)
      .eq("kind", "insurance_policy")
      .is("deleted_at", null)
      .order("ends_on", { ascending: false, nullsFirst: false }),
    "insurance",
  );
  const m = ctx.partyMeta;
  return {
    required: !m.insuranceWaived && m.insuranceRequired !== false,
    minimumLiability: Number(m.insuranceMinLiability || m.minimumLiability || 0),
    policies: rows.map(policyView),
  };
}

export async function addInsurance(ctx, input) {
  const carrier = str(input.carrier, 120);
  const endsOn = dateOf(input.endsOn);
  if (!carrier || !endsOn) return { ok: false, error: "Add the carrier and the expiry date." };
  const doc = ownFiles(input.document ? [input.document] : [], ctx.member.id)[0];
  const row = {
    project_id: ctx.projectId,
    owner_type: "tenant",
    owner_id: ctx.party.id,
    kind: "insurance_policy",
    name: carrier,
    status: "Pending",
    starts_on: dateOf(input.startsOn) || null,
    ends_on: endsOn,
    amount: amountOf(input.liability) || null,
    created_by: ctx.user.id,
    metadata: {
      policyNumber: str(input.policyNumber, 80),
      personalProperty: amountOf(input.personalProperty) || "",
      interestedPartyListed: Boolean(input.interestedPartyListed),
      insuredNames: str(input.insuredNames, 200),
      documentUrl: doc?.url || "",
      documentName: doc?.label || "",
      source: "portal",
      submittedAt: new Date().toISOString(),
    },
  };
  const { data, error } = await ctx.admin.from("record_items").insert(row).select("*").single();
  if (error) {
    console.error("[portal.insurance.create]", error.message);
    return { ok: false, error: "We couldn't save your policy." };
  }
  await logPortalActivity(ctx, `Uploaded renters insurance (${carrier}) for review`);
  return { ok: true, policy: policyView(data) };
}
