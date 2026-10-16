"use client";

import React, { useMemo, useState } from "react";
import { FileText, Home } from "lucide-react";

import { ScreenHeader, SearchInput, StatusPill } from "@/components/internal/shared/screen_kit";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { DataGate, DocumentRows, Notice, Panel, PortalEmpty, Stat, fmtDate, money, usePortalData } from "../portal_kit";

const LEASE_STATUS_MAP = {
  Active: { label: "Active", variant: "success", dotClass: "bg-emerald-400" },
  Pending: { label: "Pending", variant: "info", dotClass: "bg-sky-400" },
  "Expiring soon": { label: "Expiring soon", variant: "warning", dotClass: "bg-amber-400" },
  "Month-to-month": { label: "Month-to-month", variant: "purple", dotClass: "bg-violet-300" },
  "Notice given": { label: "Notice given", variant: "warning", dotClass: "bg-orange-400" },
  Renewed: { label: "Renewed", variant: "outline", dotClass: "bg-teal-400" },
  Ended: { label: "Ended", variant: "outline", dotClass: "bg-zinc-600" },
};

export function ResidentLease() {
  const state = usePortalData("/api/portal/resident/documents");
  const [search, setSearch] = useState("");
  const docs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (state.data?.documents || []).filter((d) => !q || `${d.name} ${d.kind} ${d.source}`.toLowerCase().includes(q));
  }, [state.data, search]);

  return (
    <MainScreenWrapper>
      <ScreenHeader title="Lease & documents" description="Your lease terms and the documents your property manager has shared." />
      <DataGate state={state}>
        {(data) => {
          const { lease, leases, property, unit } = data.home;
          return (
            <>
              {lease ? (
                <Panel title={lease.name} description={[property?.name, unit?.label ? `Unit ${unit.label}` : null].filter(Boolean).join(" · ")} action={<StatusPill status={lease.status} map={LEASE_STATUS_MAP} />}>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <Stat label="Monthly rent">{money(lease.rent)}</Stat>
                    <Stat label="Security deposit">{money(lease.deposit)}</Stat>
                    <Stat label="Starts">{fmtDate(lease.termStart)}</Stat>
                    <Stat label="Ends">{fmtDate(lease.termEnd)}</Stat>
                  </div>
                  {property?.address ? <p className="mt-4 text-sm text-text-secondary">{property.address}</p> : null}
                  {unit && (unit.bedrooms || unit.bathrooms || unit.sqft) ? (
                    <p className="mt-1 text-xs text-text-tertiary">
                      {[unit.bedrooms ? `${unit.bedrooms} bd` : null, unit.bathrooms ? `${unit.bathrooms} ba` : null, unit.sqft ? `${unit.sqft} sq ft` : null].filter(Boolean).join(" · ")}
                    </p>
                  ) : null}
                </Panel>
              ) : (
                <PortalEmpty icon={Home} title="No lease on file" description="Your lease will show here once your property manager links it to your account." />
              )}

              {leases.length > 1 ? (
                <Panel title="Lease history" flush>
                  <div className="divide-y divide-border">
                    {leases.map((l) => (
                      <div key={l.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">{l.name}</p>
                          <p className="mt-0.5 text-xs text-text-tertiary">
                            {fmtDate(l.termStart)} – {fmtDate(l.termEnd)} · {money(l.rent)}/mo
                          </p>
                        </div>
                        <StatusPill status={l.status} map={LEASE_STATUS_MAP} />
                      </div>
                    ))}
                  </div>
                </Panel>
              ) : null}

              {data.documentsDisabled ? (
                <Notice>Documents aren&apos;t shared in the portal for your account. Ask the office for copies.</Notice>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <h2 className="text-sm font-semibold text-foreground">Documents</h2>
                    <SearchInput value={search} onChange={setSearch} placeholder="Search documents…" className="w-full sm:w-64" />
                  </div>
                  {!data.documents.length ? (
                    <PortalEmpty icon={FileText} title="No documents yet" description="Signed leases, notices and other files will appear here." />
                  ) : !docs.length ? (
                    <PortalEmpty icon={FileText} title="No documents match" description="Try a different search." />
                  ) : (
                    <Panel flush>
                      <DocumentRows documents={docs} />
                    </Panel>
                  )}
                </div>
              )}
            </>
          );
        }}
      </DataGate>
    </MainScreenWrapper>
  );
}

export default ResidentLease;
