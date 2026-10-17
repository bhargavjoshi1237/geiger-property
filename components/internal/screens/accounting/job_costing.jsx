"use client";

import { useEffect, useState } from "react";
import { LayoutDashboard, Hammer, ReceiptText, FileText, Gauge, Clock } from "lucide-react";

import { DataTable, EmptyState, StatusPill } from "@/components/internal/shared/screen_kit";
import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { costJobsLayer } from "@/lib/supabase/cost_jobs";
import { billsLayer } from "@/lib/supabase/bills";
import { unitTurnsLayer } from "@/lib/supabase/unit_turns";
import { listLedger } from "@/lib/supabase/ledger";
import { propertyOptions, unitOptions } from "@/lib/supabase/options";
import { accountLabel, round2 } from "@/lib/ledger/postings";
import {
  makeFieldsSection,
  makeOverviewSection,
  makeNotesSection,
} from "@/components/internal/screens/entity/sections/factories";
import { makeRelatedSection } from "@/components/internal/screens/entity/sections/related_section";
import { filterOptions, optionsOf, currency, money, formatDate } from "./shared";
import { makeLedgerSection } from "./ledger_section";
import { SectionLoading, SummaryTiles } from "./sections";

// Job Costing — unit turns, capital projects and repair projects over
// `property.cost_jobs`. Costs are ledger lines tagged with job_id (expense or
// capitalized asset debits less credits); bills can be tagged to a job too.

const JOB_STATUS_MAP = {
  Open: { label: "Open", variant: "info" },
  "In progress": { label: "In progress", variant: "warning" },
  Closed: { label: "Closed", variant: "neutral" },
};
const JOB_KINDS = ["Unit turn", "Capital project", "Repair project", "Other"];
const STATUS_OPTIONS = filterOptions(JOB_STATUS_MAP).slice(1);
const COST_TYPES = ["Expense", "Asset"];

// Net cost of a ledger line toward a job (debits − credits on cost accounts).
const costOf = (l) => (COST_TYPES.includes(l.account?.accountType) ? (Number(l.debit) || 0) - (Number(l.credit) || 0) : 0);

// Jobs joined with their ledger cost to date.
async function loadJobs() {
  const [jobs, lines] = await Promise.all([costJobsLayer.list(), listLedger({ hasJob: true })]);
  const cost = new Map();
  for (const l of lines || []) if (l.jobId) cost.set(l.jobId, round2((cost.get(l.jobId) || 0) + costOf(l)));
  return (jobs || []).map((j) => ({ ...j, actualCost: cost.get(j.id) || 0 }));
}

async function unitTurnOptions() {
  const rows = (await unitTurnsLayer.list()) ?? [];
  return rows.map((t) => ({ value: t.id, label: t.name || "Unit turn", patch: {} }));
}

// Budget vs actual for this job, broken down by GL account.
function BudgetSection({ item }) {
  const [lines, setLines] = useState(null);
  useEffect(() => {
    let alive = true;
    listLedger({ jobId: item.id }).then((r) => alive && setLines(r || []));
    return () => {
      alive = false;
    };
  }, [item.id]);
  if (!lines) return <SectionLoading />;

  const per = new Map();
  for (const l of lines) {
    const c = costOf(l);
    if (!c) continue;
    const row = per.get(l.glAccountId) || { id: l.glAccountId, label: accountLabel(l.account) || "Unknown account", type: l.account?.accountType, amount: 0, count: 0 };
    row.amount = round2(row.amount + c);
    row.count += 1;
    per.set(l.glAccountId, row);
  }
  const rows = [...per.values()].sort((a, b) => b.amount - a.amount);
  const actual = round2(rows.reduce((s, r) => s + r.amount, 0));
  const budget = Number(item.budget) || 0;
  const used = budget ? Math.min(100, Math.round((actual / budget) * 100)) : 0;
  const over = budget && actual > budget;

  return (
    <div className="space-y-4">
      <SummaryTiles
        items={[
          { label: "Budget", value: budget ? money(budget) : "—" },
          { label: "Cost to date", value: money(actual) },
          { label: over ? "Over budget" : "Remaining", value: budget ? money(Math.abs(budget - actual)) : "—", className: over ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400" },
        ]}
      />
      {budget ? (
        <div className="space-y-1.5">
          <div className="h-2 overflow-hidden rounded-full bg-surface-card">
            <div className={`h-full rounded-full ${over ? "bg-red-500" : "bg-emerald-500"}`} style={{ width: `${used}%` }} />
          </div>
          <p className="text-xs text-text-secondary">{budget ? `${Math.round((actual / budget) * 100)}% of budget used` : ""}</p>
        </div>
      ) : null}
      {rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface-subtle">
          <EmptyState icon={Gauge} title="No costs yet" description="Bills and expenses tagged to this job appear here by account." />
        </div>
      ) : (
        <DataTable
          columns={[
            { key: "label", header: "Account", render: (r) => <span className="font-medium text-foreground">{r.label}</span> },
            { key: "type", header: "Type", className: "text-sm text-text-secondary", render: (r) => (r.type === "Asset" ? "Capitalized" : "Expense") },
            { key: "count", header: "Lines", align: "right", className: "text-right tabular-nums text-text-secondary", render: (r) => r.count },
            { key: "amount", header: "Cost", align: "right", className: "text-right font-semibold tabular-nums text-foreground", render: (r) => money(r.amount) },
          ]}
          data={rows}
          getRowKey={(r) => r.id}
        />
      )}
    </div>
  );
}

const BillsSection = makeRelatedSection({
  load: (item) => billsLayer.list({ jobId: item.id }),
  tab: "Bills & Payables",
  plural: "Bills",
  icon: FileText,
  emptyDescription: "Bills tagged to this job in Bills & Payables show up here.",
  columns: [
    {
      key: "name",
      header: "Bill",
      render: (r) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="text-xs text-text-secondary">{r.vendorName || "—"}</span>
        </div>
      ),
    },
    { key: "dueDate", header: "Due", className: "whitespace-nowrap text-sm tabular-nums text-text-secondary", render: (r) => formatDate(r.dueDate) },
    { key: "status", header: "Status", className: "text-sm text-text-secondary", render: (r) => r.status || "—" },
    { key: "amount", header: "Amount", align: "right", className: "text-right font-semibold tabular-nums text-foreground", render: (r) => money(r.amount) },
  ],
  footer: (rows) => (
    <p className="text-sm text-text-secondary">
      {rows.length} bill{rows.length === 1 ? "" : "s"} · {money(rows.reduce((s, r) => s + (Number(r.amount) || 0), 0))} billed
    </p>
  ),
});

const variance = (r) => (Number(r.budget) || 0) - (Number(r.actualCost) || 0);

const jobsConfig = {
  key: "costJob",
  singular: "Job",
  plural: "Jobs",
  title: "Job Costing",
  description:
    "Track what unit turns, capital projects and repair projects actually cost — every bill and expense tagged to a job, against its budget.",
  icon: Hammer,
  titleField: "name",
  searchFields: ["name", "kind", "propertyName", "unit"],
  data: costJobsLayer.data,
  rowsLoader: loadJobs,

  statusMap: JOB_STATUS_MAP,
  statusFilterOptions: filterOptions(JOB_STATUS_MAP),

  views: [
    { value: "all", label: "All" },
    ...JOB_KINDS.map((k) => ({ value: k, label: k === "Other" ? "Other" : `${k}s`, filter: (r) => r.kind === k, createDefaults: { kind: k } })),
  ],

  columns: [
    {
      key: "name",
      header: "Job",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="text-xs text-text-secondary">{[r.kind, r.propertyName, r.unit].filter(Boolean).join(" · ") || "—"}</span>
        </div>
      ),
    },
    { key: "status", header: "Status", render: (r) => <StatusPill status={r.status} map={JOB_STATUS_MAP} /> },
    { key: "budget", header: "Budget", align: "right", className: "text-right tabular-nums text-text-secondary", render: (r) => (Number(r.budget) ? currency(r.budget) : "—") },
    { key: "actualCost", header: "Cost to date", align: "right", className: "text-right tabular-nums text-foreground", render: (r) => currency(r.actualCost) },
    {
      key: "variance",
      header: "Variance",
      align: "right",
      className: "text-right font-semibold tabular-nums",
      render: (r) =>
        Number(r.budget) ? (
          <span className={variance(r) < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}>{currency(variance(r))}</span>
        ) : (
          <span className="text-text-tertiary">—</span>
        ),
    },
  ],

  stats: (rows) => {
    const active = rows.filter((r) => r.status !== "Closed");
    const budget = active.reduce((s, r) => s + (Number(r.budget) || 0), 0);
    const cost = active.reduce((s, r) => s + (Number(r.actualCost) || 0), 0);
    const over = rows.filter((r) => Number(r.budget) && variance(r) < 0);
    return [
      { label: "Active jobs", value: String(active.length), footer: `${rows.length} total` },
      { label: "Active budget", value: currency(budget), footer: "Open + in progress" },
      { label: "Cost to date", value: currency(cost), footer: budget ? `${Math.round((cost / budget) * 100)}% of budget` : "No budgets set" },
      { label: "Over budget", value: String(over.length), footer: currency(over.reduce((s, r) => s - variance(r), 0)) },
    ];
  },

  createDraft: { name: "", kind: "", propertyId: "", propertyName: "", budget: "" },
  createFields: [
    { key: "name", label: "Job name", type: "text", placeholder: "e.g. Unit 4B turn · Oct 2026" },
    { key: "kind", label: "Kind", type: "select", options: optionsOf(JOB_KINDS), placeholder: "Matches the current view…" },
    { key: "propertyId", label: "Property", type: "select", optionsFrom: "properties", placeholder: "Select a property…", emptyLabel: "No properties yet" },
    { key: "budget", label: "Budget", type: "number", placeholder: "0.00" },
  ],
  loadCreateOptions: async () => ({ properties: await propertyOptions() }),
  // Kind is only set when picked, so the active view's default applies otherwise.
  newRow: (draft) => ({
    name: draft.name.trim(),
    ...(draft.kind ? { kind: draft.kind } : {}),
    propertyId: draft.propertyId || "",
    propertyName: draft.propertyName || "",
    budget: Math.abs(Number(draft.budget) || 0),
    status: "Open",
    actualCost: 0,
  }),

  headerMeta: (r) => [r.kind, r.propertyName, r.unit, Number(r.budget) ? `Budget ${currency(r.budget)}` : null].filter(Boolean).join(" · "),

  navGroups: [
    { group: null, items: [{ key: "overview", label: "Overview", icon: LayoutDashboard, desc: "A snapshot of this job." }] },
    {
      group: "Job",
      items: [
        { key: "details", label: "Details", icon: Hammer, desc: "Kind, property, unit, dates, and budget." },
        { key: "budget", label: "Budget vs Actual", icon: Gauge, desc: "Cost to date by account against the budget." },
        { key: "costs", label: "Cost Ledger", icon: ReceiptText, desc: "Every ledger line tagged to this job — post bills here." },
        { key: "bills", label: "Bills", icon: FileText, desc: "Vendor bills tagged to this job." },
        { key: "activity", label: "Activity", icon: Clock, desc: "Notes and history." },
      ],
    },
  ],
  sections: {
    overview: makeOverviewSection({
      fields: [
        { key: "kind", label: "Kind" },
        { key: "propertyName", label: "Property" },
        { key: "unit", label: "Unit" },
        { key: "budget", label: "Budget", format: (v) => (Number(v) ? currency(v) : "—") },
        { key: "actualCost", label: "Cost to date", format: (v) => currency(v) },
        { key: "startsOn", label: "Starts", format: (v) => formatDate(v) },
        { key: "endsOn", label: "Ends", format: (v) => formatDate(v) },
        { key: "status", label: "Status" },
      ],
      note: "Cost to date is the ledger activity tagged to this job (refreshed when the list reloads).",
    }),
    details: makeFieldsSection([
      { key: "name", label: "Job name", type: "text", full: true },
      { key: "kind", label: "Kind", type: "select", options: optionsOf(JOB_KINDS) },
      { key: "status", label: "Status", type: "select", options: STATUS_OPTIONS },
      { key: "propertyId", label: "Property", type: "relation", load: propertyOptions, displayKey: "propertyName" },
      { key: "unitId", label: "Unit", type: "relation", load: unitOptions, displayKey: "unit" },
      { key: "unitTurnId", label: "Unit turn", type: "relation", load: unitTurnOptions, showIf: (i) => i.kind === "Unit turn" },
      { key: "budget", label: "Budget", type: "currency" },
      { key: "startsOn", label: "Start date", type: "date" },
      { key: "endsOn", label: "End date", type: "date" },
      { key: "scope", label: "Scope of work", type: "textarea", meta: true, placeholder: "What this job covers…" },
    ]),
    budget: BudgetSection,
    costs: makeLedgerSection({ scope: "job", emptyDescription: "Post a bill here, or tag bills to this job in Bills & Payables." }),
    bills: BillsSection,
    activity: makeNotesSection({ field: "activityNotes", placeholder: "Log a note about this job…" }),
  },
};

export function JobCostingScreen() {
  return <EntityListScreen config={jobsConfig} />;
}

export default JobCostingScreen;
