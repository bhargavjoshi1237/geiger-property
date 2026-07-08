"use client";

import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { buildingsConfig } from "./config";

// Buildings & Blocks — structures within properties, list + editor via the engine.
export function BuildingsScreen() {
  return <EntityListScreen config={buildingsConfig} />;
}

export default BuildingsScreen;
