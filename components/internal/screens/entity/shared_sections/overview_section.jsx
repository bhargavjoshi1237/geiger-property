"use client";

import { SectionCard, StatGrid } from "@/components/internal/shared/screen_kit";
import { FactList } from "@/components/internal/shared/overview_kit";
import { StoredImage } from "@/components/internal/shared/stored_file";
import { fieldFile, fileRef, isPdf } from "@/lib/files/refs";

// Generic read-only snapshot: KPI tiles from config.overviewStats(item), facts from config.detailFields, plus image and description.
function factValue(item, field) {
  const raw = item[field.key];
  if (raw === null || raw === undefined || raw === "") return "";
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
  // The working form's metadata wins (a fresh upload); media rows carry their own bucket + path.
  const merged = { ...item, ...(item.metadata || {}) };
  const image = fieldFile(merged, "coverUrl") || fieldFile(merged, "imageUrl") || fileRef(item);

  return (
    <div className="space-y-8">
      {stats?.length ? (
        <StatGrid columns={cols} stats={stats} />
      ) : null}

      {image && !isPdf(image) ? (
        <SectionCard bodyPadding={false}>
          <StoredImage file={image} alt={item.name || item.label || "Preview"} className="max-h-72 w-full object-cover" />
        </SectionCard>
      ) : null}

      {fields.length ? (
        <SectionCard bare title="At a glance">
          <FactList facts={fields.map((f) => ({ key: f.key, label: f.label, value: factValue(item, f) }))} />
        </SectionCard>
      ) : null}

      {description ? (
        <SectionCard bare title="Description">
          <p className="whitespace-pre-wrap text-sm text-text-secondary">
            {description}
          </p>
        </SectionCard>
      ) : null}
    </div>
  );
}

export default OverviewSection;
