"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Download, FileSpreadsheet, Loader2, Save, Sparkles, Undo2 } from "lucide-react";

import { LogoLoading } from "@geiger/ui";
import { Button } from "@geiger/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@geiger/ui/dialog";
import { FileInput } from "@geiger/ui/file-input";
import { Input } from "@geiger/ui/input";
import { Progress } from "@geiger/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@geiger/ui/select";
import { Switch } from "@geiger/ui/switch";
import { Field, SettingRow, SettingsList } from "@/components/internal/shared/screen_kit";
import { SegmentedTabs } from "@/components/internal/shared/segmented_tabs";
import { WizardDialog } from "@/components/internal/shared/wizard_dialog";
import { NoAccessState } from "@/components/internal/shared/no_access";
import { usePermission } from "@/context/rbac-context";
import { cn } from "@/lib/utils";
import { IMPORT_ACCEPT, readTableFile } from "@/lib/import/table";
import { guessHeaderRow } from "@/lib/import/mapping";
import { BALANCE_ENTITIES, importLabel, importSpec, isBalanceEntity } from "@/lib/data_io/import_spec";
import { autoMap, mappingCoverage } from "@/lib/data_io/mapping";
import { columnNote, detectSource } from "@/lib/data_io/presets";
import { tableRecords } from "@/lib/data_io/records";
import { importTemplateCsv, importTemplateWorkbook, templateFileName } from "@/lib/data_io/templates";
import { normalizeOptions } from "@/lib/data_io/options";
import { commitImportChunkApi, createImportJobApi, rollbackImportApi, saveImportMappingApi, stageImportRowsApi, validateImportApi } from "@/lib/data_io/api";
import { MAX_ROWS_PER_IMPORT, STAGE_CHUNK } from "@/lib/data_io/limits";
import { SANDBOX_BALANCES, sandboxCommit, sandboxRollback, sandboxSaveMapping, sandboxValidate } from "@/lib/data_io/sandbox";
import { isSandbox } from "@/lib/sandbox/sandbox_mode";
import { isMonthStart } from "@/lib/ledger/conversion";
import { listImportMappings } from "@/lib/supabase/import_jobs";
import { conversionBatchesLayer } from "@/lib/supabase/conversion";
import { getSetting } from "@/lib/supabase/settings";
import { uploadPropertyFile } from "@/lib/supabase/property_storage";
import { downloadBlob, downloadText } from "@/lib/export/download";
import { XLSX_MIME } from "@/lib/export/xlsx";
import { formatDate, todayISO } from "@/components/internal/screens/accounting/shared";
import { BALANCE_MODES, DEDUPE_OPTIONS, ENTITY_OPTIONS, IMPORT_KEY, NO_IMPORT, ROW_FILTERS, SOURCE_OPTIONS, writesSummary } from "./constants";
import { BatchSummary, Callout, RowsTable, Tiles } from "./import_kit";

// Import wizard (PLAT-03): what and from where → upload (CSV / XLSX, read in the browser) → map columns (auto-mapped,
// saved mappings) → review every row, validated on the server → import in chunks → done, with roll back.

const NONE = "__none__";
const NEW_BATCH = "__new__";
const CONVERT_KEY = "property.accounting.convert";
const CREATE_MISSING = ["units", "tenants", "leases"];

const emptyOptions = (entity) => normalizeOptions(entity, {}, todayISO());

// Fields grouped as the spec lists them.
function groups(spec) {
  const out = [];
  for (const f of spec.fields) {
    const g = out.find((x) => x.name === f.group) || out[out.push({ name: f.group, fields: [] }) - 1];
    g.fields.push(f);
  }
  return out;
}

function ColumnSelect({ id, value, headers, onChange, invalid }) {
  return (
    <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? "" : v)}>
      <SelectTrigger id={id} className={cn("h-9 bg-surface-card text-sm", invalid && "border-amber-500/60")}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>Not in the file</SelectItem>
        {headers.map((h) => (
          <SelectItem key={h} value={h}>
            {h}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// Inline progress while rows upload, are checked or import.
export function ProgressLine({ progress }) {
  if (!progress) return null;
  const done = Math.min(progress.done, progress.total || 0);
  return (
    <div className="space-y-1.5">
      <p className="flex items-center gap-2 text-sm text-text-secondary">
        <Loader2 className="h-4 w-4 animate-spin" />
        {progress.label}
        {progress.total ? ` — ${done.toLocaleString("en-US")} of ${progress.total.toLocaleString("en-US")} rows` : "…"}
      </p>
      {progress.total ? <Progress value={(done / progress.total) * 100} aria-label={progress.label} /> : null}
    </div>
  );
}

// Map columns: every field with its file column (auto-matched), a sample value, the columns left out, saved mappings.
export function MappingPanel({ spec, headers, records, mapping, how, savedFor, notes, onApplySaved, onSetColumn, mappingName, onMappingName, placeholder, saving, onSave, progress }) {
  const coverage = mappingCoverage(headers, mapping);
  const unused = headers.filter((h) => !Object.values(mapping).includes(h));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-text-secondary">
          <span className="font-medium text-foreground">
            {coverage.mapped} of {coverage.total} columns matched ({coverage.pct}%)
          </span>{" "}
          — check the matches, and pick a column for anything left blank.
        </p>
        {savedFor.length ? (
          <Select value="" onValueChange={onApplySaved}>
            <SelectTrigger className="h-9 w-56 bg-surface-card text-sm" aria-label="Apply a saved mapping">
              <SelectValue placeholder="Apply a saved mapping" />
            </SelectTrigger>
            <SelectContent>
              {savedFor.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>
      {groups(spec).map((g) => (
        <div key={g.name} className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-text-tertiary">{g.name}</p>
          <div className="divide-y divide-border rounded-lg border border-border bg-surface-subtle">
            {g.fields.map((f) => {
              const col = mapping[f.key];
              const sample = col ? records.find((r) => String(r.raw[col] ?? "").trim())?.raw[col] : "";
              const missing = f.required && !col;
              return (
                <div key={f.key} className="grid items-center gap-2 px-3 py-2 sm:grid-cols-[1fr_16rem_1fr]">
                  <div className="min-w-0">
                    <p className={cn("text-sm font-medium", missing ? "text-amber-700 dark:text-amber-400" : "text-foreground")}>
                      {f.label}
                      {f.required ? " *" : ""}
                    </p>
                    {f.help ? <p className="text-xs text-text-tertiary">{f.help}</p> : null}
                  </div>
                  <ColumnSelect id={`imp-map-${f.key}`} value={col} headers={headers} invalid={missing} onChange={(h) => onSetColumn(f.key, h)} />
                  <p className="truncate text-xs text-text-secondary">{sample ? `e.g. ${sample}` : how[f.key] === "fuzzy" ? "Matched by a similar name" : ""}</p>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {unused.length ? (
        <Callout>
          <span className="font-medium text-foreground">Not imported:</span> {unused.map((h) => (notes(h) ? `${h} (${notes(h)})` : h)).join(", ")}
        </Callout>
      ) : null}
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Save this mapping" htmlFor="imp-map-name" hint="Saved mappings are matched first the next time a file has these columns.">
          <Input id="imp-map-name" value={mappingName} onChange={(e) => onMappingName(e.target.value)} placeholder={placeholder} className="w-64 bg-surface-card" maxLength={80} />
        </Field>
        <Button variant="outline" className="border-border bg-surface-card" disabled={saving || !Object.keys(mapping).length} onClick={onSave}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save mapping
        </Button>
      </div>
      <ProgressLine progress={progress} />
    </div>
  );
}

// Review: counts, what the import writes, the balance tie-out, and every checked row by status.
export function ReviewPanel({ validation, balance, filter, onFilter, progress }) {
  if (!validation) {
    return (
      <div className="flex justify-center py-10">
        <LogoLoading size={48} aria-label="Checking the rows" />
      </div>
    );
  }
  const c = validation.counts || {};
  const ready = (c.valid || 0) + (c.warning || 0);
  const shown = validation.rows.filter((r) => filter === "all" || r.status === filter);
  return (
    <div className="space-y-4">
      <Tiles
        items={[
          { label: "Rows", value: (c.total || 0).toLocaleString("en-US") },
          { label: "Ready", value: ready.toLocaleString("en-US"), tone: ready ? "text-emerald-600 dark:text-emerald-400" : "" },
          { label: "Warnings", value: String(c.warning || 0), tone: c.warning ? "text-amber-700 dark:text-amber-400" : "" },
          { label: "Errors", value: String(c.error || 0), tone: c.error ? "text-red-600 dark:text-red-400" : "" },
          { label: "Already in Geiger", value: String(c.skipped || 0) },
        ]}
      />
      {c.problems?.length ? (
        <Callout tone="danger">{c.problems.join(" ")}</Callout>
      ) : ready ? (
        <Callout>Importing {writesSummary(c.writes) || "nothing new"}. Rows with errors are left out; fix them in the file and import it again — rows already in Geiger are skipped then.</Callout>
      ) : null}
      {balance && c.balances ? <BatchSummary preview={c.balances} /> : null}
      <SegmentedTabs tabs={ROW_FILTERS.map((f) => ({ ...f, label: `${f.label}${f.value === "all" ? "" : ` (${c[f.value] || 0})`}` }))} value={filter} onChange={onFilter} />
      <RowsTable rows={shown} empty={<p className="px-4 py-6 text-sm text-text-secondary">No rows here.</p>} />
      {(c.total || 0) > validation.rows.length ? <p className="text-xs text-text-tertiary">Showing the first {validation.rows.length} rows; every row is checked and imported.</p> : null}
      <ProgressLine progress={progress} />
    </div>
  );
}

// Done: what was written, the balance batch's outcome, and roll back.
export function DonePanel({ outcome, balance, rolledBack, onRollback }) {
  const final = outcome?.rows || {};
  return (
    <div className="space-y-4">
      <Tiles
        items={[
          { label: "Created", value: String(final.created || 0), tone: final.created ? "text-emerald-600 dark:text-emerald-400" : "" },
          { label: "Updated", value: String(final.updated || 0) },
          { label: "Skipped", value: String(final.skipped || 0) },
          { label: "Errors", value: String(final.error || 0), tone: final.error ? "text-red-600 dark:text-red-400" : "" },
        ]}
      />
      {balance && outcome?.batch ? <BatchSummary batch={outcome.batch} /> : null}
      {rolledBack ? (
        <Callout tone="success">
          Rolled back: {rolledBack.removed} record{rolledBack.removed === 1 ? "" : "s"} removed{rolledBack.restored ? `, ${rolledBack.restored} restored` : ""}
          {rolledBack.voided ? `, ${rolledBack.voided} opening entries voided` : ""}.{rolledBack.alsoRolledBack?.length ? ` Also rolled back (same batch): ${rolledBack.alsoRolledBack.map((j) => j.fileName || importLabel(j.entity)).join(", ")}.` : ""}
        </Callout>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" className="border-border bg-surface-card" onClick={onRollback}>
            <Undo2 className="h-4 w-4" /> Roll back this import
          </Button>
          <p className="text-xs text-text-secondary">Removes what it created and puts back what it changed. It&apos;s refused once something depends on it, like a payment.</p>
        </div>
      )}
    </div>
  );
}

export function ImportWizard({ open, onOpenChange, initialEntity = "properties", onChanged }) {
  const canImport = usePermission(IMPORT_KEY);
  const canConvert = usePermission(CONVERT_KEY);
  const [entity, setEntity] = useState(initialEntity);
  const [source, setSource] = useState("generic");
  const [file, setFile] = useState(null);
  const [reading, setReading] = useState(false);
  const [detected, setDetected] = useState(null);
  const [mapping, setMapping] = useState({});
  const [how, setHow] = useState({});
  const [options, setOptions] = useState(() => emptyOptions(initialEntity));
  const [job, setJob] = useState(null);
  const [validation, setValidation] = useState(null);
  const [filter, setFilter] = useState("all");
  const [progress, setProgress] = useState(null);
  const [outcome, setOutcome] = useState(null);
  const [saved, setSaved] = useState(null);
  const [batches, setBatches] = useState([]);
  const [custom, setCustom] = useState({});
  const [mappingName, setMappingName] = useState("");
  const [savingMapping, setSavingMapping] = useState(false);
  const [confirmRollback, setConfirmRollback] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [rolledBack, setRolledBack] = useState(null);
  const upload = useRef(null);
  // The playground imports in memory (no server, no history).
  const sandbox = isSandbox();
  const sandboxRun = useRef(null);

  // Reset whenever the wizard reopens (render-phase reset).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setEntity(initialEntity);
      setSource("generic");
      setFile(null);
      setDetected(null);
      setMapping({});
      setHow({});
      setOptions(emptyOptions(initialEntity));
      setJob(null);
      setValidation(null);
      setFilter("all");
      setProgress(null);
      setOutcome(null);
      setMappingName("");
      setRolledBack(null);
    }
  }

  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    Promise.all([listImportMappings(), conversionBatchesLayer.list(), getSetting("custom_fields", {})]).then(([m, b, cf]) => {
      if (!alive) return;
      setSaved(m || []);
      setBatches((b || []).filter((x) => x.status === "Draft"));
      setCustom(cf || {});
    });
    return () => {
      alive = false;
    };
  }, [open]);

  const spec = useMemo(() => importSpec(entity, { custom }), [entity, custom]);
  const headers = file?.headers || [];
  const balance = isBalanceEntity(entity);
  const setOpt = (patch) => setOptions((o) => ({ ...o, ...patch }));
  const savedFor = (saved || []).filter((m) => m.entity === entity);

  // A new file, sheet, entity or mapping means a new job (the staged rows belong to the old one).
  const resetJob = () => {
    setJob(null);
    setValidation(null);
    setOutcome(null);
  };

  const remap = (ent, src, table, savedMapping = null) => {
    const res = autoMap(table?.headers || headers, importSpec(ent, { custom }), { source: src, saved: savedMapping });
    setMapping(res.mapping);
    setHow(res.how);
  };

  const chooseEntity = (next) => {
    setEntity(next);
    setOptions((o) => ({ ...emptyOptions(next), dedupe: o.dedupe }));
    resetJob();
    if (file) remap(next, source, file);
  };

  // Rows → the table records, detecting the vendor report and mapping its columns.
  const loadTable = (name, format, table, raw, headerIndex = guessHeaderRow(table.rows)) => {
    const { headers: hs, records } = tableRecords(table.rows, headerIndex);
    const found = detectSource(hs);
    const nextEntity = found?.entity || entity;
    const nextSource = found?.source || source;
    setFile({ name, format, raw, sheet: table.sheet, sheets: table.sheets || [], workbook: table.workbook || null, rows: table.rows, headerIndex, headers: hs, records });
    setDetected(found);
    setEntity(nextEntity);
    setSource(nextSource);
    setOptions((o) => normalizeOptions(nextEntity, { ...(nextEntity === entity ? o : {}), ...(found?.options || {}) }, todayISO()));
    resetJob();
    remap(nextEntity, nextSource, { headers: hs });
  };

  const pickFile = async (e) => {
    const picked = e.target.files?.[0];
    if (!picked) return;
    setReading(true);
    try {
      const table = await readTableFile(picked);
      if (!table.rows.some((r) => r.some((c) => String(c ?? "").trim()))) throw new Error("That file is empty.");
      loadTable(picked.name, table.format, table, picked);
    } catch (err) {
      setFile(null);
      toast.error(err?.message || "Couldn't read that file.");
    } finally {
      setReading(false);
    }
  };

  const pickSheet = (name) => {
    const sheet = file.workbook?.find((s) => s.name === name);
    if (sheet) loadTable(file.name, file.format, { ...file, sheet: name, rows: sheet.rows }, file.raw);
  };
  const pickHeaderRow = (i) => loadTable(file.name, file.format, { ...file, rows: file.rows }, file.raw, Number(i));

  const chooseSource = (next) => {
    setSource(next);
    resetJob();
    if (file) remap(entity, next, file);
  };

  const setColumn = (key, header) => {
    setMapping((m) => {
      const next = { ...m };
      for (const [k, v] of Object.entries(next)) if (header && v === header && k !== key) delete next[k];
      if (header) next[key] = header;
      else delete next[key];
      return next;
    });
    setHow((h) => ({ ...h, [key]: "manual" }));
    setValidation(null);
  };

  const applySaved = (id) => {
    const m = savedFor.find((x) => x.id === id);
    if (!m) return;
    remap(entity, m.sourceSystem || source, file, m.mapping);
    if (m.sourceSystem) setSource(m.sourceSystem);
    toast.success(`Applied "${m.name}".`);
  };

  const saveMapping = async () => {
    const name = mappingName.trim();
    if (!name) return toast.error("Name the mapping first.");
    setSavingMapping(true);
    const res = sandbox ? await sandboxSaveMapping({ name, entity, sourceSystem: source, mapping }) : await saveImportMappingApi({ name, entity, sourceSystem: source, mapping });
    setSavingMapping(false);
    if (!res.ok) return toast.error(res.error || "Couldn't save the mapping.");
    setSaved(res.mappings);
    setMappingName("");
    toast.success(`Mapping "${name}" saved — it's matched first next time.`);
  };

  // The job for this file: original kept privately (PLAT-01g), rows staged in chunks; reused while the file stays the same.
  const ensureJob = async () => {
    if (job) return job;
    const id = crypto.randomUUID();
    if (upload.current?.raw !== file.raw) upload.current = { raw: file.raw, promise: uploadPropertyFile("import_jobs", id, file.raw, { compress: false }).then((ref) => (ref ? { id, bucket: ref.bucket, path: ref.path } : null)) };
    const ref = await upload.current.promise;
    if (!ref) toast.warning("The original file couldn't be kept with the import — the import itself still works.");
    const created = await createImportJobApi({ id: ref?.id || id, entity, sourceSystem: source, fileName: file.name, file: ref ? { bucket: ref.bucket, path: ref.path } : undefined, headers, sheet: file.sheet, mapping, options, detected });
    if (!created.ok) throw new Error(created.error || "Couldn't start the import.");
    for (let i = 0; i < file.records.length; i += STAGE_CHUNK) {
      setProgress({ label: "Uploading rows", done: i, total: file.records.length });
      const res = await stageImportRowsApi(created.job.id, file.records.slice(i, i + STAGE_CHUNK));
      if (!res.ok) throw new Error(res.error || "Couldn't upload the rows.");
    }
    setProgress(null);
    setJob(created.job);
    return created.job;
  };

  const runValidation = async () => {
    if (sandbox) {
      const res = await sandboxValidate({ entity, source, mapping, options, records: file.records, custom });
      if (!res.ok) return res.error;
      sandboxRun.current = { plan: res.plan, written: null };
      setValidation(res);
      setFilter(res.counts.error ? "error" : "all");
      return "";
    }
    try {
      const j = await ensureJob();
      setProgress({ label: "Checking every row", done: 0, total: 0 });
      const res = await validateImportApi(j.id, { mapping, options });
      setProgress(null);
      if (!res.ok) return res.problems?.length ? res.problems.join(" ") : res.error || "Couldn't check the import.";
      setValidation(res);
      setFilter(res.counts.error ? "error" : "all");
      return "";
    } catch (e) {
      setProgress(null);
      return e?.message || "Couldn't check the import.";
    }
  };

  const ready = validation ? (validation.counts.valid || 0) + (validation.counts.warning || 0) : 0;

  const runImport = async () => {
    if (!validation) return "Check the file first.";
    if (validation.counts.problems?.length) return validation.counts.problems[0];
    if (!ready) return validation.counts.skipped ? "Everything in this file is already in Geiger." : "Nothing is ready to import — fix the rows listed and import the file again.";
    if (sandbox) {
      const res = await sandboxCommit(sandboxRun.current.plan);
      if (!res.ok) return res.error;
      sandboxRun.current.written = res.written;
      setOutcome(res.counts);
      return "";
    }
    let res;
    let done = 0;
    do {
      setProgress({ label: "Importing", done, total: ready });
      res = await commitImportChunkApi(job.id);
      if (!res.ok) {
        setProgress(null);
        onChanged?.();
        return res.error || "The import stopped — open it from the history to finish.";
      }
      done += res.processed || 0;
    } while (!res.done);
    setProgress(null);
    setOutcome(res.counts);
    onChanged?.();
    return "";
  };

  const rollback = async () => {
    setRolling(true);
    const res = sandbox ? await sandboxRollback(sandboxRun.current.written) : await rollbackImportApi(job.id);
    setRolling(false);
    setConfirmRollback(false);
    if (!res.ok) return toast.error(res.error || "Couldn't roll the import back.");
    setRolledBack(res);
    toast.success(`Rolled back: ${res.removed} record${res.removed === 1 ? "" : "s"} removed${res.restored ? `, ${res.restored} restored` : ""}${res.voided ? `, ${res.voided} opening entries voided` : ""}.`);
    onChanged?.();
  };

  const downloadTemplate = (kind) => {
    if (kind === "csv") downloadText(templateFileName(entity, "csv"), importTemplateCsv(entity, { custom }));
    else downloadBlob(templateFileName(entity, "xlsx"), new Blob([importTemplateWorkbook(entity, { custom })], { type: XLSX_MIME }));
  };

  if (open && !canImport) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Import data</DialogTitle>
            <DialogDescription>{NO_IMPORT}</DialogDescription>
          </DialogHeader>
          <NoAccessState title="imports" description={NO_IMPORT} />
        </DialogContent>
      </Dialog>
    );
  }

  const steps = [
    {
      key: "upload",
      title: "Upload",
      validate: () => {
        if (!file) return "Pick a file to import.";
        if (!file.records.length) return "The file has no rows under its header.";
        if (file.records.length > MAX_ROWS_PER_IMPORT) return `Import at most ${MAX_ROWS_PER_IMPORT.toLocaleString("en-US")} rows at a time — split the file.`;
        if (balance && sandbox) return SANDBOX_BALANCES;
        if (balance && !isMonthStart(options.cutoverDate)) return "Pick the cutover date — the first day of a month.";
        return "";
      },
      render: () => (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="What are you importing?" htmlFor="imp-entity" hint={spec.description}>
              <Select value={entity} onValueChange={chooseEntity}>
                <SelectTrigger id="imp-entity" className="bg-surface-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ENTITY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Exported from" htmlFor="imp-source" hint="Its column names and status words are recognised.">
              <Select value={source} onValueChange={chooseSource}>
                <SelectTrigger id="imp-source" className="bg-surface-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SOURCE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="File" htmlFor="imp-file" hint="CSV, TSV or Excel (.xlsx). It's read here, and kept privately with the import.">
            <FileInput id="imp-file" accept={IMPORT_ACCEPT} disabled={reading} onChange={pickFile} />
          </Field>
          {reading ? (
            <p className="flex items-center gap-2 text-sm text-text-secondary">
              <Loader2 className="h-4 w-4 animate-spin" /> Reading the file…
            </p>
          ) : file ? (
            <div className="space-y-3">
              <p className="flex items-center gap-2 text-sm text-foreground">
                <FileSpreadsheet className="h-4 w-4 text-text-secondary" />
                {file.name} · {file.records.length.toLocaleString("en-US")} rows · headers on row {file.headerIndex + 1}
              </p>
              {detected ? (
                <Callout tone="success">
                  <span className="inline-flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4" /> Looks like {detected.label} — importing it as {importLabel(detected.entity)}.
                  </span>
                </Callout>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2">
                {file.sheets.length > 1 ? (
                  <Field label="Worksheet" htmlFor="imp-sheet">
                    <Select value={file.sheet} onValueChange={pickSheet}>
                      <SelectTrigger id="imp-sheet" className="bg-surface-card">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {file.sheets.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                ) : null}
                <Field label="Header row" htmlFor="imp-header" hint="Reports often open with a title — pick the row with the column names.">
                  <Select value={String(file.headerIndex)} onValueChange={pickHeaderRow}>
                    <SelectTrigger id="imp-header" className="bg-surface-card">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {file.rows.slice(0, 15).map((r, i) => (
                        <SelectItem key={i} value={String(i)}>
                          Row {i + 1}: {r.filter((x) => String(x ?? "").trim()).slice(0, 3).join(", ") || "(blank)"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </div>
          ) : null}
          <SettingsList>
            {!balance ? (
              <SettingRow
                title="Records already in Geiger"
                description="Matched by name, email or unit number."
                control={
                  <Select value={options.dedupe} onValueChange={(v) => setOpt({ dedupe: v })}>
                    <SelectTrigger className="h-9 w-64 bg-surface-card text-sm" aria-label="Records already in Geiger">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DEDUPE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                }
              />
            ) : null}
            {CREATE_MISSING.includes(entity) ? (
              <SettingRow
                title="Create missing properties and units"
                description="Off: a row naming a unit Geiger doesn't have is an error. On: the unit (and property) is created — use it for a rent roll that lists every unit."
                control={<Switch checked={Boolean(options.createMissing)} onCheckedChange={(v) => setOpt({ createMissing: Boolean(v) })} aria-label="Create missing properties and units" />}
              />
            ) : null}
            {entity === "leases" ? (
              <SettingRow
                title="Geiger starts billing rent on"
                description="Live leases get their rent schedule and rent account now; nothing bills before this date (your old system's balances come in as opening balances)."
                control={<Input type="date" value={options.billingStartsOn || ""} onChange={(e) => setOpt({ billingStartsOn: e.target.value })} className="h-9 w-44 bg-surface-card" aria-label="Billing starts on" />}
              />
            ) : null}
            {balance ? (
              <>
                <SettingRow
                  title="Cutover date"
                  description={options.cutoverDate && isMonthStart(options.cutoverDate) ? `Balances are as of the close of ${formatDate(new Date(Date.parse(`${options.cutoverDate}T00:00:00Z`) - 86400000).toISOString().slice(0, 10))}.` : "The first day of a month; balances are as of the day before."}
                  control={<Input type="date" value={options.cutoverDate || ""} onChange={(e) => setOpt({ cutoverDate: e.target.value })} className="h-9 w-44 bg-surface-card" aria-label="Cutover date" />}
                />
                {entity === "open_balances" ? (
                  <SettingRow
                    title="Tenant balances"
                    description="Balance forward suits a delinquency or aged-receivables report; itemized suits a list of open charges."
                    control={
                      <Select value={options.balanceMode} onValueChange={(v) => setOpt({ balanceMode: v })}>
                        <SelectTrigger className="h-9 w-72 bg-surface-card text-sm" aria-label="Tenant balances">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {BALANCE_MODES.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    }
                  />
                ) : null}
                <SettingRow
                  title="Opening-balance batch"
                  description="Balances from several files (receivables, deposits, owner balances, the trial balance) go into one batch, which posts when it ties out."
                  control={
                    <Select
                      value={options.batchId || NEW_BATCH}
                      onValueChange={(v) => {
                        const b = batches.find((x) => x.id === v);
                        setOpt(v === NEW_BATCH ? { batchId: "" } : { batchId: v, cutoverDate: b?.cutoverDate || options.cutoverDate });
                      }}
                    >
                      <SelectTrigger className="h-9 w-64 bg-surface-card text-sm" aria-label="Opening-balance batch">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NEW_BATCH}>A new batch</SelectItem>
                        {batches.map((b) => (
                          <SelectItem key={b.id} value={b.id}>
                            {b.name || "Draft batch"} · cutover {formatDate(b.cutoverDate)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  }
                />
                <SettingRow
                  title="Post when it ties out"
                  description={canConvert ? "When Opening Balance Equity nets to $0.00 the batch posts to the ledger; otherwise it waits as a draft." : "Your role can't post opening balances — the batch waits as a draft for someone who can."}
                  control={<Switch checked={canConvert && options.post !== false} disabled={!canConvert} onCheckedChange={(v) => setOpt({ post: Boolean(v) })} aria-label="Post when it ties out" />}
                />
              </>
            ) : null}
          </SettingsList>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-text-secondary">Template for {importLabel(entity).toLowerCase()}:</span>
            <Button variant="outline" size="sm" className="border-border bg-surface-card" onClick={() => downloadTemplate("csv")}>
              <Download className="h-4 w-4" /> CSV
            </Button>
            <Button variant="outline" size="sm" className="border-border bg-surface-card" onClick={() => downloadTemplate("xlsx")}>
              <Download className="h-4 w-4" /> Excel
            </Button>
          </div>
        </div>
      ),
    },
    {
      key: "map",
      title: "Map columns",
      validate: runValidation,
      nextLabel: "Check rows",
      render: () => (
        <MappingPanel
          spec={spec}
          headers={headers}
          records={file?.records || []}
          mapping={mapping}
          how={how}
          savedFor={savedFor}
          notes={(h) => columnNote(source, entity, h)}
          onApplySaved={applySaved}
          onSetColumn={setColumn}
          mappingName={mappingName}
          onMappingName={setMappingName}
          placeholder={detected?.label || `${importLabel(entity)} export`}
          saving={savingMapping}
          onSave={saveMapping}
          progress={progress}
        />
      ),
    },
    {
      key: "review",
      title: "Review",
      validate: runImport,
      nextLabel: ready ? `Import ${ready.toLocaleString("en-US")} ${ready === 1 ? "row" : "rows"}` : "Import",
      render: () => <ReviewPanel validation={validation} balance={balance} filter={filter} onFilter={setFilter} progress={progress} />,
    },
    {
      key: "done",
      title: "Done",
      back: false,
      render: () => <DonePanel outcome={outcome} balance={balance} rolledBack={rolledBack} onRollback={() => setConfirmRollback(true)} />,
    },
  ];

  return (
    <>
      <WizardDialog
        open={open}
        onOpenChange={onOpenChange}
        title={`Import ${importLabel(entity).toLowerCase()}`}
        description="CSV or Excel from your old system, or a Geiger template. Nothing is written until you confirm the review."
        steps={steps}
        onFinish={() => true}
        finishLabel="Done"
        className="sm:max-w-5xl"
      />
      <Dialog open={confirmRollback} onOpenChange={(o) => !o && !rolling && setConfirmRollback(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Roll back this import?</DialogTitle>
            <DialogDescription>
              {BALANCE_ENTITIES.includes(entity)
                ? "Posted opening balances are voided — the whole batch, with every import that fed it — and their lines removed."
                : "Everything it created is removed (soft-deleted) and every field it changed is put back."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" className="text-muted-foreground hover:bg-surface-active hover:text-foreground" disabled={rolling} onClick={() => setConfirmRollback(false)}>
              Cancel
            </Button>
            <Button className="bg-red-600 text-white hover:bg-red-600/90" disabled={rolling} onClick={rollback}>
              {rolling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />} Roll back
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default ImportWizard;
