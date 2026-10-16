"use client";

import { BookOpen } from "lucide-react";

import { CatalogReport } from "./report_view";

// General Ledger Detail — every posted line by account with running balances.
// Computed by the `general_ledger_detail` definition in lib/reports.
export function GeneralLedgerDetailScreen() {
  return <CatalogReport reportKey="general_ledger_detail" icon={BookOpen} />;
}

export default GeneralLedgerDetailScreen;
