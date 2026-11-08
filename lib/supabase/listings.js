import { makeEntityData } from "./entity_factory";
import { createClient } from "./client";
import { scopeQuery } from "./scope";
import { uniqueSlug } from "@/lib/leasing/slug";

// Data-access layer for Listings — vacancy marketing listings (owns `property.listings`).
// Syndication, specials, terms and features live in metadata; publish state is internal only.
export const listingsLayer = makeEntityData({
  table: "listings",
  tag: "listings",
  fields: [
    { key: "name", col: "name", type: "text" },
    { key: "headline", col: "headline", type: "text" },
    { key: "description", col: "description", type: "text" },
    { key: "propertyId", col: "property_id", type: "uuid" },
    { key: "propertyName", col: "property_name", type: "text" },
    { key: "unitId", col: "unit_id", type: "uuid" },
    { key: "unit", col: "unit", type: "text" },
    { key: "rent", col: "rent", type: "number" },
    { key: "deposit", col: "deposit", type: "number" },
    { key: "availableDate", col: "available_date", type: "date" },
    { key: "bedrooms", col: "bedrooms", type: "number" },
    { key: "bathrooms", col: "bathrooms", type: "number" },
    { key: "sqft", col: "sqft", type: "number" },
    { key: "virtualTourUrl", col: "virtual_tour_url", type: "text" },
    { key: "contactName", col: "contact_name", type: "text" },
    { key: "contactEmail", col: "contact_email", type: "text" },
    { key: "contactPhone", col: "contact_phone", type: "text" },
    { key: "syndicated", col: "syndicated", type: "bool" },
    { key: "leaseId", col: "lease_id", type: "uuid" },
    { key: "status", col: "status", type: "text", default: "Draft" },
    // Public address on the leasing site (/l/<handle>/<slug>) and when it last went live (LEAS-01).
    { key: "slug", col: "slug", type: "text" },
    { key: "wentLiveAt", col: "published_at", type: "date" },
  ],
});

export const listingsData = listingsLayer.data;

// Listings for one unit (e.g. to mark them leased when a lease is signed).
export const listListingsForUnit = (unitId) =>
  unitId ? listingsLayer.list({ unitId }) : Promise.resolve([]);

// The listing's public slug: its own once set, else the first free one from its title (unique among the project's
// live listings). Returns the slug to save, or null when the project's slugs couldn't be read.
export async function ensureListingSlug(listing) {
  if (listing?.slug) return listing.slug;
  try {
    const { data, error } = await scopeQuery(createClient().from("listings").select("slug").not("slug", "is", null).is("deleted_at", null));
    if (error) {
      console.error("[listings.ensureSlug]", error.message);
      return null;
    }
    return uniqueSlug(listing?.name || listing?.headline, new Set((data || []).map((r) => r.slug)));
  } catch (e) {
    console.error("[listings.ensureSlug]", e);
    return null;
  }
}
