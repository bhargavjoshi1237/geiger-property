"use client";

import { useState } from "react";
import { toast } from "sonner";
import { LayoutDashboard, BookOpen, ArrowLeftRight, Clock, Loader2, ListPlus, ShieldCheck } from "lucide-react";

import { StatusPill } from "@/components/internal/shared/screen_kit";
import { Badge } from "@geiger/ui/badge";
import { Button } from "@geiger/ui/button";
import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { glAccountsLayer, glAccountIdOptions } from "@/lib/supabase/gl_accounts";
import { ensureDefaultChart, ledgerBalances, ledgerErrorMessage } from "@/lib/supabase/ledger";
import {
  makeFieldsSection,
  makeOverviewSection,
  makeNotesSection,
} from "@/components/internal/screens/entity/sections/factories";
import { makeLedgerSection } from "./ledger_section";
import {
  GL_STATUS_MAP,
  GL_TYPE_MAP,
  GL_TYPES,
  GL_SUBTYPES,
  GL_SUBTYPE_LABEL,
  filterOptions,
  optionsOf,
  currency,
  money,
} from "./shared";

// Chart of Accounts — general-ledger accounts over `property.gl_accounts`, with
// type/subtype, trust flag and parent hierarchy. Balances come from the
// double-entry ledger; "Add default accounts" seeds the standard chart.

const TYPE_OPTIONS = optionsOf(GL_TYPES);
const STATUS_OPTIONS = filterOptions(GL_STATUS_MAP).slice(1);
const VIEW_LABELS = { Asset: "Assets", Liability: "Liabilities", Equity: "Equity", Income: "Income", Expense: "Expenses" };
const DEFAULT_SUBTYPE = { Asset: "other_asset", Liability: "other_liability", Equity: "equity", Income: "income", Expense: "expense" };

const byNumber = (a, b) => String(a.number || "").localeCompare(String(b.number || ""), undefined, { numeric: true });

// Parents first, each followed by its children (depth stamped for indenting).
function orderTree(rows) {
  const ids = new Set(rows.map((r) => r.id));
  const kids = new Map();
  for (const r of rows) {
    const p = r.parentId && ids.has(r.parentId) ? r.parentId : "";
    kids.set(p, [...(kids.get(p) || []), r]);
  }
  const out = [];
  const walk = (parent, depth) => {
    for (const r of (kids.get(parent) || []).sort(byNumber)) {
      out.push({ ...r, depth });
      if (depth < 5) walk(r.id, depth + 1);
    }
  };
  walk("", 0);
  return out;
}

// Idempotent seed of the standard property-management chart.
function SeedButton({ reload }) {
  const [busy, setBusy] = useState(false);
  const seed = async () => {
    setBusy(true);
    const n = await ensureDefaultChart();
    setBusy(false);
    if (n === null) {
      toast.error(ledgerErrorMessage() || "Couldn't add the default accounts.");
      return;
    }
    toast.success(n ? `Added ${n} default accounts.` : "The default accounts are already in place.");
    reload();
  };
  return (
    <Button variant="outline" className="border-border bg-surface-card" disabled={busy} onClick={seed}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ListPlus className="h-4 w-4" />}
      Add Default Accounts
    </Button>
  );
}

// Parent picker: any other account of the same type.
const parentOptions = (item) => async () =>
  (await glAccountIdOptions({ types: item?.accountType ? [item.accountType] : undefined }))
    .filter((o) => o.value !== item?.id)
    .map((o) => ({ value: o.value, label: o.label, patch: {} }));

// Details form; system accounts keep their type and subtype. Built once per
// mount so the parent picker can exclude this account.
function DetailsSection(props) {
  const [Fields] = useState(() =>
    makeFieldsSection([
      { key: "number", label: "Account number", type: "text" },
      { key: "name", label: "Account name", type: "text" },
      { key: "accountType", label: "Type", type: "select", options: TYPE_OPTIONS, disabled: () => isSystem, hint: isSystem ? "System account — type is fixed." : undefined },
      { key: "subtype", label: "Subtype", type: "select", options: GL_SUBTYPES, disabled: (i) => Boolean(i?.isSystem), hint: "Drives the sub-ledgers (receivable, payable, trust cash…)." },
      { key: "parentId", label: "Parent account", type: "relation", load: parentOptions(props.item), placeholder: "Top level" },
      { key: "isTrust", label: "Trust account", type: "switch", hint: "Holds owner or resident funds — kept separate from operating money." },
      { key: "status", label: "Status", type: "select", options: STATUS_OPTIONS },
      { key: "systemKey", label: "System key", type: "readonly", showIf: (i) => Boolean(i.systemKey) },
      { key: "description", label: "Description", type: "textarea" },
    ]),
  );
  return <Fields {...props} />;
}

const glConfig = {
  key: "account",
  singular: "Account",
  plural: "Accounts",
  title: "Chart of Accounts",
  description:
    "The general-ledger accounts every charge, payment, bill and distribution posts to — with trust accounts kept apart from operating money.",
  icon: BookOpen,
  titleField: "name",
  searchFields: ["name", "number", "accountType", "subtype", "description"],
  data: glAccountsLayer.data,
  // Accounts in tree order, each carrying its ledger balance.
  rowsLoader: async () => {
    const [rows, bal] = await Promise.all([glAccountsLayer.list(), ledgerBalances({})]);
    const byId = new Map((bal?.byAccount || []).map((b) => [b.glAccountId, b.balance]));
    return orderTree((rows ?? []).map((r) => ({ ...r, ledgerBalance: byId.get(r.id) ?? 0 })));
  },

  statusMap: GL_STATUS_MAP,
  statusFilterOptions: filterOptions(GL_STATUS_MAP),

  views: [
    { value: "all", label: "All" },
    ...GL_TYPES.map((t) => ({
      value: t,
      label: VIEW_LABELS[t],
      filter: (r) => r.accountType === t,
      createDefaults: { accountType: t, subtype: DEFAULT_SUBTYPE[t] },
    })),
    { value: "trust", label: "Trust", filter: (r) => r.isTrust },
  ],

  headerActions: ({ reload }) => <SeedButton reload={reload} />,

  columns: [
    {
      key: "number",
      header: "Number",
      className: "w-24 font-mono text-sm tabular-nums text-text-secondary",
      render: (r) => r.number || "—",
    },
    {
      key: "name",
      header: "Account",
      render: (r) => (
        <div className="flex flex-col gap-1" style={{ paddingLeft: `${(r.depth || 0) * 16}px` }}>
          <span className="flex flex-wrap items-center gap-1.5 font-medium text-foreground">
            {r.name}
            {r.isTrust ? (
              <Badge variant="neutral">
                <ShieldCheck /> Trust
              </Badge>
            ) : null}
            {r.isSystem ? <Badge variant="outline">System</Badge> : null}
          </span>
          <span className="text-xs text-text-secondary">{GL_SUBTYPE_LABEL[r.subtype] || r.description || "—"}</span>
        </div>
      ),
    },
    {
      key: "accountType",
      header: "Type",
      render: (r) => (r.accountType ? <StatusPill status={r.accountType} map={GL_TYPE_MAP} /> : "—"),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusPill status={r.status} map={GL_STATUS_MAP} />,
    },
    {
      key: "ledgerBalance",
      header: "Balance",
      align: "right",
      className: "text-right font-semibold tabular-nums text-foreground",
      render: (r) => money(r.ledgerBalance),
    },
  ],

  stats: (rows) => {
    const sum = (t) => rows.filter((r) => r.accountType === t).reduce((s, r) => s + (Number(r.ledgerBalance) || 0), 0);
    const trust = rows.filter((r) => r.isTrust && r.subtype === "cash").reduce((s, r) => s + (Number(r.ledgerBalance) || 0), 0);
    return [
      { label: "Accounts", value: String(rows.length), footer: `${rows.filter((r) => r.status === "Active").length} active` },
      { label: "Assets", value: currency(sum("Asset")), footer: `${currency(sum("Liability"))} liabilities` },
      { label: "Trust cash", value: currency(trust), footer: "Held for owners & residents" },
      { label: "Net income", value: currency(sum("Income") - sum("Expense")), footer: "All periods" },
    ];
  },

  createDraft: { name: "", number: "", accountType: "" },
  createFields: [
    { key: "name", label: "Account name", type: "text", placeholder: "e.g. Landscaping" },
    { key: "number", label: "Account number", type: "text", placeholder: "e.g. 5600" },
    { key: "accountType", label: "Type", type: "select", options: TYPE_OPTIONS, placeholder: "Select a type…" },
  ],
  // Type is only set when picked, so a type view's default applies otherwise.
  newRow: (draft) => ({
    name: draft.name.trim(),
    number: draft.number.trim(),
    ...(draft.accountType ? { accountType: draft.accountType, subtype: DEFAULT_SUBTYPE[draft.accountType] } : {}),
    isTrust: false,
    isSystem: false,
    status: "Active",
  }),

  headerMeta: (r) => [r.number, r.accountType, GL_SUBTYPE_LABEL[r.subtype], r.isTrust ? "Trust" : null].filter(Boolean).join(" · "),

  navGroups: [
    {
      group: null,
      items: [{ key: "overview", label: "Overview", icon: LayoutDashboard, desc: "A snapshot of this account." }],
    },
    {
      group: "Account",
      items: [
        { key: "details", label: "Details", icon: BookOpen, desc: "Number, name, type, subtype, parent, and trust flag." },
        { key: "ledger", label: "Ledger", icon: ArrowLeftRight, desc: "Every line posted to this account, with a running balance." },
        { key: "activity", label: "Activity", icon: Clock, desc: "Notes and history." },
      ],
    },
  ],
  sections: {
    overview: makeOverviewSection({
      fields: [
        { key: "number", label: "Number" },
        { key: "accountType", label: "Type" },
        { key: "subtype", label: "Subtype", format: (v) => GL_SUBTYPE_LABEL[v] || "—" },
        { key: "isTrust", label: "Trust account", format: (v) => (v ? "Yes" : "No") },
        { key: "ledgerBalance", label: "Balance", format: (v) => money(v) },
        { key: "status", label: "Status" },
        { key: "description", label: "Description" },
      ],
      note: "Entries reference this account by id, so renaming or renumbering it never orphans posted activity.",
    }),
    details: DetailsSection,
    ledger: makeLedgerSection({ scope: "account", emptyDescription: "Lines posted to this account appear here." }),
    activity: makeNotesSection({ field: "activityNotes", placeholder: "Log a note about this account…" }),
  },
};

export function ChartOfAccountsScreen() {
  return <EntityListScreen config={glConfig} />;
}

export default ChartOfAccountsScreen;
