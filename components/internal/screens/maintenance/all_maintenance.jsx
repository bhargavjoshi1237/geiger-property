"use client";

import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { maintenanceConfig } from "./config";

// All Maintenance — the work-order list + editor, driven by the reusable Entity
// engine.
export function AllMaintenanceScreen() {
  return <EntityListScreen config={maintenanceConfig} />;
}

export default AllMaintenanceScreen;
