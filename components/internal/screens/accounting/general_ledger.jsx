"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Ban, BookOpen, ListPlus, Loader2, Plus, Scale } from "lucide-react";

import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import {
  DataTable,
  EmptyState,
  ListLoading,
  ScreenHeader,
  SearchInput,
  StatsBar,
  StatusPill,
  Toolbar,
} from "@/components/internal/shared/screen_kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import {
  ensureDefaultChart,
  ledgerErrorMessage,
  listLedger,
  listLedgerAccounts,
  listLedgerEntries,
} from "@/lib/supabase/ledger";
import { SOURCE_LABELS, accountLabel, indexAccounts, round2, summarize } from "@/lib/ledger/postings";
import { RoleGate } from "@/components/internal/shared/role_gate";
import { JournalEntryDialog, NO_POST, useCanPost, useCanVoid, VoidEntryDialog } from "./ledger_dialogs";
import { currency, formatDate, money } from "./shared";

// General Ledger — the journal of every posted entry (charges, payments, bills,
// owner funds, journal entries) with void, a manual journal editor, and a
// trial balance computed from the ledger lines.

const ENTRY_STATUS_MAP = {
  posted: { label: "Posted", variant: "success" },
  void: { label: "Void", variant: "neutral" },
  reversal: { label: "Reversal", variant: "warning" },
};

const TYPE_OPTIONS = [
  { value: "all", label: "All types" },
  ...Object.entries(SOURCE_LABELS).map(([value, label]) => ({ value, label })),
];

const TABS = [
  { value: "journal", label: "Journal" },
  { value: "trial", label: "Trial balance" },
];

const DIM_LABELS = {
  propertyId: "Property",
  unitId: "Unit",
  leaseId: "Lease",
  tenantId: "Tenant",
  ownerId: "Owner",
  vendorId: "Vendor",
  bankAccountId: "Bank",
  jobId: "Job",
};

const entryStatus = (e) => (e.status === "void" ? "void" : e.reversalOf ? "reversal" : "posted");

// Journal entry detail: its lines, accounts and dimensions.
function EntryDialog({ entry, accounts, onOpenChange, onVoid, canVoid }) {
  const open = Boolean(entry);
  const dr = round2((entry?.lines || []).reduce((s, l) => s + l.debit, 0));
  const cr = round2((entry?.lines || []).reduce((s, l) => s + l.credit, 0));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{entry?.memo || SOURCE_LABELS[entry?.sourceType] || "Journal entry"}</DialogTitle>
          <DialogDescription>
            {entry ? `${formatDate(entry.date)} · ${SOURCE_LABELS[entry.sourceType] || entry.sourceType}` : ""}
          </DialogDescription>
        </DialogHeader>
        {entry ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <StatusPill status={entryStatus(entry)} map={ENTRY_STATUS_MAP} />
              {entry.idempotencyKey ? <span className="truncate text-xs text-text-tertiary">Key {entry.idempotencyKey}</span> : null}
            </div>
            <DataTable
              columns={[
                {
                  key: "account",
                  header: "Account",
                  render: (l) => (
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate font-medium text-foreground">
                        {accountLabel(accounts?.byId.get(l.glAccountId)) || "Unknown account"}
                      </span>
                      <span className="truncate text-xs text-text-secondary">
                        {[
                          l.memo && l.memo !== entry.memo ? l.memo : null,
                          ...Object.keys(DIM_LABELS).filter((k) => l[k]).map((k) => DIM_LABELS[k]),
                          l.cleared ? "Cleared" : null,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </span>
                    </div>
                  ),
                },
                { key: "debit", header: "Debit", align: "right", className: "text-right tabular-nums text-foreground", render: (l) => (l.debit ? money(l.debit) : "—") },
                { key: "credit", header: "Credit", align: "right", className: "text-right tabular-nums text-foreground", render: (l) => (l.credit ? money(l.credit) : "—") },
              ]}
              data={entry.lines}
              getRowKey={(l) => l.id}
            />
            <div className="flex items-center justify-between">
              <p className={`text-sm tabular-nums ${dr === cr ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                Debits {money(dr)} · Credits {money(cr)}
              </p>
              {canVoid && entryStatus(entry) === "posted" ? (
                <Button
                  variant="outline"
                  className="border-border bg-surface-card text-red-600 hover:bg-red-500/10 dark:text-red-300"
                  onClick={() => onVoid(entry)}
                >
                  <Ban className="h-4 w-4" /> Void Entry
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

// Trial balance over every ledger line in the project.
function TrialBalance({ reloadKey }) {
  const [summary, setSummary] = useState(null);
  useEffect(() => {
    let alive = true;
    Promise.all([listLedger({}), listLedgerAccounts()]).then(([lines, accounts]) => {
      if (alive) setSummary(summarize(lines || [], accounts || indexAccounts([])));
    });
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  if (!summary) return <ListLoading label="Loading trial balance" />;
  const rows = summary.byAccount;
  const dr = round2(rows.reduce((s, r) => s + r.debit, 0));
  const cr = round2(rows.reduce((s, r) => s + r.credit, 0));
  const data = rows.length ? [...rows, { glAccountId: "__total", name: "Total", total: true, debit: dr, credit: cr }] : [];

  return (
    <DataTable
      columns={[
        { key: "number", header: "Number", className: "w-24 font-mono text-sm tabular-nums text-text-secondary", render: (r) => (r.total ? "" : r.number || "—") },
        {
          key: "name",
          header: "Account",
          render: (r) => (
            <span className={r.total ? "font-semibold text-foreground" : "font-medium text-foreground"}>
              {r.name}
              {r.isTrust ? <span className="ml-2 text-xs text-text-tertiary">Trust</span> : null}
            </span>
          ),
        },
        { key: "type", header: "Type", className: "text-sm text-text-secondary", render: (r) => r.accountType || "" },
        { key: "debit", header: "Debits", align: "right", className: "text-right tabular-nums text-foreground", render: (r) => money(r.debit) },
        { key: "credit", header: "Credits", align: "right", className: "text-right tabular-nums text-foreground", render: (r) => money(r.credit) },
        {
          key: "balance",
          header: "Balance",
          align: "right",
          className: "text-right font-semibold tabular-nums",
          render: (r) =>
            r.total ? (
              <span className={dr === cr ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>
                {dr === cr ? "In balance" : `Off by ${money(Math.abs(dr - cr))}`}
              </span>
            ) : (
              <span className="text-foreground">{money(r.balance)}</span>
            ),
        },
      ]}
      data={data}
      getRowKey={(r) => r.glAccountId}
      empty={
        <div className="rounded-xl border border-border bg-surface-subtle">
          <EmptyState icon={Scale} title="Nothing posted yet" description="Account totals appear here once entries are posted." />
        </div>
      }
    />
  );
}

export function GeneralLedgerScreen() {
  const [tab, setTab] = useState("journal");
  const [entries, setEntries] = useState(null);
  const [accounts, setAccounts] = useState(null);
  const [type, setType] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey((k) => k + 1);
  const [open, setOpen] = useState(null);
  const [voiding, setVoiding] = useState(null);
  const [journalOpen, setJournalOpen] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const canPost = useCanPost();
  const canVoid = useCanVoid();

  useEffect(() => {
    let alive = true;
    Promise.all([
      listLedgerEntries({ from: from || undefined, to: to || undefined, sourceType: type === "all" ? undefined : type, limit: 500 }),
      listLedgerAccounts(),
    ]).then(([e, a]) => {
      if (!alive) return;
      setEntries(e || []);
      setAccounts(a || indexAccounts([]));
    });
    return () => {
      alive = false;
    };
  }, [type, from, to, reloadKey]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries || [];
    return (entries || []).filter((e) =>
      [e.memo, SOURCE_LABELS[e.sourceType], ...e.lines.map((l) => accountLabel(accounts?.byId.get(l.glAccountId)))]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [entries, search, accounts]);

  const stats = useMemo(() => {
    const list = entries || [];
    const posted = list.filter((e) => entryStatus(e) === "posted");
    const lines = list.flatMap((e) => e.lines);
    const dr = round2(lines.reduce((s, l) => s + l.debit, 0));
    const cr = round2(lines.reduce((s, l) => s + l.credit, 0));
    return [
      { label: "Entries", value: String(list.length), footer: list.length >= 500 ? "Showing the latest 500" : "In this range" },
      { label: "Total posted", value: currency(posted.reduce((s, e) => s + e.total, 0)), footer: `${posted.length} live entries` },
      { label: "Voided", value: String(list.filter((e) => e.status === "void").length), footer: `${list.filter((e) => e.reversalOf).length} reversals` },
      { label: "Trial check", value: dr === cr ? "Balanced" : "Unbalanced", footer: `Debits ${currency(dr)} · Credits ${currency(cr)}` },
    ];
  }, [entries]);

  const seed = async () => {
    setSeeding(true);
    const n = await ensureDefaultChart();
    setSeeding(false);
    if (n === null) {
      toast.error(ledgerErrorMessage() || "Couldn't seed the default chart.");
      return;
    }
    toast.success(n ? `Added ${n} default accounts.` : "The default chart is already in place.");
    reload();
  };

  const columns = [
    { key: "date", header: "Date", className: "whitespace-nowrap text-sm tabular-nums text-text-secondary", render: (e) => formatDate(e.date) },
    {
      key: "memo",
      header: "Entry",
      render: (e) => (
        <div className="flex min-w-0 flex-col gap-1">
          <span className="truncate font-medium text-foreground">{e.memo || SOURCE_LABELS[e.sourceType]}</span>
          <span className="truncate text-xs text-text-secondary">{SOURCE_LABELS[e.sourceType] || e.sourceType}</span>
        </div>
      ),
    },
    {
      key: "accounts",
      header: "Accounts",
      className: "max-w-xs text-sm text-text-secondary",
      render: (e) => (
        <span className="line-clamp-2">
          {[...new Set(e.lines.map((l) => accountLabel(accounts?.byId.get(l.glAccountId))).filter(Boolean))].join(", ") || "—"}
        </span>
      ),
    },
    { key: "status", header: "Status", render: (e) => <StatusPill status={entryStatus(e)} map={ENTRY_STATUS_MAP} /> },
    { key: "total", header: "Amount", align: "right", className: "text-right font-semibold tabular-nums text-foreground", render: (e) => money(e.total) },
    {
      key: "actions",
      header: "",
      align: "right",
      className: "w-10 text-right",
      render: (e) =>
        canVoid && entryStatus(e) === "posted" ? (
          <div onClick={(ev) => ev.stopPropagation()}>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-300"
              onClick={() => setVoiding(e)}
              aria-label="Void entry"
            >
              <Ban className="h-4 w-4" />
            </Button>
          </div>
        ) : null,
    },
  ];

  const filtersOn = type !== "all" || from || to || search;

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="General Ledger"
        description="Every balanced entry behind your books — charges, payments, bills and owner funds. Fix mistakes by voiding; nothing is ever edited in place."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" className="border-border bg-surface-card" disabled={seeding} onClick={seed}>
              {seeding ? <Loader2 className="h-4 w-4 animate-spin" /> : <ListPlus className="h-4 w-4" />}
              Seed Default Chart
            </Button>
            <RoleGate allowed={canPost} reason={NO_POST}>
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={!canPost} onClick={() => setJournalOpen(true)}>
                <Plus className="h-4 w-4" /> New Journal Entry
              </Button>
            </RoleGate>
          </div>
        }
      />

      <StatsBar stats={stats} />

      {/* The Journal / Trial balance switch leads the filter row; the journal's own filters follow it */}
      <Toolbar>
        <div className="flex flex-wrap items-center gap-2">
          <FilterDropdown value={tab} onValueChange={setTab} options={TABS} height="h-9" />
          {tab === "journal" ? (
            <>
              <FilterDropdown value={type} onValueChange={setType} options={TYPE_OPTIONS} height="h-9" />
              <Input type="date" aria-label="From date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-40 bg-surface-card" />
              <span className="text-sm text-text-tertiary">to</span>
              <Input type="date" aria-label="To date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-40 bg-surface-card" />
            </>
          ) : null}
        </div>
        {tab === "journal" ? (
          <SearchInput value={search} onChange={setSearch} placeholder="Search memo or account…" className="w-full sm:max-w-xs" />
        ) : null}
      </Toolbar>

      {tab === "trial" ? (
        <TrialBalance reloadKey={reloadKey} />
      ) : (
        <>
          {entries === null ? (
            <ListLoading label="Loading journal" />
          ) : (
            <DataTable
              columns={columns}
              data={filtered}
              getRowKey={(e) => e.id}
              onRowClick={setOpen}
              empty={
                <div className="rounded-xl border border-border bg-surface-subtle">
                  <EmptyState
                    icon={BookOpen}
                    title={entries.length || filtersOn ? "No entries match your filters" : "No entries yet"}
                    description={
                      entries.length || filtersOn
                        ? "Try another type, date range or search."
                        : "Charges, payments, bills and journal entries appear here as they post."
                    }
                    action={
                      filtersOn ? (
                        <Button
                          variant="outline"
                          className="border-border bg-surface-card"
                          onClick={() => {
                            setType("all");
                            setFrom("");
                            setTo("");
                            setSearch("");
                          }}
                        >
                          Clear Filters
                        </Button>
                      ) : canPost ? (
                        <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => setJournalOpen(true)}>
                          <Plus className="h-4 w-4" /> New Journal Entry
                        </Button>
                      ) : null
                    }
                  />
                </div>
              }
            />
          )}
        </>
      )}

      <EntryDialog
        entry={open}
        accounts={accounts}
        canVoid={canVoid}
        onOpenChange={(o) => !o && setOpen(null)}
        onVoid={(e) => {
          setOpen(null);
          setVoiding(e);
        }}
      />
      <VoidEntryDialog entry={voiding} onOpenChange={(o) => !o && setVoiding(null)} onVoided={reload} />
      <JournalEntryDialog open={journalOpen} onOpenChange={setJournalOpen} onPosted={reload} />
    </MainScreenWrapper>
  );
}

export default GeneralLedgerScreen;
