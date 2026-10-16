"use client";

import { prospectsLayer } from "@/lib/supabase/prospects";
import { showingsLayer } from "@/lib/supabase/showings";
import { applicationsLayer } from "@/lib/supabase/applications";
import { waitlistLayer } from "@/lib/supabase/waitlist";
import { listingsLayer, listListingsForUnit } from "@/lib/supabase/listings";
import { leasesLayer } from "@/lib/supabase/leases";
import { leasePartiesLayer } from "@/lib/supabase/lease_parties";
import { createTenant, updateTenant } from "@/lib/supabase/tenants";
import { getUnit } from "@/lib/supabase/units";
import { listRecordItems } from "@/lib/supabase/record_items";
import { getSetting } from "@/lib/supabase/settings";
import { logSystemActivity } from "@/lib/supabase/activity_log";
import {
  PROSPECT_STATUS_MAP,
  PROSPECT_WON,
  SCREENING_CRITERIA_DEFAULTS,
  APP_APPROVED,
  todayISO,
} from "./shared";

// Cross-record leasing-funnel flows (prospect → showing → application → lease).
// Screen-side orchestration over the data layers: returns results, never toasts.

// Activity owner types (= each screen config's `key`).
export const OWNER = {
  listing: "listing",
  prospect: "prospect",
  showing: "showing",
  application: "application",
  waitlist: "waitlist_entry",
  comp: "rent_comp",
};

const stageLabel = (s) => PROSPECT_STATUS_MAP[s]?.label || s || "—";

// Append a stage transition to a prospect's metadata.stageHistory.
export function nextStageHistory(prospect, to, note) {
  const history = Array.isArray(prospect?.metadata?.stageHistory) ? prospect.metadata.stageHistory : [];
  return [
    ...history,
    { id: crypto.randomUUID(), from: prospect?.status || "", to, note: note || "", at: new Date().toISOString() },
  ];
}

// Move a prospect (by id) to a stage from another record; skips backwards moves unless forced.
const STAGE_RANK = { New: 0, Contacted: 1, Touring: 2, Toured: 3, Applied: 4, Converted: 5, Leased: 5, Lost: 6 };
export async function advanceProspect(prospectId, to, note, { force = false } = {}) {
  if (!prospectId) return null;
  const p = await prospectsLayer.get(prospectId);
  if (!p) return null;
  if (!force && (STAGE_RANK[p.status] ?? 0) >= (STAGE_RANK[to] ?? 0)) return p;
  const updated = await prospectsLayer.update(prospectId, { status: to });
  if (!updated) return null;
  await prospectsLayer.mergeMeta(prospectId, { stageHistory: nextStageHistory(p, to, note) });
  logSystemActivity(OWNER.prospect, prospectId, "stage", `Stage: ${stageLabel(p.status)} → ${stageLabel(to)}${note ? ` (${note})` : ""}`);
  return updated;
}

// Random numeric access code for self-guided tours (internal; no smart-lock provider connected).
export function generateAccessCode(length = 6) {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => String(b % 10)).join("");
}

// Company screening criteria (settings `screening_criteria`) merged over defaults.
export async function loadScreeningCriteria() {
  const stored = await getSetting("screening_criteria", {});
  return { ...SCREENING_CRITERIA_DEFAULTS, ...(stored || {}) };
}

// Monthly rent an application is measured against: the unit's rent, else the listing's.
export async function applicationRent(app) {
  if (app?.unitId) {
    const u = await getUnit(app.unitId);
    if (Number(u?.rent)) return Number(u.rent);
  }
  if (app?.listingId) {
    const l = await listingsLayer.get(app.listingId);
    if (Number(l?.rent)) return Number(l.rent);
  }
  return Number(app?.metadata?.quotedRent) || 0;
}

// Applicant + co-applicant income for the income-to-rent ratio.
export async function householdIncome(app, criteria) {
  const own = (Number(app?.monthlyIncome) || 0) + (Number(app?.metadata?.otherIncome) || 0);
  if (criteria && criteria.countCoApplicantIncome === false) return { total: own, own, co: 0 };
  const co = ((await listRecordItems(OWNER.application, app.id, "co_applicant")) ?? []).reduce(
    (s, r) => s + (r.metadata?.role === "occupant" ? 0 : Number(r.amount) || 0),
    0,
  );
  return { total: own + co, own, co };
}

// Leasing-funnel counts across prospects, showings, applications and leases.
export async function loadFunnel() {
  const [prospects, showings, apps] = await Promise.all([
    prospectsLayer.list(),
    showingsLayer.list(),
    applicationsLayer.list(),
  ]);
  const p = prospects ?? [];
  const s = showings ?? [];
  const a = apps ?? [];
  const toured = new Set(s.filter((x) => x.status === "Completed").map((x) => x.prospectId || x.id));
  const leases = new Set([
    ...a.filter((x) => x.leaseId || x.status === "Converted").map((x) => x.prospectId || x.id),
    ...p.filter((x) => PROSPECT_WON.includes(x.status)).map((x) => x.id),
  ]);
  return {
    leads: p.length,
    showings: s.filter((x) => x.status !== "Cancelled").length,
    toured: toured.size,
    applications: a.length,
    approved: a.filter((x) => APP_APPROVED.includes(x.status)).length,
    leases: leases.size,
  };
}

// Create a showing for a prospect; advances the prospect to "Showing scheduled".
export async function scheduleShowingFor(prospect, values) {
  const row = await showingsLayer.create({
    id: crypto.randomUUID(),
    name: values.name || `${prospect.name || "Prospect"} · ${values.unit || "Tour"}`,
    prospectId: prospect.id,
    prospectName: prospect.name || "",
    prospectContact: prospect.email || prospect.phone || "",
    listingId: values.listingId || prospect.listingId || "",
    listingName: values.listingName || prospect.listingName || "",
    unitId: values.unitId || "",
    unit: values.unit || "",
    propertyId: values.propertyId || "",
    propertyName: values.propertyName || "",
    showingDate: values.showingDate || "",
    showingTime: values.showingTime || "",
    durationMinutes: Number(values.durationMinutes) || 30,
    showingType: values.showingType || "In-person",
    agent: values.agent || "",
    status: "Scheduled",
  });
  if (row) {
    logSystemActivity(OWNER.showing, row.id, "created", `Scheduled from prospect ${prospect.name || ""}`.trim());
    await advanceProspect(prospect.id, "Touring", values.showingDate ? `Showing on ${values.showingDate}` : "Showing scheduled");
  }
  return row;
}

// Create an application linked to a prospect; advances the prospect to "Applied".
export async function createApplicationFor(prospect, values) {
  const row = await applicationsLayer.create({
    id: crypto.randomUUID(),
    name: values.name || prospect.name || "Applicant",
    email: values.email ?? prospect.email ?? "",
    phone: values.phone ?? prospect.phone ?? "",
    prospectId: prospect.id,
    listingId: values.listingId || prospect.listingId || "",
    listingName: values.listingName || prospect.listingName || "",
    unitId: values.unitId || prospect.unitId || "",
    unit: values.unit || prospect.unit || "",
    propertyId: values.propertyId || prospect.propertyId || "",
    propertyName: values.propertyName || prospect.propertyName || "",
    source: prospect.source || "",
    moveInDate: values.moveInDate || prospect.moveInDate || "",
    monthlyIncome: Number(values.monthlyIncome) || 0,
    occupants: Number(values.occupants) || 1,
    applicationFee: Number(values.applicationFee) || 0,
    feePaid: false,
    appliedOn: todayISO(),
    status: "Submitted",
  });
  if (row) {
    logSystemActivity(OWNER.application, row.id, "created", `Converted from prospect ${prospect.name || ""}`.trim());
    await advanceProspect(prospect.id, "Applied", "Application submitted");
  }
  return row;
}

// Approved application → tenant + lease + lease parties; closes out the prospect,
// waitlist entries and listings. Returns { ok, tenantId, leaseId, warnings }.
export async function convertApplicationToLease(app, values) {
  const warnings = [];
  const name = String(app.name || "").trim() || "Applicant";
  const tenantId = crypto.randomUUID();
  const leaseId = crypto.randomUUID();
  const unit = app.unitId ? await getUnit(app.unitId) : null;
  const propertyId = app.propertyId || unit?.propertyId || "";

  const tenant = await createTenant({
    id: tenantId,
    name,
    email: app.email || "",
    phone: app.phone || "",
    unit: app.unit || unit?.label || "",
    unitId: app.unitId || "",
    propertyId,
    leaseId,
    leaseStart: values.termStart || "",
    leaseEnd: values.termEnd || "",
    status: "Current",
  });
  if (!tenant) return { ok: false, error: "Couldn't create the tenant." };

  const lease = await leasesLayer.create({
    id: leaseId,
    name: values.leaseName || `${app.unit || "Unit"} — ${name}`,
    unit: app.unit || unit?.label || "",
    unitId: app.unitId || "",
    propertyId,
    tenantId,
    tenantName: name,
    rent: Number(values.rent) || 0,
    deposit: Number(values.deposit) || 0,
    termStart: values.termStart || "",
    termEnd: values.termEnd || "",
    status: values.leaseStatus || "Draft",
    metadata: {
      applicationId: app.id,
      prospectId: app.prospectId || null,
      ...(values.conditions ? { approvalConditions: values.conditions } : {}),
    },
  });
  if (!lease) {
    await updateTenant(tenantId, { leaseId: "" });
    return { ok: false, tenantId, error: "Tenant created, but the lease couldn't be saved." };
  }

  // Lease parties: primary applicant + co-applicants / cosigners / guarantors / occupants.
  const coApplicants = (await listRecordItems(OWNER.application, app.id, "co_applicant")) ?? [];
  const parties = [
    { name, email: app.email || "", phone: app.phone || "", role: "tenant", tenantId, isPrimary: true },
    ...coApplicants.map((c) => ({
      name: c.name || "Co-applicant",
      email: c.metadata?.email || "",
      phone: c.metadata?.phone || "",
      role: c.metadata?.role || "tenant",
      isPrimary: false,
    })),
  ];
  const onLease = parties.filter((p) => p.role === "tenant").length || 1;
  for (const p of parties) {
    const created = await leasePartiesLayer.create({
      id: crypto.randomUUID(),
      leaseId,
      tenantId: p.tenantId || "",
      role: p.role,
      name: p.name,
      email: p.email,
      phone: p.phone,
      responsibilityPct: p.role === "tenant" ? Math.round((100 / onLease) * 100) / 100 : 0,
      isPrimary: p.isPrimary,
    });
    if (!created) warnings.push(`Couldn't add ${p.name} to the lease.`);
  }

  const appUpdated = await applicationsLayer.update(app.id, { status: "Converted", tenantId, leaseId });
  if (!appUpdated) warnings.push("Couldn't mark the application converted.");
  await applicationsLayer.mergeMeta(app.id, { convertedAt: new Date().toISOString() });
  logSystemActivity(OWNER.application, app.id, "action", `Converted to lease ${values.leaseName || ""}`.trim());
  logSystemActivity("lease", leaseId, "created", `Created from application ${name}`);

  if (app.prospectId) {
    const p = await advanceProspect(app.prospectId, "Converted", "Lease created", { force: true });
    if (!p) warnings.push("Couldn't update the prospect.");
  }

  // Waitlist entries tied to this applicant become Placed.
  const entries = (await waitlistLayer.list()) ?? [];
  const email = String(app.email || "").toLowerCase();
  const mine = entries.filter(
    (e) =>
      !["Placed", "Removed"].includes(e.status) &&
      (e.applicationId === app.id ||
        (app.prospectId && e.prospectId === app.prospectId) ||
        (email && String(e.email || "").toLowerCase() === email)),
  );
  for (const e of mine) {
    const ok = await waitlistLayer.update(e.id, { status: "Placed", unitId: app.unitId || "", unit: app.unit || "" });
    if (ok) logSystemActivity(OWNER.waitlist, e.id, "action", `Placed in ${app.unit || "a unit"}`);
  }

  // Live listings for the unit are now leased.
  const listings = (await listListingsForUnit(app.unitId)) ?? [];
  for (const l of listings.filter((x) => ["Active", "Paused", "Draft"].includes(x.status))) {
    const ok = await listingsLayer.update(l.id, { status: "Leased", leaseId, syndicated: false });
    if (ok) logSystemActivity(OWNER.listing, l.id, "action", `Marked leased — ${name}`);
  }

  return { ok: true, tenantId, leaseId, warnings };
}
