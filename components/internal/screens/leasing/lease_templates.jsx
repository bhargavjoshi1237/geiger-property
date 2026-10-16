"use client";

import { useMemo } from "react";
import { toast } from "sonner";
import {
  LayoutDashboard,
  FileText,
  Braces,
  Eye,
  Settings,
  Files,
  Scale,
  ClipboardList,
  Clock,
  AlertTriangle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { EmptyState, SectionCard, StatusPill } from "@/components/internal/shared/screen_kit";
import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { leaseTemplatesData } from "@/lib/supabase/lease_templates";
import {
  makeFieldsSection,
  makeOverviewSection,
  makeMetaListSection,
  makeNotesSection,
} from "@/components/internal/screens/entity/sections/factories";
import { makeGatedSection } from "./sections";
import { TEMPLATE_STATUS_MAP, filterOptions, formatDate } from "./shared";

// Templates — an entity screen over `property.lease_templates`. Reusable lease
// bodies with {{merge_field}} placeholders; state-specific templates (scope
// "state") also carry the jurisdiction's requirements and disclosures.

const SCOPE_OPTIONS = [
  { value: "generic", label: "Generic" },
  { value: "state", label: "State-specific" },
];

const isState = (r) => r?.scope === "state";

// Built-in merge fields and the sample values used in the preview.
const SAMPLE_VALUES = {
  tenant_name: "Jordan Blake",
  landlord_name: "Harbor Property Management",
  property_name: "Maple Court",
  unit: "Maple Court · 4B",
  address: "120 Maple Ct, Apt 4B, Austin, TX 78701",
  rent: "$1,850",
  deposit: "$1,850",
  lease_start: "Jan 1, 2027",
  lease_end: "Dec 31, 2027",
  due_day: "1st",
  late_fee: "$75",
  grace_days: "5",
  state: "TX",
  today: "Oct 10, 2026",
};

const TOKEN_RE = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;
const stripBraces = (s) => String(s || "").replace(/[{}\s]/g, "");
const tokenCount = (body) => new Set([...String(body || "").matchAll(TOKEN_RE)].map((m) => m[1])).size;

// Split the body into text and token parts, resolving each token's sample value.
function resolveTemplate(body, values) {
  const parts = [];
  const found = new Map();
  let last = 0;
  for (const m of String(body || "").matchAll(TOKEN_RE)) {
    if (m.index > last) parts.push({ text: body.slice(last, m.index) });
    const key = m[1];
    const known = Object.hasOwn(values, key);
    parts.push({ token: key, known, text: known ? values[key] || `{{${key}}}` : m[0] });
    found.set(key, known);
    last = m.index + m[0].length;
  }
  if (last < String(body || "").length) parts.push({ text: body.slice(last) });
  return { parts, found };
}

function MergePreviewSection({ item }) {
  // Custom merge fields declared on the template, with their sample values.
  const custom = useMemo(() => {
    const list = Array.isArray(item.metadata?.mergeFields) ? item.metadata.mergeFields : [];
    return Object.fromEntries(list.map((f) => [stripBraces(f.label), f.sample || ""]).filter(([k]) => k));
  }, [item.metadata]);
  const values = useMemo(() => ({ ...SAMPLE_VALUES, ...custom }), [custom]);
  const { parts, found } = useMemo(() => resolveTemplate(item.body, values), [item.body, values]);
  const unknown = [...found].filter(([, known]) => !known).map(([k]) => k);

  const copyToken = async (key) => {
    try {
      await navigator.clipboard.writeText(`{{${key}}}`);
      toast.success(`Copied {{${key}}}.`);
    } catch {
      toast.error("Couldn't copy to the clipboard.");
    }
  };

  return (
    <div className="space-y-4">
      {unknown.length ? (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Unknown merge fields: {unknown.map((k) => `{{${k}}}`).join(", ")}. Add them under Merge
            Fields with a sample value, or fix the spelling.
          </span>
        </div>
      ) : null}

      <SectionCard
        title="Preview with sample values"
        description={`${found.size} merge field${found.size === 1 ? "" : "s"} used · ${unknown.length} unknown`}
      >
        {String(item.body || "").trim() ? (
          <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap font-mono text-[13px] leading-relaxed text-foreground">
            {parts.map((p, i) =>
              p.token ? (
                <span
                  key={i}
                  className={
                    p.known
                      ? "rounded bg-emerald-500/10 px-0.5 text-emerald-600 dark:text-emerald-400"
                      : "rounded bg-amber-500/10 px-0.5 text-amber-700 dark:text-amber-400"
                  }
                  title={`{{${p.token}}}`}
                >
                  {p.text}
                </span>
              ) : (
                <span key={i}>{p.text}</span>
              ),
            )}
          </pre>
        ) : (
          <EmptyState
            icon={FileText}
            title="No template body yet"
            description="Write the lease text in Template Body using {{merge_field}} placeholders."
          />
        )}
      </SectionCard>

      <SectionCard title="Available merge fields" description="Click one to copy its placeholder.">
        <div className="flex flex-wrap gap-2">
          {Object.keys(values).map((k) => (
            <button key={k} type="button" onClick={() => copyToken(k)} title={`Sample: ${values[k] || "—"}`}>
              <Badge variant={found.has(k) ? "success" : "neutral"} className="cursor-pointer font-mono">
                {`{{${k}}}`}
              </Badge>
            </button>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

const stateOnly = (section, icon, title) =>
  makeGatedSection({
    when: isState,
    section,
    icon,
    title,
    description: "This is a generic template — set its scope to State-specific in Settings to track this.",
  });

const templatesConfig = {
  key: "template",
  singular: "Template",
  plural: "Templates",
  title: "Templates",
  description:
    "Reusable lease templates with merge fields — generic or state-specific, with each jurisdiction's requirements and disclosures in one place.",
  icon: Files,
  titleField: "name",
  searchFields: ["name", "state"],
  data: leaseTemplatesData,

  statusMap: TEMPLATE_STATUS_MAP,
  statusFilterOptions: filterOptions(TEMPLATE_STATUS_MAP),

  views: [
    { value: "all", label: "All", filter: () => true },
    { value: "generic", label: "Generic", filter: (r) => !isState(r), createDefaults: { scope: "generic" } },
    { value: "state", label: "State-specific", filter: isState, createDefaults: { scope: "state" } },
  ],

  columns: [
    {
      key: "name",
      header: "Template",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="text-xs text-text-secondary">
            {isState(r) ? `State-specific${r.state ? ` · ${r.state}` : ""}` : "Generic"}
          </span>
        </div>
      ),
    },
    {
      key: "scope",
      header: "Scope",
      render: (r) => (
        <Badge variant={isState(r) ? "info" : "neutral"}>
          {isState(r) ? r.state || "State" : "Generic"}
        </Badge>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusPill status={r.status} map={TEMPLATE_STATUS_MAP} />,
    },
    {
      key: "fields",
      header: "Merge fields",
      align: "right",
      className: "text-right text-sm tabular-nums text-muted-foreground",
      render: (r) => String(tokenCount(r.body)),
    },
  ],

  stats: (rows) => {
    const published = rows.filter((r) => r.status === "Published").length;
    const stateRows = rows.filter(isState);
    const states = new Set(stateRows.map((r) => r.state).filter(Boolean)).size;
    return [
      { label: "Templates", value: String(rows.length), footer: `${published} published` },
      { label: "Published", value: String(published), footer: "Ready to use" },
      { label: "State-specific", value: String(stateRows.length), footer: `${states} states covered` },
      { label: "Drafts", value: String(rows.filter((r) => r.status === "Draft").length), footer: "In progress" },
    ];
  },

  createDraft: { name: "", scope: "", state: "" },
  createFields: [
    { key: "name", label: "Template name", type: "text", placeholder: "e.g. Standard 12-month lease" },
    { key: "scope", label: "Scope", type: "select", options: SCOPE_OPTIONS, placeholder: "Matches the current tab" },
    { key: "state", label: "State (2-letter, if state-specific)", type: "text", placeholder: "e.g. TX" },
  ],
  // `scope` only when chosen, so the active view's createDefaults apply otherwise.
  newRow: (draft) => ({
    name: draft.name.trim(),
    ...(draft.scope ? { scope: draft.scope } : {}),
    ...(draft.state ? { state: draft.state.trim().toUpperCase() } : {}),
    status: "Draft",
  }),

  headerMeta: (r) => [isState(r) ? "State-specific" : "Generic", r.state].filter(Boolean).join(" · "),

  navGroups: [
    {
      group: null,
      items: [
        { key: "overview", label: "Overview", icon: LayoutDashboard, desc: "A snapshot of this template." },
      ],
    },
    {
      group: "Content",
      items: [
        { key: "body", label: "Template Body", icon: FileText, desc: "The lease text with {{merge_field}} placeholders." },
        { key: "mergeFields", label: "Merge Fields", icon: Braces, desc: "Custom placeholders and their sample values." },
        { key: "preview", label: "Merge Preview", icon: Eye, desc: "The body filled with sample values." },
      ],
    },
    {
      group: "State compliance",
      items: [
        { key: "requirements", label: "State Requirements", icon: Scale, desc: "Mandatory clauses for this state." },
        { key: "disclosures", label: "Required Disclosures", icon: ClipboardList, desc: "Disclosures the state requires." },
      ],
    },
    {
      group: null,
      items: [
        { key: "settings", label: "Settings", icon: Settings, desc: "Scope, state, and status." },
        { key: "activity", label: "Activity", icon: Clock, desc: "Notes and history." },
      ],
    },
  ],
  sections: {
    overview: makeOverviewSection({
      fields: [
        { key: "scope", label: "Scope", format: (v) => (v === "state" ? "State-specific" : "Generic") },
        { key: "state", label: "State" },
        { key: "status", label: "Status" },
        { key: "createdAt", label: "Created", format: (v) => formatDate(v) },
        {
          key: "tokens",
          label: "Merge fields used",
          format: (_v, r) => String(tokenCount(r.body)),
        },
        {
          key: "disclosureCount",
          label: "Disclosures",
          format: (_v, r) => {
            const list = Array.isArray(r.metadata?.disclosures) ? r.metadata.disclosures : [];
            return isState(r) ? `${list.filter((d) => d.done).length}/${list.length} included` : "—";
          },
        },
      ],
    }),
    body: makeNotesSection({
      field: "body",
      placeholder: "Lease template text — use {{tenant_name}}, {{rent}}, {{lease_start}} and other placeholders…",
      meta: false,
      mono: true,
    }),
    mergeFields: makeMetaListSection({
      field: "mergeFields",
      singular: "merge field",
      icon: Braces,
      primaryPlaceholder: "e.g. {{parking_space}}",
      secondary: { key: "sample", label: "Sample value", placeholder: "Sample value, e.g. P-12" },
    }),
    preview: MergePreviewSection,
    requirements: stateOnly(
      makeMetaListSection({
        field: "requirements",
        singular: "requirement",
        icon: Scale,
        primaryPlaceholder: "e.g. Security deposit cap",
      }),
      Scale,
      "State requirements apply to state-specific templates",
    ),
    disclosures: stateOnly(
      makeMetaListSection({
        field: "disclosures",
        singular: "disclosure",
        icon: ClipboardList,
        primaryPlaceholder: "e.g. Lead-based paint disclosure",
        check: true,
      }),
      ClipboardList,
      "Disclosures apply to state-specific templates",
    ),
    settings: makeFieldsSection([
      { key: "scope", label: "Scope", type: "select", options: SCOPE_OPTIONS },
      { key: "state", label: "State (2-letter)", type: "text", placeholder: "e.g. TX" },
      { key: "status", label: "Status", type: "select", options: filterOptions(TEMPLATE_STATUS_MAP).slice(1) },
    ]),
    activity: makeNotesSection({ field: "activityNotes", placeholder: "Log a note about this template…" }),
  },
};

export function TemplatesScreen() {
  return <EntityListScreen config={templatesConfig} />;
}

export default TemplatesScreen;
