"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  CreditCard,
  FileSignature,
  Megaphone,
  MessageSquare,
  Plus,
  ShieldCheck,
  Sheet,
  Trash2,
  Webhook,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { EmptyState, Field, SectionCard } from "@/components/internal/shared/screen_kit";
import { SettingsPage, useSetting } from "./settings_kit";
import { INTEGRATIONS_DEFAULTS, WEBHOOK_EVENTS } from "./shared";

// Integrations — third-party connections (none are live yet) and outbound
// webhook endpoints (settings key `integrations`).

const PROVIDERS = [
  { key: "payments", icon: CreditCard, title: "Payments", vendor: "Stripe", description: "Collect rent and fees by card and ACH." },
  { key: "esign", icon: FileSignature, title: "E-signature", vendor: "E-sign provider", description: "Send leases and addenda for legally binding signatures." },
  { key: "screening", icon: ShieldCheck, title: "Screening", vendor: "Screening provider", description: "Credit, criminal, and eviction checks for applicants." },
  { key: "syndication", icon: Megaphone, title: "Listing syndication", vendor: "Listing sites", description: "Publish vacancies to rental listing sites." },
  { key: "accounting", icon: Sheet, title: "Accounting export", vendor: "Accounting software", description: "Export transactions and bills to your general ledger." },
  { key: "messaging", icon: MessageSquare, title: "Email & SMS", vendor: "Messaging provider", description: "Deliver announcements, reminders, and templates." },
];

const isUrl = (v) => /^https?:\/\/\S+\.\S+/.test(v);

function WebhookForm({ onAdd }) {
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState([]);

  const toggle = (e) => setEvents((prev) => (prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e]));

  const add = () => {
    const v = url.trim();
    if (!isUrl(v)) {
      toast.error("Enter a valid https:// URL.");
      return;
    }
    if (!events.length) {
      toast.error("Pick at least one event.");
      return;
    }
    onAdd({ id: crypto.randomUUID(), url: v, events, enabled: true });
    setUrl("");
    setEvents([]);
  };

  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface-card p-4">
      <Field label="Endpoint URL" htmlFor="wh-url">
        <Input
          id="wh-url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/webhooks/property"
          className="bg-surface-subtle"
        />
      </Field>
      <div className="space-y-1.5">
        <p className="text-sm font-medium text-muted-foreground">Events</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {WEBHOOK_EVENTS.map((e) => (
            <label key={e} className="flex cursor-pointer items-center gap-2 text-sm text-text-secondary">
              <Checkbox checked={events.includes(e)} onCheckedChange={() => toggle(e)} />
              <code className="font-mono text-[13px]">{e}</code>
            </label>
          ))}
        </div>
      </div>
      <div className="flex justify-end">
        <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={add}>
          <Plus className="h-4 w-4" /> Add Endpoint
        </Button>
      </div>
    </div>
  );
}

export function IntegrationsScreen() {
  const setting = useSetting("integrations", INTEGRATIONS_DEFAULTS, { label: "Integrations" });
  const { value, update } = setting;
  const webhooks = Array.isArray(value.webhooks) ? value.webhooks : [];

  const setWebhooks = (next) => update((prev) => ({ ...prev, webhooks: next }));

  return (
    <SettingsPage
      title="Integrations"
      description="Connect payments, e-signature, screening, and more — and register webhook endpoints."
      setting={setting}
    >
      <SectionCard
        title="Services"
        description="None of these are connected yet — the workflows they power are tracked manually for now."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {PROVIDERS.map((p) => {
            const Icon = p.icon;
            return (
              <div
                key={p.key}
                className="flex flex-col gap-3 rounded-lg border border-border bg-surface-card p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-subtle text-muted-foreground">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{p.title}</p>
                      <p className="truncate text-xs text-text-tertiary">{p.vendor}</p>
                    </div>
                  </div>
                  <Badge variant="outline">Not connected</Badge>
                </div>
                <p className="text-sm text-text-secondary">{p.description}</p>
                <div>
                  <Button variant="outline" size="sm" disabled className="border-border">
                    Connect
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard
        title="Webhooks"
        description="Endpoints are saved here, but event delivery isn't connected yet — nothing is sent."
      >
        <div className="space-y-4">
          <WebhookForm onAdd={(hook) => setWebhooks([...webhooks, hook])} />
          {webhooks.length === 0 ? (
            <div className="rounded-lg border border-border">
              <EmptyState
                icon={Webhook}
                title="No webhook endpoints"
                description="Add an endpoint to record where events should go once delivery is connected."
              />
            </div>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {webhooks.map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0 space-y-1.5">
                    <p className="truncate font-mono text-[13px] text-foreground">{h.url}</p>
                    <div className="flex flex-wrap gap-1">
                      {(h.events || []).map((e) => (
                        <Badge key={e} variant="neutral">
                          {e}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Switch
                      checked={h.enabled !== false}
                      onCheckedChange={(v) =>
                        setWebhooks(webhooks.map((x) => (x.id === h.id ? { ...x, enabled: v } : x)))
                      }
                      aria-label="Endpoint enabled"
                    />
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-red-600 dark:text-red-300 hover:bg-red-500/10"
                      onClick={() => setWebhooks(webhooks.filter((x) => x.id !== h.id))}
                      aria-label="Remove endpoint"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SectionCard>
    </SettingsPage>
  );
}

export default IntegrationsScreen;
