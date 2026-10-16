"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Sparkles, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, ListLoading } from "@/components/internal/shared/screen_kit";
import { WizardDialog } from "@/components/internal/shared/wizard_dialog";
import { recordItemsLayer, listRecordItems } from "@/lib/supabase/record_items";

// Child records owned by the open entity (pets, vehicles, co-signers, owners…),
// edited in a dialog. An adapter supplies persistence:
// { load(item) → rows, create(item, values) → row, update(row, values) → row, remove(row) → bool }.
// `summary(row)` → { title, meta?, badge?, badgeVariant?, aside? } renders each row.

const RECORD_ITEM_COLUMNS = ["name", "status", "startsOn", "endsOn", "amount", "sort"];

// Split form values into record_items columns + the metadata bag.
function toRecordItem(values, base = {}) {
  const out = { metadata: { ...(base.metadata || {}) } };
  for (const [k, v] of Object.entries(values)) {
    if (["id", "metadata", "ownerType", "ownerId", "kind", "createdAt", "createdBy", "projectId"].includes(k)) continue;
    if (RECORD_ITEM_COLUMNS.includes(k)) out[k] = v;
    else out.metadata[k] = v;
  }
  return out;
}

// Adapter over property.record_items for one `kind` owned by the open record.
export function recordItemsAdapter(kind) {
  return {
    load: (item, config) => listRecordItems(config.key, item.id, kind),
    create: (item, values, config) =>
      recordItemsLayer.create({
        id: crypto.randomUUID(),
        ownerType: config.key,
        ownerId: item.id,
        kind,
        ...toRecordItem(values),
      }),
    update: (row, values) => recordItemsLayer.update(row.id, toRecordItem(values, row)),
    remove: (row) => recordItemsLayer.softDelete(row.id),
  };
}

// Adapter over a child data layer keyed by `parentKey` (e.g. leaseId).
export function childLayerAdapter(layer, parentKey, listFn) {
  return {
    load: (item) => (listFn ? listFn(item.id) : layer.list({ [parentKey]: item.id })),
    create: (item, values) => layer.create({ id: crypto.randomUUID(), ...values, [parentKey]: item.id }),
    update: (row, values) => layer.update(row.id, values),
    remove: (row) => layer.softDelete(row.id),
  };
}

export function ChildRecords({
  item,
  config,
  adapter,
  fields,
  summary,
  singular = "record",
  plural,
  icon: Icon = Sparkles,
  defaults,
  emptyDescription,
  onChange,
}) {
  const [rows, setRows] = useState(null);
  const [editing, setEditing] = useState(null); // null | "new" | row
  const label = singular.toLowerCase();
  const many = (plural || `${singular}s`).toLowerCase();

  useEffect(() => {
    let alive = true;
    Promise.resolve(adapter.load(item, config))
      .then((r) => alive && setRows(r ?? []))
      .catch(() => alive && setRows([]));
    return () => {
      alive = false;
    };
    // Keyed on the record id so edits elsewhere in the editor don't refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapter, item.id, config]);

  const sync = (next) => {
    setRows(next);
    onChange?.(next);
  };

  const save = async (values) => {
    if (editing === "new") {
      const created = await adapter.create(item, values, config);
      if (!created) {
        toast.error(`Couldn't add the ${label}.`);
        return false;
      }
      sync([...(rows || []), created]);
      toast.success(`Added ${label}.`);
      return true;
    }
    const updated = await adapter.update(editing, values, config);
    if (!updated) {
      toast.error(`Couldn't save the ${label}.`);
      return false;
    }
    sync((rows || []).map((r) => (r.id === editing.id ? updated : r)));
    toast.success(`Saved ${label}.`);
    return true;
  };

  const remove = async (row) => {
    const prev = rows;
    sync(rows.filter((r) => r.id !== row.id));
    const ok = await adapter.remove(row, config);
    if (!ok) {
      sync(prev);
      toast.error(`Couldn't remove the ${label}.`);
    }
  };

  if (rows === null) return <ListLoading label={`Loading ${many}`} className="py-10" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-text-secondary">
          {rows.length} {rows.length === 1 ? label : many}
        </p>
        <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" /> Add {label}
        </Button>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface-subtle">
          <EmptyState
            icon={Icon}
            title={`No ${many} yet`}
            description={emptyDescription || `Add a ${label} to keep it on this record.`}
          />
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface-subtle">
          {rows.map((row) => {
            const s = summary(row);
            return (
              <li key={row.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setEditing(row)}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium text-foreground">{s.title || "Untitled"}</span>
                    {s.badge ? <Badge variant={s.badgeVariant || "neutral"}>{s.badge}</Badge> : null}
                  </div>
                  {s.meta ? <p className="mt-0.5 truncate text-xs text-text-secondary">{s.meta}</p> : null}
                </button>
                <div className="flex shrink-0 items-center gap-1">
                  {s.aside ? <span className="mr-2 text-sm tabular-nums text-text-secondary">{s.aside}</span> : null}
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-text-secondary hover:bg-surface-hover hover:text-foreground"
                    onClick={() => setEditing(row)}
                    aria-label={`Edit ${label}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-red-600 dark:text-red-300 hover:bg-red-500/10"
                    onClick={() => remove(row)}
                    aria-label={`Remove ${label}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <WizardDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing === "new" ? `Add ${label}` : `Edit ${label}`}
        steps={[{ key: "main", title: singular, fields }]}
        initial={editing && editing !== "new" ? editing : defaults ? defaults(item) : {}}
        finishLabel={editing === "new" ? `Add ${label}` : "Save"}
        onFinish={save}
      />
    </div>
  );
}

// Section factory: makeChildRecordsSection({ adapter, fields, summary, singular, … }).
export function makeChildRecordsSection(options) {
  function ChildRecordsSection({ item, config }) {
    return <ChildRecords item={item} config={config} {...options} />;
  }
  return ChildRecordsSection;
}

// Shortcut for a record_items repeater of one kind.
export const makeRecordItemsSection = ({ kind, ...options }) =>
  makeChildRecordsSection({ adapter: recordItemsAdapter(kind), ...options });
