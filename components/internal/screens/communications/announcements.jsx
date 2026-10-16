"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  CalendarClock,
  CalendarX,
  Clock,
  FileText,
  LayoutDashboard,
  Loader2,
  Megaphone,
  Send,
  SquarePen,
  Truck,
  TriangleAlert,
  Users,
} from "lucide-react";
import { LogoLoading } from "@geiger/ui";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DataTable, EmptyState, SectionCard, StatusPill } from "@/components/internal/shared/screen_kit";
import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { announcementsData } from "@/lib/supabase/announcements";
import { listAnnouncementDeliveries } from "@/lib/supabase/announcement_deliveries";
import { listTenants } from "@/lib/supabase/tenants";
import { listUnits } from "@/lib/supabase/units";
import { listBuildings } from "@/lib/supabase/buildings";
import { ownersLayer } from "@/lib/supabase/owners";
import { vendorsLayer } from "@/lib/supabase/vendors";
import { propertyOptions } from "@/lib/supabase/options";
import { sendAnnouncementNow } from "@/lib/messaging/api";
import { makeFieldsSection, makeNotesSection } from "@/components/internal/screens/entity/sections/factories";
import {
  ANNOUNCEMENT_STATUS_MAP,
  AUDIENCES,
  BROADCAST_CHANNELS,
  DELIVERY_STATUS_MAP,
  SAMPLE_MERGE_VALUES,
  filterOptions,
  formatDate,
  formatDateTime,
  listOptions,
  renderMerge,
  selectOptions,
  unknownTokens,
} from "./shared";
import { MergeFieldPicker, insertAtCursor } from "./messaging_kit";

// Announcements — broadcasts to tenants (all / one property / one building),
// owners or vendors (owns `property.announcements`). "Send now" delivers through
// /api/messages/announce; Scheduled ones go out via the scheduled-announcements
// job. Per-recipient rows live in `property.announcement_deliveries`.

const AUDIENCE_OPTIONS = listOptions(AUDIENCES);
const CHANNEL_OPTIONS = listOptions(BROADCAST_CHANNELS);
const today = () => new Date().toISOString().slice(0, 10);

async function buildingOptions() {
  const rows = (await listBuildings()) ?? [];
  return rows.map((b) => ({ value: b.id, label: b.name || "Building", patch: { buildingName: b.name || "" } }));
}

// Count who an announcement would reach. Past tenants are excluded.
async function estimateRecipients(audience, propertyId, buildingId) {
  if (audience === "Owners") return (await ownersLayer.list())?.length ?? null;
  if (audience === "Vendors") return (await vendorsLayer.list())?.length ?? null;
  const tenants = await listTenants();
  if (!tenants) return null;
  const active = tenants.filter((t) => t.status !== "Past");
  if (audience === "Property tenants") return active.filter((t) => t.propertyId && t.propertyId === propertyId).length;
  if (audience === "Building tenants") {
    const units = (await listUnits()) ?? [];
    const ids = new Set(units.filter((u) => u.buildingId === buildingId).map((u) => u.id));
    return active.filter((t) => t.unitId && ids.has(t.unitId)).length;
  }
  return active.length;
}

const missingTarget = (item) =>
  (item.audience === "Property tenants" && !item.propertyId) || (item.audience === "Building tenants" && !item.buildingId);

function RecipientEstimate({ audience, propertyId, buildingId }) {
  const blocked = missingTarget({ audience, propertyId, buildingId });
  const requestKey = `${audience}|${propertyId || ""}|${buildingId || ""}`;
  const [result, setResult] = useState({ key: null, count: null });

  useEffect(() => {
    if (!audience || blocked) return;
    let alive = true;
    estimateRecipients(audience, propertyId, buildingId).then((count) => alive && setResult({ key: requestKey, count }));
    return () => {
      alive = false;
    };
  }, [audience, propertyId, buildingId, blocked, requestKey]);

  if (!audience) return <span className="text-text-tertiary">Pick an audience</span>;
  if (blocked) return <span className="text-text-tertiary">Pick a {audience === "Building tenants" ? "building" : "property"}</span>;
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

// Send now through the server; reload so the stats and status refresh.
async function sendNow(item, reload) {
  if (!String(item.body || "").trim()) return toast.error("Write the message before sending.");
  if (missingTarget(item)) return toast.error("Pick who this audience targets first.");
  const res = await sendAnnouncementNow(item.id);
  if (!res.ok) return toast.error(res.error || "Couldn't send the announcement.");
  const d = res.delivery || {};
  if (d.sent || d.logged) toast.success(`Sent to ${d.sent + d.logged} of ${d.total} recipient${d.total === 1 ? "" : "s"}.`);
  else toast.warning(`Recorded — ${d.notSent || 0} not sent${d.errors?.[0] ? ` (${d.errors[0]})` : ""}.`);
  reload?.();
}

const STAT_LABELS = [
  ["total", "Recipients"],
  ["sent", "Delivered"],
  ["logged", "Posted"],
  ["notSent", "Not sent"],
  ["failed", "Failed"],
];

function DeliveryStats({ delivery }) {
  if (!delivery) return <p className="text-sm text-text-secondary">Not sent yet.</p>;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {STAT_LABELS.map(([k, label]) => (
        <div key={k} className="rounded-lg border border-border bg-surface-card px-3 py-2">
          <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">{label}</p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">{Number(delivery[k]) || 0}</p>
        </div>
      ))}
    </div>
  );
}

function AnnouncementOverview({ item, onCommit, onReload }) {
  const [busy, setBusy] = useState(false);
  const sent = item.status === "Sent";
  const scheduled = item.status === "Scheduled";
  const delivery = item.metadata?.delivery;

  const send = async () => {
    setBusy(true);
    await sendNow(item, onReload);
    setBusy(false);
  };
  const schedule = async (date) => {
    if (!date) return;
    if (date < today()) return toast.error("Pick today or a future date.");
    const ok = await onCommit({ scheduledFor: date, status: "Scheduled" });
    if (ok) toast.success(`Scheduled for ${formatDate(date)}.`);
  };

  const fields = [
    { label: "Audience", value: item.audience || "—" },
    { label: "Channel", value: item.channel || "—" },
    { label: "Property", value: item.propertyName || (item.audience === "Property tenants" ? "Not set" : "—") },
    { label: "Building", value: item.buildingName || (item.audience === "Building tenants" ? "Not set" : "—") },
    { label: "Scheduled for", value: formatDate(item.scheduledFor) },
    { label: "Sent", value: sent ? formatDateTime(item.sentAt || item.metadata?.sentAt) : "Not yet" },
  ];

  return (
    <div className="space-y-4">
      <SectionCard>
        <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
          <div className="min-w-0">
            <dt className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">Status</dt>
            <dd className="mt-1">
              <StatusPill status={item.status} map={ANNOUNCEMENT_STATUS_MAP} />
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">Estimated recipients</dt>
            <dd className="mt-1 flex items-center gap-1.5 text-sm text-foreground">
              <Users className="h-3.5 w-3.5 text-text-secondary" />
              <RecipientEstimate audience={item.audience} propertyId={item.propertyId} buildingId={item.buildingId} />
            </dd>
          </div>
          {fields.map((f) => (
            <div key={f.label} className="min-w-0">
              <dt className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">{f.label}</dt>
              <dd className="mt-1 truncate text-sm text-foreground">{f.value}</dd>
            </div>
          ))}
        </dl>
      </SectionCard>

      <SectionCard
        title="Send"
        description={
          sent
            ? "Already sent — re-sending only reaches recipients who didn't get it."
            : "Send it now, or schedule it — scheduled announcements go out with the daily scheduler."
        }
        action={
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={busy} onClick={send}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sent ? "Send to remaining" : "Send now"}
          </Button>
        }
      >
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <label htmlFor="ann-schedule" className="text-sm font-medium text-muted-foreground">
              Schedule for
            </label>
            <Input
              id="ann-schedule"
              type="date"
              min={today()}
              defaultValue={item.scheduledFor || ""}
              className="w-44 bg-surface-card"
              onChange={(e) => schedule(e.target.value)}
              disabled={sent}
            />
          </div>
          {scheduled ? (
            <Button
              variant="outline"
              className="border-border bg-surface-card text-muted-foreground hover:bg-surface-hover hover:text-foreground"
              onClick={() => onCommit({ status: "Draft" }).then((ok) => ok && toast.success("Unscheduled."))}
            >
              <CalendarX className="h-4 w-4" /> Unschedule
            </Button>
          ) : null}
          {item.channel === "SMS" ? (
            <p className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
              <TriangleAlert className="h-3.5 w-3.5" /> No SMS provider is connected — SMS recipients are recorded as not sent.
            </p>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard title="Delivery" description={delivery?.at ? `Last sent ${formatDateTime(delivery.at)}` : "Stats appear once it's sent."}>
        <DeliveryStats delivery={delivery} />
        {delivery?.errors?.length ? (
          <ul className="mt-3 space-y-1 text-xs text-text-secondary">
            {delivery.errors.slice(0, 5).map((e) => (
              <li key={e}>• {e}</li>
            ))}
          </ul>
        ) : null}
      </SectionCard>
    </div>
  );
}

// Subject + body editor with merge-field picker and a sample-values preview.
function MessageSection({ item, onPatch, onCommit }) {
  const ref = useRef(null);
  const body = item.body || "";
  const unknown = unknownTokens(`${item.name || ""} ${body}`);
  return (
    <div className="space-y-4">
      <SectionCard
        title="Message"
        description="Personalised per recipient — merge fields fill in from each tenant, owner, or vendor."
        action={
          <MergeFieldPicker
            onInsert={(t) => {
              const next = insertAtCursor(ref.current, body, t);
              onPatch({ body: next });
              onCommit({ body: next });
            }}
          />
        }
      >
        <div className="space-y-3">
          <Input
            value={item.name || ""}
            onChange={(e) => onPatch({ name: e.target.value })}
            onBlur={(e) => onCommit({ name: e.target.value })}
            placeholder="Subject / title"
            className="bg-surface-card"
          />
          <Textarea
            ref={ref}
            value={body}
            placeholder="Hi {{recipient_name}}, the water at {{property}} will be shut off on Friday from 9am to noon…"
            onChange={(e) => onPatch({ body: e.target.value })}
            onBlur={(e) => onCommit({ body: e.target.value })}
            className="min-h-[220px]"
          />
          {unknown.length ? (
            <p className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
              <TriangleAlert className="h-3.5 w-3.5" /> Unknown merge field{unknown.length > 1 ? "s" : ""}:{" "}
              {unknown.map((t) => `{{${t}}}`).join(", ")}
            </p>
          ) : null}
        </div>
      </SectionCard>
      <SectionCard title="Preview" description="Rendered with sample values.">
        <p className="text-sm font-medium text-foreground">{renderMerge(item.name, SAMPLE_MERGE_VALUES) || "(no title)"}</p>
        <div className="mt-2 whitespace-pre-wrap rounded-lg border border-border bg-surface-card p-4 text-sm leading-relaxed text-foreground">
          {body ? renderMerge(body, SAMPLE_MERGE_VALUES) : <span className="text-text-tertiary">Nothing written yet.</span>}
        </div>
      </SectionCard>
    </div>
  );
}

const DELIVERY_COLUMNS = [
  {
    key: "recipientName",
    header: "Recipient",
    render: (r) => (
      <div className="flex flex-col gap-0.5">
        <span className="font-medium text-foreground">{r.recipientName || "—"}</span>
        <span className="text-xs capitalize text-text-secondary">{r.recipientType}</span>
      </div>
    ),
  },
  { key: "address", header: "Address", className: "text-sm text-muted-foreground", render: (r) => r.address || "—" },
  { key: "status", header: "Status", render: (r) => <StatusPill status={r.status} map={DELIVERY_STATUS_MAP} /> },
  { key: "error", header: "Note", className: "max-w-xs truncate text-xs text-text-secondary", render: (r) => r.error || "" },
  { key: "sentAt", header: "When", align: "right", className: "text-right text-sm text-muted-foreground", render: (r) => formatDateTime(r.sentAt) },
];

function DeliveriesSection({ item }) {
  const [rows, setRows] = useState(null);
  const id = item.id;
  const stamp = item.metadata?.delivery?.at || "";
  useEffect(() => {
    let alive = true;
    listAnnouncementDeliveries(id).then((r) => alive && setRows(r ?? []));
    return () => {
      alive = false;
    };
  }, [id, stamp]);
  if (rows === null) {
    return (
      <div className="flex justify-center py-12">
        <LogoLoading size={40} aria-label="Loading deliveries" />
      </div>
    );
  }
  return (
    <DataTable
      columns={DELIVERY_COLUMNS}
      data={rows}
      getRowKey={(r) => r.id}
      empty={
        <div className="rounded-xl border border-border bg-surface-subtle">
          <EmptyState icon={Truck} title="No deliveries yet" description="Each recipient appears here once the announcement goes out." />
        </div>
      }
    />
  );
}

const announcementsConfig = {
  key: "announcement",
  singular: "Announcement",
  plural: "Announcements",
  title: "Announcements",
  description:
    "Broadcast updates to tenants, owners, or vendors — send now or schedule, personalised with merge fields, with delivery stats per recipient.",
  icon: Megaphone,
  titleField: "name",
  searchFields: ["name", "audience", "channel", "propertyName", "buildingName", "body"],
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
            {[r.audience, r.propertyName, r.buildingName].filter(Boolean).join(" · ") || "No audience set"}
          </span>
        </div>
      ),
    },
    { key: "status", header: "Status", render: (r) => <StatusPill status={r.status} map={ANNOUNCEMENT_STATUS_MAP} /> },
    {
      key: "channel",
      header: "Channel",
      render: (r) => (r.channel ? <Badge variant="neutral">{r.channel}</Badge> : <span className="text-text-tertiary">—</span>),
    },
    {
      key: "delivered",
      header: "Delivered",
      align: "right",
      className: "text-right text-sm tabular-nums text-muted-foreground",
      render: (r) => {
        const d = r.metadata?.delivery;
        return d ? `${(d.sent || 0) + (d.logged || 0)} / ${d.total || 0}` : "—";
      },
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
    const reached = rows.reduce((n, r) => n + (r.metadata?.delivery?.sent || 0), 0);
    return [
      { label: "Announcements", value: String(rows.length), footer: `${count("Draft")} drafts` },
      { label: "Scheduled", value: String(count("Scheduled")), footer: "Queued to go out" },
      { label: "Sent", value: String(count("Sent")), footer: "Delivered or recorded" },
      { label: "Emails delivered", value: String(reached), footer: "Across all announcements" },
    ];
  },

  createDraft: { name: "", audience: "All tenants", channel: "Email" },
  createFields: [
    { key: "name", label: "Title", type: "text", placeholder: "e.g. Water shut-off on Friday", required: true },
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
    [r.audience, r.channel, r.scheduledFor && r.status === "Scheduled" ? `Scheduled ${formatDate(r.scheduledFor)}` : null]
      .filter(Boolean)
      .join(" · "),

  actions: [
    {
      key: "send",
      label: "Send now",
      icon: Send,
      run: (ctx) => sendNow(ctx.item, ctx.reload),
    },
    {
      key: "schedule",
      label: "Schedule…",
      icon: CalendarClock,
      showIf: (item) => item.status !== "Sent",
      wizard: {
        title: "Schedule announcement",
        description: "It goes out with the scheduler on the chosen day.",
        steps: [
          {
            key: "when",
            title: "When",
            fields: [{ key: "scheduledFor", label: "Send on", type: "date", required: true }],
            validate: (v) => (v.scheduledFor && v.scheduledFor < today() ? "Pick today or a future date." : null),
          },
        ],
        initial: (item) => ({ scheduledFor: item.scheduledFor || today() }),
        finish: (values, ctx) => ctx.commit({ scheduledFor: values.scheduledFor, status: "Scheduled" }),
        finishLabel: "Schedule",
        logSummary: "Scheduled the announcement",
      },
    },
    {
      key: "unschedule",
      label: "Unschedule",
      icon: CalendarX,
      showIf: (item) => item.status === "Scheduled",
      run: (ctx) => ctx.commit({ status: "Draft" }),
    },
  ],

  navGroups: [
    {
      group: null,
      items: [{ key: "overview", label: "Overview", icon: LayoutDashboard, desc: "Audience, reach, sending and delivery." }],
    },
    {
      group: "Announcement",
      items: [
        { key: "details", label: "Audience", icon: SquarePen, desc: "Who receives it, on which channel, and when." },
        { key: "body", label: "Message", icon: FileText, desc: "Title and body with merge fields." },
        { key: "deliveries", label: "Deliveries", icon: Truck, desc: "Per-recipient delivery status." },
      ],
    },
    {
      group: "General",
      items: [{ key: "activity", label: "Notes", icon: Clock, desc: "Internal notes." }],
    },
  ],
  sections: {
    overview: AnnouncementOverview,
    details: makeFieldsSection([
      { key: "audience", label: "Audience", type: "select", options: AUDIENCE_OPTIONS },
      { key: "channel", label: "Channel", type: "select", options: CHANNEL_OPTIONS },
      {
        key: "propertyId",
        label: "Property",
        type: "relation",
        load: propertyOptions,
        displayKey: "propertyName",
        hint: "Required for Property tenants; narrows Owners to this property's owners.",
        showIf: (item) => ["Property tenants", "Owners"].includes(item.audience),
      },
      {
        key: "buildingId",
        label: "Building",
        type: "relation",
        load: buildingOptions,
        displayKey: "buildingName",
        hint: "Required for Building tenants.",
        showIf: (item) => item.audience === "Building tenants",
      },
      { key: "scheduledFor", label: "Scheduled for", type: "date" },
      { key: "status", label: "Status", type: "select", options: selectOptions(ANNOUNCEMENT_STATUS_MAP) },
    ]),
    body: MessageSection,
    deliveries: DeliveriesSection,
    activity: makeNotesSection({ field: "activityNotes", placeholder: "Log an internal note…" }),
  },
};

export function AnnouncementsScreen() {
  return <EntityListScreen config={announcementsConfig} />;
}

export default AnnouncementsScreen;
