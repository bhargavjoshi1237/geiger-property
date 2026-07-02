import { PropertyOverviewScreen } from "./overview/property_overview";

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
  Overview: PropertyOverviewScreen,
};

export function getScreen(title) {
  return SCREEN_REGISTRY[title] || null;
}
