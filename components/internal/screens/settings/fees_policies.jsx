"use client";

import { SectionCard } from "@/components/internal/shared/screen_kit";
import { FieldsForm } from "@/components/internal/screens/entity/fields_form";
import { policyField } from "@/components/internal/screens/entity/sections/policy_section";
import { POLICY_DEFAULTS, POLICY_GROUPS, companyPolicies, policiesFor } from "@/lib/policies";
import { SettingsPage, useSetting } from "./settings_kit";
import { StatementSettingsCard } from "./statement_settings_card";

// Fees & Policies — the company layer of the policy cascade (settings key
// `fees_policies`). Properties and leases inherit these and can override them
// from their own Policies tab.

export function FeesPoliciesScreen() {
  const setting = useSetting("fees_policies", POLICY_DEFAULTS, { label: "Fees & policies" });
  const values = companyPolicies(setting.value);
  const write = (partial) => setting.update((prev) => ({ ...companyPolicies(prev), ...partial }));

  return (
    <SettingsPage
      title="Fees & Policies"
      description="Company defaults for rent, payments, leasing, deposits, maintenance and management fees. Properties and leases can override them."
      setting={setting}
    >
      {POLICY_GROUPS.map((g) => (
        <SectionCard key={g.key} title={g.label} description={g.description}>
          <FieldsForm item={values} fields={policiesFor("company", g.key).map(policyField)} onPatch={write} onCommit={write} flat />
        </SectionCard>
      ))}
      {/* Billing: resident statements save on their own (billing_settings, CORE-12). */}
      <StatementSettingsCard />
    </SettingsPage>
  );
}

export default FeesPoliciesScreen;
