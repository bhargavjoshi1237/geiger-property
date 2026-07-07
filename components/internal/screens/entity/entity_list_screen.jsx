"use client";

import React, { useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";

import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import {
  DataTable,
  EmptyState,
  Field,
  ScreenHeader,
  SearchInput,
  StatsBar,
  StatusPill,
  Toolbar,
} from "@/components/internal/shared/screen_kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { EntityDetailScreen } from "./entity_detail_screen";

// Build the create dialog's controls from config.createFields. Text → Input,
// select → shadcn Select. Kept generic so every area's dialog is described by
// data, not bespoke JSX.
function CreateEntityDialog({ open, onOpenChange, config, onCreate }) {
  const [draft, setDraft] = useState(config.createDraft);
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));

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
    onCreate(draft);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New {config.singular.toLowerCase()}</DialogTitle>
          <DialogDescription>
            Create a {config.singular.toLowerCase()} as a draft — you can fill in
            the rest from its editor.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          {config.createFields.map((f) => (
            <Field key={f.key} label={f.label} htmlFor={`create-${f.key}`}>
              {f.type === "select" ? (
                <Select value={draft[f.key]} onValueChange={set(f.key)}>
                  <SelectTrigger id={`create-${f.key}`} className="bg-surface-card">
                    <SelectValue placeholder={f.placeholder || "Select…"} />
                  </SelectTrigger>
                  <SelectContent>
                    {f.options.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id={`create-${f.key}`}
                  value={draft[f.key] ?? ""}
                  onChange={(e) => set(f.key)(e.target.value)}
                  placeholder={f.placeholder}
                  className="bg-surface-card"
                />
              )}
            </Field>
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={submit}
          >
            Create {config.singular.toLowerCase()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Generic, config-driven list screen — the reusable port of all_events.jsx.
// TEMP: rows are seeded from config.demoRows and held in local state so the
// editor is clickable before the data layer exists. Swap to a list*/create*/
// softDelete* fetch-on-mount when this area's Supabase module is built.
export function EntityListScreen({ config }) {
  const [rows, setRows] = useState(config.demoRows);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const { itemId, openItem, closeItem } = useWorkspaceUrl();

  const titleField = config.titleField || "name";

  const selected = useMemo(
    () => (itemId ? rows.find((r) => r.id === itemId) || null : null),
    [itemId, rows],
  );

  const filtered = useMemo(() => {
    const fields = config.searchFields || [titleField];
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (status !== "all" && r.status !== status) return false;
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
  }, [rows, search, status, config, titleField]);

  const stats = useMemo(() => config.stats(rows), [rows, config]);

  const makeRow = (draft) => {
    const row = config.newRow ? config.newRow(draft) : { ...draft };
    if (!row.id) row.id = crypto.randomUUID();
    return row;
  };

  const handleCreate = (draft) => {
    const row = makeRow(draft);
    setRows((prev) => [row, ...prev]);
    toast.success(`"${row[titleField]}" created as a draft.`);
  };

  const handleUpdate = (updated) => {
    setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  };

  const handleDuplicate = (row) => {
    const copy = {
      ...row,
      id: crypto.randomUUID(),
      [titleField]: `${row[titleField]} (copy)`,
      status: "Draft",
    };
    setRows((prev) => [copy, ...prev]);
    toast.success(`Duplicated "${row[titleField]}".`);
  };

  const handleDelete = (row) => {
    setDeleteTarget(null);
    setRows((prev) => prev.filter((r) => r.id !== row.id));
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
        <div onClick={(ev) => ev.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground hover:bg-surface-active hover:text-foreground"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-44 border-border bg-surface-card shadow-xl"
            >
              <DropdownMenuItem
                className="cursor-pointer gap-2 text-muted-foreground focus:bg-surface-hover focus:text-foreground"
                onClick={() => openItem(row.id)}
              >
                <Pencil className="h-4 w-4" /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer gap-2 text-muted-foreground focus:bg-surface-hover focus:text-foreground"
                onClick={() => handleDuplicate(row)}
              >
                <Copy className="h-4 w-4" /> Duplicate
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-surface-strong" />
              <DropdownMenuItem
                className="cursor-pointer gap-2 text-red-300 focus:bg-red-500/10 focus:text-red-300"
                onClick={() => setDeleteTarget(row)}
              >
                <Trash2 className="h-4 w-4 text-red-300" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ];

  if (selected) {
    return (
      <EntityDetailScreen
        item={selected}
        config={config}
        onBack={closeItem}
        onUpdate={handleUpdate}
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
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="h-4 w-4" /> New {config.singular.toLowerCase()}
          </Button>
        }
      />

      <StatsBar stats={stats} />

      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterDropdown
            value={status}
            onValueChange={setStatus}
            options={config.statusFilterOptions}
            height="h-9"
          />
        </div>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={`Search ${config.plural.toLowerCase()}…`}
          className="w-full sm:max-w-xs"
        />
      </Toolbar>

      <DataTable
        columns={columns}
        data={filtered}
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
                <Button
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                  onClick={() => setCreateOpen(true)}
                >
                  <Plus className="h-4 w-4" /> New {config.singular.toLowerCase()}
                </Button>
              }
            />
          </div>
        }
      />

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
