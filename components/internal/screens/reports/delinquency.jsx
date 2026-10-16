"use client";

import { TrendingDown } from "lucide-react";

import { CatalogReport } from "./report_view";

// Delinquency — open charges per lease, aged from the ledger's receivables.
// Computed by the `delinquency` definition in lib/reports.
export function DelinquencyScreen() {
  return <CatalogReport reportKey="delinquency" icon={TrendingDown} />;
}

export default DelinquencyScreen;
