"use client";

import { FileBarChart } from "lucide-react";

import { CatalogReport } from "./report_view";

// Financial Statements — P&L, balance sheet and cash flow from the general ledger.
// Computed by the `financial_statements` definition in lib/reports.
export function FinancialStatementsScreen() {
  return <CatalogReport reportKey="financial_statements" icon={FileBarChart} />;
}

export default FinancialStatementsScreen;
