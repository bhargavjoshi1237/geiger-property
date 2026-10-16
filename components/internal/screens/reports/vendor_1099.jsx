"use client";

import { FileSpreadsheet } from "lucide-react";

import { CatalogReport } from "./report_view";

// 1099 Summary — vendor payments against the reporting threshold, with W-9 status.
// Computed by the `vendor_1099` definition in lib/reports.
export function Vendor1099Screen() {
  return <CatalogReport reportKey="vendor_1099" icon={FileSpreadsheet} />;
}

export default Vendor1099Screen;
