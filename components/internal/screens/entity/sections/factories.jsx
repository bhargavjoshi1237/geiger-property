"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Sparkles, Trash2 } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Field, EmptyState, SectionCard } from "@/components/internal/shared/screen_kit";

// Config-driven section factories for the Entity editor. Each factory returns a
// section component bound to a descriptor and receiving the engine's section
// props ({ item, config, headerItem, onPatch, onCommit }). Real columns persist
// via onCommit; `meta: true` fields read/write the entity's `metadata` bag
// (read-modify-write) so section attributes persist without a column each.

// --- value helpers -----------------------------------------------------------

// Read a field value from the item (metadata bag when meta, else a column).
function readValue(item, f) {
  const v = f.meta ? item?.metadata?.[f.key] : item?.[f.key];
  return v ?? "";
}

// Build the onPatch/onCommit partial for a field write. Meta fields update both
// the bag (what persists) and the spread top-level key (what list columns and
// summaries render) so the optimistic row stays consistent before a refetch.
// `toRow` only maps real columns, so the extra top-level key is ignored on write.
function fieldPatch(item, f, value) {
  if (!f.meta) return { [f.key]: value };
  return { [f.key]: value, metadata: { ...(item?.metadata || {}), [f.key]: value } };
}

function formatValue(item, f) {
  const raw = f.meta ? item?.metadata?.[f.key] : item?.[f.key];
  if (f.format) return f.format(raw, item);
  if (raw === null || raw === undefined || raw === "") return "—";
  return String(raw);
}

// --- editable form -----------------------------------------------------------

// Shared editable grid used by makeFieldsSection. `fields`:
// { key, label, type: text|textarea|number|date|select|switch, options?, meta?,
//   full?, placeholder?, hint? }.
export function FieldsForm({ item, fields, onPatch, onCommit }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {fields.map((f) => {
        const id = `f-${f.key}`;
        const value = readValue(item, f);
        const wide = f.type === "textarea" || f.full;
        return (
          <Field
            key={f.key}
            label={f.label}
            hint={f.hint}
            htmlFor={id}
            className={wide ? "sm:col-span-2" : ""}
          >
            {f.type === "select" ? (
              <Select
                value={String(value || "")}
                onValueChange={(v) => onCommit(fieldPatch(item, f, v))}
              >
                <SelectTrigger id={id} className="bg-surface-card">
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
            ) : f.type === "switch" ? (
              <div className="flex h-9 items-center">
                <Switch
                  id={id}
                  checked={Boolean(value)}
                  onCheckedChange={(v) => onCommit(fieldPatch(item, f, v))}
                />
              </div>
            ) : f.type === "textarea" ? (
              <Textarea
                id={id}
                value={value}
                placeholder={f.placeholder}
                onChange={(e) => onPatch(fieldPatch(item, f, e.target.value))}
                onBlur={(e) => onCommit(fieldPatch(item, f, e.target.value))}
              />
            ) : (
              <Input
                id={id}
                type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                value={value}
                placeholder={f.placeholder}
                className="bg-surface-card"
                onChange={(e) => onPatch(fieldPatch(item, f, e.target.value))}
                onBlur={(e) => onCommit(fieldPatch(item, f, e.target.value))}
              />
            )}
          </Field>
        );
      })}
    </div>
  );
}

export function makeFieldsSection(fields) {
  function FieldsSection({ item, onPatch, onCommit }) {
    return (
      <FieldsForm item={item} fields={fields} onPatch={onPatch} onCommit={onCommit} />
    );
  }
  return FieldsSection;
}

// --- read-mostly overview ----------------------------------------------------

export function makeOverviewSection({ fields = [], note } = {}) {
  function OverviewSection({ item }) {
    return (
      <div className="space-y-4">
        <SectionCard>
          <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
            {fields.map((f) => (
              <div key={f.key} className="min-w-0">
                <dt className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
                  {f.label}
                </dt>
                <dd className="mt-1 truncate text-sm text-foreground">
                  {formatValue(item, f)}
                </dd>
              </div>
            ))}
          </dl>
        </SectionCard>
        {note ? <p className="text-sm text-text-secondary">{note}</p> : null}
      </div>
    );
  }
  return OverviewSection;
}

// --- single free-text field --------------------------------------------------

export function makeNotesSection({ field, placeholder, meta = true, mono = false }) {
  function NotesSection({ item, onPatch, onCommit }) {
    const value = (meta ? item?.metadata?.[field] : item?.[field]) ?? "";
    const write = (v) =>
      meta ? { metadata: { ...(item?.metadata || {}), [field]: v } } : { [field]: v };
    return (
      <Textarea
        value={value}
        placeholder={placeholder}
        onChange={(e) => onPatch(write(e.target.value))}
        onBlur={(e) => onCommit(write(e.target.value))}
        className={mono ? "min-h-[280px] font-mono text-[13px]" : "min-h-[220px]"}
      />
    );
  }
  return NotesSection;
}

// --- add/remove list stored in the metadata bag ------------------------------

// Sub-lists too light to warrant a table (signers, deductions, checklist,
// clauses, disclosures…). Rows live in item.metadata[field] and persist via a
// read-modify-write of the bag. Options: { field, singular, icon,
// primaryPlaceholder, secondary?: { key, label, placeholder, type }, check? }.
export function makeMetaListSection({
  field,
  singular = "item",
  icon: Icon = Sparkles,
  primaryPlaceholder,
  secondary,
  check = false,
}) {
  function MetaListSection({ item, onCommit }) {
    const list = Array.isArray(item?.metadata?.[field]) ? item.metadata[field] : [];
    const [primary, setPrimary] = useState("");
    const [secondaryValue, setSecondaryValue] = useState("");

    const commitList = (next) =>
      onCommit({ metadata: { ...(item?.metadata || {}), [field]: next } });

    const add = () => {
      const v = primary.trim();
      if (!v) {
        toast.error(`Add a ${singular.toLowerCase()}.`);
        return;
      }
      const row = { id: crypto.randomUUID(), label: v };
      if (secondary) row[secondary.key] = secondaryValue;
      if (check) row.done = false;
      commitList([...list, row]);
      setPrimary("");
      setSecondaryValue("");
    };

    const toggle = (id) =>
      commitList(list.map((x) => (x.id === id ? { ...x, done: !x.done } : x)));
    const remove = (id) => commitList(list.filter((x) => x.id !== id));

    return (
      <div className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={primary}
            onChange={(e) => setPrimary(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder={primaryPlaceholder || `New ${singular.toLowerCase()}`}
            className="bg-surface-card"
          />
          {secondary ? (
            <Input
              value={secondaryValue}
              onChange={(e) => setSecondaryValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              type={secondary.type === "number" ? "number" : "text"}
              placeholder={secondary.placeholder || secondary.label}
              className="bg-surface-card sm:max-w-[40%]"
            />
          ) : null}
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={add}
          >
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>

        {list.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface-subtle">
            <EmptyState
              icon={Icon}
              title={`No ${singular.toLowerCase()}s yet`}
              description={`Add a ${singular.toLowerCase()} to get started.`}
            />
          </div>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface-subtle">
            {list.map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  {check ? (
                    <Checkbox
                      checked={Boolean(row.done)}
                      onCheckedChange={() => toggle(row.id)}
                    />
                  ) : null}
                  <span
                    className={
                      check && row.done
                        ? "truncate text-sm text-text-tertiary line-through"
                        : "truncate text-sm font-medium text-foreground"
                    }
                  >
                    {row.label}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {secondary && row[secondary.key] ? (
                    <span className="text-sm text-text-secondary">
                      {row[secondary.key]}
                    </span>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-red-300 hover:bg-red-500/10"
                    onClick={() => remove(row.id)}
                    aria-label={`Remove ${singular.toLowerCase()}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }
  return MetaListSection;
}

// --- add/remove list backed by a real child data layer -----------------------

// Rows persisted through a child data layer ({ list(parentId), create,
// softDelete }). `parentKey` is the child's FK field to this item (e.g.
// householdId). fields[0] is the primary/name; the rest are optional columns.
export function makeChildListSection({
  data,
  parentKey,
  singular = "record",
  icon: Icon = Sparkles,
  fields = [{ key: "name", placeholder: "Name" }],
}) {
  const [primaryField, ...restFields] = fields;

  function ChildListSection({ item }) {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [draft, setDraft] = useState({});

    // Fetch this parent's children on mount / when the parent changes.
    useEffect(() => {
      let alive = true;
      data
        .list(item.id)
        .then((r) => {
          if (!alive) return;
          setRows(r ?? []);
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
    }, [item.id]);

    const add = async () => {
      const primary = String(draft[primaryField.key] || "").trim();
      if (!primary) {
        toast.error(`Add a ${singular.toLowerCase()}.`);
        return;
      }
      const optimistic = {
        id: crypto.randomUUID(),
        [parentKey]: item.id,
        ...draft,
        [primaryField.key]: primary,
      };
      setRows((prev) => [optimistic, ...prev]);
      setDraft({});
      const created = await data.create(optimistic);
      if (created) {
        setRows((prev) => prev.map((x) => (x.id === optimistic.id ? created : x)));
      } else {
        setRows((prev) => prev.filter((x) => x.id !== optimistic.id));
        toast.error(`Couldn't add the ${singular.toLowerCase()}.`);
      }
    };

    const remove = async (row) => {
      const prev = rows;
      setRows((r) => r.filter((x) => x.id !== row.id));
      const ok = await data.softDelete(row.id);
      if (!ok) {
        setRows(prev);
        toast.error(`Couldn't remove the ${singular.toLowerCase()}.`);
      }
    };

    if (loading) {
      return (
        <p className="text-sm text-muted-foreground">
          Loading {singular.toLowerCase()}s…
        </p>
      );
    }

    return (
      <div className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          {fields.map((f) => (
            <Input
              key={f.key}
              value={draft[f.key] ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && add()}
              type={f.type === "number" ? "number" : "text"}
              placeholder={f.placeholder || f.key}
              className="bg-surface-card"
            />
          ))}
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={add}
          >
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface-subtle">
            <EmptyState
              icon={Icon}
              title={`No ${singular.toLowerCase()}s yet`}
              description={`Add a ${singular.toLowerCase()} to get started.`}
            />
          </div>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface-subtle">
            {rows.map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">
                    {row[primaryField.key]}
                  </p>
                  {restFields.length ? (
                    <p className="truncate text-xs text-text-secondary">
                      {restFields
                        .map((f) => row[f.key])
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </p>
                  ) : null}
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-red-300 hover:bg-red-500/10"
                  onClick={() => remove(row)}
                  aria-label={`Remove ${singular.toLowerCase()}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }
  return ChildListSection;
}
