"use client";

import { FileText } from "lucide-react";

import { CatalogReport } from "./report_view";

// Owner Statements — the owner packet: statement, rent roll and work orders, printable.
// Computed by the `owner_statements` definition in lib/reports.
export function OwnerStatementsScreen() {
  return <CatalogReport reportKey="owner_statements" icon={FileText} />;
}

export default OwnerStatementsScreen;
