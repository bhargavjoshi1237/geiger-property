import { createHash, randomUUID } from "node:crypto";

import { openBill } from "@/lib/accounting/bills_server";
import { getProjectSetting } from "@/lib/messaging/context";
import { logActivity, logCommunication } from "@/lib/messaging/threads";
import { raiseReview } from "./review";
import {
  INTAKE_RULES_KEY,
  classifyMaintenanceText,
  parseIntakeAddress,
  parseInvoiceText,
  resolveIntakeRules,
} from "./intake_rules";

// Rules-based intake from email (ORCH-10, server-only). Mail to maintenance+<projectId>@ or bills+<projectId>@
// is matched to a tenant, vendor or owner by address and filed straight away as a draft record: a maintenance
// request (kind request, which fires the ORCH-01 trigger) or a Draft bill with its attachments in private storage.
// Drafts are created up front so the record exists the moment the email lands; an `intake` review item then asks a
// person to confirm, unless the sender is known and intake autonomy is "auto" (maintenance only — bills always wait
// for a person, and a confirmed bill is opened, never posted). Unknown senders raise a "Link to person" item that
// re-files the stored email once linked. Nothing here posts to the ledger.

export const INTAKE_BUCKET = "property-private";
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 10;
const PARTY_TABLES = { tenant: "tenants", vendor: "vendors", owner: "owners" };
const MAILBOX_PARTIES = { maintenance: ["tenant", "owner", "vendor"], bills: ["vendor"] };
const OWNER_TYPES = { work_order: "workorder", bill: "bill" };

const str = (v, max = 500) => String(v ?? "").trim().slice(0, max);
const todayIso = () => new Date().toISOString().slice(0, 10);
const usd = (n) => `$${(Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const likeEscape = (s) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
const safeName = (name) => str(name, 120).replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "attachment";
const fmtDate = (iso) => (iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "");

// Normalized inbound email; text and attachments are trimmed for storage on the review item.
function normalizeEmail(body, address) {
  const from = body.from;
  return {
    from: str(typeof from === "object" ? from?.email : from, 320).toLowerCase(),
    fromName: str(typeof from === "object" ? from?.name : "", 200),
    to: address,
    subject: str(body.subject, 300),
    text: String(body.text || "").trim().slice(0, 8000),
    receivedAt: str(body.receivedAt, 40) || new Date().toISOString(),
    messageId: str(body.messageId || body.message_id, 300),
  };
}

// Stable key per email, so provider retries never file twice.
const intakeKey = (projectId, email) =>
  createHash("sha256")
    .update([projectId, email.messageId || "", email.from, email.subject, email.text, email.messageId ? "" : email.receivedAt].join("\n"))
    .digest("hex")
    .slice(0, 24);

// --- Attachments (private bucket) ----------------------------------------------

function decodeAttachment(a) {
  const name = safeName(a?.filename || a?.name);
  let type = str(a?.contentType || a?.type, 120).toLowerCase() || "application/octet-stream";
  if (type === "application/octet-stream" && /\.pdf$/i.test(name)) type = "application/pdf";
  const b64 = String(a?.contentBase64 || a?.content || "").replace(/^data:[^,]*,/, "");
  const bytes = b64 ? Buffer.from(b64, "base64") : null;
  return { name, type, bytes };
}

async function storeAttachments(admin, projectId, key, list) {
  const files = [];
  const skipped = [];
  for (const [i, a] of (Array.isArray(list) ? list : []).slice(0, MAX_FILES).entries()) {
    const { name, type, bytes } = decodeAttachment(a);
    if (!bytes?.length) skipped.push({ name, reason: "empty" });
    else if (bytes.length > MAX_BYTES) skipped.push({ name, reason: "over 10 MB" });
    else if (!(type === "application/pdf" || type.startsWith("image/"))) skipped.push({ name, reason: `type ${type} not accepted` });
    else {
      const path = `intake/${projectId}/${key}/${i + 1}-${name}`;
      const { error } = await admin.storage.from(INTAKE_BUCKET).upload(path, bytes, { contentType: type, upsert: true });
      if (error) skipped.push({ name, reason: error.message });
      else files.push({ bucket: INTAKE_BUCKET, path, name, size: bytes.length, type });
    }
  }
  return { files, skipped };
}

// Short-lived link to a stored intake attachment (the bucket has no public read).
export async function signedAttachmentUrl(admin, path, expiresIn = 600) {
  if (!admin || !path) return null;
  const { data, error } = await admin.storage.from(INTAKE_BUCKET).createSignedUrl(path, expiresIn);
  return error ? null : data?.signedUrl || null;
}

// --- Parties ---------------------------------------------------------------------

function partyView(type, row) {
  return {
    type,
    id: row.id,
    name: row.name || row.contact_name || row.email || "",
    email: row.email || "",
    phone: row.phone || "",
    unitId: row.unit_id || null,
    unitLabel: row.unit || "",
    propertyId: row.property_id || null,
    leaseId: row.lease_id || null,
    metadata: row.metadata || {},
  };
}

// First tenant / owner / vendor in the project with this address (or a linked alternate address).
async function findParty(admin, projectId, email, types) {
  for (const type of types) {
    const table = PARTY_TABLES[type];
    const base = () => admin.from(table).select("*").eq("project_id", projectId).is("deleted_at", null).limit(5);
    const { data: direct } = await base().ilike("email", likeEscape(email));
    const rows = direct?.length ? direct : (await base().contains("metadata", { altEmails: [email] })).data || [];
    const row = rows.find((r) => r.status !== "Past" && r.status !== "Inactive") || rows[0];
    if (row) return partyView(type, row);
  }
  return null;
}

async function loadParty(admin, projectId, type, id) {
  const table = PARTY_TABLES[type];
  if (!table || !id) return null;
  const { data } = await admin.from(table).select("*").eq("id", id).maybeSingle();
  if (!data || data.deleted_at || data.project_id !== projectId) return null;
  return partyView(type, data);
}

// Where a request from this party belongs: the tenant's unit, or an owner's only property.
async function placeFor(admin, party) {
  let propertyId = party.propertyId;
  let unitLabel = party.unitLabel;
  if (party.type === "owner") {
    const { data } = await admin.from("property_owners").select("property_id").eq("owner_id", party.id).is("deleted_at", null);
    const ids = [...new Set((data || []).map((r) => r.property_id).filter(Boolean))];
    propertyId = ids.length === 1 ? ids[0] : null;
  }
  const [{ data: property }, { data: unit }] = await Promise.all([
    propertyId ? admin.from("properties").select("name").eq("id", propertyId).maybeSingle() : Promise.resolve({ data: null }),
    party.unitId ? admin.from("units").select("label").eq("id", party.unitId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  unitLabel = unit?.label || unitLabel || "";
  return {
    propertyId,
    unitId: party.type === "tenant" ? party.unitId : null,
    leaseId: party.type === "tenant" ? party.leaseId : null,
    unitLabel,
    label: [property?.name, unitLabel].filter(Boolean).join(" · "),
  };
}

// --- Drafts ----------------------------------------------------------------------

async function existingByKey(admin, table, projectId, key) {
  const { data } = await admin
    .from(table)
    .select("*")
    .eq("project_id", projectId)
    .eq("metadata->>intakeKey", key)
    .is("deleted_at", null)
    .limit(1);
  return data?.[0] || null;
}

async function createRequestDraft(admin, { projectId, party, email, rules, key, attachments, confirmedBy }) {
  const found = await existingByKey(admin, "work_orders", projectId, key);
  if (found) return { row: found, classification: found.metadata?.intake?.classification || null, existed: true };
  const classification = classifyMaintenanceText(`${email.subject}\n${email.text}`, rules);
  const place = await placeFor(admin, party);
  const now = new Date().toISOString();
  const name = str(email.subject || email.text.split("\n")[0], 160) || "Maintenance request by email";
  const row = {
    id: randomUUID(),
    project_id: projectId,
    name,
    kind: "request",
    status: "Submitted",
    priority: classification.priority,
    category: classification.category,
    tenant_id: party.type === "tenant" ? party.id : null,
    tenant_name: party.type === "tenant" ? party.name : null,
    unit_id: place.unitId,
    property_id: place.propertyId,
    lease_id: place.leaseId,
    property_label: place.label || null,
    metadata: {
      source: "email",
      channel: "Email",
      reportedBy: party.name || email.fromName || email.from,
      reportedOn: todayIso(),
      description: email.text.slice(0, 4000),
      emergency: classification.emergency,
      contactPhone: party.phone || "",
      attachments: attachments.files,
      intakeKey: key,
      intake: {
        mailbox: "maintenance",
        from: email.from,
        subject: email.subject,
        receivedAt: email.receivedAt,
        partyType: party.type,
        partyId: party.id,
        classification,
        ...(confirmedBy ? { confirmedAt: now, confirmedBy } : {}),
      },
      statusHistory: [{ id: randomUUID(), status: "Submitted", from: "", at: now, by: party.name || "Email", note: "Received by email" }],
    },
  };
  const { data, error } = await admin.from("work_orders").insert(row).select("*").single();
  if (error) throw new Error(`work_orders: ${error.message}`);
  return { row: data, classification, place };
}

async function createBillDraft(admin, { projectId, party, email, key, attachments, confirmedBy }) {
  const found = await existingByKey(admin, "bills", projectId, key);
  if (found) return { row: found, parsed: found.metadata?.intake?.parsed || null, existed: true };
  const parsed = parseInvoiceText(`${email.subject}\n${email.text}`);
  const vendor = party.name || email.from;
  const name = str(parsed.invoiceNumber ? `Invoice ${parsed.invoiceNumber} · ${vendor}` : email.subject || `Bill from ${vendor}`, 160);
  const row = {
    id: randomUUID(),
    project_id: projectId,
    name,
    vendor_id: party.id,
    vendor_name: vendor,
    amount: parsed.amount || 0,
    amount_paid: 0,
    bill_date: todayIso(),
    due_date: parsed.dueDate,
    status: "Draft",
    approval_status: "Not required",
    metadata: {
      source: "email",
      invoiceNumber: parsed.invoiceNumber || "",
      notes: email.text.slice(0, 4000),
      attachments: attachments.files,
      intakeKey: key,
      intake: {
        mailbox: "bills",
        from: email.from,
        subject: email.subject,
        receivedAt: email.receivedAt,
        partyType: party.type,
        partyId: party.id,
        parsed,
        ...(confirmedBy ? { confirmedAt: new Date().toISOString(), confirmedBy } : {}),
      },
    },
  };
  const { data, error } = await admin.from("bills").insert(row).select("*").single();
  if (error) throw new Error(`bills: ${error.message}`);
  return { row: data, parsed };
}

// File one email for a known party: create the draft, then either raise a confirmation item or (auto / staff-linked
// maintenance) treat it as confirmed. Bills always get a confirmation item. `actor` linked an unknown sender.
async function fileIntake(admin, { projectId, mailbox, address, email, party, rules, key, attachments, actor = null, dedupeKey = null }) {
  const isBill = mailbox === "bills";
  const autoCreate = !isBill && rules.autonomy === "auto";
  const confirmedBy = isBill ? null : actor ? actor.name || actor.email || "Staff" : autoCreate ? "Automatic (known sender)" : null;
  const draft = isBill
    ? await createBillDraft(admin, { projectId, party, email, key, attachments, confirmedBy })
    : await createRequestDraft(admin, { projectId, party, email, rules, key, attachments, confirmedBy });
  const record = draft.row;
  const recordType = isBill ? "bill" : "work_order";
  const files = attachments.files.length;

  if (!draft.existed) {
    await logActivity(admin, {
      projectId,
      ownerType: OWNER_TYPES[recordType],
      ownerId: record.id,
      verb: "intake",
      summary: `Created from an email by ${party.name || email.from} to ${address}${files ? ` (${files} attachment${files === 1 ? "" : "s"})` : ""}`,
      actorId: actor?.id || null,
      actorName: actor?.name || "Email intake",
      metadata: { intakeKey: key },
    });
    if (party.type === "tenant") {
      await logCommunication(admin, {
        projectId,
        tenantId: party.id,
        channel: "email",
        direction: "inbound",
        subject: email.subject,
        body: email.text,
        metadata: { intakeKey: key, workOrderId: record.id },
      });
    }
  }

  let reviewItemId = null;
  if (!confirmedBy) {
    const c = draft.classification;
    const note = isBill
      ? `${party.name} emailed an invoice${draft.parsed?.invoiceNumber ? ` (${draft.parsed.invoiceNumber})` : ""}${
          record.amount > 0 ? ` for ${usd(record.amount)}` : " with no amount found"
        }${record.due_date ? `, due ${fmtDate(record.due_date)}` : ""}. It was saved as a draft bill${
          files ? ` with ${files} attachment${files === 1 ? "" : "s"}` : ""
        }; confirming opens it for approval and payment. Nothing posts to the ledger until then.`
      : `${party.name} emailed "${record.name}". It was filed as ${c?.priority === "Urgent" ? "an Urgent" : `a ${c?.priority || record.priority}`} ${
          c?.category || record.category
        } request${record.property_label ? ` for ${record.property_label}` : ""}${
          c?.matched?.emergency?.length ? ` (emergency words: ${c.matched.emergency.join(", ")})` : ""
        }. Confirm the details.`;
    const raised = await raiseReview(admin, {
      projectId,
      dedupeKey: dedupeKey || `intake:${key}`,
      kind: "intake",
      sourceType: "intake",
      sourceId: record.id,
      recordType,
      recordId: record.id,
      recordLabel: record.name,
      propertyId: record.property_id || null,
      title: isBill ? `Confirm bill from ${party.name}` : `Confirm request from ${party.name}`,
      reasonCode: "intake_confirm",
      context: { sender: party.name, note },
      severity: !isBill && c?.emergency ? "urgent" : "soon",
      amountAtStake: isBill ? Number(record.amount) || null : null,
      proposedAction: { type: isBill ? "intake_confirm_bill" : "intake_confirm_request", recordId: record.id, label: isBill ? "Confirm bill" : "Confirm request" },
      metadata: { intake: { mailbox, address, partyType: party.type, partyId: party.id, email, attachments: attachments.files } },
    });
    reviewItemId = raised?.item?.id || null;
  }
  return { ok: true, outcome: isBill ? "bill" : "request", recordType, recordId: record.id, reviewItemId, confirmed: Boolean(confirmedBy) };
}

// --- Inbound entry point ---------------------------------------------------------

// Route an inbound webhook body addressed to an intake mailbox. Returns null when it isn't one (normal thread handling
// continues), else { ok, outcome, … } or { ok: false, status, error }.
export async function handleInboundIntake(admin, body) {
  const route = parseIntakeAddress([body?.to, body?.cc].flat().filter(Boolean));
  if (!route) return null;
  if (!admin) return { ok: false, status: 503, error: "SUPABASE_SERVICE_ROLE_KEY is not configured." };
  const { mailbox, projectId, address } = route;

  const { data: project } = await admin.schema("public").from("projects").select("id").eq("id", projectId).maybeSingle();
  if (!project) return { ok: false, status: 404, error: "Unknown intake address." };

  const email = normalizeEmail(body, address);
  const hasFiles = Array.isArray(body.attachments) && body.attachments.length > 0;
  if (!email.from) return { ok: false, status: 400, error: "from is required." };
  if (!email.text && !email.subject && !hasFiles) return { ok: false, status: 400, error: "The email is empty." };

  const key = intakeKey(projectId, email);
  const { data: seen } = await admin
    .from("review_items")
    .select("id")
    .eq("project_id", projectId)
    .eq("dedupe_key", `intake:${key}`)
    .is("deleted_at", null)
    .limit(1);
  if (seen?.length) return { ok: true, outcome: "duplicate", reviewItemId: seen[0].id };
  const filed = await existingByKey(admin, mailbox === "bills" ? "bills" : "work_orders", projectId, key);
  if (filed) return { ok: true, outcome: "duplicate", recordId: filed.id };

  try {
    const rules = resolveIntakeRules(await getProjectSetting(admin, projectId, INTAKE_RULES_KEY));
    const attachments = await storeAttachments(admin, projectId, key, body.attachments);
    const party = await findParty(admin, projectId, email.from, MAILBOX_PARTIES[mailbox]);
    if (!party) {
      const raised = await raiseReview(admin, {
        projectId,
        dedupeKey: `intake:${key}`,
        kind: "intake",
        sourceType: "intake",
        title: `Unknown sender: ${email.fromName || email.from}`,
        reasonCode: "intake_unknown_sender",
        context: { sender: email.fromName ? `${email.fromName} (${email.from})` : email.from, address },
        severity: "soon",
        proposedAction: { type: "intake_link_sender", mailbox, label: "Link to person", partyTypes: MAILBOX_PARTIES[mailbox] },
        metadata: { intake: { mailbox, address, email, attachments: attachments.files, skippedAttachments: attachments.skipped } },
      });
      return { ok: true, outcome: "unknown_sender", reviewItemId: raised?.item?.id || null, skippedAttachments: attachments.skipped };
    }
    const out = await fileIntake(admin, { projectId, mailbox, address, email, party, rules, key, attachments });
    return { ...out, skippedAttachments: attachments.skipped };
  } catch (e) {
    console.error("[intake]", e?.message || e);
    return { ok: false, status: 500, error: "Couldn't file the email." };
  }
}

// --- Review-queue actions ("Run suggested") --------------------------------------

const projectOf = (item) => item.projectId ?? item.project_id ?? null;
const proposalOf = (item) => item.proposedAction ?? item.proposed_action ?? {};
const actorName = (actor) => actor?.name || actor?.email || "Staff";

async function confirmRequest(admin, item, { actor, input = {} } = {}) {
  const id = proposalOf(item).recordId || item.recordId || item.record_id;
  const { data: wo } = await admin.from("work_orders").select("*").eq("id", id).maybeSingle();
  if (!wo || wo.deleted_at) return { ok: false, message: "The request was deleted, so there's nothing to confirm." };
  const patch = {};
  if (["Low", "Medium", "High", "Urgent"].includes(input.priority)) patch.priority = input.priority;
  if (input.category) patch.category = str(input.category, 60);
  const meta = wo.metadata || {};
  patch.metadata = { ...meta, intake: { ...(meta.intake || {}), confirmedAt: new Date().toISOString(), confirmedBy: actorName(actor) } };
  const { error } = await admin.from("work_orders").update(patch).eq("id", wo.id);
  if (error) return { ok: false, message: `Couldn't confirm the request: ${error.message}` };
  await logActivity(admin, {
    projectId: wo.project_id,
    ownerType: "workorder",
    ownerId: wo.id,
    verb: "intake",
    summary: `Email intake confirmed by ${actorName(actor)}`,
    actorId: actor?.id || null,
    actorName: actorName(actor),
  });
  return { ok: true, message: "Request confirmed.", links: [{ type: "work_order", id: wo.id, label: wo.name }], resolve: true };
}

async function confirmBill(admin, item, { actor, input = {} } = {}) {
  const id = proposalOf(item).recordId || item.recordId || item.record_id;
  const { data: bill } = await admin.from("bills").select("*").eq("id", id).maybeSingle();
  if (!bill || bill.deleted_at) return { ok: false, message: "The bill was deleted, so there's nothing to confirm." };
  const links = [{ type: "bill", id: bill.id, label: bill.name }];
  if (bill.status !== "Draft") return { ok: true, message: "This bill was already opened.", links, resolve: true };
  const amount = input.amount !== undefined && input.amount !== "" ? Math.abs(Number(input.amount) || 0) : Number(bill.amount) || 0;
  if (amount <= 0) return { ok: false, message: "Add the bill amount on the bill first, then confirm.", links };
  const meta = bill.metadata || {};
  const patch = { amount, metadata: { ...meta, intake: { ...(meta.intake || {}), confirmedAt: new Date().toISOString(), confirmedBy: actorName(actor) } } };
  if (input.dueDate) patch.due_date = str(input.dueDate, 10);
  if (input.name) patch.name = str(input.name, 160);
  let opened;
  try {
    opened = await openBill(admin, bill, actor, patch);
  } catch (e) {
    return { ok: false, message: `Couldn't confirm the bill: ${e.message}`, links };
  }
  if (!opened.opened) return { ok: true, message: "This bill was already opened.", links, resolve: true };
  const pending = opened.pendingApproval;
  await logActivity(admin, {
    projectId: bill.project_id,
    ownerType: "bill",
    ownerId: bill.id,
    verb: "intake",
    summary: `Email intake confirmed by ${actorName(actor)} — bill opened${pending ? ", waiting for approval" : opened.posted ? ", posted to Accounts Payable" : ""}`,
    actorId: actor?.id || null,
    actorName: actorName(actor),
  });
  return {
    ok: true,
    message: pending
      ? `Bill opened for ${usd(amount)} and sent for approval. It posts to payables once approved.`
      : opened.postError
        ? `Bill opened for ${usd(amount)}, but it didn't post to payables: ${opened.postError}`
        : `Bill opened for ${usd(amount)} and posted to payables.`,
    links,
    resolve: true,
  };
}

async function linkSender(admin, item, { actor, input = {} } = {}) {
  const projectId = projectOf(item);
  const stored = (item.metadata || {}).intake || {};
  const mailbox = stored.mailbox || proposalOf(item).mailbox;
  const email = stored.email;
  if (!mailbox || !email?.from) return { ok: false, message: "The original email wasn't kept, so it can't be re-filed." };
  if (!(MAILBOX_PARTIES[mailbox] || []).includes(input.partyType)) {
    return { ok: false, message: mailbox === "bills" ? "Bills can only be linked to a vendor." : "Link this email to a tenant, owner or vendor." };
  }
  const party = await loadParty(admin, projectId, input.partyType, input.partyId);
  if (!party) return { ok: false, message: "That person couldn't be found in this workspace." };

  // Remember the address so the next email from it matches on its own.
  const alt = Array.isArray(party.metadata.altEmails) ? party.metadata.altEmails : [];
  if (email.from && email.from !== String(party.email || "").toLowerCase() && !alt.includes(email.from)) {
    await admin
      .from(PARTY_TABLES[party.type])
      .update({ metadata: { ...party.metadata, altEmails: [...alt, email.from].slice(-10) } })
      .eq("id", party.id);
  }

  const rules = resolveIntakeRules(await getProjectSetting(admin, projectId, INTAKE_RULES_KEY));
  const key = String(item.dedupeKey || item.dedupe_key || "").replace(/^intake:/, "") || intakeKey(projectId, email);
  try {
    const out = await fileIntake(admin, {
      projectId,
      mailbox,
      address: stored.address || email.to,
      email,
      party,
      rules,
      key,
      attachments: { files: Array.isArray(stored.attachments) ? stored.attachments : [], skipped: [] },
      actor: actor || { name: "Staff" },
      dedupeKey: `intake:${key}:linked`,
    });
    const { data: rec } = await admin.from(out.recordType === "bill" ? "bills" : "work_orders").select("name").eq("id", out.recordId).maybeSingle();
    return {
      ok: true,
      message: `Linked to ${party.name} and filed as a ${out.recordType === "bill" ? "draft bill — confirm it from the new review item" : "maintenance request"}.`,
      links: [{ type: out.recordType, id: out.recordId, label: rec?.name || "Record" }],
      resolve: true,
    };
  } catch (e) {
    return { ok: false, message: `Couldn't file the email: ${e?.message || e}` };
  }
}

// proposed_action.type → handler, wired into the review queue by proposed_actions.js.
export const INTAKE_ACTIONS = {
  intake_confirm_request: confirmRequest,
  intake_confirm_bill: confirmBill,
  intake_link_sender: linkSender,
};
