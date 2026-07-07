"use client";

import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { leasingConfig } from "./config";

// All Leases — the Leasing list + editor, driven by the reusable Entity engine.
export function AllLeasesScreen() {
  return <EntityListScreen config={leasingConfig} />;
}

export default AllLeasesScreen;
