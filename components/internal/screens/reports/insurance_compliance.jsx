"use client";

import { ShieldCheck } from "lucide-react";

import { CatalogReport } from "./report_view";

// Insurance Compliance — renters insurance, vendor COIs and licenses.
// Computed by the `insurance_compliance` definition in lib/reports.
export function InsuranceComplianceScreen() {
  return <CatalogReport reportKey="insurance_compliance" icon={ShieldCheck} />;
}

export default InsuranceComplianceScreen;
