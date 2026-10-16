"use client";

import { ListLoading } from "@/components/internal/shared/screen_kit";

// Small section helpers shared by the Accounting screens.

// Wrap a section so writes to `keys` (fields with no real column, e.g. a
// relation's propertyName) are mirrored into the metadata bag and persist.
export function withMetaMirror(Section, keys) {
  function MirroredSection(props) {
    const { item, onCommit } = props;
    const commit = (partial) => {
      const mirrored = keys.filter((k) => k in partial);
      if (!mirrored.length) return onCommit(partial);
      const metadata = { ...(item?.metadata || {}), ...(partial.metadata || {}) };
      for (const k of mirrored) metadata[k] = partial[k];
      return onCommit({ ...partial, metadata });
    };
    return <Section {...props} onCommit={commit} />;
  }
  return MirroredSection;
}

// Section-level loader for custom sections that fetch their own data.
export function SectionLoading() {
  return (
    <ListLoading className="py-10" />
  );
}

// Compact label/value summary tiles used above custom section lists.
const COLS = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-4" };

export function SummaryTiles({ items }) {
  return (
    <div
      className={`grid grid-cols-1 divide-y divide-border rounded-xl border border-border bg-surface-subtle sm:divide-x sm:divide-y-0 ${COLS[items.length] || "sm:grid-cols-3"}`}
    >
      {items.map((t) => (
        <div key={t.label} className="px-4 py-3">
          <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
            {t.label}
          </p>
          <p className={`mt-1 text-lg font-semibold tabular-nums ${t.className || "text-foreground"}`}>
            {t.value}
          </p>
        </div>
      ))}
    </div>
  );
}
