"use client";

import React from "react";
import {
  Building2,
  Users,
  Wrench,
  Wallet,
  ArrowUpRight,
  ClipboardList,
  FileText,
  CircleDollarSign,
} from "lucide-react";

import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ScreenHeader, StatsBar, SectionCard } from "@/components/internal/shared/screen_kit";

// Landing overview for the Geiger Property workspace. A welcoming dashboard that
// frames the portfolio and points into the feature areas scaffolded in the
// sidebar. Real KPIs come online as the data layer for each area is built out
// (see docs/competitive-feature-matrix.md); until then this shows the shape of
// the product, not seeded row data.

const PORTFOLIO_STATS = [
  { label: "Properties", value: "—", footer: "Add your first property" },
  { label: "Units", value: "—", footer: "Across all buildings" },
  { label: "Occupancy", value: "—", footer: "Occupied vs. available" },
  { label: "Rent collected", value: "—", footer: "This month" },
];

const QUICK_AREAS = [
  {
    title: "Properties & Units",
    description: "Buildings, units, and unit-level details.",
    icon: Building2,
  },
  {
    title: "Leasing",
    description: "Listings, applications, screening, and lease signing.",
    icon: FileText,
  },
  {
    title: "Tenants",
    description: "Tenant profiles, communication, and the resident portal.",
    icon: Users,
  },
  {
    title: "Maintenance",
    description: "Work orders, vendors, and preventive schedules.",
    icon: Wrench,
  },
  {
    title: "Accounting",
    description: "Rent collection, ledgers, payments, and owner payouts.",
    icon: Wallet,
  },
  {
    title: "Reports",
    description: "Financials, occupancy, delinquency, and owner statements.",
    icon: ClipboardList,
  },
];

export function PropertyOverviewScreen() {
  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Overview"
        description="Your portfolio at a glance — occupancy, rent, and everything that needs attention today."
      />

      <StatsBar stats={PORTFOLIO_STATS} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SectionCard
          title="Get started"
          description="Geiger Property is scaffolded across every area a modern property manager needs. Jump into an area from the sidebar."
          className="lg:col-span-2"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {QUICK_AREAS.map((area) => (
              <div
                key={area.title}
                className="flex items-start gap-3 rounded-lg border border-border bg-surface-card p-4 transition-colors hover:bg-surface-hover"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-subtle text-muted-foreground">
                  <area.icon className="h-4.5 w-4.5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    {area.title}
                  </p>
                  <p className="mt-0.5 text-xs text-text-secondary">
                    {area.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Today" description="Nothing needs your attention yet.">
          <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface-subtle text-muted-foreground">
              <CircleDollarSign className="h-5 w-5" />
            </div>
            <p className="max-w-[15rem] text-sm text-text-secondary">
              Rent due, expiring leases, and open work orders will surface here
              once your portfolio is set up.
            </p>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-subtle px-3 py-1 text-xs font-medium text-muted-foreground">
              <ArrowUpRight className="h-3.5 w-3.5" />
              Add a property to begin
            </span>
          </div>
        </SectionCard>
      </div>
    </MainScreenWrapper>
  );
}

export default PropertyOverviewScreen;
