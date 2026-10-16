"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Briefcase } from "lucide-react";

import { SectionCard } from "@/components/internal/shared/screen_kit";
import { ChildRecords, childLayerAdapter } from "@/components/internal/screens/entity/sections/child_records";
import { propertyOwnersLayer, listOwnersOfProperty } from "@/lib/supabase/property_owners";
import { cn } from "@/lib/utils";
import { daysUntil, formatDate, todayISO } from "../constants";
import { OWNER_FIELDS, demoteOtherPrimaries } from "../actions";
import { emitRefresh, useRefreshKey } from "./refresh";

// Ownership: property_owners rows (owner picker from the Owners directory, %,
// primary, start/end) with an allocation meter that warns when active shares
// don't total 100%.

const isActive = (r) => {
  const s = daysUntil(r.startsOn);
  const e = daysUntil(r.endsOn);
  return (s === null || s <= 0) && (e === null || e >= 0);
};

const summary = (r) => {
  const ended = daysUntil(r.endsOn) !== null && daysUntil(r.endsOn) < 0;
  return {
    title: r.ownerName || "Owner",
    meta: [r.startsOn && `Since ${formatDate(r.startsOn)}`, r.endsOn && `until ${formatDate(r.endsOn)}`].filter(Boolean).join(" ") || "No dates set",
    badge: ended ? "Ended" : r.isPrimary ? "Primary" : null,
    badgeVariant: ended ? "outline" : "success",
    aside: `${Number(r.ownershipPct) || 0}%`,
  };
};

export function OwnershipSection({ item, config }) {
  const refresh = useRefreshKey("owners", item.id);
  const [rows, setRows] = useState([]);

  // Wrap the child-layer adapter so this section sees the rows and keeps one primary.
  const adapter = useMemo(() => {
    const base = childLayerAdapter(propertyOwnersLayer, "propertyId", listOwnersOfProperty);
    const afterWrite = async (it, row) => {
      if (row?.isPrimary) {
        await demoteOtherPrimaries(it.id, row.id);
        emitRefresh("owners", it.id);
      }
      return row;
    };
    return {
      ...base,
      load: async (it) => {
        const r = (await base.load(it)) || [];
        setRows(r);
        return r;
      },
      create: async (it, values) => afterWrite(it, await base.create(it, { ...values, propertyName: it.name })),
      update: async (row, values) => afterWrite(item, await base.update(row, values)),
    };
    // Stable per record so ChildRecords doesn't refetch on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  const active = rows.filter(isActive);
  const total = active.reduce((s, r) => s + (Number(r.ownershipPct) || 0), 0);
  const rounded = Math.round(total * 100) / 100;
  const off = rows.length > 0 && rounded !== 100;
  const remaining = Math.max(0, 100 - rounded);

  return (
    <div className="space-y-5">
      <SectionCard title="Allocation" description="Active ownership shares on this property.">
        <div className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-2xl font-semibold tabular-nums text-foreground">{rounded}%</span>
            <span className="text-sm text-text-secondary">
              {active.length} active owner{active.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-strong">
            <div
              className={cn("h-full rounded-full", off ? (rounded > 100 ? "bg-red-400" : "bg-amber-400") : "bg-emerald-400")}
              style={{ width: `${Math.min(100, rounded)}%` }}
            />
          </div>
          {off ? (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {rounded > 100
                ? `Active shares add up to ${rounded}% — reduce them to 100%.`
                : `Active shares add up to ${rounded}% — ${remaining}% is unassigned.`}
            </div>
          ) : null}
        </div>
      </SectionCard>

      <ChildRecords
        key={refresh}
        item={item}
        config={config}
        adapter={adapter}
        fields={OWNER_FIELDS}
        summary={summary}
        singular="Owner"
        plural="Owners"
        icon={Briefcase}
        defaults={() => ({ ownershipPct: remaining || 100, startsOn: todayISO(), isPrimary: rows.length === 0 })}
        emptyDescription="Link owners from your Owners directory and record each one's share."
        onChange={setRows}
      />
    </div>
  );
}

export default OwnershipSection;
