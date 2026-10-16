"use client";

import { FileSignature } from "lucide-react";

import { CatalogReport } from "./report_view";

// Leasing Report — funnel, expirations and renewal outcomes.
// Computed by the `leasing_report` definition in lib/reports.
export function LeasingReportScreen() {
  return <CatalogReport reportKey="leasing_report" icon={FileSignature} />;
}

export default LeasingReportScreen;
