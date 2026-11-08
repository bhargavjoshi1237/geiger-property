"use client";

import { useEffect, useState } from "react";

import { Badge } from "@geiger/ui/badge";
import { useLedgerAccess } from "@/components/internal/shared/ledger_gate";
import { lateFeeCountsFor } from "@/lib/supabase/receivables";

// The late-fee count (CORE-19): rent months with a late fee in the last 12, as a header / row badge; nothing when 0.

const TITLE = "Rent months with a late fee in the last 12 months";

export function LateFeeCountPill({ count }) {
  if (!count) return null;
  return (
    <Badge variant="warning" title={TITLE}>
      Late {count} of 12 months
    </Badge>
  );
}

// Self-loading for a record header: a lease (its renewals included) or a tenant; hidden without accounting access.
export function LateFeeCountBadge({ leaseId = "", tenantId = "" }) {
  const canView = useLedgerAccess();
  const id = leaseId || tenantId;
  const [loaded, setLoaded] = useState(null);
  useEffect(() => {
    if (!canView || !id) return undefined;
    let alive = true;
    lateFeeCountsFor(leaseId ? { leaseIds: [leaseId] } : { tenantIds: [tenantId] }).then((counts) => {
      if (alive) setLoaded({ id, count: counts?.get(id)?.count || 0 });
    });
    return () => {
      alive = false;
    };
  }, [canView, id, leaseId, tenantId]);
  return canView && loaded?.id === id ? <LateFeeCountPill count={loaded.count} /> : null;
}
