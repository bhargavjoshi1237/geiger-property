"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Download, FileUp, Trash2, Upload } from "lucide-react";

import { LogoLoading } from "@geiger/ui";
import { Button } from "@geiger/ui/button";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { DataTable, EmptyState, ScreenHeader, SectionCard, StatsBar, StatusPill } from "@/components/internal/shared/screen_kit";
import { RoleGate } from "@/components/internal/shared/role_gate";
import { StoredLink } from "@/components/internal/shared/stored_file";
import { usePermission } from "@/context/rbac-context";
import { SOURCE_LABELS, importLabel, importSpec } from "@/lib/data_io/import_spec";
import { importTemplateCsv, importTemplateWorkbook, templateFileName } from "@/lib/data_io/templates";
import { removeImportMappingApi } from "@/lib/data_io/api";
import { listImportJobs, listImportMappings } from "@/lib/supabase/import_jobs";
import { downloadBlob, downloadText } from "@/lib/export/download";
import { XLSX_MIME } from "@/lib/export/xlsx";
import { formatDate } from "@/components/internal/screens/accounting/shared";
import { IMPORT_KEY, JOB_STATUS_MAP, MIGRATION_STEPS, NO_IMPORT } from "./import/constants";
import { ImportWizard } from "./import/import_wizard";
import { ImportJobDialog } from "./import/import_job_dialog";

// Settings › Import & Export (PLAT-03): bring a portfolio over in dependency order — templates, the import wizard, the
// history of imports with their rows, and roll back.

const rowsLine = (job) => {
  const r = job.counts?.rows;
  if (!r) return job.counts?.total ? `${job.counts.total.toLocaleString("en-US")} rows` : "—";
  return [r.created && `${r.created} created`, r.updated && `${r.updated} updated`, r.skipped && `${r.skipped} skipped`, r.error && `${r.error} errors`, r.rolled_back && `${r.rolled_back} rolled back`].filter(Boolean).join(" · ") || "Nothing new";
};

function downloadTemplate(entity, kind) {
  if (kind === "csv") downloadText(templateFileName(entity, "csv"), importTemplateCsv(entity));
  else downloadBlob(templateFileName(entity, "xlsx"), new Blob([importTemplateWorkbook(entity)], { type: XLSX_MIME }));
}

export function ImportExportScreen() {
  const canImport = usePermission(IMPORT_KEY);
  const [jobs, setJobs] = useState(null);
  const [mappings, setMappings] = useState(null);
  const [wizard, setWizard] = useState(null);
  const [openJob, setOpenJob] = useState(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let alive = true;
    Promise.all([listImportJobs(), listImportMappings()]).then(([j, m]) => {
      if (!alive) return;
      if (j === null) toast.error("Couldn't load the import history.");
      setJobs(j || []);
      setMappings(m || []);
    });
    return () => {
      alive = false;
    };
  }, [version]);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  const done = useMemo(() => {
    const out = {};
    for (const j of jobs || []) if (j.status === "committed") out[j.entity] = (out[j.entity] || 0) + (j.counts?.rows?.created || 0) + (j.counts?.rows?.updated || 0);
    return out;
  }, [jobs]);

  const stats = useMemo(() => {
    const list = jobs || [];
    const committed = list.filter((j) => j.status === "committed");
    const sum = (k) => committed.reduce((s, j) => s + (j.counts?.rows?.[k] || 0), 0);
    const last = list[0];
    return [
      { label: "Imports", value: String(committed.length), footer: `${list.filter((j) => j.status === "rolled_back").length} rolled back` },
      { label: "Records created", value: String(sum("created")), footer: `${sum("updated")} updated` },
      { label: "Rows skipped", value: String(sum("skipped")), footer: "Already in Geiger" },
      { label: "Last import", value: last ? formatDate(last.createdAt) : "—", footer: last ? importLabel(last.entity) : "None yet" },
    ];
  }, [jobs]);

  const removeMapping = async (m) => {
    const res = await removeImportMappingApi(m.id);
    if (!res.ok) return toast.error(res.error || "Couldn't remove the mapping.");
    setMappings(res.mappings);
    toast.success(`Removed "${m.name}".`);
  };

  const newImport = (entity = "properties") => {
    if (!canImport) return toast.error(NO_IMPORT);
    setWizard(entity);
  };

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Import & Export"
        description="Bring your portfolio over from AppFolio, Buildium, Rent Manager, Yardi Breeze or a spreadsheet. Every import is checked row by row before anything is written, and can be rolled back."
        actions={
          <RoleGate allowed={canImport} reason={NO_IMPORT}>
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={!canImport} onClick={() => newImport()}>
              <Upload className="h-4 w-4" /> New Import
            </Button>
          </RoleGate>
        }
      />

      <StatsBar stats={stats} />

      <SectionCard title="Migration, step by step" description="Each import only refers to records the ones above it brought in. Templates show the columns Geiger reads; exports from your old system work as they are." bodyPadding={false}>
        <ul className="divide-y divide-border">
          {MIGRATION_STEPS.map((s, i) => {
            const n = done[s.entity];
            return (
              <li key={s.entity} className="flex flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
                    {n ? <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" /> : <span className="text-xs font-semibold tabular-nums text-text-tertiary">{i + 1}</span>}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{importLabel(s.entity)}</p>
                    <p className="text-xs text-text-secondary">
                      From: {s.from}
                      {n ? ` · ${n.toLocaleString("en-US")} imported` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2 pl-8 sm:pl-0">
                  <Button variant="ghost" size="sm" className="text-text-secondary hover:bg-surface-active hover:text-foreground" onClick={() => downloadTemplate(s.entity, "csv")} aria-label={`${importLabel(s.entity)} CSV template`}>
                    <Download className="h-3.5 w-3.5" /> CSV
                  </Button>
                  <Button variant="ghost" size="sm" className="text-text-secondary hover:bg-surface-active hover:text-foreground" onClick={() => downloadTemplate(s.entity, "xlsx")} aria-label={`${importLabel(s.entity)} Excel template`}>
                    <Download className="h-3.5 w-3.5" /> Excel
                  </Button>
                  <RoleGate allowed={canImport} reason={NO_IMPORT}>
                    <Button variant="outline" size="sm" className="border-border bg-surface-card" disabled={!canImport} onClick={() => newImport(s.entity)}>
                      <FileUp className="h-3.5 w-3.5" /> Import
                    </Button>
                  </RoleGate>
                </div>
              </li>
            );
          })}
        </ul>
      </SectionCard>

      <SectionCard title="Import history" description="Open an import to see every row, finish one that stopped, or roll it back." bodyPadding={false}>
        {jobs === null ? (
          <div className="flex justify-center py-10">
            <LogoLoading size={48} aria-label="Loading the import history" />
          </div>
        ) : (
          <DataTable
            columns={[
              {
                key: "file",
                header: "File",
                render: (j) => (
                  <div className="flex min-w-0 flex-col gap-0.5">
                    {j.file ? (
                      <StoredLink file={j.file} className="truncate font-medium text-foreground hover:underline" onClick={(e) => e.stopPropagation()}>
                        {j.fileName || "Import"}
                      </StoredLink>
                    ) : (
                      <span className="truncate font-medium text-foreground">{j.fileName || "Import"}</span>
                    )}
                    <span className="text-xs text-text-secondary">
                      {importLabel(j.entity)} · {SOURCE_LABELS[j.sourceSystem] || "File"}
                    </span>
                  </div>
                ),
              },
              { key: "rows", header: "Rows", className: "text-sm text-text-secondary", render: rowsLine },
              { key: "status", header: "Status", render: (j) => <StatusPill status={j.status} map={JOB_STATUS_MAP} /> },
              {
                key: "when",
                header: "When",
                className: "whitespace-nowrap text-sm text-text-secondary",
                render: (j) => (
                  <div className="flex flex-col">
                    <span>{formatDate(j.createdAt)}</span>
                    {j.createdByName ? <span className="text-xs text-text-tertiary">{j.createdByName}</span> : null}
                  </div>
                ),
              },
            ]}
            data={jobs}
            getRowKey={(j) => j.id}
            onRowClick={(j) => setOpenJob(j.id)}
            empty={
              <EmptyState
                icon={FileUp}
                title="No imports yet"
                description="Start with your properties, then work down the steps above."
                action={
                  canImport ? (
                    <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => newImport()}>
                      <Upload className="h-4 w-4" /> New Import
                    </Button>
                  ) : null
                }
              />
            }
            className="rounded-none border-0"
          />
        )}
      </SectionCard>

      {mappings?.length ? (
        <SectionCard title="Saved mappings" description="Matched first when a file has the same columns." bodyPadding={false}>
          <ul className="divide-y divide-border">
            {mappings.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{m.name}</p>
                  <p className="text-xs text-text-secondary">
                    {importLabel(m.entity)} · {SOURCE_LABELS[m.sourceSystem] || "File"} · {Object.keys(m.mapping || {}).length} of {importSpec(m.entity).fields.length} fields
                    {m.savedAt ? ` · ${formatDate(m.savedAt)}` : ""}
                  </p>
                </div>
                <RoleGate allowed={canImport} reason={NO_IMPORT}>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-text-secondary hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400" disabled={!canImport} onClick={() => removeMapping(m)} aria-label={`Remove ${m.name}`}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </RoleGate>
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}

      <ImportWizard open={Boolean(wizard)} onOpenChange={(o) => !o && setWizard(null)} initialEntity={wizard || "properties"} onChanged={reload} />
      <ImportJobDialog jobId={openJob} onOpenChange={(o) => !o && setOpenJob(null)} onChanged={reload} />
    </MainScreenWrapper>
  );
}

export default ImportExportScreen;
