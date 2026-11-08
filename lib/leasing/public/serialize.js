import { petPolicyOf, petsAllowed, resolveApplicantFees } from "@/lib/leasing/fees";
import { effectiveRent, isSpecialActive, specialTypeOf, todayISO } from "@/lib/leasing/pricing";

// The one public shape of a listing (LEAS-01): an allowlist built field by field from the DB rows, never a spread of
// `metadata`, so internal notes, tracking, agents and ad spend can't reach a public page or feed. LEAS-11's MITS and
// listing-site formats map from this output.

const text = (v) => (typeof v === "string" ? v.trim() : "");
const num = (v) => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
const money = (v) => Math.max(0, Number(v) || 0);
const bool = (v) => v === true;
const list = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim()) : []);
const lines = (v) => text(v).split(/\r?\n/).map((l) => l.replace(/^[-•*]\s*/, "").trim()).filter(Boolean);
const date = (v) => (v ? String(v).slice(0, 10) : null);
const httpUrl = (v) => (/^https?:\/\//i.test(text(v)) ? text(v) : "");
const metaOf = (row) => (row?.metadata && typeof row.metadata === "object" ? row.metadata : {});

// Keys that must never appear in public output (LEAS-01 acceptance list).
export const PRIVATE_LISTING_KEYS = [
  "trackingEmail",
  "trackingPhone",
  "marketingBudget",
  "campaign",
  "notes",
  "agent",
  "showingInstructions",
  "contactNotes",
  "pricingNotes",
  "furnishingsInventory",
  "syndication",
];

// The listing's "Company website" channel (legacy rows stored { [label]: true }).
export function websiteChannelOn(row) {
  const raw = metaOf(row).syndication || {};
  const v = raw.website ?? raw["Company website"];
  return v && typeof v === "object" ? Boolean(v.enabled) : Boolean(v);
}

// Property → its public fields only (no banking, owners, management or association data).
export function serializePublicProperty(row) {
  if (!row) return null;
  const m = metaOf(row);
  const mk = m.marketing && typeof m.marketing === "object" ? m.marketing : {};
  const lat = num(m.latitude);
  const lng = num(m.longitude);
  return {
    id: row.id,
    name: text(row.name),
    address: { street: text(row.address), city: text(row.city), state: text(row.state), zip: text(row.zip) },
    neighborhood: text(m.neighborhood),
    geo: lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null,
    coverUrl: httpUrl(row.cover_url),
    headline: text(mk.headline),
    description: text(mk.marketingDescription),
    petPolicy: text(mk.petPolicyText),
    parking: text(mk.parkingInfo),
    officeHours: text(mk.leasingOfficeHours),
    phone: text(mk.leasingPhone),
    email: text(mk.leasingEmail),
  };
}

// Whether a property's vacancies may be published (Property → Marketing → "Publish vacancies to listings"; unset = yes).
export const propertyPublishes = (row) => metaOf(row).marketing?.publishVacancies !== false;

// The site's public face: brand and contact, with Branding & Portals as the fallback. Never the project id.
export function serializePublicSite(site) {
  if (!site) return null;
  return {
    handle: site.handle,
    name: site.displayName,
    logoUrl: site.logoUrl,
    contact: { phone: site.contact.phone, email: site.contact.email, officeHours: site.contact.officeHours },
  };
}

function serializeSpecial(row) {
  const m = metaOf(row);
  return {
    name: text(row.name),
    type: specialTypeOf({ metadata: m }),
    amount: money(row.amount),
    startsOn: date(row.starts_on),
    endsOn: date(row.ends_on),
    minTermMonths: num(m.minTermMonths),
    conditions: text(m.conditions),
  };
}

// Media rows → photos, cover first. Only http(s) URLs already stored (no new public paths).
export function serializePhotos(rows, title) {
  return (rows || [])
    .filter((r) => (r.kind || "photo") === "photo" && (r.status || "Published") === "Published" && httpUrl(r.url))
    .sort((a, b) => Number(Boolean(b.is_cover)) - Number(Boolean(a.is_cover)) || (Number(a.sort) || 0) - (Number(b.sort) || 0))
    .map((r, i) => ({ url: httpUrl(r.url), alt: text(metaOf(r).altText) || `${title} — photo ${i + 1}` }));
}

// Apartment-like listings are Apartment; houses SingleFamilyResidence; attached homes House (schema.org).
export function schemaTypeOf(propertyType) {
  if (propertyType === "House") return "SingleFamilyResidence";
  if (propertyType === "Townhome" || propertyType === "Duplex") return "House";
  return "Apartment";
}

// serializePublicListing(row, { media, specials, fees, site, property, today }) → the public listing.
export function serializePublicListing(row, { media = [], specials = [], fees, site = null, property = null, today = todayISO() } = {}) {
  const m = metaOf(row);
  const title = text(row.name) || text(row.headline) || "Home for rent";
  const prop = property ? serializePublicProperty(property) : null;
  const termMonths = Number(m.pricingTermMonths) || 12;
  const activeSpecials = (specials || []).filter((s) => isSpecialActive({ status: s.status, endsOn: date(s.ends_on) }, today));
  const rent = money(row.rent);
  const furnished = bool(m.furnished);
  const midTerm = bool(m.midTerm);
  const available = date(row.available_date);
  const pets = petsAllowed(row);
  return {
    id: row.id,
    slug: row.slug,
    title,
    headline: text(row.headline),
    description: text(row.description),
    highlights: lines(m.highlights),
    neighborhood: text(m.neighborhood) || prop?.neighborhood || "",
    propertyType: text(m.propertyType),
    schemaType: schemaTypeOf(text(m.propertyType)),
    bedrooms: num(row.bedrooms) ?? 0,
    bathrooms: num(row.bathrooms) ?? 0,
    sqft: num(row.sqft) || null,
    floor: text(m.floor),
    unitLabel: text(row.unit),
    rent,
    effectiveRent: Math.round(effectiveRent(rent, activeSpecials.map((s) => ({ status: s.status, amount: s.amount, endsOn: date(s.ends_on), metadata: metaOf(s) })), termMonths, today) * 100) / 100,
    pricingTermMonths: termMonths,
    deposit: money(row.deposit),
    specials: activeSpecials.map(serializeSpecial),
    fees: fees ?? resolveApplicantFees(row),
    availableDate: available,
    availableNow: !available || available <= today,
    moveInFlexible: bool(m.moveInFlexible),
    leaseTerms: list(m.leaseTerms),
    minTermMonths: num(m.minTermMonths),
    maxTermMonths: num(m.maxTermMonths),
    maxOccupants: num(m.maxOccupants),
    tours: {
      selfGuided: bool(m.selfGuidedTours),
      virtual: bool(m.virtualTours),
      virtualTourUrl: httpUrl(row.virtual_tour_url),
      videoUrl: httpUrl(m.videoUrl),
      floorPlanUrl: httpUrl(m.floorPlanUrl),
      bookingUrl: httpUrl(m.bookingLink),
    },
    pets: {
      allowed: pets,
      policy: petPolicyOf(row),
      note: prop?.petPolicy || "",
      types: pets ? list(m.petTypes) : [],
      maxPets: pets ? num(m.maxPets) : null,
      weightLimit: pets ? num(m.petWeightLimit) : null,
      breedRestrictions: pets ? text(m.breedRestrictions) : "",
    },
    features: list(m.features),
    communityAmenities: list(m.communityAmenities),
    parking: text(m.parking),
    parkingInfo: prop?.parking || "",
    laundry: text(m.laundry),
    heating: text(m.heating),
    utilitiesIncluded: list(m.utilitiesIncluded),
    otherFeatures: text(m.otherFeatures),
    furnished:
      furnished || midTerm
        ? {
            furnished,
            midTerm,
            minStayDays: num(m.minStayDays),
            maxStayMonths: num(m.maxStayMonths),
            monthlyRate: money(m.furnishedMonthlyRate) || null,
            utilitiesIncluded: bool(m.midTermUtilitiesIncluded),
            utilityCap: money(m.utilityCap) || null,
            linensProvided: bool(m.linensProvided),
            wifiSpeed: num(m.wifiSpeed),
          }
        : null,
    photos: serializePhotos(media, title),
    property: prop
      ? { id: prop.id, name: prop.name, address: prop.address, neighborhood: prop.neighborhood, geo: prop.geo }
      : { id: row.property_id || null, name: text(row.property_name), address: null, neighborhood: "", geo: null },
    contact: {
      name: text(row.contact_name),
      email: text(row.contact_email) || prop?.email || site?.contact?.email || "",
      phone: text(row.contact_phone) || prop?.phone || site?.contact?.phone || "",
      officeHours: text(m.officeHours) || prop?.officeHours || site?.contact?.officeHours || "",
    },
    publishedAt: row.published_at || null,
    updatedAt: row.updated_at || null,
  };
}

// The short form used by cards, the embed widget and "similar homes".
export function summarizeListing(l) {
  return {
    slug: l.slug,
    title: l.title,
    propertyId: l.property.id,
    propertyName: l.property.name,
    city: l.property.address?.city || "",
    unitLabel: l.unitLabel,
    bedrooms: l.bedrooms,
    bathrooms: l.bathrooms,
    sqft: l.sqft,
    rent: l.rent,
    effectiveRent: l.effectiveRent,
    availableDate: l.availableDate,
    availableNow: l.availableNow,
    petsAllowed: l.pets.allowed,
    furnished: Boolean(l.furnished?.furnished),
    special: l.specials[0]?.name || "",
    photo: l.photos[0] || null,
  };
}

const postalAddress = (a) =>
  a && (a.street || a.city)
    ? { "@type": "PostalAddress", streetAddress: a.street, addressLocality: a.city, addressRegion: a.state, postalCode: a.zip, addressCountry: "US" }
    : undefined;

// schema.org JSON-LD: a RealEstateListing page about an Apartment / House, offered for lease.
export function listingJsonLd(l, { url, siteName }) {
  const home = {
    "@type": l.schemaType,
    name: l.title,
    numberOfRooms: l.bedrooms || undefined,
    numberOfBedrooms: l.bedrooms,
    numberOfBathroomsTotal: l.bathrooms || undefined,
    floorSize: l.sqft ? { "@type": "QuantitativeValue", value: l.sqft, unitCode: "FTK" } : undefined,
    petsAllowed: l.pets.policy ? l.pets.allowed : undefined,
    address: postalAddress(l.property.address),
    geo: l.property.geo ? { "@type": "GeoCoordinates", latitude: l.property.geo.lat, longitude: l.property.geo.lng } : undefined,
    amenityFeature: [...l.features, ...l.communityAmenities].map((name) => ({ "@type": "LocationFeatureSpecification", name, value: true })),
  };
  return {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    name: l.title,
    description: l.headline || l.description.slice(0, 300) || undefined,
    url,
    image: l.photos.map((p) => p.url),
    datePosted: l.publishedAt || undefined,
    about: home,
    offers: {
      "@type": "Offer",
      businessFunction: "http://purl.org/goodrelations/v1#LeaseOut",
      price: l.rent,
      priceCurrency: "USD",
      priceSpecification: { "@type": "UnitPriceSpecification", price: l.rent, priceCurrency: "USD", unitCode: "MON", referenceQuantity: { "@type": "QuantitativeValue", value: 1, unitCode: "MON" } },
      availability: "https://schema.org/InStock",
      availabilityStarts: l.availableDate || undefined,
      url,
      offeredBy: siteName ? { "@type": "Organization", name: siteName } : undefined,
    },
  };
}

// JSON for a <script type="application/ld+json">, with `<` escaped (Next's JSON-LD guide).
export const jsonLdScript = (data) => JSON.stringify(data).replace(/</g, "\\u003c");
