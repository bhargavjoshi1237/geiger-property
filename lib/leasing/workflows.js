import { leasesLayer } from "@/lib/supabase/leases";
import { renewalsLayer } from "@/lib/supabase/renewals";
import { movesLayer } from "@/lib/supabase/moves";
import { inspectionsLayer } from "@/lib/supabase/inspections";
import { securityDepositsLayer } from "@/lib/supabase/security_deposits";
import { noticesLayer } from "@/lib/supabase/notices";
import { leaseTemplatesLayer } from "@/lib/supabase/lease_templates";
import { leasePartiesLayer, listLeaseParties } from "@/lib/supabase/lease_parties";
import { recurringChargesLayer } from "@/lib/supabase/recurring_charges";
import { unitTurnsLayer } from "@/lib/supabase/unit_turns";
import { createDocument } from "@/lib/supabase/documents";
import { uploadPropertyImage } from "@/lib/supabase/property_storage";
import { getTenant, updateTenant } from "@/lib/supabase/tenants";
import { getUnit, updateUnit } from "@/lib/supabase/units";
import { getProperty } from "@/lib/supabase/properties";
import { getSetting } from "@/lib/supabase/settings";
import { effectivePolicies } from "@/lib/policies";
import { DEFAULT_LEASE_BODY, buildMergeValues, mergeTemplate } from "./merge";
import { noticeMergeValues, noticeTemplateFor } from "./notice_templates";

// Cross-table leasing workflows (renewal, move-in/out, document generation…).
// Orchestration over the per-area data layers; same contract as the layers:
// never throw or toast — return the created rows, or null when a step fails.

export const todayISO = () => new Date().toISOString().slice(0, 10);

export function addDays(date, days) {
  if (!date) return "";
  const d = new Date(`${String(date).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + (Number(days) || 0));
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const uuid = () => crypto.randomUUID();
const label = (lease) => lease.unit || lease.name || "Lease";

// Denormalized link columns shared by moves / inspections / deposits.
const linksOf = (lease) => ({
  leaseId: lease.id,
  leaseName: lease.name || "",
  unitId: lease.unitId || "",
  unit: lease.unit || "",
  tenantId: lease.tenantId || "",
  tenantName: lease.tenantName || "",
  propertyId: lease.propertyId || "",
});

export const DEFAULT_MOVE_IN_CHECKLIST = [
  "Lease signed by all parties",
  "Security deposit received",
  "First month's rent received",
  "Renters insurance proof on file",
  "Utilities transferred to tenant",
  "Move-in inspection completed",
  "Keys and access codes handed over",
  "Portal invitation sent",
];

export const DEFAULT_MOVE_OUT_CHECKLIST = [
  "Notice to vacate received",
  "Forwarding address collected",
  "Move-out inspection scheduled",
  "Keys and access codes returned",
  "Utilities transferred back",
  "Final meter readings recorded",
  "Deposit disposition sent",
  "Unit turn started",
];

export const checklistOf = (labels) => labels.map((l) => ({ id: uuid(), label: l, done: false }));

// Everything a merge or policy lookup needs for one lease.
export async function loadLeaseContext(lease) {
  if (!lease?.id) return null;
  const [tenant, unit, property, parties, charges, company, profile] = await Promise.all([
    lease.tenantId ? getTenant(lease.tenantId) : null,
    lease.unitId ? getUnit(lease.unitId) : null,
    lease.propertyId ? getProperty(lease.propertyId) : null,
    listLeaseParties(lease.id),
    recurringChargesLayer.list({ leaseId: lease.id }),
    getSetting("fees_policies", {}),
    getSetting("company_profile", {}),
  ]);
  return {
    lease,
    tenant,
    unit,
    property,
    parties: parties ?? [],
    charges: charges ?? [],
    company: profile || {},
    policies: effectivePolicies({ company: company || {}, property, lease }),
  };
}

// Upload text as a .txt file and record it in property.documents for the owner.
export async function storeTextDocument({ ownerType, ownerId, kind, name, text }) {
  if (!ownerId) return null;
  const safe = String(name || "document").replace(/[^a-zA-Z0-9 _-]+/g, "").trim().replace(/\s+/g, "-") || "document";
  const file = new File([text], `${safe}.txt`, { type: "text/plain" });
  const uploaded = await uploadPropertyImage(ownerType, ownerId, file, { compress: false });
  if (!uploaded?.url) return null;
  return createDocument({
    id: uuid(),
    ownerType,
    ownerId,
    kind,
    name: `${name}.txt`,
    url: uploaded.url,
    sizeBytes: uploaded.sizeBytes || file.size,
  });
}

// Merge the lease's template (or the starter body) against its records.
export async function mergeLeaseDocument(lease, templateId = lease?.templateId) {
  const ctx = await loadLeaseContext(lease);
  if (!ctx) return null;
  const template = templateId ? await leaseTemplatesLayer.get(templateId) : null;
  const body = String(template?.body || "").trim() ? template.body : DEFAULT_LEASE_BODY;
  return { ...mergeTemplate(body, buildMergeValues(ctx)), template, context: ctx };
}

// Generate the lease document and store it on the lease → { document, unknown, empty, template }.
export async function generateLeaseDocument(lease) {
  const merged = await mergeLeaseDocument(lease);
  if (!merged) return null;
  const document = await storeTextDocument({
    ownerType: "lease",
    ownerId: lease.id,
    kind: "lease_agreement",
    name: `${lease.name || "Lease"} — agreement ${todayISO()}`,
    text: merged.text,
  });
  return document ? { document, unknown: merged.unknown, empty: merged.empty, template: merged.template } : null;
}

// Record a renewal offer for a lease → the renewals row.
export function createRenewalOffer(lease, v) {
  const sendNow = Boolean(v.sendNow);
  return renewalsLayer.create({
    id: uuid(),
    name: v.name || `${label(lease)} — renewal`,
    leaseId: lease.id,
    tenantId: lease.tenantId || "",
    tenantName: lease.tenantName || "",
    unitId: lease.unitId || "",
    unit: lease.unit || "",
    currentRent: Number(lease.rent) || 0,
    proposedRent: Number(v.proposedRent) || 0,
    currentEnd: lease.termEnd || "",
    newStart: v.newStart || "",
    newEnd: v.newEnd || "",
    termMonths: Number(v.termMonths) || 0,
    offerSentOn: sendNow ? todayISO() : "",
    responseDue: v.responseDue || "",
    status: sendNow ? "Offer sent" : "Not started",
    metadata: {
      increaseNotes: v.notes || "",
      offerOptions: Array.isArray(v.offerOptions) ? v.offerOptions : [],
      concession: v.concession || "",
    },
  });
}

const CARRY_META = [
  "policyOverrides",
  "utilities",
  "landlord",
  "address",
  "clauses",
  "insuranceRequired",
  "insuranceMinLiability",
  "renewalOption",
  "noticeDays",
  "petDeposit",
  "premises",
];

// Accept a renewal: create the new lease (renewal_of_id → old), copy its people,
// move charges/deposits across when asked, mark the old lease Renewed.
export async function acceptRenewal(renewal, { transferCharges = true, transferDeposits = true } = {}) {
  if (!renewal?.leaseId) return null;
  const old = await leasesLayer.get(renewal.leaseId);
  if (!old) return null;
  const meta = old.metadata || {};
  const carried = Object.fromEntries(CARRY_META.filter((k) => k in meta).map((k) => [k, meta[k]]));
  const newId = uuid();
  const created = await leasesLayer.create({
    id: newId,
    name: `${old.name || "Lease"} (renewal${renewal.newStart ? ` ${String(renewal.newStart).slice(0, 4)}` : ""})`,
    unit: old.unit,
    unitId: old.unitId,
    tenantId: old.tenantId,
    tenantName: old.tenantName,
    propertyId: old.propertyId,
    rent: Number(renewal.proposedRent) || Number(old.rent) || 0,
    deposit: Number(old.deposit) || 0,
    termStart: renewal.newStart || "",
    termEnd: renewal.newEnd || "",
    leaseType: old.leaseType,
    termType: "fixed",
    moveInDate: old.moveInDate || old.termStart || "",
    templateId: old.templateId,
    renewalOfId: old.id,
    status: "Pending",
    metadata: { ...carried, renewalId: renewal.id, renewedFromName: old.name || "" },
  });
  if (!created) return null;

  const [parties, charges, deposits] = await Promise.all([
    listLeaseParties(old.id),
    transferCharges ? recurringChargesLayer.list({ leaseId: old.id }) : [],
    transferDeposits ? securityDepositsLayer.list({ leaseId: old.id }) : [],
  ]);
  await Promise.all([
    ...(parties ?? []).map((p) =>
      leasePartiesLayer.create({
        id: uuid(),
        leaseId: newId,
        tenantId: p.tenantId,
        role: p.role,
        name: p.name,
        email: p.email,
        phone: p.phone,
        responsibilityPct: p.responsibilityPct,
        isPrimary: p.isPrimary,
      }),
    ),
    ...(charges ?? []).map((c) => recurringChargesLayer.update(c.id, { leaseId: newId })),
    ...(deposits ?? [])
      .filter((d) => d.status === "Held")
      .map((d) => securityDepositsLayer.update(d.id, { leaseId: newId, leaseName: created.name })),
  ]);
  await leasesLayer.update(old.id, { status: "Renewed" });
  await renewalsLayer.update(renewal.id, { status: "Accepted" });
  await renewalsLayer.mergeMeta(renewal.id, { newLeaseId: newId, newLeaseName: created.name, decidedOn: todayISO() });
  return created;
}

// Decline a renewal (optionally the tenant is moving out).
export async function declineRenewal(renewal, { reason = "", movingOut = false } = {}) {
  const saved = await renewalsLayer.update(renewal.id, { status: movingOut ? "Moving out" : "Declined" });
  if (!saved) return null;
  await renewalsLayer.mergeMeta(renewal.id, { declineReason: reason, decidedOn: todayISO() });
  return saved;
}

// Schedule a move-in: moves row (kind "in") + move-in inspection, linked both ways.
export async function scheduleMoveIn(lease, v = {}) {
  const moveId = uuid();
  const inspectionId = v.createInspection === false ? "" : uuid();
  const deposits = (await securityDepositsLayer.list({ leaseId: lease.id })) ?? [];
  const deposit = deposits[0] || null;
  const move = await movesLayer.create({
    id: moveId,
    name: `Move-in — ${label(lease)}`,
    kind: "in",
    moveDate: v.moveDate || lease.moveInDate || lease.termStart || "",
    status: "Scheduled",
    ...linksOf(lease),
    inspectionId,
    depositId: deposit?.id || "",
    metadata: { checklist: checklistOf(DEFAULT_MOVE_IN_CHECKLIST) },
  });
  if (!move) return null;
  const inspection = inspectionId
    ? await inspectionsLayer.create({
        id: inspectionId,
        name: `Move-in inspection — ${label(lease)}`,
        kind: "move_in",
        inspectionDate: v.inspectionDate || move.moveDate || "",
        inspector: v.inspector || "",
        status: "Scheduled",
        moveId,
        ...linksOf(lease),
      })
    : null;
  return { move, inspection };
}

// Schedule a move-out: moves row (kind "out") + move-out inspection + optional
// unit turn, and stamp the deposit's move-out date and return deadline.
export async function scheduleMoveOut(lease, v = {}) {
  const moveId = uuid();
  const inspectionId = uuid();
  const moveOutDate = v.moveOutDate || lease.moveOutDate || lease.termEnd || "";
  const move = await movesLayer.create({
    id: moveId,
    name: `Move-out — ${label(lease)}`,
    kind: "out",
    moveDate: moveOutDate,
    status: "Scheduled",
    ...linksOf(lease),
    inspectionId,
    depositId: v.depositId || "",
    metadata: {
      checklist: checklistOf(DEFAULT_MOVE_OUT_CHECKLIST),
      forwardingAddress: v.forwardingAddress || "",
      moveOutReason: v.reason || "",
    },
  });
  if (!move) return null;
  const inspection = await inspectionsLayer.create({
    id: inspectionId,
    name: `Move-out inspection — ${label(lease)}`,
    kind: "move_out",
    inspectionDate: v.inspectionDate || moveOutDate,
    inspector: v.inspector || "",
    status: "Scheduled",
    moveId,
    ...linksOf(lease),
  });
  const turn =
    v.createTurn && lease.unitId
      ? await unitTurnsLayer.create({
          id: uuid(),
          name: `Turn — ${label(lease)}`,
          unitId: lease.unitId,
          unit: lease.unit || "",
          propertyId: lease.propertyId || "",
          moveId,
          moveOutDate,
          targetReadyDate: v.targetReadyDate || addDays(moveOutDate, 7),
          budget: Number(v.turnBudget) || 0,
          status: "Not started",
        })
      : null;
  const deposit = v.depositId
    ? await securityDepositsLayer.update(v.depositId, {
        moveId,
        moveOutDate,
        returnDue: addDays(moveOutDate, Number(v.returnDays) || 30),
      })
    : null;
  if (deposit) await securityDepositsLayer.mergeMeta(v.depositId, { forwardingAddress: v.forwardingAddress || "" });
  if (v.markUnitNotice && lease.unitId) await updateUnit(lease.unitId, { status: "Notice" });
  return { move, inspection, turn, deposit };
}

// Point the unit and primary tenant at an activated lease.
export async function syncOccupancy(lease, { unit = true, tenant = true } = {}) {
  const results = await Promise.all([
    unit && lease.unitId
      ? updateUnit(lease.unitId, {
          status: "Occupied",
          tenantId: lease.tenantId || "",
          occupantName: lease.tenantName || "",
          leaseStart: lease.termStart || "",
          leaseEnd: lease.termEnd || "",
        })
      : true,
    tenant && lease.tenantId
      ? updateTenant(lease.tenantId, {
          status: "Current",
          leaseId: lease.id,
          unitId: lease.unitId || "",
          propertyId: lease.propertyId || "",
          unit: lease.unit || "",
          leaseStart: lease.termStart || "",
          leaseEnd: lease.termEnd || "",
        })
      : true,
  ]);
  return results.every(Boolean);
}

// Record a notice linked to the lease → the notices row.
export function createLeaseNotice(lease, v) {
  return noticesLayer.create({
    id: uuid(),
    name: v.name || `${v.noticeType || "Notice"} — ${label(lease)}`,
    noticeType: v.noticeType || "Other",
    tenantId: lease.tenantId || "",
    tenantName: lease.tenantName || "",
    unitId: lease.unitId || "",
    unit: lease.unit || "",
    leaseId: lease.id,
    propertyId: lease.propertyId || "",
    servedDate: v.servedDate || "",
    cureBy: v.cureBy || "",
    deliveryMethod: v.deliveryMethod || "",
    status: v.status || (v.servedDate ? "Served" : "Draft"),
    metadata: { amountDue: Number(v.amountDue) || 0, noticeText: v.noticeText || "", direction: v.direction || "outgoing" },
  });
}

// Append itemized deductions to a deposit's metadata.deductions.
export async function addDepositDeductions(depositId, rows) {
  const deposit = await securityDepositsLayer.get(depositId);
  if (!deposit) return null;
  const existing = Array.isArray(deposit.metadata?.deductions) ? deposit.metadata.deductions : [];
  const merged = await securityDepositsLayer.mergeMeta(depositId, {
    deductions: [...existing, ...rows.map((r) => ({ id: uuid(), ...r }))],
  });
  return merged;
}

// Starter notice wording for a lease + notice draft, merged against its records.
export async function draftNoticeText(lease, notice) {
  const ctx = lease?.id ? await loadLeaseContext(lease) : null;
  const values = { ...(ctx ? buildMergeValues(ctx) : {}), ...noticeMergeValues(notice) };
  return mergeTemplate(noticeTemplateFor(notice?.noticeType), values).text;
}

// Effective policies for one lease (company → property → lease overrides).
export async function leasePolicies(lease) {
  const [company, property] = await Promise.all([
    getSetting("fees_policies", {}),
    lease?.propertyId ? getProperty(lease.propertyId) : null,
  ]);
  return effectivePolicies({ company: company || {}, property, lease });
}
