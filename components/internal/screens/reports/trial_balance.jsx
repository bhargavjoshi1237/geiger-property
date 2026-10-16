"use client";

import { Scale } from "lucide-react";

import { CatalogReport } from "./report_view";

// Trial Balance — opening, activity and closing per GL account.
// Computed by the `trial_balance` definition in lib/reports.
export function TrialBalanceScreen() {
  return <CatalogReport reportKey="trial_balance" icon={Scale} />;
}

export default TrialBalanceScreen;
