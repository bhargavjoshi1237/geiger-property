"use client";

import { useEffect, useState } from "react";

import { LogoLoading } from "@geiger/ui";
import { SectionCard } from "@/components/internal/shared/screen_kit";
import { FactList } from "@/components/internal/shared/overview_kit";
import { FieldsForm } from "@/components/internal/screens/entity/fields_form";
import { BILLABLE_STATUSES } from "@/lib/billing/rent";
import { leaseAssistance, rentSplit } from "@/lib/housing/hap";
import { getLease, listLeasesForTenant } from "@/lib/supabase/leases";
import { currency } from "../shared";

// The tenant's live lease: the linked current lease, else their newest billable lease.
async function liveLeaseOf(tenantId, leaseId) {
  const linked = leaseId ? await getLease(leaseId) : null;
  if (linked) return linked;
  const leases = (await listLeasesForTenant(tenantId)) || [];
  return leases.filter((l) => BILLABLE_STATUSES.includes(l.status)).sort((a, b) => String(b.termStart).localeCompare(String(a.termStart)))[0] || null;
}

// Read-only voucher summary from the tenant's live lease (HOUS-01): the lease is the one place these fields are edited.
function AssistanceSummary({ tenantId, leaseId }) {
  const [state, setState] = useState(null);
  useEffect(() => {
    let alive = true;
    liveLeaseOf(tenantId, leaseId).then((lease) => alive && setState({ lease }));
    return () => {
      alive = false;
    };
  }, [tenantId, leaseId]);

  const description = "From the current lease. Change it on the lease's Terms tab.";
  if (!state) {
    return (
      <SectionCard bare title="Housing assistance" description={description}>
        <div className="flex justify-center py-6">
          <LogoLoading size={36} aria-label="Loading housing assistance" />
        </div>
      </SectionCard>
    );
  }
  const { lease } = state;
  const a = leaseAssistance(lease);
  const split = lease ? rentSplit(lease, null, new Date().toISOString().slice(0, 10)) : null;
  const facts = !lease
    ? [{ key: "lease", label: "Current lease", value: "" }]
    : [
        { key: "lease", label: "Current lease", value: lease.name || "Lease" },
        { key: "voucher", label: "Voucher / rental assistance", value: a.subsidized ? "Yes" : "No" },
        a.subsidized ? { key: "program", label: "Program / housing authority", value: a.program } : null,
        a.subsidized ? { key: "hap", label: "Assistance portion / month", value: currency(split.hap) } : null,
        a.subsidized ? { key: "tenant", label: "Tenant portion / month", value: currency(split.tenant) } : null,
      ];
  return (
    <SectionCard bare title="Housing assistance" description={description}>
      <FactList facts={facts} />
    </SectionCard>
  );
}

// Lease & Unit: the tenant's own lease fields, then the voucher summary read from the live lease.
export function makeTenantLeaseSection(fields) {
  function TenantLeaseSection({ item, onPatch, onCommit, onCommitMeta }) {
    return (
      <div className="space-y-8">
        <FieldsForm item={item} fields={fields} onPatch={onPatch} onCommit={onCommit} onCommitMeta={onCommitMeta} />
        {item?.id ? <AssistanceSummary tenantId={item.id} leaseId={item.leaseId} /> : null}
      </div>
    );
  }
  return TenantLeaseSection;
}
