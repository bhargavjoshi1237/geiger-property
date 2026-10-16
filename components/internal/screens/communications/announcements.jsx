"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  LayoutDashboard,
  SquarePen,
  FileText,
  Clock,
  Megaphone,
  Send,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionCard, StatusPill } from "@/components/internal/shared/screen_kit";
import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { announcementsData } from "@/lib/supabase/announcements";
import { listTenants } from "@/lib/supabase/tenants";
import { ownersLayer } from "@/lib/supabase/owners";
import { vendorsLayer } from "@/lib/supabase/vendors";
import { propertyOptions } from "@/lib/supabase/options";
import {
  makeFieldsSection,
  makeNotesSection,
} from "@/components/internal/screens/entity/sections/factories";
import {
  ANNOUNCEMENT_STATUS_MAP,
  AUDIENCES,
  BROADCAST_CHANNELS,
  filterOptions,
  formatDate,
  listOptions,
  selectOptions,
} from "./shared";

// Announcements — broadcasts to tenants, owners, or vendors (owns
// `property.announcements`). Delivery isn't wired up; sending is recorded only.

const AUDIENCE_OPTIONS = listOptions(AUDIENCES);
const CHANNEL_OPTIONS = listOptions(BROADCAST_CHANNELS);

// Count who an announcement would reach. Past tenants are excluded.
async function estimateRecipients(audience, propertyId) {
  if (audience === "Owners") return (await ownersLayer.list())?.length ?? null;
  if (audience === "Vendors") return (await vendorsLayer.list())?.length ?? null;
  const tenants = await listTenants();
  if (!tenants) return null;
  const active = tenants.filter((t) => t.status !== "Past");
  if (audience === "Property tenants") {
    return active.filter((t) => t.propertyId && t.propertyId === propertyId).length;
  }
  return active.length;
}

function RecipientEstimate({ audience, propertyId }) {
  const needsProperty = audience === "Property tenants" && !propertyId;
  const requestKey = `${audience}|${propertyId || ""}`;
  const [result, setResult] = useState({ key: null, count: null });

  useEffect(() => {
    if (!audience || needsProperty) return;
    let alive = true;
    estimateRecipients(audience, propertyId).then(
      (count) => alive && setResult({ key: requestKey, count }),
    );
    return () => {
      alive = false;
    };
  }, [audience, propertyId, needsProperty, requestKey]);

  if (!audience) return <span className="text-text-tertiary">Pick an audience</span>;
  if (needsProperty) return <span className="text-text-tertiary">Pick a property</span>;
  if (result.key !== requestKey) return <span className="text-text-tertiary">Counting…</span>;
  if (result.count === null) return <span className="text-text-tertiary">Unavailable</span>;
  const noun = audience === "Owners" ? "owner" : audience === "Vendors" ? "vendor" : "tenant";
  return (
    <span>
      {result.count} {noun}
      {result.count === 1 ? "" : "s"}
    </span>
  );
}

// Overview with the recipient estimate and the "Mark as sent" action.
function AnnouncementOverview({ item, onCommit }) {
  const sent = item.status === "Sent";
  const markSent = () => {
    onCommit({
      status: "Sent",
      metadata: { ...(item.metadata || {}), sentAt: new Date().toISOString() },
    });
    toast.success(`"${item.name}" recorded as sent.`);
  };

  const fields = [
    { label: "Audience", value: item.audience || "—" },
    { label: "Channel", value: item.channel || "—" },
    { label: "Property", value: item.propertyName || (item.audience === "Property tenants" ? "Not set" : "—") },
    { label: "Scheduled for", value: formatDate(item.scheduledFor) },
    { label: "Sent", value: sent ? formatDate(item.metadata?.sentAt) : "Not yet" },
  ];

  return (
    <div className="space-y-4">
      <SectionCard>
        <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
          <div className="min-w-0">
            <dt className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
              Status
            </dt>
            <dd className="mt-1">
              <StatusPill status={item.status} map={ANNOUNCEMENT_STATUS_MAP} />
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
              Estimated recipients
            </dt>
            <dd className="mt-1 flex items-center gap-1.5 text-sm text-foreground">
              <Users className="h-3.5 w-3.5 text-text-secondary" />
              <RecipientEstimate audience={item.audience} propertyId={item.propertyId} />
            </dd>
          </div>
          {fields.map((f) => (
            <div key={f.label} className="min-w-0">
              <dt className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
                {f.label}
              </dt>
              <dd className="mt-1 truncate text-sm text-foreground">{f.value}</dd>
            </div>
          ))}
        </dl>
      </SectionCard>

      <SectionCard
        title="Delivery"
        description="Delivery isn't connected yet — this records the announcement as sent."
        action={
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={sent}
            onClick={markSent}
          >
            <Send className="h-4 w-4" /> {sent ? "Sent" : "Mark as sent"}
          </Button>
        }
      >
        <p className="text-sm text-text-secondary">
          {sent
            ? `Recorded as sent on ${formatDate(item.metadata?.sentAt)}.`
            : "Send it through your usual email or SMS tool, then mark it as sent here to keep the record."}
        </p>
      </SectionCard>
    </div>
  );
}

const announcementsConfig = {
  key: "announcement",
  singular: "Announcement",
  plural: "Announcements",
  title: "Announcements",
  description:
    "Broadcast updates to tenants, owners, or vendors — building notices, policy changes, and reminders.",
  icon: Megaphone,
  titleField: "name",
  searchFields: ["name", "audience", "channel", "propertyName", "body"],
  data: announcementsData,

  statusMap: ANNOUNCEMENT_STATUS_MAP,
  statusFilterOptions: filterOptions(ANNOUNCEMENT_STATUS_MAP),

  columns: [
    {
      key: "name",
      header: "Announcement",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="text-xs text-text-secondary">
            {[r.audience, r.propertyName].filter(Boolean).join(" · ") || "No audience set"}
          </span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusPill status={r.status} map={ANNOUNCEMENT_STATUS_MAP} />,
    },
    {
      key: "channel",
      header: "Channel",
      render: (r) =>
        r.channel ? <Badge variant="neutral">{r.channel}</Badge> : <span className="text-text-tertiary">—</span>,
    },
    {
      key: "scheduledFor",
      header: "Scheduled",
      align: "right",
      className: "text-right text-sm text-muted-foreground",
      render: (r) => formatDate(r.scheduledFor),
    },
  ],

  stats: (rows) => {
    const count = (s) => rows.filter((r) => r.status === s).length;
    const tenantFacing = rows.filter((r) => String(r.audience).includes("tenants")).length;
    return [
      { label: "Announcements", value: String(rows.length), footer: `${tenantFacing} to tenants` },
      { label: "Scheduled", value: String(count("Scheduled")), footer: "Queued to go out" },
      { label: "Sent", value: String(count("Sent")), footer: "Recorded as sent" },
      { label: "Drafts", value: String(count("Draft")), footer: "Still being written" },
    ];
  },

  createDraft: { name: "", audience: "All tenants", channel: "Email" },
  createFields: [
    { key: "name", label: "Title", type: "text", placeholder: "e.g. Water shut-off on Friday" },
    { key: "audience", label: "Audience", type: "select", options: AUDIENCE_OPTIONS },
    { key: "channel", label: "Channel", type: "select", options: CHANNEL_OPTIONS },
  ],
  newRow: (draft) => ({
    name: draft.name.trim(),
    audience: draft.audience || "All tenants",
    channel: draft.channel || "Email",
    status: "Draft",
  }),

  headerMeta: (r) =>
    [r.audience, r.channel, r.scheduledFor ? `Scheduled ${formatDate(r.scheduledFor)}` : null]
      .filter(Boolean)
      .join(" · "),

  navGroups: [
    {
      group: null,
      items: [
        { key: "overview", label: "Overview", icon: LayoutDashboard, desc: "Audience, reach, and delivery." },
      ],
    },
    {
      group: "Announcement",
      items: [
        { key: "details", label: "Details", icon: SquarePen, desc: "Audience, channel, property, and schedule." },
        { key: "body", label: "Message", icon: FileText, desc: "What the announcement says." },
      ],
    },
    {
      group: "General",
      items: [{ key: "activity", label: "Activity", icon: Clock, desc: "Internal notes and history." }],
    },
  ],
  sections: {
    overview: AnnouncementOverview,
    details: makeFieldsSection([
      { key: "name", label: "Title", type: "text", full: true },
      { key: "audience", label: "Audience", type: "select", options: AUDIENCE_OPTIONS },
      { key: "channel", label: "Channel", type: "select", options: CHANNEL_OPTIONS },
      {
        key: "propertyId",
        label: "Property",
        type: "relation",
        load: propertyOptions,
        displayKey: "propertyName",
        hint: "Required when the audience is Property tenants.",
      },
      { key: "scheduledFor", label: "Scheduled for", type: "date" },
      { key: "status", label: "Status", type: "select", options: selectOptions(ANNOUNCEMENT_STATUS_MAP) },
    ]),
    body: makeNotesSection({
      field: "body",
      meta: false,
      placeholder: "Write the announcement…",
    }),
    activity: makeNotesSection({ field: "activityNotes", placeholder: "Log an internal note…" }),
  },
};

export function AnnouncementsScreen() {
  return <EntityListScreen config={announcementsConfig} />;
}

export default AnnouncementsScreen;
