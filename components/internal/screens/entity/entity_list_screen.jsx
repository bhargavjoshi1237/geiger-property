"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy, Pencil, Plus, Trash2, X } from "lucide-react";

import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import {
  DataTable,
  EmptyState,
  Field,
  ListLoading,
  ScreenHeader,
  SearchInput,
  StatsBar,
  StatusPill,
  Toolbar,
} from "@/components/internal/shared/screen_kit";
import { Button } from "@geiger/ui/button";
import { Input } from "@geiger/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@geiger/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@geiger/ui/select";
import { ActionMenu } from "@geiger/ui/action-menu";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { logSystemActivity } from "@/lib/supabase/activity_log";
import { titleCase } from "@/lib/utils";
import { usePermission, useRbac } from "@/context/rbac-context";
import { RoleGate } from "@/components/internal/shared/role_gate";
import { EntityDetailScreen } from "./entity_detail_screen";

// Resolve the data-layer contract for a config. Areas that have built a Supabase
// module expose `config.data` = { list, create, update, softDelete, normalize }
// (see lib/supabase/tenants.js). Areas without one fall back to `demoRows` held
// in local state so the editor stays clickable while features are scaffolded.
function resolveDataSource(config) {
  if (config.data?.list) return config.data;
  return null;
}

// Create dialog built from config.createFields (text → Input, select → Select), framed like geiger-events' record dialog.
function CreateEntityDialog({ open, onOpenChange, config, onCreate }) {
  const [draft, setDraft] = useState(config.createDraft);
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));

  // Options for data-sourced dropdowns (createFields with `optionsFrom`), loaded
  // from config.loadCreateOptions() when the dialog opens — e.g. Tenant / Unit
  // pulled from their own listings. Keyed by the field's `optionsFrom`.
  const [dynamicOptions, setDynamicOptions] = useState({});
  useEffect(() => {
    if (!open || !config.loadCreateOptions) return;
    let alive = true;
    Promise.resolve(config.loadCreateOptions()).then((opts) => {
      if (alive) setDynamicOptions(opts || {});
    });
    return () => {
      alive = false;
    };
  }, [open, config]);

  // Reset the draft whenever the dialog reopens.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setDraft(config.createDraft);
  }

  const titleField = config.titleField || "name";

  const submit = () => {
    if (!String(draft[titleField] || "").trim()) {
      toast.error(`Give this ${config.singular.toLowerCase()} a name.`);
      return;
    }
    const missing = config.createFields
      .filter((f) => f.required && !String(draft[f.key] ?? "").trim())
      .map((f) => f.label);
    if (missing.length) {
      toast.error(`Fill in ${missing.join(", ")}.`);
      return;
    }
    onCreate(draft);
    onOpenChange(false);
  };

  const Icon = config.icon;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-0 overflow-hidden bg-background p-0">
        <DialogHeader className="flex-row items-center gap-3 space-y-0 border-b border-border p-5 text-left">
          {Icon ? (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-surface-subtle text-foreground">
              <Icon className="h-5 w-5" />
            </div>
          ) : null}
          <div className="min-w-0 space-y-0.5">
            <DialogTitle className="text-base">New {titleCase(config.singular)}</DialogTitle>
            <DialogDescription className="text-xs">
              Set the essentials now — you can fill in the rest in the editor.
            </DialogDescription>
          </div>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="grid max-h-[60vh] gap-4 overflow-y-auto p-5">
            {config.createFields.map((f) => {
              // Static options from the field, or data-sourced when `optionsFrom`.
              const opts = f.optionsFrom
                ? dynamicOptions[f.optionsFrom] || []
                : f.options || [];
              return (
                <Field key={f.key} label={f.label} htmlFor={`create-${f.key}`}>
                  {f.type === "select" ? (
                    <Select
                      value={draft[f.key] ?? ""}
                      onValueChange={(value) => {
                        // An option may carry a `patch` (e.g. a Unit prefilling
                        // rent) that's merged alongside the selected value.
                        const opt = opts.find((o) => o.value === value);
                        setDraft((d) => ({ ...d, [f.key]: value, ...(opt?.patch || {}) }));
                      }}
                    >
                      <SelectTrigger id={`create-${f.key}`}>
                        <SelectValue placeholder={f.placeholder || "Select…"} />
                      </SelectTrigger>
                      <SelectContent>
                        {opts.length === 0 ? (
                          <div className="px-2 py-1.5 text-sm text-muted-foreground">
                            {f.emptyLabel || "No options yet"}
                          </div>
                        ) : (
                          opts.map((o, i) => (
                            <SelectItem key={`${o.value}-${i}`} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      id={`create-${f.key}`}
                      type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                      value={draft[f.key] ?? ""}
                      onChange={(e) => set(f.key)(e.target.value)}
                      placeholder={f.placeholder}
                    />
                  )}
                </Field>
              );
            })}
          </div>
          <DialogFooter className="border-t border-border bg-surface-subtle/40 px-5 py-4">
            <Button
              type="button"
              variant="ghost"
              className="text-muted-foreground hover:bg-surface-active hover:text-foreground"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" className="bg-primary text-primary-foreground hover:bg-primary/90">
              <Plus className="h-4 w-4" /> Create {titleCase(config.singular)}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Config-driven list screen (port of geiger-events' all_events.jsx); areas without a data layer fall back to config.demoRows.
export function EntityListScreen({ config }) {
  const dataSource = resolveDataSource(config);
  const [rows, setRows] = useState(dataSource ? [] : config.demoRows);
  const [loading, setLoading] = useState(Boolean(dataSource));
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  // Extra toolbar filters: config.filters = [{ key, options | load(), match(row, value) }]; "all" = off.
  const extraFilters = config.filters || null;
  const [filterValues, setFilterValues] = useState({});
  const [filterOptions, setFilterOptions] = useState({});
  useEffect(() => {
    if (!extraFilters?.some((f) => f.load)) return;
    let alive = true;
    Promise.all(extraFilters.map((f) => (f.load ? f.load() : f.options))).then((lists) => {
      if (alive) setFilterOptions(Object.fromEntries(extraFilters.map((f, i) => [f.key, lists[i] || []])));
    });
    return () => {
      alive = false;
    };
  }, [extraFilters]);
  const activeFilters = useMemo(
    () => Object.entries(filterValues).filter(([, v]) => v && v !== "all"),
    [filterValues],
  );
  // Optional lenses over the same rows (config.views: [{ value, label, filter, createDefaults }]).
  const views = config.views || null;
  const defaultView = views?.[0]?.value ?? null;
  const [view, setView] = useState(defaultView);
  const activeView = views?.find((v) => v.value === view) || null;
  // Views sit in the filter row as a dropdown; a bare "All" reads as "All properties" there.
  const viewOptions = useMemo(
    () => views?.map((v) => ({ value: v.value, label: v.label === "All" ? `All ${config.plural.toLowerCase()}` : v.label })) || null,
    [views, config.plural],
  );
  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey((k) => k + 1);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  // config.createPermission gates New / Duplicate, config.deletePermission adds to
  // records.delete (e.g. records that post to or void ledger entries).
  const { can } = useRbac();
  const canDelete = usePermission("records.delete") && (!config.deletePermission || can(config.deletePermission));
  const canCreate = !config.createPermission || can(config.createPermission);
  const noCreate = config.createPermissionNote || `Your role can't create ${config.plural.toLowerCase()}.`;
  const { itemId, openItem, closeItem } = useWorkspaceUrl();

  const titleField = config.titleField || "name";

  // Fetch-on-mount from the data layer when the area has a Supabase module.
  // No static seed: start empty + loading, then render loading/empty/rows.
  useEffect(() => {
    if (!dataSource) return;
    let alive = true;
    // config.rowsLoader lets a screen join extra data (e.g. derived balances).
    (config.rowsLoader ? config.rowsLoader() : dataSource.list())
      .then((result) => {
        if (!alive) return;
        setRows(result ?? []);
        setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setRows([]);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [dataSource, config, reloadKey]);

  const selected = useMemo(
    () => (itemId ? rows.find((r) => r.id === itemId) || null : null),
    [itemId, rows],
  );

  const filtered = useMemo(() => {
    const fields = config.searchFields || [titleField];
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (activeView?.filter && !activeView.filter(r)) return false;
      if (status !== "all" && r.status !== status) return false;
      for (const [key, value] of activeFilters) {
        const f = extraFilters.find((x) => x.key === key);
        if (f && !f.match(r, value)) return false;
      }
      if (q) {
        const hay = fields
          .map((k) => r[k])
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, status, config, titleField, activeView, activeFilters, extraFilters]);

  const stats = useMemo(() => config.stats(rows), [rows, config]);

  const filtersOn = Boolean(search.trim() || status !== "all" || activeFilters.length || view !== defaultView);
  const clearFilters = () => {
    setSearch("");
    setStatus("all");
    setFilterValues({});
    setView(defaultView);
  };
  const pager = usePagination(filtered, {
    resetKey: [search, status, view, JSON.stringify(activeFilters)].join("|"),
  });

  const makeRow = (draft) => {
    const base = config.newRow ? config.newRow(draft) : { ...draft };
    const row = { ...(activeView?.createDefaults || {}), ...base };
    if (!row.id) row.id = crypto.randomUUID();
    return row;
  };

  const handleCreate = async (draft) => {
    if (!canCreate) {
      toast.error(noCreate);
      return;
    }
    const row = makeRow(draft);
    // Optimistic insert: show it instantly, persist, reconcile on failure.
    setRows((prev) => [row, ...prev]);
    if (dataSource) {
      const created = await dataSource.create(row);
      if (created) {
        setRows((prev) =>
          prev.map((r) => (r.id === row.id ? created : r)),
        );
        logSystemActivity(config.key, row.id, "created", `Created ${config.singular.toLowerCase()}`);
        toast.success(`"${row[titleField]}" created.`);
      } else {
        setRows((prev) => prev.filter((r) => r.id !== row.id));
        toast.error(`Couldn't create "${row[titleField]}".`);
      }
      return;
    }
    toast.success(`"${row[titleField]}" created as a draft.`);
  };

  // Detail edits persist themselves; this just mirrors them into the list.
  const handleRowChange = (updated) =>
    setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));

  const handleDuplicate = async (row) => {
    if (!canCreate) {
      toast.error(noCreate);
      return;
    }
    const { id: _id, createdAt: _c, ...rest } = row;
    const base = {
      ...rest,
      id: crypto.randomUUID(),
      [titleField]: `${row[titleField]} (copy)`,
      // Copies start as Draft only where that status exists; otherwise keep the source's.
      status: config.statusMap?.Draft ? "Draft" : row.status,
    };
    // Areas can reset per-record state on copies (e.g. a listing's publish status).
    const copy = config.prepareDuplicate ? config.prepareDuplicate(base, row) : base;
    setRows((prev) => [copy, ...prev]);
    if (!dataSource?.create) return;
    const created = await dataSource.create(copy);
    if (!created) {
      setRows((prev) => prev.filter((r) => r.id !== copy.id));
      toast.error(`Couldn't duplicate "${row[titleField]}".`);
      return;
    }
    setRows((prev) => prev.map((r) => (r.id === copy.id ? created : r)));
    logSystemActivity(config.key, created.id, "created", `Duplicated from ${row[titleField]}`);
    toast.success(`Duplicated "${row[titleField]}".`);
  };

  const handleDelete = async (row) => {
    setDeleteTarget(null);
    const prev = rows;
    setRows((prevRows) => prevRows.filter((r) => r.id !== row.id));
    if (dataSource?.softDelete) {
      const ok = await dataSource.softDelete(row.id);
      if (!ok) {
        setRows(prev); // roll back
        toast.error(`Couldn't delete "${row[titleField]}".`);
        return;
      }
    }
    logSystemActivity(config.key, row.id, "deleted", `Deleted ${config.singular.toLowerCase()}`);
    toast.success(`Deleted "${row[titleField]}".`);
    if (itemId === row.id) closeItem();
  };

  const columns = [
    ...config.columns,
    {
      key: "actions",
      header: "",
      align: "right",
      className: "text-right",
      render: (row) => (
        <ActionMenu
          label={`Actions for ${row[titleField] || config.singular.toLowerCase()}`}
          className="flex justify-end"
          items={[
            { icon: Pencil, label: "Edit", onSelect: () => openItem(row.id) },
            canCreate && { icon: Copy, label: "Duplicate", onSelect: () => handleDuplicate(row) },
            canDelete && { separator: true },
            canDelete && { icon: Trash2, label: "Delete", destructive: true, onSelect: () => setDeleteTarget(row) },
          ]}
        />
      ),
    },
  ];

  if (selected) {
    return (
      <EntityDetailScreen
        item={selected}
        config={config}
        data={dataSource}
        onBack={closeItem}
        onRowChange={handleRowChange}
        onDelete={handleDelete}
        onDuplicate={
          canCreate
            ? async (row) => {
                await handleDuplicate(row);
                closeItem();
              }
            : null
        }
        onReload={reload}
      />
    );
  }

  const EmptyIcon = config.icon;

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title={config.title}
        description={config.description}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {config.headerActions ? config.headerActions({ rows, reload }) : null}
            <RoleGate allowed={canCreate} reason={noCreate}>
              <Button
                className="bg-primary text-primary-foreground hover:bg-primary/90"
                disabled={!canCreate}
                onClick={() => setCreateOpen(true)}
              >
                <Plus className="h-4 w-4" /> New {titleCase(config.singular)}
              </Button>
            </RoleGate>
          </div>
        }
      />

      <StatsBar stats={stats} />

      <Toolbar>
        <div className="flex flex-wrap items-center gap-2">
          {viewOptions ? (
            <FilterDropdown value={view} onValueChange={setView} options={viewOptions} height="h-9" />
          ) : null}
          <FilterDropdown
            value={status}
            onValueChange={setStatus}
            options={config.statusFilterOptions}
            height="h-9"
          />
          {(extraFilters || []).map((f) => (
            <FilterDropdown
              key={f.key}
              value={filterValues[f.key] || "all"}
              onValueChange={(v) => setFilterValues((prev) => ({ ...prev, [f.key]: v }))}
              options={[
                { value: "all", label: f.allLabel || `All ${f.label.toLowerCase()}` },
                ...(f.load ? filterOptions[f.key] || [] : f.options || []),
              ]}
              height="h-9"
            />
          ))}
          {filtersOn ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="h-9 text-text-secondary hover:bg-surface-active hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" /> Clear
            </Button>
          ) : null}
        </div>
        <SearchInput value={search} onChange={setSearch} placeholder={`Search ${config.plural.toLowerCase()}…`} />
      </Toolbar>

      {loading ? (
        <ListLoading label={`Loading ${config.plural.toLowerCase()}`} />
      ) : (
        <div className="space-y-5">
          <DataTable
            columns={columns}
            data={pager.pageItems}
            getRowKey={(r) => r.id}
            onRowClick={(r) => openItem(r.id)}
            empty={
              <div className="rounded-xl border border-border bg-surface-subtle">
                <EmptyState
                  icon={EmptyIcon}
                  title={
                    rows.length
                      ? `No ${config.plural.toLowerCase()} match your filters`
                      : `No ${config.plural.toLowerCase()} yet`
                  }
                  description={
                    rows.length
                      ? "Try clearing the search or filters."
                      : `Create your first ${config.singular.toLowerCase()} to get started.`
                  }
                  action={
                    rows.length ? (
                      <Button
                        variant="outline"
                        className="border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground"
                        onClick={clearFilters}
                      >
                        <X className="h-4 w-4" /> Clear filters
                      </Button>
                    ) : canCreate ? (
                      <Button
                        className="bg-primary text-primary-foreground hover:bg-primary/90"
                        onClick={() => setCreateOpen(true)}
                      >
                        <Plus className="h-4 w-4" /> New {titleCase(config.singular)}
                      </Button>
                    ) : null
                  }
                />
              </div>
            }
          />
          <ListPagination {...pager} itemLabel={config.plural.toLowerCase()} />
        </div>
      )}

      <CreateEntityDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        config={config}
        onCreate={handleCreate}
      />

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete {config.singular.toLowerCase()}</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-medium text-foreground">
                {deleteTarget?.[titleField]}
              </span>
              ? This action can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              className="bg-red-500/90 text-white hover:bg-red-500"
              onClick={() => handleDelete(deleteTarget)}
            >
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainScreenWrapper>
  );
}

export default EntityListScreen;
