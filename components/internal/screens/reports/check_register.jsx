"use client";

import { ScrollText } from "lucide-react";

import { CatalogReport } from "./report_view";

// Check & Payment Register — cash in and out with a running balance.
// Computed by the `check_register` definition in lib/reports.
export function CheckRegisterScreen() {
  return <CatalogReport reportKey="check_register" icon={ScrollText} />;
}

export default CheckRegisterScreen;
