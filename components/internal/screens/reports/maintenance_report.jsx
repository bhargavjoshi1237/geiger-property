"use client";

import { Wrench } from "lucide-react";

import { CatalogReport } from "./report_view";

// Maintenance Report — work-order volume, turnaround and spend.
// Computed by the `maintenance_report` definition in lib/reports.
export function MaintenanceReportScreen() {
  return <CatalogReport reportKey="maintenance_report" icon={Wrench} />;
}

export default MaintenanceReportScreen;
