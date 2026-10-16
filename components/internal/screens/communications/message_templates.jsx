"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Braces,
  Clock,
  Copy,
  Eye,
  FileCode,
  LayoutDashboard,
  Loader2,
  MailOpen,
  Send,
  SquarePen,
  TriangleAlert,
} from "lucide-react";
import { LogoLoading } from "@geiger/ui";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field, SectionCard, StatusPill } from "@/components/internal/shared/screen_kit";
import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { messageTemplatesData } from "@/lib/supabase/message_templates";
import { createClient } from "@/lib/supabase/client";
import { getActiveProjectId } from "@/lib/supabase/project_scope";
import { buildMergeValues } from "@/lib/messaging/context";
import { sendMessage } from "@/lib/messaging/api";
import {
  makeFieldsSection,
  makeOverviewSection,
  makeNotesSection,
} from "@/components/internal/screens/entity/sections/factories";
import {
  BROADCAST_CHANNELS,
  DELIVERY_STATUS_MAP,
  MERGE_FIELD_GROUPS,
  PREVIEW_RECORD_TYPES,
  SAMPLE_MERGE_VALUES,
  TEMPLATE_CATEGORIES,
  TEMPLATE_STATUS_MAP,
  filterOptions,
  formatDate,
  listOptions,
  missingTokens,
  renderMerge,
  selectOptions,
  unknownTokens,
} from "./shared";
import { MergeFieldPicker, RecordPicker, insertAtCursor } from "./messaging_kit";

// Message Templates — reusable messages with {{merge_field}} tokens (owns
// `property.message_templates`). The editor inserts fields at the cursor, the
// preview renders against a real record (tenant / lease / owner / vendor), and a
// template can be sent straight to a record through /api/messages/send.

const CATEGORY_OPTIONS = listOptions(TEMPLATE_CATEGORIES);
const CHANNEL_OPTIONS = listOptions(BROADCAST_CHANNELS);

const copyToken = async (token) => {
  try {
    await navigator.clipboard.writeText(`{{${token}}}`);
    toast.success(`Copied {{${token}}}`);
  } catch {
    toast.error("Couldn't copy to the clipboard.");
  }
};

const REF_KEY = { tenant: "tenantId", lease: "leaseId", owner: "ownerId", vendor: "vendorId" };

// Subject + body editor with cursor-aware merge-field insertion.
function BodySection({ item, onPatch, onCommit }) {
  const bodyRef = useRef(null);
  const subjectRef = useRef(null);
  const [focus, setFocus] = useState("body");
  const sms = item.channel === "SMS";
  const body = item.body || "";
  const unknown = unknownTokens(`${item.subject || ""} ${body}`);

  const insert = (token) => {
    if (focus === "subject" && !sms) {
      const next = insertAtCursor(subjectRef.current, item.subject, token);
      onPatch({ subject: next });
      onCommit({ subject: next });
    } else {
      const next = insertAtCursor(bodyRef.current, body, token);
      onPatch({ body: next });
      onCommit({ body: next });
    }
  };

  return (
    <SectionCard
      title="Content"
      description={sms ? `SMS — ${body.length} characters (${Math.max(1, Math.ceil(body.length / 160))} segment${body.length > 160 ? "s" : ""}).` : "Click a field to insert it where your cursor is."}
      action={<MergeFieldPicker onInsert={insert} />}
    >
      <div className="space-y-3">
        {!sms ? (
          <Field label="Subject" htmlFor="tpl-subject">
            <Input
              id="tpl-subject"
              ref={subjectRef}
              value={item.subject || ""}
              onFocus={() => setFocus("subject")}
              onChange={(e) => onPatch({ subject: e.target.value })}
              onBlur={(e) => onCommit({ subject: e.target.value })}
              placeholder="e.g. Rent for {{unit}} is due {{due_date}}"
              className="bg-surface-card"
            />
          </Field>
        ) : null}
        <Field label="Body" htmlFor="tpl-body">
          <Textarea
            id="tpl-body"
            ref={bodyRef}
            value={body}
            onFocus={() => setFocus("body")}
            onChange={(e) => onPatch({ body: e.target.value })}
            onBlur={(e) => onCommit({ body: e.target.value })}
            placeholder="Hi {{tenant_first_name}}, your rent of {{rent}} for {{unit}} is due {{due_date}}."
            className="min-h-[280px] font-mono text-[13px]"
          />
        </Field>
        {unknown.length ? (
          <p className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
            <TriangleAlert className="h-3.5 w-3.5" />
            Unknown merge field{unknown.length > 1 ? "s" : ""}: {unknown.map((t) => `{{${t}}}`).join(", ")}
          </p>
        ) : null}
      </div>
    </SectionCard>
  );
}

// Merge values for a chosen record (browser client — sandbox-aware).
function useMergeValues(recordType, recordId) {
  const key = `${recordType}:${recordId || ""}`;
  const [state, setState] = useState({ key: null, values: null });
  useEffect(() => {
    if (!recordId) return;
    let alive = true;
    buildMergeValues(createClient(), { projectId: getActiveProjectId(), [REF_KEY[recordType]]: recordId }).then(
      (res) => alive && setState({ key, values: res.values }),
    );
    return () => {
      alive = false;
    };
  }, [recordType, recordId, key]);
  return { values: state.key === key ? state.values : null, loading: Boolean(recordId) && state.key !== key };
}

function TemplatePreview({ item }) {
  const [recordType, setRecordType] = useState("tenant");
  const [recordId, setRecordId] = useState("");
  const [sending, setSending] = useState(false);
  const { values, loading } = useMergeValues(recordType, recordId);
  const live = Boolean(recordId && values);
  const fill = (text) => renderMerge(text, live ? values : SAMPLE_MERGE_VALUES);
  const missing = live ? missingTokens(`${item.subject || ""} ${item.body || ""}`, values) : [];
  const canSend = ["tenant", "owner", "vendor"].includes(recordType) && recordId;

  const send = async () => {
    setSending(true);
    const res = await sendMessage({
      recipient: { type: recordType, id: recordId },
      channel: item.channel === "SMS" ? "sms" : "email",
      templateId: item.id,
    });
    setSending(false);
    if (!res.ok) return toast.error(res.error || "Couldn't send.");
    if (res.status === "sent") toast.success("Sent — it's in the Inbox thread.");
    else toast.warning(`Saved to the Inbox — ${res.error || DELIVERY_STATUS_MAP[res.status]?.label || "not delivered"}.`);
  };

  return (
    <div className="space-y-4">
      <SectionCard title="Preview with" description="Pick a real record to fill the fields, or leave it empty for sample values.">
        <div className="grid gap-4 sm:grid-cols-[180px_1fr_auto] sm:items-end">
          <Field label="Record type" htmlFor="tpl-rtype">
            <Select
              value={recordType}
              onValueChange={(v) => {
                setRecordType(v);
                setRecordId("");
              }}
            >
              <SelectTrigger id="tpl-rtype" className="w-full bg-surface-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PREVIEW_RECORD_TYPES.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Record" htmlFor="tpl-record">
            <RecordPicker id="tpl-record" type={recordType} value={recordId} onChange={setRecordId} placeholder="Sample values" />
          </Field>
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={!canSend || sending}
            onClick={send}
            title={canSend ? undefined : "Pick a tenant, owner, or vendor to send to"}
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send to record
          </Button>
        </div>
      </SectionCard>

      <SectionCard title="Preview" description={live ? "Filled from the selected record." : "Rendered with sample values."}>
        {loading ? (
          <div className="flex justify-center py-10">
            <LogoLoading size={36} aria-label="Loading record" />
          </div>
        ) : (
          <div className="space-y-3">
            {item.channel !== "SMS" ? (
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">Subject</p>
                <p className="mt-1 text-sm font-medium text-foreground">{fill(item.subject) || "(no subject)"}</p>
              </div>
            ) : null}
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">Body</p>
              {item.body ? (
                <div className="mt-1 whitespace-pre-wrap rounded-lg border border-border bg-surface-card p-4 text-sm leading-relaxed text-foreground">
                  {fill(item.body)}
                </div>
              ) : (
                <p className="mt-1 text-sm text-text-tertiary">The body is empty — write it in the Content tab.</p>
              )}
            </div>
            {missing.length ? (
              <p className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                <TriangleAlert className="h-3.5 w-3.5" />
                No value on this record for {missing.map((t) => `{{${t}}}`).join(", ")} — they&apos;ll be left blank.
              </p>
            ) : null}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function MergeFieldsReference() {
  return (
    <div className="space-y-4">
      {MERGE_FIELD_GROUPS.map((g) => (
        <SectionCard key={g.key} title={g.label} bodyPadding={false}>
          <ul className="divide-y divide-border">
            {g.fields.map((f) => (
              <li key={f.token} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Braces className="h-4 w-4 shrink-0 text-text-secondary" />
                  <code className="truncate font-mono text-[13px] text-foreground">{`{{${f.token}}}`}</code>
                  <span className="hidden truncate text-sm text-text-secondary sm:inline">{f.label}</span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-sm text-text-tertiary">{f.sample}</span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground hover:bg-surface-active hover:text-foreground"
                    onClick={() => copyToken(f.token)}
                    aria-label={`Copy {{${f.token}}}`}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      ))}
    </div>
  );
}

const templatesConfig = {
  key: "template",
  singular: "Template",
  plural: "Templates",
  title: "Message Templates",
  description:
    "Reusable messages for leasing, maintenance, payments, and renewals — merge fields fill in tenant, lease, unit, property, owner, and balance details.",
  icon: MailOpen,
  titleField: "name",
  searchFields: ["name", "category", "channel", "subject", "body"],
  data: messageTemplatesData,

  statusMap: TEMPLATE_STATUS_MAP,
  statusFilterOptions: filterOptions(TEMPLATE_STATUS_MAP),

  views: [
    { value: "all", label: "All", filter: () => true },
    { value: "email", label: "Email", filter: (r) => r.channel !== "SMS" },
    { value: "sms", label: "SMS", filter: (r) => r.channel === "SMS", createDefaults: { channel: "SMS" } },
  ],

  columns: [
    {
      key: "name",
      header: "Template",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="max-w-md truncate text-xs text-text-secondary">
            {r.channel === "SMS" ? r.body || "No body" : r.subject || "No subject"}
          </span>
        </div>
      ),
    },
    { key: "status", header: "Status", render: (r) => <StatusPill status={r.status} map={TEMPLATE_STATUS_MAP} /> },
    {
      key: "category",
      header: "Category",
      render: (r) => (r.category ? <Badge variant="neutral">{r.category}</Badge> : <span className="text-text-tertiary">—</span>),
    },
    { key: "channel", header: "Channel", className: "text-sm text-muted-foreground", render: (r) => r.channel || "—" },
    {
      key: "fields",
      header: "Fields",
      align: "right",
      className: "text-right text-sm tabular-nums text-muted-foreground",
      render: (r) => new Set([...`${r.subject || ""} ${r.body || ""}`.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/gi)].map((m) => m[1])).size,
    },
  ],

  stats: (rows) => {
    const active = rows.filter((r) => r.status === "Active").length;
    const byCat = (c) => rows.filter((r) => r.category === c).length;
    return [
      { label: "Templates", value: String(rows.length), footer: `${active} active` },
      { label: "Leasing", value: String(byCat("Leasing") + byCat("Renewals")), footer: "Applications, leases & renewals" },
      { label: "Maintenance", value: String(byCat("Maintenance")), footer: "Work order updates" },
      { label: "Payments", value: String(byCat("Payments") + byCat("Collections")), footer: "Rent, fees & collections" },
    ];
  },

  createDraft: { name: "", category: "General", channel: "Email" },
  createFields: [
    { key: "name", label: "Template name", type: "text", placeholder: "e.g. Rent reminder — 3 days", required: true },
    { key: "category", label: "Category", type: "select", options: CATEGORY_OPTIONS },
    { key: "channel", label: "Channel", type: "select", options: CHANNEL_OPTIONS },
  ],
  newRow: (draft) => ({
    name: draft.name.trim(),
    category: draft.category || "General",
    channel: draft.channel || "Email",
    subject: "",
    body: "",
    status: "Active",
  }),

  headerMeta: (r) => [r.category, r.channel].filter(Boolean).join(" · "),

  navGroups: [
    {
      group: null,
      items: [{ key: "overview", label: "Overview", icon: LayoutDashboard, desc: "A snapshot of this template." }],
    },
    {
      group: "Template",
      items: [
        { key: "details", label: "Details", icon: SquarePen, desc: "Name, category, channel, and status." },
        { key: "body", label: "Content", icon: FileCode, desc: "Subject and body with merge fields." },
        { key: "preview", label: "Preview & send", icon: Eye, desc: "Render against a real record, then send." },
        { key: "fields", label: "Merge fields", icon: Braces, desc: "Every available field with sample values." },
      ],
    },
    {
      group: "General",
      items: [{ key: "activity", label: "Notes", icon: Clock, desc: "Internal notes." }],
    },
  ],
  sections: {
    overview: makeOverviewSection({
      fields: [
        { key: "category", label: "Category" },
        { key: "channel", label: "Channel" },
        { key: "subject", label: "Subject" },
        { key: "status", label: "Status" },
        { key: "createdAt", label: "Created", format: (v) => formatDate(v) },
      ],
    }),
    details: makeFieldsSection([
      { key: "name", label: "Template name", type: "text", full: true },
      { key: "category", label: "Category", type: "select", options: CATEGORY_OPTIONS },
      { key: "channel", label: "Channel", type: "select", options: CHANNEL_OPTIONS },
      { key: "status", label: "Status", type: "select", options: selectOptions(TEMPLATE_STATUS_MAP) },
    ]),
    body: BodySection,
    preview: TemplatePreview,
    fields: MergeFieldsReference,
    activity: makeNotesSection({ field: "activityNotes", placeholder: "Log an internal note…" }),
  },
};

export function MessageTemplatesScreen() {
  return <EntityListScreen config={templatesConfig} />;
}

export default MessageTemplatesScreen;
