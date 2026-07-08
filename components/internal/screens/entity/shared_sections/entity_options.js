// Loaders that turn a related entity's rows into { value, label } picker options,
// so the generic DetailsSection can render entity-reference selects (portfolio,
// building, unit type, floor plan…) without each area wiring its own fetch.

import { listProperties } from "@/lib/supabase/properties";
import { listUnits } from "@/lib/supabase/units";
import { listPortfolios } from "@/lib/supabase/portfolios";
import { listBuildings } from "@/lib/supabase/buildings";
import { listUnitTypes } from "@/lib/supabase/unit_types";
import { listFloorPlans } from "@/lib/supabase/floor_plans";
import { listAmenities } from "@/lib/supabase/amenities";

// entityKey → { list, toOption }. entityKey matches the owner/config keys used
// across the areas.
const SOURCES = {
  property: {
    list: listProperties,
    toOption: (r) => ({ value: r.id, label: r.name || "Untitled property" }),
  },
  unit: {
    list: listUnits,
    toOption: (r) => ({ value: r.id, label: r.label || "Unit" }),
  },
  portfolio: {
    list: listPortfolios,
    toOption: (r) => ({ value: r.id, label: r.name || "Untitled portfolio" }),
  },
  building: {
    list: listBuildings,
    toOption: (r) => ({
      value: r.id,
      label: r.blockCode ? `${r.name} · ${r.blockCode}` : r.name || "Building",
    }),
  },
  unittype: {
    list: listUnitTypes,
    toOption: (r) => ({ value: r.id, label: r.name || "Untitled unit type" }),
  },
  floorplan: {
    list: listFloorPlans,
    toOption: (r) => ({ value: r.id, label: r.name || "Untitled floor plan" }),
  },
  amenity: {
    list: listAmenities,
    toOption: (r) => ({ value: r.id, label: r.name || "Untitled amenity" }),
  },
};

// Fetch options for one entity key. Returns [] on any failure/no-DB.
export async function loadEntityOptions(entityKey) {
  const src = SOURCES[entityKey];
  if (!src) return [];
  const rows = await src.list();
  return (rows || []).map(src.toOption);
}

// Human label for a target type in reverse-link sections.
export const OWNER_TYPE_LABEL = {
  property: "Property",
  unit: "Unit",
  building: "Building",
  unit_type: "Unit type",
  unittype: "Unit type",
  portfolio: "Portfolio",
};
