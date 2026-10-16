"use client";

import { FileSpreadsheet } from "lucide-react";

import { CatalogReport } from "./report_view";

// Rent Roll — every unit with its lease, rent, period activity and ledger balance.
// Computed by the `rent_roll` definition in lib/reports.
export function RentRollScreen() {
  return <CatalogReport reportKey="rent_roll" icon={FileSpreadsheet} />;
}

export default RentRollScreen;
