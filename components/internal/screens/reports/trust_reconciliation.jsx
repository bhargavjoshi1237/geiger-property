"use client";

import { Vault } from "lucide-react";

import { CatalogReport } from "./report_view";

// Trust Reconciliation — three-way: adjusted bank ↔ book trust cash ↔ owner, tenant and deposit ledgers (INTL-05).
// Computed by the `trust_reconciliation` definition in lib/reports.
export function TrustReconciliationScreen() {
  return <CatalogReport reportKey="trust_reconciliation" icon={Vault} />;
}

export default TrustReconciliationScreen;
