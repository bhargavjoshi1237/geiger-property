"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { LayoutDashboard, BookOpen, ArrowLeftRight, Clock, Loader2, ListPlus } from "lucide-react";

import { EmptyState, StatusPill } from "@/components/internal/shared/screen_kit";
import { Button } from "@/components/ui/button";
import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { glAccountsLayer } from "@/lib/supabase/gl_accounts";
import { transactionsLayer } from "@/lib/supabase/transactions";
import {
  makeFieldsSection,
  makeOverviewSection,
  makeNotesSection,
} from "@/components/internal/screens/entity/sections/factories";
import {
  GL_STATUS_MAP,
  GL_TYPE_MAP,
  GL_TYPES,
  STANDARD_GL_ACCOUNTS,
  filterOptions,
  optionsOf,
  currency,
  money,
  formatDate,
  signedAmount,
} from "./shared";
import { SectionLoading, SummaryTiles } from "./sections";

// Chart of Accounts — general-ledger accounts over `property.gl_accounts`.
// Transactions, bills, and charges reference an account by its "number · name"
// label, so the Ledger tab lists entries posted with that label.

const TYPE_OPTIONS = optionsOf(GL_TYPES);
const STATUS_OPTIONS = filterOptions(GL_STATUS_MAP).slice(1);

const VIEW_LABELS = { Asset: "Assets", Liability: "Liabilities", Equity: "Equity", Income: "Income", Expense: "Expenses" };

const accountLabel = (a) => (a.number ? `${a.number} · ${a.name}` : a.name);
const byNumber = (a, b) => String(a.number || "").localeCompare(String(b.number || ""), undefined, { numeric: true });

// One-click seed of a standard property-management chart (shown only when empty).
function SeedButton({ reload }) {
  const [busy, setBusy] = useState(false);
  const seed = async () => {
    setBusy(true);
    const results = await Promise.all(
      STANDARD_GL_ACCOUNTS.map((a) => glAccountsLayer.create({ ...a, id: crypto.randomUUID(), status: "Active" })),
    );
    setBusy(false);
    const ok = results.filter(Boolean).length;
    if (ok) toast.success(`Added ${ok} standard accounts.`);
    if (ok < results.length) toast.error(`Couldn't add ${results.length - ok} accounts.`);
    reload();
  };
  return (
    <Button variant="outline" className="border-border bg-surface-card" disabled={busy} onClick={seed}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ListPlus className="h-4 w-4" />}
      Add standard accounts
    </Button>
  );
}

// Entries posted to this account (matched on its "number · name" label).
function LedgerSection({ item }) {
  const [rows, setRows] = useState(null);
  const label = accountLabel(item);
  useEffect(() => {
    let alive = true;
    transactionsLayer.list({ account: label }).then((r) => alive && setRows(r ?? []));
    return () => {
      alive = false;
    };
  }, [label]);

  if (rows === null) return <SectionLoading />;
  const live = rows.filter((r) => r.status !== "Void");
  const net = live.reduce((s, r) => s + signedAmount(r), 0);

  return (
    <div className="space-y-4">
      <SummaryTiles
        items={[
          { label: "Entries", value: String(live.length) },
          { label: "Net activity", value: currency(net), className: net < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400" },
          { label: "Last entry", value: formatDate(live.map((r) => r.txnDate).filter(Boolean).sort().at(-1)) },
        ]}
      />
      {rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface-subtle">
          <EmptyState
            icon={ArrowLeftRight}
            title="No entries yet"
            description={`Transactions posted to "${label}" will appear here.`}
          />
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface-subtle">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{r.name}</p>
                <p className="truncate text-xs text-text-secondary">
                  {[formatDate(r.txnDate), r.txnType, r.status].filter(Boolean).join(" · ")}
                </p>
              </div>
              <span
                className={`shrink-0 text-sm font-semibold tabular-nums ${
                  r.txnType === "Income" ? "text-emerald-600 dark:text-emerald-400" : r.txnType === "Expense" ? "text-red-600 dark:text-red-400" : "text-text-secondary"
                }`}
              >
                {r.txnType === "Income" ? "+" : r.txnType === "Expense" ? "−" : ""}
                {money(r.amount)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const glConfig = {
  key: "account",
  singular: "Account",
  plural: "Accounts",
  title: "Chart of Accounts",
  description:
    "The general-ledger accounts every transaction, bill, and charge is posted to — assets, liabilities, equity, income, and expenses.",
  icon: BookOpen,
  titleField: "name",
  searchFields: ["name", "number", "accountType", "description"],
  data: glAccountsLayer.data,
  rowsLoader: async () => ((await glAccountsLayer.list()) ?? []).sort(byNumber),

  statusMap: GL_STATUS_MAP,
  statusFilterOptions: filterOptions(GL_STATUS_MAP),

  views: [
    { value: "all", label: "All" },
    ...GL_TYPES.map((t) => ({
      value: t,
      label: VIEW_LABELS[t],
      filter: (r) => r.accountType === t,
      createDefaults: { accountType: t },
    })),
  ],

  headerActions: ({ rows, reload }) => (rows.length === 0 ? <SeedButton reload={reload} /> : null),

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
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{r.name}</span>
          {r.description ? <span className="text-xs text-text-secondary">{r.description}</span> : null}
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
  ],

  stats: (rows) => {
    const count = (t) => rows.filter((r) => r.accountType === t).length;
    return [
      { label: "Accounts", value: String(rows.length), footer: `${rows.filter((r) => r.status === "Active").length} active` },
      { label: "Balance sheet", value: String(count("Asset") + count("Liability") + count("Equity")), footer: "Assets, liabilities & equity" },
      { label: "Income", value: String(count("Income")), footer: "Income accounts" },
      { label: "Expense", value: String(count("Expense")), footer: "Expense accounts" },
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
    ...(draft.accountType ? { accountType: draft.accountType } : {}),
    status: "Active",
  }),

  headerMeta: (r) => [r.number, r.accountType].filter(Boolean).join(" · "),

  navGroups: [
    {
      group: null,
      items: [
        { key: "overview", label: "Overview", icon: LayoutDashboard, desc: "A snapshot of this account." },
      ],
    },
    {
      group: "Account",
      items: [
        { key: "details", label: "Details", icon: BookOpen, desc: "Number, name, type, and status." },
        { key: "ledger", label: "Ledger", icon: ArrowLeftRight, desc: "Transactions posted to this account." },
        { key: "activity", label: "Activity", icon: Clock, desc: "Notes and history." },
      ],
    },
  ],
  sections: {
    overview: makeOverviewSection({
      fields: [
        { key: "number", label: "Number" },
        { key: "accountType", label: "Type" },
        { key: "status", label: "Status" },
        { key: "description", label: "Description" },
      ],
      note: "Renaming or renumbering an account doesn't update entries already posted under the old label.",
    }),
    details: makeFieldsSection([
      { key: "number", label: "Account number", type: "text" },
      { key: "name", label: "Account name", type: "text" },
      { key: "accountType", label: "Type", type: "select", options: TYPE_OPTIONS },
      { key: "status", label: "Status", type: "select", options: STATUS_OPTIONS },
      { key: "description", label: "Description", type: "textarea" },
    ]),
    ledger: LedgerSection,
    activity: makeNotesSection({ field: "activityNotes", placeholder: "Log a note about this account…" }),
  },
};

export function ChartOfAccountsScreen() {
  return <EntityListScreen config={glConfig} />;
}

export default ChartOfAccountsScreen;
