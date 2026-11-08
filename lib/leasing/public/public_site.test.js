import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { effectiveRent } from "@/lib/leasing/pricing";
import { resolveApplicantFees } from "@/lib/leasing/fees";
import { handleFrom, isValidHandle, slugify, uniqueSlug } from "@/lib/leasing/slug";
import { qrMatrix } from "@/lib/qr";
import { PUBLIC_PAGES } from "@/lib/auth/route_permissions";
import { resolveScreeningCriteria } from "@/lib/screening/criteria_policy";
import { PUBLIC_CRITERIA_KEYS, publicCriteria } from "./disclosures";
import { filtersToQuery, matchesListingFilters, parseListingFilters, similarListings } from "./filters";
import { listingPathParts } from "./gone";
import { listingJsonLd, PRIVATE_LISTING_KEYS, schemaTypeOf, serializePublicListing, serializePublicSite, summarizeListing, websiteChannelOn } from "./serialize";
import { getPublicListing, getSiteByHandle, listPublicListings, publicPropertyAvailability } from "./site";
import { publicPageStatus } from "./status";

// LEAS-01: the public leasing site shows only allowlisted fields of live listings of one project.

const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";
const PROP = "33333333-3333-4333-8333-333333333333";
const TODAY = "2026-11-08";

const PRIVATE_VALUES = {
  trackingEmail: "unit4b@leasing.example.com",
  trackingPhone: "(555) 000-1111",
  marketingBudget: 777,
  campaign: "Spring lease-up secret",
  notes: "Owner is selling next year",
  agent: "Tasha Greene",
  showingInstructions: "Lockbox code 4321",
  contactNotes: "Don't mention the noise",
  pricingNotes: "Floor is $2,900",
  furnishingsInventory: "Sofa (stained)",
};

const website = (enabled) => ({ website: { enabled, status: enabled ? "Published" : "Off" } });

function listingRow(over = {}) {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    project_id: P1,
    slug: "sunny-two-bed",
    name: "Sunny two-bed",
    headline: "Corner unit",
    description: "Bright and quiet.",
    property_id: PROP,
    property_name: "Maple Court",
    unit_id: null,
    unit: "Maple Court · 4B",
    rent: 2400,
    deposit: 2400,
    available_date: "2026-12-01",
    bedrooms: 2,
    bathrooms: 1,
    sqft: 900,
    virtual_tour_url: "https://tour.example.com/1",
    contact_name: "Leasing office",
    contact_email: "leasing@example.com",
    contact_phone: "(555) 123-4567",
    status: "Active",
    published_at: "2026-11-01T00:00:00Z",
    updated_at: "2026-11-02T00:00:00Z",
    metadata: {
      ...PRIVATE_VALUES,
      syndication: website(true),
      applicationFee: 50,
      adminFee: 150,
      holdingDeposit: 500,
      petPolicy: "Cats and dogs",
      petDeposit: 300,
      petRent: 35,
      parkingFee: 75,
      pricingTermMonths: 12,
      features: ["Dishwasher"],
      highlights: "Corner unit\nBig windows",
      propertyType: "Apartment",
    },
    ...over,
  };
}

const specialRow = (over = {}) => ({ owner_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Six weeks free", status: "Active", amount: 6, starts_on: "2026-11-01", ends_on: "2026-12-31", metadata: { specialType: "Weeks free" }, ...over });

const propertyRow = (over = {}) => ({
  id: PROP,
  name: "Maple Court",
  address: "1 Maple Ct",
  city: "Tacoma",
  state: "WA",
  zip: "98403",
  cover_url: "https://img.example.com/cover.jpg",
  metadata: { latitude: 47.2, longitude: -122.4, banking: { operatingAccountName: "Secret Bank" }, marketing: { leasingPhone: "(555) 999-0000" } },
  ...over,
});

const SITE = { projectId: P1, handle: "maple-rentals", displayName: "Maple Rentals", logoUrl: "", contact: { phone: "", email: "", officeHours: "" } };

test("serializer: an allowlist — no private key or value reaches the public listing, JSON-LD or summary", () => {
  const l = serializePublicListing(listingRow(), { specials: [specialRow()], property: propertyRow(), site: SITE, today: TODAY });
  const out = JSON.stringify([l, summarizeListing(l), listingJsonLd(l, { url: "https://x/l/a/b", siteName: "Maple" }), serializePublicSite(SITE)]);
  for (const key of PRIVATE_LISTING_KEYS) assert.ok(!out.includes(`"${key}"`), `leaks the ${key} key`);
  for (const [key, value] of Object.entries(PRIVATE_VALUES)) assert.ok(!out.includes(String(value)), `leaks the ${key} value`);
  assert.ok(!out.includes("Secret Bank") && !out.includes("banking"), "leaks property banking data");
  assert.ok(!out.includes(P1), "leaks the project id");
  assert.equal(l.title, "Sunny two-bed");
  assert.deepEqual(l.highlights, ["Corner unit", "Big windows"]);
  assert.deepEqual(l.property.geo, { lat: 47.2, lng: -122.4 });
});

test("serializer: effective rent equals effectiveRent() for the same inputs; expired specials drop out", () => {
  const specials = [specialRow(), specialRow({ name: "Old", ends_on: "2026-01-01", amount: 2 }), specialRow({ name: "Off", status: "Inactive" })];
  const l = serializePublicListing(listingRow(), { specials, today: TODAY });
  const expected = effectiveRent(2400, specials.map((s) => ({ status: s.status, amount: s.amount, endsOn: s.ends_on, metadata: s.metadata })), 12, TODAY);
  assert.equal(l.effectiveRent, Math.round(expected * 100) / 100);
  assert.ok(l.effectiveRent < 2400);
  assert.deepEqual(l.specials.map((s) => s.name), ["Six weeks free"]);
});

test("fees: the table lists application, admin, holding deposit, pet deposit, pet rent and parking, stating $0 as None", () => {
  const fees = resolveApplicantFees(listingRow());
  const byKey = Object.fromEntries(fees.map((f) => [f.key, f]));
  for (const key of ["applicationFee", "adminFee", "holdingDeposit", "petDeposit", "petRent", "parkingFee", "deposit"]) assert.ok(byKey[key], `lists ${key}`);
  assert.equal(byKey.applicationFee.amount, 50);
  assert.equal(byKey.petRent.cadence, "monthly");
  assert.equal(byKey.parkingFee.amount, 75);
  const bare = Object.fromEntries(resolveApplicantFees({ rent: 1000, metadata: { petPolicy: "No pets" } }).map((f) => [f.key, f]));
  assert.equal(bare.adminFee.note, "None");
  assert.equal(bare.petRent.note, "Pets aren't allowed");
  assert.equal(bare.petFee, undefined, "optional fees appear only when charged");
});

test("disclosures: the criteria in force at a property, public rows and written text only", () => {
  const resolved = resolveScreeningCriteria({
    company: { incomeMultiple: 3, screeningPackage: "manual", screeningPayer: "company", conditionalOptions: ["extra_deposit"], publishedCriteriaText: "Company text" },
    property: { metadata: { policyOverrides: { incomeMultiple: 2.5, publishedCriteriaText: "Property text" } } },
  });
  const c = publicCriteria(resolved);
  const byKey = Object.fromEntries(c.rows.map((r) => [r.key, r]));
  assert.equal(byKey.incomeMultiple.value, "2.5× rent", "the property override wins");
  assert.equal(c.text, "Property text");
  for (const key of ["screeningPackage", "screeningPayer", "conditionalOptions", "publishedCriteriaText"]) assert.ok(!byKey[key], `${key} stays internal`);
  assert.ok(c.rows.every((r) => PUBLIC_CRITERIA_KEYS.has(r.key) && !("source" in r)));
  assert.match(c.note, /reasonable accommodation/);
  assert.equal(publicCriteria(resolveScreeningCriteria({ legacy: { incomeMultiple: 2 } })).rows.find((r) => r.key === "incomeMultiple").value, "2× rent", "old setting as fallback");
});

test("json-ld: a RealEstateListing about an Apartment or House with a monthly lease Offer", () => {
  const l = serializePublicListing(listingRow(), { property: propertyRow(), today: TODAY });
  const ld = listingJsonLd(l, { url: "https://x/l/m/sunny-two-bed", siteName: "Maple Rentals" });
  assert.equal(ld["@type"], "RealEstateListing");
  assert.equal(ld.about["@type"], "Apartment");
  assert.equal(ld.offers.price, 2400);
  assert.equal(ld.offers.priceSpecification.unitCode, "MON");
  assert.equal(ld.about.address.addressLocality, "Tacoma");
  assert.equal(schemaTypeOf("House"), "SingleFamilyResidence");
  assert.equal(schemaTypeOf("Townhome"), "House");
});

// A fake service-role client: `tables[name]` holds rows; eq / in / is / not filters apply, so scoping is real.
function fakeDb(tables) {
  const queries = [];
  const from = (table) => {
    const q = { table, filters: [] };
    queries.push(q);
    const run = () => {
      let rows = [...(tables[table] || [])];
      for (const [op, col, a, b] of q.filters) {
        const val = (r) => (col.includes("->") ? undefined : r[col]);
        if (op === "eq") rows = rows.filter((r) => String(val(r)) === String(a));
        if (op === "in") rows = rows.filter((r) => a.includes(val(r)));
        if (op === "is") rows = rows.filter((r) => (val(r) ?? null) === a);
        if (op === "not" && a === "is") rows = rows.filter((r) => (val(r) ?? null) !== b);
      }
      return { data: rows, error: null };
    };
    const builder = new Proxy(
      {},
      {
        get(_, prop) {
          if (prop === "then") return (ok, fail) => Promise.resolve(run()).then(ok, fail);
          return (...args) => {
            if (["eq", "in", "is", "not"].includes(prop)) q.filters.push([prop, ...args]);
            return builder;
          };
        },
      },
    );
    return builder;
  };
  return { queries, from, schema: () => ({ from }) };
}

function siteDb(over = {}) {
  return fakeDb({
    leasing_sites: [
      { id: "s1", project_id: P1, handle: "maple-rentals", enabled: true, display_name: "", brand: {}, contact: {}, deleted_at: null },
      { id: "s2", project_id: P2, handle: "other-co", enabled: false, display_name: "Other", brand: {}, contact: {}, deleted_at: null },
    ],
    projects: [{ id: P1, deleted_at: null }, { id: P2, deleted_at: null }],
    settings: [{ project_id: P1, key: "branding_portals", value: { displayName: "Maple Rentals", supportEmail: "office@maple.example" }, deleted_at: null }],
    listings: [
      listingRow(),
      listingRow({ id: "b", slug: "leased-one", status: "Leased" }),
      listingRow({ id: "c", slug: "draft-one", status: "Draft" }),
      listingRow({ id: "d", slug: "paused-one", status: "Paused" }),
      listingRow({ id: "e", slug: "web-off", metadata: { syndication: website(false) } }),
      listingRow({ id: "f", slug: "archived-one", status: "Archived" }),
      listingRow({ id: "g", slug: "sunny-two-bed", project_id: P2, name: "Other project's home", property_id: null }),
      listingRow({ id: "h", slug: "deleted-one", deleted_at: "2026-11-01T00:00:00Z" }),
      listingRow({ id: "i", slug: null }),
    ].map((r) => ({ deleted_at: null, ...r })),
    properties: [{ deleted_at: null, project_id: P1, ...propertyRow() }],
    record_items: [{ deleted_at: null, project_id: P1, owner_type: "listing", kind: "special", ...specialRow() }],
    media: [],
    ...over,
  });
}

test("site: only an enabled site of a live project with Leasing on; brand falls back to Branding & Portals", async () => {
  const db = siteDb();
  const site = await getSiteByHandle("maple-rentals", { db });
  assert.equal(site.projectId, P1);
  assert.equal(site.displayName, "Maple Rentals");
  assert.equal(site.contact.email, "office@maple.example");
  assert.equal(await getSiteByHandle("other-co", { db }), null, "disabled site");
  assert.equal(await getSiteByHandle("Bad Handle", { db }), null);
  const off = siteDb({ settings: [{ project_id: P1, key: "modules", value: { leasing: false }, deleted_at: null }] });
  assert.equal(await getSiteByHandle("maple-rentals", { db: off }), null, "Leasing module off");
});

test("site: live listings only — Active, website on, slugged, this project, not deleted", async () => {
  const db = siteDb();
  const listings = await listPublicListings(SITE, {}, { db });
  assert.deepEqual(listings.map((l) => l.slug), ["sunny-two-bed"]);
  assert.equal(listings[0].title, "Sunny two-bed", "never the other project's row with the same slug");
  for (const q of db.queries.filter((x) => x.table !== "projects")) {
    assert.ok(q.filters.some(([op, col, v]) => op === "eq" && col === "project_id" && v === P1), `${q.table} read is scoped to the project`);
  }
  const hidden = siteDb({ properties: [{ deleted_at: null, project_id: P1, ...propertyRow({ metadata: { marketing: { publishVacancies: false } } }) }] });
  assert.deepEqual(await listPublicListings(SITE, {}, { db: hidden }), [], "property set not to publish vacancies");
});

test("site: a listing page is live, gone (Leased / Archived) or missing (Draft, Paused, website off, other project)", async () => {
  const db = siteDb();
  assert.equal((await getPublicListing(SITE, "sunny-two-bed", { db })).state, "live");
  assert.equal((await getPublicListing(SITE, "leased-one", { db })).state, "gone");
  assert.equal((await getPublicListing(SITE, "archived-one", { db })).state, "gone");
  for (const slug of ["draft-one", "paused-one", "web-off", "deleted-one", "nope", "../etc"]) assert.equal(await getPublicListing(SITE, slug, { db }), null, slug);
  const gone = await getPublicListing(SITE, "leased-one", { db });
  assert.deepEqual(Object.keys(gone.listing).sort(), ["bedrooms", "propertyId", "title"]);
  const other = { ...SITE, projectId: P2 };
  assert.equal((await getPublicListing(other, "sunny-two-bed", { db }))?.listing.title, "Other project's home", "each site sees only its own project");
  const crossed = siteDb({ listings: [listingRow({ project_id: P2, deleted_at: null })] });
  assert.equal(await getPublicListing(other, "sunny-two-bed", { db: crossed }), null, "a property of another project hides the listing");
  const avail = await publicPropertyAvailability(SITE, PROP, { db });
  assert.equal(avail.property.name, "Maple Court");
  assert.equal(avail.listings.length, 1);
  assert.equal(await publicPropertyAvailability(SITE, "not-a-uuid", { db }), null);
});

test("filters: parsed from the URL, bad values dropped, round-trip to a query", () => {
  const f = parseListingFilters(new URLSearchParams(`property=${PROP}&beds=2&maxRent=2500&moveInBy=2026-12-15&pets=1`));
  assert.deepEqual(f, { propertyId: PROP, beds: 2, maxRent: 2500, moveInBy: "2026-12-15", pets: true });
  assert.deepEqual(parseListingFilters({ beds: "x", maxRent: "-3", moveInBy: "soon", property: "nope" }), { propertyId: null, beds: null, maxRent: null, moveInBy: null, pets: false });
  assert.equal(filtersToQuery(f), `property=${PROP}&beds=2&maxRent=2500&moveInBy=2026-12-15&pets=1`);
  const l = serializePublicListing(listingRow(), { property: propertyRow(), today: TODAY });
  assert.ok(matchesListingFilters(l, f));
  assert.ok(!matchesListingFilters(l, { ...f, beds: 3 }));
  assert.ok(!matchesListingFilters(l, { ...f, maxRent: 2000 }));
  assert.ok(!matchesListingFilters(l, { ...f, moveInBy: "2026-11-20" }));
  const a = { slug: "a", property: { id: "x" }, bedrooms: 1 };
  const b = { slug: "b", property: { id: PROP }, bedrooms: 3 };
  assert.deepEqual(similarListings([a, b, l], { slug: l.slug, propertyId: PROP, bedrooms: 2 }).map((x) => x.slug), ["b", "a"]);
});

test("slugs and handles: lower-case words, reserved and taken names get a suffix", () => {
  assert.equal(slugify("Corner townhome — available next month!"), "corner-townhome-available-next-month");
  assert.equal(slugify("Café Déjà"), "cafe-deja");
  assert.equal(uniqueSlug("Embed"), "embed-home");
  assert.equal(uniqueSlug("A"), "a-home");
  assert.equal(uniqueSlug("Sunny two-bed", new Set(["sunny-two-bed", "sunny-two-bed-2"])), "sunny-two-bed-3");
  assert.ok(uniqueSlug("x".repeat(90)).length <= 60);
  assert.ok(isValidHandle("harbor-pine") && !isValidHandle("ab") && !isValidHandle("Harbor"));
  assert.equal(handleFrom("Harbor & Pine Residential"), "harbor-pine-residential");
});

test("proxy: only /l/<handle>/<slug> pages are checked for 410", () => {
  assert.deepEqual(listingPathParts("/l/maple-rentals/sunny-two-bed"), { handle: "maple-rentals", slug: "sunny-two-bed" });
  assert.deepEqual(listingPathParts("/property/l/maple-rentals/sunny-two-bed/"), { handle: "maple-rentals", slug: "sunny-two-bed" });
  for (const p of ["/l/maple-rentals", "/l/maple-rentals/embed", "/l/maple-rentals/sitemap.xml", "/l/maple-rentals/p", "/l/maple-rentals/a/gone", "/project/x/y", "/l/AB/x"]) {
    assert.equal(listingPathParts(p), null, p);
  }
});

test("public page card: the first reason a listing isn't public", () => {
  const site = { handle: "m", enabled: true };
  const live = { status: "Active", slug: "s" };
  assert.equal(publicPageStatus({ site, listing: live, websiteOn: true }).live, true);
  assert.equal(publicPageStatus({ site: null, listing: live, websiteOn: true }).fix, "settings");
  assert.equal(publicPageStatus({ site: { ...site, enabled: false }, listing: live, websiteOn: true }).fix, "settings");
  assert.equal(publicPageStatus({ site, listing: { ...live, status: "Paused" }, websiteOn: true }).fix, "publish");
  assert.equal(publicPageStatus({ site, listing: live, websiteOn: false }).fix, "syndication");
  assert.equal(publicPageStatus({ site, listing: live, websiteOn: true, propertyPublishes: false }).fix, "property");
  assert.equal(publicPageStatus({ site, listing: { status: "Active" }, websiteOn: true }).fix, "address");
  assert.match(publicPageStatus({ site, listing: { status: "Leased" }, websiteOn: true }).reason, /no longer available/);
  assert.equal(websiteChannelOn({ metadata: { syndication: { "Company website": true } } }), true, "legacy channel shape");
});

test("route map: every public page exists and calls its guard first", () => {
  for (const [file, { guard }] of Object.entries(PUBLIC_PAGES)) {
    const full = path.resolve("app", file);
    assert.ok(existsSync(full), `${file} exists`);
    assert.ok(readFileSync(full, "utf8").includes(`${guard}(`), `${file} calls ${guard}()`);
  }
});

test("qr: a version-6 code for a listing URL, with finder patterns in three corners", () => {
  const m = qrMatrix("https://geiger.studio/property/l/harbor-pine/three-bed-townhome-with-garage-and-private-yard");
  assert.equal(m.length, 41);
  for (const [x, y] of [[0, 0], [34, 0], [0, 34]]) assert.ok(m[y][x] && m[y + 6][x + 6] && !m[y + 1][x + 1] && m[y + 3][x + 3], `finder at ${x},${y}`);
  assert.equal(qrMatrix("a".repeat(300)), null);
});
