"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Sparkles, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/internal/shared/screen_kit";
import { listAmenities } from "@/lib/supabase/amenities";
import {
  listAmenityLinks,
  attachAmenity,
  detachAmenity,
} from "@/lib/supabase/amenity_links";

// Attach/detach amenities to this owner (property/unit/building/unit_type) via
// property.amenity_links. Available amenities are scope-filtered for properties
// and units. Optimistic add/remove.
function inScope(amenity, ownerType) {
  if (ownerType === "property") return ["property", "both"].includes(amenity.scope);
  if (ownerType === "unit") return ["unit", "both"].includes(amenity.scope);
  return true;
}

export function AmenitiesSection({ item, config }) {
  const ownerType = config.key;
  const [amenities, setAmenities] = useState([]);
  const [linkedIds, setLinkedIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pick, setPick] = useState("");

  useEffect(() => {
    let alive = true;
    Promise.all([listAmenities(), listAmenityLinks(ownerType, item.id)])
      .then(([all, links]) => {
        if (!alive) return;
        setAmenities(all ?? []);
        setLinkedIds((links ?? []).map((l) => l.amenityId));
        setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [ownerType, item.id]);

  const attached = useMemo(
    () => amenities.filter((a) => linkedIds.includes(a.id)),
    [amenities, linkedIds],
  );
  const available = useMemo(
    () =>
      amenities.filter(
        (a) => !linkedIds.includes(a.id) && inScope(a, ownerType),
      ),
    [amenities, linkedIds, ownerType],
  );

  const attach = async (amenityId) => {
    if (!amenityId) return;
    setLinkedIds((prev) => [...prev, amenityId]);
    setPick("");
    const ok = await attachAmenity(amenityId, ownerType, item.id);
    if (!ok) {
      setLinkedIds((prev) => prev.filter((id) => id !== amenityId));
      toast.error("Couldn't attach that amenity.");
    }
  };

  const detach = async (amenityId) => {
    const prev = linkedIds;
    setLinkedIds((ids) => ids.filter((id) => id !== amenityId));
    const ok = await detachAmenity(amenityId, ownerType, item.id);
    if (!ok) {
      setLinkedIds(prev);
      toast.error("Couldn't remove that amenity.");
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading amenities…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Select value={pick} onValueChange={attach}>
          <SelectTrigger className="bg-surface-card">
            <SelectValue placeholder="Add an amenity…" />
          </SelectTrigger>
          <SelectContent>
            {available.length === 0 ? (
              <SelectItem value="__none__" disabled>
                No more amenities to add
              </SelectItem>
            ) : (
              available.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                  {a.category ? ` · ${a.category}` : ""}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 text-text-secondary"
          disabled
          aria-hidden
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {attached.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface-subtle">
          <EmptyState
            icon={Sparkles}
            title="No amenities attached"
            description="Add amenities from the picker above."
          />
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {attached.map((a) => (
            <Badge key={a.id} variant="purple" className="gap-1.5 py-1 pl-2.5 pr-1.5">
              {a.name}
              <button
                type="button"
                onClick={() => detach(a.id)}
                className="rounded-full p-0.5 hover:bg-white/10"
                aria-label={`Remove ${a.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

export default AmenitiesSection;
