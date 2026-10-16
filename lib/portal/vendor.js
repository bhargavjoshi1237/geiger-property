import { VENDOR_STATUS_OPTIONS } from "./constants";
import { ownFiles } from "./files";
import { amountOf, dateOf, meta, rowOf, rowsIn, rowsOf, str, todayISO } from "./http";
import { logPortalActivity } from "./common";

// Server-only data for the vendor portal: work orders assigned to the vendor
// (status, notes, photos, completion), invoices raised as approval-pending bills,
// and COI / license uploads as record_items awaiting staff review.

export const vendorPermissions = (ctx) => {
  const m = ctx.partyMeta;
  return {
    acceptWork: m.portalAcceptWork !== false,
    invoices: m.portalUploadInvoices !== false,
    compliance: m.portalUploadCoi !== false,
    tenantContact: Boolean(m.portalSeeTenantContact),
  };
};

const list = (v) => (Array.isArray(v) ? v : []);

function workOrderView(w, { property, unit, tenant, bills, perms }) {
  const m = meta(w);
  return {
    id: w.id,
    name: w.name || "Work order",
    status: w.status || "Open",
    priority: w.priority || "Medium",
    category: w.category || "",
    subcategory: m.subcategory || "",
    description: m.description || "",
    emergency: Boolean(m.emergency),
    scheduledDate: w.scheduled_date || "",
    dueDate: m.dueDate || "",
    createdAt: w.created_at,
    property: property ? { name: property.name || "", address: [property.address, property.city, property.state, property.zip].filter(Boolean).join(", ") } : { name: w.property_label || "", address: "" },
    unit: unit?.label || "",
    access: {
      entryPermission: m.entryPermission || "",
      accessNotes: m.accessNotes || "",
      keyLocation: m.keyLocation || "",
      gateCode: m.gateCode || "",
      petsPresent: Boolean(m.petsPresent),
      petDetails: m.petDetails || "",
      preferredTimes: list(m.preferredTimes),
    },
    tenant: perms.tenantContact && tenant ? { name: tenant.name || "", phone: m.contactPhone || tenant.phone || "", email: tenant.email || "" } : null,
    acceptance: m.vendorAcceptance || "",
    notes: list(m.vendorNotes).slice().reverse(),
    photos: list(m.photos),
    afterPhotos: list(m.afterPhotos),
    completionNotes: m.completionNotes || "",
    completedDate: m.completedDate || "",
    timeline: list(m.statusHistory).map((h) => ({ id: h.id, status: h.status, at: h.at, note: h.note || "" })).reverse(),
    invoices: bills.filter((b) => b.work_order_id === w.id).map(invoiceView),
  };
}

function invoiceView(b) {
  const m = meta(b);
  return {
    id: b.id,
    name: b.name || "Invoice",
    invoiceNumber: m.invoiceNumber || b.reference || "",
    amount: Number(b.amount || 0),
    amountPaid: Number(b.amount_paid || 0),
    billDate: b.bill_date || "",
    dueDate: b.due_date || "",
    paidOn: b.paid_on || "",
    status: b.status || "Open",
    approvalStatus: b.approval_status || "Not required",
    workOrderId: b.work_order_id || null,
    propertyName: b.property_name || "",
    attachmentUrl: m.attachmentUrl || "",
    createdAt: b.created_at,
  };
}

async function loadAssigned(ctx) {
  const rows = await rowsOf(
    ctx.admin.from("work_orders").select("*").eq("vendor_id", ctx.party.id).is("deleted_at", null).order("created_at", { ascending: false }),
    "vendor.work_orders",
  );
  return rows.filter((w) => w.status !== "Draft");
}

export async function vendorWorkOrders(ctx) {
  const rows = await loadAssigned(ctx);
  const perms = vendorPermissions(ctx);
  const [properties, units, tenants, bills] = await Promise.all([
    rowsIn(ctx.admin, "properties", "id", rows.map((w) => w.property_id), "vendor.properties"),
    rowsIn(ctx.admin, "units", "id", rows.map((w) => w.unit_id), "vendor.units"),
    perms.tenantContact ? rowsIn(ctx.admin, "tenants", "id", rows.map((w) => w.tenant_id), "vendor.tenants") : [],
    rowsOf(ctx.admin.from("bills").select("*").eq("vendor_id", ctx.party.id).is("deleted_at", null), "vendor.bills"),
  ]);
  const byId = (arr) => new Map(arr.map((r) => [r.id, r]));
  const P = byId(properties);
  const U = byId(units);
  const T = byId(tenants);
  return rows.map((w) =>
    workOrderView(w, { property: P.get(w.property_id), unit: U.get(w.unit_id), tenant: T.get(w.tenant_id), bills, perms }),
  );
}

async function assignedOne(ctx, id) {
  const w = await rowOf(ctx.admin.from("work_orders").select("*").eq("id", id).is("deleted_at", null).maybeSingle(), "vendor.wo");
  return w && w.vendor_id === ctx.party.id ? w : null;
}

// Vendor actions on an assigned job: accept / decline / status / note / photos / complete.
export async function updateWorkOrder(ctx, id, input) {
  const w = await assignedOne(ctx, id);
  if (!w) return { ok: false, status: 404, error: "That work order isn't assigned to you." };
  const perms = vendorPermissions(ctx);
  const m = meta(w);
  const at = new Date().toISOString();
  const by = `${ctx.party.name || "Vendor"} (vendor portal)`;
  const metadata = { ...m };
  const patch = { metadata };
  let summary = "";

  const moveTo = (next, note) => {
    if (next === w.status) return;
    patch.status = next;
    metadata.statusHistory = [{ id: crypto.randomUUID(), status: next, from: w.status, at, by, note: note || "" }, ...list(m.statusHistory)].slice(0, 100);
    if (next === "In progress" && !metadata.startedAt) metadata.startedAt = at;
    if (next === "Completed" && !metadata.completedDate) metadata.completedDate = at.slice(0, 10);
  };

  switch (input.action) {
    case "accept":
    case "decline": {
      if (!perms.acceptWork) return { ok: false, error: "Accepting work in the portal is turned off for your account." };
      const declined = input.action === "decline";
      const reason = str(input.reason, 500);
      if (declined && !reason) return { ok: false, error: "Tell the office why you're declining." };
      metadata.vendorAcceptance = declined ? "Declined" : "Accepted";
      metadata.vendorAcceptanceAt = at;
      metadata.vendorDeclineReason = declined ? reason : "";
      metadata.vendorNotes = [...list(m.vendorNotes), { id: crypto.randomUUID(), body: declined ? `Declined: ${reason}` : "Accepted the job", at, by }];
      summary = declined ? "Declined a work order" : "Accepted a work order";
      break;
    }
    case "status": {
      const next = String(input.status || "");
      if (!VENDOR_STATUS_OPTIONS.includes(next) || next === "Completed") return { ok: false, error: "Choose a valid status." };
      if (next === "Scheduled") {
        const date = dateOf(input.scheduledDate);
        if (!date) return { ok: false, error: "Pick the scheduled date." };
        patch.scheduled_date = date;
      }
      if (next === "On hold") metadata.holdReason = str(input.reason, 200) || "Waiting on vendor";
      moveTo(next, str(input.note, 500));
      summary = `Set work order to ${next}`;
      break;
    }
    case "note": {
      const body = str(input.body, 2000);
      if (!body) return { ok: false, error: "Write a note first." };
      metadata.vendorNotes = [...list(m.vendorNotes), { id: crypto.randomUUID(), body, at, by }].slice(-200);
      summary = "Added a note to a work order";
      break;
    }
    case "photos": {
      const field = input.field === "afterPhotos" ? "afterPhotos" : "photos";
      const files = ownFiles(input.photos, ctx.member.id, 20);
      if (!files.length) return { ok: false, error: "Upload at least one photo." };
      metadata[field] = [...list(m[field]), ...files];
      summary = `Added ${files.length} ${field === "afterPhotos" ? "after" : "before"} photo${files.length === 1 ? "" : "s"}`;
      break;
    }
    case "complete": {
      const notes = str(input.notes, 4000);
      if (!notes) return { ok: false, error: "Describe the work you completed." };
      metadata.completionNotes = notes;
      metadata.completedDate = dateOf(input.completedDate) || todayISO();
      metadata.vendorCompletedAt = at;
      const after = ownFiles(input.photos, ctx.member.id, 20);
      if (after.length) metadata.afterPhotos = [...list(m.afterPhotos), ...after];
      moveTo("Completed", "Completed by the vendor");
      summary = "Marked a work order complete";
      break;
    }
    default:
      return { ok: false, error: "Unknown action." };
  }

  const { error } = await ctx.admin.from("work_orders").update(patch).eq("id", w.id);
  if (error) {
    console.error("[portal.vendor.update]", error.message);
    return { ok: false, error: "We couldn't update the work order." };
  }
  await logPortalActivity(ctx, `${summary}: ${w.name}`, { ownerType: "workorder", ownerId: w.id });
  return { ok: true };
}

// --- Invoices -------------------------------------------------------------------------

export async function vendorInvoices(ctx) {
  const rows = await rowsOf(
    ctx.admin.from("bills").select("*").eq("vendor_id", ctx.party.id).is("deleted_at", null).order("created_at", { ascending: false }),
    "vendor.invoices",
  );
  return rows.map(invoiceView);
}

const addDays = (iso, days) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

// Submit an invoice → a bills row pending approval (staff approve it into AP).
export async function submitInvoice(ctx, input) {
  if (!vendorPermissions(ctx).invoices) return { ok: false, error: "Invoice upload is turned off for your account." };
  const amount = amountOf(input.amount);
  if (!amount) return { ok: false, error: "Enter the invoice amount." };
  const invoiceNumber = str(input.invoiceNumber, 60);
  let wo = null;
  if (input.workOrderId) {
    wo = await assignedOne(ctx, input.workOrderId);
    if (!wo) return { ok: false, error: "Pick one of your work orders." };
  }
  const property = wo?.property_id
    ? await rowOf(ctx.admin.from("properties").select("id, name").eq("id", wo.property_id).maybeSingle(), "vendor.property")
    : null;
  const termsDays = Number(ctx.partyMeta.paymentTermsDays || ctx.partyMeta.termsDays || 30) || 30;
  const billDate = dateOf(input.invoiceDate) || todayISO();
  const attachment = ownFiles(input.attachment ? [input.attachment] : [], ctx.member.id)[0];
  const label = wo ? wo.name : str(input.description, 120) || "Services";
  const row = {
    project_id: ctx.projectId,
    name: `${invoiceNumber ? `Invoice ${invoiceNumber}` : "Invoice"} · ${label}`.slice(0, 200),
    vendor_id: ctx.party.id,
    vendor_name: ctx.party.name || "",
    work_order_id: wo?.id || null,
    property_id: wo?.property_id || null,
    property_name: property?.name || wo?.property_label || "",
    unit_id: wo?.unit_id || null,
    category: wo?.category || "Maintenance",
    amount,
    amount_paid: 0,
    bill_date: billDate,
    due_date: dateOf(input.dueDate) || addDays(billDate, termsDays),
    reference: invoiceNumber || null,
    status: "Open",
    approval_status: "Pending",
    created_by: ctx.user.id,
    metadata: {
      source: "vendor_portal",
      invoiceNumber,
      description: str(input.description, 2000),
      attachmentUrl: attachment?.url || "",
      attachmentName: attachment?.label || "",
      submittedAt: new Date().toISOString(),
      submittedBy: ctx.party.name || "",
      portalMemberId: ctx.member.id,
    },
  };
  const { data, error } = await ctx.admin.from("bills").insert(row).select("*").single();
  if (error) {
    console.error("[portal.vendor.invoice]", error.message);
    return { ok: false, error: "We couldn't submit your invoice." };
  }
  await logPortalActivity(ctx, `Submitted invoice ${invoiceNumber || ""} for ${amount.toFixed(2)}`.replace("  ", " "), {
    ownerType: "bill",
    ownerId: data.id,
  });
  return { ok: true, invoice: invoiceView(data) };
}

// --- Compliance (COIs / licenses) ---------------------------------------------------------

function complianceView(r) {
  const m = meta(r);
  const expired = r.ends_on && r.ends_on < todayISO();
  return {
    id: r.id,
    kind: r.kind,
    name: r.name || "",
    status: expired ? "Expired" : r.status || "Pending",
    startsOn: r.starts_on || "",
    endsOn: r.ends_on || "",
    amount: Number(r.amount || 0),
    policyType: m.policyType || "",
    policyNumber: m.policyNumber || "",
    number: m.number || "",
    state: m.state || "",
    documentUrl: m.documentUrl || "",
    source: m.source || "",
    createdAt: r.created_at,
  };
}

export async function vendorCompliance(ctx) {
  const rows = await rowsOf(
    ctx.admin
      .from("record_items")
      .select("*")
      .eq("owner_type", "vendor")
      .eq("owner_id", ctx.party.id)
      .in("kind", ["insurance_policy", "license"])
      .is("deleted_at", null)
      .order("ends_on", { ascending: false, nullsFirst: false }),
    "vendor.compliance",
  );
  return rows.map(complianceView);
}

export async function addCompliance(ctx, input) {
  if (!vendorPermissions(ctx).compliance) return { ok: false, error: "Document upload is turned off for your account." };
  const kind = input.kind === "license" ? "license" : "insurance_policy";
  const name = str(input.name, 120);
  const endsOn = dateOf(input.endsOn);
  if (!name || !endsOn) return { ok: false, error: kind === "license" ? "Add the license type and expiry date." : "Add the carrier and expiry date." };
  const doc = ownFiles(input.document ? [input.document] : [], ctx.member.id)[0];
  if (!doc) return { ok: false, error: "Attach the certificate or license document." };
  const row = {
    project_id: ctx.projectId,
    owner_type: "vendor",
    owner_id: ctx.party.id,
    kind,
    name,
    status: "Pending",
    starts_on: dateOf(input.startsOn) || null,
    ends_on: endsOn,
    amount: kind === "insurance_policy" ? amountOf(input.amount) || null : null,
    created_by: ctx.user.id,
    metadata: {
      ...(kind === "insurance_policy"
        ? { policyType: str(input.policyType, 60) || "General liability", policyNumber: str(input.policyNumber, 80), additionalInsured: Boolean(input.additionalInsured) }
        : { number: str(input.number, 80), state: str(input.state, 4) }),
      documentUrl: doc.url,
      documentName: doc.label,
      source: "portal",
      submittedAt: new Date().toISOString(),
    },
  };
  const { data, error } = await ctx.admin.from("record_items").insert(row).select("*").single();
  if (error) {
    console.error("[portal.vendor.compliance]", error.message);
    return { ok: false, error: "We couldn't save the document." };
  }
  await ctx.admin.rpc("merge_meta", { p_table: "vendors", p_id: ctx.party.id, p_patch: { lastComplianceChangeAt: new Date().toISOString() } });
  await logPortalActivity(ctx, `Uploaded ${kind === "license" ? "a license" : "an insurance certificate"} for review`);
  return { ok: true, item: complianceView(data) };
}
