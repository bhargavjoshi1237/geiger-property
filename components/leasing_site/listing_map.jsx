"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";
import "leaflet/dist/leaflet.css";

// Location map for a public listing or property (LEAS-01): Leaflet with CARTO raster tiles (images only, so it stays
// within the CSP), loaded after hydration so it never holds up the page.

const TILES = {
  light: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
  dark: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
};
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

export function ListingMap({ lat, lng, label }) {
  const ref = useRef(null);
  const { resolvedTheme } = useTheme();
  const scheme = resolvedTheme === "light" ? "light" : "dark";

  useEffect(() => {
    let map = null;
    let alive = true;
    import("leaflet").then(({ default: L }) => {
      if (!alive || !ref.current) return;
      map = L.map(ref.current, { scrollWheelZoom: false, attributionControl: true }).setView([lat, lng], 15);
      L.tileLayer(TILES[scheme], { attribution: ATTRIBUTION, maxZoom: 19, subdomains: "abcd" }).addTo(map);
      L.circleMarker([lat, lng], { radius: 9, weight: 3, opacity: 1, fillOpacity: 1, className: "fill-primary stroke-background" }).addTo(map).bindTooltip(label);
    });
    return () => {
      alive = false;
      map?.remove();
    };
  }, [lat, lng, label, scheme]);

  return <div ref={ref} role="region" aria-label={`Map showing ${label}`} className="h-64 w-full overflow-hidden rounded-xl border border-border bg-surface-card sm:h-80" />;
}

export default ListingMap;
