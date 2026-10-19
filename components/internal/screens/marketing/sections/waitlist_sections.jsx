"use client";

import { useMemo } from "react";
import { toast } from "sonner";
import { DoorOpen, Send } from "lucide-react";

import { Badge } from "@geiger/ui/badge";
import { Button } from "@geiger/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@geiger/ui/select";
import { DataTable, EmptyState, ListLoading, SectionCard } from "@/components/internal/shared/screen_kit";
import { listUnits } from "@/lib/supabase/units";
import { listProperties } from "@/lib/supabase/properties";
import { listingsLayer } from "@/lib/supabase/listings";
import { logSystemActivity } from "@/lib/supabase/activity_log";
import { KeyValues, useLoad } from "./common";
import { addDaysISO, currency, daysSince, formatDate, formatDateTime, toOptions } from "../shared";

// Waitlist editor sections: matching available units, offers, overview.

const OPEN_UNIT = ["Vacant", "Notice", "Make-ready"];
const OFFER_STATUS = toOptions(["Pending", "Accepted", "Declined", "Expired"]);

// Units that could satisfy this entry (property, bedrooms, budget), soonest first.
export async function matchingUnits(entry) {
  const [units, props, listings] = await Promise.all([listUnits(), listProperties(), listingsLayer.list()]);
  const propName = new Map((props ?? []).map((p) => [p.id, p.name]));
  const listed = new Map((listings ?? []).filter((l) => l.status === "Active" && l.unitId).map((l) => [l.unitId, l]));
  const beds = Number(entry.desiredBedrooms) || 0;
  const budget = Number(entry.budget) || 0;
  return (units ?? [])
    .filter((u) => OPEN_UNIT.includes(u.status))
    .filter((u) => !entry.propertyId || u.propertyId === entry.propertyId)
    .filter((u) => !beds || Number(u.bedrooms) >= beds)
    .filter((u) => !budget || !Number(u.rent) || Number(u.rent) <= budget)
    .map((u) => ({
      ...u,
      name: propName.get(u.propertyId) ? `${propName.get(u.propertyId)} · ${u.label}` : u.label,
      listing: listed.get(u.id) || null,
      availableOn: u.status === "Notice" ? u.leaseEnd : null,
    }))
    .sort((a, b) => String(a.availableOn || "").localeCompare(String(b.availableOn || "")));
}

const offersOf = (item) => (Array.isArray(item.metadata?.offers) ? item.metadata.offers : []);

// Offer a unit: status Offered + unit link + an entry in metadata.offers.
export async function offerUnit({ item, commit, commitMeta, log }, unit, { respondBy, rent, note } = {}) {
  const ok = await commit({ status: "Offered", unitId: unit.id, unit: unit.name });
  if (!ok) return false;
  await commitMeta({
    offers: [
      ...offersOf(item),
      {
        id: crypto.randomUUID(),
        unitId: unit.id,
        unit: unit.name,
        rent: Number(rent ?? unit.rent) || 0,
        offeredAt: new Date().toISOString(),
        respondBy: respondBy || addDaysISO(3),
        status: "Pending",
        note: note || "",
      },
    ],
  });
  log(`Offered ${unit.name}`);
  return true;
}

export function MatchingUnitsSection({ item, config, onCommit, onCommitMeta }) {
  const units = useLoad(() => matchingUnits(item), [item.id, item.propertyId, item.desiredBedrooms, item.budget]);
  const offered = new Set(offersOf(item).map((o) => o.unitId));

  const offer = async (u) => {
    const ok = await offerUnit(
      { item, commit: onCommit, commitMeta: onCommitMeta, log: (s) => logSystemActivity(config.key, item.id, "action", s) },
      u,
    );
    if (ok) toast.success(`Offered ${u.name}. They have until ${formatDate(addDaysISO(3))} to respond.`);
  };

  if (units === undefined) return <ListLoading label="Finding matching units" className="py-10" />;

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-secondary">
        Vacant, on-notice and make-ready units{item.propertyName ? ` at ${item.propertyName}` : ""}
        {Number(item.desiredBedrooms) ? ` with ${item.desiredBedrooms}+ bedrooms` : ""}
        {Number(item.budget) ? ` up to ${currency(item.budget)}/mo` : ""}.
      </p>
      <DataTable
        columns={[
          {
            key: "name",
            header: "Unit",
            render: (u) => (
              <div className="flex flex-col gap-0.5">
                <span className="font-medium text-foreground">{u.name}</span>
                <span className="text-xs text-text-secondary">
                  {`${Number(u.bedrooms) || 0} bd · ${Number(u.bathrooms) || 0} ba`}
                  {u.sqft ? ` · ${u.sqft} sqft` : ""}
                </span>
              </div>
            ),
          },
          {
            key: "status",
            header: "Status",
            render: (u) => (
              <div className="flex flex-wrap gap-1">
                <Badge variant={u.status === "Vacant" ? "success" : "warning"}>{u.status}</Badge>
                {u.listing ? <Badge variant="info">Listed</Badge> : null}
              </div>
            ),
          },
          { key: "available", header: "Available", className: "text-sm text-text-secondary", render: (u) => (u.availableOn ? formatDate(u.availableOn) : "Now") },
          { key: "rent", header: "Rent", align: "right", className: "text-right tabular-nums", render: (u) => (u.rent ? `${currency(u.rent)}/mo` : "—") },
          {
            key: "offer",
            header: "",
            align: "right",
            className: "text-right",
            render: (u) =>
              offered.has(u.id) ? (
                <Badge variant="neutral">Offered</Badge>
              ) : (
                <Button size="sm" variant="outline" className="border-border bg-surface-card hover:bg-surface-hover" onClick={() => offer(u)}>
                  <Send className="h-3.5 w-3.5" /> Offer
                </Button>
              ),
          },
        ]}
        data={units ?? []}
        getRowKey={(u) => u.id}
        empty={
          <div className="rounded-xl border border-border bg-surface-subtle">
            <EmptyState icon={DoorOpen} title="No matching units right now" description="Widen the bedroom or budget preference, or check back when a unit goes on notice." />
          </div>
        }
      />
    </div>
  );
}

export function OffersSection({ item, config, onCommit, onCommitMeta }) {
  const offers = useMemo(() => [...offersOf(item)].reverse(), [item]);

  const setStatus = async (offer, status) => {
    const next = offersOf(item).map((o) => (o.id === offer.id ? { ...o, status, respondedAt: new Date().toISOString() } : o));
    if (!(await onCommitMeta({ offers: next }))) return;
    logSystemActivity(config.key, item.id, "action", `Offer for ${offer.unit}: ${status}`);
    if (status === "Declined" || status === "Expired") {
      const stillPending = next.some((o) => o.status === "Pending");
      if (!stillPending && item.status === "Offered") await onCommit({ status: "Waiting" });
      toast.success(`Offer ${status.toLowerCase()} — back in line at #${item.position || "—"}.`);
    } else if (status === "Accepted") {
      toast.success("Offer accepted. Convert them to an application from Actions.");
    }
  };

  if (!offers.length) {
    return (
      <div className="rounded-xl border border-border bg-surface-subtle">
        <EmptyState icon={Send} title="No offers yet" description="Offer a unit from Matching units or Actions → Offer unit." />
      </div>
    );
  }

  return (
    <SectionCard bodyPadding={false}>
      <ul className="divide-y divide-border">
        {offers.map((o) => (
          <li key={o.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{o.unit}</p>
              <p className="text-xs text-text-secondary">
                {[o.rent ? `${currency(o.rent)}/mo` : null, `Offered ${formatDateTime(o.offeredAt)}`, o.respondBy ? `Respond by ${formatDate(o.respondBy)}` : null, o.note]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <Select value={o.status} onValueChange={(v) => setStatus(o, v)}>
              <SelectTrigger className="w-40 bg-surface-card" aria-label="Offer status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OFFER_STATUS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

export function WaitlistOverviewSection({ item }) {
  const matches = useLoad(() => matchingUnits(item), [item.id, item.propertyId, item.desiredBedrooms, item.budget]);
  const m = item.metadata || {};
  const pending = offersOf(item).filter((o) => o.status === "Pending");
  return (
    <KeyValues
      items={[
        { label: "Position", value: Number(item.position) ? `#${item.position}` : "Unranked" },
        { label: "Priority", value: m.priority || "Standard" },
        { label: "Waiting", value: `${daysSince(item.joinedOn || item.createdAt) ?? 0} days (since ${formatDate(item.joinedOn || item.createdAt)})` },
        { label: "Contact", value: [item.email, item.phone].filter(Boolean).join(" · ") || "—" },
        { label: "Property", value: item.propertyName || "Any" },
        { label: "Looking for", value: [Number(item.desiredBedrooms) ? `${item.desiredBedrooms}+ bd` : null, item.unitPreference, item.budget ? `≤ ${currency(item.budget)}/mo` : null].filter(Boolean).join(" · ") || "—" },
        { label: "Move-in", value: formatDate(item.moveInDate) },
        { label: "Matching units now", value: matches === undefined ? "…" : String(matches?.length ?? 0) },
        { label: "Open offer", value: pending.length ? `${pending[0].unit} · respond by ${formatDate(pending[0].respondBy)}` : "None" },
        { label: "Last notified", value: m.lastNotifiedAt ? `${formatDateTime(m.lastNotifiedAt)} (${m.notifyCount || 1}×)` : "Never" },
      ]}
    />
  );
}
