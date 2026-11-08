"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Landmark, Loader2, Lock, Printer, Save, Undo2, Vault } from "lucide-react";

import { ExportButton } from "@/components/internal/shared/export_button";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import {
  DataTable,
  EmptyState,
  Field,
  ListLoading,
  ScreenHeader,
  SectionCard,
  StatsBar,
  StatusPill,
} from "@/components/internal/shared/screen_kit";
import { Button } from "@geiger/ui/button";
import { Checkbox } from "@geiger/ui/checkbox";
import { Input } from "@geiger/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@geiger/ui/select";
import { bankAccountsLayer } from "@/lib/supabase/bank_accounts";
import { bankReconciliationsLayer } from "@/lib/supabase/bank_reconciliations";
import { listProperties } from "@/lib/supabase/properties";
import { getUser } from "@/lib/supabase/user";
import { getLedgerAccounts, ledgerHealth, listLedger, setLinesCleared } from "@/lib/supabase/ledger";
import { SOURCE_LABELS, accountLabel, round2 } from "@/lib/ledger/postings";
import { groupReconLines } from "@/lib/billing/bank_deposits_math";
import { bankLinesOf, reconciliationSnapshot } from "@/lib/reports/ledger_math";
import { getReport, runReport } from "@/lib/reports/catalog";
import { CLIENT_SOURCES } from "@/lib/reports/sources_client";
import { useRbac } from "@/context/rbac-context";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { RoleGate } from "@/components/internal/shared/role_gate";
import { ReportPrint } from "@/components/internal/screens/reports/report_print";
import { useCanPost, useCanVoid } from "./ledger_dialogs";
import { currency, formatDate, money, todayISO } from "./shared";
import { SectionLoading } from "./sections";

// Bank Reconciliation — clear a statement's deposits and withdrawals against the ledger (a bank deposit clears as one row), finalize at zero difference with a sign-off snapshot the printed reconciliation reads (INTL-05); also hosts ledger health.

const RECON_STATUS_MAP = {
  Draft: { label: "Draft", variant: "neutral" },
  Finalized: { label: "Finalized", variant: "success" },
  Undone: { label: "Undone", variant: "outline" },
};

// System cash account per bank type when the bank has no GL of its own.
const BANK_TYPE_KEY = { Trust: "trust_cash", "Security deposit": "deposit_cash" };

const byStatementDesc = (a, b) => String(b.statementDate || "").localeCompare(String(a.statementDate || ""));

// One side (deposits or withdrawals) of the statement with clear checkboxes; a bank deposit's lines are one row (CORE-16).
function ClearList({ title, rows, cleared, onToggle, onToggleAll, locked }) {
  const isOn = (r) => r.lineIds.every((id) => cleared.has(id));
  const allOn = rows.length > 0 && rows.every(isOn);
  const on = rows.filter(isOn);
  const total = round2(on.reduce((s, r) => s + r.amount, 0));
  return (
    <SectionCard
      title={title}
      description={`${on.length} of ${rows.length} cleared · ${money(total)}`}
      bodyPadding={false}
      action={
        rows.length ? (
          <Button variant="ghost" size="sm" disabled={locked} onClick={() => onToggleAll(rows, !allOn)}>
            {allOn ? "Unclear All" : "Clear All"}
          </Button>
        ) : null
      }
    >
      {rows.length === 0 ? (
        <EmptyState className="py-10" icon={Landmark} title="Nothing to clear" description="No uncleared items up to the statement date." />
      ) : (
        <ul className="max-h-[420px] divide-y divide-border overflow-y-auto">
          {rows.map((r) => (
            <li key={r.id}>
              <label className="flex cursor-pointer items-center gap-3 px-5 py-2.5 hover:bg-surface-hover">
                <Checkbox checked={isOn(r)} disabled={locked} onCheckedChange={() => onToggle(r)} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {r.memo || SOURCE_LABELS[r.entry?.sourceType] || "Entry"}
                  </p>
                  <p className="truncate text-xs text-text-secondary">
                    {formatDate(r.date)} · {SOURCE_LABELS[r.entry?.sourceType] || "Entry"}
                    {r.items > 1 ? ` · ${r.items} items` : ""}
                    {r.entry?.status === "void" ? " · Void" : ""}
                    {r.entry?.reversalOf ? " · Reversal" : ""}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">{money(r.amount)}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

// Ledger health: unbalanced entries, lines missing a GL, negative trust per account × property.
function HealthCard() {
  const [health, setHealth] = useState(null);
  const [names, setNames] = useState({ properties: new Map() });
  const [reloadKey, setReloadKey] = useState(0);
  const { canView } = useRbac();
  const { setTab } = useWorkspaceUrl();

  useEffect(() => {
    let alive = true;
    Promise.all([ledgerHealth(), listProperties()]).then(([h, props]) => {
      if (!alive) return;
      setHealth(h || { unbalanced: [], missingGl: [], negativeTrust: [] });
      setNames({ properties: new Map((props || []).map((p) => [p.id, p.name])) });
    });
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  const checks = health
    ? [
        {
          key: "unbalanced",
          title: "Unbalanced entries",
          items: health.unbalanced.map((e) => ({
            id: e.id,
            label: e.memo || SOURCE_LABELS[e.sourceType] || "Entry",
            meta: `${formatDate(e.date)} · Debits ${money(e.debit)} · Credits ${money(e.credit)}`,
          })),
        },
        {
          key: "missing",
          title: "Lines missing a GL account",
          items: health.missingGl.map((l) => ({ id: l.id, label: l.memo || "Line", meta: `${formatDate(l.date)} · ${money(l.debit || l.credit)}` })),
        },
        {
          key: "trust",
          title: "Negative trust balances",
          items: health.negativeTrust.map((t) => ({
            id: `${t.glAccountId}-${t.propertyId}`,
            label: t.accountName,
            meta: [t.propertyId ? names.properties.get(t.propertyId) || "Property" : "No property", money(t.balance)].join(" · "),
          })),
        },
      ]
    : [];
  const issues = checks.reduce((s, c) => s + c.items.length, 0);

  return (
    <SectionCard
      title="Ledger health"
      description="Integrity checks across every posted entry. Trust Reconciliation ties each trust bank to its owner, tenant and deposit ledgers."
      action={
        <div className="flex items-center gap-1">
          {canView("Trust Reconciliation") ? (
            <Button variant="ghost" size="sm" onClick={() => setTab("Trust Reconciliation")}>
              <Vault className="h-4 w-4" />
              Trust Reconciliation
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" onClick={() => setReloadKey((k) => k + 1)}>
            Re-Run Checks
          </Button>
        </div>
      }
    >
      {!health ? (
        <SectionLoading />
      ) : issues === 0 ? (
        <div className="flex items-center gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-3">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <div>
            <p className="text-sm font-medium text-foreground">All checks passed</p>
            <p className="text-xs text-text-secondary">Every entry balances, every line has an account, and no trust position is negative.</p>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {checks.map((c) => (
            <div key={c.key} className="rounded-lg border border-border bg-surface-card">
              <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                <p className="text-sm font-medium text-foreground">{c.title}</p>
                <span
                  className={
                    c.items.length
                      ? "text-sm font-semibold tabular-nums text-red-600 dark:text-red-400"
                      : "text-sm font-semibold tabular-nums text-emerald-600 dark:text-emerald-400"
                  }
                >
                  {c.items.length}
                </span>
              </div>
              {c.items.length === 0 ? (
                <p className="px-4 py-3 text-xs text-text-secondary">No issues.</p>
              ) : (
                <ul className="max-h-56 divide-y divide-border overflow-y-auto">
                  {c.items.map((i) => (
                    <li key={i.id} className="px-4 py-2">
                      <p className="truncate text-sm text-foreground">{i.label}</p>
                      <p className="truncate text-xs text-text-secondary">{i.meta}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

export function BankReconciliationScreen() {
  const [banks, setBanks] = useState(null);
  const [accounts, setAccounts] = useState(null);
  const [bankId, setBankId] = useState("");
  const [statementDate, setStatementDate] = useState(todayISO());
  const [statementBalance, setStatementBalance] = useState("");
  const [lines, setLines] = useState(null);
  const [history, setHistory] = useState(null);
  const [cleared, setCleared] = useState(new Set());
  const [reloadKey, setReloadKey] = useState(0);
  const [busy, setBusy] = useState("");
  const [printing, setPrinting] = useState(null);
  // Finalizing stamps ledger lines cleared (accounting.post); undoing reverses it (accounting.void); printing is a report export.
  const canFinalize = useCanPost();
  const canUndo = useCanVoid();
  const { can } = useRbac();
  const canPrint = can("reports.export");
  const endPrint = useCallback(() => setPrinting(null), []);

  useEffect(() => {
    let alive = true;
    Promise.all([bankAccountsLayer.list(), getLedgerAccounts()]).then(([b, a]) => {
      if (!alive) return;
      const open = (b || []).filter((x) => x.status !== "Closed");
      setBanks(open);
      setAccounts(a || { byId: new Map(), byKey: new Map(), list: [] });
      setBankId((cur) => cur || open[0]?.id || "");
    });
    return () => {
      alive = false;
    };
  }, []);

  const bank = useMemo(() => (banks || []).find((b) => b.id === bankId) || null, [banks, bankId]);
  // The bank's own GL wins; otherwise the shared system cash account for its type.
  const ownGl = Boolean(bank?.glAccountId && accounts?.byId.has(bank.glAccountId));
  const glAccountId = bank
    ? ownGl
      ? bank.glAccountId
      : accounts?.byKey.get(BANK_TYPE_KEY[bank.accountType] || "operating_cash")?.id || ""
    : "";

  // Load the cash GL's lines and this bank's reconciliation history.
  useEffect(() => {
    if (!bank || !accounts) return;
    let alive = true;
    Promise.all([
      glAccountId ? listLedger({ glAccountId }) : Promise.resolve([]),
      bankReconciliationsLayer.list({ bankAccountId: bank.id }),
    ]).then(([l, h]) => {
      if (!alive) return;
      const hist = (h || []).sort(byStatementDesc);
      setLines(l || []);
      setHistory(hist);
      // Resume a saved draft, if any.
      const draft = hist.find((r) => r.status === "Draft");
      if (draft) {
        setCleared(new Set(Array.isArray(draft.metadata?.clearedLineIds) ? draft.metadata.clearedLineIds : []));
        if (draft.statementDate) setStatementDate(draft.statementDate);
        setStatementBalance(String(draft.statementBalance ?? ""));
      } else {
        setCleared(new Set());
      }
    });
    return () => {
      alive = false;
    };
  }, [bank, accounts, glAccountId, reloadKey]);

  const draft = (history || []).find((r) => r.status === "Draft") || null;
  const lastFinal = (history || []).find((r) => r.status === "Finalized") || null;
  const opening = Number(lastFinal?.statementBalance) || 0;

  // Uncleared lines for this bank up to the statement date.
  const candidates = useMemo(
    () =>
      (lines || []).filter(
        (l) =>
          !l.reconciliationId &&
          (!statementDate || l.date <= statementDate) &&
          (ownGl || !l.bankAccountId || l.bankAccountId === bankId),
      ),
    [lines, statementDate, ownGl, bankId],
  );
  const depositRows = useMemo(() => groupReconLines(candidates.filter((l) => l.debit > 0), (l) => l.debit), [candidates]);
  const withdrawalRows = useMemo(() => groupReconLines(candidates.filter((l) => l.credit > 0), (l) => l.credit), [candidates]);
  const statementRows = [...depositRows, ...withdrawalRows];

  const clearedDeposits = round2(candidates.filter((l) => l.debit > 0 && cleared.has(l.id)).reduce((s, l) => s + l.debit, 0));
  const clearedWithdrawals = round2(candidates.filter((l) => l.credit > 0 && cleared.has(l.id)).reduce((s, l) => s + l.credit, 0));
  const clearedBalance = round2(opening + clearedDeposits - clearedWithdrawals);
  const statement = Number(statementBalance) || 0;
  const difference = round2(statement - clearedBalance);
  const balanced = statementBalance !== "" && Math.abs(difference) < 0.005;

  // A row clears (or unclears) every ledger line it stands for.
  const toggle = (row) =>
    setCleared((prev) => {
      const next = new Set(prev);
      const on = !row.lineIds.every((id) => next.has(id));
      for (const id of row.lineIds) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  const toggleAll = (rows, on) =>
    setCleared((prev) => {
      const next = new Set(prev);
      for (const id of rows.flatMap((r) => r.lineIds)) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  const clearedIds = candidates.filter((l) => cleared.has(l.id)).map((l) => l.id);

  const saveDraft = async () => {
    if (!bank) return;
    setBusy("draft");
    const fields = {
      name: `${bank.name} · ${formatDate(statementDate)}`,
      statementDate,
      statementBalance: statement,
      clearedBalance,
      difference,
      glAccountId,
    };
    const saved = draft
      ? await bankReconciliationsLayer.update(draft.id, { ...fields, metadata: { ...(draft.metadata || {}), clearedLineIds: clearedIds } })
      : await bankReconciliationsLayer.create({
          id: crypto.randomUUID(),
          bankAccountId: bank.id,
          status: "Draft",
          ...fields,
          metadata: { clearedLineIds: clearedIds },
        });
    setBusy("");
    if (!saved) {
      toast.error("Couldn't save the draft.");
      return;
    }
    toast.success("Draft saved.");
    setHistory((h) => [saved, ...(h || []).filter((r) => r.id !== saved.id)].sort(byStatementDesc));
  };

  const finalize = async () => {
    if (!bank || !balanced || !canFinalize) return;
    setBusy("finalize");
    const finalizedAt = new Date().toISOString();
    // Sign-off snapshot from a fresh read of the ledger, so the printout shows exactly what was finalized.
    const [fresh, user] = await Promise.all([listLedger({ glAccountId }), getUser()]);
    const snapshot = reconciliationSnapshot({
      lines: bankLinesOf(fresh || lines || [], bank, accounts).lines,
      bank,
      glAccountId,
      statementDate,
      statementBalance: statement,
      openingBalance: opening,
      clearedIds,
      finalizedAt,
      finalizedBy: user ? { id: user.id, name: user.name, email: user.email } : null,
    });
    const fields = {
      name: `${bank.name} · ${formatDate(statementDate)}`,
      statementDate,
      statementBalance: statement,
      clearedBalance,
      difference: 0,
      glAccountId,
      status: "Finalized",
      finalizedAt,
    };
    const rec = draft
      ? await bankReconciliationsLayer.update(draft.id, { ...fields, metadata: { ...(draft.metadata || {}), clearedLineIds: clearedIds, snapshot } })
      : await bankReconciliationsLayer.create({
          id: crypto.randomUUID(),
          bankAccountId: bank.id,
          ...fields,
          metadata: { clearedLineIds: clearedIds, snapshot },
        });
    if (!rec) {
      setBusy("");
      toast.error("Couldn't save the reconciliation.");
      return;
    }
    const ok = clearedIds.length
      ? await setLinesCleared(clearedIds, { cleared: true, clearedOn: statementDate, reconciliationId: rec.id })
      : true;
    if (!ok) {
      // Roll the record back so the books and the reconciliation agree.
      await bankReconciliationsLayer.update(rec.id, { status: "Draft", finalizedAt: "", metadata: { ...(rec.metadata || {}), snapshot: null } });
      setBusy("");
      toast.error("Couldn't mark the lines cleared — saved as a draft instead.");
      setReloadKey((k) => k + 1);
      return;
    }
    await bankAccountsLayer.mergeMeta(bank.id, { lastReconciled: statementDate, statementBalance: statement });
    setBusy("");
    toast.success(`Reconciled ${bank.name} through ${formatDate(statementDate)}.`);
    setStatementBalance("");
    setReloadKey((k) => k + 1);
  };

  const undo = async (rec) => {
    if (!canUndo) return;
    setBusy(`undo-${rec.id}`);
    const recLines = (await listLedger({ reconciliationId: rec.id })) || [];
    const ok = recLines.length ? await setLinesCleared(recLines.map((l) => l.id), { cleared: false }) : true;
    if (!ok) {
      setBusy("");
      toast.error("Couldn't unclear the reconciled lines.");
      return;
    }
    const saved = await bankReconciliationsLayer.update(rec.id, { status: "Undone" });
    setBusy("");
    if (!saved) {
      toast.error("Lines were uncleared, but the reconciliation couldn't be marked undone.");
    } else {
      toast.success("Reconciliation undone.");
    }
    setReloadKey((k) => k + 1);
  };

  // Print a finalized reconciliation from its sign-off snapshot (bank_reconciliation_report), with payee names.
  const printRec = async (rec) => {
    setBusy(`print-${rec.id}`);
    const [vendors, tenants, owners, leases] = await Promise.all(
      ["vendors", "tenants", "owners", "leases"].map((k) => Promise.resolve().then(CLIENT_SOURCES[k]).catch(() => null)),
    );
    const data = {
      ledger: { lines: lines || [], accounts },
      bankAccounts: banks || [],
      bankReconciliations: history || [],
      vendors: vendors || [],
      tenants: tenants || [],
      owners: owners || [],
      leases: leases || [],
    };
    const result = runReport(getReport("bank_reconciliation_report"), data, { reconciliationId: rec.id });
    setBusy("");
    if (result.empty) {
      toast.error(result.empty.description);
      return;
    }
    setPrinting(result);
  };

  const stats = [
    { label: "Statement balance", value: currency(statement), footer: statementBalance === "" ? "Enter the ending balance" : formatDate(statementDate) },
    { label: "Cleared balance", value: currency(clearedBalance), footer: `Opening ${currency(opening)}` },
    { label: "Difference", value: currency(difference), footer: balanced ? "Ready to finalize" : "Must be zero to finalize" },
    { label: "Uncleared items", value: String(statementRows.filter((r) => !r.lineIds.every((id) => cleared.has(id))).length), footer: `${statementRows.length} up to the statement date` },
  ];

  const historyColumns = [
    { key: "statementDate", header: "Statement", className: "whitespace-nowrap text-sm tabular-nums text-text-secondary", render: (r) => formatDate(r.statementDate) },
    { key: "status", header: "Status", render: (r) => <StatusPill status={r.status} map={RECON_STATUS_MAP} /> },
    { key: "statementBalance", header: "Ending balance", align: "right", className: "text-right tabular-nums text-foreground", render: (r) => money(r.statementBalance) },
    { key: "items", header: "Items", align: "right", className: "text-right tabular-nums text-text-secondary", render: (r) => (Array.isArray(r.metadata?.clearedLineIds) ? r.metadata.clearedLineIds.length : "—") },
    { key: "finalizedAt", header: "Finalized", className: "whitespace-nowrap text-sm text-text-secondary", render: (r) => (r.finalizedAt ? formatDate(String(r.finalizedAt).slice(0, 10)) : "—") },
    {
      key: "actions",
      header: "",
      align: "right",
      className: "text-right",
      render: (r) =>
        r.status === "Finalized" && (canPrint || (canUndo && r.id === lastFinal?.id)) ? (
          <div className="flex items-center justify-end gap-1">
            {canPrint ? (
              <Button variant="ghost" size="sm" disabled={Boolean(busy)} onClick={() => printRec(r)}>
                {busy === `print-${r.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                Print
              </Button>
            ) : null}
            {canUndo && r.id === lastFinal?.id ? (
              <Button variant="ghost" size="sm" disabled={Boolean(busy)} onClick={() => undo(r)}>
                {busy === `undo-${r.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
                Undo
              </Button>
            ) : null}
          </div>
        ) : null,
    },
  ];

  const historyExport = [
    { header: "Statement", key: "statementDate", type: "date" },
    { header: "Status", key: "status" },
    { header: "Ending balance", key: "statementBalance", type: "money" },
    { header: "Items cleared", value: (r) => (Array.isArray(r.metadata?.clearedLineIds) ? r.metadata.clearedLineIds.length : 0), type: "number" },
    { header: "Finalized", key: "finalizedAt", type: "date" },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Bank Reconciliation"
        description="Match each bank statement to the ledger — clear what posted, finalize when the difference is zero, and keep trust accounts provably in balance."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ExportButton name="Reconciliation history" columns={historyExport} rows={history || []} />
            <Button variant="outline" className="border-border bg-surface-card" disabled={!bank || Boolean(busy)} onClick={saveDraft}>
              {busy === "draft" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Draft
            </Button>
            <RoleGate allowed={canFinalize} reason="Your role can't finalize reconciliations.">
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={!balanced || Boolean(busy) || !canFinalize} onClick={finalize}>
                {busy === "finalize" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                Finalize
              </Button>
            </RoleGate>
          </div>
        }
      />

      <StatsBar stats={stats} />

      {banks === null ? (
        <ListLoading label="Loading bank accounts" />
      ) : banks.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface-subtle">
          <EmptyState icon={Landmark} title="No bank accounts yet" description="Add a bank account in Bank Accounts to start reconciling." />
        </div>
      ) : (
        <>
          <SectionCard>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Bank account" htmlFor="rec-bank">
                <Select
                  value={bankId}
                  onValueChange={(v) => {
                    setBankId(v);
                    setLines(null);
                    setHistory(null);
                    setStatementBalance("");
                  }}
                >
                  <SelectTrigger id="rec-bank" className="bg-surface-card">
                    <SelectValue placeholder="Select a bank account…" />
                  </SelectTrigger>
                  <SelectContent>
                    {banks.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {[b.name, b.accountType].filter(Boolean).join(" · ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Statement date" htmlFor="rec-date">
                <Input id="rec-date" type="date" value={statementDate} onChange={(e) => setStatementDate(e.target.value)} />
              </Field>
              <Field label="Statement ending balance" htmlFor="rec-balance">
                <Input
                  id="rec-balance"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={statementBalance}
                  onChange={(e) => setStatementBalance(e.target.value)}
                />
              </Field>
            </div>
            <p className="mt-3 text-xs text-text-secondary">
              {glAccountId
                ? `Ledger account: ${accountLabel(accounts?.byId.get(glAccountId))}${ownGl ? "" : " (shared system account — lines tagged to other banks are excluded)"}. Last reconciled ${lastFinal ? formatDate(lastFinal.statementDate) : "never"}.`
                : "No cash account found for this bank — link one in Bank Accounts or seed the default chart."}
            </p>
          </SectionCard>

          <SectionCard>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-foreground">Difference</span>
                <span
                  className={
                    balanced
                      ? "font-semibold tabular-nums text-emerald-600 dark:text-emerald-400"
                      : "font-semibold tabular-nums text-red-600 dark:text-red-400"
                  }
                >
                  {money(difference)}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-strong">
                <div
                  className={balanced ? "h-full rounded-full bg-emerald-500" : "h-full rounded-full bg-amber-500"}
                  style={{
                    width: `${
                      statement
                        ? Math.max(0, Math.min(100, 100 - (Math.abs(difference) / Math.max(Math.abs(statement), 1)) * 100))
                        : 0
                    }%`,
                  }}
                />
              </div>
              <p className="text-xs text-text-secondary">
                Opening {money(opening)} + cleared deposits {money(clearedDeposits)} − cleared withdrawals {money(clearedWithdrawals)} = {money(clearedBalance)}
              </p>
            </div>
          </SectionCard>

          {lines === null ? (
            <ListLoading label="Loading ledger lines" />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              <ClearList title="Deposits & credits" rows={depositRows} cleared={cleared} onToggle={toggle} onToggleAll={toggleAll} locked={Boolean(busy)} />
              <ClearList title="Checks & withdrawals" rows={withdrawalRows} cleared={cleared} onToggle={toggle} onToggleAll={toggleAll} locked={Boolean(busy)} />
            </div>
          )}

          <SectionCard title="History" description="Past reconciliations for this account. Only the latest finalized one can be undone." bodyPadding={false}>
            {history === null ? (
              <SectionLoading />
            ) : (
              <DataTable
                className="rounded-none border-0"
                columns={historyColumns}
                data={history}
                getRowKey={(r) => r.id}
                empty={<EmptyState className="py-10" icon={Landmark} title="No reconciliations yet" description="Finalized statements will appear here." />}
              />
            )}
          </SectionCard>
        </>
      )}

      <HealthCard />

      {printing ? (
        <ReportPrint
          title={printing.title}
          subtitle={printing.subtitle}
          periodLabel={printing.periodLabel}
          stats={printing.stats}
          sections={printing.sections.filter((s) => s.columns?.length)}
          onDone={endPrint}
        />
      ) : null}
    </MainScreenWrapper>
  );
}

export default BankReconciliationScreen;
