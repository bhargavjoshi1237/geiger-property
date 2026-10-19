"use client";

import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, Copy, Loader2, Trash2 } from "lucide-react";

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
  const { can } = useRbac();
  const canDelete = usePermission("records.delete") && (!config.deletePermission || can(config.deletePermission));

  const navGroups = useMemo(
    () =>
      config.navGroups
        .map((g) => ({
          ...g,
          items: g.items.filter((i) => (i.showIf ? i.showIf(form) : true)),
        }))
        .filter((g) => g.items.length),
    [config.navGroups, form],
  );
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
  const configActions = resolveList(config.actions, form).filter(
    (a) => (a.showIf ? a.showIf(form) : true) && (!a.permission || can(a.permission)),
  );

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
    }
    return ok;
  };

  const ActiveSection = config.sections[activeItem?.key] || config.sections.overview;
  const backLabel = config.title || `All ${config.plural}`;
  const headerMeta = config.headerMeta ? config.headerMeta(form) : null;

  const ghostButton = "border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground";

  return (
    <EditorShell
      back={{ label: backLabel, onClick: onBack }}
      title={title}
      status={form.status}
      statusMap={config.statusMap}
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
              initial={wizard.wizard.initial ? wizard.wizard.initial(form) : {}}
              finishLabel={wizard.wizard.finishLabel}
              onFinish={finishWizard}
            />
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
          {...(config.sectionProps?.[shownItem?.key] || {})}
        />
      )}
    </EditorShell>
  );
}

export default EntityDetailScreen;
