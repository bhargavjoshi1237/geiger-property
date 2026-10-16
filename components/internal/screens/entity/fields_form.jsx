"use client";

import { useEffect, useState } from "react";

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
import { Field } from "@/components/internal/shared/screen_kit";
import { cn } from "@/lib/utils";

// Config-driven editable grid shared by every editor section, create dialog and
// wizard step. Field descriptor:
// { key, label, type, options?, load? (relation), displayKey?, format? (readonly),
//   meta?, full?, placeholder?, hint?, required?, showIf?(item), disabled?(item),
//   min?, max?, step? }
// type: text | textarea | number | currency | percent | date | time | email |
//   phone | url | select | multiselect | switch | checkbox | relation | readonly | heading
// Writes: column fields → onCommit({ key }); meta fields → onCommitMeta({ key })
// (shallow-merged server side) when provided. `flat` treats every field as a
// plain key on `item` (drafts in dialogs/wizards).

const INPUT_TYPES = {
  number: "number",
  currency: "number",
  percent: "number",
  date: "date",
  time: "time",
  email: "email",
  phone: "tel",
  url: "url",
};

export const NONE = "__none__";

// Read a field value from the item (metadata bag when meta, else a column).
export function readFieldValue(item, f, flat = false) {
  const v = f.meta && !flat ? (item?.metadata?.[f.key] ?? item?.[f.key]) : item?.[f.key];
  return v ?? "";
}

export function isFieldVisible(item, f) {
  return typeof f.showIf === "function" ? Boolean(f.showIf(item)) : true;
}

// Required visible fields with an empty value → their labels.
export function missingRequired(item, fields, flat = false) {
  return fields
    .filter((f) => f.required && isFieldVisible(item, f))
    .filter((f) => {
      const v = readFieldValue(item, f, flat);
      return Array.isArray(v) ? v.length === 0 : String(v ?? "").trim() === "";
    })
    .map((f) => f.label);
}

function formatReadonly(item, f, flat) {
  const raw = readFieldValue(item, f, flat);
  if (f.format) return f.format(raw, item);
  if (raw === null || raw === undefined || raw === "") return "—";
  return String(raw);
}

// Select bound to another table: `load()` → [{ value, label, patch }]. Choosing
// writes the id plus `patch` (denormalized display fields); None clears both.
function RelationSelect({ id, item, f, onWrite, disabled }) {
  const [options, setOptions] = useState(null);
  useEffect(() => {
    let alive = true;
    Promise.resolve(f.load()).then((opts) => alive && setOptions(opts || []));
    return () => {
      alive = false;
    };
  }, [f]);

  const value = item?.[f.key] || "";
  const label = value
    ? options?.find((o) => o.value === value)?.label ||
      (f.displayKey ? item?.[f.displayKey] : null) ||
      "Linked record"
    : "None";

  const clearPatch = () => {
    const cleared = { [f.key]: "" };
    for (const k of Object.keys(options?.[0]?.patch || {})) cleared[k] = "";
    return cleared;
  };

  return (
    <Select
      value={value || NONE}
      disabled={disabled}
      onValueChange={(v) => {
        if (v === NONE) return onWrite(clearPatch());
        const opt = options?.find((o) => o.value === v);
        onWrite({ [f.key]: v, ...(opt?.patch || {}) });
      }}
    >
      <SelectTrigger id={id} className="bg-surface-card">
        <SelectValue placeholder={options ? f.placeholder || "Select…" : "Loading…"}>
          {label}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>None</SelectItem>
        {(options || []).map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// Toggle chips for a multi-value field (stored as an array).
function MultiSelect({ value, options, onChange, disabled }) {
  const list = Array.isArray(value) ? value : [];
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = list.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(on ? list.filter((v) => v !== o.value) : [...list, o.value])}
            className={cn(
              "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50",
              on
                ? "border-border-strong bg-surface-active text-foreground"
                : "border-border bg-surface-card text-text-secondary hover:bg-surface-hover hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Adorned({ prefix, suffix, children }) {
  if (!prefix && !suffix) return children;
  return (
    <div className="relative">
      {prefix ? (
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-text-tertiary">
          {prefix}
        </span>
      ) : null}
      {children}
      {suffix ? (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-text-tertiary">
          {suffix}
        </span>
      ) : null}
    </div>
  );
}

export function FieldsForm({ item, fields, onPatch, onCommit, onCommitMeta, flat = false, columns = 2 }) {
  // Local (typing) and persisted writes for one field.
  const local = (f, value) => {
    if (flat || !f.meta) return onPatch({ [f.key]: value });
    return onPatch({ [f.key]: value, metadata: { ...(item?.metadata || {}), [f.key]: value } });
  };
  const persist = (f, value) => {
    if (flat || !f.meta) return onCommit({ [f.key]: value });
    if (onCommitMeta) return onCommitMeta({ [f.key]: value });
    return onCommit({ [f.key]: value, metadata: { ...(item?.metadata || {}), [f.key]: value } });
  };

  return (
    <div className={cn("grid gap-4", columns === 2 && "sm:grid-cols-2", columns === 3 && "sm:grid-cols-3")}>
      {fields.filter((f) => isFieldVisible(item, f)).map((f) => {
        if (f.type === "heading") {
          return (
            <div key={f.key} className="pt-2 sm:col-span-full">
              <p className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">{f.label}</p>
              {f.hint ? <p className="mt-0.5 text-xs text-text-secondary">{f.hint}</p> : null}
            </div>
          );
        }
        const id = `f-${f.key}`;
        const value = readFieldValue(item, f, flat);
        const wide = f.type === "textarea" || f.type === "multiselect" || f.full;
        const disabled = typeof f.disabled === "function" ? f.disabled(item) : Boolean(f.disabled);
        const label = f.required ? `${f.label} *` : f.label;
        let control;

        if (f.type === "relation") {
          control = (
            <RelationSelect
              id={id}
              item={item}
              f={f}
              disabled={disabled}
              onWrite={(partial) =>
                flat || !f.meta ? onCommit(partial) : onCommitMeta ? onCommitMeta(partial) : onCommit(partial)
              }
            />
          );
        } else if (f.type === "readonly") {
          control = (
            <div className="flex h-9 items-center rounded-md border border-border bg-surface-subtle px-3 text-sm text-text-secondary">
              {formatReadonly(item, f, flat)}
            </div>
          );
        } else if (f.type === "select") {
          control = (
            <Select value={String(value || "")} disabled={disabled} onValueChange={(v) => persist(f, v)}>
              <SelectTrigger id={id} className="bg-surface-card">
                <SelectValue placeholder={f.placeholder || "Select…"} />
              </SelectTrigger>
              <SelectContent>
                {(f.options || []).map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          );
        } else if (f.type === "multiselect") {
          control = (
            <MultiSelect value={value} options={f.options || []} disabled={disabled} onChange={(v) => persist(f, v)} />
          );
        } else if (f.type === "switch") {
          control = (
            <div className="flex h-9 items-center">
              <Switch id={id} checked={Boolean(value)} disabled={disabled} onCheckedChange={(v) => persist(f, v)} />
            </div>
          );
        } else if (f.type === "checkbox") {
          control = (
            <label htmlFor={id} className="flex h-9 items-center gap-2 text-sm text-text-secondary">
              <Checkbox id={id} checked={Boolean(value)} disabled={disabled} onCheckedChange={(v) => persist(f, Boolean(v))} />
              {f.checkboxLabel || "Yes"}
            </label>
          );
        } else if (f.type === "textarea") {
          control = (
            <Textarea
              id={id}
              value={value}
              disabled={disabled}
              placeholder={f.placeholder}
              rows={f.rows}
              onChange={(e) => local(f, e.target.value)}
              onBlur={(e) => persist(f, e.target.value)}
            />
          );
        } else {
          const numeric = ["number", "currency", "percent"].includes(f.type);
          control = (
            <Adorned prefix={f.type === "currency" ? "$" : f.prefix} suffix={f.type === "percent" ? "%" : f.suffix}>
              <Input
                id={id}
                type={INPUT_TYPES[f.type] || "text"}
                value={value}
                disabled={disabled}
                min={f.min}
                max={f.max}
                step={f.step ?? (f.type === "currency" ? "0.01" : undefined)}
                placeholder={f.placeholder}
                className={cn(
                  "bg-surface-card",
                  (f.type === "currency" || f.prefix) && "pl-7",
                  (f.type === "percent" || f.suffix) && "pr-8",
                )}
                onChange={(e) => local(f, e.target.value)}
                onBlur={(e) => {
                  const v = numeric && e.target.value !== "" ? Number(e.target.value) : e.target.value;
                  persist(f, v);
                }}
              />
            </Adorned>
          );
        }

        return (
          <Field key={f.key} label={label} hint={f.hint} htmlFor={id} className={wide ? "sm:col-span-full" : ""}>
            {control}
          </Field>
        );
      })}
    </div>
  );
}

export default FieldsForm;
