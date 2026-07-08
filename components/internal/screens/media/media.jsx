"use client";

import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { mediaConfig } from "./config";

// Property Photos & Media — media library, list + editor via the Entity engine.
export function MediaScreen() {
  return <EntityListScreen config={mediaConfig} />;
}

export default MediaScreen;
