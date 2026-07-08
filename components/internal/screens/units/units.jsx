"use client";

import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { unitsConfig } from "./config";

// Units — individual units list + editor, driven by the reusable Entity engine.
export function UnitsScreen() {
  return <EntityListScreen config={unitsConfig} />;
}

export default UnitsScreen;
