"use client";

import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { ownersConfig } from "./config";

// Owners — the owners list + editor, driven by the reusable Entity engine.
export function OwnersScreen() {
  return <EntityListScreen config={ownersConfig} />;
}

export default OwnersScreen;
