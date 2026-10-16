"use client";

import { PieChart } from "lucide-react";

import { CatalogReport } from "./report_view";

// Occupancy & Vacancy — occupancy per property, vacant units, moves and vacancy loss.
// Computed by the `occupancy` definition in lib/reports.
export function OccupancyScreen() {
  return <CatalogReport reportKey="occupancy" icon={PieChart} />;
}

export default OccupancyScreen;
