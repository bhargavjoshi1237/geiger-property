"use client";

import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { tenantsConfig } from "./config";

// All Tenants — the Tenants list + editor, driven by the reusable Entity engine.
export function AllTenantsScreen() {
  return <EntityListScreen config={tenantsConfig} />;
}

export default AllTenantsScreen;
