"use client";

import { useMemo, useState } from "react";
import { FileSpreadsheet } from "lucide-react";

import { StatusPill, SearchInput } from "@/components/internal/shared/screen_kit";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { listUnits } from "@/lib/supabase/units";
import { listProperties } from "@/lib/supabase/properties";
import { listTenants } from "@/lib/supabase/tenants";
import { leasesLayer } from "@/lib/supabase/leases";
import { rentAccountsLayer } from "@/lib/supabase/rent_collection";
import {
  ReportScreen,
  ReportTable,
  ReportEmpty,
  PropertyFilter,
  matchesProperty,
  useReportData,
  exportCsv,
} from "./report_kit";
import {
  UNIT_STATUS_MAP,
  UNIT_FILTER_OPTIONS,
  OCCUPIED_STATUSES,
  ACTIVE_LEASE_STATUSES,
  currency,
  formatDate,
  balanceOf,
  percent,
  byId,
  norm,
} from "./shared";

// Rent Roll — one row per unit joined to its active lease, tenant and rent balance.

const LOADERS = {
  units: listUnits,
  properties: listProperties,
  leases: () => leasesLayer.list(),
  tenants: listTenants,
  accounts: () => rentAccountsLayer.list(),
};

// Prefer an Active lease on the unit, then any other current one.
function activeLeaseFor(unitId, leases) {
  const onUnit = leases.filter(
    (l) => l.unitId === unitId && ACTIVE_LEASE_STATUSES.includes(l.status),
  );
  return onUnit.find((l) => l.status === "Active") || onUnit[0] || null;
}

function buildRentRoll({ units, properties, leases, tenants, accounts }) {
  const props = byId(properties);
  const tenantsById = byId(tenants);
  return units.map((u) => {
    const lease = activeLeaseFor(u.id, leases);
    const tenantId = lease?.tenantId || u.tenantId || null;
    const tenant = tenantsById.get(tenantId);
    const tenantName =
      lease?.tenantName || tenant?.name || u.occupantName || "";
    const accts = accounts.filter(
      (a) =>
        a.unitId === u.id ||
        (tenantId && a.tenantId === tenantId) ||
        (!a.unitId && !a.tenantId && tenantName && norm(a.tenantName) === norm(tenantName)),
    );
    return {
      id: u.id,
      propertyId: u.propertyId,
      property: props.get(u.propertyId)?.name || "Unassigned",
      unit: u.label || "Unnamed unit",
      status: u.status,
      tenant: tenantName,
      leaseStart: lease?.termStart || u.leaseStart || null,
      leaseEnd: lease?.termEnd || u.leaseEnd || null,
      marketRent: Number(u.rent) || 0,
      leaseRent: lease ? Number(lease.rent) || 0 : null,
      balance: accts.reduce((s, a) => s + balanceOf(a), 0),
      occupied: OCCUPIED_STATUSES.includes(u.status) || Boolean(lease),
    };
  });
}

const CSV_COLUMNS = [
  { header: "Property", key: "property" },
  { header: "Unit", key: "unit" },
  { header: "Status", key: "status" },
  { header: "Tenant", key: "tenant" },
  { header: "Lease start", key: "leaseStart" },
  { header: "Lease end", key: "leaseEnd" },
  { header: "Market rent", key: "marketRent" },
  { header: "Lease rent", value: (r) => r.leaseRent ?? "" },
  { header: "Balance", key: "balance" },
];

const COLUMNS = [
  {
    key: "unit",
    header: "Unit",
    render: (r) => (
      <div className="flex flex-col gap-0.5">
        <span className="font-medium text-foreground">{r.unit}</span>
        <span className="text-xs text-text-secondary">{r.property}</span>
      </div>
    ),
  },
  {
    key: "status",
    header: "Status",
    render: (r) => <StatusPill status={r.status} map={UNIT_STATUS_MAP} />,
  },
  {
    key: "tenant",
    header: "Tenant",
    className: "text-text-secondary",
    render: (r) => r.tenant || "—",
  },
  {
    key: "term",
    header: "Lease term",
    className: "whitespace-nowrap text-text-secondary tabular-nums",
    render: (r) =>
      r.leaseStart || r.leaseEnd
        ? `${formatDate(r.leaseStart)} – ${formatDate(r.leaseEnd)}`
        : "—",
  },
  {
    key: "marketRent",
    header: "Market rent",
    align: "right",
    className: "text-right tabular-nums text-text-secondary",
    render: (r) => currency(r.marketRent),
  },
  {
    key: "leaseRent",
    header: "Lease rent",
    align: "right",
    className: "text-right tabular-nums text-foreground",
    render: (r) => (r.leaseRent === null ? "—" : currency(r.leaseRent)),
  },
  {
    key: "balance",
    header: "Balance",
    align: "right",
    className: "text-right font-semibold tabular-nums",
    render: (r) => (
      <span className={r.balance > 0 ? "text-red-600 dark:text-red-400" : "text-text-secondary"}>
        {currency(r.balance)}
      </span>
    ),
  },
];

export function RentRollScreen() {
  const { loading, data } = useReportData(LOADERS);
  const [property, setProperty] = useState("all");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");

  const all = useMemo(
    () => (loading ? [] : buildRentRoll(data)),
    [loading, data],
  );

  const scoped = useMemo(
    () => all.filter((r) => matchesProperty(property, r.propertyId)),
    [all, property],
  );

  const rows = useMemo(() => {
    const q = norm(search);
    return scoped
      .filter((r) => status === "all" || r.status === status)
      .filter(
        (r) =>
          !q ||
          [r.unit, r.property, r.tenant].some((v) => norm(v).includes(q)),
      )
      .sort((a, b) => a.property.localeCompare(b.property) || a.unit.localeCompare(b.unit, undefined, { numeric: true }));
  }, [scoped, status, search]);

  const stats = useMemo(() => {
    const occupied = scoped.filter((r) => r.occupied);
    const scheduled = occupied.reduce((s, r) => s + (r.leaseRent ?? r.marketRent), 0);
    const owed = scoped.reduce((s, r) => s + Math.max(0, r.balance), 0);
    return [
      { label: "Units", value: String(scoped.length), footer: `${occupied.length} occupied` },
      { label: "Occupied", value: percent(occupied.length, scoped.length), footer: "Occupied or on notice" },
      { label: "Scheduled rent", value: currency(scheduled), footer: "Monthly, occupied units" },
      { label: "Total balance", value: currency(owed), footer: `${scoped.filter((r) => r.balance > 0).length} units owing` },
    ];
  }, [scoped]);

  const hasUnits = all.length > 0;

  return (
    <ReportScreen
      title="Rent Roll"
      description="Every unit with its current lease, tenant, rent, and outstanding balance."
      loading={loading}
      stats={loading || hasUnits ? stats : null}
      onExport={hasUnits ? () => exportCsv("Rent roll", CSV_COLUMNS, rows) : null}
      filters={
        hasUnits ? (
          <>
            <PropertyFilter properties={data.properties} value={property} onChange={setProperty} />
            <FilterDropdown value={status} onValueChange={setStatus} options={UNIT_FILTER_OPTIONS} height="h-9" />
          </>
        ) : null
      }
      toolbarRight={
        hasUnits ? (
          <SearchInput value={search} onChange={setSearch} placeholder="Search units or tenants…" className="sm:w-72" />
        ) : null
      }
    >
      {hasUnits ? (
        <ReportTable
          title="Units"
          description={`${rows.length} of ${scoped.length} units · balances are derived from rent account charges and payments`}
          columns={COLUMNS}
          rows={rows}
          emptyIcon={FileSpreadsheet}
          emptyTitle="No units match these filters"
          emptyDescription="Try another property, status, or search."
        />
      ) : (
        <ReportEmpty
          icon={FileSpreadsheet}
          title="No units yet"
          description="Add units under Property → Units and the rent roll fills in automatically."
        />
      )}
    </ReportScreen>
  );
}

export default RentRollScreen;
