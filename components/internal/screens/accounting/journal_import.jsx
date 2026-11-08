"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Download, FileSpreadsheet, Loader2 } from "lucide-react";

import { LogoLoading } from "@geiger/ui";
import { Button } from "@geiger/ui/button";
import { FileInput } from "@geiger/ui/file-input";
import { Input } from "@geiger/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@geiger/ui/select";
import { DataTable, Field, StatusPill } from "@/components/internal/shared/screen_kit";
import { SegmentedTabs } from "@/components/internal/shared/segmented_tabs";
import { StoredLink } from "@/components/internal/shared/stored_file";
import { WizardDialog } from "@/components/internal/shared/wizard_dialog";
import { RoleNote } from "@/components/internal/shared/role_gate";
import { usePermission } from "@/context/rbac-context";
import { cn } from "@/lib/utils";
import { IMPORT_ACCEPT, readTableFile } from "@/lib/import/table";
import { autoMap, missingColumns, toRecords } from "@/lib/import/mapping";
import { IMPORT_KINDS, MAX_IMPORT_ROWS, columnsFor, isMonthEnd, templateCsv } from "@/lib/ledger/journal_io";
import { addDays, monthStart, shortDate } from "@/lib/ledger/periods";
import { postJournalImportApi, previewJournalImportApi } from "@/lib/accounting/journal_api";
import { listJournalImports } from "@/lib/supabase/journal_imports";
import { uploadPropertyFile } from "@/lib/supabase/property_storage";
import { downloadText } from "@/lib/export/download";
import { formatDate, money, todayISO } from "./shared";

// Journal import wizard (CORE-46): upload a CSV / XLSX, map its columns to the template, preview every entry with its row problems, then
// post the ready ones. Opening balances use the same steps and post through the opening balances batch (INTL-04).

const NONE = "__none__";
const POST_KEY = "property.accounting.post";
const CONVERT_KEY = "property.accounting.convert";
const KIND_TABS = [
  { value: IMPORT_KINDS.journal, label: "Journal entries" },
  { value: IMPORT_KINDS.opening, label: "Opening balances" },
];
const ENTRY_STATUS_MAP = {
  ready: { label: "Ready", variant: "success" },
  blocked: { label: "Blocked", variant: "danger" },
  duplicate: { label: "Already posted", variant: "neutral" },
};
const IMPORT_STATUS_MAP = {
  preview: { label: "Preview", variant: "neutral" },
  posted: { label: "Posted", variant: "success" },
  failed: { label: "Failed", variant: "danger" },
};
const lastMonthEnd = () => addDays(monthStart(todayISO()), -1);

function Callout({ tone = "info", children }) {
  const tones = {
    info: "border-border bg-surface-card text-text-secondary",
    danger: "border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-400",
    success: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    warning: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  };
  return <div className={cn("rounded-lg border px-3 py-2 text-sm", tones[tone])}>{children}</div>;
}

// Row-numbered problems (errors, warnings or notes) in a scrolling list.
function RowList({ title, items, tone }) {
  if (!items?.length) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
        {title} ({items.length})
      </p>
      <ul className={cn("max-h-40 divide-y overflow-y-auto rounded-lg border text-sm", tone === "danger" ? "divide-red-500/10 border-red-500/20 bg-red-500/5" : "divide-border border-border bg-surface-card")}>
        {items.map((e, i) => (
          <li key={i} className="flex gap-3 px-3 py-1.5">
            <span className="w-14 shrink-0 tabular-nums text-text-tertiary">{e.row ? `Row ${e.row}` : "File"}</span>
            <span className="min-w-0 text-foreground">{e.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Tiles({ items }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {items.map((t) => (
        <div key={t.label} className="rounded-lg border border-border bg-surface-subtle px-3 py-2">
          <p className="text-xs text-text-secondary">{t.label}</p>
          <p className={cn("text-lg font-semibold tabular-nums text-foreground", t.tone)}>{t.value}</p>
        </div>
      ))}
    </div>
  );
}

// The latest posted or failed imports, each with its original file (private storage, PLAT-01g).
function RecentImports({ items }) {
  if (!items?.length) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium uppercase tracking-wider text-text-tertiary">Recent imports</p>
      <ul className="divide-y divide-border rounded-lg border border-border bg-surface-card">
        {items.map((i) => (
          <li key={i.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
            <div className="min-w-0">
              {i.file ? (
                <StoredLink file={i.file} className="block truncate font-medium text-foreground hover:underline">
                  {i.fileName}
                </StoredLink>
              ) : (
                <p className="truncate font-medium text-foreground">{i.fileName}</p>
              )}
              <p className="text-xs text-text-secondary">
                {i.kind === IMPORT_KINDS.opening ? "Opening balances" : "Journal entries"} · {formatDate(i.updatedAt)} · {i.postedCount} of {i.entryCount} on the ledger
                {i.postedBy ? ` · ${i.postedBy}` : ""}
              </p>
            </div>
            <StatusPill status={i.status} map={IMPORT_STATUS_MAP} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function JournalPreview({ preview }) {
  const s = preview.summary;
  return (
    <div className="space-y-4">
      <Tiles
        items={[
          { label: "Entries", value: String(s.entries) },
          { label: "Ready to post", value: `${s.ready} · ${money(s.total)}`, tone: s.ready ? "text-emerald-600 dark:text-emerald-400" : "" },
          { label: "Blocked", value: String(s.blocked), tone: s.blocked ? "text-red-600 dark:text-red-400" : "" },
          { label: "Already on the ledger", value: String(s.duplicates) },
        ]}
      />
      {preview.lockedThrough ? <Callout>Books closed through {shortDate(preview.lockedThrough)} — entries dated on or before it are blocked.</Callout> : null}
      <RowList title="Problems" items={preview.errors} tone="danger" />
      <RowList title="Skipped rows" items={preview.warnings} />
      <DataTable
        columns={[
          {
            key: "ref",
            header: "Entry",
            render: (e) => (
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate font-medium text-foreground">{e.ref}</span>
                <span className="text-xs text-text-tertiary">{e.rows.length > 1 ? `Rows ${e.rows[0]}–${e.rows[e.rows.length - 1]}` : `Row ${e.rows[0]}`}</span>
              </div>
            ),
          },
          { key: "date", header: "Date", className: "whitespace-nowrap text-sm tabular-nums text-text-secondary", render: (e) => (e.date ? formatDate(e.date) : "—") },
          {
            key: "memo",
            header: "Memo",
            className: "max-w-xs",
            render: (e) => (
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-sm text-foreground">{e.memo}</span>
                <span className="line-clamp-2 text-xs text-text-secondary">{[...new Set(e.lines.map((l) => l.account))].join(", ")}</span>
                {e.errors.length ? <span className="text-xs text-red-600 dark:text-red-400">{e.errors[0]}</span> : e.note ? <span className="text-xs text-text-tertiary">{e.note}</span> : null}
              </div>
            ),
          },
          { key: "total", header: "Amount", align: "right", className: "text-right font-semibold tabular-nums text-foreground", render: (e) => money(e.total) },
          { key: "status", header: "Status", render: (e) => <StatusPill status={e.status} map={ENTRY_STATUS_MAP} /> },
        ]}
        data={preview.entries}
        getRowKey={(e) => e.ref}
      />
    </div>
  );
}

function OpeningPreview({ preview }) {
  const s = preview.summary;
  const net = Number(s.clearingNet) || 0;
  return (
    <div className="space-y-4">
      <Tiles
        items={[
          { label: "Balances", value: String(s.lines) },
          { label: "Balances as of", value: preview.asOf ? shortDate(preview.asOf) : "—" },
          { label: "Opening Balance Equity", value: money(net), tone: Math.abs(net) < 0.005 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400" },
          { label: "Status", value: s.ready ? "Ready" : "Needs fixes", tone: s.ready ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400" },
        ]}
      />
      <Callout>
        Posts through the opening balances batch, against Opening Balance Equity (3950), dated {preview.asOf ? shortDate(preview.asOf) : "the as-of date"}. AR opens per lease, trust cash per owner and property, payables per vendor; the batch then shows in Chart of Accounts › Opening Balances.
      </Callout>
      <RowList title="Problems" items={preview.errors} tone="danger" />
      <RowList title="Warnings" items={preview.warnings} />
      <RowList title="Notes" items={preview.notes} />
      <DataTable
        columns={[
          { key: "row", header: "Row", className: "w-16 text-sm tabular-nums text-text-tertiary", render: (l) => l.row ?? "—" },
          { key: "kind", header: "Posts as", className: "text-sm text-text-secondary", render: (l) => l.kindLabel },
          {
            key: "who",
            header: "Account / party",
            render: (l) => <span className="truncate text-sm text-foreground">{[l.account, l.lease, l.owner, l.vendor, l.property].filter(Boolean).join(" · ") || "—"}</span>,
          },
          { key: "amount", header: "Amount", align: "right", className: "text-right font-semibold tabular-nums text-foreground", render: (l) => money(l.amount) },
        ]}
        data={preview.lines}
        getRowKey={(l) => `${l.row ?? "file"}-${l.kind}-${l.amount}`}
      />
      {preview.trialBalance?.length ? (
        <div className="space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wider text-text-tertiary">Opening trial balance — compare it with the old system</p>
          <DataTable
            columns={[
              { key: "account", header: "Account", render: (r) => <span className="text-sm text-foreground">{r.account}</span> },
              { key: "debit", header: "Debit", align: "right", className: "text-right tabular-nums text-foreground", render: (r) => (r.balance > 0 ? money(r.balance) : "—") },
              { key: "credit", header: "Credit", align: "right", className: "text-right tabular-nums text-foreground", render: (r) => (r.balance < 0 ? money(-r.balance) : "—") },
            ]}
            data={preview.trialBalance}
            getRowKey={(r) => r.account}
          />
        </div>
      ) : null}
    </div>
  );
}

export function JournalImportWizard({ open, onOpenChange, onPosted }) {
  const canPost = usePermission(POST_KEY);
  const canConvert = usePermission(CONVERT_KEY);
  const [kind, setKind] = useState(IMPORT_KINDS.journal);
  const [file, setFile] = useState(null);
  const [reading, setReading] = useState(false);
  const [mapping, setMapping] = useState({});
  const [asOf, setAsOf] = useState(lastMonthEnd);
  const [importId, setImportId] = useState("");
  const [preview, setPreview] = useState(null);
  const [recent, setRecent] = useState(null);
  const upload = useRef(null);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setKind(IMPORT_KINDS.journal);
      setFile(null);
      setMapping({});
      setAsOf(lastMonthEnd());
      setImportId("");
      setPreview(null);
      setRecent(null);
    }
  }
  useEffect(() => {
    if (!open) return;
    let alive = true;
    listJournalImports().then((rows) => alive && setRecent(rows || []));
    return () => {
      alive = false;
    };
  }, [open]);

  const opening = kind === IMPORT_KINDS.opening;
  const allowed = opening ? canConvert : canPost;
  const columns = columnsFor(kind);
  const headers = file ? file.rows[file.headerIndex] || [] : [];
  const records = () => (file ? toRecords(file.rows, mapping, { headerIndex: file.headerIndex }) : []);

  const chooseKind = (next) => {
    setKind(next);
    setPreview(null);
    if (file) setMapping(autoMap(headers, columnsFor(next)));
  };

  const pickFile = async (e) => {
    const picked = e.target.files?.[0];
    if (!picked) return;
    setReading(true);
    try {
      const table = await readTableFile(picked);
      const headerIndex = table.rows.findIndex((r) => r.some((c) => String(c ?? "").trim() !== ""));
      if (headerIndex < 0) throw new Error("That file is empty.");
      const id = crypto.randomUUID();
      setFile({ name: picked.name, format: table.format, sheet: table.sheet, rows: table.rows, headerIndex });
      setMapping(autoMap(table.rows[headerIndex], columnsFor(kind)));
      setImportId(id);
      setPreview(null);
      // The original file stays in private storage with the import (PLAT-01g); the import works without it.
      upload.current = { id, promise: uploadPropertyFile("journal_import", id, picked, { compress: false }).then((ref) => (ref ? { bucket: ref.bucket, path: ref.path } : null)) };
    } catch (err) {
      setFile(null);
      toast.error(err?.message || "Couldn't read that file.");
    } finally {
      setReading(false);
    }
  };

  const setColumn = (key, value) =>
    setMapping((m) => {
      const next = { ...m };
      if (value === NONE) delete next[key];
      else next[key] = Number(value);
      return next;
    });

  const runPreview = async () => {
    const missing = missingColumns(mapping, columns);
    if (missing.length) return `Map ${missing.join(" and ")} first.`;
    if (mapping.debit === undefined && mapping.credit === undefined && mapping.amount === undefined) return "Map the Debit and Credit columns, or a signed Amount column.";
    const rows = records();
    if (!rows.length) return "The file has no rows under its header.";
    // Only this file's upload counts: the ref is keyed by the import it was stored under.
    const pending = upload.current?.id === importId || upload.current?.id === preview?.importId ? upload.current.promise : null;
    const fileRef = pending ? await pending : null;
    if (pending && !fileRef) toast.warning("The original file couldn't be kept with the import — the import itself still works.");
    const res = await previewJournalImportApi({
      kind,
      fileName: file.name,
      format: file.format,
      records: rows,
      hasRef: mapping.entry_ref !== undefined,
      asOf: opening ? asOf : undefined,
      importId,
      file: fileRef || undefined,
    });
    if (!res.ok) return res.error || "Couldn't preview the import.";
    setImportId(res.importId);
    setPreview(res);
    return "";
  };

  const finish = async () => {
    if (!preview) return false;
    if (!preview.summary.ready) {
      toast.error(opening ? "Fix the problems listed first — Opening Balance Equity has to net to $0.00." : preview.summary.duplicates ? "Everything in this file is already on the ledger." : "Nothing is ready to post — fix the rows listed and import again.");
      return false;
    }
    const res = await postJournalImportApi(preview.importId);
    if (!res.ok) {
      toast.error(res.error || "Couldn't post the import.");
      return false;
    }
    if (opening) toast.success(`Opening balances posted: ${res.posted} entries against Opening Balance Equity.`);
    else {
      const extra = [res.existing ? `${res.existing} already posted` : "", res.duplicates ? `${res.duplicates} already on the ledger` : "", res.blocked ? `${res.blocked} blocked` : ""].filter(Boolean).join(" · ");
      toast.success(`Posted ${res.created} journal ${res.created === 1 ? "entry" : "entries"}${extra ? ` · ${extra}` : ""}.`);
      if (res.failed) toast.error(`${res.failed} couldn't post: ${res.errors?.at(-1)?.message || "see the import"}.`);
    }
    for (const w of res.warnings || []) toast.warning(w);
    onPosted?.(res);
    return true;
  };

  const sample = file ? records().slice(0, 3) : [];
  const mapped = columns.filter((c) => mapping[c.key] !== undefined);
  const readyCount = preview?.summary?.ready;

  const steps = [
    {
      key: "upload",
      title: "Upload",
      validate: () => {
        if (!allowed) return opening ? "Your role can't post opening balances." : "Your role can't post to the ledger.";
        if (!file) return "Pick a file to import.";
        const rows = file.rows.length - file.headerIndex - 1;
        if (rows <= 0) return "The file has no rows under its header.";
        if (rows > MAX_IMPORT_ROWS) return `Import at most ${MAX_IMPORT_ROWS.toLocaleString("en-US")} rows at a time.`;
        if (opening && !isMonthEnd(asOf)) return "Opening balances are as of a month end — pick the last day of a month.";
        return "";
      },
      render: () => (
        <div className="space-y-4">
          <SegmentedTabs tabs={KIND_TABS} value={kind} onChange={chooseKind} />
          <p className="text-sm text-text-secondary">
            {opening
              ? "Each row is one account's balance from your old system, as of a month end. Every balance posts against Opening Balance Equity (3950), which has to net to $0.00."
              : "Rows with the same entry ref form one journal entry; each entry must balance. Accounts match by number, properties, units, owners, vendors and leases by name."}
          </p>
          <Field label="File" htmlFor="ji-file" hint="CSV, TSV or Excel (.xlsx) — the first worksheet with data is read.">
            <FileInput id="ji-file" accept={IMPORT_ACCEPT} disabled={reading} onChange={pickFile} />
          </Field>
          {reading ? (
            <p className="flex items-center gap-2 text-sm text-text-secondary">
              <Loader2 className="h-4 w-4 animate-spin" /> Reading the file…
            </p>
          ) : file ? (
            <p className="flex items-center gap-2 text-sm text-foreground">
              <FileSpreadsheet className="h-4 w-4 text-text-secondary" />
              {file.name} · {(file.rows.length - file.headerIndex - 1).toLocaleString("en-US")} rows{file.sheet ? ` · sheet "${file.sheet}"` : ""}
            </p>
          ) : null}
          {opening ? (
            <Field label="Balances as of" htmlFor="ji-asof" hint="A month end; Geiger's own activity starts the next day.">
              <Input id="ji-asof" type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="sm:w-48" />
            </Field>
          ) : null}
          <Button variant="outline" size="sm" className="border-border bg-surface-card" onClick={() => downloadText(opening ? "opening-balances-template.csv" : "journal-entries-template.csv", templateCsv(kind))}>
            <Download className="h-4 w-4" /> Download Template
          </Button>
          {!allowed ? <RoleNote>{opening ? "Your role can't post opening balances." : "Your role can't post to the ledger."}</RoleNote> : null}
          {recent === null ? null : <RecentImports items={recent} />}
        </div>
      ),
    },
    {
      key: "map",
      title: "Map columns",
      description: "Match your file's columns to the template. Columns with a familiar header are matched already.",
      validate: runPreview,
      render: () => (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {columns.map((c) => (
              <Field key={c.key} label={`${c.label}${c.required ? " *" : ""}`} htmlFor={`ji-map-${c.key}`}>
                <Select value={mapping[c.key] === undefined ? NONE : String(mapping[c.key])} onValueChange={(v) => setColumn(c.key, v)}>
                  <SelectTrigger id={`ji-map-${c.key}`} className="bg-surface-card">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Not in the file</SelectItem>
                    {headers.map((h, i) => (
                      <SelectItem key={i} value={String(i)}>
                        {String(h ?? "").trim() || `Column ${i + 1}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ))}
          </div>
          {!opening && mapping.entry_ref === undefined ? <Callout>Without an entry ref, rows next to each other that share a date and memo form one entry.</Callout> : null}
          {sample.length && mapped.length ? (
            <div className="space-y-1.5">
              <p className="text-xs font-medium uppercase tracking-wider text-text-tertiary">First rows as mapped</p>
              <DataTable
                columns={[{ key: "row", header: "Row", className: "w-14 text-xs tabular-nums text-text-tertiary", render: (r) => r.row }, ...mapped.map((c) => ({ key: c.key, header: c.label, className: "text-xs text-foreground", render: (r) => String(r[c.key] ?? "") }))]}
                data={sample}
                getRowKey={(r) => r.row}
              />
            </div>
          ) : null}
        </div>
      ),
    },
    {
      key: "preview",
      title: "Preview",
      render: () =>
        preview ? (
          preview.kind === IMPORT_KINDS.opening ? <OpeningPreview preview={preview} /> : <JournalPreview preview={preview} />
        ) : (
          <div className="flex justify-center py-10">
            <LogoLoading size={48} />
          </div>
        ),
    },
  ];

  return (
    <WizardDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Import journal entries"
      description="CSV or Excel, in the same columns the General Ledger exports. Nothing posts until you confirm the preview."
      steps={steps}
      onFinish={finish}
      finishLabel={opening ? "Post Opening Balances" : readyCount ? `Post ${readyCount} ${readyCount === 1 ? "Entry" : "Entries"}` : "Post"}
      className="sm:max-w-4xl"
    />
  );
}

export default JournalImportWizard;
