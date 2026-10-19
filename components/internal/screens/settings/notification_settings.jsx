"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, CircleDashed, Mail, Plus, Smartphone, X } from "lucide-react";

import { Badge } from "@geiger/ui/badge";
import { Button } from "@geiger/ui/button";
import { Input } from "@geiger/ui/input";
import { Switch } from "@geiger/ui/switch";
import { SectionCard, SettingRow, SettingsList } from "@/components/internal/shared/screen_kit";
import { SettingsPage, TextField, useSetting } from "@/components/internal/screens/settings/settings_kit";
import {
  EMAIL_GROUPS,
  NOTIFICATIONS_SETTING_KEY,
  NOTIFICATION_DEFAULTS,
  notificationsInGroup,
} from "@/lib/email/catalog";
import { getDeliveryStatus } from "@/lib/messaging/api";

// Settings → Notifications: per-project email toggles for every catalog
// notification (lib/email/catalog.js), team alert recipients, reminder timing,
// and which delivery integrations are connected. Stored in settings key
// `notifications`; the server reads it before every send.

const INTEGRATIONS = [
  { key: "email", label: "Email delivery", hint: "GEIGER_EMAIL_API_KEY / GEIGER_EMAIL_API_URL (geiger-dash)" },
  { key: "serviceRole", label: "Server access", hint: "SUPABASE_SERVICE_ROLE_KEY — needed by scheduled jobs" },
  { key: "scheduler", label: "Scheduler", hint: "CRON_SECRET — Vercel Cron calls /api/cron/*" },
  { key: "inboundWebhook", label: "Inbound replies webhook", hint: "INBOUND_EMAIL_SECRET — /api/messages/inbound" },
  { key: "sms", label: "SMS provider", hint: "No SMS provider is connected yet" },
];

function IntegrationStatus() {
  const [status, setStatus] = useState(null);
  useEffect(() => {
    let alive = true;
    getDeliveryStatus().then((res) => alive && setStatus(res));
    return () => {
      alive = false;
    };
  }, []);
  return (
    <SectionCard title="Delivery" description="What's connected on the server. Missing pieces degrade to recorded-but-not-sent.">
      <SettingsList>
        {INTEGRATIONS.map((i) => {
          const ok = status?.ok ? Boolean(status[i.key]) : null;
          return (
            <SettingRow
              key={i.key}
              icon={i.key === "sms" ? Smartphone : Mail}
              title={i.label}
              description={i.hint}
              control={
                ok === null ? (
                  <Badge variant="outline">{status && !status.ok ? "Unavailable" : "Checking…"}</Badge>
                ) : ok ? (
                  <Badge variant="success">
                    <CheckCircle2 /> Connected
                  </Badge>
                ) : (
                  <Badge variant="warning">
                    <CircleDashed /> Not connected
                  </Badge>
                )
              }
            />
          );
        })}
      </SettingsList>
    </SectionCard>
  );
}

function AlertRecipients({ emails, onChange }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return toast.error("Enter a valid email address.");
    if (emails.includes(v)) return toast.error("That address is already on the list.");
    onChange([...emails, v]);
    setDraft("");
  };
  return (
    <SectionCard
      title="Team alert recipients"
      description="Renewal windows, expiring documents, and automation notifications are emailed here."
    >
      <div className="space-y-3">
        <div className="flex gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="manager@yourcompany.com"
          />
          <Button variant="outline" className="border-border bg-surface-card hover:bg-surface-hover" onClick={add}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>
        {emails.length ? (
          <div className="flex flex-wrap gap-2">
            {emails.map((e) => (
              <Badge key={e} variant="neutral" className="gap-1.5 py-1 text-xs">
                {e}
                <button
                  type="button"
                  aria-label={`Remove ${e}`}
                  className="text-text-tertiary hover:text-foreground"
                  onClick={() => onChange(emails.filter((x) => x !== e))}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-sm text-text-tertiary">No recipients — team alerts are only logged on the record.</p>
        )}
      </div>
    </SectionCard>
  );
}

export function NotificationSettingsScreen() {
  const setting = useSetting(NOTIFICATIONS_SETTING_KEY, NOTIFICATION_DEFAULTS, { label: "Notifications" });
  const { value, set, update } = setting;
  const types = value.types || {};
  const enabled = value.enabled !== false;
  const toggleType = (key) => (on) => update((prev) => ({ ...prev, types: { ...(prev.types || {}), [key]: on } }));
  const leaseDays = (Array.isArray(value.leaseReminderDays) ? value.leaseReminderDays : []).join(", ");

  return (
    <SettingsPage
      title="Notifications"
      description="Choose which emails go out automatically, who gets team alerts, and when reminders are sent."
      setting={setting}
    >
      <IntegrationStatus />

      <SectionCard title="Email notifications" description="Turning one off stops it for this project; turning everything off stops all automatic email.">
        <SettingsList>
          <SettingRow
            icon={Mail}
            title="Send automatic email"
            description="Master switch for every notification below."
            checked={enabled}
            onCheckedChange={set("enabled")}
          />
        </SettingsList>
      </SectionCard>

      {EMAIL_GROUPS.map((g) => (
        <SectionCard key={g.key} title={g.label} description={g.desc}>
          <SettingsList>
            {notificationsInGroup(g.key).map((n) => (
              <SettingRow
                key={n.key}
                title={
                  <span className="flex flex-wrap items-center gap-2">
                    {n.label}
                    <Badge variant="outline">{n.audience}</Badge>
                    {n.live ? null : <Badge variant="neutral">Not sent automatically yet</Badge>}
                  </span>
                }
                description={n.description}
                control={<Switch checked={enabled && types[n.key] !== false} disabled={!enabled} onCheckedChange={toggleType(n.key)} />}
              />
            ))}
          </SettingsList>
        </SectionCard>
      ))}

      <AlertRecipients emails={value.alertEmails || []} onChange={set("alertEmails")} />

      <SectionCard title="Reminder timing" description="Used by the scheduled reminder jobs (Automations → All Workflows → Scheduled Jobs).">
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField
            id="nt-rent"
            label="Rent reminder (days before due)"
            type="number"
            value={value.rentReminderDays}
            onChange={(v) => set("rentReminderDays")(Math.max(0, Number(v) || 0))}
          />
          <TextField
            id="nt-lease"
            label="Lease-end reminders (days)"
            hint="Comma-separated, e.g. 60, 30"
            value={leaseDays}
            onChange={(v) =>
              set("leaseReminderDays")(
                String(v)
                  .split(",")
                  .map((x) => Number(x.trim()))
                  .filter((n) => n > 0),
              )
            }
          />
          <TextField
            id="nt-docs"
            label="Document expiry warning (days)"
            type="number"
            value={value.documentExpiryDays}
            onChange={(v) => set("documentExpiryDays")(Math.max(1, Number(v) || 30))}
          />
        </div>
        <p className="mt-3 text-xs text-text-secondary">
          The renewal window comes from Fees &amp; Policies → Renewal offer lead time.
        </p>
      </SectionCard>

      <SectionCard title="SMS" description="Text messages are modelled and logged, but no SMS provider is connected yet.">
        <SettingsList>
          <SettingRow
            icon={Smartphone}
            title="Send SMS"
            description="Messages sent on the SMS channel are stored as “not sent — SMS provider not connected”."
            control={<Switch checked={false} disabled />}
          />
        </SettingsList>
      </SectionCard>
    </SettingsPage>
  );
}

export default NotificationSettingsScreen;
