"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/internal/shared/screen_kit";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { listAmenityOwners } from "@/lib/supabase/amenity_links";
import { listProperties } from "@/lib/supabase/properties";
import { listUnits } from "@/lib/supabase/units";
import { listBuildings } from "@/lib/supabase/buildings";
import { listUnitTypes } from "@/lib/supabase/unit_types";
import { OWNER_TYPE_LABEL } from "./entity_options";

// Reverse view for an amenity — every property/unit/building/unit_type it's
// attached to (from property.amenity_links), resolved to names. Read-only.
const TABS = { property: "Properties", unit: "Units", building: "Buildings & Blocks", unit_type: "Unit Types" };

export function AmenityAttachedSection({ item }) {
  const { openItemInTab } = useWorkspaceUrl();
  const [owners, setOwners] = useState([]);
  const [names, setNames] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    Promise.all([
      listAmenityOwners(item.id),
      listProperties(),
      listUnits(),
      listBuildings(),
      listUnitTypes(),
    ])
      .then(([links, props, units, buildings, types]) => {
        if (!alive) return;
        const map = {};
        (props || []).forEach((p) => (map[`property:${p.id}`] = p.name));
        (units || []).forEach((u) => (map[`unit:${u.id}`] = u.label));
        (buildings || []).forEach((b) => (map[`building:${b.id}`] = b.name));
        (types || []).forEach((t) => (map[`unit_type:${t.id}`] = t.name));
        setNames(map);
        setOwners(links ?? []);
        setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setOwners([]);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [item.id]);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading attachments…</p>;
  }

  if (owners.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface-subtle">
        <EmptyState
          icon={Sparkles}
          title="Not attached anywhere yet"
          description="Attach this amenity from a property or unit's Amenities section."
        />
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border rounded-xl border border-border bg-surface-subtle">
      {owners.map((o) => {
        const name = names[`${o.ownerType}:${o.ownerId}`] || "Unknown";
        const tab = TABS[o.ownerType];
        return (
          <li
            key={o.id}
            className="flex items-center justify-between gap-3 px-4 py-3"
          >
            <button
              type="button"
              disabled={!tab}
              onClick={() => tab && openItemInTab(o.ownerId, tab)}
              className="min-w-0 text-left text-sm font-medium text-foreground enabled:hover:underline"
            >
              {name}
            </button>
            <Badge variant="neutral">{OWNER_TYPE_LABEL[o.ownerType] || o.ownerType}</Badge>
          </li>
        );
      })}
    </ul>
  );
}

export default AmenityAttachedSection;
