"use client";

import { Receipt } from "lucide-react";

import { CatalogReport } from "./report_view";

// A/P Aging — unpaid vendor bills by days past due.
// Computed by the `ap_aging` definition in lib/reports.
export function ApAgingScreen() {
  return <CatalogReport reportKey="ap_aging" icon={Receipt} />;
}

export default ApAgingScreen;
