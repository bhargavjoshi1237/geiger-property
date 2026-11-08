"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Play, Undo2 } from "lucide-react";

import { LogoLoading } from "@geiger/ui";
import { Button } from "@geiger/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@geiger/ui/dialog";
import { Progress } from "@geiger/ui/progress";
import { StatusPill } from "@/components/internal/shared/screen_kit";
import { SegmentedTabs } from "@/components/internal/shared/segmented_tabs";
import { StoredLink } from "@/components/internal/shared/stored_file";
import { RoleGate } from "@/components/internal/shared/role_gate";
import { usePermission } from "@/context/rbac-context";
import { SOURCE_LABELS, importLabel, isBalanceEntity } from "@/lib/data_io/import_spec";
import { commitImportChunkApi, rollbackImportApi } from "@/lib/data_io/api";
import { getImportJob, listImportRows } from "@/lib/supabase/import_jobs";
import { formatDate } from "@/components/internal/screens/accounting/shared";
import { IMPORT_KEY, JOB_STATUS_MAP, NO_IMPORT } from "./constants";
import { BatchSummary, Callout, RowsTable, Tiles } from "./import_kit";

// One import from the history (PLAT-03): its rows by status, the balance batch it fed, and finish / roll back.

const PAGE = 200;
const FILTERS = [
  { value: "all", label: "All" },
  { value: "created", label: "Created" },
  { value: "updated", label: "Updated" },
  { value: "skipped", label: "Skipped" },
  { value: "error", label: "Errors" },
  { value: "rolled_back", label: "Rolled back" },
];
const GHOST = "text-muted-foreground hover:bg-surface-active hover:text-foreground";

export function ImportJobDialog({ jobId, onOpenChange, onChanged }) {
  const canImport = usePermission(IMPORT_KEY);
  const [job, setJob] = useState(null);
  const [rows, setRows] = useState(null);
  const [count, setCount] = useState(0);
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState("");
  const [progress, setProgress] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!jobId) return undefined;
    let alive = true;
    Promise.all([getImportJob(jobId), listImportRows(jobId, { status: filter === "all" ? undefined : filter, limit: PAGE })]).then(([j, r]) => {
      if (!alive) return;
      setJob(j);
      setRows(r?.rows || []);
      setCount(r?.count || 0);
    });
    return () => {
      alive = false;
    };
  }, [jobId, filter, version]);

  const close = () => {
    setJob(null);
    setRows(null);
    setFilter("all");
    onOpenChange(false);
  };

  const more = async () => {
    setBusy("more");
    const r = await listImportRows(jobId, { status: filter === "all" ? undefined : filter, from: rows.length, limit: PAGE });
    setBusy("");
    if (r) setRows((x) => [...x, ...r.rows]);
  };

  // Validated, stopped or half-done imports finish from here: the server still holds the rows.
  const finish = async () => {
    setBusy("commit");
    let res;
    let done = 0;
    do {
      setProgress(done);
      res = await commitImportChunkApi(jobId);
      if (!res.ok) break;
      done += res.processed || 0;
    } while (!res.done);
    setBusy("");
    setProgress(null);
    if (!res.ok) toast.error(res.error || "The import stopped.");
    else toast.success("Import finished.");
    setVersion((v) => v + 1);
    onChanged?.();
  };

  const rollback = async () => {
    setBusy("rollback");
    const res = await rollbackImportApi(jobId);
    setBusy("");
    setConfirm(false);
    if (!res.ok) return toast.error(res.error || "Couldn't roll the import back.");
    toast.success(`Rolled back: ${res.removed} record${res.removed === 1 ? "" : "s"} removed${res.restored ? `, ${res.restored} restored` : ""}${res.voided ? `, ${res.voided} opening entries voided` : ""}.`);
    setVersion((v) => v + 1);
    onChanged?.();
  };

  const c = job?.counts?.rows || {};
  const ready = (job?.counts?.valid || 0) + (job?.counts?.warning || 0);
  const canFinish = job && ["validated", "committing", "failed"].includes(job.status) && !job.counts?.problems?.length;
  const canRollback = job && ["committed", "failed"].includes(job.status);

  return (
    <>
      <Dialog open={Boolean(jobId)} onOpenChange={(o) => !o && !busy && close()}>
        <DialogContent className="gap-0 overflow-hidden bg-background p-0 sm:max-w-4xl">
          <DialogHeader className="space-y-0.5 border-b border-border p-5 text-left">
            <DialogTitle className="flex flex-wrap items-center gap-2 text-base">
              {job?.fileName || "Import"} {job ? <StatusPill status={job.status} map={JOB_STATUS_MAP} /> : null}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {job ? `${importLabel(job.entity)} · ${SOURCE_LABELS[job.sourceSystem] || "File"} · ${formatDate(job.createdAt)}${job.createdByName ? ` · ${job.createdByName}` : ""}` : "Loading…"}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[65vh] space-y-4 overflow-y-auto p-5">
            {!job || rows === null ? (
              <div className="flex justify-center py-10">
                <LogoLoading size={40} aria-label="Loading the import" />
              </div>
            ) : (
              <>
                {job.status === "validated" || job.status === "uploaded" || job.status === "mapped" ? (
                  <Tiles
                    items={[
                      { label: "Rows", value: String(job.counts.total || 0) },
                      { label: "Ready", value: String(ready) },
                      { label: "Errors", value: String(job.counts.error || 0), tone: job.counts.error ? "text-red-600 dark:text-red-400" : "" },
                      { label: "Already in Geiger", value: String(job.counts.skipped || 0) },
                    ]}
                  />
                ) : (
                  <Tiles
                    items={[
                      { label: "Created", value: String(c.created || 0) },
                      { label: "Updated", value: String(c.updated || 0) },
                      { label: "Skipped", value: String(c.skipped || 0) },
                      { label: "Errors", value: String(c.error || 0), tone: c.error ? "text-red-600 dark:text-red-400" : "" },
                    ]}
                  />
                )}
                {job.error ? <Callout tone="danger">The import stopped: {job.error}</Callout> : null}
                {job.counts?.problems?.length ? <Callout tone="danger">{job.counts.problems.join(" ")}</Callout> : null}
                {job.counts?.rollback ? (
                  <Callout>
                    Rolled back {formatDate(job.rolledBackAt)}
                    {job.counts.rollback.by ? ` by ${job.counts.rollback.by}` : ""}
                    {job.counts.rollback.viaJob ? " with the opening-balance batch it fed" : ""}.
                  </Callout>
                ) : null}
                {isBalanceEntity(job.entity) && job.counts?.batch?.tieOut ? <BatchSummary batch={job.counts.batch} /> : isBalanceEntity(job.entity) && job.counts?.balances ? <BatchSummary preview={job.counts.balances} /> : null}
                {job.file ? (
                  <p className="text-xs text-text-secondary">
                    Original file:{" "}
                    <StoredLink file={job.file} className="font-medium text-foreground hover:underline">
                      {job.fileName || "download"}
                    </StoredLink>
                  </p>
                ) : null}
                <SegmentedTabs tabs={FILTERS} value={filter} onChange={setFilter} />
                <RowsTable rows={rows} empty={<p className="px-4 py-6 text-sm text-text-secondary">No rows here.</p>} />
                {rows.length < count ? (
                  <Button variant="outline" size="sm" className="border-border bg-surface-card" disabled={busy === "more"} onClick={more}>
                    {busy === "more" ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Show more ({(count - rows.length).toLocaleString("en-US")} left)
                  </Button>
                ) : null}
                {progress !== null ? (
                  <div className="space-y-1.5">
                    <p className="flex items-center gap-2 text-sm text-text-secondary">
                      <Loader2 className="h-4 w-4 animate-spin" /> Importing — {progress.toLocaleString("en-US")} of {ready.toLocaleString("en-US")} rows
                    </p>
                    <Progress value={ready ? (progress / ready) * 100 : 0} aria-label="Import progress" />
                  </div>
                ) : null}
              </>
            )}
          </div>
          <DialogFooter className="border-t border-border bg-surface-subtle/40 px-5 py-4">
            <Button variant="ghost" className={GHOST} disabled={Boolean(busy)} onClick={close}>
              Close
            </Button>
            {canRollback ? (
              <RoleGate allowed={canImport} reason={NO_IMPORT}>
                <Button variant="outline" className="border-border bg-surface-card" disabled={!canImport || Boolean(busy)} onClick={() => setConfirm(true)}>
                  <Undo2 className="h-4 w-4" /> Roll back
                </Button>
              </RoleGate>
            ) : null}
            {canFinish ? (
              <RoleGate allowed={canImport} reason={NO_IMPORT}>
                <Button className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={!canImport || Boolean(busy) || (job.status === "validated" && !ready)} onClick={finish}>
                  {busy === "commit" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  {job.status === "validated" ? `Import ${ready} ${ready === 1 ? "row" : "rows"}` : "Finish import"}
                </Button>
              </RoleGate>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={confirm} onOpenChange={(o) => !o && busy !== "rollback" && setConfirm(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Roll back this import?</DialogTitle>
            <DialogDescription>
              {job && isBalanceEntity(job.entity)
                ? "Posted opening balances are voided — the whole batch, with every import that fed it — and their lines removed."
                : "Everything it created is removed (soft-deleted) and every field it changed is put back. It's refused while anything depends on it."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" className={GHOST} disabled={busy === "rollback"} onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button className="bg-red-600 text-white hover:bg-red-600/90" disabled={busy === "rollback"} onClick={rollback}>
              {busy === "rollback" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />} Roll back
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default ImportJobDialog;
