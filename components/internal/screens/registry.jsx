import { EventsOverviewScreen } from "./overview/events_overview";
import { AllPropertiesScreen } from "./properties/all_properties";
import { AllTenantsScreen } from "./tenants/all_tenants";
import { AllMaintenanceScreen } from "./maintenance/all_maintenance";
import { AllLeasesScreen } from "./leasing/all_leases";

/**
 * Maps a sidebar nav title to its screen component. Titles must exactly match
 * the `title` fields in `components/internal/sidebar/sidebar_nav.jsx`.
 *
 * Geiger Property is scaffolded feature-first: the full feature taxonomy lives
 * in the sidebar (see docs/competitive-feature-matrix.md), but only screens
 * listed here are built out. Everything else falls back to the ComingSoonScreen
 * so the workspace looks complete while areas are implemented one at a time.
 */
export const SCREEN_REGISTRY = {
  "Overview": EventsOverviewScreen,
  "All Properties": AllPropertiesScreen,
  "All Tenants": AllTenantsScreen,
  "All Maintenance": AllMaintenanceScreen,
  "Leases": AllLeasesScreen,
};

export function getScreen(title) {
  return SCREEN_REGISTRY[title] || null;
}
