"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { AlertTriangle, Info } from "lucide-react";

import { EmptyState } from "@/components/internal/shared/screen_kit";
import { ChildRecords } from "@/components/internal/screens/entity/sections/child_records";
import { FieldsForm } from "@/components/internal/screens/entity/fields_form";
import { cn } from "@/lib/utils";
import { metaList } from "../shared";

// Small section helpers shared by the Leasing screens (record-dependent tabs).

// Render `section` only when `when(item)` holds; otherwise an explanatory empty state.
export function makeGatedSection({ when, section: Section, icon = Info, title, description }) {
  function GatedSection(props) {
    if (when(props.item)) return <Section {...props} />;
    return (
      <div className="rounded-xl border border-border bg-surface-subtle">
        <EmptyState icon={icon} title={title} description={description} />
      </div>
    );
  }
  return GatedSection;
}

// Pick between two sections by a predicate on the record (e.g. move-in vs move-out).
export function makeEitherSection({ when, then: Then, otherwise: Otherwise }) {
  function EitherSection(props) {
    return when(props.item) ? <Then {...props} /> : <Otherwise {...props} />;
  }
  return EitherSection;
}

// Stack several sections in one tab (each gets the full section props).
export function makeStackSection(...sections) {
  function StackSection(props) {
    return (
      <div className="space-y-6">
        {sections.map((S, i) => (
          <S key={i} {...props} />
        ))}
      </div>
    );
  }
  return StackSection;
}

// Tinted inline notice (info / warning / danger / success).
const TONES = {
  info: "border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-400",
  warning: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  danger: "border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400",
  success: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
};

export function Callout({ tone = "info", icon: Icon, children, action, className }) {
  const Glyph = Icon || (tone === "info" ? Info : AlertTriangle);
  return (
    <div className={cn("flex flex-col gap-3 rounded-xl border px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between", TONES[tone], className)}>
      <div className="flex items-start gap-2">
        <Glyph className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0">{children}</div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

// ChildRecords over a list stored in the record's metadata[field] (persisted
// through the shallow-merge RPC), for rows too light for their own table.
export function MetaRecords({ item, config, onCommitMeta, field, ...options }) {
  const ref = useRef({ item, onCommitMeta });
  useLayoutEffect(() => {
    ref.current = { item, onCommitMeta };
  });
  const adapter = useMemo(() => {
    const current = () => metaList(ref.current.item, field);
    const write = (next) => ref.current.onCommitMeta({ [field]: next });
    return {
      load: () => current(),
      create: async (_item, values) => {
        const row = { id: crypto.randomUUID(), ...values };
        return (await write([...current(), row])) ? row : null;
      },
      update: async (row, values) => {
        const next = { ...row, ...values };
        return (await write(current().map((r) => (r.id === row.id ? next : r)))) ? next : null;
      },
      remove: (row) => write(current().filter((r) => r.id !== row.id)),
    };
  }, [field]);
  return <ChildRecords item={item} config={config} adapter={adapter} {...options} />;
}

export function makeMetaRecordsSection(options) {
  function MetaRecordsSection({ item, config, onCommitMeta }) {
    return <MetaRecords item={item} config={config} onCommitMeta={onCommitMeta} {...options} />;
  }
  return MetaRecordsSection;
}

// Fields section whose `meta: true` relation pickers persist to metadata too
// (FieldsForm commits relation writes as columns).
export function makeMetaAwareFieldsSection(fields) {
  const metaKeys = new Set(fields.filter((f) => f.meta).map((f) => f.key));
  function MetaAwareFieldsSection({ item, onPatch, onCommit, onCommitMeta }) {
    const commit = async (partial) => {
      const cols = {};
      const meta = {};
      for (const [k, v] of Object.entries(partial)) (metaKeys.has(k) ? meta : cols)[k] = v;
      const results = await Promise.all([
        Object.keys(cols).length ? onCommit(cols) : true,
        Object.keys(meta).length ? onCommitMeta(meta) : true,
      ]);
      return results.every(Boolean);
    };
    return <FieldsForm item={item} fields={fields} onPatch={onPatch} onCommit={commit} onCommitMeta={onCommitMeta} />;
  }
  return MetaAwareFieldsSection;
}
