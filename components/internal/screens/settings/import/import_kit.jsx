"use client";

import { DataTable, StatusPill } from "@/components/internal/shared/screen_kit";
import { money } from "@/components/internal/screens/accounting/shared";
import { cn } from "@/lib/utils";
import { ROW_STATUS_MAP } from "./constants";

// Small pieces the import wizard and the job view share (PLAT-03), in CORE-46's import look.

const TONES = {
  info: "border-border bg-surface-card text-text-secondary",
  danger: "border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-400",
  success: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  warning: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400",
};

export function Callout({ tone = "info", children }) {
  return <div className={cn("rounded-lg border px-3 py-2 text-sm", TONES[tone])}>{children}</div>;
}

export function Tiles({ items }) {
  return (
    <div className={cn("grid grid-cols-2 gap-2", items.length > 4 ? "sm:grid-cols-5" : "sm:grid-cols-4")}>
      {items.map((t) => (
        <div key={t.label} className="rounded-lg border border-border bg-surface-subtle px-3 py-2">
          <p className="text-xs text-text-secondary">{t.label}</p>
          <p className={cn("text-lg font-semibold tabular-nums text-foreground", t.tone)}>{t.value}</p>
        </div>
      ))}
    </div>
  );
}

const MESSAGE_TONE = { error: "text-red-600 dark:text-red-400", warning: "text-amber-700 dark:text-amber-400", info: "text-text-secondary" };

// What a row holds, in a line: the first few mapped values.
const rowSummary = (mapped = {}) => Object.values(mapped).filter((v) => v !== "" && v !== null && v !== undefined).slice(0, 4).join(" · ");

// Rows with their status and every message, by spreadsheet row number.
export function RowsTable({ rows, empty }) {
  return (
    <DataTable
      columns={[
        { key: "rowNo", header: "Row", className: "w-14 text-xs tabular-nums text-text-tertiary", render: (r) => r.rowNo },
        { key: "status", header: "Status", className: "w-28", render: (r) => <StatusPill status={r.status} map={ROW_STATUS_MAP} /> },
        {
          key: "detail",
          header: "Record",
          render: (r) => (
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-sm text-foreground">{rowSummary(r.mapped) || "—"}</span>
              {(r.messages || []).map((m, i) => (
                <span key={i} className={cn("text-xs", MESSAGE_TONE[m.level] || MESSAGE_TONE.info)}>
                  {m.text}
                </span>
              ))}
            </div>
          ),
        },
      ]}
      data={rows}
      getRowKey={(r) => r.rowNo}
      empty={empty}
    />
  );
}

// The trial balance's held-back accounts against what the opening-balance batch puts in them.
export function TieOutTable({ rows }) {
  if (!rows?.length) return null;
  const amount = (v) => (v === null || v === undefined ? "—" : money(v));
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium uppercase tracking-wider text-text-tertiary">Tie-out — trial balance against the balances imported</p>
      <DataTable
        columns={[
          { key: "label", header: "Account", render: (r) => <span className="text-sm text-foreground">{r.label}</span> },
          { key: "tb", header: "Trial balance", align: "right", className: "text-right tabular-nums text-text-secondary", render: (r) => amount(r.tb) },
          { key: "batch", header: "Balances imported", align: "right", className: "text-right tabular-nums text-foreground", render: (r) => amount(r.batch) },
          {
            key: "diff",
            header: "Difference",
            align: "right",
            className: "text-right",
            render: (r) =>
              r.diff === null ? (
                <span className="text-xs text-text-tertiary">No trial balance yet</span>
              ) : Math.abs(r.diff) < 0.005 ? (
                <span className="text-xs text-emerald-600 dark:text-emerald-400">Ties out</span>
              ) : (
                <span className="font-semibold tabular-nums text-red-600 dark:text-red-400">{money(r.diff)}</span>
              ),
          },
        ]}
        data={rows}
        getRowKey={(r) => r.glAccountId}
      />
    </div>
  );
}

// Opening Balance Equity, the batch's state, and what to do next.
export function BatchSummary({ batch, preview }) {
  const b = batch || {};
  const net = Number((preview || b).clearingNet) || 0;
  const tied = Math.abs(net) < 0.005;
  return (
    <div className="space-y-3">
      <Tiles
        items={[
          { label: "Opening Balance Equity", value: money(net), tone: tied ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400" },
          { label: "Tenant balances", value: money((preview || b).totals?.tenantBalances || 0) },
          { label: "Deposits held", value: money((preview || b).totals?.deposits || 0) },
          { label: "Owner balances", value: money((preview || b).totals?.ownerBalances || 0) },
        ]}
      />
      {b.status === "Posted" ? (
        <Callout tone="success">Posted through the opening-balance batch{b.posted ? ` (${b.posted} entries)` : ""}: Opening Balance Equity nets to $0.00. It shows in Chart of Accounts › Opening Balances.</Callout>
      ) : b.note ? (
        <Callout tone="warning">{b.note}</Callout>
      ) : preview ? (
        <Callout tone={tied ? "success" : "info"}>
          {tied ? "Everything ties out — the batch posts when you import." : `Opening Balance Equity is off by ${money(net)}: the balances land in a draft batch, which posts once the trial balance (or the rest of the balances) is in.`}
        </Callout>
      ) : null}
      <TieOutTable rows={(preview || b).rows || b.tieOut} />
    </div>
  );
}
