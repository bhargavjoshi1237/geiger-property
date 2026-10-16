"use client";

import { PiggyBank } from "lucide-react";

import { CatalogReport } from "./report_view";

// Deposit Detail — deposits held per lease vs the ledger, and trust positions.
// Computed by the `deposit_detail` definition in lib/reports.
export function DepositDetailScreen() {
  return <CatalogReport reportKey="deposit_detail" icon={PiggyBank} />;
}

export default DepositDetailScreen;
