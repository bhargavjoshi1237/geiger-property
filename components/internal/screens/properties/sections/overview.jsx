"use client";

import { useEffect, useState } from "react";

import { ListLoading, SectionCard, StatsBar } from "@/components/internal/shared/screen_kit";
import { listBuildings } from "@/lib/supabase/buildings";
import { listOwnersOfProperty } from "@/lib/supabase/property_owners";
import { listRecordItems } from "@/lib/supabase/record_items";
import { currency, daysUntil, formatDate, pct } from "../constants";
import { loadScopeData, scopeKpis } from "../joins";
import { complianceState } from "../record_kinds";
import { AttentionCard, FactsCard, UnitMixCard } from "./overview_parts";
import { useRefreshKey } from "./refresh";

// Property overview: live KPIs from units / leases / work orders, a follow-up
// list (ownership, insurance, compliance, leases, agreement, banking) and facts.

const activeOwnership = (rows) =>
  rows.filter((r) => {
    const s = daysUntil(r.startsOn);
    const e = daysUntil(r.endsOn);
    return (s === null || s <= 0) && (e === null || e >= 0);
  });

function attentionItems(item, d) {
  const out = [];
  const { kpis } = d.scope;
  const active = activeOwnership(d.owners);
  const total = active.reduce((s, r) => s + (Number(r.ownershipPct) || 0), 0);
  if (!d.owners.length) {
    out.push({ key: "owners", label: "No owners assigned", detail: "Assign an owner so statements and distributions work.", tone: "warning", section: "owners" });
  } else if (Math.round(total) !== 100) {
    out.push({ key: "owners", label: `Ownership totals ${Math.round(total)}%`, detail: "Active ownership should add up to 100%.", tone: "danger", section: "owners" });
  }
  const policies = d.items.filter((r) => r.kind === "insurance_policy");
  const expired = policies.filter((p) => daysUntil(p.endsOn) !== null && daysUntil(p.endsOn) < 0);
  const expiring = policies.filter((p) => {
    const n = daysUntil(p.endsOn);
    return n !== null && n >= 0 && n <= 60;
  });
  if (!policies.length) out.push({ key: "ins-none", label: "No insurance on file", tone: "warning", section: "insurance" });
  if (expired.length) out.push({ key: "ins-exp", label: `${expired.length} insurance polic${expired.length === 1 ? "y" : "ies"} expired`, detail: expired.map((p) => p.name).join(", "), tone: "danger", section: "insurance" });
  if (expiring.length) out.push({ key: "ins-soon", label: `${expiring.length} polic${expiring.length === 1 ? "y" : "ies"} expiring within 60 days`, detail: expiring.map((p) => `${p.name} · ${formatDate(p.endsOn)}`).join(", "), tone: "warning", section: "insurance" });
  const compliance = d.items.filter((r) => r.kind === "compliance_item").map((r) => ({ ...r, state: complianceState(r) }));
  const overdue = compliance.filter((c) => ["Overdue", "Expired", "Failed"].includes(c.state));
  const dueSoon = compliance.filter((c) => c.state === "Due soon");
  if (overdue.length) out.push({ key: "comp-over", label: `${overdue.length} compliance item${overdue.length === 1 ? "" : "s"} overdue`, detail: overdue.map((c) => c.name).join(", "), tone: "danger", section: "compliance" });
  if (dueSoon.length) out.push({ key: "comp-soon", label: `${dueSoon.length} compliance item${dueSoon.length === 1 ? "" : "s"} due within 30 days`, tone: "warning", section: "compliance" });
  if (kpis.expiringLeases) out.push({ key: "leases", label: `${kpis.expiringLeases} lease${kpis.expiringLeases === 1 ? "" : "s"} ending within 60 days`, tone: "warning", section: "leases" });
  if (kpis.vacant) out.push({ key: "vacant", label: `${kpis.vacant} vacant unit${kpis.vacant === 1 ? "" : "s"}`, detail: `${currency(kpis.vacancyLoss)}/mo in potential rent`, tone: "warning", section: "units" });
  if (kpis.urgentWork) out.push({ key: "work", label: `${kpis.urgentWork} high-priority work order${kpis.urgentWork === 1 ? "" : "s"} open`, tone: "danger", section: "workorders" });
  const mgmt = item.metadata?.management || {};
  const agreementDays = daysUntil(mgmt.agreementEnd);
  if (agreementDays !== null && agreementDays <= 60 && !mgmt.autoRenew) {
    out.push({ key: "mgmt", label: agreementDays < 0 ? "Management agreement has ended" : `Management agreement ends in ${agreementDays} days`, tone: agreementDays < 0 ? "danger" : "warning", section: "management" });
  }
  const banking = item.metadata?.banking || {};
  if (!banking.operatingAccountId) out.push({ key: "bank", label: "No operating bank account linked", tone: "warning", section: "banking" });
  return out;
}

export function PropertyOverviewSection({ item, config, onNavigate }) {
  const [d, setD] = useState(null);
  const unitsKey = useRefreshKey("units", item.id);
  const ownersKey = useRefreshKey("owners", item.id);

  useEffect(() => {
    let alive = true;
    Promise.all([
      loadScopeData(),
      listOwnersOfProperty(item.id),
      listRecordItems(config.key, item.id),
      listBuildings(),
    ]).then(([all, owners, items, buildings]) => {
      if (!alive) return;
      setD({
        scope: scopeKpis(all, { propertyIds: [item.id] }),
        owners: owners || [],
        items: items || [],
        buildings: (buildings || []).filter((b) => b.propertyId === item.id),
      });
    });
    return () => {
      alive = false;
    };
  }, [item.id, config.key, unitsKey, ownersKey]);

  if (!d) return <ListLoading label="Loading overview" className="py-10" />;

  const { kpis, units } = d.scope;
  const meta = item.metadata || {};
  const ownersActive = activeOwnership(d.owners);
  const allocated = ownersActive.reduce((s, r) => s + (Number(r.ownershipPct) || 0), 0);

  return (
    <div className="space-y-6">
      <StatsBar
        stats={[
          { label: "Units", value: String(kpis.unitCount), footer: `${d.buildings.length} building${d.buildings.length === 1 ? "" : "s"}` },
          { label: "Occupancy", value: pct(kpis.occupancy), footer: `${kpis.occupied} occupied · ${kpis.vacant} vacant` },
          { label: "Rent roll", value: currency(kpis.rentRoll), footer: "Monthly, active leases" },
          { label: "Active leases", value: String(kpis.activeLeases), footer: `${kpis.expiringLeases} ending in 60 days` },
        ]}
      />
      <StatsBar
        stats={[
          { label: "Open work orders", value: String(kpis.openWork), footer: `${kpis.urgentWork} high priority` },
          { label: "Avg rent", value: currency(kpis.avgRent), footer: "Per unit, asking" },
          { label: "Vacancy loss", value: currency(kpis.vacancyLoss), footer: "Monthly, vacant units" },
          { label: "Owners", value: String(ownersActive.length), footer: `${Math.round(allocated)}% allocated` },
        ]}
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <AttentionCard items={attentionItems(item, d)} onNavigate={onNavigate} />
        <FactsCard
          facts={[
            { label: "Type", value: [item.type, meta.propertyClass && `Class ${meta.propertyClass}`].filter(Boolean).join(" · ") },
            { label: "Address", value: [item.address, item.city, item.state, item.zip].filter(Boolean).join(", ") },
            { label: "Year built", value: item.yearBuilt ? String(item.yearBuilt) : "" },
            { label: "Total area", value: meta.totalSqft ? `${Number(meta.totalSqft).toLocaleString()} sqft` : "" },
            { label: "Parcel / APN", value: meta.parcelNumber },
            { label: "County", value: meta.county },
            { label: "Primary owner", value: d.owners.find((o) => o.isPrimary)?.ownerName || d.owners[0]?.ownerName },
            { label: "Operating account", value: meta.banking?.operatingAccountName },
          ]}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <UnitMixCard units={units} />
        {item.coverUrl ? (
          <SectionCard bodyPadding={false}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.coverUrl} alt={item.name || "Property"} className="h-full max-h-72 w-full object-cover" />
          </SectionCard>
        ) : item.description ? (
          <SectionCard title="Description">
            <p className="whitespace-pre-wrap text-sm text-text-secondary">{item.description}</p>
          </SectionCard>
        ) : null}
      </div>
    </div>
  );
}

export default PropertyOverviewSection;
