"use client";

import { ShieldCheck } from "lucide-react";

import { SectionCard, StatusPill } from "@/components/internal/shared/screen_kit";
import { FieldsForm } from "@/components/internal/screens/entity/fields_form";
import { makeComplianceSection } from "@/components/internal/screens/people/compliance_records";
import { InfoNotice } from "@/components/internal/screens/people/notice";
import {
  INSURANCE_POLICY_FIELDS,
  INSURANCE_REQUIREMENT_FIELDS,
  RENT_REPORTING_STATUS_MAP,
  TENANT_RENT_REPORTING_FIELDS,
  currency,
  formatDate,
  insuranceRequired,
} from "../shared";

const PolicyRecords = makeComplianceSection({
  kind: "insurance_policy",
  fields: INSURANCE_POLICY_FIELDS,
  singular: "Policy",
  plural: "Policies",
  icon: ShieldCheck,
  heading: "Renters insurance",
  required: insuranceRequired,
  defaults: () => ({ status: "Active" }),
  title: (r) => [r.name, r.policyNumber].filter(Boolean).join(" · "),
  meta: (r) =>
    [r.startsOn && `${formatDate(r.startsOn)} – ${formatDate(r.endsOn)}`, r.interestedPartyListed ? "Interested party listed" : null]
      .filter(Boolean)
      .join(" · ") || `Expires ${formatDate(r.endsOn)}`,
  aside: (r) => (Number(r.amount) ? currency(r.amount) : undefined),
  note: (item, required) =>
    required
      ? "Required while this tenant lives in a unit. Expiring policies show here 30 days out."
      : item?.metadata?.insuranceWaived
        ? "Requirement waived for this tenant."
        : "Not required for applicants or past tenants.",
});

// Renters insurance compliance: requirement settings + policies on file.
export function TenantInsuranceSection(props) {
  const { item, onPatch, onCommit, onCommitMeta } = props;
  return (
    <div className="space-y-4">
      <SectionCard title="Requirement">
        <FieldsForm item={item} fields={INSURANCE_REQUIREMENT_FIELDS} onPatch={onPatch} onCommit={onCommit} onCommitMeta={onCommitMeta} />
      </SectionCard>
      <PolicyRecords {...props} />
    </div>
  );
}

// Rent reporting opt-in — consent and enrollment recorded internally.
export function TenantRentReportingSection({ item, onPatch, onCommit, onCommitMeta }) {
  const status = item.metadata?.rentReportingStatus || "Not enrolled";
  return (
    <div className="space-y-4">
      <InfoNotice>
        Reporting provider not connected. Consent and enrollment are tracked here; payments are not sent to any
        bureau until a rent-reporting provider is connected in Settings → Integrations.
      </InfoNotice>
      <SectionCard title="Enrollment" action={<StatusPill status={status} map={RENT_REPORTING_STATUS_MAP} />}>
        <FieldsForm item={item} fields={TENANT_RENT_REPORTING_FIELDS} onPatch={onPatch} onCommit={onCommit} onCommitMeta={onCommitMeta} />
      </SectionCard>
    </div>
  );
}
