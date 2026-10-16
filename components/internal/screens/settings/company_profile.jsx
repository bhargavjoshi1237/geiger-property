"use client";

import { SectionCard } from "@/components/internal/shared/screen_kit";
import { SettingsPage, SelectField, TextField, useSetting } from "./settings_kit";
import {
  COMPANY_PROFILE_DEFAULTS,
  CURRENCY_OPTIONS,
  TIMEZONE_OPTIONS,
} from "./shared";

// Company Profile — the management company's identity and locale (settings key
// `company_profile`).

export function CompanyProfileScreen() {
  const setting = useSetting("company_profile", COMPANY_PROFILE_DEFAULTS, {
    label: "Company profile",
  });
  const { value, set } = setting;

  return (
    <SettingsPage
      title="Company Profile"
      description="Your management company's legal details, contact information, and regional defaults."
      setting={setting}
    >
      <SectionCard title="Business" description="How your company appears on leases, notices, and statements.">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id="cp-legal"
            label="Legal name"
            value={value.legalName}
            onChange={set("legalName")}
            placeholder="e.g. Maple Property Group LLC"
          />
          <TextField
            id="cp-dba"
            label="Doing business as"
            value={value.dba}
            onChange={set("dba")}
            placeholder="e.g. Maple Rentals"
          />
          <TextField
            id="cp-license"
            label="License number"
            hint="Real estate or property management license."
            value={value.licenseNumber}
            onChange={set("licenseNumber")}
            placeholder="e.g. PM-0042187"
          />
        </div>
      </SectionCard>

      <SectionCard title="Contact" description="Where residents, owners, and vendors reach you.">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id="cp-email"
            label="Email"
            type="email"
            value={value.email}
            onChange={set("email")}
            placeholder="office@example.com"
          />
          <TextField
            id="cp-phone"
            label="Phone"
            type="tel"
            value={value.phone}
            onChange={set("phone")}
            placeholder="(555) 123-4567"
          />
          <TextField
            id="cp-address"
            label="Street address"
            className="sm:col-span-2"
            value={value.address}
            onChange={set("address")}
            placeholder="e.g. 120 Main Street, Suite 300"
          />
          <TextField id="cp-city" label="City" value={value.city} onChange={set("city")} />
          <div className="grid grid-cols-2 gap-4">
            <TextField id="cp-state" label="State" value={value.state} onChange={set("state")} placeholder="e.g. NY" />
            <TextField id="cp-zip" label="ZIP" value={value.zip} onChange={set("zip")} />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Regional" description="Defaults for dates, deadlines, and money.">
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            id="cp-tz"
            label="Timezone"
            value={value.timezone}
            onChange={set("timezone")}
            options={TIMEZONE_OPTIONS}
          />
          <SelectField
            id="cp-currency"
            label="Currency"
            value={value.currency}
            onChange={set("currency")}
            options={CURRENCY_OPTIONS}
          />
        </div>
      </SectionCard>
    </SettingsPage>
  );
}

export default CompanyProfileScreen;
