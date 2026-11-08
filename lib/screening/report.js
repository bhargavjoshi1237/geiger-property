import { SCREENING_CHECKS } from "@/components/internal/screens/marketing/shared";
import { PRIMARY } from "./sensitive";

// The recorded screening report behind "View report" (RISK-03): the manual provider's findings, report reference and consent
// for one application, served only to property.screening.view_reports. The reference and findings live in screening_details (RISK-02).

const text = (v) => (v === null || v === undefined ? "" : String(v));

// The report from an application row, its co_applicant record_items rows and its screening_details rows (pure); legacy
// metadata copies are read when no detail row holds the value.
export function buildScreeningReport(app, coApplicants = [], detailRows = []) {
  const m = app?.metadata || {};
  const recorded = m.screening || {};
  const detailOf = (ref) => detailRows.find((r) => r.party_ref === ref)?.detail || {};
  const primary = detailOf(PRIMARY);
  return {
    applicationId: app?.id || null,
    applicant: text(app?.name || app?.applicant_name),
    status: text(app?.status),
    vendor: text(m.screeningVendor),
    reference: text(primary.screeningReference ?? m.screeningReference),
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
        findings: text(primary.findings?.[c.key] ?? s.notes),
      };
    }),
    coApplicants: coApplicants.map((r) => ({
      id: r.id,
      name: text(r.name),
      role: text(r.metadata?.role),
      status: text(r.status) || "Not started",
      findings: text(detailOf(r.id).screeningNotes ?? r.metadata?.screeningNotes),
    })),
  };
}

// Server: one application's report inside the project (null when it isn't there). `auth` is requireStaff's result; the
// protected detail is read with its service-role client.
export async function loadScreeningReport({ scoped, admin, projectId }, applicationId) {
  const app = await scoped("applications")
    .select("id, name, applicant_name, status, metadata")
    .eq("id", applicationId)
    .is("deleted_at", null)
    .maybeSingle();
  if (app.error) throw new Error(app.error.message);
  if (!app.data) return null;
  const [parties, details] = await Promise.all([
    scoped("record_items")
      .select("id, name, status, metadata")
      .eq("owner_type", "application")
      .eq("owner_id", applicationId)
      .eq("kind", "co_applicant")
      .is("deleted_at", null)
      .order("sort", { ascending: true }),
    admin.from("screening_details").select("party_ref, detail").eq("project_id", projectId).eq("application_id", applicationId).is("deleted_at", null),
  ]);
  if (parties.error) throw new Error(parties.error.message);
  if (details.error) throw new Error(details.error.message);
  return buildScreeningReport(app.data, parties.data || [], details.data || []);
}
