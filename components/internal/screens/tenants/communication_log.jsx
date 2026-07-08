"use client";

import { LayoutDashboard, MessageSquare, ListChecks, Clock, MessagesSquare } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { communicationsData } from "@/lib/supabase/tenant_communications";
import {
  makeFieldsSection,
  makeOverviewSection,
  makeMetaListSection,
  makeNotesSection,
} from "@/components/internal/screens/entity/sections/factories";
import { formatDate } from "./shared";

// Communication Log — an entity screen over `property.tenant_communications`.
// A portfolio-wide record of emails, calls, SMS, portal messages, and notes.

const CHANNEL_LABEL = {
  email: "Email",
  sms: "SMS",
  call: "Call",
  note: "Note",
  portal: "Portal",
};

const CHANNEL_OPTIONS = [
  { value: "email", label: "Email" },
  { value: "sms", label: "SMS" },
  { value: "call", label: "Call" },
  { value: "note", label: "Note" },
  { value: "portal", label: "Portal" },
];

const DIRECTION_OPTIONS = [
  { value: "outbound", label: "Outbound" },
  { value: "inbound", label: "Inbound" },
];

const communicationsConfig = {
  key: "message",
  singular: "Message",
  plural: "Messages",
  title: "Communication Log",
  description:
    "A record of every interaction with your residents — emails, calls, SMS, portal messages, and notes.",
  icon: MessagesSquare,
  titleField: "subject",
  searchFields: ["subject", "body", "channel"],
  data: communicationsData,

  statusMap: {},
  statusFilterOptions: [{ value: "all", label: "All messages" }],

  columns: [
    {
      key: "subject",
      header: "Message",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{r.subject || "(no subject)"}</span>
          <span className="text-xs text-text-secondary capitalize">
            {r.direction} · {CHANNEL_LABEL[r.channel] || r.channel}
          </span>
        </div>
      ),
    },
    {
      key: "channel",
      header: "Channel",
      render: (r) => <Badge variant="neutral">{CHANNEL_LABEL[r.channel] || r.channel}</Badge>,
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
    const emails = rows.filter((r) => r.channel === "email").length;
    return [
      { label: "Messages", value: String(rows.length), footer: "Logged" },
      { label: "Inbound", value: String(inbound), footer: "From residents" },
      { label: "Outbound", value: String(outbound), footer: "To residents" },
      { label: "Emails", value: String(emails), footer: "Email channel" },
    ];
  },

  createDraft: { subject: "", channel: "email", direction: "outbound" },
  createFields: [
    { key: "subject", label: "Subject", type: "text", placeholder: "e.g. Rent reminder" },
    { key: "channel", label: "Channel", type: "select", options: CHANNEL_OPTIONS },
    { key: "direction", label: "Direction", type: "select", options: DIRECTION_OPTIONS },
  ],
  newRow: (draft) => ({
    subject: draft.subject.trim(),
    channel: draft.channel || "email",
    direction: draft.direction || "outbound",
    body: "",
    occurredAt: new Date().toISOString(),
  }),

  headerMeta: (r) =>
    [CHANNEL_LABEL[r.channel] || r.channel, r.direction, formatDate(r.occurredAt)]
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
        { key: "message", label: "Message", icon: MessageSquare, desc: "Subject, channel, and body." },
        { key: "followups", label: "Follow-ups", icon: ListChecks, desc: "Tasks stemming from this message." },
        { key: "activity", label: "Activity", icon: Clock, desc: "Notes and history." },
      ],
    },
  ],
  sections: {
    overview: makeOverviewSection({
      fields: [
        { key: "channel", label: "Channel", format: (v) => CHANNEL_LABEL[v] || v },
        { key: "direction", label: "Direction" },
        { key: "occurredAt", label: "When", format: (v) => formatDate(v) },
        { key: "subject", label: "Subject" },
      ],
    }),
    message: makeFieldsSection([
      { key: "subject", label: "Subject", type: "text", full: true, placeholder: "e.g. Rent reminder" },
      { key: "channel", label: "Channel", type: "select", options: CHANNEL_OPTIONS },
      { key: "direction", label: "Direction", type: "select", options: DIRECTION_OPTIONS },
      { key: "occurredAt", label: "Date", type: "date" },
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

export function CommunicationLogScreen() {
  return <EntityListScreen config={communicationsConfig} />;
}

export default CommunicationLogScreen;
