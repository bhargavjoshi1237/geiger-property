"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, UsersRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/internal/shared/screen_kit";
import {
  listHouseholds,
  createHousehold,
  updateHousehold,
  softDeleteHousehold,
} from "@/lib/supabase/tenant_households";

// Tenants · Household & Occupants section — lists the tenant's household(s)
// from `property.tenant_households` (no static seed). Fetch on mount, optimistic
// add/remove + occupant-count edit, reconcile on failure.
export function HouseholdSection({ item }) {
  const [households, setHouseholds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");

  useEffect(() => {
    let alive = true;
    listHouseholds(item.id)
      .then((rows) => {
        if (!alive) return;
        setHouseholds(rows ?? []);
        setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setHouseholds([]);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [item.id]);

  const add = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Give the household a name.");
      return;
    }
    const optimistic = {
      id: crypto.randomUUID(),
      primaryTenantId: item.id,
      name: trimmed,
      occupantCount: 1,
      propertyId: item.propertyId ?? null,
    };
    setHouseholds((prev) => [optimistic, ...prev]);
    setName("");
    const created = await createHousehold(optimistic);
    if (created) {
      setHouseholds((prev) =>
        prev.map((h) => (h.id === optimistic.id ? created : h)),
      );
    } else {
      setHouseholds((prev) => prev.filter((h) => h.id !== optimistic.id));
      toast.error("Couldn't add the household.");
    }
  };

  const setOccupants = async (h, value) => {
    const next = Number(value) || 0;
    const prev = households;
    setHouseholds((prevH) =>
      prevH.map((x) => (x.id === h.id ? { ...x, occupantCount: next } : x)),
    );
    const saved = await updateHousehold(h.id, { occupantCount: next });
    if (!saved) {
      setHouseholds(prev);
      toast.error("Couldn't update occupant count.");
    }
  };

  const remove = async (h) => {
    const prev = households;
    setHouseholds((h2) => h2.filter((x) => x.id !== h.id));
    const ok = await softDeleteHousehold(h.id);
    if (!ok) {
      setHouseholds(prev);
      toast.error("Couldn't remove the household.");
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading households…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New household name"
          className="bg-surface-card"
        />
        <Button
          className="bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={add}
        >
          <Plus className="h-4 w-4" /> Add
        </Button>
      </div>

      {households.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface-subtle">
          <EmptyState
            icon={UsersRound}
            title="No households yet"
            description="Group this tenant with co-residents under a household."
          />
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface-subtle">
          {households.map((h) => (
            <li
              key={h.id}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">{h.name}</p>
                <p className="text-xs text-text-secondary">
                  {h.occupantCount} occupant{h.occupantCount === 1 ? "" : "s"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  value={h.occupantCount}
                  onChange={(e) => setOccupants(h, e.target.value)}
                  className="w-20 bg-surface-card"
                  aria-label="Occupant count"
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-red-300 hover:bg-red-500/10"
                  onClick={() => remove(h)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default HouseholdSection;
