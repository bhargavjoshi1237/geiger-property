"use client";

import { useEffect, useMemo, useState } from "react";
import { DoorOpen, Warehouse, Building2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { SectionCard, EmptyState } from "@/components/internal/shared/screen_kit";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { listFloorPlanOwners } from "@/lib/supabase/floor_plan_links";
import { listUnits } from "@/lib/supabase/units";
import { listProperties } from "@/lib/supabase/properties";
import { listBuildings } from "@/lib/supabase/buildings";

// Reverse view for a floor plan — units that reference it (units.floor_plan_id)
// plus properties/buildings it's linked to (floor_plan_links). Read-only.
export function FloorPlanLinkedSection({ item }) {
  const { openItemInTab } = useWorkspaceUrl();
  const [units, setUnits] = useState([]);
  const [links, setLinks] = useState([]);
  const [names, setNames] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    Promise.all([
      listUnits(),
      listFloorPlanOwners(item.id),
      listProperties(),
      listBuildings(),
    ])
      .then(([allUnits, owners, props, buildings]) => {
        if (!alive) return;
        const map = {};
        (props || []).forEach((p) => (map[`property:${p.id}`] = p.name));
        (buildings || []).forEach((b) => (map[`building:${b.id}`] = b.name));
        setNames(map);
        setUnits((allUnits || []).filter((u) => u.floorPlanId === item.id));
        setLinks(owners ?? []);
        setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [item.id]);

  const owners = useMemo(
    () => links.filter((l) => l.ownerType === "property" || l.ownerType === "building"),
    [links],
  );

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading links…</p>;
  }

  const nothing = units.length === 0 && owners.length === 0;
  if (nothing) {
    return (
      <div className="rounded-xl border border-border bg-surface-subtle">
        <EmptyState
          icon={DoorOpen}
          title="Not linked yet"
          description="Link this plan from a unit, property, or building."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {units.length ? (
        <SectionCard title="Units" bodyPadding={false}>
          <ul className="divide-y divide-border">
            {units.map((u) => (
              <li
                key={u.id}
                className="flex cursor-pointer items-center justify-between gap-3 px-5 py-3 hover:bg-surface-hover"
                onClick={() => openItemInTab(u.id, "Units")}
              >
                <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <DoorOpen className="h-4 w-4 text-text-secondary" /> {u.label}
                </span>
                <Badge variant="neutral">{u.status}</Badge>
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}

      {owners.length ? (
        <SectionCard title="Properties & buildings" bodyPadding={false}>
          <ul className="divide-y divide-border">
            {owners.map((o) => {
              const Icon = o.ownerType === "building" ? Warehouse : Building2;
              const tab = o.ownerType === "building" ? "Buildings & Blocks" : "Properties";
              return (
                <li
                  key={o.id}
                  className="flex cursor-pointer items-center justify-between gap-3 px-5 py-3 hover:bg-surface-hover"
                  onClick={() => openItemInTab(o.ownerId, tab)}
                >
                  <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <Icon className="h-4 w-4 text-text-secondary" />
                    {names[`${o.ownerType}:${o.ownerId}`] || "Unknown"}
                  </span>
                  <Badge variant="neutral">{o.ownerType}</Badge>
                </li>
              );
            })}
          </ul>
        </SectionCard>
      ) : null}
    </div>
  );
}

export default FloorPlanLinkedSection;
