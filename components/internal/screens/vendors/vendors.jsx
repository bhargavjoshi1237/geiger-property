"use client";

import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { vendorsConfig } from "./config";

// Vendors — the vendor directory list + editor, driven by the reusable Entity engine.
export function VendorsScreen() {
  return <EntityListScreen config={vendorsConfig} />;
}

export default VendorsScreen;
