"use client";

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, Copy, History, Loader2, Play, Trash2 } from "lucide-react";

import { EditorShell } from "@/components/internal/shared/editor_shell";
import { WizardDialog } from "@/components/internal/shared/wizard_dialog";
import { Button } from "@geiger/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@geiger/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@geiger/ui/dropdown-menu";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { logSystemActivity } from "@/lib/supabase/activity_log";
import { usePermission, useRbac } from "@/context/rbac-context";
import { LaunchDialog } from "@/components/internal/screens/orchestration/launch_dialog";
import {
  RecordAutomationRunsSection,
  RecordReviewBanner,
  canLaunchOn,
  recordTypeForEntity,
} from "@/components/internal/screens/orchestration/record_automation";
import { markSignalActioned, takePendingAction } from "@/lib/orchestration/pending_action";
import { reviewAction } from "@/lib/orchestration/api";

// Config-driven entity editor on the suite EditorShell (geiger-events' event editor); fields persist via data.update / data.mergeMeta and the section lives in ?section=.

const same = (a, b) => (a ?? "") === (b ?? "") || JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const short = (v) => (v && typeof v === "object" ? "…" : v ?? "");

// { key: [before, after] } for keys that actually changed.
function diff(before, patch) {
  const out = {};
  for (const [k, v] of Object.entries(patch)) {
    if (k === "metadata" || same(before?.[k], v)) continue;
    out[k] = [short(before?.[k]), short(v)];
  }
  return out;
}

const resolveList = (value, item) => (typeof value === "function" ? value(item) : value) || [];

// Records that automations run on get an "Automation Runs" section (ORCH-02).
const AUTOMATION_NAV = {
  group: "Automation",
  items: [{ key: "automation_runs", label: "Automation Runs", icon: History, desc: "Every workflow run for this record, and why it ran (or didn't)." }],
};

export function EntityDetailScreen({
  item,
  config,
  data,
  onBack,
  onRowChange,
  onDelete,
  onDuplicate,
  onReload,
}) {
  const { section: active, setSection: setActive } = useWorkspaceUrl();

  // Editable working copy; sections read it and write through patch/commit.
  const [form, setForm] = useState(item);
  const formRef = useRef(item);
  useLayoutEffect(() => {
    formRef.current = form;
  }, [form]);

  // Unsaved keys typed but not yet committed: { key: "col" | "meta" }.
  const [dirty, setDirty] = useState({});
  const dirtyCount = Object.keys(dirty).length;

  // Re-seed when a different item opens, or the row refreshed with nothing pending.
  const [seed, setSeed] = useState(item);
  if (item !== seed) {
    setSeed(item);
    if (item?.id !== seed?.id || dirtyCount === 0) {
      setForm(item);
      if (item?.id !== seed?.id) setDirty({});
    }
  }

  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [wizard, setWizard] = useState(null);
  const [launchOpen, setLaunchOpen] = useState(false);
  const { can } = useRbac();
  const recordType = recordTypeForEntity(config.key);
  const canDelete = usePermission("records.delete") && (!config.deletePermission || can(config.deletePermission));

  const navGroups = useMemo(
    () =>
      [
        ...config.navGroups,
        ...(recordType && !config.navGroups.some((g) => g.items.some((i) => i.key === "automation_runs")) ? [AUTOMATION_NAV] : []),
      ]
        .map((g) => ({
          ...g,
          items: g.items.filter((i) => (i.showIf ? i.showIf(form) : true)),
        }))
        .filter((g) => g.items.length),
    [config.navGroups, form, recordType],
  );

  // A hand-off from a signal / review item opens this record's wizard pre-filled (ORCH-08).
  const itemId = item?.id;
  useEffect(() => {
    const pending = takePendingAction(itemId);
    if (!pending) return;
    const action = resolveList(config.actions, formRef.current).find((a) => a.key === pending.actionKey && a.wizard);
    if (action) setWizard({ ...action, pending });
  }, [itemId, config.actions]);
  const allNavItems = navGroups.flatMap((g) => g.items);
  const activeItem = allNavItems.find((i) => i.key === active) || allNavItems[0];

  if (!item) return null;

  const ownerType = config.key;
  const titleField = config.titleField || "name";
  const title = form[titleField];

  const apply = (next) => {
    formRef.current = next;
    setForm(next);
    onRowChange?.(next);
  };

  const clearDirty = (keys) =>
    setDirty((d) => {
      const out = { ...d };
      for (const k of keys) delete out[k];
      return out;
    });

  // Local edit (typing): reflect immediately, mark dirty, persist later.
  const patch = (partial) => {
    const cur = formRef.current;
    apply({ ...cur, ...partial });
    const metaKeys = partial.metadata ? Object.keys(partial.metadata) : [];
    setDirty((d) => {
      const out = { ...d };
      for (const k of Object.keys(partial)) {
        if (k === "metadata") continue;
        out[k] = metaKeys.includes(k) && !(data?.columnKeys || []).includes(k) ? "meta" : "col";
      }
      return out;
    });
  };

  // Persist column keys; roll back on failure. Resolves true/false.
  const commit = async (partial) => {
    const before = formRef.current;
    const changes = diff(before, partial);
    const metaChanged = "metadata" in partial && !same(before.metadata, partial.metadata);
    apply({ ...before, ...partial });
    clearDirty(Object.keys(partial));
    if (!Object.keys(changes).length && !metaChanged) return true;
    if (data?.update) {
      const saved = await data.update(before.id, partial);
      if (!saved) {
        const reverted = { ...formRef.current };
        for (const k of Object.keys(partial)) reverted[k] = before[k];
        apply(reverted);
        toast.error("Couldn't save that change.");
        return false;
      }
    }
    if (Object.keys(changes).length) {
      logSystemActivity(ownerType, before.id, "updated", `Updated ${Object.keys(changes).join(", ")}`, changes);
    }
    return true;
  };

  // Persist metadata keys through the shallow-merge RPC; roll back on failure.
  const commitMeta = async (metaPatch) => {
    const before = formRef.current;
    const prevMeta = before.metadata || {};
    const changes = diff(prevMeta, metaPatch);
    apply({ ...before, ...metaPatch, metadata: { ...prevMeta, ...metaPatch } });
    clearDirty(Object.keys(metaPatch));
    if (!Object.keys(changes).length) return true;
    const ok = data?.mergeMeta
      ? await data.mergeMeta(before.id, metaPatch)
      : data?.update
        ? await data.update(before.id, { metadata: { ...prevMeta, ...metaPatch } })
        : true;
    if (!ok) {
      const cur = formRef.current;
      const reverted = { ...cur, metadata: { ...(cur.metadata || {}) } };
      for (const k of Object.keys(metaPatch)) {
        reverted[k] = prevMeta[k];
        reverted.metadata[k] = prevMeta[k];
      }
      apply(reverted);
      toast.error("Couldn't save that change.");
      return false;
    }
    logSystemActivity(ownerType, before.id, "updated", `Updated ${Object.keys(changes).join(", ")}`, changes);
    return true;
  };

  // Persist everything still pending from typing.
  const save = async () => {
    const cur = formRef.current;
    const colPartial = {};
    const metaPatch = {};
    for (const [k, kind] of Object.entries(dirty)) {
      if (kind === "meta") metaPatch[k] = cur.metadata?.[k] ?? cur[k];
      else colPartial[k] = cur[k];
    }
    setSaving(true);
    const results = await Promise.all([
      Object.keys(colPartial).length ? commit(colPartial) : true,
      Object.keys(metaPatch).length ? commitMeta(metaPatch) : true,
    ]);
    setSaving(false);
    if (results.every(Boolean)) toast.success("Changes saved.");
  };

  // Context handed to config actions and wizard finishers.
  const ctx = {
    item: form,
    data,
    commit,
    commitMeta,
    reload: () => onReload?.(),
    navigate: setActive,
    log: (summary, changes) => logSystemActivity(ownerType, form.id, "action", summary, changes),
  };

  // Actions can carry an advisory `permission` key (e.g. "accounting.post").
  const configActions = [
    ...resolveList(config.actions, form).filter((a) => (a.showIf ? a.showIf(form) : true) && (!a.permission || can(a.permission))),
    ...(canLaunchOn(recordType) && can("automations.run")
      ? [{ key: "run_workflow", label: "Run workflow…", icon: Play, separatorBefore: true, run: () => setLaunchOpen(true) }]
      : []),
  ];

  const runAction = async (action) => {
    if (action.wizard) {
      setWizard(action);
      return;
    }
    try {
      await action.run?.(ctx);
    } catch (e) {
      console.error(`[${ownerType}.action.${action.key}]`, e);
      toast.error(`Couldn't ${action.label.toLowerCase()}.`);
    }
  };

  const finishWizard = async (values) => {
    const ok = await wizard.wizard.finish(values, ctx);
    if (ok !== false) {
      ctx.log(wizard.wizard.logSummary || wizard.label);
      // Finishing a handed-off wizard closes the review item / actions the signal it came from.
      const from = wizard.pending;
      if (from?.reviewItemId) {
        const res = await reviewAction(from.reviewItemId, "resolve", { note: `Completed "${wizard.wizard.title || wizard.label}"` });
        if (res.ok) toast.success("Review item resolved.");
      }
      if (from?.signalId) await markSignalActioned(from.signalId);
    }
    return ok;
  };

  const ActiveSection =
    config.sections[activeItem?.key] || (activeItem?.key === "automation_runs" ? RecordAutomationRunsSection : config.sections.overview);
  const backLabel = config.title || `All ${config.plural}`;
  const headerMeta = config.headerMeta ? config.headerMeta(form) : null;
  const headerBadges = config.headerBadges ? config.headerBadges(form) : null;

  const ghostButton = "border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground";

  return (
    <EditorShell
      back={{ label: backLabel, onClick: onBack }}
      title={title}
      status={form.status}
      statusMap={config.statusMap}
      badges={headerBadges}
      meta={headerMeta}
      actions={
        <>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className={ghostButton}>
                Actions <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {configActions.map((a) => {
                const Icon = a.icon;
                return (
                  <React.Fragment key={a.key}>
                    {a.separatorBefore ? <DropdownMenuSeparator /> : null}
                    <DropdownMenuItem
                      variant={a.danger ? "destructive" : undefined}
                      className="cursor-pointer gap-2"
                      onClick={() => runAction(a)}
                    >
                      {Icon ? <Icon className="h-4 w-4" /> : null}
                      {a.label}
                    </DropdownMenuItem>
                  </React.Fragment>
                );
              })}
              {configActions.length && (onDuplicate || canDelete) ? <DropdownMenuSeparator /> : null}
              {onDuplicate ? (
                <DropdownMenuItem className="cursor-pointer gap-2" onClick={() => onDuplicate(form)}>
                  <Copy className="h-4 w-4" /> Duplicate
                </DropdownMenuItem>
              ) : null}
              {canDelete ? (
                <DropdownMenuItem variant="destructive" className="cursor-pointer gap-2" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="h-4 w-4" /> Delete
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={save}
            disabled={saving || dirtyCount === 0}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {dirtyCount ? "Save Changes" : "Saved"}
          </Button>
        </>
      }
      nav={navGroups}
      subject={form}
      active={activeItem?.key}
      onActiveChange={setActive}
      after={
        <>
          {wizard ? (
            <WizardDialog
              open={Boolean(wizard)}
              onOpenChange={(o) => !o && setWizard(null)}
              title={wizard.wizard.title || wizard.label}
              description={wizard.wizard.description}
              steps={wizard.wizard.steps}
              initial={{ ...(wizard.wizard.initial ? wizard.wizard.initial(form) : {}), ...(wizard.pending?.initial || {}) }}
              finishLabel={wizard.wizard.finishLabel}
              onFinish={finishWizard}
            />
          ) : null}

          {canLaunchOn(recordType) ? (
            <LaunchDialog open={launchOpen} onOpenChange={setLaunchOpen} recordType={recordType} recordIds={[form.id]} onDone={() => onReload?.()} />
          ) : null}

          <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Delete {config.singular.toLowerCase()}</DialogTitle>
                <DialogDescription>
                  Are you sure you want to delete <span className="font-medium text-foreground">{title}</span>?
                  This action can&apos;t be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                  Cancel
                </Button>
                <Button
                  className="bg-red-500/90 text-white hover:bg-red-500"
                  onClick={() => {
                    setConfirmDelete(false);
                    onDelete?.(form);
                  }}
                >
                  <Trash2 className="h-4 w-4" /> Delete
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      }
    >
      {({ activeItem: shownItem }) => (
        <>
          {recordType ? <RecordReviewBanner recordType={recordType} recordId={form.id} /> : null}
          <ActiveSection
          item={form}
          config={config}
          data={data}
          headerItem={shownItem}
          onPatch={patch}
          onCommit={commit}
          onCommitMeta={commitMeta}
          onNavigate={setActive}
          onBack={onBack}
          onDelete={onDelete}
          onReload={onReload}
          runAction={(key) => {
            const a = configActions.find((x) => x.key === key);
            if (a) runAction(a);
          }}
          recordType={recordType}
          {...(config.sectionProps?.[shownItem?.key] || {})}
        />
        </>
      )}
    </EditorShell>
  );
}

export default EntityDetailScreen;
