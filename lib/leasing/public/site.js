import "server-only";

import { adminClient } from "@/lib/supabase/admin";
import { forProject } from "@/lib/supabase/scope";
import { moduleEnabled } from "@/lib/modules";
import { getProjectSetting } from "@/lib/messaging/context";
import { isValidHandle } from "@/lib/leasing/slug";
import { loadScreeningCriteriaFor } from "@/lib/screening/criteria_server";
import { publicCriteria } from "./disclosures";
import { byAvailability, matchesListingFilters } from "./filters";
import { isPublicPhoto, propertyPublishes, serializePublicListing, serializePublicProperty, websiteChannelOn } from "./serialize";

// Server reads for the public leasing site (LEAS-01). anon has no table access, so everything goes through the service
// role, narrowed to the site's project, and leaves through the serializer's allowlist. Pass { db } to use another client.

const SITE_COLUMNS = "id, project_id, handle, enabled, display_name, brand, contact";
const LISTING_COLUMNS =
  "id, project_id, slug, name, headline, description, property_id, property_name, unit_id, unit, rent, deposit, available_date, bedrooms, bathrooms, sqft, virtual_tour_url, contact_name, contact_email, contact_phone, status, metadata, published_at, updated_at";
const PROPERTY_COLUMNS = "id, name, address, city, state, zip, cover_url, metadata";
const MEDIA_COLUMNS = "owner_type, owner_id, kind, url, bucket, is_cover, sort, status, metadata";
const SPECIAL_COLUMNS = "owner_id, name, status, amount, starts_on, ends_on, metadata";

// Listings that were public and have since been let or retired: their pages answer 410.
export const GONE_STATUSES = ["Leased", "Archived"];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9-]{1,80}$/;

const clientOf = (db) => db || adminClient({ source: "leasing-site" });
const text = (v) => (typeof v === "string" ? v.trim() : "");
const httpUrl = (v) => (/^https?:\/\//i.test(text(v)) ? text(v) : "");
const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

// A failed read throws (an error page), so an outage never reads as "this home doesn't exist".
async function rows(query, what) {
  const { data, error } = await query;
  if (error) throw new Error(`[leasing.public.${what}] ${error.message}`);
  return data || [];
}

// getSiteByHandle(handle) → the enabled site of a live project with Leasing on, else null. Brand and contact fall
// back to Settings → Branding & Portals. The result carries projectId for server reads; serializePublicSite drops it.
export async function getSiteByHandle(handle, { db } = {}) {
  if (!isValidHandle(handle)) return null;
  const sb = clientOf(db);
  if (!sb) return null;
  const [site] = await rows(
    sb.from("leasing_sites").select(SITE_COLUMNS).eq("handle", handle).eq("enabled", true).is("deleted_at", null).limit(1),
    "site",
  );
  if (!site) return null;
  const [project] = await rows(sb.schema("public").from("projects").select("id").eq("id", site.project_id).is("deleted_at", null).limit(1), "project");
  if (!project || !(await moduleEnabled(sb, site.project_id, "leasing"))) return null;
  const branding = obj(await getProjectSetting(sb, site.project_id, "branding_portals"));
  const brand = obj(site.brand);
  const contact = obj(site.contact);
  return {
    projectId: site.project_id,
    handle: site.handle,
    displayName: text(site.display_name) || text(branding.displayName) || "Homes for rent",
    logoUrl: httpUrl(brand.logoUrl) || httpUrl(branding.logoUrl),
    contact: {
      phone: text(contact.phone) || text(branding.supportPhone),
      email: text(contact.email) || text(branding.supportEmail),
      officeHours: text(contact.officeHours),
    },
  };
}

// Properties, specials and photos for a set of listing rows, all within the project.
async function loadContext(sb, projectId, listingRows) {
  const ids = listingRows.map((r) => r.id);
  const propertyIds = [...new Set(listingRows.map((r) => r.property_id).filter(Boolean))];
  const unitIds = [...new Set(listingRows.map((r) => r.unit_id).filter(Boolean))];
  const owners = [...ids, ...unitIds, ...propertyIds];
  const [properties, specials, media] = ids.length
    ? await Promise.all([
        propertyIds.length
          ? rows(forProject(sb.from("properties").select(PROPERTY_COLUMNS).in("id", propertyIds).is("deleted_at", null), projectId), "properties")
          : [],
        rows(
          forProject(sb.from("record_items").select(SPECIAL_COLUMNS).eq("owner_type", "listing").eq("kind", "special").in("owner_id", ids).is("deleted_at", null), projectId),
          "specials",
        ),
        rows(
          forProject(sb.from("media").select(MEDIA_COLUMNS).in("owner_type", ["listing", "unit", "property"]).in("owner_id", owners).is("deleted_at", null), projectId),
          "media",
        ),
      ])
    : [[], [], []];
  const byProperty = new Map(properties.map((p) => [p.id, p]));
  const group = (list, key) => list.reduce((m, r) => m.set(r[key], [...(m.get(r[key]) || []), r]), new Map());
  const specialsOf = group(specials, "owner_id");
  const mediaOf = group(media, "owner_id");
  return {
    property: (row) => (row.property_id ? byProperty.get(row.property_id) || null : null),
    // Listing photos, else the unit's, else the property's, else its cover image.
    extras: (row) => {
      const property = row.property_id ? byProperty.get(row.property_id) : null;
      const photos =
        [mediaOf.get(row.id), mediaOf.get(row.unit_id), mediaOf.get(row.property_id)].find((m) => m?.some(isPublicPhoto)) ||
        (httpUrl(property?.cover_url) ? [{ kind: "photo", url: property.cover_url, is_cover: true }] : []);
      return { media: photos, specials: specialsOf.get(row.id) || [] };
    },
  };
}

// A listing row is public when it's Active, on the Company website channel, and its property (if any) publishes.
function publicRows(listingRows, ctx) {
  return listingRows.filter((row) => {
    if (row.status !== "Active" || !row.slug || !websiteChannelOn(row)) return false;
    if (!row.property_id) return true;
    const property = ctx.property(row);
    return Boolean(property) && propertyPublishes(property);
  });
}

// listPublicListings(site, filters?) → serialized live listings, soonest available first.
export async function listPublicListings(site, filters = {}, { db } = {}) {
  if (!site?.projectId) return [];
  const sb = clientOf(db);
  const candidates = await rows(
    forProject(sb.from("listings").select(LISTING_COLUMNS).eq("status", "Active").not("slug", "is", null).is("deleted_at", null), site.projectId),
    "listings",
  );
  const onWebsite = candidates.filter(websiteChannelOn);
  const ctx = await loadContext(sb, site.projectId, onWebsite);
  return publicRows(onWebsite, ctx)
    .map((row) => serializePublicListing(row, { ...ctx.extras(row), site, property: ctx.property(row) }))
    .filter((l) => matchesListingFilters(l, filters))
    .sort(byAvailability);
}

// getPublicListing(site, slug) → { state: "live", listing } | { state: "gone", listing: { title, propertyId } } | null (404).
export async function getPublicListing(site, slug, { db } = {}) {
  if (!site?.projectId || !SLUG.test(String(slug || ""))) return null;
  const sb = clientOf(db);
  const [row] = await rows(
    forProject(sb.from("listings").select(LISTING_COLUMNS).eq("slug", slug).is("deleted_at", null).limit(1), site.projectId),
    "listing",
  );
  if (!row) return null;
  if (GONE_STATUSES.includes(row.status)) {
    return { state: "gone", listing: { title: text(row.name) || "This home", propertyId: row.property_id || null, bedrooms: Number(row.bedrooms) || 0 } };
  }
  const ctx = await loadContext(sb, site.projectId, [row]);
  if (!publicRows([row], ctx).length) return null;
  return { state: "live", listing: serializePublicListing(row, { ...ctx.extras(row), site, property: ctx.property(row) }) };
}

// getPublicProperty(site, propertyId) → the property's public fields when it belongs to the site and publishes, else null.
export async function getPublicProperty(site, propertyId, { db } = {}) {
  if (!site?.projectId || !UUID.test(String(propertyId || ""))) return null;
  const sb = clientOf(db);
  const [row] = await rows(
    forProject(sb.from("properties").select(PROPERTY_COLUMNS).eq("id", propertyId).is("deleted_at", null).limit(1), site.projectId),
    "property",
  );
  return row && propertyPublishes(row) ? serializePublicProperty(row) : null;
}

// publicPropertyAvailability(site, propertyId) → { property, listings } or null.
export async function publicPropertyAvailability(site, propertyId, { db } = {}) {
  const property = await getPublicProperty(site, propertyId, { db });
  if (!property) return null;
  return { property, listings: await listPublicListings(site, { propertyId: property.id }, { db }) };
}

// The screening criteria in force at a property (RISK-04: property → company), as public text and rows only.
export async function getPublishedCriteria(site, propertyId = null, { db } = {}) {
  const sb = clientOf(db);
  if (!site?.projectId || !sb) return publicCriteria(null);
  const { resolved } = await loadScreeningCriteriaFor(sb, { projectId: site.projectId, propertyId: UUID.test(String(propertyId || "")) ? propertyId : null });
  return publicCriteria(resolved);
}
