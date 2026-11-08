import { SCREENING_CHECKS } from "@/components/internal/screens/marketing/shared";

// The recorded screening report behind "View report" (RISK-03): the manual provider's findings, report reference and consent
// for one application, served only to property.screening.view_reports. RISK-08 adds provider orders and RISK-02 the access log.

const text = (v) => (v === null || v === undefined ? "" : String(v));

// The report from an application row and its co_applicant record_items rows (pure).
export function buildScreeningReport(app, coApplicants = []) {
  const m = app?.metadata || {};
  const recorded = m.screening || {};
  return {
    applicationId: app?.id || null,
    applicant: text(app?.name || app?.applicant_name),
    status: text(app?.status),
    vendor: text(m.screeningVendor),
    reference: text(m.screeningReference),
    consent: m.screeningConsent === true,
    consentOn: text(m.screeningConsentOn),
    requestedAt: text(m.screeningRequestedAt),
    checks: SCREENING_CHECKS.map((c) => {
      const s = recorded[c.key] || {};
      return {
        key: c.key,
        label: c.label,
        status: text(s.status) || "Not started",
        result: text(s.result),
        score: c.scored && s.score !== "" && s.score !== undefined && s.score !== null ? Number(s.score) : null,
        completedOn: text(s.completedOn),
        findings: text(s.notes),
      };
    }),
    coApplicants: coApplicants.map((r) => ({
      id: r.id,
      name: text(r.name),
      role: text(r.metadata?.role),
      status: text(r.status) || "Not started",
      findings: text(r.metadata?.screeningNotes),
    })),
  };
}

// Server: one application's report inside the project (null when it isn't there); `scoped` is requireStaff's auth.scoped.
export async function loadScreeningReport(scoped, applicationId) {
  const app = await scoped("applications")
    .select("id, name, applicant_name, status, metadata")
    .eq("id", applicationId)
    .is("deleted_at", null)
    .maybeSingle();
  if (app.error) throw new Error(app.error.message);
  if (!app.data) return null;
  const parties = await scoped("record_items")
    .select("id, name, status, metadata")
    .eq("owner_type", "application")
    .eq("owner_id", applicationId)
    .eq("kind", "co_applicant")
    .is("deleted_at", null)
    .order("sort", { ascending: true });
  if (parties.error) throw new Error(parties.error.message);
  return buildScreeningReport(app.data, parties.data || []);
}
