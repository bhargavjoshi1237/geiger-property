"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ImagePlus, Loader2, Plus, Sparkles, Trash2 } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { EmptyState, ListLoading, SectionCard } from "@/components/internal/shared/screen_kit";
import { uploadPropertyImage } from "@/lib/supabase/property_storage";
import { getSetting } from "@/lib/supabase/settings";
import { FieldsForm } from "../fields_form";

export { FieldsForm };

// Config-driven section factories for the Entity editor. Each factory returns a
// section component bound to a descriptor and receiving the engine's section
// props ({ item, config, headerItem, onPatch, onCommit }). Real columns persist
// via onCommit; `meta: true` fields read/write the entity's `metadata` bag
// (read-modify-write) so section attributes persist without a column each.

// Display value for read-only summaries (metadata bag when meta, else a column).
function formatValue(item, f) {
  const raw = f.meta ? (item?.metadata?.[f.key] ?? item?.[f.key]) : item?.[f.key];
  if (f.format) return f.format(raw, item);
  if (raw === null || raw === undefined || raw === "") return "—";
  return String(raw);
}

export function makeFieldsSection(fields) {
  function FieldsSection({ item, onPatch, onCommit, onCommitMeta }) {
    return (
      <FieldsForm
        item={item}
        fields={fields}
        onPatch={onPatch}
        onCommit={onCommit}
        onCommitMeta={onCommitMeta}
      />
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
              type={["number", "date"].includes(secondary.type) ? secondary.type : "text"}
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
                    className="text-red-600 dark:text-red-300 hover:bg-red-500/10"
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
// householdId). fields[0] is the primary/name; the rest are optional columns —
// `{ type: "relation", load, displayKey }` renders a picker instead of a text box.
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

    // Options for relation inputs (`{ type: "relation", load, displayKey }`), loaded once.
    const [relationOptions, setRelationOptions] = useState({});
    useEffect(() => {
      let alive = true;
      const rel = fields.filter((f) => f.type === "relation");
      Promise.all(rel.map((f) => f.load())).then((lists) => {
        if (alive) setRelationOptions(Object.fromEntries(rel.map((f, i) => [f.key, lists[i] || []])));
      });
      return () => {
        alive = false;
      };
    }, []);

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
        <ListLoading label={`Loading ${singular.toLowerCase()}s`} className="py-10" />
      );
    }

    return (
      <div className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          {fields.map((f) =>
            f.type === "relation" ? (
              <Select
                key={f.key}
                value={draft[f.key] || ""}
                onValueChange={(v) => {
                  const opt = relationOptions[f.key]?.find((o) => o.value === v);
                  setDraft((d) => ({ ...d, [f.key]: v, ...(opt?.patch || {}) }));
                }}
              >
                <SelectTrigger className="bg-surface-card sm:max-w-[40%]">
                  <SelectValue placeholder={f.placeholder || "Select…"} />
                </SelectTrigger>
                <SelectContent>
                  {(relationOptions[f.key] || []).map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                key={f.key}
                value={draft[f.key] ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && add()}
                type={f.type === "number" ? "number" : "text"}
                placeholder={f.placeholder || f.key}
                className="bg-surface-card"
              />
            ),
          )}
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
                        .map((f) => row[f.displayKey || f.key])
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </p>
                  ) : null}
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-red-600 dark:text-red-300 hover:bg-red-500/10"
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

// --- image uploads stored in the metadata bag --------------------------------

// Real image uploads into storage under `<ownerType>/<id>/`; the public URLs live
// in item.metadata[field] = [{ id, label, url }].
export function makeUploadSection({ field = "photos", ownerType, singular = "photo" }) {
  function UploadSection({ item, onCommit }) {
    const list = Array.isArray(item?.metadata?.[field]) ? item.metadata[field] : [];
    const [busy, setBusy] = useState(false);
    const inputRef = useRef(null);

    const commitList = (next) =>
      onCommit({ metadata: { ...(item?.metadata || {}), [field]: next } });

    const onFiles = async (files) => {
      if (!files?.length) return;
      setBusy(true);
      const added = [];
      for (const file of Array.from(files)) {
        const res = await uploadPropertyImage(ownerType, item.id, file);
        if (res?.url) added.push({ id: crypto.randomUUID(), label: file.name, url: res.url });
        else toast.error(`Couldn't upload ${file.name}.`);
      }
      setBusy(false);
      if (added.length) {
        commitList([...list, ...added]);
        toast.success(`Uploaded ${added.length} ${singular}${added.length > 1 ? "s" : ""}.`);
      }
      if (inputRef.current) inputRef.current.value = "";
    };

    return (
      <div className="space-y-4">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => onFiles(e.target.files)}
        />
        <Button
          className="bg-primary text-primary-foreground hover:bg-primary/90"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
          Upload {singular}s
        </Button>
        {list.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface-subtle">
            <EmptyState
              icon={ImagePlus}
              title={`No ${singular}s yet`}
              description={`Upload ${singular}s to attach them here.`}
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {list.map((p) => (
              <div
                key={p.id}
                className="overflow-hidden rounded-xl border border-border bg-surface-subtle"
              >
                {p.url ? (
                  <a href={p.url} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt={p.label} className="aspect-[4/3] w-full object-cover" />
                  </a>
                ) : (
                  // Legacy text-only entries (pre-upload) have no file to show.
                  <div className="flex aspect-[4/3] w-full items-center justify-center bg-surface-card">
                    <ImagePlus className="h-6 w-6 text-text-tertiary" />
                  </div>
                )}
                <div className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="truncate text-xs text-text-secondary">{p.label}</span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-red-600 dark:text-red-300 hover:bg-red-500/10"
                    onClick={() => commitList(list.filter((x) => x.id !== p.id))}
                    aria-label={`Remove ${singular}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }
  return UploadSection;
}

// --- custom fields defined in Settings → Custom Fields ------------------------

const CUSTOM_TYPES = ["text", "textarea", "number", "currency", "date", "select", "multiselect", "switch", "email", "phone", "url"];

// Settings definition → FieldsForm descriptor (value stored as metadata.cf_<id>).
export function customFieldDescriptor(d) {
  const options = (d.options || [])
    .map((o) => String(o).trim())
    .filter(Boolean)
    .map((o) => ({ value: o, label: o }));
  return {
    key: `cf_${d.id}`,
    label: d.label,
    type: CUSTOM_TYPES.includes(d.type) ? d.type : "text",
    options,
    required: Boolean(d.required),
    meta: true,
  };
}

// Renders the project's active custom fields for `entityKey`, grouped by their
// optional group. Stored as settings.custom_fields = { [entityKey]: [def] }.
export function makeCustomFieldsSection(entityKey) {
  function CustomFieldsSection({ item, onPatch, onCommit, onCommitMeta }) {
    const [defs, setDefs] = useState(null);
    useEffect(() => {
      let alive = true;
      getSetting("custom_fields", {}).then(
        (v) => alive && setDefs((v?.[entityKey] || []).filter((d) => d.active !== false)),
      );
      return () => {
        alive = false;
      };
    }, []);

    if (defs === null) {
      return <ListLoading label="Loading custom fields" className="py-10" />;
    }
    if (defs.length === 0) {
      return (
        <div className="rounded-xl border border-border bg-surface-subtle">
          <EmptyState
            icon={Sparkles}
            title="No custom fields yet"
            description="Define custom fields in Settings → Custom Fields to track extra details here."
          />
        </div>
      );
    }
    const groups = [];
    for (const d of defs) {
      const name = String(d.group || "").trim() || "General";
      let g = groups.find((x) => x.name === name);
      if (!g) groups.push((g = { name, fields: [] }));
      g.fields.push(customFieldDescriptor(d));
    }
    return (
      <div className="space-y-5">
        {groups.map((g) => (
          <SectionCard key={g.name} title={groups.length > 1 ? g.name : undefined}>
            <FieldsForm
              item={item}
              fields={g.fields}
              onPatch={onPatch}
              onCommit={onCommit}
              onCommitMeta={onCommitMeta}
            />
          </SectionCard>
        ))}
      </div>
    );
  }
  return CustomFieldsSection;
}
