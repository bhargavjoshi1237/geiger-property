"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { DoorOpen, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/internal/shared/screen_kit";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { listUnits, createUnit } from "@/lib/supabase/units";

// Units belonging to this parent — filtered by a foreign key (propertyId,
// buildingId, or unitTypeId, given via sectionProps.filterField). Quick-add a
// pre-linked unit; open one in the Units tab. Optimistic add.
export function RelatedUnitsSection({ item, filterField = "propertyId" }) {
  const { openItemInTab } = useWorkspaceUrl();
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState("");

  useEffect(() => {
    let alive = true;
    listUnits()
      .then((rows) => {
        if (!alive) return;
        setUnits(rows ?? []);
        setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setUnits([]);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const mine = useMemo(
    () => units.filter((u) => u[filterField] === item.id),
    [units, filterField, item.id],
  );

  const add = async () => {
    const trimmed = label.trim();
    if (!trimmed) {
      toast.error("Give the unit a label.");
      return;
    }
    const optimistic = {
      id: crypto.randomUUID(),
      label: trimmed,
      [filterField]: item.id,
      status: "Vacant",
    };
    setUnits((prev) => [optimistic, ...prev]);
    setLabel("");
    const created = await createUnit(optimistic);
    if (created) {
      setUnits((prev) => prev.map((u) => (u.id === optimistic.id ? created : u)));
    } else {
      setUnits((prev) => prev.filter((u) => u.id !== optimistic.id));
      toast.error("Couldn't add the unit.");
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading units…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="New unit label, e.g. 4B"
          className="bg-surface-card"
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <Button
          className="bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={add}
        >
          <Plus className="h-4 w-4" /> Add unit
        </Button>
      </div>

      {mine.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface-subtle">
          <EmptyState
            icon={DoorOpen}
            title="No units yet"
            description="Add a unit to link it here."
          />
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface-subtle">
          {mine.map((u) => (
            <li
              key={u.id}
              className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 hover:bg-surface-hover"
              onClick={() => openItemInTab(u.id, "Units")}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{u.label}</p>
                <p className="text-xs text-text-tertiary">
                  {[
                    u.bedrooms ? `${u.bedrooms} bd` : null,
                    u.bathrooms ? `${u.bathrooms} ba` : null,
                    u.sqft ? `${u.sqft} sqft` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "No specs"}
                </p>
              </div>
              <Badge variant="neutral">{u.status}</Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default RelatedUnitsSection;
