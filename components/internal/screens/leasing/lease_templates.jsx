"use client";

import { useEffect, useMemo, useState } from "react";
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
  BookOpen,
  History,
  FileSignature,
  Rocket,
  Archive,
  FolderOpen,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ListLoading, SectionCard, StatusPill } from "@/components/internal/shared/screen_kit";
import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { ActivitySection, DocumentsSection } from "@/components/internal/screens/entity/shared_sections";
import { makeRelatedSection } from "@/components/internal/screens/entity/sections/related_section";
import { leaseTemplatesData } from "@/lib/supabase/lease_templates";
import { leasesLayer } from "@/lib/supabase/leases";
import { loadLeaseContext, todayISO } from "@/lib/leasing/workflows";
import { DEFAULT_LEASE_BODY, MERGE_FIELDS, MERGE_GROUPS, SAMPLE_MERGE_VALUES, buildMergeValues, mergeTemplate, tokensIn } from "@/lib/leasing/merge";
import {
  makeFieldsSection,
  makeOverviewSection,
  makeMetaListSection,
  makeNotesSection,
} from "@/components/internal/screens/entity/sections/factories";
import { Callout, MetaRecords, makeGatedSection } from "./sections/gated";
import { MergedText } from "./sections/merged_text";
import { LEASE_STATUS_MAP, LEASE_TYPE_OPTIONS, TEMPLATE_STATUS_MAP, currency, filterOptions, formatDate, metaList, toOptions } from "./shared";

// Templates — an entity screen over `property.lease_templates`. Lease bodies with
// {{merge.field}} placeholders from the documented catalog, a clause library
// leases pull from, versioning, and a preview merged against a real lease.

const SCOPE_OPTIONS = [
  { value: "generic", label: "Generic" },
  { value: "state", label: "State-specific" },
];

const isState = (r) => r?.scope === "state";
const stripBraces = (s) => String(s || "").replace(/[{}\s]/g, "");
const customValues = (item) =>
  Object.fromEntries(metaList(item, "mergeFields").map((f) => [stripBraces(f.label), f.sample || ""]).filter(([k]) => k));

// --- Merge field catalog ---------------------------------------------------------------

function CatalogSection({ item }) {
  const used = tokensIn(item.body);
  const copy = async (key) => {
    try {
      await navigator.clipboard.writeText(`{{${key}}}`);
      toast.success(`Copied {{${key}}}.`);
    } catch {
      toast.error("Couldn't copy to the clipboard.");
    }
  };
  return (
    <div className="space-y-5">
      <p className="text-sm text-text-secondary">
        Click a field to copy its placeholder. Fields this template uses are highlighted. List fields expand to one line per item.
      </p>
      {MERGE_GROUPS.map((g) => (
        <SectionCard key={g} title={g} bodyPadding={false}>
          <ul className="divide-y divide-border">
            {MERGE_FIELDS.filter((f) => f.group === g).map((f) => (
              <li key={f.key}>
                <button type="button" onClick={() => copy(f.key)} className="flex w-full items-center justify-between gap-3 px-5 py-2.5 text-left hover:bg-surface-hover">
                  <span className="min-w-0">
                    <span className="block text-sm text-foreground">{f.label}</span>
                    <span className="block truncate text-xs text-text-tertiary">e.g. {String(f.sample).split("\n")[0]}</span>
                  </span>
                  <Badge variant={used.has(f.key) || (f.legacy && used.has(f.legacy)) ? "success" : "neutral"} className="shrink-0 font-mono">
                    {`{{${f.key}}}`}
                  </Badge>
                </button>
              </li>
            ))}
          </ul>
        </SectionCard>
      ))}
    </div>
  );
}

// --- Preview against a chosen lease -------------------------------------------------------

function PreviewSection({ item }) {
  const [leases, setLeases] = useState(null);
  const [leaseId, setLeaseId] = useState("sample");
  const [values, setValues] = useState(null);

  useEffect(() => {
    let alive = true;
    leasesLayer.list().then((r) => alive && setLeases(r ?? []));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    if (leaseId === "sample") return undefined;
    const lease = (leases || []).find((l) => l.id === leaseId);
    if (!lease) return undefined;
    loadLeaseContext(lease).then((ctx) => alive && setValues(ctx ? buildMergeValues(ctx) : {}));
    return () => {
      alive = false;
    };
  }, [leaseId, leases]);

  const body = String(item.body || "").trim() ? item.body : DEFAULT_LEASE_BODY;
  const merged = useMemo(
    () => mergeTemplate(body, { ...(leaseId === "sample" ? SAMPLE_MERGE_VALUES : values || {}), ...customValues(item) }),
    [body, leaseId, values, item],
  );

  if (leases === null) return <ListLoading label="Loading leases" className="py-10" />;

  return (
    <div className="space-y-4">
      {!String(item.body || "").trim() ? <Callout tone="info">No body yet — previewing the built-in starter agreement.</Callout> : null}
      {merged.unknown.length ? (
        <Callout tone="danger">Unknown merge fields: {merged.unknown.map((k) => `{{${k}}}`).join(", ")}. Fix the spelling or add them under Custom Fields.</Callout>
      ) : null}
      <SectionCard
        title="Merged preview"
        description={`${merged.used.size} fields used · ${merged.empty.length} empty for this lease · ${merged.unknown.length} unknown`}
        action={
          <Select value={leaseId} onValueChange={(v) => { setValues(null); setLeaseId(v); }}>
            <SelectTrigger className="h-8 w-64 bg-surface-card" aria-label="Preview against">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sample">Sample values</SelectItem>
              {leases.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {[l.name, l.tenantName].filter(Boolean).join(" · ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      >
        {leaseId !== "sample" && values === null ? <ListLoading label="Merging" className="border-0 py-10" /> : <MergedText parts={merged.parts} />}
      </SectionCard>
    </div>
  );
}

// --- Clause library ----------------------------------------------------------------------

const CLAUSE_FIELDS = [
  { key: "title", label: "Title", type: "text", required: true, placeholder: "e.g. Smoke-free premises" },
  { key: "category", label: "Category", type: "select", options: toOptions(["General", "Pets", "Parking", "Maintenance", "Use of premises", "Utilities", "Legal", "Other"]) },
  { key: "body", label: "Wording", type: "textarea", full: true, required: true },
  { key: "required", label: "Required in every lease", type: "switch" },
  { key: "states", label: "Only for states", type: "text", placeholder: "e.g. CA, NY (blank = all)" },
];

function ClauseLibrarySection({ item, config, onCommitMeta }) {
  return (
    <MetaRecords
      item={item}
      config={config}
      onCommitMeta={onCommitMeta}
      field="clauseLibrary"
      fields={CLAUSE_FIELDS}
      singular="Clause"
      icon={BookOpen}
      defaults={() => ({ category: "General" })}
      emptyDescription="Reusable clauses. Leases using this template can add them from their Clauses tab."
      summary={(c) => ({
        title: c.title,
        meta: [c.category, c.states ? `States: ${c.states}` : null, c.body].filter(Boolean).join(" · "),
        badge: c.required ? "Required" : null,
        badgeVariant: "warning",
      })}
    />
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

const usage = makeRelatedSection({
  load: (item) => leasesLayer.list({ templateId: item.id }),
  tab: "Leases",
  plural: "Leases",
  icon: FileSignature,
  emptyDescription: "Leases that pick this template in Template & Document show up here.",
  columns: [
    { key: "name", header: "Lease", render: (r) => <span className="font-medium text-foreground">{r.name}</span> },
    { key: "status", header: "Status", render: (r) => <StatusPill status={r.status} map={LEASE_STATUS_MAP} /> },
    { key: "rent", header: "Rent", align: "right", className: "text-right tabular-nums", render: (r) => currency(r.rent) },
  ],
});

const templatesConfig = {
  key: "template",
  singular: "Template",
  plural: "Templates",
  title: "Templates",
  description:
    "Lease templates with documented merge fields, a reusable clause library, and versions — generic or state-specific, previewed against any lease.",
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
            {[isState(r) ? `State-specific${r.state ? ` · ${r.state}` : ""}` : "Generic", r.metadata?.version ? `v${r.metadata.version}` : null].filter(Boolean).join(" · ")}
          </span>
        </div>
      ),
    },
    {
      key: "scope",
      header: "Scope",
      render: (r) => <Badge variant="neutral">{isState(r) ? r.state || "State" : "Generic"}</Badge>,
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
      render: (r) => String(tokensIn(r.body).size),
    },
  ],

  stats: (rows) => {
    const published = rows.filter((r) => r.status === "Published").length;
    const stateRows = rows.filter(isState);
    const states = new Set(stateRows.map((r) => r.state).filter(Boolean)).size;
    const clauses = rows.reduce((s, r) => s + metaList(r, "clauseLibrary").length, 0);
    return [
      { label: "Templates", value: String(rows.length), footer: `${published} published` },
      { label: "State-specific", value: String(stateRows.length), footer: `${states} states covered` },
      { label: "Library clauses", value: String(clauses), footer: "Across all templates" },
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
    body: DEFAULT_LEASE_BODY,
    status: "Draft",
    metadata: { version: 1 },
  }),

  headerMeta: (r) => [isState(r) ? "State-specific" : "Generic", r.state, r.metadata?.version ? `Version ${r.metadata.version}` : null].filter(Boolean).join(" · "),

  actions: [
    {
      key: "publish",
      label: "Publish new version",
      icon: Rocket,
      showIf: (r) => r.status !== "Archived",
      wizard: {
        title: "Publish a new version",
        description: "Bumps the version and records what changed. Existing generated documents are unaffected.",
        finishLabel: "Publish",
        logSummary: "Published a new template version",
        initial: (r) => ({ version: (Number(r.metadata?.version) || (r.status === "Published" ? 1 : 0)) + 1, effectiveOn: todayISO() }),
        steps: [
          {
            key: "v",
            title: "Version",
            fields: [
              { key: "version", label: "Version", type: "number", min: 1, required: true },
              { key: "effectiveOn", label: "Effective", type: "date" },
              { key: "changes", label: "What changed", type: "textarea", required: true },
            ],
          },
        ],
        finish: async (v, ctx) => {
          const ok = await ctx.commit({ status: "Published" });
          if (!ok) return false;
          const log = metaList(ctx.item, "versions");
          await ctx.commitMeta({
            version: Number(v.version) || 1,
            effectiveOn: v.effectiveOn || "",
            versions: [...log, { id: crypto.randomUUID(), label: `v${v.version} — ${v.changes}`, date: formatDate(v.effectiveOn || todayISO()) }],
          });
          toast.success(`Version ${v.version} published.`);
          return true;
        },
      },
    },
    {
      key: "archive",
      label: "Archive",
      icon: Archive,
      danger: true,
      separatorBefore: true,
      showIf: (r) => r.status !== "Archived",
      run: async (ctx) => {
        if (await ctx.commit({ status: "Archived" })) toast.success("Template archived — leases already using it keep it.");
      },
    },
  ],

  navGroups: [
    {
      group: null,
      items: [{ key: "overview", label: "Overview", icon: LayoutDashboard, desc: "A snapshot of this template." }],
    },
    {
      group: "Content",
      items: [
        { key: "body", label: "Template Body", icon: FileText, desc: "The lease text with {{merge.field}} placeholders." },
        { key: "catalog", label: "Merge Field Catalog", icon: Braces, desc: "Every placeholder you can use, by group." },
        { key: "mergeFields", label: "Custom Fields", icon: Braces, desc: "Extra placeholders and their sample values." },
        { key: "clauses", label: "Clause Library", icon: BookOpen, desc: "Reusable clauses leases can add." },
        { key: "preview", label: "Preview", icon: Eye, desc: "Merged against sample values or a real lease." },
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
      group: "Usage & history",
      items: [
        { key: "usage", label: "Leases Using It", icon: FileSignature, desc: "Leases linked to this template." },
        { key: "versions", label: "Versions", icon: History, desc: "Published versions and what changed." },
        { key: "documents", label: "Documents", icon: FolderOpen, desc: "Source files and legal review." },
        { key: "activity", label: "Activity", icon: Clock, desc: "Every change and action on this template." },
      ],
    },
    {
      group: null,
      items: [{ key: "settings", label: "Settings", icon: Settings, desc: "Scope, state, status, and defaults." }],
    },
  ],
  sections: {
    overview: makeOverviewSection({
      fields: [
        { key: "scope", label: "Scope", format: (v) => (v === "state" ? "State-specific" : "Generic") },
        { key: "state", label: "State" },
        { key: "status", label: "Status" },
        { key: "version", label: "Version", meta: true, format: (v) => (v ? `v${v}` : "—") },
        { key: "createdAt", label: "Created", format: (v) => formatDate(v) },
        { key: "tokens", label: "Merge fields used", format: (_v, r) => String(tokensIn(r.body).size) },
        { key: "clauseCount", label: "Library clauses", format: (_v, r) => String(metaList(r, "clauseLibrary").length) },
        {
          key: "disclosureCount",
          label: "Disclosures",
          format: (_v, r) => {
            const list = metaList(r, "disclosures");
            return isState(r) ? `${list.filter((d) => d.done).length}/${list.length} included` : "—";
          },
        },
      ],
    }),
    body: makeNotesSection({
      field: "body",
      placeholder: "Lease template text — use {{tenant.name}}, {{lease.rent}}, {{lease.start}} and the other catalog placeholders…",
      meta: false,
      mono: true,
    }),
    catalog: CatalogSection,
    mergeFields: makeMetaListSection({
      field: "mergeFields",
      singular: "merge field",
      icon: Braces,
      primaryPlaceholder: "e.g. {{parking_space}}",
      secondary: { key: "sample", label: "Sample value", placeholder: "Value, e.g. P-12" },
    }),
    clauses: ClauseLibrarySection,
    preview: PreviewSection,
    requirements: stateOnly(
      makeMetaListSection({ field: "requirements", singular: "requirement", icon: Scale, primaryPlaceholder: "e.g. Security deposit cap" }),
      Scale,
      "State requirements apply to state-specific templates",
    ),
    disclosures: stateOnly(
      makeMetaListSection({ field: "disclosures", singular: "disclosure", icon: ClipboardList, primaryPlaceholder: "e.g. Lead-based paint disclosure", check: true }),
      ClipboardList,
      "Disclosures apply to state-specific templates",
    ),
    usage,
    versions: makeMetaListSection({ field: "versions", singular: "version note", icon: History, primaryPlaceholder: "e.g. v3 — updated pet clause", secondary: { key: "date", label: "Date", placeholder: "e.g. Oct 16, 2026" } }),
    documents: DocumentsSection,
    activity: ActivitySection,
    settings: makeFieldsSection([
      { key: "scope", label: "Scope", type: "select", options: SCOPE_OPTIONS },
      { key: "state", label: "State (2-letter)", type: "text", placeholder: "e.g. TX" },
      { key: "status", label: "Status", type: "select", options: filterOptions(TEMPLATE_STATUS_MAP).slice(1) },
      { key: "leaseType", label: "For lease type", type: "select", meta: true, options: LEASE_TYPE_OPTIONS },
      { key: "language", label: "Language", type: "select", meta: true, options: toOptions(["English", "Spanish", "French", "Chinese", "Vietnamese"]) },
      { key: "defaultTermMonths", label: "Default term (months)", type: "number", meta: true },
      { key: "legalReviewedOn", label: "Legal review on", type: "date", meta: true },
      { key: "legalReviewer", label: "Reviewed by", type: "text", meta: true },
      { key: "isDefault", label: "Default template for new leases", type: "switch", meta: true },
    ]),
  },
};

export function TemplatesScreen() {
  return <EntityListScreen config={templatesConfig} />;
}

export default TemplatesScreen;
