"use client";

import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { amenitiesConfig } from "./config";

// Amenities — amenity library, list + editor via the reusable Entity engine.
export function AmenitiesScreen() {
  return <EntityListScreen config={amenitiesConfig} />;
}

export default AmenitiesScreen;
