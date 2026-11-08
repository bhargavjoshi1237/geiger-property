"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search } from "lucide-react";

import { Button } from "@geiger/ui/button";
import { Checkbox } from "@geiger/ui/checkbox";
import { Input } from "@geiger/ui/input";
import { Label } from "@geiger/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@geiger/ui/select";
import { BED_OPTIONS, filtersToQuery } from "@/lib/leasing/public/filters";

// Vacancy search filters (LEAS-01). Filters live in the URL so every result set is a shareable, crawlable address.

const ANY = "any";

export function SearchFilters({ path, filters, properties }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState({
    propertyId: filters.propertyId || ANY,
    beds: filters.beds === null || filters.beds === undefined ? ANY : String(filters.beds),
    maxRent: filters.maxRent ? String(filters.maxRent) : "",
    moveInBy: filters.moveInBy || "",
    pets: Boolean(filters.pets),
  });
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));

  const submit = (e) => {
    e.preventDefault();
    const query = filtersToQuery({
      propertyId: draft.propertyId === ANY ? null : draft.propertyId,
      beds: draft.beds === ANY ? null : Number(draft.beds),
      maxRent: Number(draft.maxRent) > 0 ? Math.round(Number(draft.maxRent)) : null,
      moveInBy: draft.moveInBy || null,
      pets: draft.pets,
    });
    startTransition(() => router.push(query ? `${path}?${query}` : path, { scroll: false }));
  };

  return (
    <form
      onSubmit={submit}
      role="search"
      aria-label="Filter homes"
      className="grid gap-3 rounded-xl border border-border bg-surface-subtle p-4 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr_auto_auto] lg:items-end"
    >
      {properties.length > 1 ? (
        <div className="grid gap-1.5">
          <Label htmlFor="f-property">Property</Label>
          <Select value={draft.propertyId} onValueChange={set("propertyId")}>
            <SelectTrigger id="f-property" className="w-full bg-surface-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>All properties</SelectItem>
              {properties.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      <div className="grid gap-1.5">
        <Label htmlFor="f-beds">Bedrooms</Label>
        <Select value={draft.beds} onValueChange={set("beds")}>
          <SelectTrigger id="f-beds" className="w-full bg-surface-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BED_OPTIONS.map((o) => (
              <SelectItem key={o.label} value={o.value === "" ? ANY : o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="f-rent">Max rent ($/mo)</Label>
        <Input id="f-rent" type="number" inputMode="numeric" min={0} step={50} placeholder="Any" value={draft.maxRent} onChange={(e) => set("maxRent")(e.target.value)} className="bg-surface-card" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="f-move">Move in by</Label>
        <Input id="f-move" type="date" value={draft.moveInBy} onChange={(e) => set("moveInBy")(e.target.value)} className="bg-surface-card" />
      </div>
      <div className="flex h-9 items-center gap-2">
        <Checkbox id="f-pets" className="size-5" checked={draft.pets} onCheckedChange={(v) => set("pets")(v === true)} />
        <Label htmlFor="f-pets" className="font-normal">
          Pets allowed
        </Label>
      </div>
      <Button type="submit" disabled={pending} className="w-full lg:w-auto">
        {pending ? <Loader2 className="animate-spin" /> : <Search />}
        Search
      </Button>
    </form>
  );
}
