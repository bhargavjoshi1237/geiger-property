"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Ban, BookOpen, Copy, FileDown, ListPlus, Loader2, Lock, Plus, Scale, Undo2, Upload } from "lucide-react";

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
import { ListPagination } from "@/components/internal/shared/pagination";
import { Button } from "@geiger/ui/button";
import { Input } from "@geiger/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@geiger/ui/dialog";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import {
  countUnbalancedEntries,
  ensureDefaultChart,
  exportLedgerEntries,
  getLedgerEntry,
  ledgerEntryStats,
  ledgerErrorMessage,
  listLedger,
  listLedgerAccounts,
  listLedgerEntryPage,
  listReversalsOf,
} from "@/lib/supabase/ledger";
import { listProperties } from "@/lib/supabase/properties";
import { listUnits } from "@/lib/supabase/units";
import { ownersLayer } from "@/lib/supabase/owners";
import { vendorsLayer } from "@/lib/supabase/vendors";
import { leasesLayer } from "@/lib/supabase/leases";
import { SOURCE_LABELS, accountLabel, indexAccounts, round2, summarize } from "@/lib/ledger/postings";
import { JOURNAL_EXPORT_COLUMNS, copyDraft, journalToRows, reverseBlock } from "@/lib/ledger/journal_io";
import { RoleGate } from "@/components/internal/shared/role_gate";
import { ExportButton } from "@/components/internal/shared/export_button";
import { AccountingExportDialog } from "@/components/internal/screens/settings/accounting_export";
import { usePermission } from "@/context/rbac-context";
import { JournalEntryDialog, NO_POST, ReverseEntryDialog, useCanPost, useCanVoid, VoidEntryDialog } from "./ledger_dialogs";
import { ClosePeriodWizard, ClosePeriodsPanel, NO_CLOSE, useCanClose } from "./close_periods";
import { JournalImportWizard } from "./journal_import";
import { currency, formatDate, money } from "./shared";

// General Ledger: the journal of every posted entry (charges, payments, bills, owner funds, journal entries) paged on the server, with void,
// copy and reverse, a manual journal editor with line dimensions, file import / export in one template (CORE-46), a trial balance computed
// from the ledger lines, and period close (CORE-40: close / reopen months, the close history).

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
  { value: "close", label: "Close periods" },
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

const entryStatus = (e) => (e.status === "void" ? "void" : e.reversalOf || e.metadata?.reverses ? "reversal" : "posted");
const byNumber = (a, b) => String(a.number || "").localeCompare(String(b.number || ""), undefined, { numeric: true });

// Journal entry detail: its lines, accounts and dimensions, where it came from, and Copy / Reverse / Void.
function EntryDialog({ entry, accounts, onOpenChange, onVoid, onCopy, onReverse, onOpenEntry, canVoid, canPost }) {
  const open = Boolean(entry);
  const [reversals, setReversals] = useState(null);
  const [forId, setForId] = useState(null);
  if ((entry?.id || null) !== forId) {
    setForId(entry?.id || null);
    setReversals(null);
  }
  useEffect(() => {
    if (!entry?.id) return;
    let alive = true;
    listReversalsOf(entry.id).then((rows) => alive && setReversals(rows || []));
    return () => {
      alive = false;
    };
  }, [entry?.id]);

  const dr = round2((entry?.lines || []).reduce((s, l) => s + l.debit, 0));
  const cr = round2((entry?.lines || []).reduce((s, l) => s + l.credit, 0));
  const status = entry ? entryStatus(entry) : "posted";
  const reversed = reversals?.[0] || null;
  const meta = entry?.metadata || {};
  const isJournal = entry?.sourceType === "adjustment";
  const canReverse = canPost && entry && !reverseBlock(entry) && reversals !== null && !reversed;
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
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status={status} map={ENTRY_STATUS_MAP} />
              {entry.idempotencyKey ? <span className="truncate text-xs text-text-tertiary">Key {entry.idempotencyKey}</span> : null}
            </div>
            {meta.importId ? (
              <p className="text-xs text-text-secondary">
                Imported from {meta.sourceFile || "a file"}
                {meta.entryRef ? ` · ref ${meta.entryRef}` : ""}
              </p>
            ) : null}
            {reversed ? (
              <p className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
                Reversed on {formatDate(reversed.date)}.
                <button type="button" className="font-medium text-foreground hover:underline" onClick={() => onOpenEntry(reversed.id)}>
                  View the reversal
                </button>
              </p>
            ) : null}
            {meta.reverses ? (
              <p className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
                Reverses an earlier journal entry{meta.closedThrough ? ` (moved past the books closed through ${formatDate(meta.closedThrough)})` : ""}.
                <button type="button" className="font-medium text-foreground hover:underline" onClick={() => onOpenEntry(meta.reverses)}>
                  View the original
                </button>
              </p>
            ) : null}
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
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className={`text-sm tabular-nums ${dr === cr ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                Debits {money(dr)} · Credits {money(cr)}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {canPost && isJournal ? (
                  <Button variant="outline" className="border-border bg-surface-card" onClick={() => onCopy(entry)}>
                    <Copy className="h-4 w-4" /> Copy
                  </Button>
                ) : null}
                {canReverse ? (
                  <Button variant="outline" className="border-border bg-surface-card" onClick={() => onReverse(entry)}>
                    <Undo2 className="h-4 w-4" /> Reverse…
                  </Button>
                ) : null}
                {canVoid && status === "posted" && !reversed ? (
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
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState(null);
  const [accounts, setAccounts] = useState(null);
  const [type, setType] = useState("all");
  const [account, setAccount] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey((k) => k + 1);
  const [open, setOpen] = useState(null);
  const [voiding, setVoiding] = useState(null);
  const [reversing, setReversing] = useState(null);
  const [copying, setCopying] = useState(null);
  const [journalOpen, setJournalOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const canPost = useCanPost();
  const canConvert = usePermission("property.accounting.convert");
  const canExport = usePermission("reports.export");
  const [exportOpen, setExportOpen] = useState(false);
  const canVoid = useCanVoid();
  const canClose = useCanClose();
  const [closeOpen, setCloseOpen] = useState(false);

  // Search runs on the server once typing pauses.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const filters = useMemo(
    () => ({
      from: from || undefined,
      to: to || undefined,
      sourceType: type === "all" ? undefined : type,
      glAccountId: account === "all" ? undefined : account,
      search: search || undefined,
    }),
    [from, to, type, account, search],
  );
  // New filters start again on page 1 (reset during render, like usePagination).
  const [lastFilters, setLastFilters] = useState(filters);
  if (filters !== lastFilters) {
    setLastFilters(filters);
    setPage(1);
  }

  useEffect(() => {
    let alive = true;
    listLedgerAccounts().then((a) => alive && setAccounts(a || indexAccounts([])));
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  useEffect(() => {
    let alive = true;
    listLedgerEntryPage({ ...filters, page, pageSize }).then((res) => {
      if (!alive) return;
      if (!res) toast.error(ledgerErrorMessage() || "Couldn't load the journal.");
      setEntries(res?.entries || []);
      setTotal(res?.total || 0);
    });
    return () => {
      alive = false;
    };
  }, [filters, page, pageSize, reloadKey]);

  useEffect(() => {
    let alive = true;
    Promise.all([ledgerEntryStats(filters), countUnbalancedEntries()]).then(([s, unbalanced]) => alive && setStats({ ...(s || {}), unbalanced }));
    return () => {
      alive = false;
    };
  }, [filters, reloadKey]);

  const statTiles = useMemo(() => {
    const s = stats || {};
    const known = stats !== null;
    return [
      { label: "Entries", value: known ? String(s.count ?? 0) : "—", footer: "In this range" },
      { label: "Total posted", value: known ? currency(s.postedTotal || 0) : "—", footer: known ? `${s.posted ?? 0} live entries` : "" },
      { label: "Voided", value: known ? String(s.voided ?? 0) : "—", footer: known ? `${s.reversals ?? 0} reversals` : "" },
      {
        label: "Trial check",
        value: known ? (s.unbalanced ? "Unbalanced" : "Balanced") : "—",
        footer: known ? (s.unbalanced ? `${s.unbalanced} entries don't balance` : "Every entry's debits equal its credits") : "",
      },
    ];
  }, [stats]);

  const accountOptions = useMemo(
    () => [{ value: "all", label: "All accounts" }, ...[...(accounts?.list || [])].sort(byNumber).map((a) => ({ value: a.id, label: accountLabel(a) }))],
    [accounts],
  );

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

  const openEntry = async (id) => {
    const e = await getLedgerEntry(id);
    if (!e) toast.error(ledgerErrorMessage() || "Couldn't open that entry.");
    else setOpen(e);
  };

  // Copy prefills a new journal entry from the posted one (fresh from the ledger).
  const copy = async (entry) => {
    const full = await getLedgerEntry(entry.id);
    if (!full) {
      toast.error(ledgerErrorMessage() || "Couldn't load that entry.");
      return;
    }
    setOpen(null);
    setCopying(copyDraft(full));
  };

  // Export writes every entry the filters match, in the import template's columns.
  const exportJournal = async () => {
    const [list, properties, units, owners, vendors, leases] = await Promise.all([exportLedgerEntries(filters), listProperties(), listUnits(), ownersLayer.list(), vendorsLayer.list(), leasesLayer.list()]);
    if (!list) throw new Error(ledgerErrorMessage() || "couldn't load the journal");
    const rows = journalToRows(list, accounts || indexAccounts([]), { properties: properties || [], units: units || [], owners: owners || [], vendors: vendors || [], leases: leases || [] });
    return [{ name: "Journal", columns: JOURNAL_EXPORT_COLUMNS, rows }];
  };

  const columns = [
    { key: "date", header: "Date", className: "whitespace-nowrap text-sm tabular-nums text-text-secondary", render: (e) => formatDate(e.date) },
    {
      key: "memo",
      header: "Entry",
      render: (e) => (
        <div className="flex min-w-0 flex-col gap-1">
          <span className="truncate font-medium text-foreground">{e.memo || SOURCE_LABELS[e.sourceType]}</span>
          <span className="truncate text-xs text-text-secondary">
            {SOURCE_LABELS[e.sourceType] || e.sourceType}
            {e.metadata?.entryRef ? ` · ${e.metadata.entryRef}` : ""}
          </span>
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

  const filtersOn = type !== "all" || account !== "all" || from || to || search;

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="General Ledger"
        description="Every balanced entry behind your books — charges, payments, bills and owner funds. Fix mistakes by voiding or reversing; nothing is ever edited in place."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" className="border-border bg-surface-card" disabled={seeding} onClick={seed}>
              {seeding ? <Loader2 className="h-4 w-4 animate-spin" /> : <ListPlus className="h-4 w-4" />}
              Seed Default Chart
            </Button>
            <RoleGate allowed={canPost || canConvert} reason={NO_POST}>
              <Button variant="outline" className="border-border bg-surface-card" disabled={!canPost && !canConvert} onClick={() => setImportOpen(true)}>
                <Upload className="h-4 w-4" /> Import
              </Button>
            </RoleGate>
            <ExportButton name="General ledger journal" load={exportJournal} />
            <RoleGate allowed={canExport} reason="Your role can't export reports.">
              <Button variant="outline" className="border-border bg-surface-card" disabled={!canExport} onClick={() => setExportOpen(true)}>
                <FileDown className="h-4 w-4" /> Export to Accounting
              </Button>
            </RoleGate>
            <RoleGate allowed={canClose} reason={NO_CLOSE}>
              <Button variant="outline" className="border-border bg-surface-card" disabled={!canClose} onClick={() => setCloseOpen(true)}>
                <Lock className="h-4 w-4" /> Close Period
              </Button>
            </RoleGate>
            <RoleGate allowed={canPost} reason={NO_POST}>
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={!canPost} onClick={() => setJournalOpen(true)}>
                <Plus className="h-4 w-4" /> New Journal Entry
              </Button>
            </RoleGate>
          </div>
        }
      />

      <StatsBar stats={statTiles} />

      {/* The Journal / Trial balance switch leads the filter row; the journal's own filters follow it */}
      <Toolbar>
        <div className="flex flex-wrap items-center gap-2">
          <FilterDropdown value={tab} onValueChange={setTab} options={TABS} height="h-9" />
          {tab === "journal" ? (
            <>
              <FilterDropdown value={type} onValueChange={setType} options={TYPE_OPTIONS} height="h-9" />
              <FilterDropdown value={account} onValueChange={setAccount} options={accountOptions} height="h-9" />
              <Input type="date" aria-label="From date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-40" />
              <span className="text-sm text-text-tertiary">to</span>
              <Input type="date" aria-label="To date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-40" />
            </>
          ) : null}
        </div>
        {tab === "journal" ? (
          <SearchInput value={searchInput} onChange={setSearchInput} placeholder="Search memo, ref or amount…" className="w-full sm:max-w-xs" />
        ) : null}
      </Toolbar>

      {tab === "trial" ? (
        <TrialBalance reloadKey={reloadKey} />
      ) : tab === "close" ? (
        <ClosePeriodsPanel reloadKey={reloadKey} onChanged={reload} onClose={() => setCloseOpen(true)} />
      ) : (
        <>
          {entries === null ? (
            <ListLoading label="Loading journal" />
          ) : (
            <div className="space-y-3">
              <DataTable
                columns={columns}
                data={entries}
                getRowKey={(e) => e.id}
                onRowClick={setOpen}
                empty={
                  <div className="rounded-xl border border-border bg-surface-subtle">
                    <EmptyState
                      icon={BookOpen}
                      title={filtersOn ? "No entries match your filters" : "No entries yet"}
                      description={filtersOn ? "Try another type, account, date range or search." : "Charges, payments, bills and journal entries appear here as they post."}
                      action={
                        filtersOn ? (
                          <Button
                            variant="outline"
                            className="border-border bg-surface-card"
                            onClick={() => {
                              setType("all");
                              setAccount("all");
                              setFrom("");
                              setTo("");
                              setSearchInput("");
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
              <ListPagination
                page={page}
                pageSize={pageSize}
                total={total}
                totalPages={Math.max(1, Math.ceil(total / pageSize))}
                onPageChange={setPage}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  setPage(1);
                }}
                itemLabel="entries"
              />
            </div>
          )}
        </>
      )}

      <EntryDialog
        entry={open}
        accounts={accounts}
        canVoid={canVoid}
        canPost={canPost}
        onOpenChange={(o) => !o && setOpen(null)}
        onOpenEntry={openEntry}
        onCopy={copy}
        onReverse={(e) => {
          setOpen(null);
          setReversing(e);
        }}
        onVoid={(e) => {
          setOpen(null);
          setVoiding(e);
        }}
      />
      <VoidEntryDialog entry={voiding} onOpenChange={(o) => !o && setVoiding(null)} onVoided={reload} />
      <ReverseEntryDialog entry={reversing} onOpenChange={(o) => !o && setReversing(null)} onReversed={reload} />
      <JournalEntryDialog open={journalOpen} onOpenChange={setJournalOpen} onPosted={reload} />
      <JournalEntryDialog open={Boolean(copying)} initial={copying} onOpenChange={(o) => !o && setCopying(null)} onPosted={reload} />
      <JournalImportWizard open={importOpen} onOpenChange={setImportOpen} onPosted={reload} />
      <ClosePeriodWizard
        open={closeOpen}
        onOpenChange={setCloseOpen}
        onClosed={() => {
          setTab("close");
          reload();
        }}
      />
      <AccountingExportDialog open={exportOpen} onOpenChange={setExportOpen} />
    </MainScreenWrapper>
  );
}

export default GeneralLedgerScreen;
