"use client";

import { LayoutDashboard, MessageSquare, ListChecks, Clock, Inbox } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { communicationsData, listCommunications } from "@/lib/supabase/tenant_communications";
import { listTenants } from "@/lib/supabase/tenants";
import { tenantOptions } from "@/lib/supabase/options";
import {
  makeFieldsSection,
  makeOverviewSection,
  makeMetaListSection,
  makeNotesSection,
} from "@/components/internal/screens/entity/sections/factories";
import {
  DIRECTION_OPTIONS,
  INBOX_CHANNEL_LABEL,
  INBOX_CHANNEL_OPTIONS,
  formatDate,
} from "./shared";

// Inbox — an entity screen over `property.tenant_communications`: every email,
// call, SMS, portal message, and note with residents, linked to a tenant.

const channelLabel = (v) => INBOX_CHANNEL_LABEL[v] || v || "—";

// Join tenant names onto each message so the list can show who it's with.
async function loadMessages() {
  const [messages, tenants] = await Promise.all([listCommunications(), listTenants()]);
  const names = new Map((tenants ?? []).map((t) => [t.id, t.name]));
  return (messages ?? []).map((m) => ({ ...m, tenantName: names.get(m.tenantId) || "" }));
}

const inboxConfig = {
  key: "message",
  singular: "Message",
  plural: "Messages",
  title: "Inbox",
  description:
    "A record of every interaction with your residents — emails, calls, SMS, portal messages, and notes.",
  icon: Inbox,
  titleField: "subject",
  searchFields: ["subject", "body", "channel", "tenantName"],
  data: communicationsData,
  rowsLoader: loadMessages,

  statusMap: {},
  statusFilterOptions: [{ value: "all", label: "All messages" }],

  views: [
    { value: "all", label: "All", filter: () => true },
    ...INBOX_CHANNEL_OPTIONS.map((o) => ({
      value: o.value,
      label: o.label,
      filter: (r) => r.channel === o.value,
    })),
    { value: "inbound", label: "Inbound", filter: (r) => r.direction === "inbound" },
    { value: "outbound", label: "Outbound", filter: (r) => r.direction === "outbound" },
  ],

  columns: [
    {
      key: "subject",
      header: "Message",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{r.subject || "(no subject)"}</span>
          <span className="text-xs capitalize text-text-secondary">
            {r.direction} · {channelLabel(r.channel)}
          </span>
        </div>
      ),
    },
    {
      key: "tenantName",
      header: "Tenant",
      render: (r) =>
        r.tenantName ? (
          <span className="text-sm text-foreground">{r.tenantName}</span>
        ) : (
          <span className="text-text-tertiary">—</span>
        ),
    },
    {
      key: "channel",
      header: "Channel",
      render: (r) => <Badge variant="neutral">{channelLabel(r.channel)}</Badge>,
    },
    {
      key: "occurredAt",
      header: "When",
      align: "right",
      className: "text-right text-sm text-muted-foreground",
      render: (r) => formatDate(r.occurredAt),
    },
  ],

  stats: (rows) => {
    const inbound = rows.filter((r) => r.direction === "inbound").length;
    const outbound = rows.filter((r) => r.direction === "outbound").length;
    const unlinked = rows.filter((r) => !r.tenantId).length;
    return [
      { label: "Messages", value: String(rows.length), footer: "Logged" },
      { label: "Inbound", value: String(inbound), footer: "From residents" },
      { label: "Outbound", value: String(outbound), footer: "To residents" },
      { label: "Unlinked", value: String(unlinked), footer: "No tenant attached" },
    ];
  },

  createDraft: { subject: "", channel: "email", direction: "outbound", tenantId: "" },
  createFields: [
    { key: "subject", label: "Subject", type: "text", placeholder: "e.g. Rent reminder" },
    {
      key: "tenantId",
      label: "Tenant",
      type: "select",
      optionsFrom: "tenants",
      placeholder: "Select a tenant (optional)",
      emptyLabel: "No tenants yet",
    },
    { key: "channel", label: "Channel", type: "select", options: INBOX_CHANNEL_OPTIONS },
    { key: "direction", label: "Direction", type: "select", options: DIRECTION_OPTIONS },
  ],
  loadCreateOptions: async () => ({ tenants: await tenantOptions() }),
  newRow: (draft) => ({
    subject: draft.subject.trim(),
    tenantId: draft.tenantId || null,
    tenantName: draft.tenantName || "",
    channel: draft.channel || "email",
    direction: draft.direction || "outbound",
    body: "",
    occurredAt: new Date().toISOString(),
  }),

  headerMeta: (r) =>
    [r.tenantName, channelLabel(r.channel), r.direction, formatDate(r.occurredAt)]
      .filter(Boolean)
      .join(" · "),

  navGroups: [
    {
      group: null,
      items: [
        { key: "overview", label: "Overview", icon: LayoutDashboard, desc: "A snapshot of this message." },
      ],
    },
    {
      group: "General",
      items: [
        { key: "message", label: "Message", icon: MessageSquare, desc: "Tenant, subject, channel, and body." },
        { key: "followups", label: "Follow-ups", icon: ListChecks, desc: "Tasks stemming from this message." },
        { key: "activity", label: "Activity", icon: Clock, desc: "Notes and history." },
      ],
    },
  ],
  sections: {
    overview: makeOverviewSection({
      fields: [
        { key: "tenantName", label: "Tenant" },
        { key: "channel", label: "Channel", format: (v) => channelLabel(v) },
        { key: "direction", label: "Direction" },
        { key: "occurredAt", label: "When", format: (v) => formatDate(v) },
        { key: "subject", label: "Subject" },
      ],
    }),
    message: makeFieldsSection([
      { key: "subject", label: "Subject", type: "text", full: true, placeholder: "e.g. Rent reminder" },
      { key: "tenantId", label: "Tenant", type: "relation", load: tenantOptions, displayKey: "tenantName" },
      { key: "occurredAt", label: "Logged", type: "readonly", format: (v) => formatDate(v) },
      { key: "channel", label: "Channel", type: "select", options: INBOX_CHANNEL_OPTIONS },
      { key: "direction", label: "Direction", type: "select", options: DIRECTION_OPTIONS },
      { key: "body", label: "Body", type: "textarea", full: true, placeholder: "Message content…" },
    ]),
    followups: makeMetaListSection({
      field: "followups",
      singular: "follow-up",
      icon: ListChecks,
      primaryPlaceholder: "e.g. Call back about late rent",
      check: true,
    }),
    activity: makeNotesSection({ field: "activityNotes", placeholder: "Log an internal note…" }),
  },
};

export function InboxScreen() {
  return <EntityListScreen config={inboxConfig} />;
}

export default InboxScreen;
