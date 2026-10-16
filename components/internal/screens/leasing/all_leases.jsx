"use client";

import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { leasingConfig } from "./config";

// Leases — the lease list + editor (incl. the builder tabs), driven by the Entity engine.
export function AllLeasesScreen() {
  return <EntityListScreen config={leasingConfig} />;
}

export default AllLeasesScreen;
