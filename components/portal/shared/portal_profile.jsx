"use client";

import React, { useState } from "react";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, ScreenHeader } from "@/components/internal/shared/screen_kit";
import { SecondaryScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { CONTACT_CHANNEL_OPTIONS, LANGUAGE_OPTIONS } from "@/lib/portal/constants";
import { portalApi } from "@/lib/portal/portal_fetch";
import { SelectField, SwitchRow } from "../form_bits";
import { DataGate, Panel, Stat, usePortalData } from "../portal_kit";

const TEXT_PREFS = {
  preferredName: { label: "Preferred name" },
  altEmail: { label: "Alternate email", type: "email" },
  homePhone: { label: "Home phone", type: "tel" },
  workPhone: { label: "Work phone", type: "tel" },
  dispatchPhone: { label: "Dispatch phone", type: "tel" },
  dispatchEmail: { label: "Dispatch email", type: "email" },
  quietHoursStart: { label: "Quiet hours from", type: "time" },
  quietHoursEnd: { label: "Quiet hours to", type: "time" },
};

function ProfileForm({ profile }) {
  const [phone, setPhone] = useState(profile.phone);
  const [prefs, setPrefs] = useState(profile.prefs);
  const [busy, setBusy] = useState(false);
  const set = (key) => (value) => setPrefs((p) => ({ ...p, [key]: value }));
  const has = (key) => key in profile.prefs;

  const save = async () => {
    setBusy(true);
    const res = await portalApi("/api/portal/profile", { method: "PATCH", body: { phone, prefs } });
    setBusy(false);
    if (res.ok) toast.success("Preferences saved.");
    else toast.error(res.error);
  };

  return (
    <>
      <Panel title="Account">
        <div className="grid gap-4 sm:grid-cols-2">
          <Stat label="Name">{profile.name || "—"}</Stat>
          <Stat label="Sign-in email">{profile.loginEmail}</Stat>
          {profile.company ? <Stat label="Company">{profile.company}</Stat> : null}
          {profile.contactName ? <Stat label="Contact">{profile.contactName}</Stat> : null}
        </div>
        <p className="mt-4 text-xs text-text-tertiary">To change your name or sign-in email, contact the office.</p>
      </Panel>

      <Panel title="Contact details">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Mobile phone" htmlFor="pf-phone">
            <Input id="pf-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          {Object.entries(TEXT_PREFS)
            .filter(([key]) => has(key))
            .map(([key, cfg]) => (
              <Field key={key} label={cfg.label} htmlFor={`pf-${key}`}>
                <Input id={`pf-${key}`} type={cfg.type || "text"} value={prefs[key] || ""} onChange={(e) => set(key)(e.target.value)} />
              </Field>
            ))}
        </div>
      </Panel>

      <Panel title="Communication preferences">
        <div className="grid gap-4 sm:grid-cols-2">
          {has("preferredContact") ? (
            <Field label="Preferred channel" htmlFor="pf-channel">
              <SelectField id="pf-channel" value={prefs.preferredContact} onChange={set("preferredContact")} options={CONTACT_CHANNEL_OPTIONS} />
            </Field>
          ) : null}
          {has("language") ? (
            <Field label="Language" htmlFor="pf-lang">
              <SelectField id="pf-lang" value={prefs.language} onChange={set("language")} options={LANGUAGE_OPTIONS} />
            </Field>
          ) : null}
          {has("statementDelivery") ? (
            <Field label="Statements by" htmlFor="pf-stmt">
              <SelectField id="pf-stmt" value={prefs.statementDelivery} onChange={set("statementDelivery")} options={["Email", "Portal", "Mail"]} />
            </Field>
          ) : null}
        </div>
        {has("emailOptIn") || has("smsOptIn") ? (
          <div className="mt-4 grid gap-2">
            {has("emailOptIn") ? <SwitchRow label="Email updates" hint="Statements, reminders and notices by email." checked={prefs.emailOptIn !== false} onChange={set("emailOptIn")} /> : null}
            {has("smsOptIn") ? (
              <SwitchRow label="Text messages" hint="I agree to receive texts about my home. Msg & data rates may apply." checked={Boolean(prefs.smsOptIn)} onChange={set("smsOptIn")} />
            ) : null}
          </div>
        ) : null}
      </Panel>

      <div className="flex justify-end">
        <Button onClick={save} disabled={busy} className="bg-primary text-primary-foreground hover:bg-primary/90">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Changes
        </Button>
      </div>
    </>
  );
}

export function PortalProfile() {
  const state = usePortalData("/api/portal/profile");
  return (
    <SecondaryScreenWrapper>
      <ScreenHeader title="Profile" description="Your contact details and how you'd like to hear from us." />
      <DataGate state={state}>{(data) => <ProfileForm profile={data.profile} />}</DataGate>
    </SecondaryScreenWrapper>
  );
}

export default PortalProfile;
