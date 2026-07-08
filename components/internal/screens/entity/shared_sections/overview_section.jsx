"use client";

import { StatsBar, SectionCard } from "@/components/internal/shared/screen_kit";

// Generic, read-only snapshot. Optional KPI row from config.overviewStats(item),
// a quick-facts grid derived from config.detailFields, plus a cover/plan image
// and description when present. Everything editable lives in Details.
function factValue(item, field) {
  const raw = item[field.key];
  if (raw === null || raw === undefined || raw === "") return "—";
  if (field.type === "select" || field.type === "entity") {
    if (field.type === "select") {
      const opt = field.options?.find((o) => o.value === raw);
      return opt?.label ?? String(raw);
    }
    return String(raw);
  }
  if (field.prefix) return `${field.prefix}${raw}`;
  return String(raw);
}

export function OverviewSection({ item, config }) {
  const stats = config.overviewStats ? config.overviewStats(item) : null;
  const cols = stats ? Math.min(4, Math.max(2, stats.length)) : 4;

  const fields = (config.detailFields || []).filter(
    (f) => f.type !== "textarea" && f.type !== "entity",
  );
  const description = item.description || "";
  const image = item.coverUrl || item.imageUrl || item.url || "";

  return (
    <div className="space-y-6">
      {stats?.length ? (
        <StatsBar
          columns={cols}
          stats={stats.map((s) => ({
            label: s.label,
            value: s.value,
            footer: s.hint,
          }))}
        />
      ) : null}

      {image ? (
        <SectionCard bodyPadding={false}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image}
            alt={item.name || item.label || "Preview"}
            className="max-h-72 w-full object-cover"
          />
        </SectionCard>
      ) : null}

      {fields.length ? (
        <SectionCard title="At a glance">
          <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
            {fields.map((f) => (
              <div key={f.key} className="flex flex-col gap-0.5">
                <dt className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
                  {f.label}
                </dt>
                <dd className="text-sm text-foreground">{factValue(item, f)}</dd>
              </div>
            ))}
          </dl>
        </SectionCard>
      ) : null}

      {description ? (
        <SectionCard title="Description">
          <p className="whitespace-pre-wrap text-sm text-text-secondary">
            {description}
          </p>
        </SectionCard>
      ) : null}
    </div>
  );
}

export default OverviewSection;
