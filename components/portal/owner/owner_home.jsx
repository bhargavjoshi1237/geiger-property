"use client";
/* eslint-disable @next/next/no-img-element -- property covers are remote storage URLs */

import React, { useMemo, useState } from "react";
import { ArrowRight, BadgeCheck, Building2, Home } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SearchInput, StatsBar, StatusPill, Toolbar } from "@/components/internal/shared/screen_kit";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { SelectField } from "../form_bits";
import { DataGate, Notice, Panel, PortalEmpty, fmtDate, firstName, greeting, money, money0, usePortalData } from "../portal_kit";

const UNIT_STATUS_MAP = {
  Occupied: { label: "Occupied", variant: "success" },
  Vacant: { label: "Vacant", variant: "info" },
  Notice: { label: "Notice", variant: "warning" },
  "Make-ready": { label: "Make-ready", variant: "purple" },
  Down: { label: "Down", variant: "outline" },
};

function PropertyCard({ p }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface-subtle">
      <div className="flex h-28 items-center justify-center bg-gradient-to-br from-surface-strong to-surface-card">
        {p.coverUrl ? <img src={p.coverUrl} alt="" className="h-full w-full object-cover" loading="lazy" /> : <Building2 className="h-8 w-8 text-text-tertiary" />}
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{p.name}</p>
            <p className="mt-0.5 truncate text-xs text-text-tertiary">{p.address || p.type || "—"}</p>
          </div>
          {p.ownershipPct < 100 ? <span className="shrink-0 rounded-md border border-border bg-surface-card px-1.5 py-0.5 text-[11px] text-text-secondary">{p.ownershipPct}% yours</span> : null}
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-base font-semibold tabular-nums text-foreground">{p.occupancy}%</p>
            <p className="text-[10px] uppercase tracking-wide text-text-tertiary">Occupied</p>
          </div>
          <div>
            <p className="text-base font-semibold tabular-nums text-foreground">
              {p.occupied}/{p.units}
            </p>
            <p className="text-[10px] uppercase tracking-wide text-text-tertiary">Units</p>
          </div>
          <div>
            <p className="text-base font-semibold tabular-nums text-foreground">{money0(p.scheduledRent)}</p>
            <p className="text-[10px] uppercase tracking-wide text-text-tertiary">Rent / mo</p>
          </div>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-card">
          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${p.occupancy}%` }} />
        </div>
      </div>
    </div>
  );
}

export function OwnerHome({ member, onNavigate }) {
  const state = usePortalData("/api/portal/owner/overview");
  const [search, setSearch] = useState("");
  const [property, setProperty] = useState("all");
  const roll = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (state.data?.rentRoll || []).filter(
      (r) => (property === "all" || r.propertyId === property) && (!q || `${r.unit} ${r.resident} ${r.propertyName}`.toLowerCase().includes(q)),
    );
  }, [state.data, search, property]);

  return (
    <MainScreenWrapper>
      <DataGate state={state} size={72}>
        {(data) => {
          const props = data.properties;
          const units = props.reduce((s, p) => s + p.units, 0);
          const occupied = props.reduce((s, p) => s + p.occupied, 0);
          const rent = props.reduce((s, p) => s + p.scheduledRent, 0);
          const stats = [
            { label: "Properties", value: String(props.length), footer: `${units} units` },
            { label: "Occupancy", value: units ? `${Math.round((occupied / units) * 100)}%` : "0%", footer: `${occupied} of ${units} occupied` },
            { label: "Scheduled rent", value: money0(rent), footer: "Per month, current leases" },
            { label: "Needs your OK", value: String(data.pendingApprovals), footer: `${data.openWorkOrders} open work orders` },
          ];
          return (
            <>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
                  {greeting()}, {firstName(member.name)}
                </h1>
                <p className="mt-1 text-sm text-text-secondary">Here&apos;s how your portfolio is doing.</p>
                {member.brand?.welcome ? <p className="mt-2 max-w-2xl text-sm text-text-secondary">{member.brand.welcome}</p> : null}
              </div>

              {data.pendingApprovals && data.permissions.approve ? (
                <button
                  type="button"
                  onClick={() => onNavigate("maintenance")}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-left transition-colors hover:bg-amber-500/15"
                >
                  <span className="flex items-center gap-3">
                    <BadgeCheck className="h-5 w-5 text-amber-700 dark:text-amber-400" />
                    <span className="text-sm text-foreground">
                      {data.pendingApprovals} work order{data.pendingApprovals === 1 ? "" : "s"} waiting for your approval
                    </span>
                  </span>
                  <ArrowRight className="h-4 w-4 text-text-secondary" />
                </button>
              ) : null}

              <StatsBar stats={stats} />

              {!props.length ? (
                <PortalEmpty icon={Building2} title="No properties linked yet" description="Your property manager links properties to your owner record — they'll appear here." />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {props.map((p) => (
                    <PropertyCard key={p.id} p={p} />
                  ))}
                </div>
              )}

              {props.length ? (
                <div className="space-y-3">
                  <Toolbar>
                    <h2 className="text-sm font-semibold text-foreground">Rent roll</h2>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      {props.length > 1 ? (
                        <div className="sm:w-56">
                          <SelectField value={property} onChange={setProperty} options={[{ value: "all", label: "All properties" }, ...props.map((p) => ({ value: p.id, label: p.name }))]} />
                        </div>
                      ) : null}
                      <SearchInput value={search} onChange={setSearch} placeholder="Search units…" className="w-full sm:w-56" />
                    </div>
                  </Toolbar>
                  {!data.rentRoll.length ? (
                    <PortalEmpty icon={Home} title="No units yet" description="Units on your properties will be listed here." />
                  ) : !roll.length ? (
                    <PortalEmpty
                      icon={Home}
                      title="No units match"
                      description="Try another property or search."
                      action={<Button variant="outline" className="border-border bg-surface-card hover:bg-surface-hover" onClick={() => { setSearch(""); setProperty("all"); }}>Clear Filters</Button>}
                    />
                  ) : (
                    <Panel flush>
                      <div className="divide-y divide-border">
                        {roll.map((r) => (
                          <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-foreground">
                                {r.unit ? `Unit ${r.unit}` : "Unit"}
                                <span className="font-normal text-text-tertiary"> · {r.propertyName}</span>
                              </p>
                              <p className="mt-0.5 truncate text-xs text-text-tertiary">
                                {[r.resident || "No resident", r.leaseEnd ? `Lease ends ${fmtDate(r.leaseEnd)}` : null].filter(Boolean).join(" · ")}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-3">
                              <StatusPill status={r.status} map={UNIT_STATUS_MAP} />
                              <span className="hidden w-24 text-right text-sm tabular-nums text-foreground sm:inline">{money(r.rent)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </Panel>
                  )}
                </div>
              ) : null}

              {!data.permissions.statements ? <Notice>Statements aren&apos;t shared in the portal for your account.</Notice> : null}
            </>
          );
        }}
      </DataGate>
    </MainScreenWrapper>
  );
}

export default OwnerHome;
