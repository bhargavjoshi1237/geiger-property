"use client";

import { Percent } from "lucide-react";

import { CatalogReport } from "./report_view";

// Management Fees — fees booked per property and owner against income.
// Computed by the `management_fees` definition in lib/reports.
export function ManagementFeesScreen() {
  return <CatalogReport reportKey="management_fees" icon={Percent} />;
}

export default ManagementFeesScreen;
