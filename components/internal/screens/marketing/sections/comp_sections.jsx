"use client";

import { Scale } from "lucide-react";

import { DataTable, EmptyState, ListLoading } from "@/components/internal/shared/screen_kit";
import { listUnits } from "@/lib/supabase/units";
import { listProperties } from "@/lib/supabase/properties";
import { listRecordItems } from "@/lib/supabase/record_items";
import { cn } from "@/lib/utils";
import { KeyValues, useLoad } from "./common";
import { currency, formatDate } from "../shared";

// Rent comparable sections: comparison against your own units and rent trend.

export const perSqft = (rent, sqft) => (Number(sqft) > 0 && Number(rent) > 0 ? Number(rent) / Number(sqft) : 0);

// Monthly rent net of concessions (concessionValue is a monthly equivalent).
export const effectiveCompRent = (c) =>
  Math.max(0, (Number(c.rent) || 0) - (Number(c.metadata?.concessionValue ?? c.concessionValue) || 0));

const signed = (n) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${currency(Math.abs(n))}`;
const tone = (n) => (n > 0 ? "text-emerald-600 dark:text-emerald-400" : n < 0 ? "text-red-600 dark:text-red-400" : "text-text-secondary");

// Your units with the same bedroom count (scoped to the compared property when set).
async function ownUnitsLike(comp) {
  const [units, props] = await Promise.all([listUnits(), listProperties()]);
  const name = new Map((props ?? []).map((p) => [p.id, p.name]));
  const beds = Number(comp.bedrooms) || 0;
  const all = (units ?? []).filter((u) => Number(u.rent) > 0 && (Number(u.bedrooms) || 0) === beds);
  const scoped = comp.propertyId ? all.filter((u) => u.propertyId === comp.propertyId) : all;
  return (scoped.length ? scoped : all).map((u) => ({ ...u, name: name.get(u.propertyId) ? `${name.get(u.propertyId)} · ${u.label}` : u.label }));
}

export function ComparisonSection({ item }) {
  const loaded = useLoad(() => ownUnitsLike(item), [item.id, item.bedrooms, item.propertyId]);
  if (loaded === undefined) return <ListLoading label="Comparing with your units" className="py-10" />;
  const units = loaded || [];
  const compRent = effectiveCompRent(item);
  const compPsf = perSqft(compRent, item.sqft);
  const avg = units.length ? units.reduce((s, u) => s + Number(u.rent), 0) / units.length : 0;
  const sized = units.filter((u) => Number(u.sqft) > 0);
  const avgPsf = sized.length ? sized.reduce((s, u) => s + perSqft(u.rent, u.sqft), 0) / sized.length : 0;
  const gap = avg && compRent ? avg - compRent : 0;
  const suggested = compPsf && sized.length ? compPsf * (sized.reduce((s, u) => s + Number(u.sqft), 0) / sized.length) : compRent;

  return (
    <div className="space-y-5">
      <KeyValues
        columns={3}
        items={[
          { label: "Comp effective rent", value: compRent ? `${currency(compRent)}/mo` : "—" },
          { label: `Your avg (${Number(item.bedrooms) || 0} bd)`, value: avg ? `${currency(avg)}/mo` : "No matching units" },
          { label: "Gap", value: avg && compRent ? <span className={tone(gap)}>{signed(gap)} ({((gap / compRent) * 100).toFixed(1)}%)</span> : "—" },
          { label: "Comp $/sqft", value: compPsf ? `$${compPsf.toFixed(2)}` : "—" },
          { label: "Your $/sqft", value: avgPsf ? `$${avgPsf.toFixed(2)}` : "—" },
          { label: "Market rent at your size", value: suggested ? `${currency(suggested)}/mo` : "—" },
        ]}
      />
      <DataTable
        columns={[
          { key: "name", header: "Your unit", render: (u) => <span className="font-medium text-foreground">{u.name}</span> },
          { key: "layout", header: "Layout", className: "text-sm text-text-secondary", render: (u) => `${Number(u.bedrooms) || 0} bd · ${Number(u.bathrooms) || 0} ba${u.sqft ? ` · ${u.sqft} sqft` : ""}` },
          { key: "status", header: "Status", className: "text-sm text-text-secondary" },
          { key: "rent", header: "Rent", align: "right", className: "text-right tabular-nums", render: (u) => currency(u.rent) },
          { key: "psf", header: "$/sqft", align: "right", className: "text-right tabular-nums text-text-secondary", render: (u) => (perSqft(u.rent, u.sqft) ? `$${perSqft(u.rent, u.sqft).toFixed(2)}` : "—") },
          {
            key: "diff",
            header: "vs. comp",
            align: "right",
            className: "text-right tabular-nums",
            render: (u) => (compRent ? <span className={cn(tone(Number(u.rent) - compRent))}>{signed(Number(u.rent) - compRent)}</span> : "—"),
          },
        ]}
        data={units}
        getRowKey={(u) => u.id}
        empty={
          <div className="rounded-xl border border-border bg-surface-subtle">
            <EmptyState icon={Scale} title="No comparable units of yours" description="Add units with the same bedroom count and a rent to compare." />
          </div>
        }
      />
    </div>
  );
}

// Rent trend from recorded observations (record_items kind "observation").
export function CompTrendSummary({ item, config }) {
  const obs = useLoad(() => listRecordItems(config.key, item.id, "observation"), [item.id]);
  if (obs === undefined) return null;
  const sorted = [...(obs ?? [])].filter((o) => Number(o.amount) > 0).sort((a, b) => String(a.startsOn).localeCompare(String(b.startsOn)));
  if (sorted.length < 2) return null;
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const change = Number(last.amount) - Number(first.amount);
  return (
    <KeyValues
      title="Rent trend"
      columns={3}
      items={[
        { label: "First observed", value: `${currency(first.amount)} · ${formatDate(first.startsOn)}` },
        { label: "Latest", value: `${currency(last.amount)} · ${formatDate(last.startsOn)}` },
        { label: "Change", value: <span className={tone(change)}>{signed(change)} ({((change / Number(first.amount)) * 100).toFixed(1)}%)</span> },
      ]}
    />
  );
}
