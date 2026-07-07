"use client";

import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { propertiesConfig } from "./config";

// All Properties — the Properties list + editor, driven by the reusable Entity
// engine. Wired into the sidebar via screens/registry.jsx.
export function AllPropertiesScreen() {
  return <EntityListScreen config={propertiesConfig} />;
}

export default AllPropertiesScreen;
