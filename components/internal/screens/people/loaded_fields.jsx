"use client";

import { useEffect, useState } from "react";

import { ListLoading } from "@/components/internal/shared/screen_kit";
import { FieldsForm } from "@/components/internal/screens/entity/fields_form";
import { last4 } from "./shared";

// FieldsForm section whose select/multiselect options come from a data loader:
// `{ type: "select", meta: true, optionsFrom: async () => [{ value, label, patch? }] }`.
// Unlike `relation` (column-only), this persists metadata keys too, and merges a
// chosen option's `patch` (denormalized display fields) into the same write.
// `last4: true` fields are trimmed to their last four digits before saving.
export function makeLoadedFieldsSection(fields) {
  const loaders = fields.filter((f) => typeof f.optionsFrom === "function");
  const masked = new Set(fields.filter((f) => f.last4).map((f) => f.key));

  function LoadedFieldsSection({ item, onPatch, onCommit, onCommitMeta }) {
    const [options, setOptions] = useState(loaders.length ? null : {});

    useEffect(() => {
      if (!loaders.length) return undefined;
      let alive = true;
      Promise.all(loaders.map((f) => Promise.resolve(f.optionsFrom()).catch(() => [])))
        .then((lists) => {
          if (alive) setOptions(Object.fromEntries(loaders.map((f, i) => [f.key, lists[i] || []])));
        });
      return () => {
        alive = false;
      };
    }, []);

    if (options === null) return <ListLoading label="Loading options" className="py-10" />;

    const resolved = fields.map((f) =>
      options[f.key] ? { ...f, options: options[f.key].map(({ value, label }) => ({ value, label })) } : f,
    );

    // Fold the chosen option's patch into the write (single-select loaders only).
    const withPatch = (patch) => {
      const out = { ...patch };
      for (const [k, v] of Object.entries(patch)) {
        if (masked.has(k)) out[k] = last4(v);
        const opt = options[k]?.find((o) => o.value === v);
        if (opt?.patch) Object.assign(out, opt.patch);
      }
      return out;
    };

    return (
      <FieldsForm
        item={item}
        fields={resolved}
        onPatch={onPatch}
        onCommit={(p) => onCommit(withPatch(p))}
        onCommitMeta={(p) => onCommitMeta(withPatch(p))}
      />
    );
  }
  return LoadedFieldsSection;
}

export default makeLoadedFieldsSection;
