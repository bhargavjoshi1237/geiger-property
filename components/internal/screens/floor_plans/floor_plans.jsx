"use client";

import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { floorPlansConfig } from "./config";

// Floor Plans — reusable plans with uploaded drawings, list + editor via the engine.
export function FloorPlansScreen() {
  return <EntityListScreen config={floorPlansConfig} />;
}

export default FloorPlansScreen;
