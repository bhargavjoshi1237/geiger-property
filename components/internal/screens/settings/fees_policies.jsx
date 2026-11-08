"use client";

import { useEffect, useState } from "react";

import { SectionCard } from "@/components/internal/shared/screen_kit";
import { FieldsForm } from "@/components/internal/screens/entity/fields_form";
import { policyField } from "@/components/internal/screens/entity/sections/policy_section";
import { useModules } from "@/context/modules-context";
import { usePermission } from "@/context/rbac-context";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { POLICY_DEFAULTS, POLICY_GROUPS, companyPolicies, policiesFor } from "@/lib/policies";
import { SCREENING_POLICY_KEYS, withLegacyScreening } from "@/lib/screening/criteria_policy";
import { getSetting } from "@/lib/supabase/settings";
import { SettingsPage, useSetting } from "./settings_kit";
import { StatementSettingsCard } from "./statement_settings_card";

// Fees & Policies: the company layer of the policy cascade (settings `fees_policies`), which properties and leases override on their Policies tabs.

// Screening keys stay out of the stored defaults so an unsaved one falls back to the old `screening_criteria` setting (RISK-04).
const isScreeningKey = (k) => SCREENING_POLICY_KEYS.includes(k);
const STORED_DEFAULTS = Object.fromEntries(Object.entries(POLICY_DEFAULTS).filter(([k]) => !isScreeningKey(k)));

// The next stored value: every other policy as before, screening keys only once saved or edited.
function nextStored(prev, partial) {
  const out = { ...companyPolicies(prev), ...partial };
  for (const k of SCREENING_POLICY_KEYS) if (!(k in (prev || {})) && !(k in partial)) delete out[k];
  return out;
}

// A group's fields, with a heading before each run of policies that names a `section`.
function withSectionHeadings(policies) {
  const out = [];
  let current = null;
  for (const p of policies) {
    if (p.section && p.section !== current) out.push({ key: `heading-${p.section}`, label: p.section, type: "heading" });
    current = p.section || null;
    out.push(p);
  }
  return out;
}

export function FeesPoliciesScreen() {
  const setting = useSetting("fees_policies", STORED_DEFAULTS, { label: "Fees & policies" });
  const [legacy, setLegacy] = useState(undefined);
  const canEditScreening = usePermission("property.screening.criteria");
  const leasingOn = useModules().isOn("leasing");
  const { section } = useWorkspaceUrl();
  const loading = setting.loading || legacy === undefined;

  useEffect(() => {
    let alive = true;
    getSetting("screening_criteria", {}).then((v) => alive && setLegacy(v || {}));
    return () => {
      alive = false;
    };
  }, []);

  // A link to one group (e.g. ?section=screening from Applications) scrolls to its card once loaded.
  useEffect(() => {
    if (loading || !section) return;
    document.getElementById(`policies-${section}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [loading, section]);

  const values = companyPolicies(withLegacyScreening(setting.value, legacy));
  const write = (partial) => setting.update((prev) => nextStored(prev, partial));
  const groups = POLICY_GROUPS.filter((g) => g.key !== "screening" || leasingOn);

  return (
    <SettingsPage
      title="Fees & Policies"
      description="Company defaults for rent, payments, leasing, screening, deposits, maintenance and management fees. Properties and leases can override them."
      setting={{ ...setting, loading }}
    >
      {groups.map((g) => {
        const screening = g.key === "screening";
        const policies = policiesFor("company", g.key).map(policyField);
        const fields = screening ? withSectionHeadings(policies).map((f) => (canEditScreening ? f : { ...f, disabled: true })) : policies;
        const description = screening && !canEditScreening ? `${g.description} Your role can't change screening criteria.` : g.description;
        return (
          <div key={g.key} id={`policies-${g.key}`} className="scroll-mt-6">
            <SectionCard title={g.label} description={description}>
              <FieldsForm item={values} fields={fields} onPatch={write} onCommit={write} flat />
            </SectionCard>
          </div>
        );
      })}
      {/* Billing: resident statements save on their own (billing_settings, CORE-12). */}
      <StatementSettingsCard />
    </SettingsPage>
  );
}

export default FeesPoliciesScreen;
