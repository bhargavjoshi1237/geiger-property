"use client";

import { Banknote, CreditCard, Landmark, ScrollText } from "lucide-react";

import { SectionCard, SettingRow, SettingsList } from "@/components/internal/shared/screen_kit";
import { SettingsPage, SelectField, TextField, useSetting } from "./settings_kit";
import {
  FEES_POLICIES_DEFAULTS,
  LATE_FEE_TYPE_OPTIONS,
  PAYMENT_METHODS,
  RENT_DUE_DAY_OPTIONS,
} from "./shared";

// Fees & Policies — rent due date, late fee rules, standard fees, and accepted
// payment methods (settings key `fees_policies`).

const METHOD_ICONS = { ach: Landmark, card: CreditCard, check: ScrollText, cash: Banknote };

export function FeesPoliciesScreen() {
  const setting = useSetting("fees_policies", FEES_POLICIES_DEFAULTS, {
    label: "Fees & policies",
  });
  const { value, set, update } = setting;
  const percent = value.lateFeeType === "percent";
  const methods = { ...FEES_POLICIES_DEFAULTS.paymentMethods, ...(value.paymentMethods || {}) };

  const toggleMethod = (key) => (checked) =>
    update((prev) => ({ ...prev, paymentMethods: { ...methods, [key]: checked } }));

  return (
    <SettingsPage
      title="Fees & Policies"
      description="Rent due dates, late fee rules, standard fees, and the payment methods you accept."
      setting={setting}
    >
      <SectionCard title="Rent & late fees" description="Applied as the default for every lease.">
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            id="fp-due"
            label="Rent due day"
            value={String(value.rentDueDay)}
            onChange={set("rentDueDay")}
            options={RENT_DUE_DAY_OPTIONS}
          />
          <TextField
            id="fp-grace"
            label="Grace period (days)"
            type="number"
            hint="Days after the due date before a late fee applies."
            value={value.graceDays}
            onChange={set("graceDays")}
          />
          <SelectField
            id="fp-type"
            label="Late fee type"
            value={value.lateFeeType}
            onChange={set("lateFeeType")}
            options={LATE_FEE_TYPE_OPTIONS}
          />
          <TextField
            id="fp-amount"
            label={percent ? "Late fee (% of rent)" : "Late fee amount ($)"}
            type="number"
            value={value.lateFeeAmount}
            onChange={set("lateFeeAmount")}
          />
          <TextField
            id="fp-max"
            label="Maximum late fee ($)"
            type="number"
            hint="Leave blank for no cap. Check your local limits."
            value={value.maxLateFee}
            onChange={set("maxLateFee")}
          />
        </div>
      </SectionCard>

      <SectionCard title="Standard fees" description="Charged at application or on a returned payment.">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id="fp-app"
            label="Application fee ($)"
            type="number"
            value={value.applicationFee}
            onChange={set("applicationFee")}
          />
          <TextField
            id="fp-nsf"
            label="NSF / returned payment fee ($)"
            type="number"
            value={value.nsfFee}
            onChange={set("nsfFee")}
          />
        </div>
      </SectionCard>

      <SectionCard
        title="Accepted payment methods"
        description="Recorded for your policies — online payment processing isn't connected yet."
      >
        <SettingsList>
          {PAYMENT_METHODS.map((m) => (
            <SettingRow
              key={m.key}
              icon={METHOD_ICONS[m.key]}
              title={m.title}
              description={m.description}
              checked={Boolean(methods[m.key])}
              onCheckedChange={toggleMethod(m.key)}
            />
          ))}
        </SettingsList>
      </SectionCard>
    </SettingsPage>
  );
}

export default FeesPoliciesScreen;
