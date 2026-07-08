"use client";

import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { unitTypesConfig } from "./config";

// Unit Types — reusable unit templates, list + editor via the Entity engine.
export function UnitTypesScreen() {
  return <EntityListScreen config={unitTypesConfig} />;
}

export default UnitTypesScreen;
