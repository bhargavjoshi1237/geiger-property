"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Ruler, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/internal/shared/screen_kit";
import { listFloorPlans } from "@/lib/supabase/floor_plans";
import {
  listFloorPlanLinks,
  attachFloorPlan,
  detachFloorPlan,
} from "@/lib/supabase/floor_plan_links";

// Floor-plan linking. `mode: "single"` (units) picks one plan → onCommit sets the
// working form's floorPlanId (persisted on Save). `mode: "multi"` (properties/
// buildings) attaches many plans via property.floor_plan_links.
const NONE = "__none__";

function PlanCard({ plan, onRemove }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface-subtle">
      {plan.imageUrl ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={plan.imageUrl}
          alt={plan.name}
          className="aspect-video w-full object-cover"
        />
      ) : (
        <div className="flex aspect-video w-full items-center justify-center bg-surface-card text-text-tertiary">
          <Ruler className="h-6 w-6" />
        </div>
      )}
      <div className="flex items-start justify-between gap-2 p-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{plan.name}</p>
          <p className="text-xs text-text-tertiary">
            {[
              plan.bedrooms ? `${plan.bedrooms} bd` : null,
              plan.bathrooms ? `${plan.bathrooms} ba` : null,
              plan.sqft ? `${plan.sqft} sqft` : null,
            ]
              .filter(Boolean)
              .join(" · ") || "No specs"}
          </p>
        </div>
        {onRemove ? (
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-red-300 hover:bg-red-500/10"
            onClick={onRemove}
            aria-label={`Remove ${plan.name}`}
          >
            <X className="h-4 w-4" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function FloorPlansSection({ item, config, onCommit, mode = "multi" }) {
  const ownerType = config.key;
  const [plans, setPlans] = useState([]);
  const [linkedIds, setLinkedIds] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const linkFetch =
      mode === "single"
        ? Promise.resolve(null)
        : listFloorPlanLinks(ownerType, item.id);
    Promise.all([listFloorPlans(), linkFetch])
      .then(([all, links]) => {
        if (!alive) return;
        setPlans(all ?? []);
        if (links) setLinkedIds(links.map((l) => l.floorPlanId));
        setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [ownerType, item.id, mode]);

  const attached = useMemo(
    () => plans.filter((p) => linkedIds.includes(p.id)),
    [plans, linkedIds],
  );
  const available = useMemo(
    () => plans.filter((p) => !linkedIds.includes(p.id)),
    [plans, linkedIds],
  );

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading floor plans…</p>;
  }

  // Single-pick mode (a unit references exactly one plan).
  if (mode === "single") {
    const selected = plans.find((p) => p.id === item.floorPlanId) || null;
    return (
      <div className="space-y-4">
        <Select
          value={item.floorPlanId || NONE}
          onValueChange={(v) => onCommit({ floorPlanId: v === NONE ? null : v })}
        >
          <SelectTrigger className="bg-surface-card">
            <SelectValue placeholder="Choose a floor plan…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>None</SelectItem>
            {plans.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selected ? (
          <div className="max-w-sm">
            <PlanCard plan={selected} />
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-surface-subtle">
            <EmptyState
              icon={Ruler}
              title="No floor plan selected"
              description="Pick a plan to link it to this unit."
            />
          </div>
        )}
      </div>
    );
  }

  // Multi-attach mode.
  const attach = async (planId) => {
    if (!planId || planId === NONE) return;
    setLinkedIds((prev) => [...prev, planId]);
    const ok = await attachFloorPlan(planId, ownerType, item.id);
    if (!ok) {
      setLinkedIds((prev) => prev.filter((id) => id !== planId));
      toast.error("Couldn't attach that floor plan.");
    }
  };

  const detach = async (planId) => {
    const prev = linkedIds;
    setLinkedIds((ids) => ids.filter((id) => id !== planId));
    const ok = await detachFloorPlan(planId, ownerType, item.id);
    if (!ok) {
      setLinkedIds(prev);
      toast.error("Couldn't remove that floor plan.");
    }
  };

  return (
    <div className="space-y-4">
      <Select value="" onValueChange={attach}>
        <SelectTrigger className="bg-surface-card">
          <SelectValue placeholder="Attach a floor plan…" />
        </SelectTrigger>
        <SelectContent>
          {available.length === 0 ? (
            <SelectItem value={NONE} disabled>
              No more floor plans to attach
            </SelectItem>
          ) : (
            available.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>

      {attached.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface-subtle">
          <EmptyState
            icon={Ruler}
            title="No floor plans linked"
            description="Attach floor plans from the picker above."
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {attached.map((p) => (
            <PlanCard key={p.id} plan={p} onRemove={() => detach(p.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

export default FloorPlansSection;
