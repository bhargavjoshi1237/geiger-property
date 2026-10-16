"use client";

import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { tenantsConfig } from "./config";

// Tenants — the one tenants list + editor, driven by the reusable Entity engine.
export function TenantsScreen() {
  return <EntityListScreen config={tenantsConfig} />;
}

export default TenantsScreen;
