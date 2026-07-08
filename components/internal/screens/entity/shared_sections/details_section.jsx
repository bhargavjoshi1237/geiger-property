"use client";

import { useEffect, useMemo, useState } from "react";

import { Field } from "@/components/internal/shared/screen_kit";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { loadEntityOptions } from "./entity_options";

// Generic, config-driven Details form. Fields come from `props.fields` (used by
// sectionProps for alternate field sets, e.g. Lease & Occupancy) or
// `config.detailFields`. Edits patch the editor's working form (onPatch); the
// editor header's Save persists through the data layer. Entity-reference fields
// (type "entity") load their options from the related area's data layer.
const NONE = "__none__";

export function DetailsSection({ item, config, onPatch, fields }) {
  const list = useMemo(
    () => fields || config.detailFields || [],
    [fields, config.detailFields],
  );
  const [entityOptions, setEntityOptions] = useState({});

  // Load options for any entity-reference fields once.
  const entityKeys = useMemo(
    () => [...new Set(list.filter((f) => f.type === "entity").map((f) => f.entity))],
    [list],
  );

  useEffect(() => {
    let alive = true;
    Promise.all(
      entityKeys.map((k) => loadEntityOptions(k).then((opts) => [k, opts])),
    ).then((pairs) => {
      if (!alive) return;
      setEntityOptions(Object.fromEntries(pairs));
    });
    return () => {
      alive = false;
    };
  }, [entityKeys]);

  const set = (key) => (value) => onPatch({ [key]: value });

  if (!list.length) {
    return (
      <p className="text-sm text-muted-foreground">No editable fields here yet.</p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {list.map((f) => {
        const span = f.span === 2 ? "sm:col-span-2" : "";
        const value = item[f.key];
        return (
          <Field key={f.key} label={f.label} hint={f.hint} htmlFor={`f-${f.key}`} className={span}>
            {f.type === "select" ? (
              <Select value={value || ""} onValueChange={set(f.key)}>
                <SelectTrigger id={`f-${f.key}`} className="bg-surface-card">
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
            ) : f.type === "entity" ? (
              <Select
                value={value || NONE}
                onValueChange={(v) => set(f.key)(v === NONE ? null : v)}
              >
                <SelectTrigger id={`f-${f.key}`} className="bg-surface-card">
                  <SelectValue placeholder={f.placeholder || "Select…"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  {(entityOptions[f.entity] || []).map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : f.type === "textarea" ? (
              <textarea
                id={`f-${f.key}`}
                value={value ?? ""}
                onChange={(e) => set(f.key)(e.target.value)}
                placeholder={f.placeholder}
                rows={4}
                className="w-full rounded-md border border-border bg-surface-card px-3 py-2 text-sm text-foreground placeholder:text-text-tertiary outline-none transition-colors focus-visible:border-border-strong focus-visible:ring-2 focus-visible:ring-border"
              />
            ) : (
              <Input
                id={`f-${f.key}`}
                type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                value={value ?? ""}
                onChange={(e) => set(f.key)(e.target.value)}
                placeholder={f.placeholder}
                className="bg-surface-card"
              />
            )}
          </Field>
        );
      })}
    </div>
  );
}

export default DetailsSection;
