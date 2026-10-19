"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Megaphone, Tag } from "lucide-react";

import { Badge } from "@geiger/ui/badge";
import { Input } from "@geiger/ui/input";
import { Switch } from "@geiger/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@geiger/ui/select";
import { DataTable, ListLoading, SectionCard, StatusPill } from "@/components/internal/shared/screen_kit";
import { FieldsForm } from "@/components/internal/screens/entity/fields_form";
import { ChildRecords, recordItemsAdapter } from "@/components/internal/screens/entity/sections/child_records";
import { listProspectsForListing } from "@/lib/supabase/prospects";
import { listShowingsForListing } from "@/lib/supabase/showings";
import { listApplicationsForListing } from "@/lib/supabase/applications";
import { listRecordItems } from "@/lib/supabase/record_items";
import { FunnelStrip, KeyValues, ProviderNotice, useLoad } from "./common";
import {
  APP_APPROVED,
  CHANNEL_STATUS_MAP,
  LISTING_STATUS_MAP,
  SPECIAL_TYPE_OPTIONS,
  SYNDICATION_CHANNELS,
  currency,
  daysSince,
  formatDate,
  formatDateTime,
  isPast,
  pct,
  selectOptions,
} from "../shared";

// Listing editor sections: overview, pricing + specials, syndication, lead sources.

// Normalized per-channel state (legacy rows stored { [label]: true }).
export function channelState(item) {
  const raw = item?.metadata?.syndication || {};
  const out = {};
  for (const c of SYNDICATION_CHANNELS) {
    const v = raw[c.key] ?? raw[c.label];
    out[c.key] =
      v && typeof v === "object"
        ? { enabled: Boolean(v.enabled), status: v.status || (v.enabled ? "Queued" : "Off"), lastPublishedAt: v.lastPublishedAt || null, url: v.url || "" }
        : { enabled: Boolean(v), status: v ? "Published" : "Off", lastPublishedAt: null, url: "" };
  }
  return out;
}

// Channel states after a publish/unpublish (internal tracking only).
export function publishChannels(item, publish) {
  const state = channelState(item);
  const anyEnabled = Object.values(state).some((c) => c.enabled);
  const now = new Date().toISOString();
  const next = {};
  for (const c of SYNDICATION_CHANNELS) {
    const cur = state[c.key];
    const enabled = cur.enabled || (publish && !anyEnabled && c.key === "website");
    next[c.key] = publish
      ? { ...cur, enabled, status: enabled ? "Published" : "Off", lastPublishedAt: enabled ? now : cur.lastPublishedAt }
      : { ...cur, status: cur.enabled ? "Paused" : "Off" };
  }
  return next;
}

// Effective monthly rent over a term after active specials.
export function effectiveRent(rent, specials, termMonths = 12) {
  const r = Number(rent) || 0;
  if (!r) return 0;
  let concession = 0;
  for (const s of specials || []) {
    if (s.status === "Inactive" || (s.endsOn && isPast(s.endsOn))) continue;
    const v = Number(s.amount) || 0;
    const type = s.metadata?.specialType || s.specialType;
    if (type === "Weeks free") concession += (r * 12 * v) / 52;
    else if (type === "Months free") concession += r * v;
    else if (type === "Dollars off") concession += v;
    else if (type === "Percent off") concession += (r * termMonths * v) / 100;
  }
  return Math.max(0, r - concession / termMonths);
}

const SPECIAL_FIELDS = [
  { key: "name", label: "Special", type: "text", required: true, full: true, placeholder: "e.g. 6 weeks free on a 13-month lease" },
  { key: "specialType", label: "Type", type: "select", options: SPECIAL_TYPE_OPTIONS },
  { key: "amount", label: "Value", type: "number", hint: "Weeks, months, dollars or percent — per the type." },
  { key: "startsOn", label: "Starts", type: "date" },
  { key: "endsOn", label: "Expires", type: "date" },
  { key: "status", label: "Status", type: "select", options: [{ value: "Active", label: "Active" }, { value: "Inactive", label: "Inactive" }] },
  { key: "minTermMonths", label: "Minimum term (months)", type: "number" },
  { key: "conditions", label: "Conditions", type: "textarea", placeholder: "Move in by…, approved applicants only…" },
];

const specialsAdapter = recordItemsAdapter("special");

const PRICING_FIELDS = [
  { key: "rent", label: "Asking rent (monthly)", type: "currency" },
  { key: "deposit", label: "Security deposit", type: "currency" },
  { key: "applicationFee", label: "Application fee", type: "currency", meta: true },
  { key: "adminFee", label: "Admin / move-in fee", type: "currency", meta: true },
  { key: "holdingDeposit", label: "Holding deposit", type: "currency", meta: true },
  { key: "rentNegotiable", label: "Rent negotiable", type: "switch", meta: true },
  { key: "pricingTermMonths", label: "Effective rent term (months)", type: "number", meta: true, hint: "Term used to spread concessions." },
  { key: "pricingNotes", label: "Pricing notes", type: "textarea", meta: true },
];

export function ListingPricingSection({ item, config, onPatch, onCommit, onCommitMeta }) {
  const [specials, setSpecials] = useState(null);
  const loaded = useLoad(() => listRecordItems(config.key, item.id, "special"), [item.id]);
  const rows = specials ?? loaded ?? [];
  const term = Number(item.metadata?.pricingTermMonths) || 12;
  const eff = effectiveRent(item.rent, rows, term);
  const active = rows.filter((s) => s.status !== "Inactive" && !(s.endsOn && isPast(s.endsOn)));
  return (
    <div className="space-y-5">
      <FieldsForm item={item} fields={PRICING_FIELDS} onPatch={onPatch} onCommit={onCommit} onCommitMeta={onCommitMeta} />
      <KeyValues
        columns={3}
        items={[
          { label: "Asking rent", value: item.rent ? `${currency(item.rent)}/mo` : "—" },
          { label: `Effective rent (${term} mo)`, value: item.rent ? `${currency(eff)}/mo` : "—" },
          { label: "Active specials", value: String(active.length) },
        ]}
      />
      <SectionCard title="Specials & concessions" description="Move-in specials with an expiry. Expired specials stop counting toward effective rent.">
        <ChildRecords
          item={item}
          config={config}
          adapter={specialsAdapter}
          fields={SPECIAL_FIELDS}
          singular="Special"
          plural="Specials"
          icon={Tag}
          defaults={() => ({ status: "Active", specialType: "Weeks free" })}
          onChange={setSpecials}
          summary={(s) => {
            const expired = s.endsOn && isPast(s.endsOn);
            return {
              title: s.name,
              meta: [s.specialType || s.metadata?.specialType, s.endsOn ? `Expires ${formatDate(s.endsOn)}` : "No expiry"].filter(Boolean).join(" · "),
              badge: expired ? "Expired" : s.status || "Active",
              badgeVariant: expired || s.status === "Inactive" ? "outline" : "success",
            };
          }}
        />
      </SectionCard>
    </div>
  );
}

export function SyndicationSection({ item, onCommit, onCommitMeta }) {
  const state = channelState(item);
  const write = (key, patch) => {
    const next = { ...state, [key]: { ...state[key], ...patch } };
    const any = Object.values(next).some((c) => c.enabled);
    onCommitMeta({ syndication: next });
    if (any !== Boolean(item.syndicated)) onCommit({ syndicated: any });
  };
  const toggle = (key, on) => {
    const live = item.status === "Active";
    write(key, on
      ? { enabled: true, status: live ? "Published" : "Queued", lastPublishedAt: live ? new Date().toISOString() : state[key].lastPublishedAt }
      : { enabled: false, status: "Off" });
    toast.success(on ? (live ? "Marked published." : "Queued — publishes when the listing goes live.") : "Channel turned off.");
  };
  const published = Object.values(state).filter((c) => c.status === "Published").length;

  return (
    <div className="space-y-4">
      <ProviderNotice what="Listing syndication">
        Publish state is tracked here per channel — nothing is sent to Zillow, Apartments.com or any
        other site. Post the listing yourself, then record its status and link.
      </ProviderNotice>
      <KeyValues
        columns={3}
        items={[
          { label: "Listing status", value: <StatusPill status={item.status} map={LISTING_STATUS_MAP} /> },
          { label: "Channels on", value: String(Object.values(state).filter((c) => c.enabled).length) },
          { label: "Published", value: String(published) },
        ]}
      />
      {["Long-term", "Mid-term"].map((kind) => (
        <SectionCard key={kind} title={kind === "Long-term" ? "Listing sites" : "Mid-term & furnished channels"}>
          <div className="divide-y divide-border">
            {SYNDICATION_CHANNELS.filter((c) => c.kind === kind).map((c) => {
              const s = state[c.key];
              return (
                <div key={c.key} className="grid gap-3 py-3.5 first:pt-0 last:pb-0 md:grid-cols-[1fr_170px_1fr_auto] md:items-center">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{c.label}</p>
                    <p className="text-xs text-text-secondary">
                      {s.lastPublishedAt ? `Last published ${formatDateTime(s.lastPublishedAt)}` : "Never published"}
                    </p>
                  </div>
                  <Select value={s.status} onValueChange={(v) => write(c.key, { status: v, enabled: v !== "Off", ...(v === "Published" ? { lastPublishedAt: new Date().toISOString() } : {}) })}>
                    <SelectTrigger className="bg-surface-card" aria-label={`${c.label} status`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {selectOptions(CHANNEL_STATUS_MAP).map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    defaultValue={s.url}
                    key={`${c.key}-${s.url}`}
                    placeholder="Posted listing URL (optional)"
                    onBlur={(e) => e.target.value !== s.url && write(c.key, { url: e.target.value })}
                  />
                  <Switch checked={s.enabled} onCheckedChange={(on) => toggle(c.key, on)} aria-label={`Syndicate to ${c.label}`} />
                </div>
              );
            })}
          </div>
        </SectionCard>
      ))}
    </div>
  );
}

// Prospects for this listing by source, with conversion per source.
export function LeadSourcesSection({ item, onPatch, onCommit, onCommitMeta }) {
  const prospects = useLoad(() => listProspectsForListing(item.id), [item.id]);
  const rows = useMemo(() => {
    const groups = new Map();
    for (const p of prospects || []) {
      const k = p.source || "Unknown";
      const g = groups.get(k) || { id: k, source: k, leads: 0, toured: 0, applied: 0, won: 0 };
      g.leads += 1;
      if (["Toured", "Applied", "Converted", "Leased"].includes(p.status)) g.toured += 1;
      if (["Applied", "Converted", "Leased"].includes(p.status)) g.applied += 1;
      if (["Converted", "Leased"].includes(p.status)) g.won += 1;
      groups.set(k, g);
    }
    return [...groups.values()].sort((a, b) => b.leads - a.leads);
  }, [prospects]);

  return (
    <div className="space-y-5">
      <SectionCard title="Tracking" description="Per-listing contact points you give each channel so leads can be attributed.">
        <FieldsForm
          item={item}
          onPatch={onPatch}
          onCommit={onCommit}
          onCommitMeta={onCommitMeta}
          fields={[
            { key: "trackingEmail", label: "Lead email alias", type: "email", meta: true, placeholder: "unit4b@leasing.example.com" },
            { key: "trackingPhone", label: "Tracking phone", type: "phone", meta: true },
            { key: "campaign", label: "Campaign", type: "text", meta: true, placeholder: "e.g. Spring lease-up" },
            { key: "marketingBudget", label: "Monthly ad spend", type: "currency", meta: true },
          ]}
        />
      </SectionCard>
      {prospects === undefined ? (
        <ListLoading label="Loading lead sources" className="py-10" />
      ) : (
        <DataTable
          columns={[
            { key: "source", header: "Source", render: (r) => <Badge variant="neutral">{r.source}</Badge> },
            { key: "leads", header: "Leads", align: "right", className: "text-right tabular-nums" },
            { key: "toured", header: "Toured", align: "right", className: "text-right tabular-nums" },
            { key: "applied", header: "Applied", align: "right", className: "text-right tabular-nums" },
            { key: "won", header: "Leased", align: "right", className: "text-right tabular-nums" },
            { key: "rate", header: "Conversion", align: "right", className: "text-right tabular-nums text-text-secondary", render: (r) => pct(r.won, r.leads) },
          ]}
          data={rows}
          getRowKey={(r) => r.id}
          empty={
            <SectionCard>
              <p className="text-sm text-text-secondary">
                No prospects are linked to this listing yet. Set the listing on a prospect to attribute it.
              </p>
            </SectionCard>
          }
        />
      )}
    </div>
  );
}

export function ListingOverviewSection({ item, config }) {
  const funnel = useLoad(async () => {
    const [p, s, a, specials] = await Promise.all([
      listProspectsForListing(item.id),
      listShowingsForListing(item.id),
      listApplicationsForListing(item.id),
      listRecordItems(config.key, item.id, "special"),
    ]);
    return {
      leads: (p ?? []).length,
      showings: (s ?? []).filter((x) => x.status === "Completed").length,
      apps: (a ?? []).length,
      approved: (a ?? []).filter((x) => APP_APPROVED.includes(x.status)).length,
      specials: specials ?? [],
    };
  }, [item.id]);
  const channels = channelState(item);
  const published = SYNDICATION_CHANNELS.filter((c) => channels[c.key].status === "Published");
  const meta = item.metadata || {};
  const daysOnMarket = daysSince(meta.publishedAt);

  return (
    <div className="space-y-5">
      <KeyValues
        items={[
          { label: "Unit", value: item.unit || "—" },
          { label: "Property", value: item.propertyName || "—" },
          { label: "Asking rent", value: item.rent ? `${currency(item.rent)}/mo` : "—" },
          {
            label: "Effective rent",
            value: item.rent && funnel ? `${currency(effectiveRent(item.rent, funnel.specials, Number(meta.pricingTermMonths) || 12))}/mo` : "—",
          },
          { label: "Deposit", value: item.deposit ? currency(item.deposit) : "—" },
          { label: "Available", value: formatDate(item.availableDate) },
          { label: "Layout", value: `${Number(item.bedrooms) || 0} bd · ${Number(item.bathrooms) || 0} ba${item.sqft ? ` · ${item.sqft} sqft` : ""}` },
          { label: "Days on market", value: daysOnMarket === null ? "Not published" : `${daysOnMarket} days` },
          { label: "Furnished / mid-term", value: [meta.furnished ? "Furnished" : null, meta.midTerm ? `Mid-term (min ${meta.minStayDays || 30} days)` : null].filter(Boolean).join(" · ") || "No" },
          { label: "Lease terms", value: Array.isArray(meta.leaseTerms) && meta.leaseTerms.length ? meta.leaseTerms.join(", ") : "—" },
        ]}
      />
      <SectionCard title="Funnel" description="Leads, tours and applications attributed to this listing.">
        {funnel ? (
          <FunnelStrip
            steps={[
              { label: "Leads", value: funnel.leads },
              { label: "Tours completed", value: funnel.showings },
              { label: "Applications", value: funnel.apps },
              { label: "Approved", value: funnel.approved },
            ]}
          />
        ) : (
          <ListLoading label="Loading funnel" className="py-8" />
        )}
      </SectionCard>
      <SectionCard title="Syndication" description="Internal publish tracking — no listing provider is connected.">
        {published.length ? (
          <div className="flex flex-wrap gap-1.5">
            {published.map((c) => (
              <Badge key={c.key} variant="success">
                {c.label}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="flex items-center gap-2 text-sm text-text-secondary">
            <Megaphone className="h-4 w-4" /> Not published on any channel yet.
          </p>
        )}
      </SectionCard>
    </div>
  );
}
