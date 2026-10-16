"use client";

import { FileSignature, Gavel, UserPlus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/internal/shared/screen_kit";
import { makeRelatedSection } from "@/components/internal/screens/entity/sections/related_section";
import { makeWorkOrdersSection } from "@/components/internal/screens/people/related";
import { LEASE_STATUS_MAP, NOTICE_STATUS_MAP } from "@/components/internal/screens/leasing/shared";
import { leasesLayer } from "@/lib/supabase/leases";
import { listTenantLeaseParties } from "@/lib/supabase/lease_parties";
import { noticesLayer } from "@/lib/supabase/notices";
import { currency, formatDate } from "../shared";

const ROLE_VARIANT = { tenant: "info", cosigner: "purple", guarantor: "purple", occupant: "neutral" };

// Leases this tenant is on — as the lease's primary tenant or as a lease party.
async function loadTenantLeases(item) {
  const [parties, leases] = await Promise.all([listTenantLeaseParties(item.id), leasesLayer.list()]);
  const partyByLease = new Map((parties ?? []).map((p) => [p.leaseId, p]));
  return (leases ?? [])
    .filter((l) => l.tenantId === item.id || partyByLease.has(l.id) || l.id === item.leaseId)
    .map((l) => {
      const p = partyByLease.get(l.id);
      return {
        ...l,
        role: p?.role || "tenant",
        share: p ? Number(p.responsibilityPct) || 0 : null,
        isPrimary: p ? p.isPrimary : l.tenantId === item.id,
      };
    });
}

const LeasesTable = makeRelatedSection({
  load: loadTenantLeases,
  tab: "Leases",
  plural: "Leases",
  icon: FileSignature,
  emptyDescription: "Use “Add to lease” to put this tenant on a lease as a tenant, co-signer, guarantor, or occupant.",
  columns: [
    {
      key: "name",
      header: "Lease",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{r.name || "Lease"}</span>
          <span className="text-xs text-text-secondary">{r.unit || "No unit linked"}</span>
        </div>
      ),
    },
    {
      key: "role",
      header: "Role",
      render: (r) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={ROLE_VARIANT[r.role] || "neutral"} className="capitalize">
            {r.role}
          </Badge>
          {r.isPrimary ? <Badge variant="outline">Primary</Badge> : null}
          {r.share ? <span className="text-xs text-text-secondary">{r.share}%</span> : null}
        </div>
      ),
    },
    {
      key: "term",
      header: "Term",
      render: (r) => (
        <span className="text-sm text-muted-foreground">
          {r.termStart || r.termEnd ? `${formatDate(r.termStart)} – ${formatDate(r.termEnd)}` : "—"}
        </span>
      ),
    },
    { key: "status", header: "Status", render: (r) => <StatusPill status={r.status} map={LEASE_STATUS_MAP} /> },
    {
      key: "rent",
      header: "Rent",
      align: "right",
      className: "text-right font-semibold tabular-nums text-foreground",
      render: (r) => currency(r.rent),
    },
  ],
});

// Leases + an "Add to lease" shortcut; remounts after the wizard links a lease.
export function TenantLeasesSection(props) {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => props.runAction("addToLease")}>
          <UserPlus className="h-4 w-4" /> Add to lease
        </Button>
      </div>
      <LeasesTable key={props.item.metadata?.lastLeaseLinkAt || "leases"} {...props} />
    </div>
  );
}

export const TenantViolationsSection = makeRelatedSection({
  load: async (item) => {
    const rows = (await noticesLayer.list()) ?? [];
    return rows.filter((n) => n.tenantId === item.id || (!n.tenantId && item.name && n.tenantName === item.name));
  },
  tab: "Notices & Violations",
  plural: "Notices",
  icon: Gavel,
  emptyDescription: "Notices and lease violations served to this tenant show up here.",
  columns: [
    {
      key: "name",
      header: "Notice",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{r.name || "Notice"}</span>
          <span className="text-xs text-text-secondary">{[r.noticeType, r.deliveryMethod].filter(Boolean).join(" · ") || "—"}</span>
        </div>
      ),
    },
    { key: "servedDate", header: "Served", render: (r) => <span className="text-sm text-muted-foreground">{formatDate(r.servedDate)}</span> },
    { key: "cureBy", header: "Cure by", render: (r) => <span className="text-sm text-muted-foreground">{formatDate(r.cureBy)}</span> },
    { key: "status", header: "Status", render: (r) => <StatusPill status={r.status} map={NOTICE_STATUS_MAP} /> },
  ],
  footer: (rows) => (
    <p className="text-sm text-text-secondary">
      {rows.length} notice{rows.length === 1 ? "" : "s"} · {rows.filter((r) => /violation/i.test(r.noticeType || "")).length} violations
    </p>
  ),
});

export const TenantWorkOrdersSection = makeWorkOrdersSection({
  idKey: "tenantId",
  nameKey: "tenantName",
  emptyDescription: "Maintenance requests and work orders for this tenant show up here.",
});
