"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Building2, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/internal/shared/screen_kit";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { listProperties, updateProperty } from "@/lib/supabase/properties";

// Portfolio membership — properties are members when properties.portfolio_id ==
// this portfolio's id. Assign/remove flips that FK. Optimistic.
export function PortfolioPropertiesSection({ item }) {
  const { openItemInTab } = useWorkspaceUrl();
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pick, setPick] = useState("");

  useEffect(() => {
    let alive = true;
    listProperties()
      .then((rows) => {
        if (!alive) return;
        setProperties(rows ?? []);
        setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setProperties([]);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const members = useMemo(
    () => properties.filter((p) => p.portfolioId === item.id),
    [properties, item.id],
  );
  const available = useMemo(
    () => properties.filter((p) => p.portfolioId !== item.id),
    [properties, item.id],
  );

  const setPortfolio = (propId, portfolioId) =>
    setProperties((prev) =>
      prev.map((p) => (p.id === propId ? { ...p, portfolioId } : p)),
    );

  const assign = async (propId) => {
    if (!propId) return;
    setPortfolio(propId, item.id);
    setPick("");
    const ok = await updateProperty(propId, { portfolioId: item.id });
    if (!ok) {
      setPortfolio(propId, null);
      toast.error("Couldn't add that property.");
    }
  };

  const removeMember = async (propId) => {
    setPortfolio(propId, null);
    const ok = await updateProperty(propId, { portfolioId: null });
    if (!ok) {
      setPortfolio(propId, item.id);
      toast.error("Couldn't remove that property.");
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading properties…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Select value={pick} onValueChange={assign}>
          <SelectTrigger className="bg-surface-card">
            <SelectValue placeholder="Add a property…" />
          </SelectTrigger>
          <SelectContent>
            {available.length === 0 ? (
              <SelectItem value="__none__" disabled>
                No more properties to add
              </SelectItem>
            ) : (
              available.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                  {p.city ? ` · ${p.city}` : ""}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
        <Button variant="ghost" size="icon" className="shrink-0 text-text-secondary" disabled aria-hidden>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {members.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface-subtle">
          <EmptyState
            icon={Building2}
            title="No properties yet"
            description="Add properties to build this portfolio."
          />
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface-subtle">
          {members.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <button
                type="button"
                onClick={() => openItemInTab(p.id, "Properties")}
                className="min-w-0 text-left"
              >
                <p className="truncate text-sm font-medium text-foreground hover:underline">
                  {p.name}
                </p>
                <p className="text-xs text-text-tertiary">
                  {[p.city, p.type].filter(Boolean).join(" · ")}
                </p>
              </button>
              <div className="flex items-center gap-2">
                <Badge variant="neutral">{p.units ?? 0} units</Badge>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-red-300 hover:bg-red-500/10"
                  onClick={() => removeMember(p.id)}
                  aria-label={`Remove ${p.name}`}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default PortfolioPropertiesSection;
