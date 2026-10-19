// People area — Property section (portfolios → units, amenities, floor plans,
// unit types), Marketing & Leads, Leasing, People (tenants, owners, vendors),
// record_items, team & portal access, and the company/branding/integrations/
// custom-fields settings. Patches the playground rows into the shapes the
// current screens read and adds rows so every status/kind/type option shows up.
// Id groups: 80 property section · 81 tenants/leases · 82 owners/vendors ·
// 83 marketing · 84 leasing · 85 record_items · 86 team/portal · 87 settings · 88 paused sends.
import { sid, daysFromNow as D, isoDaysFromNow as T } from "@/lib/sandbox/seed/ids";
import { PROPERTIES, BUILDINGS, UNITS, TENANTS, LEASES, OWNERS, VENDORS, PORTFOLIOS, UNIT_TYPES, FLOOR_PLANS } from "@/lib/sandbox/seed/core";

// --- helpers -------------------------------------------------------------------

let ctx;
const rows = (t) => ctx.rows(t);
const byId = (t, id) => ctx.byId(t, id);
const must = (t, id) => {
  const r = byId(t, id);
  if (!r) throw new Error(`people: ${t} ${id} not found`);
  return r;
};

// Shift a "YYYY-MM-DD" by n days / m months.
function shift(date, n) {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + n);
  return iso(d);
}
function addMonths(date, m) {
  const d = new Date(`${date}T00:00:00`);
  d.setMonth(d.getMonth() + m);
  return iso(d);
}
const pad = (v) => String(v).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const at = (date, hour = 10) => new Date(`${date}T${pad(hour)}:00:00`).toISOString();
// "Oct 12, 2026" — display dates stored in service logs / audit trails.
const human = (date) => new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const YEAR = Number(D(0).slice(0, 4));
const yearOf = (date) => date.slice(0, 4);

// Metadata list rows with stable ids.
const list = (prefix, items) => items.map((r, i) => ({ id: `${prefix}-${i + 1}`, ...r }));
const checks = (prefix, items) => list(prefix, items.map(([label, done]) => ({ label, done })));

// Custom-field ids are written into metadata keys (cf_<id>), which the remap
// doesn't touch — so they must not be sandbox-shaped ids.
const cfId = (n) => `c0f1e1d5-0000-4000-8000-${String(n).padStart(12, "0")}`;
const EXISTING_CF = "8205217e-8bb9-4fd2-a656-1aed2985a563";

// Fake, unclaimable auth ids for "active" portal members (no FK; never real users).
const fakeAuth = (n) => `0a17a000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const counter = (group, start = 1) => {
  let n = start;
  return () => sid(group, n++);
};

// --- core references -------------------------------------------------------------

const prop = (name) => PROPERTIES.find((p) => p.name === name);
const MARLOWE = prop("The Marlowe");
const PINECREST = prop("Pinecrest Commons");
const ALDER = prop("Alder Court Townhomes");
const BIRCHWOOD = prop("14 Birchwood Lane");
const CASCADE = prop("Cascade Lofts");
const [TOWER_A, TOWER_B, NORTH_BLDG, SOUTH_BLDG, LOFT_BLDG] = BUILDINGS;
const [DOWNTOWN, SUBURBAN] = PORTFOLIOS;
const [STUDIO, ONE_BED, TWO_BED, TOWNHOME, HOUSE] = UNIT_TYPES;
const [ALCOVE, ASPEN, BIRCH, CEDAR] = FLOOR_PLANS;
const [NORTHWIND, EVERGREEN_TRUST, ALDER_PARTNERS, REYES] = OWNERS;
const [RAINIER, BRIGHTLINE, EVERGREEN_HVAC, SUMMIT, CLEARVIEW, CASCADE_LAND] = VENDORS;

// Team members (sandbox group 68 + ours).
const M = {
  morgan: { id: sid(68, 1), name: "Morgan Ellis" },
  alex: { id: sid(68, 2), name: "Alex Rivera" },
  jordan: { id: sid(68, 3), name: "Jordan Lee" },
  dana: { id: sid(68, 4), name: "Dana Kowal" },
  carmen: { id: sid(68, 5), name: "Carmen Diaz" },
  tasha: { id: sid(68, 6), name: "Tasha Greene" },
  ben: { id: sid(68, 7), name: "Ben Alvarez" },
  riley: { id: sid(68, 8), name: "Riley Thompson" },
  samW: { id: sid(68, 9), name: "Sam Whitaker" },
  casey: { id: sid(86, 101), name: "Casey Nolan" },
  taylor: { id: sid(86, 102), name: "Taylor Brooks" },
  samO: { id: sid(86, 103), name: "Sam Ortiz" },
};
const email = (m) => `${m.name.toLowerCase().replace(/\s+/g, ".")}@harborpine.example`;

const COVER = (id) => `https://200rfrtp5x71tlmk.public.blob.vercel-storage.com/geiger-dash/cursor-assets/${id}.jpg`;
const IMG = [
  COVER("asset-00a586c62c8782e65c0a"),
  COVER("asset-0ec1f3ba625f482c9dc3"),
  COVER("asset-85923e7fafe00c9c0d1f"),
  COVER("asset-8e2e88cff7f33224ddd7"),
  COVER("asset-0a66efa21dd4b7e6c526"),
];

// Sandbox bank accounts (accounting seed, group 56) used as property banking defaults.
const BANK = {
  operating: { id: sid(56, 1), name: "Operating — Harbor Community Bank" },
  trust: { id: sid(56, 3), name: "Security deposits held" },
  reserve: { id: sid(56, 4), name: "Replacement reserve" },
  birchwood: { id: sid(56, 5), name: "Birchwood owner operating" },
};

// --- new property-section ids (group 80) --------------------------------------------

const PF = {
  commercial: sid(80, 1),
  pipeline: sid(80, 2),
  specialty: sid(80, 3),
  divested: sid(80, 4),
};

const NP = {
  greenwood: { id: sid(80, 101), name: "Greenwood Townhomes", address: "8420 Greenwood Ave N", city: "Seattle", state: "WA", zip: "98103", type: "Townhome", status: "Vacant", portfolioId: SUBURBAN.id, yearBuilt: 2026, cover: IMG[2], description: "Brand-new row of eight three-bedroom townhomes (phase one of two) a block from Greenwood's shops — in lease-up." },
  queenAnne: { id: sid(80, 102), name: "Queen Anne Commons", address: "520 W Galer St", city: "Seattle", state: "WA", zip: "98119", type: "HOA", status: "Active", portfolioId: DOWNTOWN.id, yearBuilt: 1979, cover: IMG[1], description: "42-home condominium association on the south slope of Queen Anne. We manage common areas, dues and vendors for the board." },
  pioneer: { id: sid(80, 103), name: "Pioneer Square Office Suites", address: "111 S Jackson St", city: "Seattle", state: "WA", zip: "98104", type: "Commercial", status: "Active", portfolioId: PF.commercial, yearBuilt: 1908, cover: IMG[4], description: "Restored brick office building with creative-office suites above ground-floor retail." },
  ballard: { id: sid(80, 104), name: "Ballard Mercantile", address: "5300 Ballard Ave NW", city: "Seattle", state: "WA", zip: "98107", type: "Mixed-use", status: "Draft", portfolioId: PF.commercial, yearBuilt: 1912, cover: IMG[3], description: "Historic mixed-use building — street-level retail bay with two apartments above. Onboarding ahead of the acquisition closing." },
  lakewood: { id: sid(80, 105), name: "Lakewood Senior Residences", address: "9120 Gravelly Lake Dr SW", city: "Lakewood", state: "WA", zip: "98499", type: "Senior living", status: "Inactive", portfolioId: PF.specialty, yearBuilt: 1995, cover: IMG[0], description: "55+ independent-living community. Management agreement ended — the owner moved operations in-house." },
  udistrict: { id: sid(80, 106), name: "U-District Student Lofts", address: "4535 Brooklyn Ave NE", city: "Seattle", state: "WA", zip: "98105", type: "Student housing", status: "Off-market", portfolioId: PF.specialty, yearBuilt: 1964, cover: IMG[1], description: "Four-bedroom student suites two blocks from campus. Off the market while the owner weighs a sale or full renovation." },
  ridgeview: { id: sid(80, 107), name: "Ridgeview Manufactured Home Community", address: "2400 Ridgeview Rd", city: "Puyallup", state: "WA", zip: "98374", type: "Manufactured housing", status: "Archived", portfolioId: PF.divested, yearBuilt: 1972, cover: IMG[2], description: "68-pad manufactured home community. Sold last spring; kept for history and owner reporting." },
};

const NB = {
  rowA: { id: sid(80, 201), name: "Row A", blockCode: "A", propertyId: NP.greenwood.id, floors: 3, yearBuilt: 2026, structure: "Townhome", status: "Active" },
  rowB: { id: sid(80, 202), name: "Row B", blockCode: "B", propertyId: NP.greenwood.id, floors: 3, yearBuilt: 2027, structure: "Townhome", status: "Under construction" },
  pioneer: { id: sid(80, 203), name: "Pioneer Building", blockCode: "P", propertyId: NP.pioneer.id, floors: 12, yearBuilt: 1908, structure: "High-rise", status: "Active" },
  mercantile: { id: sid(80, 204), name: "Mercantile Building", blockCode: "M", propertyId: NP.ballard.id, floors: 3, yearBuilt: 1912, structure: "Podium", status: "Draft" },
  lofts: { id: sid(80, 205), name: "Lofts Building", blockCode: "U", propertyId: NP.udistrict.id, floors: 4, yearBuilt: 1964, structure: "Low-rise", status: "Inactive" },
  clubhouse: { id: sid(80, 206), name: "Clubhouse", blockCode: "C", propertyId: NP.ridgeview.id, floors: 1, yearBuilt: 1972, structure: "Detached", status: "Archived" },
};

const NFP = {
  douglas: { id: sid(80, 301), name: "The Douglas", bedrooms: 3, bathrooms: 2.5, sqft: 1560, dimensions: "Three levels", propertyId: NP.greenwood.id, status: "Active", description: "Three-level townhome with a rooftop deck and tandem garage." },
  suite: { id: sid(80, 302), name: "Office suite — 2,400 sf", bedrooms: 0, bathrooms: 1, sqft: 2400, dimensions: "60' × 40'", propertyId: NP.pioneer.id, status: "Draft", description: "Open creative-office floor plate with two private offices and a kitchenette." },
  husky: { id: sid(80, 303), name: "The Husky (4-bed suite)", bedrooms: 4, bathrooms: 2, sqft: 1320, dimensions: "44' × 30'", propertyId: NP.udistrict.id, status: "Archived", description: "Four private bedrooms around a shared kitchen and lounge. Retired pending renovation." },
};

const NUT = {
  office: { id: sid(80, 401), name: "Office suite", bedrooms: 0, bathrooms: 1, sqft: 2400, marketRent: 6950, deposit: 13900, floorPlanId: NFP.suite.id, status: "Active", category: "Commercial" },
  student: { id: sid(80, 402), name: "Student 4-bed suite", bedrooms: 4, bathrooms: 2, sqft: 1320, marketRent: 3600, deposit: 3600, floorPlanId: NFP.husky.id, status: "Inactive", category: "4+ bedroom" },
  retail: { id: sid(80, 403), name: "Retail bay", bedrooms: 0, bathrooms: 1, sqft: 1800, marketRent: 4200, deposit: 8400, floorPlanId: null, status: "Draft", category: "Commercial" },
  greenwood: { id: sid(80, 404), name: "3 Bed Townhome — Greenwood", bedrooms: 3, bathrooms: 2.5, sqft: 1560, marketRent: 3495, deposit: 3495, floorPlanId: NFP.douglas.id, status: "Active", category: "Townhome" },
  parking: { id: sid(80, 405), name: "Reserved parking stall", bedrooms: 0, bathrooms: 0, sqft: 160, marketRent: 150, deposit: 0, floorPlanId: null, status: "Active", category: "Parking" },
  storage: { id: sid(80, 406), name: "Storage locker", bedrooms: 0, bathrooms: 0, sqft: 40, marketRent: 45, deposit: 0, floorPlanId: null, status: "Active", category: "Storage" },
};

const NA = {
  bike: { id: sid(80, 501), name: "Bike storage room", category: "Building", scope: "property", icon: "Bike", feeType: "none", feeAmount: 0, status: "Active", description: "Secure ground-floor room with wall racks and a repair stand." },
  lift: { id: sid(80, 502), name: "Accessible entry & platform lift", category: "Accessibility", scope: "property", icon: "Accessibility", feeType: "none", feeAmount: 0, status: "Draft", description: "Step-free Pine St entrance with a platform lift — part of the lobby renovation." },
  firepit: { id: sid(80, 503), name: "Courtyard fire pit", category: "Outdoor", scope: "property", icon: "Flame", feeType: "none", feeAmount: 0, status: "Closed", description: "Gas fire pit and lounge seating in the central courtyard." },
  business: { id: sid(80, 504), name: "Business centre", category: "Community", scope: "property", icon: "Briefcase", feeType: "none", feeAmount: 0, status: "Inactive", description: "Shared printer and two workstations off the lobby — retired after low use." },
};

// New units: [n, label, property, building, unit type, floor plan, floor, rent, status]
const NEW_UNIT_SPECS = [
  [801, "GW-1", NP.greenwood, NB.rowA, NUT.greenwood, NFP.douglas, "1–3", 3495, "Vacant"],
  [802, "GW-2", NP.greenwood, NB.rowA, NUT.greenwood, NFP.douglas, "1–3", 3495, "Vacant"],
  [803, "GW-3", NP.greenwood, NB.rowA, NUT.greenwood, NFP.douglas, "1–3", 3450, "Make-ready"],
  [804, "GW-4", NP.greenwood, NB.rowA, NUT.greenwood, NFP.douglas, "1–3", 3495, "Non-revenue"],
  [805, "Suite 200", NP.pioneer, NB.pioneer, NUT.office, NFP.suite, "2", 6950, "Occupied"],
  [806, "Suite 300", NP.pioneer, NB.pioneer, NUT.office, NFP.suite, "3", 6800, "Vacant"],
  [807, "R-1", NP.ballard, NB.mercantile, NUT.retail, null, "1", 4200, "Draft"],
  [808, "201", NP.ballard, NB.mercantile, ONE_BED, ASPEN, "2", 1950, "Draft"],
  [809, "202", NP.ballard, NB.mercantile, ONE_BED, ASPEN, "2", 1975, "Draft"],
  [810, "UD-1", NP.udistrict, NB.lofts, NUT.student, NFP.husky, "1", 3600, "Down"],
  [811, "UD-2", NP.udistrict, NB.lofts, NUT.student, NFP.husky, "2", 3600, "Down"],
];

const NEW_UNITS = NEW_UNIT_SPECS.map(([n, label, p, b, t, fp, floor, rent, status]) => ({
  id: sid(80, n), label, propertyId: p.id, propertyName: p.name, buildingId: b?.id ?? null, unitTypeId: t.id,
  floorPlanId: fp?.id ?? null, floor, bedrooms: t.bedrooms, bathrooms: t.bathrooms, sqft: t.sqft, rent,
  deposit: t.deposit, status, display: `${p.name} · ${label}`,
}));

// Every unit (sandbox + ours) by label.
const ALL_UNITS = [...UNITS, ...NEW_UNITS];
const unit = (label) => {
  const u = ALL_UNITS.find((x) => x.label === label);
  if (!u) throw new Error(`people: unit ${label}`);
  return u;
};
const allProps = () => [...PROPERTIES.map((p) => ({ id: p.id, name: p.name, state: p.state, city: p.city, address: p.address, zip: p.zip })), ...Object.values(NP)];
const propById = (id) => allProps().find((p) => p.id === id);

// --- custom field definitions (settings.custom_fields) ------------------------------

const CF = {
  neighborhood: EXISTING_CF,
  trashDay: cfId(1), roofInspection: cfId(2), bikeCapacity: cfId(3), councilEmail: cfId(4), taxAppeal: cfId(5), legacyMls: cfId(6),
  elevatorCert: cfId(10), boilerServiced: cfId(11),
  smartLock: cfId(20), keysIssued: cfId(21), windowCoverings: cfId(22),
  parkingPermit: cfId(30), accommodations: cfId(31), moveInGift: cfId(32),
  concession: cfId(40), guarantor: cfId(41), leaseSource: cfId(42),
  distributionNotes: cfId(50), ownerWebsite: cfId(51),
  dispatchLine: cfId(60), segments: cfId(61), agentEmail: cfId(62),
  warrantyClaim: cfId(70),
  heardAbout: cfId(80), relocation: cfId(81),
  tourDay: cfId(90), leadScore: cfId(91),
};
const cf = (key) => `cf_${CF[key]}`;
const def = (key, label, type, extra = {}) => ({ id: CF[key], type, label, active: true, required: false, ...extra });
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

const CUSTOM_FIELDS = {
  properties: [
    // Pre-existing project field — kept verbatim so the upsert doesn't drop it.
    { id: EXISTING_CF, type: "text", label: "Multi House Neighborhood", active: true, required: false },
    def("trashDay", "Trash pickup day", "select", { options: WEEKDAYS, group: "Operations" }),
    def("roofInspection", "Last roof inspection", "date", { group: "Operations" }),
    def("bikeCapacity", "Bike room capacity", "number", { group: "Operations" }),
    def("councilEmail", "Neighborhood council contact", "email", { group: "Community" }),
    def("taxAppeal", "Property tax appeal filed", "switch", { group: "Finance" }),
    def("legacyMls", "Legacy MLS #", "text", { active: false }),
  ],
  buildings: [
    def("elevatorCert", "Elevator certificate #", "text"),
    def("boilerServiced", "Boiler last serviced", "date"),
  ],
  units: [
    def("smartLock", "Smart lock serial", "text"),
    def("keysIssued", "Keys issued", "number"),
    def("windowCoverings", "Window coverings", "select", { options: ["Blinds", "Shades", "Curtains", "None"] }),
  ],
  tenants: [
    def("parkingPermit", "Parking permit #", "text"),
    def("accommodations", "Accessibility accommodations", "textarea"),
    def("moveInGift", "Move-in gift sent", "switch"),
  ],
  leases: [
    def("concession", "Move-in concession", "currency"),
    def("guarantor", "Guarantor on file", "text"),
    def("leaseSource", "Lease source", "select", { options: ["Website", "Referral", "Renewal", "Transfer", "Walk-in"], required: true }),
  ],
  owners: [
    def("distributionNotes", "Distribution notes", "textarea"),
    def("ownerWebsite", "Owner website", "url"),
  ],
  vendors: [
    def("dispatchLine", "Emergency dispatch line", "phone"),
    def("segments", "Service segments", "multiselect", { options: ["Residential", "Commercial", "Emergency", "Turnover"] }),
    def("agentEmail", "Insurance agent email", "email"),
  ],
  work_orders: [def("warrantyClaim", "Warranty claim #", "text")],
  applications: [
    def("heardAbout", "How did you hear about us?", "select", { options: ["Search engine", "Listing site", "Friend or family", "Drive-by", "Social media"] }),
    def("relocation", "Corporate relocation", "switch"),
  ],
  prospects: [
    def("tourDay", "Preferred tour day", "select", { options: ["Weekday", "Weekend", "Either"] }),
    def("leadScore", "Lead score", "number", { required: true }),
  ],
};

// =====================================================================================
// Property section
// =====================================================================================

const PORTFOLIO_META = {
  [DOWNTOWN.id]: {
    managerMemberId: M.alex.id, managerMemberName: M.alex.name, strategy: "Core-plus",
    ownershipEntity: "Northwind Holdings LLC", formedOn: D(-2900),
    targets: { targetOccupancyPct: 95, targetRentRoll: 34000, targetNoi: 285000, maxDelinquencyPct: 3, budgetYear: YEAR, fiscalYearStart: "1", reportingFrequency: "Monthly", reportDay: 10, reportRecipients: "rebecca.lin@northwind.example, finance@soundcapital.example", consolidatedStatements: true },
    internalNotes: "Downtown Core is mid-renovation at Cascade Lofts — expect occupancy below target until the lobby reopens.",
  },
  [SUBURBAN.id]: {
    managerMemberId: M.jordan.id, managerMemberName: M.jordan.name, strategy: "Value-add",
    ownershipEntity: "Mixed — family trusts & partnerships", formedOn: D(-2400),
    targets: { targetOccupancyPct: 96, targetRentRoll: 38000, targetNoi: 310000, maxDelinquencyPct: 2.5, budgetYear: YEAR, fiscalYearStart: "1", reportingFrequency: "Quarterly", reportDay: 15, reportRecipients: "awalsh@evergreentrust.example", consolidatedStatements: false },
  },
};

const NEW_PORTFOLIOS = [
  { id: PF.commercial, name: "Commercial & Mixed-Use", description: "Creative office and street-retail assets in Seattle's historic districts.", manager: M.dana.name, region: "Seattle, WA", color: "violet", status: "Active",
    metadata: { managerMemberId: M.dana.id, managerMemberName: M.dana.name, strategy: "Opportunistic", ownershipEntity: "Mercantile Street Partners LLC", formedOn: D(-420),
      targets: { targetOccupancyPct: 90, targetRentRoll: 18000, targetNoi: 150000, maxDelinquencyPct: 1, budgetYear: YEAR, fiscalYearStart: "7", reportingFrequency: "Quarterly", reportDay: 20, reportRecipients: "am@mercantilestreet.example", consolidatedStatements: true } } },
  { id: PF.pipeline, name: "Eastside Pipeline", description: "Acquisition targets under LOI on the Eastside — no properties transferred yet.", manager: M.morgan.name, region: "Bellevue & Redmond, WA", color: "sky", status: "Draft",
    metadata: { managerMemberId: M.morgan.id, managerMemberName: M.morgan.name, strategy: "Build-to-rent", formedOn: D(-30), internalNotes: "Two build-to-rent communities under LOI. Move them in once the owners sign management agreements.",
      targets: { targetOccupancyPct: 94, budgetYear: YEAR + 1, fiscalYearStart: "1", reportingFrequency: "Monthly", reportDay: 10, consolidatedStatements: false } } },
  { id: PF.specialty, name: "Specialty Housing", description: "Senior and student housing — currently winding down.", manager: M.jordan.name, region: "Puget Sound", color: "amber", status: "Inactive",
    metadata: { managerMemberId: M.jordan.id, managerMemberName: M.jordan.name, strategy: "Affordable", formedOn: D(-1800), internalNotes: "Lakewood went in-house and U-District is off-market. Keep for reporting until both are resolved." } },
  { id: PF.divested, name: "Divested Assets", description: "Sold properties kept for history and year-end owner reporting.", manager: M.carmen.name, region: "Pierce County, WA", color: "rose", status: "Archived",
    metadata: { managerMemberId: M.carmen.id, managerMemberName: M.carmen.name, strategy: "Core", archivedAt: D(-110), archiveReason: "Ridgeview sold — no active properties remain." } },
];

// Property detail metadata (Details flat keys + structured tabs).
const team = (manager, leasing, maint) => ({
  managerId: manager.id, managerIdName: manager.name,
  assistantManagerId: M.dana.id, assistantManagerIdName: M.dana.name,
  leasingAgentId: leasing.id, leasingAgentIdName: leasing.name,
  maintenanceLeadId: maint.id, maintenanceLeadIdName: maint.name,
  accountantId: M.carmen.id, accountantIdName: M.carmen.name,
});
const banking = (operating = BANK.operating, extra = {}) => ({
  operatingAccountId: operating.id, operatingAccountName: operating.name,
  depositAccountId: BANK.trust.id, depositAccountName: BANK.trust.name,
  reserveAccountId: BANK.reserve.id, reserveAccountName: BANK.reserve.name,
  separateTrust: true, accountingBasis: "Accrual", fiscalYearStart: "1", reserveAmount: 5000, reserveTarget: 60000,
  report1099: true, requireBillApproval: true, billApprovalAbove: 1500, ...extra,
});
const mgmt = (start, end, extra = {}) => ({
  agreementStart: start, agreementEnd: end, autoRenew: true, renewalTermMonths: 12, terminationNoticeDays: 60,
  earlyTerminationFee: 1500, signedOn: shift(start, -10), services: ["Leasing", "Rent collection", "Maintenance", "Accounting", "Inspections"],
  reportingFrequency: "Monthly", ...extra,
});

const PROPERTY_META = {
  [MARLOWE.id]: {
    propertyClass: "A", hasAssociation: false, county: "King", country: "United States", neighborhood: "Belltown", latitude: 47.6146, longitude: -122.3487,
    totalSqft: 61200, rentableSqft: 52800, lotSize: 0.62, lotSizeUnit: "acres", parcelNumber: "065900-0215", zoning: "DMR/C 85/65", floodZone: "X",
    taxAssessedValue: 21400000, annualPropertyTax: 198500, purchaseDate: D(-2900), purchasePrice: 16800000, currentValue: 24500000, valuationDate: D(-120),
    websiteUrl: "https://themarlowe.harborpine.example", phone: "(206) 555-0120", email: "marlowe@harborpine.example", timezone: "America/Los_Angeles",
    construction: { constructionType: "Concrete", stories: 6, foundation: "Basement", exterior: "Glass curtain wall", roofType: "Flat / membrane", roofYear: 2014, hvacType: "Split systems", heatingFuel: "Electric", waterHeater: "Central boiler", electricalAmps: 2000, plumbing: "PEX", elevators: 2, parkingSpaces: 64, parkingType: "Garage", lastRenovated: 2022, sprinklered: true, fireAlarm: true, adaAccessible: true, notes: "Tower B added in 2016; shared garage and loading dock." },
    marketing: { headline: "Belltown mid-rise living with a rooftop deck", marketingDescription: "Studios to two-bedrooms with in-unit laundry, a 24/7 fitness centre, rooftop grills and secured parking — a short walk to Pike Place and the waterfront.", virtualTourUrl: "", videoUrl: "", petPolicyText: "Cats and dogs welcome (2 max, 50 lb limit) — $350 one-time pet fee.", parkingInfo: "Reserved garage stalls $150/mo; EV charging $45/mo.", leasingOfficeHours: "Mon–Fri 9–6, Sat 10–4", leasingPhone: "(206) 555-0120", leasingEmail: "leasing.marlowe@harborpine.example", selfShowing: true, onlineApplications: true, publishVacancies: true, showingInstructions: "Self-guided tours use the lobby lockbox; agents meet guests at the Tower A concierge desk." },
    banking: banking(),
    rentSettings: { targetOccupancyPct: 95, marketRent: 2150, pricingStrategy: "Market-based", nextRentReview: D(40), concessions: "", rentControlled: false, affordableProgram: "None", acceptsVouchers: true, utilityBilling: "RUBS", rubsMethod: "By occupants", includedUtilities: ["Trash"] },
    management: mgmt(D(-2890), D(285), { signedBy: "Rebecca Lin, Northwind Holdings", services: ["Leasing", "Rent collection", "Maintenance", "Accounting", "Inspections", "Capital projects"], notes: "Fee steps down to 7% above 95% occupancy." }),
    contacts: { ...team(M.alex, M.tasha, M.ben), onSiteOffice: true, officeAddress: "Tower A lobby, suite 101", officePhone: "(206) 555-0120", officeEmail: "marlowe@harborpine.example", officeHours: "Mon–Fri 9–6", superintendentName: "Ben Alvarez", superintendentPhone: "(253) 555-0106", afterHoursPhone: "(206) 555-0199", emergencyInstructions: "Water: main shut-off is in the P1 mechanical room. Fire panel is behind the concierge desk. Call the after-hours line for anything urgent." },
    internalNotes: "Garage gate controller replaced in spring — keep the vendor warranty card in the office binder.",
    [cf("neighborhood")]: "Belltown", [cf("trashDay")]: "Tuesday", [cf("roofInspection")]: D(-150), [cf("bikeCapacity")]: 48, [cf("councilEmail")]: "belltown.council@mail.example", [cf("taxAppeal")]: false,
  },
  [PINECREST.id]: {
    propertyClass: "B", county: "Multnomah", country: "United States", neighborhood: "Richmond", latitude: 45.5048, longitude: -122.6153,
    totalSqft: 41500, rentableSqft: 38200, lotSize: 2.1, lotSizeUnit: "acres", parcelNumber: "R212345", zoning: "RM2", floodZone: "X",
    taxAssessedValue: 7900000, annualPropertyTax: 112400, purchaseDate: D(-3600), purchasePrice: 4950000, currentValue: 8900000, valuationDate: D(-200),
    websiteUrl: "https://pinecrest.harborpine.example", phone: "(503) 555-0130", email: "pinecrest@harborpine.example", timezone: "America/Los_Angeles",
    construction: { constructionType: "Wood frame", stories: 3, foundation: "Crawl space", exterior: "Siding", roofType: "Asphalt shingle", roofYear: 2012, hvacType: "Heat pump", heatingFuel: "Electric", waterHeater: "Individual tank", electricalAmps: 800, plumbing: "Copper", elevators: 0, parkingSpaces: 40, parkingType: "Surface lot", lastRenovated: 2019, sprinklered: false, fireAlarm: true, adaAccessible: false, notes: "North building gutters flagged for replacement next spring." },
    marketing: { headline: "Garden-style homes near Division St transit", marketingDescription: "Two-storey garden buildings around a shady courtyard, minutes from Division St restaurants and the FX2 bus line.", petPolicyText: "Up to 2 pets; dogs under 40 lb.", parkingInfo: "Open surface parking, covered stalls $75/mo.", leasingOfficeHours: "Tue–Sat 10–5", leasingPhone: "(503) 555-0130", leasingEmail: "leasing.pinecrest@harborpine.example", selfShowing: false, onlineApplications: true, publishVacancies: true, showingInstructions: "Meet at the South Building office. Keys in the lockbox by unit S-101." },
    banking: banking(BANK.operating, { accountingBasis: "Cash", requireBillApproval: false }),
    rentSettings: { targetOccupancyPct: 96, marketRent: 1950, pricingStrategy: "Fixed annual increase", annualIncreasePct: 3.5, nextRentReview: D(70), rentControlled: true, rentIncreaseCapPct: 9.2, rentRegistrationId: "OR-PDX-2026-11872", affordableProgram: "None", acceptsVouchers: true, utilityBilling: "Tenant pays provider", includedUtilities: ["Water", "Sewer", "Trash"] },
    management: mgmt(D(-3590), D(45), { autoRenew: false, signedBy: "Andrea Walsh, trustee", reportingFrequency: "Quarterly", notes: "Trust asked for a fee review before renewing — renewal draft sent." }),
    contacts: { ...team(M.jordan, M.riley, M.ben), onSiteOffice: true, officeAddress: "South Building, unit S-100", officePhone: "(503) 555-0130", officeEmail: "pinecrest@harborpine.example", officeHours: "Tue–Sat 10–5", afterHoursPhone: "(503) 555-0199", emergencyInstructions: "Gas shut-offs are on the east wall of each building." },
    [cf("neighborhood")]: "Richmond", [cf("trashDay")]: "Thursday", [cf("roofInspection")]: D(-21), [cf("bikeCapacity")]: 20, [cf("taxAppeal")]: true,
  },
  [ALDER.id]: {
    propertyClass: "B", county: "Pierce", country: "United States", neighborhood: "Proctor District", latitude: 47.2681, longitude: -122.4889,
    totalSqft: 6200, rentableSqft: 5920, lotSize: 0.9, lotSizeUnit: "acres", parcelNumber: "2780000214", zoning: "R-2", floodZone: "X",
    taxAssessedValue: 2650000, annualPropertyTax: 31800, purchaseDate: D(-2100), purchasePrice: 1950000, currentValue: 2900000, valuationDate: D(-90),
    phone: "(253) 555-0140", email: "aldercourt@harborpine.example", timezone: "America/Los_Angeles", hasAssociation: true,
    construction: { constructionType: "Wood frame", stories: 2, foundation: "Slab", exterior: "Siding", roofType: "Asphalt shingle", roofYear: 2008, hvacType: "Central air", heatingFuel: "Natural gas", waterHeater: "Tankless", electricalAmps: 200, plumbing: "PEX", elevators: 0, parkingSpaces: 8, parkingType: "Garage", sprinklered: false, fireAlarm: false, adaAccessible: false },
    marketing: { headline: "Three-bed townhomes with garages in Proctor", petPolicyText: "Dogs and cats welcome; fenced yards.", parkingInfo: "Private attached garage with every home.", leasingOfficeHours: "By appointment", leasingPhone: "(253) 555-0140", leasingEmail: "leasing.alder@harborpine.example", selfShowing: true, onlineApplications: true, publishVacancies: true },
    banking: banking(BANK.operating, { billApprovalAbove: 1000 }),
    rentSettings: { targetOccupancyPct: 100, marketRent: 3300, pricingStrategy: "Manual", affordableProgram: "None", acceptsVouchers: false, utilityBilling: "Tenant pays provider" },
    management: mgmt(D(-2090), D(520), { signedBy: "Alder Court Partners LP — finance", services: ["Leasing", "Rent collection", "Maintenance", "Accounting"] }),
    contacts: { ...team(M.jordan, M.tasha, M.ben), onSiteOffice: false, officePhone: "(253) 555-0140", afterHoursPhone: "(206) 555-0199" },
    association: { associationName: "Alder Court Townhome Association", managementCompany: "Harbor & Pine Residential", contactName: "Lena Ortiz", contactPhone: "(253) 555-0148", contactEmail: "board@aldercourthoa.example", duesAmount: 185, duesFrequency: "Monthly", duesPaidBy: "Owner", duesDueDay: 1, duesIncludes: ["Landscaping", "Exterior maintenance", "Insurance"], leaseApprovalRequired: false, minLeaseTermMonths: 6, rentalCap: "No cap" },
    [cf("neighborhood")]: "Proctor District", [cf("trashDay")]: "Monday", [cf("roofInspection")]: D(-400),
  },
  [BIRCHWOOD.id]: {
    propertyClass: "A", county: "King", country: "United States", neighborhood: "Lake Hills", latitude: 47.5981, longitude: -122.1446,
    totalSqft: 2350, rentableSqft: 2350, lotSize: 9800, lotSizeUnit: "sqft", parcelNumber: "4389201640", zoning: "R-5", floodZone: "X",
    taxAssessedValue: 1480000, annualPropertyTax: 12900, purchaseDate: D(-1500), purchasePrice: 1190000, currentValue: 1625000, valuationDate: D(-60),
    timezone: "America/Los_Angeles",
    construction: { constructionType: "Wood frame", stories: 2, foundation: "Crawl space", exterior: "Brick", roofType: "Asphalt shingle", roofYear: 2017, hvacType: "Central air", heatingFuel: "Natural gas", waterHeater: "Individual tank", electricalAmps: 200, plumbing: "Copper", parkingSpaces: 2, parkingType: "Garage", sprinklered: false, fireAlarm: false, adaAccessible: false },
    banking: banking(BANK.birchwood, { separateTrust: false, accountingBasis: "Cash", requireBillApproval: true, billApprovalAbove: 500 }),
    rentSettings: { targetOccupancyPct: 100, marketRent: 4200, pricingStrategy: "Manual", affordableProgram: "None", utilityBilling: "Tenant pays provider" },
    management: mgmt(D(-480), D(250), { signedBy: "Jonathan Reyes", earlyTerminationFee: 500, services: ["Leasing", "Rent collection", "Maintenance"] }),
    contacts: { ...team(M.jordan, M.tasha, M.ben), onSiteOffice: false, afterHoursPhone: "(206) 555-0199" },
    [cf("neighborhood")]: "Lake Hills", [cf("trashDay")]: "Wednesday",
  },
  [CASCADE.id]: {
    propertyClass: "B", county: "King", country: "United States", neighborhood: "Pioneer Square", latitude: 47.6012, longitude: -122.3344,
    totalSqft: 28400, rentableSqft: 24100, lotSize: 0.33, lotSizeUnit: "acres", parcelNumber: "093900-0410", zoning: "PSM 100/120-150", floodZone: "X",
    taxAssessedValue: 9100000, annualPropertyTax: 84600, purchaseDate: D(-899), purchasePrice: 7400000, currentValue: 9800000, valuationDate: D(-30),
    phone: "(206) 555-0125", email: "cascadelofts@harborpine.example", timezone: "America/Los_Angeles",
    construction: { constructionType: "Masonry", stories: 5, foundation: "Basement", exterior: "Brick", roofType: "Flat / membrane", roofYear: 2011, hvacType: "Boiler / radiators", heatingFuel: "District steam", waterHeater: "Central boiler", electricalAmps: 1200, plumbing: "Mixed", elevators: 1, parkingSpaces: 0, parkingType: "Street", lastRenovated: 2026, sprinklered: true, fireAlarm: true, adaAccessible: false, notes: "Lobby and façade renovation in progress (phase 2). Platform lift goes in with the Pine St entrance." },
    marketing: { headline: "Warehouse lofts with 12-foot ceilings", marketingDescription: "Converted 1920s warehouse lofts with exposed brick and timber beams, steps from Pike Place.", petPolicyText: "Cats only during renovation.", parkingInfo: "Street parking; monthly garage passes nearby.", leasingOfficeHours: "Mon–Fri 10–5", leasingPhone: "(206) 555-0125", leasingEmail: "leasing.cascade@harborpine.example", selfShowing: false, onlineApplications: true, publishVacancies: true, showingInstructions: "Use the Pine St side door while the main lobby is closed." },
    banking: banking(),
    rentSettings: { targetOccupancyPct: 85, marketRent: 2550, pricingStrategy: "Market-based", concessions: "First month 50% off during the lobby renovation", affordableProgram: "None", acceptsVouchers: true, utilityBilling: "Submetered", includedUtilities: ["Heat", "Water"] },
    management: mgmt(D(-880), D(-12), { autoRenew: true, signedBy: "Rebecca Lin, Northwind Holdings", services: ["Leasing", "Rent collection", "Maintenance", "Accounting", "Capital projects"] }),
    contacts: { ...team(M.alex, M.taylor, M.ben), onSiteOffice: false, officePhone: "(206) 555-0125", superintendentName: "Ben Alvarez", superintendentPhone: "(253) 555-0106", afterHoursPhone: "(206) 555-0199" },
    association: { associationName: "Cascade Lofts Condominium Association", managementCompany: "Harbor & Pine Residential", contactName: "Rebecca Lin", contactEmail: "board@cascadelofts.example", duesAmount: 420, duesFrequency: "Monthly", duesPaidBy: "Manager on owner's behalf", duesDueDay: 1, duesIncludes: ["Water", "Trash", "Insurance", "Exterior maintenance"], specialAssessment: 18500, specialAssessmentEnds: D(240), specialAssessmentNotes: "Façade restoration assessment billed quarterly through next summer.", leaseApprovalRequired: true, minLeaseTermMonths: 12, rentalCap: "40% of units" },
    internalNotes: "Contractor badge list is in the renovation binder. Noise window 9am–4pm.",
    [cf("neighborhood")]: "Pioneer Square", [cf("trashDay")]: "Friday", [cf("roofInspection")]: D(-700),
  },
  [NP.greenwood.id]: {
    propertyClass: "A", county: "King", country: "United States", neighborhood: "Greenwood", latitude: 47.6905, longitude: -122.3551,
    totalSqft: 12480, rentableSqft: 12480, lotSize: 0.48, lotSizeUnit: "acres", parcelNumber: "952810-0035", zoning: "LR2", floodZone: "X",
    purchaseDate: D(-60), purchasePrice: 9800000, currentValue: 10100000, valuationDate: D(-60), timezone: "America/Los_Angeles",
    construction: { constructionType: "Wood frame", stories: 3, foundation: "Slab", exterior: "Mixed", roofType: "Flat / membrane", roofYear: 2026, hvacType: "Heat pump", heatingFuel: "Electric", waterHeater: "Heat pump", electricalAmps: 200, plumbing: "PEX", parkingSpaces: 8, parkingType: "Garage", sprinklered: true, fireAlarm: true, adaAccessible: false, notes: "Phase two (Row B) framing now; certificate of occupancy expected in spring." },
    marketing: { headline: "Brand-new Greenwood townhomes with rooftop decks", marketingDescription: "Be the first to live in these three-level townhomes — tandem garage, rooftop deck, heat-pump HVAC and quartz kitchens.", petPolicyText: "Cats and dogs welcome.", parkingInfo: "Tandem garage included.", leasingOfficeHours: "Sat–Sun 11–4 (model home)", leasingPhone: "(206) 555-0128", leasingEmail: "leasing.greenwood@harborpine.example", selfShowing: true, onlineApplications: true, publishVacancies: true, showingInstructions: "Model home is GW-4; self-guided tours use the smart lock code sent 15 minutes before." },
    banking: banking(BANK.operating, { reserveAmount: 2500 }),
    rentSettings: { targetOccupancyPct: 95, marketRent: 3495, pricingStrategy: "Market-based", concessions: "Six weeks free on 13-month leases signed during lease-up", affordableProgram: "None", acceptsVouchers: false, utilityBilling: "Tenant pays provider" },
    management: mgmt(D(-75), D(1020), { signedBy: "Harriet Lim", services: ["Leasing", "Rent collection", "Maintenance", "Accounting", "HOA liaison"] }),
    contacts: { ...team(M.jordan, M.taylor, M.ben), onSiteOffice: false, officePhone: "(206) 555-0128" },
    association: { associationName: "Greenwood Row Owners", managementCompany: "Self-managed", duesAmount: 0, duesFrequency: "Annually", duesPaidBy: "Owner", leaseApprovalRequired: false },
    [cf("neighborhood")]: "Greenwood", [cf("trashDay")]: "Monday", [cf("bikeCapacity")]: 12,
  },
  [NP.queenAnne.id]: {
    propertyClass: "B", hasAssociation: true, county: "King", country: "United States", neighborhood: "Queen Anne", latitude: 47.6324, longitude: -122.3631,
    totalSqft: 48600, lotSize: 1.4, lotSizeUnit: "acres", parcelNumber: "387990-0005", zoning: "LR3", floodZone: "X", timezone: "America/Los_Angeles",
    construction: { constructionType: "Wood frame", stories: 4, foundation: "Basement", exterior: "Stucco", roofType: "Asphalt shingle", roofYear: 2015, hvacType: "Window units", heatingFuel: "Electric", waterHeater: "Individual tank", elevators: 1, parkingSpaces: 46, parkingType: "Covered", lastRenovated: 2015, sprinklered: true, fireAlarm: true, adaAccessible: true },
    banking: banking(BANK.operating, { accountingBasis: "Modified cash", report1099: false }),
    management: mgmt(D(-620), D(110), { signedBy: "Board president — Queen Anne Commons", services: ["Accounting", "Maintenance", "HOA liaison", "Inspections"], reportingFrequency: "Monthly" }),
    contacts: { ...team(M.alex, M.tasha, M.ben), onSiteOffice: false, afterHoursPhone: "(206) 555-0199" },
    association: { associationName: "Queen Anne Commons Owners Association", managementCompany: "Harbor & Pine Residential", contactName: "Nora Bishop", contactPhone: "(206) 555-0161", contactEmail: "board@queenannecommons.example", accountNumber: "QAC-0042", duesAmount: 465, duesFrequency: "Monthly", duesPaidBy: "Owner", duesDueDay: 1, duesIncludes: ["Water", "Trash", "Insurance", "Landscaping", "Exterior maintenance"], specialAssessment: 3200, specialAssessmentEnds: D(180), specialAssessmentNotes: "Elevator modernization — $3,200 per home in two installments.", leaseApprovalRequired: true, minLeaseTermMonths: 12, rentalCap: "25% of homes", boardContactName: "Nora Bishop", boardContactEmail: "board@queenannecommons.example" },
    internalNotes: "Annual meeting in January — budget draft due to the board by Dec 15.",
    [cf("neighborhood")]: "Queen Anne", [cf("trashDay")]: "Thursday",
  },
  [NP.pioneer.id]: {
    propertyClass: "B", county: "King", country: "United States", neighborhood: "Pioneer Square", latitude: 47.5993, longitude: -122.3326,
    totalSqft: 31200, rentableSqft: 26400, lotSize: 0.22, lotSizeUnit: "acres", parcelNumber: "524780-0820", zoning: "PSM 100/120-150", floodZone: "X",
    taxAssessedValue: 11200000, annualPropertyTax: 101800, purchaseDate: D(-415), purchasePrice: 10400000, currentValue: 11600000, valuationDate: D(-45),
    websiteUrl: "https://pioneeroffices.harborpine.example", phone: "(206) 555-0170", timezone: "America/Los_Angeles",
    construction: { constructionType: "Masonry", stories: 12, foundation: "Basement", exterior: "Brick", roofType: "Flat / membrane", roofYear: 2019, hvacType: "Boiler / radiators", heatingFuel: "District steam", waterHeater: "Central boiler", electricalAmps: 1600, plumbing: "Cast iron", elevators: 2, parkingSpaces: 0, parkingType: "Street", lastRenovated: 2019, sprinklered: true, fireAlarm: true, adaAccessible: true },
    marketing: { headline: "Creative office in a restored 1908 landmark", leasingPhone: "(206) 555-0170", leasingEmail: "office@harborpine.example", selfShowing: false, onlineApplications: false, publishVacancies: true },
    banking: banking(BANK.operating, { accountingBasis: "Accrual", fiscalYearStart: "7", billApprovalAbove: 2500 }),
    rentSettings: { targetOccupancyPct: 90, marketRent: 6900, pricingStrategy: "Market-based", affordableProgram: "None", utilityBilling: "Flat fee", utilityFlatFee: 250 },
    management: mgmt(D(-410), D(320), { signedBy: "Mercantile Street Partners LLC", services: ["Leasing", "Rent collection", "Maintenance", "Accounting", "Capital projects"], reportingFrequency: "Quarterly" }),
    contacts: { ...team(M.dana, M.taylor, M.ben), onSiteOffice: false, superintendentName: "Ben Alvarez", afterHoursPhone: "(206) 555-0199" },
    [cf("neighborhood")]: "Pioneer Square", [cf("trashDay")]: "Friday", [cf("taxAppeal")]: true,
  },
  [NP.ballard.id]: {
    propertyClass: "C", county: "King", country: "United States", neighborhood: "Ballard", latitude: 47.6681, longitude: -122.3845,
    totalSqft: 6100, rentableSqft: 5400, lotSize: 4100, lotSizeUnit: "sqft", parcelNumber: "276770-1245", zoning: "NC3P-65", floodZone: "X",
    purchasePrice: 3150000, timezone: "America/Los_Angeles",
    construction: { constructionType: "Masonry", stories: 3, foundation: "Basement", exterior: "Brick", roofType: "Flat / membrane", hvacType: "Split systems", heatingFuel: "Electric", plumbing: "Galvanized", parkingType: "Street", sprinklered: false, fireAlarm: true, notes: "Galvanized supply lines — budget a repipe in year one." },
    internalNotes: "Closing expected in ~3 weeks. Don't publish vacancies until the owner signs the management agreement.",
    [cf("neighborhood")]: "Ballard",
  },
  [NP.lakewood.id]: {
    propertyClass: "B", county: "Pierce", country: "United States", neighborhood: "Lakewood", timezone: "America/Los_Angeles",
    management: mgmt(D(-2200), D(-45), { autoRenew: false, signedBy: "Lakewood Senior Living Inc.", notes: "Owner moved management in-house; final statement issued." }),
    internalNotes: "Management ended — final owner statement and deposit ledger handed over.",
  },
  [NP.udistrict.id]: {
    propertyClass: "C", county: "King", country: "United States", neighborhood: "University District", timezone: "America/Los_Angeles",
    construction: { constructionType: "Wood frame", stories: 4, foundation: "Basement", exterior: "Brick", roofType: "Flat / membrane", roofYear: 1998, hvacType: "Boiler / radiators", heatingFuel: "Natural gas", waterHeater: "Central boiler", plumbing: "Galvanized", elevators: 0, parkingType: "Street", sprinklered: false, fireAlarm: true },
    banking: banking(BANK.operating, { requireBillApproval: true, billApprovalAbove: 250 }),
    management: mgmt(D(-1460), D(200), { signedBy: "Husky Housing Trust", services: ["Leasing", "Rent collection", "Maintenance", "Accounting"] }),
    contacts: { ...team(M.jordan, M.tasha, M.ben) },
    internalNotes: "Off-market pending the trust's sale decision. Both suites taken offline for asbestos abatement.",
    [cf("neighborhood")]: "University District",
  },
  [NP.ridgeview.id]: {
    county: "Pierce", country: "United States", neighborhood: "South Hill", timezone: "America/Los_Angeles",
    archivedAt: D(-110), archiveReason: "Property sold — management ended at closing.",
    management: mgmt(D(-2500), D(-120), { autoRenew: false, signedBy: "Ridgeview Communities LLC" }),
  },
};

// Building detail metadata (flat keys + construction tab).
const BUILDING_META = {
  [TOWER_A.id]: { streetAddress: "1200 Harbor Ave", grossSqft: 38400, footprintSqft: 6400, basementLevels: 2, entrances: 3, mailroom: true, laundryRoom: false, accessNotes: "Fob entry at the lobby and garage; deliveries via the Harbor Ave loading dock.", coverUrl: IMG[0], construction: { constructionType: "Concrete", stories: 6, foundation: "Basement", exterior: "Glass curtain wall", roofType: "Flat / membrane", roofYear: 2014, hvacType: "Split systems", heatingFuel: "Electric", elevators: 2, sprinklered: true, fireAlarm: true, adaAccessible: true }, internalNotes: "Elevator 2 door operator replaced last year — under warranty until spring.", [cf("elevatorCert")]: "ELV-58821-A", [cf("boilerServiced")]: D(-95) },
  [TOWER_B.id]: { streetAddress: "1210 Harbor Ave", grossSqft: 22800, footprintSqft: 5700, basementLevels: 1, entrances: 2, mailroom: false, laundryRoom: false, accessNotes: "Shares the Tower A garage; residents collect packages in the Tower A mailroom.", coverUrl: IMG[3], construction: { constructionType: "Concrete", stories: 4, foundation: "Basement", exterior: "Mixed", roofType: "Flat / membrane", roofYear: 2016, hvacType: "Split systems", elevators: 1, sprinklered: true, fireAlarm: true, adaAccessible: true }, [cf("elevatorCert")]: "ELV-58821-B" },
  [NORTH_BLDG.id]: { streetAddress: "4410 SE Division St (North)", grossSqft: 20500, footprintSqft: 6800, basementLevels: 0, entrances: 2, mailroom: true, laundryRoom: true, accessNotes: "Laundry room key is the unit key.", construction: { constructionType: "Wood frame", stories: 3, foundation: "Crawl space", exterior: "Siding", roofType: "Asphalt shingle", roofYear: 2012, hvacType: "Heat pump" } },
  [SOUTH_BLDG.id]: { streetAddress: "4410 SE Division St (South)", grossSqft: 21000, footprintSqft: 7000, basementLevels: 0, entrances: 2, mailroom: false, laundryRoom: true, construction: { constructionType: "Wood frame", stories: 3, foundation: "Crawl space", exterior: "Siding", roofType: "Asphalt shingle", roofYear: 2012, hvacType: "Heat pump" }, internalNotes: "S-201 offline after the supply-line leak." },
  [LOFT_BLDG.id]: { streetAddress: "310 Pine St", grossSqft: 28400, footprintSqft: 5680, basementLevels: 1, entrances: 2, mailroom: true, laundryRoom: true, accessNotes: "Main lobby closed for phase 2 — use the Pine St side door. Temporary package lockers by the freight elevator.", coverUrl: IMG[4], construction: { constructionType: "Masonry", stories: 5, foundation: "Basement", exterior: "Brick", roofType: "Flat / membrane", roofYear: 2011, hvacType: "Boiler / radiators", heatingFuel: "District steam", elevators: 1, sprinklered: true, fireAlarm: true, adaAccessible: false }, [cf("boilerServiced")]: D(-40) },
  [NB.rowA.id]: { streetAddress: "8420–8434 Greenwood Ave N", grossSqft: 6240, footprintSqft: 2080, basementLevels: 0, entrances: 4, mailroom: false, laundryRoom: false, coverUrl: IMG[2], construction: { constructionType: "Wood frame", stories: 3, foundation: "Slab", exterior: "Mixed", roofType: "Flat / membrane", roofYear: 2026, hvacType: "Heat pump", sprinklered: true, fireAlarm: true } },
  [NB.rowB.id]: { streetAddress: "8440–8454 Greenwood Ave N", grossSqft: 6240, footprintSqft: 2080, entrances: 4, accessNotes: "Active construction site — hard hats required past the fence.", construction: { constructionType: "Wood frame", stories: 3, foundation: "Slab", roofType: "Flat / membrane", hvacType: "Heat pump" }, internalNotes: "Framing inspection passed; drywall starts next month." },
  [NB.pioneer.id]: { streetAddress: "111 S Jackson St", grossSqft: 31200, footprintSqft: 2600, basementLevels: 1, entrances: 2, mailroom: true, laundryRoom: false, accessNotes: "Tenant badges for after-hours entry; freight elevator by reservation.", coverUrl: IMG[4], construction: { constructionType: "Masonry", stories: 12, foundation: "Basement", exterior: "Brick", roofType: "Flat / membrane", hvacType: "Boiler / radiators", heatingFuel: "District steam", elevators: 2, sprinklered: true, fireAlarm: true, adaAccessible: true }, [cf("elevatorCert")]: "ELV-60417-P" },
  [NB.mercantile.id]: { streetAddress: "5300 Ballard Ave NW", grossSqft: 6100, footprintSqft: 2030, basementLevels: 1, entrances: 2, construction: { constructionType: "Masonry", stories: 3, exterior: "Brick", roofType: "Flat / membrane" } },
  [NB.lofts.id]: { streetAddress: "4535 Brooklyn Ave NE", grossSqft: 5280, footprintSqft: 1320, basementLevels: 1, entrances: 1, laundryRoom: true, accessNotes: "Building secured during abatement — contractor access only.", construction: { constructionType: "Wood frame", stories: 4, foundation: "Basement", exterior: "Brick", hvacType: "Boiler / radiators" } },
  [NB.clubhouse.id]: { streetAddress: "2400 Ridgeview Rd", grossSqft: 2400, footprintSqft: 2400, entrances: 2, laundryRoom: true, archivedAt: D(-110), archiveReason: "Community sold." },
};

const FLOOR_PLAN_META = {
  [ALCOVE.id]: { planCode: "S1", layoutStyle: "Open concept", levels: 1, outdoorSqft: 0, ceilingHeight: "9'", startingRent: 1495, maxRent: 1550, deposit: 1000, pricingNotes: "Premium for 5th-floor and above.", features: ["Dishwasher", "In-unit washer/dryer", "Stainless appliances"], accessible: true, hasDen: false, outdoorSpace: "None", showOnWebsite: true, marketingTitle: "The Alcove — studio with sleeping nook", marketingDescription: "An efficient studio with a separate sleeping alcove and full-size kitchen.", planNotes: "Murphy-bed option available on request." },
  [ASPEN.id]: { planCode: "A1", layoutStyle: "Galley", levels: 1, outdoorSqft: 60, ceilingHeight: "9'", startingRent: 1850, maxRent: 1950, deposit: 1500, specials: "", features: ["Dishwasher", "In-unit washer/dryer", "Balcony / patio"], accessible: false, hasDen: false, outdoorSpace: "Balcony", showOnWebsite: true, marketingTitle: "The Aspen — one bedroom with balcony", marketingDescription: "Galley kitchen, generous bedroom and a private balcony." },
  [BIRCH.id]: { planCode: "B2", layoutStyle: "Split bedroom", levels: 1, outdoorSqft: 80, ceilingHeight: "9'", startingRent: 1995, maxRent: 2650, deposit: 2000, pricingNotes: "Pinecrest versions price lower than The Marlowe.", features: ["Dishwasher", "In-unit washer/dryer", "Walk-in closets", "Balcony / patio"], accessible: false, hasDen: false, outdoorSpace: "Balcony", showOnWebsite: true, marketingTitle: "The Birch — split two-bedroom", marketingDescription: "Bedrooms on opposite sides for privacy, with an ensuite primary." },
  [CEDAR.id]: { planCode: "T3", layoutStyle: "Townhome", levels: 2, outdoorSqft: 400, ceilingHeight: "8'6\"", startingRent: 3200, maxRent: 3395, deposit: 3000, features: ["Garage parking", "Fenced yard", "In-unit washer/dryer", "Dishwasher"], accessible: false, hasDen: false, outdoorSpace: "Yard", showOnWebsite: true, marketingTitle: "The Cedar — two-level townhome", marketingDescription: "Attached garage, fenced yard and three bedrooms upstairs." },
  [NFP.douglas.id]: { planCode: "G3", layoutStyle: "Townhome", levels: 3, outdoorSqft: 220, ceilingHeight: "9'", startingRent: 3450, maxRent: 3595, deposit: 3495, specials: "Six weeks free on 13-month leases", features: ["Air conditioning", "Dishwasher", "In-unit washer/dryer", "Garage parking", "Smart thermostat", "Stainless appliances"], accessible: false, hasDen: true, outdoorSpace: "Terrace", showOnWebsite: true, marketingTitle: "The Douglas — three levels with a rooftop deck", marketingDescription: "Open main floor, three bedrooms up, flex den and a private rooftop deck." },
  [NFP.suite.id]: { planCode: "OF-24", layoutStyle: "Open concept", levels: 1, ceilingHeight: "13'", startingRent: 6800, maxRent: 7200, deposit: 13900, features: ["Air conditioning", "High ceilings"], accessible: true, showOnWebsite: false, planNotes: "Drawing pending from the architect — measured plans due next month." },
  [NFP.husky.id]: { planCode: "U4", layoutStyle: "Split bedroom", levels: 1, ceilingHeight: "8'", startingRent: 3400, maxRent: 3600, deposit: 3600, features: ["Dishwasher"], accessible: false, outdoorSpace: "None", showOnWebsite: false, planNotes: "Retired — layout will change in the renovation." },
};

const UNIT_TYPE_META = {
  [STUDIO.id]: { code: "STU", category: "Studio", halfBaths: 0, maxOccupancy: 2, sqftRange: "450–500", rentMin: 1495, rentMax: 1550, pricingStrategy: "Range by unit", leaseTerms: ["6 months", "12 months", "18 months"], applicationFee: 50, petRent: 35, furnishedPremium: 300, features: ["Dishwasher", "In-unit washer/dryer", "Stainless appliances"], utilitiesIncluded: ["Trash"], laundry: "In-unit", petPolicy: "Cats & dogs", accessible: true, furnishedAvailable: true, showOnWebsite: true, marketingTitle: "Downtown studios", marketingDescription: "Efficient studios with sleeping alcoves.", highlights: "Sleeping alcove\nIn-unit laundry\nRooftop deck access", defaultCharges: [{ id: "dc-stu-1", label: "Trash & recycling", amount: 25 }], typeNotes: "" },
  [ONE_BED.id]: { code: "1B1B", category: "1 bedroom", halfBaths: 0, maxOccupancy: 3, sqftRange: "680–720", rentMin: 1550, rentMax: 2100, pricingStrategy: "Range by unit", leaseTerms: ["6 months", "12 months", "18 months"], applicationFee: 50, petRent: 35, features: ["Dishwasher", "Balcony / patio"], utilitiesIncluded: ["Trash"], laundry: "In-unit", petPolicy: "Cats & dogs", accessible: false, furnishedAvailable: false, showOnWebsite: true, marketingTitle: "One-bedroom homes", highlights: "Private balcony\nGalley kitchen", defaultCharges: [{ id: "dc-1b-1", label: "Trash & recycling", amount: 25 }] },
  [TWO_BED.id]: { code: "2B2B", category: "2 bedroom", halfBaths: 0, maxOccupancy: 5, sqftRange: "920–1,010", rentMin: 1995, rentMax: 2850, pricingStrategy: "Range by unit", leaseTerms: ["12 months", "18 months", "24 months"], applicationFee: 50, petRent: 35, features: ["Dishwasher", "In-unit washer/dryer", "Walk-in closets"], utilitiesIncluded: ["Trash"], laundry: "In-unit", petPolicy: "Cats & dogs", showOnWebsite: true, marketingTitle: "Two-bedroom, two-bath homes", highlights: "Ensuite primary\nSplit bedrooms", defaultCharges: [{ id: "dc-2b-1", label: "Trash & recycling", amount: 25 }, { id: "dc-2b-2", label: "Water/sewer (RUBS)", amount: 65 }] },
  [TOWNHOME.id]: { code: "TH3", category: "Townhome", halfBaths: 1, maxOccupancy: 6, sqftRange: "1,450–1,500", rentMin: 3200, rentMax: 3395, pricingStrategy: "Fixed", leaseTerms: ["12 months", "18 months"], applicationFee: 50, petRent: 45, features: ["Garage parking", "Fenced yard", "In-unit washer/dryer"], laundry: "In-unit", petPolicy: "Cats & dogs", showOnWebsite: true, marketingTitle: "Three-bed townhomes", highlights: "Attached garage\nFenced yard", defaultCharges: [] },
  [HOUSE.id]: { code: "SFH4", category: "4+ bedroom", halfBaths: 1, maxOccupancy: 8, sqftRange: "2,350", rentMin: 4200, rentMax: 4200, pricingStrategy: "Manually revenue-managed", leaseTerms: ["12 months", "24 months"], applicationFee: 50, petRent: 50, features: ["Fireplace", "Hardwood floors", "Garage parking", "Fenced yard"], laundry: "Hookups", petPolicy: "Case by case", showOnWebsite: false, typeNotes: "Tenant handles yard care and furnace filters." },
  [NUT.office.id]: { code: "OFC", category: "Commercial", maxOccupancy: 20, sqftRange: "2,200–2,600", rentMin: 6600, rentMax: 7200, pricingStrategy: "Manually revenue-managed", leaseTerms: ["24 months"], features: ["Air conditioning", "High ceilings"], utilitiesIncluded: ["Water", "Heat"], laundry: "None", petPolicy: "No pets", showOnWebsite: false, typeNotes: "Quoted as $/sf/yr on NNN terms; CAM billed separately." },
  [NUT.student.id]: { code: "STU4", category: "4+ bedroom", maxOccupancy: 4, sqftRange: "1,320", rentMin: 3400, rentMax: 3600, pricingStrategy: "Fixed", leaseTerms: ["9 months", "12 months"], laundry: "Shared on site", petPolicy: "No pets", furnishedAvailable: true, showOnWebsite: false, typeNotes: "Retired while the building is off-market." },
  [NUT.retail.id]: { code: "RTL", category: "Commercial", sqftRange: "1,800", rentMin: 4000, rentMax: 4400, pricingStrategy: "Manually revenue-managed", leaseTerms: ["24 months"], petPolicy: "No pets", showOnWebsite: false, typeNotes: "Draft — waiting on the closing to set asking rent." },
  [NUT.greenwood.id]: { code: "GW3", category: "Townhome", halfBaths: 1, maxOccupancy: 6, sqftRange: "1,560", rentMin: 3450, rentMax: 3595, pricingStrategy: "Range by unit", leaseTerms: ["Month-to-month", "12 months", "18 months"], applicationFee: 50, petRent: 45, furnishedPremium: 650, concessionNote: "Six weeks free on 13-month leases during lease-up.", features: ["Air conditioning", "Dishwasher", "In-unit washer/dryer", "Garage parking", "Smart thermostat"], laundry: "In-unit", petPolicy: "Cats & dogs", accessible: false, furnishedAvailable: true, showOnWebsite: true, marketingTitle: "New-build Greenwood townhomes", marketingDescription: "Three levels, rooftop deck, tandem garage.", highlights: "Rooftop deck\nTandem garage\nHeat-pump HVAC", videoUrl: "", defaultCharges: [{ id: "dc-gw-1", label: "Utility admin fee", amount: 15 }] },
  [NUT.parking.id]: { code: "PRK", category: "Parking", rentMin: 150, rentMax: 150, pricingStrategy: "Fixed", leaseTerms: ["Month-to-month"], typeNotes: "Add-on stalls in The Marlowe garage." },
  [NUT.storage.id]: { code: "STG", category: "Storage", rentMin: 45, rentMax: 65, pricingStrategy: "Fixed", leaseTerms: ["Month-to-month"], typeNotes: "Basement cages in Tower A." },
};

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const hours = (from, to, closed = []) => Object.fromEntries(DAYS.map((d) => [d, { open: !closed.includes(d), from, to }]));

const AMENITY_META = {
  [sid(7, 1)]: { location: "Tower A, level 2", contact: "Front desk", highlight: true, accessible: true, accessMethod: "Key fob", vendorName: "Evergreen HVAC Services", serviceFrequency: "Quarterly", lastServicedOn: D(-40), nextServiceDue: D(50), monthlyCost: 220, insuranceRequired: false, waiverText: "Use at your own risk. Residents 16+ only.", bookable: false, openHours: hours("05:00", "23:00") },
  [sid(7, 2)]: { location: "Tower A roof", contact: "Front desk", highlight: true, accessible: true, accessMethod: "Key fob", serviceFrequency: "Monthly", lastServicedOn: D(-6), nextServiceDue: D(24), monthlyCost: 180, insuranceRequired: false, closures: [{ id: "cl-roof-1", label: "Furniture replacement", date: D(-20) }], bookable: true, approvalRequired: true, bookingFee: 75, bookingDeposit: 200, capacity: 1, openHours: hours("09:00", "22:00"), slotMinutes: 60, maxDurationMinutes: 240, maxAdvanceDays: 60, minNoticeHours: 48, maxPerMonth: 2, maxOccupancy: 30, cancelHours: 72, guestsAllowed: true, guestLimit: 20, rulesText: "Quiet hours after 10pm. Grills must be cleaned after use. No glass on the deck.", amenityNotes: "Reopened with new furniture and grills." },
  [sid(7, 3)]: { location: "In unit", accessible: false, accessMethod: "Open", serviceFrequency: "As needed", bookable: false },
  [sid(7, 4)]: { location: "P1–P2 garage", contact: "Leasing office", accessMethod: "Key fob", vendorName: "", serviceFrequency: "Annually", monthlyCost: 0, bookable: false },
  [sid(7, 5)]: { location: "Tower B garage, P1", contact: "Leasing office", accessMethod: "Smart lock", vendorName: "Brightline Electric", serviceFrequency: "Annually", lastServicedOn: D(-200), nextServiceDue: D(165), monthlyCost: 60, bookable: true, approvalRequired: false, bookingFee: 0, bookingDeposit: 0, capacity: 4, openHours: hours("00:00", "23:59"), slotMinutes: 60, maxDurationMinutes: 240, maxAdvanceDays: 7, minNoticeHours: 1, maxPerMonth: 20 },
  [sid(7, 6)]: { location: "Lobby, both towers", accessMethod: "Code", vendorName: "", serviceFrequency: "Annually", bookable: false, operationsNotes: "Locker codes reset through the vendor portal." },
  [sid(7, 7)]: { location: "Tower B, level 1", accessMethod: "Key fob", serviceFrequency: "Weekly", monthlyCost: 40, waiverText: "Clean the station after each use.", bookable: true, approvalRequired: false, bookingFee: 0, capacity: 1, openHours: hours("07:00", "21:00"), slotMinutes: 30, maxDurationMinutes: 60, maxAdvanceDays: 14, minNoticeHours: 2, maxPerMonth: 8 },
  [NA.bike.id]: { location: "Tower A, ground floor", accessMethod: "Key fob", highlight: false, accessible: true, serviceFrequency: "As needed", bookable: false },
  [NA.lift.id]: { location: "Pine St entrance", accessMethod: "Open", accessible: true, vendorName: "Emerald City Elevator", serviceFrequency: "Quarterly", insuranceRequired: false, operationsNotes: "Installs with the phase 2 lobby work; state elevator permit pending.", bookable: false },
  [NA.firepit.id]: { location: "Courtyard", accessMethod: "Open", serviceFrequency: "Monthly", monthlyCost: 35, closures: [{ id: "cl-fire-1", label: "County burn ban", date: D(-9) }], bookable: false, amenityNotes: "Closed until the burn ban lifts." },
  [NA.business.id]: { location: "Lobby, suite 104", accessMethod: "Staff unlock", serviceFrequency: "As needed", bookable: false, amenityNotes: "Retired — space converted to a package room." },
};

// Unit metadata, by status and type.
const MAILBOX = (u) => u.label.replace(/[^0-9A-Z]/gi, "");
function unitMeta(u, extra = {}) {
  const prop = propById(u.propertyId) || {};
  const isTH = u.unitTypeId === TOWNHOME.id || u.unitTypeId === NUT.greenwood.id;
  const isHouse = u.unitTypeId === HOUSE.id;
  const isOffice = u.unitTypeId === NUT.office.id || u.unitTypeId === NUT.retail.id;
  const isLoft = u.propertyId === CASCADE.id;
  const occupied = ["Occupied", "Notice"].includes(u.status);
  const layoutType = u.bedrooms === 0 && !isOffice ? "Studio" : isHouse ? "Single-family" : isTH ? "Townhouse" : isLoft ? "Loft" : "Flat";
  const features = isOffice
    ? ["Air conditioning", "High ceilings"]
    : isHouse
      ? ["Fireplace", "Hardwood floors", "Garage parking", "Fenced yard", "W/D hookups"]
      : isTH
        ? ["Air conditioning", "Dishwasher", "In-unit washer/dryer", "Garage parking", "Fenced yard", "Smart thermostat"]
        : ["Dishwasher", "In-unit washer/dryer", "Stainless appliances", ...(isLoft ? ["High ceilings", "Hardwood floors"] : ["Balcony / patio"])];
  return {
    unitAddress: `${prop.address || ""}, ${isHouse ? "" : `Unit ${u.label}, `}${prop.city || ""}, ${prop.state || ""} ${prop.zip || ""}`.replace(", ,", ","),
    halfBaths: u.bathrooms % 1 ? 1 : 0,
    maxOccupancy: isOffice ? 20 : u.bedrooms * 2 + 1,
    layoutType,
    exposure: ["North", "South", "East", "West", "Corner"][u.label.length % 5],
    view: isOffice ? "Street" : isLoft ? "City" : u.propertyId === PINECREST.id ? "Courtyard" : isTH || isHouse ? "Garden" : u.floor >= "3" ? "Water" : "City",
    accessible: u.floor === "1" && !isTH,
    features,
    utilitiesIncluded: isOffice ? ["Water", "Heat"] : isLoft ? ["Heat", "Water"] : u.propertyId === PINECREST.id ? ["Water", "Sewer", "Trash"] : ["Trash"],
    laundry: isOffice ? "None" : isHouse ? "Hookups" : "In-unit",
    heating: isLoft || isOffice ? "Radiator" : u.propertyId === PINECREST.id || u.unitTypeId === NUT.greenwood.id ? "Heat pump" : "Forced air",
    cooling: isLoft ? "Window units" : isHouse || isTH ? "Central air" : "Mini-split",
    flooring: isLoft || isHouse ? "Hardwood" : isOffice ? "Mixed" : "LVP",
    petPolicy: isOffice ? "No pets" : isLoft ? "Cats only" : isHouse ? "Case by case" : "Cats & dogs",
    smokingAllowed: false,
    parking: isHouse || isTH ? "Garage" : u.propertyId === MARLOWE.id ? "1 space" : "Street",
    parkingSpace: u.propertyId === MARLOWE.id ? `P-${10 + (u.label.charCodeAt(2) || 0) % 40}` : "",
    storageUnit: u.propertyId === MARLOWE.id ? `S-${u.label.replace("-", "")}` : "",
    mailboxNumber: MAILBOX(u),
    permissionToEnter: occupied ? "Call first" : "Always",
    petOnSite: false,
    entryInstructions: occupied ? "Text the resident 24 hours ahead; leave a door tag after entry." : "Unit is vacant — key in the office lockbox.",
    vendorEntryInstructions: "Check in at the leasing office for the vendor fob.",
    lockboxCode: occupied ? "" : "4417",
    lockboxLocation: occupied ? "" : "Office key cabinet, hook " + MAILBOX(u),
    gateCode: u.propertyId === PINECREST.id ? "#2580" : "",
    smartLockDevice: u.unitTypeId === NUT.greenwood.id || u.propertyId === MARLOWE.id ? "Latch R" : "",
    paintColor: isLoft ? "SW 7005 Pure White" : "SW 7029 Agreeable Gray",
    paintFinish: "Eggshell",
    lastPaintedOn: D(-300 - (u.label.length * 37) % 400),
    lastFlooringOn: D(-900),
    hvacFilterSize: isTH || isHouse ? "16x25x1" : "14x20x1",
    hvacFilterChangedOn: D(-50),
    waterShutoff: isTH || isHouse ? "Garage, left of the water heater" : "Under the kitchen sink",
    breakerPanel: isTH || isHouse ? "Garage wall" : "Hall closet",
    smokeTestedOn: D(-120),
    inspectionTemplate: isOffice ? "Commercial walkthrough" : "Standard residential",
    nextInspectionDue: D(60 + (u.label.length * 13) % 120),
    minRent: Math.round(u.rent * 0.97 / 5) * 5,
    maxRent: Math.round(u.rent * 1.05 / 5) * 5,
    leaseTerms: isOffice ? ["24 months"] : ["6 months", "12 months", "18 months"],
    applicationFee: isOffice ? 0 : 50,
    adminFee: isOffice ? 500 : 150,
    petRent: isOffice ? 0 : 35,
    petDeposit: isOffice ? 0 : 300,
    parkingFee: u.propertyId === MARLOWE.id ? 150 : 0,
    storageFee: u.propertyId === MARLOWE.id ? 45 : 0,
    concessionType: "None",
    householdSize: occupied ? Math.max(1, u.bedrooms) : 0,
    readyStatus: occupied ? "Ready" : u.status === "Make-ready" ? "In progress" : u.status === "Vacant" ? "Ready" : "Not ready",
    furnished: false,
    midTermEligible: false,
    selfShowing: !occupied && u.propertyId !== CASCADE.id,
    showingContact: "Leasing office",
    [cf("windowCoverings")]: isOffice ? "Shades" : "Blinds",
    [cf("keysIssued")]: occupied ? 2 : 0,
    ...extra,
  };
}

// Per-unit overrides on top of unitMeta (occupancy, vacancy, offline, rent history).
const rentHist = (prefix, steps) => list(prefix, steps.map(([days, amount, previous, reason, notes]) => ({ effectiveDate: D(days), amount, previous, reason, notes: notes || "", recordedAt: T(days - 3) })));
const UNIT_EXTRA = {
  "A-101": { moveInDate: D(-260), occupancyNotes: "Parking addendum for stall P-14.", parkingSpace: "P-14", rentHistory: rentHist("rh-a101", [[-260, 1495, 1450, "Turnover"]]), [cf("smartLock")]: "LR-20931" },
  "A-102": { moveInDate: D(-190), householdSize: 3, concessionType: "None", [cf("smartLock")]: "LR-20932" },
  "A-201": { moveInDate: D(-320), petOnSite: true, petNotes: "Friendly cat — keep the bedroom door closed.", rentHistory: rentHist("rh-a201", [[-320, 1925, 1875, "Market adjustment"]]) },
  "A-202": { moveInDate: D(-335), noticeGivenOn: D(-32), availableDate: D(31), readyStatus: "Not ready", occupancyNotes: "Notice given — moving out at lease end. Pre-listed for next month.", marketingTitle: "Two-bed, two-bath with balcony", marketingDescription: "Split two-bedroom with an ensuite primary and a private balcony." },
  "A-301": { moveInDate: D(-95), petOnSite: true, petNotes: "One cat (pet addendum on file).", parkingSpace: "P-22", rentHistory: rentHist("rh-a301", [[-95, 2650, 2595, "Turnover", "New lease after unit refresh."]]) },
  "B-101": { vacatedOn: D(-62), availableDate: D(14), readyStatus: "Ready", readyDate: D(-5), occupancyNotes: "Leased to Zoe Nguyen — move-in scheduled.", lockboxCode: "7302" },
  "B-102": { moveInDate: D(-400), householdSize: 2, rentHistory: rentHist("rh-b102", [[-400, 2450, 2395, "Turnover"], [-35, 2525, 2450, "Market adjustment", "Year-two step on the 24-month lease."]]) },
  "B-201": { vacatedOn: D(-35), availableDate: D(10), readyStatus: "In progress", readyDate: D(8), occupancyNotes: "Abandoned unit — junk removal done, paint and carpet scheduled.", concessionType: "Waived fees", concessionValue: 150, concessionEndsOn: D(45), concessionNotes: "Admin fee waived for leases signed this month." },
  "N-101": { moveInDate: D(-515), householdSize: 2 },
  "N-102": { moveInDate: D(-230), householdSize: 2, occupancyNotes: "Eviction in cure period — coordinate entry with the property manager." },
  "N-201": { vacatedOn: D(-48), availableDate: D(21), readyStatus: "Ready", readyDate: D(-10), occupancyNotes: "Held for Jamal Carter's conditional approval.", [cf("windowCoverings")]: "Curtains" },
  "S-101": { moveInDate: D(-400), occupancyNotes: "Month-to-month since the term ended; voucher-assisted tenancy." },
  "S-102": { moveInDate: D(-40), householdSize: 1 },
  "S-201": { vacatedOn: D(-70), downReason: "Damage", downSince: D(-6), downUntil: D(40), downNotes: "Kitchen supply-line leak damaged the cabinet base and subfloor. Rainier Plumbing repairing; flooring after.", readyStatus: "Not ready", availableDate: D(45) },
  "TH-1": { moveInDate: D(-575), householdSize: 4, parking: "2 spaces" },
  "TH-2": { moveInDate: D(-485), householdSize: 3 },
  "TH-3": { moveInDate: D(-350), noticeGivenOn: D(-17), availableDate: D(16), readyStatus: "Not ready", occupancyNotes: "Notice to vacate received; move-out walk on move-out day." },
  "TH-4": { vacatedOn: D(-55), availableDate: D(7), readyStatus: "In progress", readyDate: D(5), occupancyNotes: "Carpet cleaning and garage drywall patch in progress.", concessionType: "Monthly discount", concessionValue: 100, concessionEndsOn: D(60), concessionNotes: "$100/mo off the first 3 months for move-ins before month-end." },
  "Main house": { moveInDate: D(-500), householdSize: 4, petOnSite: true, petNotes: "Golden retriever, very friendly.", rentHistory: rentHist("rh-sfh", [[-500, 4050, 3950, "Turnover"], [-135, 4200, 4050, "Market adjustment", "Year-two step on the 24-month lease."]]), [cf("windowCoverings")]: "Curtains" },
  "L-201": { vacatedOn: D(-120), availableDate: D(-3), readyStatus: "Ready", readyDate: D(-10), concessionType: "First month off", concessionValue: 1050, concessionEndsOn: D(30), concessionNotes: "50% off the first month during the lobby renovation." },
  "L-302": { moveInDate: D(-75), petOnSite: false },
  "L-401": { vacatedOn: D(-25), availableDate: D(21), readyStatus: "In progress", readyDate: D(18), furnished: true, furnishedPremium: 450, furnishingPackage: "Loft furniture package (sofa, bed, dining set, linens)", midTermEligible: true, minStayMonths: 3, monthlyFurnishedRate: 3450, utilitiesBundled: true, marketingTitle: "Top-floor loft — furnished mid-term option", marketingDescription: "Skyline views, timber beams and a furnished option for 3–9 month stays." },
  "GW-1": { availableDate: D(0), readyStatus: "Ready", readyDate: D(-12), lockboxCode: "", smartLockDevice: "Latch R", marketingTitle: "Brand-new end-unit townhome", marketingDescription: "First-generation finishes, rooftop deck, end-unit windows.", showingInstructions: "Self-guided via smart lock; codes issued per showing." },
  "GW-2": { availableDate: D(5), readyStatus: "Ready", readyDate: D(-2), furnished: true, furnishedPremium: 650, furnishingPackage: "Full furniture + housewares", midTermEligible: true, minStayMonths: 1, monthlyFurnishedRate: 4150, utilitiesBundled: true, marketingTitle: "Furnished townhome for 1–6 month stays" },
  "GW-3": { availableDate: D(18), readyStatus: "In progress", readyDate: D(16), occupancyNotes: "Punch list: appliance install and final clean." },
  "GW-4": { nonRevenue: true, nonRevenueType: "Model", nonRevenueSince: D(-30), nonRevenueUntil: D(90), nonRevenueReason: "Furnished model home for lease-up tours.", removedFromVacancies: true, readyStatus: "Ready" },
  "Suite 200": { moveInDate: D(-300), householdSize: 0, occupancyNotes: "Cobalt Design Studio — NNN lease, 14 staff.", permissionToEnter: "Call first" },
  "Suite 300": { vacatedOn: D(-150), availableDate: D(0), readyStatus: "Ready", readyDate: D(-30), removedFromVacancies: false, marketingTitle: "2,400 sf creative office suite", showingInstructions: "Broker tours by appointment only." },
  "R-1": { readyStatus: "Not ready", unitNotes: "Retail bay — tenant mix to be decided after closing." },
  "201": { readyStatus: "Not ready" },
  "202": { readyStatus: "Not ready" },
  "UD-1": { vacatedOn: D(-140), downReason: "Renovation", downSince: D(-130), downUntil: D(120), downNotes: "Asbestos abatement and full gut renovation under review.", readyStatus: "Not ready" },
  "UD-2": { vacatedOn: D(-140), downReason: "Legal hold", downSince: D(-130), downNotes: "Held vacant while the trust negotiates a sale.", readyStatus: "Not ready" },
};

function applyPropertySection() {
  // Portfolios.
  for (const p of rows("portfolios")) p.metadata = { ...(p.metadata || {}), ...(PORTFOLIO_META[p.id] || {}) };
  rows("portfolios").push(...NEW_PORTFOLIOS);

  // Properties: sandbox rows + seven more covering every type and status.
  const unitCount = (pid) => ALL_UNITS.filter((u) => u.propertyId === pid).length;
  for (const p of rows("properties")) {
    p.metadata = { ...(p.metadata || {}), ...(PROPERTY_META[p.id] || {}) };
    p.unit_count = unitCount(p.id);
  }
  rows("properties").push(...Object.values(NP).map((p) => ({
    id: p.id, name: p.name, address: p.address, city: p.city, state: p.state, zip: p.zip, type: p.type, status: p.status,
    portfolio_id: p.portfolioId, year_built: p.yearBuilt, description: p.description, cover_url: p.cover,
    unit_count: unitCount(p.id), metadata: PROPERTY_META[p.id] || {},
  })));

  // Buildings: structure types from the editor's options, plus one per remaining status.
  const STRUCTURE = { [TOWER_A.id]: "Mid-rise", [TOWER_B.id]: "Mid-rise", [NORTH_BLDG.id]: "Garden", [SOUTH_BLDG.id]: "Garden", [LOFT_BLDG.id]: "Mid-rise" };
  for (const b of rows("buildings")) {
    b.structure_type = STRUCTURE[b.id] || b.structure_type;
    b.metadata = { ...(b.metadata || {}), ...(BUILDING_META[b.id] || {}) };
  }
  rows("buildings").push(...Object.values(NB).map((b) => ({
    id: b.id, name: b.name, block_code: b.blockCode, property_id: b.propertyId, floors: b.floors, year_built: b.yearBuilt,
    structure_type: b.structure, wing: "", description: "", status: b.status, metadata: BUILDING_META[b.id] || {},
  })));

  // Floor plans / unit types / amenities.
  for (const f of rows("floor_plans")) f.metadata = { ...(f.metadata || {}), ...(FLOOR_PLAN_META[f.id] || {}) };
  rows("floor_plans").push(...Object.values(NFP).map((f) => ({
    id: f.id, name: f.name, bedrooms: f.bedrooms, bathrooms: f.bathrooms, sqft: f.sqft, dimensions: f.dimensions, image_url: "",
    property_id: f.propertyId, description: f.description, status: f.status, metadata: FLOOR_PLAN_META[f.id] || {},
  })));
  for (const t of rows("unit_types")) t.metadata = { ...(t.metadata || {}), ...(UNIT_TYPE_META[t.id] || {}) };
  rows("unit_types").push(...Object.values(NUT).map((t) => ({
    id: t.id, name: t.name, bedrooms: t.bedrooms, bathrooms: t.bathrooms, sqft: t.sqft, market_rent: t.marketRent, deposit: t.deposit,
    floor_plan_id: t.floorPlanId, description: "", status: t.status, metadata: UNIT_TYPE_META[t.id] || {},
  })));
  for (const a of rows("amenities")) {
    if (a.id === sid(7, 1)) a.category = "Fitness";
    a.metadata = { ...(a.metadata || {}), ...(AMENITY_META[a.id] || {}) };
  }
  rows("amenities").push(...Object.values(NA).map((a) => ({
    id: a.id, name: a.name, category: a.category, scope: a.scope, icon: a.icon, fee_type: a.feeType, fee_amount: a.feeAmount,
    description: a.description, status: a.status, metadata: AMENITY_META[a.id] || {},
  })));

  // Amenity links (property / building / unit / unittype owners) and floor-plan links.
  rows("amenity_links").push(...[
    [601, NA.bike.id, "building", TOWER_A.id], [602, NA.bike.id, "property", PINECREST.id], [603, NA.lift.id, "property", CASCADE.id],
    [604, NA.firepit.id, "property", PINECREST.id], [605, NA.business.id, "property", NP.pioneer.id], [606, sid(7, 4), "unit", sid(8, 5)],
    [607, sid(7, 5), "building", TOWER_B.id], [608, sid(7, 3), "unittype", NUT.greenwood.id], [609, sid(7, 2), "property", NP.queenAnne.id],
    [610, sid(7, 4), "property", NP.greenwood.id], [611, sid(7, 3), "unit", sid(8, 19)], [612, sid(7, 6), "building", NB.pioneer.id],
  ].map(([n, amenity, ownerType, ownerId]) => ({ id: sid(80, n), amenity_id: amenity, owner_type: ownerType, owner_id: ownerId })));
  rows("floor_plan_links").push(...[
    [701, NFP.douglas.id, "property", NP.greenwood.id], [702, NFP.douglas.id, "building", NB.rowA.id], [703, NFP.suite.id, "property", NP.pioneer.id],
    [704, NFP.suite.id, "building", NB.pioneer.id], [705, NFP.husky.id, "property", NP.udistrict.id], [706, ASPEN.id, "building", NB.mercantile.id],
    [707, BIRCH.id, "building", TOWER_A.id], [708, CEDAR.id, "building", NB.rowB.id],
  ].map(([n, plan, ownerType, ownerId]) => ({ id: sid(80, n), floor_plan_id: plan, owner_type: ownerType, owner_id: ownerId })));

  // Units: metadata on every unit; new units for the added properties.
  rows("units").push(...NEW_UNITS.map((u) => ({
    id: u.id, label: u.label, property_id: u.propertyId, building_id: u.buildingId, unit_type_id: u.unitTypeId,
    floor_plan_id: u.floorPlanId, floor: u.floor, bedrooms: u.bedrooms, bathrooms: u.bathrooms, sqft: u.sqft, rent: u.rent,
    deposit: u.deposit, status: u.status, occupant_name: "", tenant_id: null, lease_start: null, lease_end: null,
  })));
  for (const r of rows("units")) {
    const u = ALL_UNITS.find((x) => x.id === r.id);
    r.metadata = { ...(r.metadata || {}), ...unitMeta(u, UNIT_EXTRA[u.label] || {}) };
  }
}

// =====================================================================================
// People: tenants, leases, lease parties, owners, property owners, vendors
// =====================================================================================

const emailOf = (name) => `${name.toLowerCase().normalize("NFD").replace(/[^a-z ]/g, "").trim().replace(/\s+/g, ".")}@mail.example`;

// Added tenants (group 81): [n, name, unit label | null, status, lease start, lease end, phone]
const NEW_TENANTS = [
  [19, "Marisol Vega", null, "Draft", null, null, "(206) 555-0311"],
  [20, "Cobalt Design Studio LLC", "Suite 200", "Current", -300, 1525, "(206) 555-0377"],
  [21, "Owen Pryce", "L-401", "Past", -395, -25, "(206) 555-0342"],
  [22, "Kira Matsuda", "B-201", "Past", -400, -35, "(206) 555-0358"],
].map(([n, name, label, status, start, end, phone]) => {
  const u = label ? unit(label) : null;
  return {
    id: sid(81, n), n, name, email: n === 20 ? "accounts@cobaltdesign.example" : emailOf(name), phone, status,
    unitId: u?.id ?? null, unit: u?.display ?? "", propertyId: u?.propertyId ?? null,
    leaseId: { 20: sid(81, 106), 21: sid(81, 104), 22: sid(81, 105) }[n] ?? null,
    leaseStart: start == null ? null : D(start), leaseEnd: end == null ? null : D(end),
  };
});

const ALL_TENANTS = [...TENANTS.map((t, i) => ({ ...t, n: i + 1 })), ...NEW_TENANTS];
const tenant = (name) => {
  const t = ALL_TENANTS.find((x) => x.name === name);
  if (!t) throw new Error(`people: tenant ${name}`);
  return t;
};
const T_ = {
  maya: tenant("Maya Chen"), daniel: tenant("Daniel Okafor"), priya: tenant("Priya Raman"), lucas: tenant("Lucas Fernández"),
  hannah: tenant("Hannah Brooks"), omar: tenant("Omar Haddad"), grace: tenant("Grace Kim"), marcus: tenant("Marcus Johnson"),
  sofia: tenant("Sofia Rossi"), ethan: tenant("Ethan Walker"), aisha: tenant("Aisha Bello"), noah: tenant("Noah Schmidt"),
  chloe: tenant("Chloe Martin"), ravi: tenant("Ravi Patel"), liam: tenant("Liam O'Connor"), zoe: tenant("Zoe Nguyen"),
  jamal: tenant("Jamal Carter"), emily: tenant("Emily Davis"), marisol: tenant("Marisol Vega"), cobalt: tenant("Cobalt Design Studio LLC"),
  owen: tenant("Owen Pryce"), kira: tenant("Kira Matsuda"),
};

// Prior-term leases replaced by accepted renewals (the app marks them Renewed).
const PRIOR = {
  grace: { id: sid(81, 101), rent: 1925 },
  aisha: { id: sid(81, 102), rent: 3150 },
  noah: { id: sid(81, 103), rent: 3175 },
};
const LEASE_ID = {
  owen: sid(81, 104), kira: sid(81, 105), cobalt: sid(81, 106),
};
const leaseOf = (t) => t.leaseId;

// Templates (sandbox group 35 + ours).
const TPL = { standard: sid(35, 1), wa: sid(35, 2), or: sid(35, 3), sfh: sid(35, 4), mtm: sid(35, 5), ca: sid(35, 6), furnished: sid(35, 7), commercial: sid(84, 501) };
const templateFor = (pid) => (pid === PINECREST.id ? TPL.or : pid === BIRCHWOOD.id ? TPL.sfh : pid === NP.pioneer.id ? TPL.commercial : TPL.wa);

// Sofia rolled to month-to-month when her term ended.
const SOFIA_TERM = { start: D(-400), end: D(-35), mtmSince: D(-34) };

// Lease lifecycle per tenant: status + lifecycle columns + lease-specific metadata.
const OWNER_OF = {
  [MARLOWE.id]: "Northwind Holdings LLC & Sound Capital Partners LP", [PINECREST.id]: "Evergreen Family Trust", [ALDER.id]: "Alder Court Partners LP",
  [BIRCHWOOD.id]: "Jonathan Reyes", [CASCADE.id]: "Northwind Holdings LLC", [NP.pioneer.id]: "Mercantile Street Partners LLC",
};
const AGENT_OF = { [MARLOWE.id]: M.tasha, [PINECREST.id]: M.riley, [ALDER.id]: M.tasha, [BIRCHWOOD.id]: M.tasha, [CASCADE.id]: M.taylor, [NP.pioneer.id]: M.taylor };
const MANAGER_OF = { [MARLOWE.id]: M.alex, [CASCADE.id]: M.alex, [NP.pioneer.id]: M.dana };
const managerFor = (pid) => MANAGER_OF[pid] || M.jordan;

const util = (label, responsibility, billing, provider = "", amount = 0, account = "") => ({ label, responsibility, billing, provider, account, amount });
function utilitiesFor(pid) {
  if (pid === MARLOWE.id) return { electric: util("Electric", "tenant", "direct", "Seattle City Light"), gas: util("Gas", "na", "direct"), water: util("Water", "landlord", "rubs", "Seattle Public Utilities", 45), sewer: util("Sewer", "landlord", "rubs", "Seattle Public Utilities", 20), trash: util("Trash", "landlord", "included", "Recology"), internet: util("Internet", "tenant", "direct", "Wave"), cable: util("Cable", "na", "direct"), pest: util("Pest control", "landlord", "included"), landscaping: util("Landscaping", "landlord", "included"), snow: util("Snow removal", "landlord", "included") };
  if (pid === PINECREST.id) return { electric: util("Electric", "tenant", "direct", "Portland General Electric"), gas: util("Gas", "na", "direct"), water: util("Water", "landlord", "included", "Portland Water Bureau"), sewer: util("Sewer", "landlord", "included"), trash: util("Trash", "landlord", "included"), internet: util("Internet", "tenant", "direct", "CenturyLink"), cable: util("Cable", "na", "direct"), pest: util("Pest control", "landlord", "included"), landscaping: util("Landscaping", "landlord", "included"), snow: util("Snow removal", "landlord", "included") };
  if (pid === CASCADE.id) return { electric: util("Electric", "tenant", "direct", "Seattle City Light"), gas: util("Gas", "na", "direct"), water: util("Water", "landlord", "submeter", "Seattle Public Utilities", 38), sewer: util("Sewer", "landlord", "submeter", "", 22), trash: util("Trash", "landlord", "included"), internet: util("Internet", "tenant", "direct", "Wave"), cable: util("Cable", "na", "direct"), pest: util("Pest control", "landlord", "included"), landscaping: util("Landscaping", "na", "direct"), snow: util("Snow removal", "landlord", "included") };
  if (pid === NP.pioneer.id) return { electric: util("Electric", "tenant", "direct", "Seattle City Light"), gas: util("Gas", "na", "direct"), water: util("Water", "landlord", "flat", "", 120), sewer: util("Sewer", "landlord", "flat", "", 60), trash: util("Trash", "split", "flat", "", 70), internet: util("Internet", "tenant", "direct", "Lumen"), cable: util("Cable", "na", "direct"), pest: util("Pest control", "landlord", "included"), landscaping: util("Landscaping", "na", "direct"), snow: util("Snow removal", "landlord", "included") };
  const sfh = pid === BIRCHWOOD.id;
  return { electric: util("Electric", "tenant", "direct", "Puget Sound Energy"), gas: util("Gas", "tenant", "direct", "Puget Sound Energy"), water: util("Water", "tenant", "direct", sfh ? "Bellevue Utilities" : "Tacoma Water"), sewer: util("Sewer", "tenant", "direct"), trash: util("Trash", sfh ? "tenant" : "landlord", sfh ? "direct" : "flat", "", sfh ? 0 : 35), internet: util("Internet", "tenant", "direct", "Xfinity"), cable: util("Cable", "tenant", "direct"), pest: util("Pest control", "landlord", "included"), landscaping: util("Landscaping", sfh ? "tenant" : "landlord", sfh ? "direct" : "included"), snow: util("Snow removal", sfh ? "tenant" : "landlord", sfh ? "direct" : "included") };
}

const CLAUSE = {
  smoking: { label: "No smoking", category: "General", detail: "Smoking and vaping are prohibited inside the premises, on balconies and within 25 feet of entrances.", required: true },
  insurance: { label: "Renters insurance", category: "Legal", detail: "Tenant keeps renters insurance with at least $100,000 liability for the full term and lists the manager as interested party.", required: true },
  pets: { label: "Pet agreement", category: "Pets", detail: "Approved pets only; tenant is liable for pet damage and waste clean-up.", required: false },
  parking: { label: "Assigned parking", category: "Parking", detail: "One reserved garage stall; no storage or vehicle repair in the stall.", required: false },
  filters: { label: "Furnace filters & yard", category: "Maintenance", detail: "Tenant replaces furnace filters quarterly and maintains the lawn and beds.", required: false },
  quiet: { label: "Quiet hours", category: "Use of premises", detail: "Quiet hours are 10pm–7am daily.", required: false },
  utilitiesTransfer: { label: "Utility transfer", category: "Utilities", detail: "Tenant transfers electricity and internet into their name by move-in.", required: false },
  renovation: { label: "Renovation acknowledgement", category: "Other", detail: "Tenant acknowledges lobby and façade work during the term; no rent abatement for construction noise inside posted hours.", required: false },
};
const clauses = (prefix, keys) => list(prefix, keys.map((k) => ({ libraryId: `lib-${k}`, ...CLAUSE[k] })));

const MOVE_IN_DONE = ["Lease signed by all parties", "Security deposit received", "First month's rent received", "Renters insurance proof on file", "Utilities transferred to tenant", "Move-in inspection completed", "Keys and access codes handed over", "Portal invitation sent"];

// Base lease metadata derived from the unit/property; per-lease extras go on top.
function leaseMeta(t, u, start, end, extra = {}) {
  const p = propById(u.propertyId);
  const started = start <= D(0);
  const agent = AGENT_OF[u.propertyId] || M.tasha;
  const manager = managerFor(u.propertyId);
  const keys = [u.propertyId === MARLOWE.id ? "parking" : null, u.propertyId === BIRCHWOOD.id ? "filters" : null, u.propertyId === CASCADE.id ? "renovation" : null].filter(Boolean);
  return {
    autoMtm: true, mtmPremium: u.propertyId === PINECREST.id ? 0 : 100, noticeDays: u.propertyId === PINECREST.id ? 30 : 20,
    address: `${p.address}${u.unitTypeId === HOUSE.id ? "" : `, Unit ${u.label}`}, ${p.city}, ${p.state} ${p.zip}`,
    premises: `${u.display} — ${u.bedrooms} bd / ${u.bathrooms} ba, ${u.sqft.toLocaleString()} sf`,
    furnished: false,
    parkingSpaces: u.propertyId === MARLOWE.id || u.unitTypeId === TOWNHOME.id ? 1 : u.unitTypeId === HOUSE.id ? 2 : 0,
    storageUnit: u.propertyId === MARLOWE.id ? `S-${u.label.replace("-", "")}` : "",
    mailboxNumber: MAILBOX(u),
    appliances: u.unitTypeId === HOUSE.id ? ["Refrigerator", "Range / oven", "Dishwasher", "Microwave", "Disposal"] : ["Refrigerator", "Range / oven", "Dishwasher", "Microwave", "Washer", "Dryer"],
    marketRent: u.rent,
    firstRentDue: start ? (start.slice(8) === "01" ? start : addMonths(`${start.slice(0, 8)}01`, 1)) : "",
    depositDueDate: start ? shift(start, -7) : "",
    lastMonthRentCollected: false,
    landlord: `Harbor & Pine Residential LLC, as agent for ${OWNER_OF[u.propertyId] || "the owner"}`,
    leasingAgent: agent.name,
    managerEmail: email(manager),
    managerPhone: "(206) 555-0102",
    occupantLimit: u.bedrooms * 2 + 1,
    insuranceRequired: true, insuranceMinLiability: 100000, insuranceProgram: "resident",
    insuranceInterestedParty: "Harbor & Pine Residential LLC",
    insuranceProofReceived: started, ...(started ? { insuranceProofReceivedOn: shift(start, -2) } : {}),
    utilities: utilitiesFor(u.propertyId),
    documentLanguage: "English", governingState: p.state,
    ...(started ? { lastDocumentAt: at(shift(start, -16), 11) } : {}),
    clauses: clauses(`cl-${u.label}-${t.n}`, ["smoking", "insurance", "quiet", ...keys]),
    ...(started ? {
      keysIssued: 2, utilitiesTransferred: true, portalInvited: true, welcomePacketSent: true,
      moveInChecklist: checks(`mic-${t.n}`, MOVE_IN_DONE.map((l) => [l, true])),
      moveInNotes: "Keys handed over at the leasing office; move-in photos on the inspection.",
      moveInPostedAt: at(start, 9),
    } : {}),
    renewalOption: "Offer", renewalEligibleOn: end ? shift(end, -90) : "", increasePct: 3,
    [cf("leaseSource")]: "Website",
    ...extra,
  };
}

// Lease patches for the sandbox leases (keyed by tenant), then the added leases.
const LEASE_PATCH = {
  maya: { status: "Active", meta: { renewalNotes: "Negotiating a 15-month renewal at $1,545.", [cf("concession")]: 0 } },
  daniel: { status: "Active", meta: { renewalOption: "Offer", [cf("leaseSource")]: "Referral" } },
  priya: { status: "Expiring soon", meta: { renewalNotes: "Offer sent with 12- and 15-month options." } },
  lucas: { status: "Notice given", notice: -32, moveOut: "end", meta: { renewalOption: "Do not renew", moveOutReason: "Bought a home", unitAvailableOn: D(31), forwardingAddress: "5810 24th Ave NW, Seattle, WA 98107", forwardingEmail: emailOf("Lucas Fernández"), forwardingPhone: "(206) 555-1348", refundMethod: "ACH", leaseViolated: false, moveOutRemarks: "Pre-move-out walkthrough booked via entry notice.", moveOutChecklist: checks("moc-4", [["Notice to vacate received", true], ["Forwarding address collected", true], ["Move-out inspection scheduled", true], ["Keys and access codes returned", false], ["Utilities transferred back", false], ["Final meter readings recorded", false], ["Deposit disposition sent", false], ["Unit turn started", false]]), moveOutMoveId: sid(31, 4) } },
  hannah: { status: "Active", meta: { petDeposit: 300, clausesExtra: ["pets"] } },
  omar: { status: "Active", meta: { baseRent: 2450, rentSchedule: list("rs-6", [{ effectiveDate: D(-35), mode: "amount", amount: 2525, note: "Year-two step", appliedOn: D(-35) }]), renewalOption: "Offer", notes: "Repayment plan in progress — see the e-sign request and addendum." } },
  grace: { status: "Active", renewalOf: "grace", meta: { renewalId: sid(30, 6), renewedFromName: "N-101 — Grace Kim (prior term)", [cf("leaseSource")]: "Renewal" } },
  marcus: { status: "Eviction", meta: { renewalOption: "Do not renew", evictionActive: true, evictionStage: "Cure period", evictionReason: "Nonpayment of rent", evictionAmountOwed: 2150, evictionStartedOn: D(-15), evictionPriorStatus: "Active", evictionAttorney: "Harmon & Liu, PLLC", evictionCosts: 350, evictionNotes: "Owner approved filing if the $1,000 payment doesn't post Friday. Payment plan talks continuing in parallel." } },
  sofia: { status: "Month-to-month", termType: "mtm", term: SOFIA_TERM, meta: { mtmSince: SOFIA_TERM.mtmSince, mtmPremium: 0, renewalOption: "Month-to-month", subsidized: true, subsidyProgram: "Housing Choice Voucher (Home Forward)", hapAmount: 1125, notes: "Voucher contract renewed on a month-to-month basis; HAP rent unchanged." } },
  ethan: { status: "Active", meta: { depositAltEnabled: true, depositAltType: "surety", depositAltProvider: "LeaseGuard Surety", depositAltPolicyNumber: "LGS-448120", depositAltCoverage: 2025, depositAltMonthlyFee: 19, depositAltStart: D(-40), depositAltEnd: D(325), depositAltStatus: "Active", [cf("leaseSource")]: "Website" } },
  aisha: { status: "Active", renewalOf: "aisha", meta: { renewalId: sid(30, 8), renewedFromName: "TH-1 — Aisha Bello (prior term)", petDeposit: 0, [cf("leaseSource")]: "Renewal" } },
  noah: { status: "Active", renewalOf: "noah", meta: { renewalId: sid(30, 7), renewedFromName: "TH-2 — Noah Schmidt (prior term)", [cf("leaseSource")]: "Renewal" } },
  chloe: { status: "Notice given", notice: -17, moveOut: "end", meta: { renewalOption: "Do not renew", moveOutReason: "Relocating for work", unitAvailableOn: D(16), forwardingAddress: "2214 W Riverside Ave, Spokane, WA 99201", forwardingEmail: emailOf("Chloe Martin"), forwardingPhone: "(206) 555-1681", refundMethod: "Check", leaseViolated: false, moveOutChecklist: checks("moc-13", [["Notice to vacate received", true], ["Forwarding address collected", true], ["Move-out inspection scheduled", true], ["Keys and access codes returned", false], ["Utilities transferred back", false], ["Final meter readings recorded", false], ["Deposit disposition sent", false], ["Unit turn started", false]]), moveOutMoveId: sid(31, 2) } },
  ravi: { status: "Active", meta: { baseRent: 4050, rentSchedule: list("rs-14", [{ effectiveDate: D(-135), mode: "amount", amount: 4200, note: "Year-two step", appliedOn: D(-135) }]), petDeposit: 500, renewalOption: "Auto-renew", clausesExtra: ["pets"] } },
  liam: { status: "Active", meta: { [cf("guarantor")]: "Siobhan O'Connor (co-signer)", lastMonthRentCollected: false } },
  zoe: { status: "Pending", signed: -1, meta: { [cf("concession")]: 950, [cf("leaseSource")]: "Website", moveInChecklist: checks("mic-16", [["Lease signed by all parties", true], ["Security deposit received", true], ["First month's rent received", false], ["Renters insurance proof on file", false], ["Utilities transferred to tenant", false], ["Move-in inspection completed", false], ["Keys and access codes handed over", false], ["Portal invitation sent", true]]), portalInvited: true, applicationId: sid(23, 6), prospectId: sid(21, 9) } },
  jamal: { status: "Draft", signed: null, meta: { [cf("guarantor")]: "Curtis Carter", [cf("leaseSource")]: "Website", applicationId: sid(23, 5), prospectId: sid(21, 8), approvalConditions: "Additional half-month deposit and a guarantor." } },
  emily: { status: "Ended", notice: -110, moveOut: -55, meta: { renewalOption: "Do not renew", moveOutReason: "Relocating for work", forwardingAddress: "907 Capitol Way S, Olympia, WA 98501", forwardingEmail: emailOf("Emily Davis"), refundMethod: "ACH", moveOutMoveId: sid(31, 6), moveOutChecklist: checks("moc-18", [["Notice to vacate received", true], ["Forwarding address collected", true], ["Move-out inspection scheduled", true], ["Keys and access codes returned", true], ["Utilities transferred back", true], ["Final meter readings recorded", true], ["Deposit disposition sent", true], ["Unit turn started", true]]) } },
};

function applyPeopleTenantsLeases() {
  const leases = rows("leases");
  const tenants = rows("tenants");

  // New tenants (Draft, commercial, two past residents behind the make-ready units).
  for (const t of NEW_TENANTS) {
    tenants.push({
      id: t.id, name: t.name, email: t.email, phone: t.phone, unit: t.unit, property_id: t.propertyId, unit_id: t.unitId,
      lease_id: t.leaseId, household_id: null, status: t.status, lease_start: t.leaseStart, lease_end: t.leaseEnd,
      portal_enabled: false, portal_last_seen: null,
    });
  }

  // Prior-term leases for the three accepted renewals (status Renewed).
  for (const [key, prior] of Object.entries(PRIOR)) {
    const t = T_[key];
    const cur = must("leases", t.leaseId);
    const u = ALL_UNITS.find((x) => x.id === t.unitId);
    const start = shift(cur.term_start, -365);
    const end = shift(cur.term_start, -1);
    leases.push({
      id: prior.id, name: `${u.label} — ${t.name} (prior term)`, unit: u.display, tenant_name: t.name, rent: prior.rent, deposit: u.deposit,
      term_start: start, term_end: end, unit_id: u.id, tenant_id: t.id, property_id: u.propertyId, status: "Renewed",
      template_id: templateFor(u.propertyId), lease_type: "residential", term_type: "fixed", signed_date: shift(start, -14),
      move_in_date: start, notice_date: null, move_out_date: null, renewal_of_id: null,
      metadata: leaseMeta(t, u, start, end, { renewalOption: "Offer", baseRent: prior.rent, notes: "Superseded by the renewal term." }),
      created_at: at(shift(start, -16), 9), updated_at: at(cur.term_start, 9),
    });
  }

  // Sandbox leases: lifecycle columns + metadata.
  for (const [key, patch] of Object.entries(LEASE_PATCH)) {
    const t = T_[key];
    const l = must("leases", t.leaseId);
    const u = ALL_UNITS.find((x) => x.id === t.unitId);
    if (patch.term) {
      l.term_start = patch.term.start;
      l.term_end = patch.term.end;
    }
    const { clausesExtra, ...meta } = patch.meta || {};
    const base = leaseMeta(t, u, l.term_start, l.term_end, meta);
    if (clausesExtra) base.clauses = clauses(`cl-${u.label}-${t.n}`, ["smoking", "insurance", "quiet", ...clausesExtra, ...(u.propertyId === MARLOWE.id ? ["parking"] : []), ...(u.propertyId === BIRCHWOOD.id ? ["filters"] : [])]);
    const started = l.term_start <= D(0);
    Object.assign(l, {
      status: patch.status,
      template_id: templateFor(u.propertyId),
      lease_type: "residential",
      term_type: patch.termType || "fixed",
      signed_date: patch.signed === null ? null : patch.signed !== undefined ? D(patch.signed) : shift(l.term_start, -14),
      move_in_date: started ? l.term_start : null,
      notice_date: patch.notice != null ? D(patch.notice) : null,
      move_out_date: patch.moveOut === "end" ? l.term_end : patch.moveOut != null ? D(patch.moveOut) : null,
      renewal_of_id: patch.renewalOf ? PRIOR[patch.renewalOf].id : null,
      metadata: { ...(l.metadata || {}), ...base },
    });
  }

  // Added leases: early termination, abandonment, and a commercial NNN lease.
  const owenUnit = unit("L-401");
  const kiraUnit = unit("B-201");
  const cobaltUnit = unit("Suite 200");
  leases.push(
    {
      id: LEASE_ID.owen, name: `L-401 — Owen Pryce`, unit: owenUnit.display, tenant_name: "Owen Pryce", rent: 2795, deposit: 2000,
      term_start: D(-395), term_end: D(-25), unit_id: owenUnit.id, tenant_id: T_.owen.id, property_id: CASCADE.id, status: "Terminated",
      template_id: TPL.wa, lease_type: "residential", term_type: "fixed", signed_date: D(-410), move_in_date: D(-395),
      notice_date: D(-60), move_out_date: D(-25), renewal_of_id: null,
      metadata: leaseMeta(T_.owen, owenUnit, D(-395), D(-25), {
        renewalOption: "Do not renew", earlyTermDate: D(-25), earlyTermNoticeOn: D(-60), earlyTermReason: "Job relocation",
        earlyTermFee: 2795, earlyTermFeePaid: true, earlyTermMonthsForfeited: 1, originalTermEnd: D(335),
        earlyTermNotes: "Relocated to Denver; paid one month's rent as the termination fee.",
        moveOutReason: "Early termination", forwardingAddress: "1580 Wynkoop St, Denver, CO 80202", forwardingEmail: emailOf("Owen Pryce"), refundMethod: "ACH", moveOutMoveId: sid(84, 109),
      }),
      created_at: at(D(-412), 9), updated_at: at(D(-25), 15),
    },
    {
      id: LEASE_ID.kira, name: `B-201 — Kira Matsuda`, unit: kiraUnit.display, tenant_name: "Kira Matsuda", rent: 1525, deposit: 1000,
      term_start: D(-400), term_end: D(-35), unit_id: kiraUnit.id, tenant_id: T_.kira.id, property_id: MARLOWE.id, status: "Ended",
      template_id: TPL.wa, lease_type: "residential", term_type: "fixed", signed_date: D(-414), move_in_date: D(-400),
      notice_date: null, move_out_date: D(-35), renewal_of_id: null,
      metadata: leaseMeta(T_.kira, kiraUnit, D(-400), D(-35), {
        renewalOption: "Do not renew", moveOutReason: "Other", leaseViolated: true,
        moveOutRemarks: "Unit abandoned with the final month unpaid. Abandonment notice posted; balance referred to collections.", moveOutMoveId: sid(84, 110),
      }),
      created_at: at(D(-416), 9), updated_at: at(D(-35), 15),
    },
    {
      id: LEASE_ID.cobalt, name: `Suite 200 — Cobalt Design Studio LLC`, unit: cobaltUnit.display, tenant_name: "Cobalt Design Studio LLC", rent: 6950, deposit: 13900,
      term_start: D(-300), term_end: D(1525), unit_id: cobaltUnit.id, tenant_id: T_.cobalt.id, property_id: NP.pioneer.id, status: "Active",
      template_id: TPL.commercial, lease_type: "commercial", term_type: "fixed", signed_date: D(-330), move_in_date: D(-300),
      notice_date: null, move_out_date: null, renewal_of_id: null,
      metadata: {
        ...leaseMeta(T_.cobalt, cobaltUnit, D(-300), D(1525), { renewalOption: "Offer", renewalEligibleOn: D(1345), increasePct: 3, [cf("leaseSource")]: "Referral" }),
        permittedUse: "General office and design studio; no retail sales.", expenseStructure: "Triple net (NNN)", sqftLeased: 2400, camCharges: 1150, tiAllowance: 48000, personalGuarantee: true,
        baseRent: 6950, rentSchedule: list("rs-20", [
          { effectiveDate: D(65), mode: "percent", percent: 3, note: "Annual escalation" },
          { effectiveDate: D(430), mode: "percent", percent: 3, note: "Annual escalation" },
        ]),
        insuranceMinLiability: 2000000, insuranceProgram: "resident", occupantLimit: 20, mtmPremium: 0, autoMtm: false, noticeDays: 180,
        clauses: list("cl-suite200", [
          { libraryId: "lib-com-use", label: "Permitted use", category: "Use of premises", detail: "General office and design studio use only.", required: true },
          { libraryId: "lib-com-signage", label: "Signage", category: "Other", detail: "Tenant may install lobby directory and suite-door signage at its cost, removed at lease end.", required: false },
          { libraryId: "lib-com-cam", label: "Operating expenses", category: "Legal", detail: "Tenant pays its pro-rata share (8.4%) of taxes, insurance and CAM, reconciled annually.", required: true },
        ]),
      },
      created_at: at(D(-332), 9), updated_at: at(D(-300), 9),
    },
  );

  // Tenants: profile metadata, statuses that match the lease lifecycle, portal state.
  for (const t of ALL_TENANTS) {
    const row = must("tenants", t.id);
    const info = TENANT_INFO[t.name] || {};
    const [first, ...rest] = t.name.split(" ");
    if (info.status) row.status = info.status;
    const lease = byId("leases", row.lease_id);
    if (lease) {
      row.lease_start = lease.term_start;
      row.lease_end = lease.term_end;
    }
    const portal = info.portal || "Not invited";
    row.portal_enabled = portal === "Active" || portal === "Invited";
    row.portal_last_seen = portal === "Active" ? T(-((t.n * 3) % 9), 19) : null;
    const isCompany = t.name.endsWith("LLC");
    row.metadata = {
      ...(row.metadata || {}),
      tenantType: isCompany ? "Company" : "Individual",
      ...(isCompany ? { companyName: t.name } : { firstName: first, lastName: rest.join(" ") }),
      preferredContact: "Email", emailOptIn: true, smsOptIn: true, smsConsentOn: lease?.signed_date || D(-30), marketingConsent: false,
      statementDelivery: "E-delivery", noticeDelivery: "Email", language: "English",
      propertyName: propById(t.propertyId)?.name || "", rentAmount: lease?.rent ?? 0, rentDueDay: 1, rentPeriod: "Monthly",
      moveInDate: lease?.move_in_date || "", tenantSince: lease?.move_in_date || "",
      leasingAgent: (AGENT_OF[t.propertyId] || M.tasha).name,
      paymentMethod: "ACH",
      portalInviteEmail: t.email, portalAllowPayments: true, portalAllowRequests: true, portalAllowDocuments: true, portalAllowMessages: true, portalShowLedger: true,
      portalStatus: portal,
      ...(portal !== "Not invited" ? { portalInvitedAt: T(-(60 + t.n), 10) } : {}),
      ...(portal === "Active" ? { portalActivatedAt: T(-(58 + t.n), 18) } : {}),
      insuranceMinLiability: isCompany ? 2000000 : 100000,
      rentReportingConsent: false, rentReportingStatus: "Not enrolled",
      ...info.meta,
    };
  }

  // Units reflect their occupant (S-101 month-to-month dates, the commercial suite).
  for (const r of rows("units")) {
    const occ = ALL_TENANTS.find((t) => t.unitId === r.id && ["Current", "Late", "Notice"].includes(TENANT_INFO[t.name]?.status || t.status));
    if (!occ) continue;
    const lease = byId("leases", occ.leaseId);
    Object.assign(r, { tenant_id: occ.id, occupant_name: occ.name, lease_start: lease.term_start, lease_end: lease.term_end });
  }
}

// Tenant profile metadata by name: status override, portal state, editor-tab keys.
const job = (employer, jobTitle, annualIncome, since, extra = {}) => ({ employmentStatus: "Employed", employer, jobTitle, annualIncome, employmentStart: D(since), incomeVerified: true, incomeVerifiedOn: D(since + 30 > 0 ? -30 : since + 30), ...extra });
const ident = (idType, last4, state, expires, ssn) => ({ idType, idLast4: last4, idIssuingState: state, idIssuingCountry: "United States", idExpiresOn: D(expires), ssnLast4: ssn });
const screen = (date, score, extra = {}) => ({ screeningDate: D(date), creditScore: score, backgroundStatus: "Clear", evictionHistory: "None found", screeningDecision: "Approved", ...extra });

const TENANT_INFO = {
  "Maya Chen": { portal: "Active", meta: { pronouns: "She/her", preferredName: "Maya", dateOfBirth: "1994-03-12", ...job("Pike Place Market PDA", "Events coordinator", 68000, -900), ...ident("Driver's license", "4821", "WA", 900, "1187"), ...screen(-275, 742), preferredContact: "SMS", [cf("parkingPermit")]: "MAR-P14", [cf("moveInGift")]: true } },
  "Daniel Okafor": { portal: "Active", meta: { pronouns: "He/him", dateOfBirth: "1990-07-02", ...job("Amazon", "Software engineer", 152000, -1400), ...ident("Driver's license", "7710", "WA", 1200, "5520"), ...screen(-205, 788), workPhone: "(206) 555-0712", rentReportingConsent: true, rentReportingConsentOn: D(-150), rentReportingOptInOn: D(-150), rentReportingStatus: "Reporting", rentReportingBureaus: ["Experian", "TransUnion"], rentReportingPositiveOnly: true, rentReportingBackfillMonths: 6, [cf("moveInGift")]: true } },
  "Priya Raman": { portal: "Active", meta: { pronouns: "She/her", dateOfBirth: "1992-11-21", ...job("Fred Hutch", "Research scientist", 98000, -1100), ...ident("Passport", "3302", "", 1500, "8841"), ...screen(-335, 770), language: "English", preferredContact: "Email" } },
  "Lucas Fernández": { status: "Notice", portal: "Active", meta: { pronouns: "He/him", dateOfBirth: "1988-05-30", ...job("Boeing", "Mechanical engineer", 124000, -2600), ...ident("Driver's license", "9046", "WA", 600, "2214"), ...screen(-350, 755), language: "Spanish", interpreterNeeded: false, moveOutDate: D(30), noticeGivenOn: D(-32), moveOutReason: "Bought a home", depositDisposition: "Pending", wouldRentAgain: "Yes", forwardingEmail: emailOf("Lucas Fernández"), forwardingPhone: "(206) 555-1348", forwardingLine1: "5810 24th Ave NW", forwardingCity: "Seattle", forwardingState: "WA", forwardingZip: "98107", moveOutNotes: "Closing on a condo in Ballard." } },
  "Hannah Brooks": { portal: "Active", meta: { pronouns: "She/her", dateOfBirth: "1996-01-08", ...job("Seattle Children's", "Pediatric nurse", 96000, -800), ...ident("Driver's license", "1209", "WA", 1300, "6603"), ...screen(-110, 731), preferredContact: "Portal", [cf("parkingPermit")]: "MAR-P22" } },
  "Omar Haddad": { portal: "Active", meta: { pronouns: "He/him", dateOfBirth: "1985-09-17", ...job("Self-employed", "Rideshare & delivery", 52000, -1800, { employmentStatus: "Self-employed", incomeVerified: false }), ...ident("Driver's license", "5531", "WA", 220, "9012"), ...screen(-415, 655, { screeningDecision: "Conditional", screeningConditions: "Additional $500 deposit; income documented with 1099s." }), language: "Arabic", interpreterNeeded: true, nsfCount: 1, paymentNotes: "On a three-installment repayment plan for the $1,450 balance.", restrictCertifiedOnly: true, restrictionReason: "Returned ACH payment last month.", restrictionSetBy: M.carmen.name, restrictionSetOn: D(-28), restrictionReviewOn: D(62) } },
  "Grace Kim": { portal: "Active", meta: { pronouns: "She/her", dateOfBirth: "1991-04-25", ...job("Providence Health", "Physical therapist", 88000, -1500), ...ident("State ID", "8812", "OR", 700, "3378"), ...screen(-530, 760), language: "Korean", preferredContact: "SMS" } },
  "Marcus Johnson": { portal: "Active", meta: { pronouns: "He/him", dateOfBirth: "1987-12-03", ...job("Portland Public Schools", "Facilities technician", 54000, -2400), ...ident("Driver's license", "2087", "OR", -40, "4410"), ...screen(-245, 618, { screeningDecision: "Conditional", screeningConditions: "Guarantor waived after 12 months on-time history." }), nsfCount: 2, restrictNoOnline: true, restrictNoPartial: false, restrictionReason: "Eviction in progress — certified funds at the office only.", restrictionSetBy: M.jordan.name, restrictionSetOn: D(-15), restrictionReviewOn: D(15), doNotContact: false, consentNotes: "Prefers phone calls after 5pm." } },
  "Sofia Rossi": { portal: "Active", meta: { pronouns: "She/her", dateOfBirth: "1979-06-14", employmentStatus: "Retired", annualIncome: 21600, otherIncome: 13500, otherIncomeSource: "Housing Choice Voucher (HAP paid to owner)", incomeVerified: true, incomeVerifiedOn: D(-60), ...ident("State ID", "6604", "OR", 1100, "7781"), ...screen(-415, 690), language: "Portuguese", subsidized: true, subsidyProgram: "Housing Choice Voucher (Home Forward)", subsidyAmount: 1125, statementDelivery: "Both", noticeDelivery: "Mail", [cf("accommodations")]: "Ground-floor unit; grab bars installed in the bathroom." } },
  "Ethan Walker": { portal: "Invited", meta: { pronouns: "He/him", dateOfBirth: "1998-02-19", ...job("Nike", "Retail analyst", 72000, -500), ...ident("Driver's license", "3915", "OR", 1400, "2290"), ...screen(-55, 725), preferredContact: "SMS" } },
  "Aisha Bello": { portal: "Active", meta: { pronouns: "She/her", dateOfBirth: "1983-10-11", ...job("MultiCare Tacoma General", "Charge nurse", 112000, -3000), ...ident("Driver's license", "4479", "WA", 800, "1032"), ...screen(-590, 781), [cf("accommodations")]: "Emotional support animal (letter on file)." } },
  "Noah Schmidt": { portal: "Active", meta: { pronouns: "He/him", dateOfBirth: "1986-08-29", ...job("Port of Tacoma", "Logistics manager", 118000, -2200), ...ident("Driver's license", "6120", "WA", 1000, "8890"), ...screen(-500, 772), autopayDay: 1 } },
  "Chloe Martin": { status: "Notice", portal: "Active", meta: { pronouns: "She/her", dateOfBirth: "1993-12-30", ...job("Avista", "Project coordinator", 79000, -40, { employmentStart: D(-40) }), ...ident("Driver's license", "7342", "WA", 500, "5567"), ...screen(-365, 748), moveOutDate: D(15), noticeGivenOn: D(-17), moveOutReason: "Relocating", depositDisposition: "Pending", wouldRentAgain: "Yes", forwardingEmail: emailOf("Chloe Martin"), forwardingPhone: "(206) 555-1681", forwardingLine1: "2214 W Riverside Ave", forwardingCity: "Spokane", forwardingState: "WA", forwardingZip: "99201" } },
  "Ravi Patel": { portal: "Not invited", meta: { pronouns: "He/him", dateOfBirth: "1978-03-04", ...job("Microsoft", "Principal program manager", 210000, -4000), ...ident("Driver's license", "1158", "WA", 1600, "6025"), ...screen(-515, 802), preferredContact: "Mail", statementDelivery: "Mail", noticeDelivery: "Mail", insuranceWaived: true, insuranceWaiverReason: "Tenant carries a personal umbrella policy accepted by the owner in the lease.", lateFeeExempt: true } },
  "Liam O'Connor": { portal: "Active", meta: { pronouns: "He/him", dateOfBirth: "2001-05-22", employmentStatus: "Student", employer: "University of Washington", jobTitle: "Graduate student (part-time TA)", annualIncome: 26000, otherIncome: 18000, otherIncomeSource: "Parental support", incomeVerified: true, incomeVerifiedOn: D(-80), ...ident("Driver's license", "8370", "WA", 1700, "3349"), ...screen(-90, 664, { screeningDecision: "Conditional", screeningConditions: "Co-signer required (Siobhan O'Connor)." }), nsfCount: 1, [cf("parkingPermit")]: "" } },
  "Zoe Nguyen": { status: "Future", portal: "Invited", meta: { pronouns: "She/her", dateOfBirth: "1995-09-09", ...job("Cedar & Sound Architects", "Project architect", 76800, -1100), ...ident("Driver's license", "2768", "CO", 1300, "4126"), ...screen(-20, 781), preferredContact: "SMS", [cf("moveInGift")]: false } },
  "Jamal Carter": { status: "Applicant", portal: "Not invited", meta: { pronouns: "He/him", dateOfBirth: "1999-01-27", ...job("Rose City Transit", "Mechanic", 51600, -365), ...ident("State ID", "9903", "OR", 2000, "7102"), ...screen(-9, 655, { screeningDecision: "Conditional", screeningConditions: "Extra half-month deposit and guarantor (Curtis Carter)." }) } },
  "Emily Davis": { portal: "Disabled", meta: { pronouns: "She/her", dateOfBirth: "1989-07-16", ...job("Washington State DOH", "Policy analyst", 91000, -2000), ...ident("Driver's license", "5521", "WA", 400, "2210"), ...screen(-435, 744), moveOutDate: D(-55), noticeGivenOn: D(-110), moveOutReason: "Relocating", depositDisposition: "Partially refunded", wouldRentAgain: "Yes", forwardingEmail: emailOf("Emily Davis"), forwardingLine1: "907 Capitol Way S", forwardingCity: "Olympia", forwardingState: "WA", forwardingZip: "98501", moveOutNotes: "Left the townhome in good shape apart from carpet and a garage drywall hole." } },
  "Marisol Vega": { portal: "Not invited", meta: { pronouns: "She/her", preferredContact: "Phone", employmentStatus: "Employed", employer: "Swedish Medical Center", jobTitle: "Medical assistant", notes: "Walk-in at Greenwood; started a tenant record before applying. Follow up with the application link." } },
  "Cobalt Design Studio LLC": { portal: "Invited", meta: { preferredContact: "Email", altEmail: "devon@cobaltdesign.example", workPhone: "(206) 555-0378", employmentStatus: "Other", annualIncome: 2400000, incomeVerified: true, incomeVerifiedOn: D(-320), paymentMethod: "ACH", statementDelivery: "E-delivery", noticeDelivery: "Email", insuranceMinLiability: 2000000, notes: "Commercial tenant — 14 staff. Lease guaranteed by Devon Price." } },
  "Owen Pryce": { portal: "Not invited", meta: { pronouns: "He/him", ...job("Lumen Technologies", "Network engineer", 102000, -2000), moveOutDate: D(-25), noticeGivenOn: D(-60), moveOutReason: "Relocating", depositDisposition: "Pending", wouldRentAgain: "Yes", forwardingEmail: emailOf("Owen Pryce"), forwardingLine1: "1580 Wynkoop St", forwardingCity: "Denver", forwardingState: "CO", forwardingZip: "80202", moveOutNotes: "Early termination for a job relocation — fee paid." } },
  "Kira Matsuda": { portal: "Disabled", meta: { pronouns: "She/her", ...job("Unknown", "", 0, -400, { incomeVerified: false }), moveOutDate: D(-35), noticeGivenOn: "", moveOutReason: "Other", depositDisposition: "Applied to balance", wouldRentAgain: "No", moveOutNotes: "Abandoned the unit; deposit applied to unpaid rent, remaining balance sent to collections.", doNotContact: true, doNotContactReason: "Account with collections agency." } },
};

// Lease parties: [lease key, name, role, pct, primary, tenant?, extra]
const PARTY_SPECS = [
  ["daniel", "Amara Okafor", "tenant", 50, false, null, { relationship: "Spouse", email: "amara.okafor@mail.example", phone: "(206) 555-1290", signs: true, portalAccess: true }],
  ["daniel", "Tobi Okafor", "occupant", null, false, null, { relationship: "Child", dateOfBirth: shift(D(0), -2 * 365) }],
  ["grace", "Min-jun Park", "occupant", null, false, null, { relationship: "Partner", dateOfBirth: "1994-02-11" }],
  ["marcus", "Tanya Johnson", "occupant", null, false, null, { relationship: "Sibling", dateOfBirth: "2000-06-03" }],
  ["aisha", "Kemi Bello", "tenant", 50, false, null, { relationship: "Spouse", email: "kemi.bello@mail.example", phone: "(253) 555-1460", signs: true, portalAccess: false }],
  ["aisha", "Ife Bello", "occupant", null, false, null, { relationship: "Child", dateOfBirth: "2014-03-19" }],
  ["aisha", "Dayo Bello", "occupant", null, false, null, { relationship: "Child", dateOfBirth: "2018-08-07" }],
  ["noah", "Lena Schmidt", "tenant", 40, false, null, { relationship: "Spouse", email: "lena.schmidt@mail.example", phone: "(253) 555-1517", signs: true }],
  ["noah", "Felix Schmidt", "occupant", null, false, null, { relationship: "Child", dateOfBirth: "2021-04-30" }],
  ["ravi", "Anjali Patel", "tenant", 50, false, null, { relationship: "Spouse", email: "anjali.patel@mail.example", phone: "(425) 555-1714", signs: true }],
  ["ravi", "Arjun Patel", "occupant", null, false, null, { relationship: "Child", dateOfBirth: "2011-01-15" }],
  ["ravi", "Meera Patel", "occupant", null, false, null, { relationship: "Child", dateOfBirth: "2015-09-02" }],
  ["liam", "Siobhan O'Connor", "cosigner", null, false, null, { relationship: "Parent", email: "siobhan.oconnor@mail.example", phone: "(509) 555-1802", guaranteeLimit: 10000, signs: true }],
  ["jamal", "Curtis Carter", "guarantor", null, false, null, { relationship: "Parent", email: "curtis.carter@mail.example", phone: "(503) 555-1866", guaranteeLimit: 9300, signs: true }],
  ["cobalt", "Devon Price", "guarantor", null, false, null, { relationship: "Managing member", email: "devon@cobaltdesign.example", phone: "(206) 555-0378", guaranteeLimit: 83400, signs: true }],
];
// Primary-tenant share where a co-tenant splits responsibility.
const PRIMARY_PCT = { daniel: 50, aisha: 50, noah: 60, ravi: 50 };

function applyLeaseParties() {
  const parties = rows("lease_parties");
  const next = counter(81, 201);
  const leaseRows = rows("leases").filter((l) => l.tenant_id);
  const keyOf = (l) => Object.entries(T_).find(([, t]) => t.id === l.tenant_id)?.[0];
  for (const l of leaseRows) {
    const key = keyOf(l);
    const t = T_[key];
    parties.push({
      id: next(), lease_id: l.id, tenant_id: t.id, role: "tenant", name: t.name, email: t.email, phone: t.phone,
      responsibility_pct: PRIMARY_PCT[key] ?? 100, is_primary: true, metadata: { signs: true, portalAccess: true },
    });
    for (const [k, name, role, pct, primary, tenantId, meta] of PARTY_SPECS.filter((s) => s[0] === key)) {
      const { email: em, phone, ...rest } = meta;
      parties.push({
        id: next(), lease_id: l.id, tenant_id: tenantId, role, name, email: em || null, phone: phone || null,
        responsibility_pct: pct, is_primary: primary, metadata: rest,
      });
    }
  }
}

// --- owners & property_owners ----------------------------------------------------------

const NO = {
  sound: { id: sid(82, 1), name: "Sound Capital Partners LP", company: "Sound Capital Partners", email: "finance@soundcapital.example", phone: "(206) 555-0181", fee: 8, payout: "ACH", tax: "7745", status: "Active", entityType: "Partnership" },
  qaHoa: { id: sid(82, 2), name: "Queen Anne Commons Owners Association", company: "Queen Anne Commons OA", email: "board@queenannecommons.example", phone: "(206) 555-0161", fee: 6, payout: "ACH", tax: "3021", status: "Active", entityType: "Non-profit" },
  mercantile: { id: sid(82, 3), name: "Mercantile Street Partners LLC", company: "Mercantile Street Partners", email: "am@mercantilestreet.example", phone: "(206) 555-0192", fee: 7, payout: "Wire", tax: "5590", status: "Active", entityType: "LLC" },
  lim: { id: sid(82, 4), name: "Harriet Lim", company: "", email: "harriet.lim@mail.example", phone: "(206) 555-0154", fee: 9, payout: "ACH", tax: "6187", status: "Onboarding", entityType: "Individual" },
  lakewood: { id: sid(82, 5), name: "Lakewood Senior Living Inc.", company: "Lakewood Senior Living", email: "ops@lakewoodsenior.example", phone: "(253) 555-0133", fee: 6, payout: "ACH", tax: "8834", status: "Inactive", entityType: "Corporation" },
  husky: { id: sid(82, 6), name: "Husky Housing Trust", company: "Husky Housing Trust", email: "trustee@huskyhousing.example", phone: "(206) 555-0147", fee: 8, payout: "Hold", tax: "2296", status: "Active", entityType: "Trust" },
  ridgeview: { id: sid(82, 7), name: "Ridgeview Communities LLC", company: "Ridgeview Communities", email: "office@ridgeviewcommunities.example", phone: "(253) 555-0175", fee: 7, payout: "Check", tax: "4402", status: "Inactive", entityType: "LLC" },
  pike: { id: sid(82, 8), name: "Estate of Margaret Pike", company: "Estate of Margaret Pike", email: "executor.pike@mail.example", phone: "(206) 555-0118", fee: 8, payout: "Check", tax: "1979", status: "Inactive", entityType: "Estate" },
};

// Ownership records: [n, owner, property, pct, starts (days), ends (days) | null, primary]
const OWNERSHIP_SPECS = [
  [101, NORTHWIND, MARLOWE, 60, -2900, null, true],
  [102, NO.sound, MARLOWE, 40, -1100, null, false],
  [103, NO.pike, CASCADE, 100, -6000, -900, false],
  [104, NORTHWIND, CASCADE, 100, -899, null, true],
  [105, EVERGREEN_TRUST, PINECREST, 100, -3600, null, true],
  [106, ALDER_PARTNERS, ALDER, 100, -2100, null, true],
  [107, REYES, BIRCHWOOD, 100, -1500, null, true],
  [108, NO.lim, NP.greenwood, 100, -60, null, true],
  [109, NO.qaHoa, NP.queenAnne, 100, -620, null, true],
  [110, NO.mercantile, NP.pioneer, 100, -415, null, true],
  [111, NO.mercantile, NP.ballard, 70, -10, null, true],
  [112, NO.sound, NP.ballard, 30, -10, null, false],
  [113, NO.lakewood, NP.lakewood, 100, -4000, null, true],
  [114, NO.husky, NP.udistrict, 100, -1460, null, true],
  [115, NO.ridgeview, NP.ridgeview, 100, -2500, -120, true],
];

const portalOwner = (status, invitedDays, activatedDays) => ({
  portalStatus: status, portalInviteEmail: "",
  ...(status !== "Not invited" ? { portalInvitedAt: T(invitedDays, 10) } : {}),
  ...(status === "Active" ? { portalActivatedAt: T(activatedDays, 16) } : {}),
  portalShowStatements: true, portalShowWorkOrders: true, portalShowDocuments: true, portalApproveWork: status === "Active",
});
const mailing = (line1, city, state, zip) => ({ mailingLine1: line1, mailingCity: city, mailingState: state, mailingZip: zip, remitSameAsMailing: true });

const OWNER_META = {
  [NORTHWIND.id]: { entityType: "LLC", dba: "Northwind", formationState: "WA", signerName: "Rebecca Lin", signerTitle: "Managing director", altEmail: "ap@northwind.example", preferredContact: "Email", website: "https://northwind.example", ...mailing("600 University St, Suite 2400", "Seattle", "WA", "98101"), payeeName: "Northwind Holdings LLC", payoutSchedule: "Monthly", distributionDay: 15, minimumPayout: 500, bankName: "Harbor Community Bank", bankAccountType: "Checking", bankLast4: "4471", routingLast4: "0021", reserveAmount: 5000, separatePayments: true, agreementStart: D(-2890), agreementEnd: D(285), agreementAutoRenew: true, agreementNoticeDays: 60, managementFeeMinimum: 250, leasingFeeType: "Percent of first month", leasingFeeAmount: 50, renewalFee: 150, maintenanceMarkupPct: 10, setupFee: 0, taxClassification: "LLC", tinType: "EIN", taxpayerName: "Northwind Holdings LLC", requires1099: true, delivery1099: "E-delivery", w9OnFile: true, w9ReceivedOn: D(-300), statementDelivery: "E-delivery", statementFrequency: "Monthly", statementReports: ["Owner statement", "Rent roll", "Income statement", "Delinquency", "Work orders"], statementCc: "accounting@northwind.example", approvalThreshold: 1500, approveBills: false, notifyEmergencies: true, ...portalOwner("Active", -400, -398), [cf("distributionNotes")]: "Split Marlowe distributions 60/40 with Sound Capital.", [cf("ownerWebsite")]: "https://northwind.example" },
  [EVERGREEN_TRUST.id]: { entityType: "Trust", trusteeName: "Andrea Walsh", trustDate: D(-5000), preferredContact: "Email", ...mailing("1420 NW Lovejoy St", "Portland", "OR", "97209"), payoutSchedule: "Monthly", distributionDay: 20, minimumPayout: 250, bankName: "Columbia Trust Bank", bankAccountType: "Checking", bankLast4: "9023", routingLast4: "3302", agreementStart: D(-3590), agreementEnd: D(45), agreementAutoRenew: false, agreementNoticeDays: 60, managementFeeMinimum: 200, leasingFeeType: "Flat", leasingFeeAmount: 600, renewalFee: 100, maintenanceMarkupPct: 8, taxClassification: "Trust", tinType: "EIN", taxpayerName: "Evergreen Family Trust", requires1099: true, delivery1099: "Mail", w9OnFile: true, w9ReceivedOn: D(-650), statementDelivery: "Both", statementFrequency: "Quarterly", statementReports: ["Owner statement", "Income statement", "Cash flow"], feeNotes: "Trust requested a fee review before renewal.", approvalThreshold: 1000, approveBills: true, notifyEmergencies: true, ...portalOwner("Invited", -6, null) },
  [ALDER_PARTNERS.id]: { entityType: "Partnership", formationState: "WA", signerName: "Marcus Ihle", signerTitle: "General partner", preferredContact: "Email", ...mailing("1101 Pacific Ave, Suite 900", "Tacoma", "WA", "98402"), payoutSchedule: "Twice monthly", distributionDay: 5, bankName: "Tacoma Commerce Bank", bankAccountType: "Checking", bankLast4: "6610", routingLast4: "1188", agreementStart: D(-2090), agreementEnd: D(520), agreementAutoRenew: true, agreementNoticeDays: 90, leasingFeeType: "Percent of first month", leasingFeeAmount: 60, maintenanceMarkupPct: 10, taxClassification: "Partnership", tinType: "EIN", taxpayerName: "Alder Court Partners LP", requires1099: true, delivery1099: "E-delivery", w9OnFile: true, w9ReceivedOn: D(-500), statementDelivery: "E-delivery", statementFrequency: "Monthly", statementReports: ["Owner statement", "Rent roll", "Bills paid"], approvalThreshold: 750, notifyEmergencies: true, homeWarranty: "", ...portalOwner("Active", -700, -695) },
  [REYES.id]: { entityType: "Joint", firstName: "Jonathan", lastName: "Reyes", coOwnerName: "Elena Reyes", dateOfBirth: "1975-04-18", preferredContact: "Phone", ...mailing("2207 Bellevue Way NE", "Bellevue", "WA", "98004"), payoutSchedule: "Monthly", distributionDay: 10, minimumPayout: 100, agreementStart: D(-480), agreementEnd: D(250), agreementAutoRenew: true, agreementNoticeDays: 30, leasingFeeType: "None", renewalFee: 0, maintenanceMarkupPct: 0, taxClassification: "Individual", tinType: "SSN", taxpayerName: "Jonathan & Elena Reyes", requires1099: true, delivery1099: "Mail", w9OnFile: true, w9ReceivedOn: D(-20), statementDelivery: "Mail", statementFrequency: "Monthly", statementReports: ["Owner statement", "Work orders"], approvalThreshold: 300, approveBills: true, homeWarranty: "Cascade Home Warranty #CHW-55120", maintenanceNotes: "Call before any repair over $300.", ...portalOwner("Not invited") },
  [NO.sound.id]: { entityType: "Partnership", formationState: "DE", signerName: "Priscilla Hart", signerTitle: "CFO", preferredContact: "Email", ...mailing("1201 3rd Ave, Suite 4800", "Seattle", "WA", "98101"), payoutSchedule: "Monthly", distributionDay: 15, bankName: "Pacific Premier", bankAccountType: "Checking", bankLast4: "7745", routingLast4: "6650", agreementStart: D(-1100), agreementEnd: D(285), agreementAutoRenew: true, taxClassification: "Partnership", tinType: "EIN", taxpayerName: "Sound Capital Partners LP", requires1099: true, delivery1099: "E-delivery", w9OnFile: true, w9ReceivedOn: D(-280), statementDelivery: "E-delivery", statementFrequency: "Quarterly", statementReports: ["Owner statement", "Income statement"], ...portalOwner("Active", -300, -299) },
  [NO.qaHoa.id]: { entityType: "Non-profit", signerName: "Nora Bishop", signerTitle: "Board president", preferredContact: "Email", ...mailing("520 W Galer St", "Seattle", "WA", "98119"), payoutSchedule: "On request", agreementStart: D(-620), agreementEnd: D(110), agreementAutoRenew: true, agreementNoticeDays: 90, leasingFeeType: "None", taxClassification: "Corporation", tinType: "EIN", taxpayerName: "Queen Anne Commons Owners Association", requires1099: false, w9OnFile: true, statementDelivery: "E-delivery", statementFrequency: "Monthly", statementReports: ["Owner statement", "Bills paid", "Work orders"], approvalThreshold: 2500, approveBills: true, ...portalOwner("Invited", -12, null) },
  [NO.mercantile.id]: { entityType: "LLC", formationState: "WA", signerName: "Theo Marchetti", signerTitle: "Asset manager", preferredContact: "Email", website: "https://mercantilestreet.example", ...mailing("83 S King St, Suite 500", "Seattle", "WA", "98104"), payoutSchedule: "Monthly", distributionDay: 25, bankName: "Harbor Community Bank", bankAccountType: "Checking", bankLast4: "5590", routingLast4: "0021", agreementStart: D(-410), agreementEnd: D(320), agreementAutoRenew: true, managementFeeMinimum: 500, leasingFeeType: "Percent of first month", leasingFeeAmount: 100, maintenanceMarkupPct: 12, taxClassification: "LLC", tinType: "EIN", taxpayerName: "Mercantile Street Partners LLC", requires1099: true, delivery1099: "E-delivery", w9OnFile: true, w9ReceivedOn: D(-400), statementDelivery: "E-delivery", statementFrequency: "Quarterly", statementReports: ["Owner statement", "Rent roll", "Income statement", "Cash flow"], ...portalOwner("Active", -380, -379), [cf("ownerWebsite")]: "https://mercantilestreet.example" },
  [NO.lim.id]: { entityType: "Individual", firstName: "Harriet", lastName: "Lim", dateOfBirth: "1968-10-02", preferredContact: "Phone", ...mailing("1530 NW 57th St", "Seattle", "WA", "98107"), payoutSchedule: "Monthly", distributionDay: 15, bankName: "", agreementStart: D(-75), agreementEnd: D(1020), agreementAutoRenew: true, leasingFeeType: "Percent of first month", leasingFeeAmount: 50, setupFee: 750, taxClassification: "Individual", tinType: "SSN", requires1099: true, delivery1099: "Mail", w9OnFile: false, statementDelivery: "E-delivery", statementFrequency: "Monthly", statementReports: ["Owner statement", "Rent roll"], ...portalOwner("Not invited"), activityNotes: "Onboarding: waiting on her W-9 and bank details before the first distribution." },
  [NO.lakewood.id]: { entityType: "Corporation", formationState: "WA", signerName: "Gil Moreno", signerTitle: "COO", ...mailing("9120 Gravelly Lake Dr SW", "Lakewood", "WA", "98499"), agreementStart: D(-2200), agreementEnd: D(-45), agreementAutoRenew: false, taxClassification: "Corporation", tinType: "EIN", requires1099: false, w9OnFile: true, ...portalOwner("Disabled", -900, null), activityNotes: "Management ended — portal access turned off after the final statement." },
  [NO.husky.id]: { entityType: "Trust", trusteeName: "Rowan Achebe", trustDate: D(-3000), preferredContact: "Email", ...mailing("4000 15th Ave NE", "Seattle", "WA", "98105"), payoutSchedule: "Quarterly", holdPayouts: true, holdReason: "Trustee asked to hold distributions while the sale is negotiated.", holdSince: D(-40), holdUntil: D(50), reserveAmount: 25000, agreementStart: D(-1460), agreementEnd: D(200), agreementAutoRenew: false, agreementNoticeDays: 60, taxClassification: "Trust", tinType: "EIN", taxpayerName: "Husky Housing Trust", requires1099: true, w9OnFile: true, w9ReceivedOn: D(-700), statementDelivery: "E-delivery", statementFrequency: "Quarterly", statementReports: ["Owner statement", "Cash flow"], ...portalOwner("Active", -600, -598) },
  [NO.ridgeview.id]: { entityType: "LLC", formationState: "WA", ...mailing("PO Box 1188", "Puyallup", "WA", "98371"), agreementStart: D(-2500), agreementEnd: D(-120), agreementAutoRenew: false, taxClassification: "LLC", tinType: "EIN", requires1099: true, w9OnFile: true, ...portalOwner("Disabled", -1200, null), activityNotes: "Sold the community; final 1099 goes out in January." },
  [NO.pike.id]: { entityType: "Estate", trusteeName: "Daniel Pike (executor)", preferredContact: "Mail", ...mailing("3110 E Madison St", "Seattle", "WA", "98112"), taxClassification: "Trust", tinType: "EIN", requires1099: false, w9OnFile: true, ...portalOwner("Not invited"), activityNotes: "Sold Cascade Lofts to Northwind; kept for ownership history." },
};
const OWNER_PORTAL = Object.fromEntries(Object.entries(OWNER_META).map(([id, m]) => [id, m.portalStatus]));

function applyOwners() {
  const owners = rows("owners");
  owners.push(...Object.values(NO).map((o) => ({
    id: o.id, name: o.name, email: o.email, phone: o.phone, company: o.company, management_fee_pct: o.fee,
    payout_method: o.payout, tax_id_last4: o.tax, status: o.status,
  })));
  const links = OWNERSHIP_SPECS.map(([n, o, p, pct, start, end, primary]) => ({
    id: sid(82, n), owner_id: o.id, owner_name: o.name, property_id: p.id, property_name: p.name, ownership_pct: pct,
    starts_on: D(start), ends_on: end == null ? null : D(end), is_primary: primary,
  }));
  rows("property_owners").push(...links);
  const since = (id) => links.filter((l) => l.owner_id === id).map((l) => l.starts_on).sort()[0] || D(-30);
  for (const o of owners) {
    const status = OWNER_PORTAL[o.id] || "Not invited";
    Object.assign(o, {
      properties_count: links.filter((l) => l.owner_id === o.id).length,
      portfolio_label: "",
      portal_access: status === "Active" || status === "Invited",
      since: since(o.id),
      // Legacy splits were moved to property_owners (Owners → Ownerships).
      metadata: { ...(o.metadata || {}), properties: [], ...(OWNERS.some((x) => x.id === o.id) ? { legacySplitsImportedAt: T(-30, 9) } : {}), ...OWNER_META[o.id], portalInviteEmail: o.email },
    });
  }
}

// --- vendors ---------------------------------------------------------------------------

const NV = {
  pest: { id: sid(82, 201), name: "Puget Pest Solutions", contactName: "Alana Reyes", email: "service@pugetpest.example", phone: "(253) 555-0214", specialty: "Pest control", hourlyRate: 75, status: "Onboarding" },
  roofing: { id: sid(82, 202), name: "Northgate Roofing & Gutters", contactName: "Craig Holm", email: "office@northgateroofing.example", phone: "(206) 555-0227", specialty: "Roofing", hourlyRate: 115, status: "Active" },
  locks: { id: sid(82, 203), name: "Cityline Locksmiths", contactName: "Rudy Szabo", email: "jobs@citylinelocks.example", phone: "(206) 555-0239", specialty: "Locksmith", hourlyRate: 90, status: "Inactive" },
  handyman: { id: sid(82, 204), name: "QuickFix Handyman Services", contactName: "Jared Pike", email: "quickfix@mail.example", phone: "(425) 555-0246", specialty: "Handyman", hourlyRate: 50, status: "Do not use" },
  windows: { id: sid(82, 205), name: "Lakeside Window Washing", contactName: "Mina Takeda", email: "mina@lakesidewindows.example", phone: "(206) 555-0251", specialty: "Cleaning", hourlyRate: 65, status: "Active" },
  elevator: { id: sid(82, 206), name: "Emerald City Elevator", contactName: "Vik Rao", email: "service@emeraldelevator.example", phone: "(206) 555-0263", specialty: "Elevator", hourlyRate: 165, status: "Preferred" },
};

const vportal = (status, invited, activated) => ({
  vendorPortalAccess: status === "Active" || status === "Invited", portalStatus: status,
  ...(status !== "Not invited" ? { portalInvitedAt: T(invited, 10) } : {}),
  ...(status === "Active" ? { portalActivatedAt: T(activated, 15) } : {}),
  portalAcceptWork: true, portalUploadInvoices: true, portalUploadCoi: true, portalSeeTenantContact: false,
});
const vtax = (classification, tinType, last4, w9 = true) => ({ is1099: true, box1099: "NEC · Box 1", taxClassification: classification, tinType, tinLast4: last4, taxpayerName: "", w9OnFile: w9, ...(w9 ? { w9ReceivedOn: D(-250) } : {}) });
const vaddr = (line1, city, state, zip) => ({ vendorLine1: line1, vendorCity: city, vendorState: state, vendorZip: zip });
const GL_REPAIRS = { defaultGlAccountId: sid(50, 16), defaultGlAccountName: "5000 · Repairs & Maintenance" };

const VENDOR_META = {
  [RAINIER.id]: { companyType: "Company", preferred: true, since: D(-1800), accountNumber: "HP-1001", website: "https://rainierplumbing.example", contactTitle: "Dispatch lead", mobilePhone: "(206) 555-0111", afterHoursPhone: "(206) 555-0119", dispatchEmail: "dispatch@rainierplumbing.example", preferredContact: "Phone", ...vaddr("4120 Airport Way S", "Seattle", "WA", "98108"), trades: ["Plumbing", "Restoration"], serviceAreas: ["The Marlowe", "Cascade Lofts", "Pinecrest Commons", "Pioneer Square Office Suites"], serviceZips: "98101, 98104, 98121", serviceRadiusMiles: 30, maxJobSize: 25000, emergencyAvailable: true, emergencyResponseHours: 2, responseTimeHours: 4, businessHours: "Mon–Fri 7–5", daysAvailable: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], holidayCoverage: true, crewSize: 6, tripCharge: 65, minimumCharge: 150, afterHoursMultiplier: 1.5, weekendMultiplier: 1.25, emergencyRate: 165, materialsMarkupPct: 15, estimateRequiredOver: 750, paymentTerms: "Net 30", paymentMethod: "ACH", payeeName: "Rainier Plumbing Co.", invoiceEmail: "billing@rainierplumbing.example", ...GL_REPAIRS, bankLast4: "3301", discountPct: 2, discountDays: 10, ...vtax("LLC", "EIN", "8812"), coiMinGeneralLiability: 2000000, coiRequireAdditionalInsured: true, workersCompRequired: true, licenseRequired: true, ...vportal("Active", -500, -498), [cf("dispatchLine")]: "(206) 555-0119", [cf("segments")]: ["Residential", "Commercial", "Emergency"], [cf("agentEmail")]: "certs@pnwinsurance.example" },
  [BRIGHTLINE.id]: { companyType: "Company", since: D(-900), contactTitle: "Owner", mobilePhone: "(206) 555-0134", dispatchEmail: "jobs@brightline.example", preferredContact: "Email", ...vaddr("2201 6th Ave S", "Seattle", "WA", "98134"), trades: ["Electrical"], serviceAreas: ["The Marlowe", "Cascade Lofts", "Greenwood Townhomes"], serviceRadiusMiles: 25, emergencyAvailable: false, responseTimeHours: 24, businessHours: "Mon–Fri 8–4:30", daysAvailable: ["Mon", "Tue", "Wed", "Thu", "Fri"], crewSize: 3, tripCharge: 75, minimumCharge: 180, afterHoursMultiplier: 2, materialsMarkupPct: 20, estimateRequiredOver: 500, paymentTerms: "Net 15", paymentMethod: "Check", ...GL_REPAIRS, ...vtax("S corporation", "EIN", "4409"), coiMinGeneralLiability: 1000000, coiRequireAdditionalInsured: true, licenseRequired: true, complianceNotes: "Electrical contractor license renewal submitted to L&I — waiting on the new card.", ...vportal("Invited", -8), [cf("segments")]: ["Residential", "Commercial"] },
  [EVERGREEN_HVAC.id]: { companyType: "Company", preferred: true, since: D(-1500), contactTitle: "Service manager", mobilePhone: "(503) 555-0177", afterHoursPhone: "(503) 555-0170", dispatchEmail: "service@evergreenhvac.example", preferredContact: "Portal", ...vaddr("88 SE Grand Ave", "Portland", "OR", "97214"), trades: ["HVAC", "Inspection"], serviceAreas: ["Pinecrest Commons", "The Marlowe", "14 Birchwood Lane", "Alder Court Townhomes"], serviceZips: "97206, 97214, 98004", emergencyAvailable: true, emergencyResponseHours: 4, responseTimeHours: 8, businessHours: "Mon–Sat 7–6", daysAvailable: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], crewSize: 9, tripCharge: 89, minimumCharge: 179, afterHoursMultiplier: 1.5, weekendMultiplier: 1.25, emergencyRate: 175, materialsMarkupPct: 18, paymentTerms: "Net 30", paymentMethod: "ACH", ...GL_REPAIRS, bankLast4: "7702", ...vtax("C corporation", "EIN", "6630"), coiMinGeneralLiability: 2000000, coiRequireAdditionalInsured: true, workersCompRequired: true, licenseRequired: false, ...vportal("Active", -400, -399), lastComplianceChangeAt: T(-3, 14), [cf("dispatchLine")]: "(503) 555-0170", [cf("segments")]: ["Residential", "Emergency"] },
  [SUMMIT.id]: { companyType: "Company", since: D(-700), contactTitle: "Technician", mobilePhone: "(425) 555-0192", preferredContact: "SMS", ...vaddr("15600 NE 8th St", "Bellevue", "WA", "98008"), trades: ["Appliance repair"], serviceAreas: ["14 Birchwood Lane", "The Marlowe", "Pinecrest Commons"], responseTimeHours: 24, businessHours: "Mon–Fri 9–5", daysAvailable: ["Mon", "Tue", "Wed", "Thu", "Fri"], crewSize: 2, tripCharge: 59, minimumCharge: 120, paymentTerms: "Due on receipt", paymentMethod: "Card", ...GL_REPAIRS, ...vtax("Individual / sole proprietor", "SSN", "1180"), coiMinGeneralLiability: 1000000, licenseRequired: false, complianceNotes: "COI lapsed — renewal requested twice.", ...vportal("Not invited") },
  [CLEARVIEW.id]: { companyType: "Company", preferred: true, since: D(-1200), contactTitle: "Scheduling", preferredContact: "Email", ...vaddr("900 Elliott Ave W", "Seattle", "WA", "98119"), trades: ["Cleaning", "Junk removal"], serviceAreas: ["The Marlowe", "Cascade Lofts", "Alder Court Townhomes", "Greenwood Townhomes"], responseTimeHours: 48, businessHours: "Mon–Sat 8–6", daysAvailable: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], crewSize: 12, minimumCharge: 200, paymentTerms: "Net 15", paymentMethod: "ACH", ...GL_REPAIRS, ...vtax("LLC", "EIN", "3390"), coiMinGeneralLiability: 1000000, licenseRequired: false, complianceNotes: "COI tracked from the legacy expiry date — upload the new certificate when it arrives.", ...vportal("Not invited"), [cf("segments")]: ["Residential", "Turnover"] },
  [CASCADE_LAND.id]: { companyType: "Company", since: D(-1000), contactTitle: "Crew lead", mobilePhone: "(253) 555-0123", preferredContact: "Phone", ...vaddr("6020 S Tyler St", "Tacoma", "WA", "98409"), trades: ["Landscaping", "Snow removal"], serviceAreas: ["Alder Court Townhomes", "Pinecrest Commons", "14 Birchwood Lane"], responseTimeHours: 72, businessHours: "Mon–Fri 7–3", daysAvailable: ["Mon", "Tue", "Wed", "Thu", "Fri"], crewSize: 5, minimumCharge: 120, paymentTerms: "Net 30", paymentMethod: "Check", ...GL_REPAIRS, ...vtax("Partnership", "EIN", "5521"), coiMinGeneralLiability: 1000000, licenseRequired: false, ...vportal("Not invited") },
  [NV.pest.id]: { companyType: "Company", since: D(-5), contactTitle: "Office manager", preferredContact: "Email", ...vaddr("2302 Pacific Hwy E", "Fife", "WA", "98424"), trades: ["Pest control"], serviceAreas: ["Pinecrest Commons", "Alder Court Townhomes"], responseTimeHours: 48, daysAvailable: ["Mon", "Wed", "Fri"], paymentTerms: "Net 30", paymentMethod: "ACH", ...vtax("LLC", "EIN", "7781", false), coiMinGeneralLiability: 1000000, licenseRequired: true, complianceNotes: "Onboarding — waiting on COI, pesticide applicator license and W-9.", ...vportal("Not invited") },
  [NV.roofing.id]: { companyType: "Company", since: D(-600), contactTitle: "Estimator", preferredContact: "Email", ...vaddr("10510 Aurora Ave N", "Seattle", "WA", "98133"), trades: ["Roofing", "General contractor"], serviceAreas: ["Pinecrest Commons", "The Marlowe", "Queen Anne Commons"], maxJobSize: 150000, responseTimeHours: 72, daysAvailable: ["Mon", "Tue", "Wed", "Thu", "Fri"], crewSize: 8, estimateRequiredOver: 0, paymentTerms: "Net 45", paymentMethod: "Check", ...GL_REPAIRS, ...vtax("C corporation", "EIN", "2214"), coiMinGeneralLiability: 2000000, workersCompRequired: true, licenseRequired: true, ...vportal("Not invited") },
  [NV.locks.id]: { companyType: "Company", since: D(-2000), preferredContact: "Phone", trades: ["Locksmith"], emergencyAvailable: true, paymentTerms: "Due on receipt", paymentMethod: "Check", ...vtax("Individual / sole proprietor", "SSN", "6643"), licenseRequired: false, notes: "Retired from service after the owner closed the shop.", ...vportal("Disabled", -900) },
  [NV.handyman.id]: { companyType: "Individual", since: D(-500), doNotUseReason: "No-show on two emergency calls and an unlicensed electrical repair.", trades: ["Handyman", "Painting"], paymentTerms: "Due on receipt", paymentMethod: "Check", ...vtax("Individual / sole proprietor", "SSN", "9014"), holdPayments: true, holdReason: "Disputed invoice for incomplete work.", holdSince: D(-150), ...vportal("Not invited") },
  [NV.windows.id]: { companyType: "Individual", since: D(-400), contactTitle: "Owner-operator", preferredContact: "SMS", trades: ["Cleaning"], serviceAreas: ["The Marlowe", "Pioneer Square Office Suites"], daysAvailable: ["Tue", "Thu"], paymentTerms: "Net 10", paymentMethod: "ACH", ...vtax("Individual / sole proprietor", "SSN", "4471"), coiWaived: true, complianceNotes: "COI waived — ground-level and interior glass only; covered under our GL.", licenseRequired: false, ...vportal("Not invited") },
  [NV.elevator.id]: { companyType: "Company", preferred: true, since: D(-1300), contactTitle: "Account manager", afterHoursPhone: "(206) 555-0269", dispatchEmail: "dispatch@emeraldelevator.example", ...vaddr("1900 1st Ave S", "Seattle", "WA", "98134"), trades: ["Elevator", "Fire & life safety"], serviceAreas: ["The Marlowe", "Cascade Lofts", "Pioneer Square Office Suites", "Queen Anne Commons"], emergencyAvailable: true, emergencyResponseHours: 2, responseTimeHours: 4, businessHours: "24/7 dispatch", daysAvailable: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], crewSize: 4, paymentTerms: "Net 30", paymentMethod: "ACH", ...GL_REPAIRS, ...vtax("C corporation", "EIN", "8865"), coiMinGeneralLiability: 5000000, coiRequireAdditionalInsured: true, workersCompRequired: true, licenseRequired: true, ...vportal("Not invited"), [cf("dispatchLine")]: "(206) 555-0269", [cf("segments")]: ["Commercial", "Emergency"] },
};
const VENDOR_PORTAL = Object.fromEntries(Object.entries(VENDOR_META).map(([id, m]) => [id, m.portalStatus]));

// Vendor compliance + reviews live in record_items; insurance_expiry / rating are derived from them.
function applyVendors() {
  const vendors = rows("vendors");
  vendors.push(...Object.values(NV).map((v) => ({
    id: v.id, name: v.name, contact_name: v.contactName, email: v.email, phone: v.phone, specialty: v.specialty,
    rating: 0, hourly_rate: v.hourlyRate, insurance_expiry: null, status: v.status,
  })));
  for (const v of vendors) {
    if (v.id === SUMMIT.id) v.specialty = "Appliance repair";
    if (v.id === EVERGREEN_HVAC.id) v.status = "Preferred";
    v.metadata = { ...(v.metadata || {}), ...VENDOR_META[v.id], portalInviteEmail: v.email };
  }
}

// =====================================================================================
// record_items collector (generic child records; owner_type = the editor's config.key)
// =====================================================================================

const RECORD_ITEMS = [];
const nextItem = counter(85, 1);
const sortOf = new Map();
// item(ownerType, ownerId, kind, { name, status, startsOn, endsOn, amount }, metadata)
function item(ownerType, ownerId, kind, cols, metadata = {}) {
  const k = `${ownerType}|${ownerId}|${kind}`;
  const sort = sortOf.get(k) ?? 0;
  sortOf.set(k, sort + 1);
  const row = {
    id: nextItem(), owner_type: ownerType, owner_id: ownerId, kind, name: cols.name ?? "", status: cols.status ?? null,
    starts_on: cols.startsOn ?? null, ends_on: cols.endsOn ?? null, amount: cols.amount ?? null, sort, metadata,
  };
  RECORD_ITEMS.push(row);
  return row;
}

// =====================================================================================
// Marketing & Leads
// =====================================================================================

const L = (n) => sid(20, n); // sandbox listings
const NL = { gw1: sid(83, 10), gw2: sid(83, 11), a202old: sid(83, 12), gw3: sid(83, 13) };
const PR = (n) => (n <= 11 ? sid(21, n) : sid(83, 100 + n)); // prospects (sandbox 1–11, ours 12+)
const SH = (n) => (n <= 11 ? sid(22, n) : sid(83, 200 + n)); // showings
const AP = (n) => (n <= 8 ? sid(23, n) : sid(83, 300 + n)); // applications
const WL = (n) => (n <= 8 ? sid(24, n) : sid(83, 400 + n)); // waitlist
const RC = (n) => (n <= 10 ? sid(25, n) : sid(83, 500 + n)); // rent comps

// Syndication channels { key: { enabled, status, lastPublishedAt, url } }.
const ch = (status, days, enabled = true) => ({ enabled, status, lastPublishedAt: status === "Off" ? null : T(days, 9), url: "" });
const channels = (spec) => Object.fromEntries(Object.entries(spec).map(([k, v]) => [k, Array.isArray(v) ? ch(...v) : v]));
const CONTACT = (m, phone) => ({ contact_name: m.name, contact_email: email(m), contact_phone: phone });

// Listing patches/additions: id → { cols, meta }
const LISTINGS = {
  [L(1)]: { headline: "Corner loft with 12-ft ceilings, steps from Pike Place", description: "Corner one-bedroom in a converted 1920s warehouse — 12' ceilings, original timber beams, oversized windows and a chef's kitchen with quartz counters. Steps from Pike Place and the waterfront.", ...CONTACT(M.taylor, "(206) 555-0125"), syndicated: true,
    meta: { syndication: channels({ website: ["Published", -20], zillow: ["Published", -20], apartments: ["Published", -19], craigslist: ["Published", -7], rentcom: ["Off", 0, false], facebook: ["Off", 0, false] }), publishedAt: T(-20, 9), lastPublishedAt: T(-7, 9), floor: "2", propertyType: "Apartment", highlights: "Exposed brick and timber beams\n12-foot ceilings\nQuartz kitchen", neighborhood: "Pioneer Square", directions: "Enter from the Pine St side door during the lobby renovation.", fairHousingAck: true, applicationFee: 50, adminFee: 150, holdingDeposit: 500, rentNegotiable: false, pricingTermMonths: 12, leaseTerms: ["12 months", "18 months"], minTermMonths: 12, maxTermMonths: 18, maxOccupants: 3, selfGuidedTours: false, virtualTours: true, petPolicy: "Cats only", petTypes: ["Cats"], maxPets: 2, petDeposit: 300, petRent: 35, features: ["Hardwood floors", "High ceilings", "Updated kitchen", "In-unit laundry"], communityAmenities: ["Elevator", "Bike storage", "Rooftop", "Package lockers"], parking: "Street", laundry: "In unit", heating: "Radiator (steam)", utilitiesIncluded: ["Water", "Heat"], tourProvider: "Matterport", trackingEmail: "l201@leads.harborpine.example", campaign: "Cascade relaunch", marketingBudget: 400, agent: M.taylor.name, officeHours: "Mon–Fri 10–5", responseGoalHours: 2, notes: "Lobby renovation noise limited to 9am–4pm; mention on tours." } },
  [L(2)]: { headline: "Three-bed townhome with garage and private yard", description: "Freshly refinished two-level townhome with an attached garage, fenced yard, in-unit laundry and an ensuite primary. Quiet Tacoma street near Proctor shops.", ...CONTACT(M.tasha, "(253) 555-0140"), syndicated: true,
    meta: { syndication: channels({ website: ["Published", -9], zillow: ["Published", -9], facebook: ["Published", -8], rentcom: ["Queued", -1], apartments: ["Off", 0, false] }), publishedAt: T(-9, 9), lastPublishedAt: T(-1, 9), propertyType: "Townhome", highlights: "Attached garage\nFenced yard\nEnsuite primary", fairHousingAck: true, applicationFee: 50, holdingDeposit: 750, pricingTermMonths: 12, leaseTerms: ["12 months", "18 months"], maxOccupants: 6, selfGuidedTours: true, petPolicy: "Cats and dogs", petTypes: ["Cats", "Small dogs", "Large dogs"], maxPets: 2, petWeightLimit: 80, petDeposit: 400, petRent: 45, features: ["In-unit laundry", "Dishwasher", "Storage", "Updated kitchen"], parking: "Garage", laundry: "In unit", utilitiesIncluded: ["Trash"], agent: M.tasha.name, responseGoalHours: 4 } },
  [L(3)]: { headline: "Corner townhome — pre-leasing for next month", description: "End-unit townhome with extra windows, a two-car tandem garage and a south-facing patio. Current resident moving out; pre-leasing now.", ...CONTACT(M.tasha, "(253) 555-0140"), syndicated: true,
    meta: { syndication: channels({ website: ["Published", -12], zillow: ["Published", -12] }), publishedAt: T(-12, 9), propertyType: "Townhome", fairHousingAck: true, applicationFee: 50, pricingTermMonths: 12, leaseTerms: ["12 months"], moveInFlexible: false, petPolicy: "Cats and dogs", petTypes: ["Cats", "Small dogs", "Large dogs"], features: ["In-unit laundry", "Balcony / patio"], parking: "Garage", laundry: "In unit", agent: M.tasha.name } },
  [L(4)]: { headline: "Split two-bed with balcony at The Marlowe", description: "Split two-bedroom with an ensuite primary, private balcony and in-unit washer/dryer. Rooftop deck, fitness centre and secured parking on site.", ...CONTACT(M.tasha, "(206) 555-0120"), syndicated: true,
    meta: { syndication: channels({ website: ["Published", -10], apartments: ["Published", -10], rentcom: ["Published", -10], zillow: ["Error", -10] }), publishedAt: T(-10, 9), floor: "2", propertyType: "Apartment", highlights: "Ensuite primary\nPrivate balcony\nRooftop deck", fairHousingAck: true, applicationFee: 50, adminFee: 150, pricingTermMonths: 12, leaseTerms: ["6 months", "12 months", "18 months"], selfGuidedTours: true, virtualTours: true, petPolicy: "Cats and dogs", petTypes: ["Cats", "Small dogs"], petWeightLimit: 50, petFee: 350, features: ["In-unit laundry", "Dishwasher", "Balcony / patio", "Walk-in closet"], communityAmenities: ["Fitness center", "Elevator", "Package lockers", "Rooftop", "EV charging", "On-site management"], parking: "Garage", parkingFee: 150, laundry: "In unit", utilitiesIncluded: ["Trash"], agent: M.tasha.name, bookingLink: "", notes: "Zillow rejected the feed — needs two more photos." } },
  [L(5)]: { headline: "Downtown studio with a sleeping alcove", description: "Efficient studio with a separate sleeping alcove. Photos to follow after make-ready.", ...CONTACT(M.tasha, "(206) 555-0120"), syndicated: false,
    meta: { syndication: channels({ website: ["Off", 0, false] }), propertyType: "Studio", applicationFee: 50, leaseTerms: ["6 months", "12 months"], petPolicy: "Cats and dogs", features: ["In-unit laundry", "Dishwasher"], communityAmenities: ["Fitness center", "Rooftop"], laundry: "In unit", agent: M.tasha.name } },
  [L(6)]: { headline: "Top-floor loft with skyline views — furnished option", description: "Top-floor two-bed loft with skyline views, timber beams and a furnished option for 3–9 month stays.", ...CONTACT(M.taylor, "(206) 555-0125"), syndicated: false,
    meta: { syndication: channels({ website: ["Off", 0, false], furnishedFinder: ["Off", 0, false] }), propertyType: "Apartment", furnished: true, midTerm: true, minStayDays: 90, maxStayMonths: 9, furnishedMonthlyRate: 3450, midTermUtilitiesIncluded: true, utilityCap: 200, cleaningFee: 250, linensProvided: true, wifiSpeed: "500 Mbps", furnishingsInventory: "Sofa, queen bed, dining set for 4, desk, linens, cookware", leaseTerms: ["3 months", "6 months", "9 months"], petPolicy: "No pets", agent: M.taylor.name } },
  [L(7)]: { headline: "Renovated two-bed at Pinecrest (post-repair)", description: "Two-bed, one-bath garden apartment with new flooring and cabinets after repairs.", ...CONTACT(M.riley, "(503) 555-0130"), syndicated: false, status: "Paused",
    meta: { syndication: channels({ website: ["Paused", -8], zillow: ["Paused", -8] }), publishedAt: T(-30, 9), unpublishedAt: T(-6, 15), propertyType: "Apartment", applicationFee: 50, petPolicy: "Case by case", agent: M.riley.name, notes: "Paused after the supply-line leak — relist once repairs are signed off." } },
  [L(8)]: { headline: "Garden-level one-bed near transit", description: "Bright one-bedroom on the second floor of the North Building, a short walk to the Division St bus line.", ...CONTACT(M.riley, "(503) 555-0130"), syndicated: false, status: "Leased",
    meta: { syndication: channels({ website: ["Paused", -14], zillow: ["Paused", -14] }), publishedAt: T(-40, 9), lastPublishedAt: T(-30, 9), unpublishedAt: T(-9, 16), leasedOn: D(-3), leasedNote: "Leased to Jamal Carter — draft lease, move-in in three weeks.", propertyType: "Apartment", applicationFee: 50, petPolicy: "Cats only", agent: M.riley.name } },
  [L(9)]: { headline: "Tower B one-bed with walk-in closet", description: "One-bedroom with a walk-in closet and city views in Tower B.", ...CONTACT(M.tasha, "(206) 555-0120"), syndicated: false,
    meta: { syndication: channels({ website: ["Paused", -17], zillow: ["Paused", -17], apartments: ["Paused", -17] }), publishedAt: T(-45, 9), lastPublishedAt: T(-30, 9), leasedOn: D(-17), leasedNote: "Leased to Zoe Nguyen — move-in scheduled.", propertyType: "Apartment", agent: M.tasha.name } },
};
const NEW_LISTINGS = [
  { id: NL.gw1, label: "GW-1", name: "Brand-new end-unit townhome in Greenwood", headline: "Be the first to live here — rooftop deck and tandem garage", description: "Three-level end-unit townhome with a rooftop deck, heat-pump HVAC, quartz kitchen and tandem garage. Six weeks free on 13-month leases.", rent: 3495, available: 0, status: "Active", agent: M.taylor,
    meta: { syndication: channels({ website: ["Published", -12], zillow: ["Published", -12], apartments: ["Published", -11], facebook: ["Published", -11], craigslist: ["Queued", 0] }), publishedAt: T(-12, 9), propertyType: "Townhome", highlights: "Rooftop deck\nTandem garage\nNew construction", fairHousingAck: true, applicationFee: 50, holdingDeposit: 750, pricingTermMonths: 13, leaseTerms: ["12 months", "18 months"], selfGuidedTours: true, petPolicy: "Cats and dogs", petTypes: ["Cats", "Small dogs", "Large dogs"], features: ["In-unit laundry", "Dishwasher", "Air conditioning", "Stainless appliances", "Updated kitchen"], communityAmenities: ["EV charging", "Bike storage"], parking: "Garage", laundry: "In unit", campaign: "Greenwood lease-up", marketingBudget: 1500, trackingPhone: "(206) 555-0129", agent: M.taylor.name } },
  { id: NL.gw2, label: "GW-2", name: "Furnished Greenwood townhome — 1 to 6 month stays", headline: "Fully furnished, utilities included", description: "Move-in-ready furnished townhome for corporate and medical stays — utilities, Wi-Fi and linens included.", rent: 4150, available: 5, status: "Active", agent: M.taylor,
    meta: { syndication: channels({ website: ["Published", -6], furnishedFinder: ["Published", -6], blueground: ["Queued", -1] }), publishedAt: T(-6, 9), propertyType: "Townhome", furnished: true, midTerm: true, minStayDays: 30, maxStayMonths: 6, furnishedMonthlyRate: 4150, midTermUtilitiesIncluded: true, utilityCap: 250, cleaningFee: 300, linensProvided: true, wifiSpeed: "1 Gbps", furnishingsInventory: "Full furniture package, housewares, linens, smart TV", leaseTerms: ["Month-to-month", "3 months", "6 months"], petPolicy: "Cats and dogs", agent: M.taylor.name } },
  { id: NL.a202old, label: "A-202", name: "Two-bed corner at The Marlowe (last year)", headline: "Split two-bed with balcony", description: "Prior listing for A-202 — leased to Lucas Fernández.", rent: 2550, available: -340, status: "Archived", agent: M.tasha, leaseId: sid(10, 4),
    meta: { syndication: channels({ website: ["Paused", -340], apartments: ["Paused", -340] }), publishedAt: T(-380, 9), leasedOn: D(-350), leasedNote: "Leased to Lucas Fernández.", propertyType: "Apartment" } },
  { id: NL.gw3, label: "GW-3", name: "Greenwood townhome — available in two weeks", headline: "Last phase-one home", description: "Final phase-one townhome; punch list in progress.", rent: 3450, available: 18, status: "Draft", agent: M.taylor,
    meta: { syndication: channels({ website: ["Off", 0, false] }), propertyType: "Townhome", agent: M.taylor.name } },
];

// Prospects: [n, name, email, phone, source, unit, listing, budget, move-in, status, created (days ago), meta]
const followups = [];
const PROSPECT_PLAN = [
  [1, "Isabella Moreno", null, null, "Zillow", "L-201", L(1), 2200, 20, "Touring", 6, { preferredContact: "Text", bedrooms: 1, bathrooms: 1, pets: true, petDetails: "One cat", mustHaves: ["Hardwood floors", "High ceilings"], assignedAgent: M.taylor.name, inquiryChannel: "Listing site", inquiryMessage: "Is the loft still available? I have one cat.", [cf("tourDay")]: "Weekday", [cf("leadScore")]: 78 }],
  [2, "Kevin Tran", null, null, "Website", "TH-4", L(2), 3400, 30, "Touring", 5, { preferredContact: "Email", bedrooms: 3, bathrooms: 2, mustHaves: ["In-unit laundry", "Storage"], parkingNeeded: true, assignedAgent: M.tasha.name, inquiryChannel: "Web form", [cf("tourDay")]: "Weekend", [cf("leadScore")]: 64 }],
  [3, "Hana Sato", null, null, "Apartments.com", "A-202", L(4), 2600, 35, "Touring", 8, { preferredContact: "Email", bedrooms: 2, bathrooms: 2, pets: false, mustHaves: ["In-unit laundry", "Balcony / patio"], parkingNeeded: true, assignedAgent: M.tasha.name, inquiryChannel: "Listing site", currentAddress: "Capitol Hill, Seattle", currentRent: 2300, reasonForMoving: "Closer to work", [cf("tourDay")]: "Weekday", [cf("leadScore")]: 81 }],
  [4, "Samuel Osei", null, null, "Referral", "L-401", L(6), 2800, 40, "Touring", 10, { preferredContact: "Phone", bedrooms: 2, furnishedNeeded: true, midTermStay: true, referredBy: "Liam O'Connor", referralBonus: 250, assignedAgent: M.taylor.name, inquiryChannel: "Phone", [cf("leadScore")]: 70 }],
  [5, "Fatima Yusuf", null, null, "Zillow", "L-201", L(1), 2150, 14, "Toured", 12, { preferredContact: "Phone", bedrooms: 1, pets: false, assignedAgent: M.taylor.name, inquiryChannel: "Listing site", notes: "Liked the brick and ceilings; worried about lobby construction noise.", [cf("leadScore")]: 55 }],
  [6, "Diego Alvarez", null, null, "Referral", "TH-3", L(3), 3300, 20, "Toured", 14, { preferredContact: "Text", bedrooms: 3, pets: true, petDetails: "40 lb lab mix", mustHaves: ["Storage", "Balcony / patio"], referredBy: "Noah Schmidt", referralBonus: 250, assignedAgent: M.tasha.name, inquiryChannel: "Phone", holdUnitId: unit("TH-3").id, holdUnit: unit("TH-3").display, holdUntil: D(3), holdDeposit: 500, holdDepositPaid: true, holdStatus: "Active", holdNotes: "Holding TH-3 while he finishes the application.", [cf("leadScore")]: 88 }],
  [7, "Ben Whitaker", null, null, "Social", "TH-4", L(2), 3500, 25, "Applied", 16, { preferredContact: "Email", bedrooms: 3, occupants: 3, pets: true, petDetails: "Small dog", assignedAgent: M.tasha.name, inquiryChannel: "Chat", campaign: "Instagram — fall townhomes", [cf("leadScore")]: 90 }],
  [8, "Jamal Carter", T_.jamal.email, T_.jamal.phone, "Website", "N-201", L(8), 1600, 21, "Converted", 24, { preferredContact: "Email", bedrooms: 1, mustHaves: [], accessibilityNeeds: "", assignedAgent: M.riley.name, inquiryChannel: "Web form", currentAddress: "2210 NE Alberta St, Portland, OR", [cf("leadScore")]: 72 }],
  [9, "Zoe Nguyen", T_.zoe.email, T_.zoe.phone, "Apartments.com", "B-101", L(9), 1900, 14, "Converted", 34, { preferredContact: "Text", bedrooms: 1, pets: false, assignedAgent: M.tasha.name, inquiryChannel: "Listing site", notes: "Signed for B-101 — moving in from Denver.", [cf("leadScore")]: 95 }],
  [10, "Rachel Goldberg", null, null, "Walk-in", "B-201", L(5), 1500, 10, "Lost", 25, { preferredContact: "Phone", lostReason: "Stopped responding", lostAt: D(-7), reengageOn: D(23), lostNotes: "Missed tour, didn't respond to two follow-ups.", [cf("leadScore")]: 20 }],
  [11, "Nathan Brooks-Ellis", "nathan.be@mail.example", "(503) 555-0209", "Apartments.com", "N-201", L(8), 1450, 15, "Lost", 38, { lostReason: "Price too high", lostAt: D(-30), lostCompetitor: "Hawthorne Row", [cf("leadScore")]: 30 }],
  [12, "Wren Castillo", "wren.castillo@mail.example", "(206) 555-0402", "Website", "GW-1", NL.gw1, 3600, 25, "Touring", 2, { preferredContact: "Email", bedrooms: 3, bathrooms: 2, parkingNeeded: true, assignedAgent: M.taylor.name, inquiryChannel: "Web form", firstContactOn: D(-2), [cf("tourDay")]: "Either", [cf("leadScore")]: 74 }],
  [13, "Malik Osborne", "malik.osborne@mail.example", "(206) 555-0415", "Facebook Marketplace", "GW-2", NL.gw2, 4200, 12, "New", 0, { preferredContact: "Text", bedrooms: 3, furnishedNeeded: true, midTermStay: true, inquiryChannel: "Listing site", inquiryMessage: "Need a furnished place for a 4-month hospital rotation.", [cf("leadScore")]: 60 }],
  [14, "Harper Quinn", "harper.quinn@mail.example", "(206) 555-0427", "Referral", "A-202", L(4), 2650, 45, "Contacted", 4, { preferredContact: "Email", bedrooms: 2, referredBy: "Hannah Brooks", referralBonus: 250, assignedAgent: M.tasha.name, inquiryChannel: "Email", lastContactedOn: D(-3), [cf("leadScore")]: 68 }],
  [15, "Theo Park", "theo.park@mail.example", "(206) 555-0433", "Phone call", "B-201", L(5), 1550, 15, "Touring", 6, { preferredContact: "Phone", bedrooms: 0, inquiryChannel: "Phone", assignedAgent: M.tasha.name, lastContactedOn: D(-5), [cf("leadScore")]: 50 }],
  [16, "Imani Okeke", "imani.okeke@mail.example", "(206) 555-0441", "Signage", "GW-1", NL.gw1, 3500, 60, "New", 1, { preferredContact: "Email", bedrooms: 3, inquiryChannel: "Walk-in", inquiryMessage: "Saw the sign on Greenwood Ave — when is the open house?", [cf("leadScore")]: 45 }],
  [17, "Jonah Feldman", "jonah.feldman@mail.example", "(253) 555-0236", "Waitlist", "TH-4", L(2), 3400, 45, "Contacted", 3, { preferredContact: "Email", bedrooms: 3, parkingNeeded: true, assignedAgent: M.tasha.name, inquiryChannel: "Email", lastContactedOn: D(-2), [cf("leadScore")]: 66 }],
  [18, "Sven Larsen", "sven.larsen@mail.example", "(253) 555-0455", "Craigslist", "TH-3", L(3), 3000, 10, "Lost", 40, { lostReason: "Leased elsewhere", lostAt: D(-20), lostCompetitor: "Ruston Ridge Townhomes", [cf("leadScore")]: 25 }],
  [19, "Noor Saleh", "noor.saleh@mail.example", "(206) 555-0468", "Rent.com", "A-202", L(4), 2600, 40, "Contacted", 7, { preferredContact: "Text", bedrooms: 2, consentToText: true, inquiryChannel: "Listing site", lastContactedOn: D(-6), [cf("leadScore")]: 58 }],
  [20, "Felix Moreau", "felix.moreau@mail.example", "(206) 555-0474", "Furnished Finder", "GW-2", NL.gw2, 4200, 20, "New", 0, { preferredContact: "Email", furnishedNeeded: true, midTermStay: true, inquiryChannel: "Listing site", [cf("leadScore")]: 62 }],
  [21, "Ada Kowalczyk", "ada.kowalczyk@mail.example", "(206) 555-0489", "Other", "L-401", L(6), 3500, 30, "New", 1, { preferredContact: "Email", furnishedNeeded: true, inquiryChannel: "Email", campaign: "Corporate housing referral", inquiryMessage: "Relocation desk at a biotech firm — need a furnished two-bed for a new hire.", [cf("leadScore")]: 57 }],
];

const STAGES = ["New", "Contacted", "Touring", "Toured", "Applied", "Converted"];
function stageHistory(n, status, ago) {
  const path = status === "Lost" ? ["New", "Contacted", "Lost"] : STAGES.slice(0, STAGES.indexOf(status) + 1);
  const span = Math.max(1, ago);
  return path.map((to, i) => ({
    id: `sh-${n}-${i + 1}`, from: i ? path[i - 1] : "", to, note: i ? "" : "Lead created",
    at: T(-span + Math.round((span * i) / Math.max(1, path.length - 1)), 10 + i),
  }));
}

// Showings: [n, prospect n, unit, listing, date, "HH:MM", type, agent, status, feedback, meta]
const SHOWING_PLAN = [
  [1, 1, "L-201", L(1), 2, "14:30", "In-person", M.taylor, "Scheduled", "", { partySize: 1, meetingPoint: "Pine St side door", reminderSent: false }],
  [2, 2, "TH-4", L(2), 3, "11:00", "Self-guided", null, "Scheduled", "", { accessCode: "583014", accessCodeStatus: "Active", accessIssuedAt: T(-1, 12), accessDate: D(3), accessFrom: "10:45", accessUntil: "11:45", lockDevice: "Latch R — TH-4 front door", idVerified: true, depositHoldPlaced: true, accessInstructions: "Code works 15 minutes before and after your slot. Lock the door when you leave." }],
  [3, 3, "A-202", L(4), 5, "18:00", "Virtual", M.tasha, "Confirmed", "", { platform: "Zoom", meetingLink: "", virtualNotes: "Resident (Lucas) agreed to a live video walk-through.", confirmedAt: T(-1, 15), confirmationSent: true, residentNotified: true }],
  [4, 4, "L-401", L(6), 6, "10:30", "In-person", M.taylor, "Confirmed", "", { partySize: 2, confirmedAt: T(-2, 11), confirmationSent: true, specialRequests: "Wants to see the furnished package." }],
  [5, 6, "TH-3", L(3), -2, "13:00", "In-person", M.tasha, "Completed", "Loved the yard and garage; asked about pet rent for a 40 lb dog.", { interest: "High", rating: 5, priceReaction: "Fair", liked: "Yard, garage, end-unit light", concerns: "Pet rent", outcome: "Will apply", nextStep: "Send the application link", followUpNeeded: true, followUpOn: D(0), completedAt: D(-2) }],
  [6, 5, "L-201", L(1), -4, "17:30", "In-person", M.taylor, "Completed", "Liked the space, concerned about construction noise in the lobby.", { interest: "Medium", rating: 3, priceReaction: "Too high", liked: "Ceilings and brick", concerns: "Lobby construction noise", outcome: "Thinking it over", followUpNeeded: true, followUpOn: D(-1), completedAt: D(-4) }],
  [7, 7, "TH-4", L(2), -6, "12:00", "Self-guided", null, "Completed", "Applied the same evening.", { interest: "High", rating: 5, priceReaction: "Good value", outcome: "Will apply", completedAt: D(-6), accessCode: "201977", accessCodeStatus: "Expired", accessDate: D(-6), accessFrom: "11:45", accessUntil: "12:45", arrivedAt: "11:52", exitedAt: "12:31", idVerified: true }],
  [8, 6, "TH-4", L(2), -3, "15:00", "In-person", M.samO, "Cancelled", "", { cancelReason: "Prospect cancelled", cancelNotes: "Rescheduled to tour TH-3 instead (earlier availability).", cancelledAt: T(-4, 9) }],
  [9, 10, "B-201", L(5), -9, "16:00", "In-person", M.tasha, "No-show", "", { noShowNotes: "No answer to two calls after 15 minutes.", noShowAt: T(-9, 16) }],
  [10, 8, "N-201", L(8), -12, "10:00", "In-person", M.riley, "Completed", "Wants to move in within three weeks.", { interest: "High", rating: 4, priceReaction: "Good value", outcome: "Will apply", completedAt: D(-12) }],
  [11, 9, "B-101", L(9), -24, "19:00", "Virtual", M.tasha, "Completed", "Toured by video from Denver; applied next day.", { interest: "High", rating: 5, platform: "FaceTime", outcome: "Will apply", completedAt: D(-24), reschedules: [{ from: `${D(-26)} 18:00`, to: `${D(-24)} 19:00`, reason: "Flight delay", at: T(-26, 12) }] }],
  [12, 12, "GW-1", NL.gw1, 0, "17:30", "Self-guided", null, "Scheduled", "", { accessCode: "740219", accessCodeStatus: "Active", accessIssuedAt: T(0, 9), accessDate: D(0), accessFrom: "17:15", accessUntil: "18:15", lockDevice: "Latch R — GW-1", idVerified: true }],
  [13, 15, "B-201", L(5), -1, "10:00", "In-person", M.tasha, "Scheduled", "", { partySize: 1, scheduleNotes: "Unit still in make-ready — show finishes in B-101 if needed." }],
];

// Applications: patches for sandbox 1–8 and one from the waitlist.
const check = (status, result = "", score = null, completedOn = null, notes = "") => ({ status, result, ...(score != null ? { score } : {}), ...(completedOn ? { completedOn: D(completedOn) } : {}), notes });
const ALL_CLEAR = (score, day) => ({ background: check("Complete", "Clear", null, day), credit: check("Complete", "Meets criteria", score, day), eviction: check("Complete", "None found", null, day), income: check("Complete", "Verified", null, day) });
const APPLICATION_PLAN = {
  1: { status: "Submitted", decision: "", applied: -1, listing: L(2), source: "Social", occupants: 3, score: 0, meta: { employmentStatus: "Employed", employer: "Puget Sound Health", position: "Physical therapist", employmentStart: D(-1460), incomeDocs: ["Pay stubs", "Offer letter"], screeningConsent: true, screeningConsentOn: D(-1), leaseTermRequested: "12 months", adults: 2, minors: 1, currentAddress: "4410 N 26th St, Tacoma, WA", emergencyContact: "Laura Whitaker", emergencyPhone: "(253) 555-0288", idType: "Driver's license", idLast4: "6614", screening: { background: check("Not started"), credit: check("Not started"), eviction: check("Not started"), income: check("Not started") }, [cf("heardAbout")]: "Social media", [cf("relocation")]: false } },
  2: { status: "Conditionally approved", decision: "Approved with conditions", applied: -6, listing: L(3), source: "Zillow", occupants: 2, score: 668, meta: { employmentStatus: "Employed", employer: "Tacoma Unified Schools", position: "Teacher", employmentStart: D(-2555), incomeDocs: ["Pay stubs", "Tax return"], screeningConsent: true, screeningConsentOn: D(-6), screeningVendor: "Manual review", screeningRequestedAt: T(-5, 10), screening: { background: check("Complete", "Clear", null, -4), credit: check("Complete", "Thin file", 668, -4, "Limited credit history — two accounts."), eviction: check("Complete", "None found", null, -4), income: check("Complete", "Verified", null, -3) }, decidedOn: D(-1), decidedBy: M.jordan.name, decisionNotes: "Approve with a cosigner or an extra half-month deposit.", decisionConditions: { extraDeposit: 1625, cosignerRequired: false, rentAdjustment: 0, other: "Or provide a cosigner earning 4× rent." }, leaseTermRequested: "12 months", [cf("heardAbout")]: "Listing site" } },
  3: { status: "Screening", decision: "", applied: -3, listing: L(1), source: "Website", occupants: 1, score: 712, meta: { employmentStatus: "Employed", employer: "Northlake Design Studio", position: "UX designer", employmentStart: D(-730), incomeDocs: ["Pay stubs", "Bank statements"], screeningConsent: true, screeningConsentOn: D(-3), screeningVendor: "Manual review", screeningReference: "MR-2210", screeningRequestedAt: T(-3, 15), screening: { background: check("In progress"), credit: check("Complete", "Meets criteria", 712, -2), eviction: check("Requested"), income: check("In progress", "Partially verified", null, null, "Waiting on the second pay stub.") }, [cf("heardAbout")]: "Search engine" } },
  4: { status: "Approved", decision: "Approved", applied: -5, listing: L(4), source: "Apartments.com", occupants: 2, score: 748, meta: { employmentStatus: "Employed", employer: "Harborline Logistics", position: "Operations manager", employmentStart: D(-1825), incomeDocs: ["Pay stubs", "Offer letter"], screeningConsent: true, screeningConsentOn: D(-5), screeningRequestedAt: T(-5, 12), screening: ALL_CLEAR(748, -3), decidedOn: D(-1), decidedBy: M.alex.name, decisionNotes: "Meets every criterion. Lease to start when A-202 turns.", leaseTermRequested: "12 months", [cf("heardAbout")]: "Listing site", [cf("relocation")]: true } },
  5: { status: "Converted", decision: "Approved with conditions", applied: -9, listing: L(8), source: "Website", occupants: 1, score: 655, tenant: T_.jamal.id, lease: sid(10, 17), meta: { employmentStatus: "Employed", employer: "Rose City Transit", position: "Mechanic", employmentStart: D(-365), incomeDocs: ["Pay stubs"], screeningConsent: true, screeningConsentOn: D(-9), screeningRequestedAt: T(-9, 11), screening: { background: check("Complete", "Clear", null, -7), credit: check("Complete", "Below criteria", 655, -7, "Score above floor but income only 2.8× rent."), eviction: check("Complete", "None found", null, -7), income: check("Complete", "Verified", null, -6) }, decidedOn: D(-5), decidedBy: M.jordan.name, decisionNotes: "Approved on condition of an additional half-month deposit and a guarantor.", decisionConditions: { extraDeposit: 775, cosignerRequired: true, rentAdjustment: 0, other: "Guarantor: Curtis Carter." }, convertedAt: T(-3, 14), currentAddress: "2210 NE Alberta St, Portland, OR", [cf("heardAbout")]: "Search engine" } },
  6: { status: "Converted", decision: "Approved", applied: -20, listing: L(9), source: "Apartments.com", occupants: 1, score: 781, tenant: T_.zoe.id, lease: sid(10, 16), meta: { employmentStatus: "Employed", employer: "Cedar & Sound Architects", position: "Project architect", employmentStart: D(-1100), incomeDocs: ["Offer letter", "Pay stubs"], screeningConsent: true, screeningConsentOn: D(-20), screeningRequestedAt: T(-20, 10), screening: ALL_CLEAR(781, -19), decidedOn: D(-18), decidedBy: M.alex.name, decisionNotes: "Meets all criteria — income 3.5× rent, strong rental history.", convertedAt: T(-17, 11), currentAddress: "1580 Pearl St, Denver, CO", [cf("relocation")]: true, [cf("heardAbout")]: "Listing site" } },
  7: { status: "Withdrawn", decision: "", feePaid: false, applied: -11, listing: L(6), source: "Referral", occupants: 1, score: 735, meta: { employmentStatus: "Employed", employer: "Emerald Bay Credit Union", position: "Analyst", screening: { background: check("Complete", "Clear", null, -9), credit: check("Complete", "Meets criteria", 735, -9), eviction: check("Complete", "None found", null, -9), income: check("Not started") }, withdrawnOn: D(-8), notes: "Withdrew — accepted a job offer in Spokane." } },
  8: { status: "Denied", decision: "Denied", applied: -14, listing: L(5), source: "Craigslist", occupants: 1, score: 542, meta: { employmentStatus: "Employed", employer: "Seasonal retail", screeningConsent: true, screeningConsentOn: D(-14), screening: { background: check("Complete", "Records found", null, -12), credit: check("Complete", "Below criteria", 542, -12), eviction: check("Complete", "Eviction found", null, -12, "Prior eviction (2023)."), income: check("Complete", "Unverified", null, -12) }, decidedOn: D(-10), decidedBy: M.alex.name, decisionNotes: "Prior eviction and income below 2.5× rent.", adverseAction: { reasons: ["Eviction history", "Insufficient income", "Credit history"], noticeSentOn: D(-10), reportUsed: true, notes: "Adverse-action notice emailed with the screening agency's contact details." }, evictedBefore: true } },
};
const NEW_APPLICATION = { n: 9, name: "Priyanka Desai", email: "priyanka.desai@mail.example", phone: "(206) 555-0257", label: "B-201", moveIn: 14, income: 5400, status: "Submitted", applied: 0, listing: L(5), source: "Waitlist", occupants: 1, score: 0, paid: true,
  meta: { employmentStatus: "Employed", employer: "Swedish Medical Center", position: "Pharmacist", employmentStart: D(-900), incomeDocs: ["Pay stubs"], screeningConsent: true, screeningConsentOn: D(0), leaseTermRequested: "12 months", screening: { background: check("Not started"), credit: check("Not started"), eviction: check("Not started"), income: check("Not started") }, [cf("heardAbout")]: "Friend or family" } };

// Waitlist: patches for sandbox 1–8 plus a transfer and an employee request.
const WAITLIST_PLAN = {
  1: { status: "Declined", position: 0, bedrooms: 2, budget: 2700, unitLabel: "A-202", meta: { preferredContact: "Email", consentToNotify: true, priority: "Standard", offers: [{ id: "of-1-1", unitId: unit("A-202").id, unit: unit("A-202").display, rent: 2595, offeredAt: T(-8, 10), respondBy: D(-3), status: "Declined", note: "Wanted a higher floor.", respondedAt: T(-4, 12) }], lastNotifiedAt: T(-8, 10), notifyCount: 2, notes: "Declined A-202; prefers floors 4+." } },
  2: { status: "Waiting", position: 1, bedrooms: 3, budget: 3450, prospect: PR(17), meta: { preferredContact: "Email", consentToNotify: true, priority: "High", priorityReason: "Pre-approved; flexible move-in.", flexibleMoveIn: true, parkingNeeded: true, occupants: 3, expiresOn: D(120), lastNotifiedAt: T(-2, 9), notifyCount: 1 } },
  3: { status: "Converted", position: 0, bedrooms: 0, budget: 1600, application: AP(9), meta: { preferredContact: "Email", priority: "Standard", lastNotifiedAt: T(-1, 9), notifyCount: 1, notes: "Converted to an application for B-201." } },
  4: { status: "Waiting", position: 1, bedrooms: 2, budget: 2100, meta: { preferredContact: "Phone", consentToNotify: true, priority: "Accessibility", priorityReason: "Needs a ground-floor unit (mobility).", accessibleUnit: true, pets: true, occupants: 2, waitlistFee: 25, feePaid: true } },
  5: { status: "Offered", position: 1, bedrooms: 1, budget: 2200, unitLabel: "L-201", meta: { preferredContact: "Text", consentToNotify: true, priority: "Standard", offers: [{ id: "of-5-1", unitId: unit("L-201").id, unit: unit("L-201").display, rent: 2100, offeredAt: T(-1, 11), respondBy: D(3), status: "Pending", note: "Includes the 50%-off first month special." }], lastNotifiedAt: T(-1, 11), notifyCount: 3 } },
  6: { status: "Waiting", position: 1, bedrooms: 3, budget: 4300, meta: { preferredContact: "Email", consentToNotify: true, priority: "Standard", flexibleMoveIn: true, occupants: 5, pets: true, expiresOn: D(200) } },
  7: { status: "Placed", position: 0, bedrooms: 1, budget: 1950, unitLabel: "B-101", prospect: PR(9), application: AP(6), meta: { preferredContact: "Text", priority: "Standard", placedOn: D(-17), notes: "Placed in B-101." } },
  8: { status: "Removed", position: 0, bedrooms: 1, budget: 1500, meta: { removedReason: "Found housing elsewhere", removedNotes: "Signed at a building closer to OHSU.", removedOn: D(-40), priority: "Standard" } },
};
const NEW_WAITLIST = [
  { n: 9, name: "Daniel Okafor", email: T_.daniel.email, phone: T_.daniel.phone, prop: ALDER, preference: "3BR townhome — growing family", moveIn: 120, joined: 15, status: "Waiting", position: 2, bedrooms: 3, budget: 3400, meta: { preferredContact: "Email", consentToNotify: true, priority: "Transfer", priorityReason: "Current Marlowe resident (A-102) in good standing.", occupants: 3, flexibleMoveIn: true } },
  { n: 10, name: "Casey Nolan", email: email(M.casey), phone: "(206) 555-0110", prop: MARLOWE, preference: "Studio or 1BR", moveIn: 60, joined: 9, status: "Waiting", position: 1, bedrooms: 0, budget: 1600, meta: { preferredContact: "Text", priority: "Employee", priorityReason: "Staff housing benefit — 10% employee discount.", occupants: 1 } },
];

// Rent comp detail; observations become record_items.
const COMP_PLAN = {
  1: { address: "1510 5th Ave, Seattle, WA", source: "Zillow", meta: { propertyType: "Apartment", yearBuilt: 2017, totalUnits: 210, classRating: "A", occupancyPct: 95, laundry: "In unit", parking: "Garage", parkingFee: 225, deposit: 1500, applicationFee: 50, petRent: 50, features: ["In-unit laundry", "Dishwasher", "Air conditioning"], communityAmenities: ["Fitness center", "Elevator", "Doorman"], utilitiesIncluded: ["Trash"], neighborhood: "Denny Triangle" }, obs: [[-180, 1875, ""], [-90, 1895, ""], [-6, 1925, ""]] },
  2: { address: "2201 Western Ave, Seattle, WA", source: "Site visit", meta: { propertyType: "Apartment", yearBuilt: 2021, totalUnits: 168, classRating: "A", occupancyPct: 91, concessions: "Two weeks free on 13-month leases", concessionValue: 104, laundry: "In unit", parking: "Garage", features: ["In-unit laundry", "Balcony / patio", "Stainless appliances"], communityAmenities: ["Rooftop", "Fitness center", "Doorman"], notes: "Newer build; two weeks free on 13-month leases." }, obs: [[-120, 2750, "No specials"], [-12, 2695, "Two weeks free"]] },
  3: { address: "1820 3rd Ave, Seattle, WA", source: "Apartments.com", meta: { propertyType: "Studio", yearBuilt: 1999, classRating: "B", laundry: "Shared on site", parking: "Street" }, obs: [[-95, 1425, ""], [-9, 1450, ""]] },
  4: { address: "4620 SE Division St, Portland, OR", source: "Zillow", meta: { propertyType: "Apartment", yearBuilt: 1996, classRating: "B", occupancyPct: 97, laundry: "Shared on site", parking: "Off-street", features: ["Dishwasher"], communityAmenities: ["On-site management"] }, obs: [[-200, 1875, ""], [-15, 1925, ""]] },
  5: { address: "3520 SE Hawthorne Blvd, Portland, OR", source: "Apartments.com", meta: { propertyType: "Apartment", yearBuilt: 2008, classRating: "B", laundry: "In unit", parking: "Street" }, obs: [[-140, 1550, ""], [-20, 1595, ""]] },
  6: { address: "512 N Ruston Way, Tacoma, WA", source: "Zillow", meta: { propertyType: "Townhome", yearBuilt: 2012, totalUnits: 24, classRating: "B", laundry: "In unit", parking: "Garage", features: ["In-unit laundry", "Storage"], communityAmenities: ["Dog park"] }, obs: [[-160, 3150, ""], [-8, 3195, ""]] },
  7: { address: "2702 N Proctor St, Tacoma, WA", source: "Site visit", meta: { propertyType: "Townhome", classRating: "A", utilitiesIncluded: ["Water", "Sewer", "Trash"], notes: "Includes water/sewer/garbage — adjust ~$90 when comparing." }, obs: [[-210, 3300, ""], [-25, 3350, ""]] },
  8: { address: "16 156th Ave SE, Bellevue, WA", source: "Phone survey", meta: { propertyType: "House", yearBuilt: 1984, laundry: "Hookups", parking: "Garage", features: ["Fireplace", "Hardwood floors"] }, obs: [[-365, 3950, ""], [-30, 4100, ""]] },
  9: { address: "118 Occidental Ave S, Seattle, WA", source: "Site visit", meta: { propertyType: "Apartment", yearBuilt: 1910, classRating: "B", renovated: true, laundry: "In unit", parking: "Street", features: ["Hardwood floors", "High ceilings"], communityAmenities: ["Bike storage", "Elevator"] }, obs: [[-100, 2150, ""], [-4, 2195, ""]] },
  10: { address: "1300 Western Ave, Seattle, WA", source: "Zillow", meta: { propertyType: "Apartment", classRating: "B", notes: "Stale — building converted to condos." }, obs: [[-400, 2600, ""], [-200, 2650, ""]] },
};
const NEW_COMPS = [
  { n: 11, name: "Phinney Ridge Townhomes · 3BR", prop: NP.greenwood, address: "6700 Phinney Ave N, Seattle, WA", distance: 0.9, beds: 3, baths: 2.5, sqft: 1500, rent: 3550, source: "Broker", observed: -3, status: "Active", meta: { propertyType: "Townhome", yearBuilt: 2024, totalUnits: 12, classRating: "A", occupancyPct: 83, concessions: "One month free", concessionValue: 296, laundry: "In unit", parking: "Garage", features: ["In-unit laundry", "Air conditioning", "Updated kitchen"], contactName: "Erin Cole (Windermere)", contactPhone: "(206) 555-0491" }, obs: [[-60, 3650, "Two weeks free"], [-3, 3550, "One month free"]] },
  { n: 12, name: "Jackson Street Lofts · office", prop: NP.pioneer, address: "220 S Jackson St, Seattle, WA", distance: 0.2, beds: 0, baths: 1, sqft: 2200, rent: 6600, source: "Craigslist", observed: -14, status: "Active", meta: { propertyType: "Apartment", yearBuilt: 1914, classRating: "B", otherAmenities: "NNN; CAM ≈ $11/sf/yr", notes: "Office comp — quoted $36/sf/yr NNN." }, obs: [[-90, 6800, ""], [-14, 6600, "Four months free on a 5-year deal"]] },
];

function applyMarketing() {
  // Listings.
  for (const l of rows("listings")) {
    const p = LISTINGS[l.id];
    if (!p) continue;
    const u = ALL_UNITS.find((x) => x.id === l.unit_id);
    const { meta, ...cols } = p;
    const { description: _legacy, promotions: _p, syndication: _s, ...keep } = l.metadata || {};
    Object.assign(l, cols, { deposit: u.deposit, sqft: u.sqft, available_on: null, property_label: null, lease_id: ({ [L(8)]: sid(10, 17), [L(9)]: sid(10, 16) })[l.id] ?? null });
    l.metadata = { ...keep, ...meta };
  }
  rows("listings").push(...NEW_LISTINGS.map((x) => {
    const u = unit(x.label);
    return {
      id: x.id, name: x.name, headline: x.headline, description: x.description, property_id: u.propertyId, property_name: u.propertyName,
      unit_id: u.id, unit: u.display, rent: x.rent, deposit: u.deposit, available_date: D(x.available), bedrooms: u.bedrooms,
      bathrooms: u.bathrooms, sqft: u.sqft, syndicated: x.status === "Active", status: x.status, lease_id: x.leaseId ?? null,
      ...CONTACT(x.agent, "(206) 555-0128"), metadata: x.meta,
      created_at: T(Math.min(-1, x.available - 20), 9),
    };
  }));
  // Listing specials.
  item("listing", L(1), "special", { name: "First month 50% off", status: "Active", amount: 1050, startsOn: D(-20), endsOn: D(30) }, { specialType: "Dollars off", minTermMonths: 12, conditions: "Lease signed by month-end during the lobby renovation." });
  item("listing", L(2), "special", { name: "Look-and-lease", status: "Active", amount: 500, startsOn: D(-9), endsOn: D(21) }, { specialType: "Dollars off", minTermMonths: 12, conditions: "Apply within 48 hours of your tour." });
  item("listing", L(4), "special", { name: "Reduced deposit", status: "Active", amount: 500, startsOn: D(-10), endsOn: D(40) }, { specialType: "Reduced deposit", conditions: "Credit score 700+." });
  item("listing", L(4), "special", { name: "Summer special", status: "Inactive", amount: 2, startsOn: D(-120), endsOn: D(-60) }, { specialType: "Weeks free", minTermMonths: 13, conditions: "Expired summer promotion." });
  item("listing", NL.gw1, "special", { name: "Six weeks free", status: "Active", amount: 6, startsOn: D(-12), endsOn: D(60) }, { specialType: "Weeks free", minTermMonths: 13, conditions: "13-month lease, signed during lease-up." });
  item("listing", NL.gw1, "special", { name: "Waived admin fee", status: "Active", amount: 150, startsOn: D(-12), endsOn: D(60) }, { specialType: "Waived fee" });
  item("listing", NL.gw2, "special", { name: "Welcome gift card", status: "Active", amount: 200, startsOn: D(-6), endsOn: D(45) }, { specialType: "Gift card", conditions: "Stays of 3+ months." });
  item("listing", L(3), "special", { name: "5% off for 18 months", status: "Active", amount: 5, startsOn: D(-12), endsOn: D(20) }, { specialType: "Percent off", minTermMonths: 18 });
  item("listing", L(6), "special", { name: "First month free (furnished)", status: "Active", amount: 1, startsOn: D(-5), endsOn: D(40) }, { specialType: "Months free", minTermMonths: 6 });

  // Prospects.
  const prospects = rows("prospects");
  for (const [n, name, em, phone, source, label, listing, budget, moveIn, status, ago, meta] of PROSPECT_PLAN) {
    const u = unit(label);
    const lst = byId("listings", listing);
    const cols = {
      name, source, unit_id: u.id, unit: u.display, property_id: u.propertyId, property_name: u.propertyName, listing_id: listing,
      listing_name: lst?.name || "", budget, move_in_date: D(moveIn), status,
      created_at: T(-ago, 9), updated_at: T(-Math.max(0, ago - 1), 15),
    };
    const { budgetMin, ...rest } = meta;
    const full = { ...rest, budgetMin: budgetMin ?? Math.round(budget * 0.85 / 50) * 50, firstContactOn: rest.firstContactOn || D(-ago), stageHistory: stageHistory(n, status, ago), consentToText: rest.consentToText ?? rest.preferredContact === "Text" };
    if (n <= 11) {
      const row = must("prospects", PR(n));
      const { followups: _f, mustHaves: _m, ...keep } = row.metadata || {};
      Object.assign(row, cols, { email: em ?? row.email, phone: phone ?? row.phone });
      row.metadata = { ...keep, ...full };
    } else {
      prospects.push({ id: PR(n), email: em, phone, ...cols, metadata: full });
    }
  }
  // Prospect follow-ups (some overdue, some done) and quotes.
  const fu = (n, name, due, status, channel, assignee, outcome = "") => item("prospect", PR(n), "follow_up", { name, startsOn: D(due), status }, { channel, assignee: assignee.name, outcome });
  fu(1, "Confirm Thursday tour time", 1, "Open", "Text", M.taylor);
  fu(2, "Send self-guided tour instructions", 2, "Open", "Email", M.tasha);
  fu(3, "Send The Birch floor plan", -2, "Done", "Email", M.tasha, "Sent; she liked the split layout.");
  fu(3, "Confirm virtual tour with the resident", 4, "Open", "Call", M.tasha);
  fu(5, "Check in after the tour", -1, "Open", "Call", M.taylor);
  fu(6, "Send application link", 0, "Open", "Text", M.tasha);
  fu(10, "Second follow-up after missed tour", -6, "Skipped", "Call", M.tasha, "No answer — marked lost.");
  fu(12, "Confirm self-guided code works", 0, "Open", "Text", M.taylor);
  fu(13, "Reply with furnished availability", -1, "Open", "Text", M.taylor);
  fu(14, "Book a tour of A-202", 2, "Open", "Email", M.tasha);
  fu(15, "Log outcome of the B-201 tour", -1, "Open", "Call", M.tasha);
  fu(16, "Invite to the Saturday open house", 3, "Open", "Email", M.taylor);
  fu(17, "Offer TH-4 tour from the waitlist", 1, "Open", "Email", M.tasha);
  fu(19, "Text pricing for A-202", -3, "Open", "Text", M.tasha);
  fu(20, "Send furnished package photos", 1, "Open", "Email", M.taylor);
  fu(21, "Call the relocation desk", 0, "Open", "Call", M.taylor);
  fu(11, "Re-engage in the spring", 120, "Open", "Email", M.riley);
  const quote = (n, label, rent, quoted, expires, status, extra = {}) => {
    const u = unit(label);
    item("prospect", PR(n), "quote", { name: `${u.label} quote`, amount: rent, startsOn: D(quoted), endsOn: D(expires), status }, { unitId: u.id, unit: u.display, propertyId: u.propertyId, propertyName: u.propertyName, termMonths: 12, deposit: u.deposit, ...extra });
  };
  quote(3, "A-202", 2595, -3, 11, "Sent", { concessions: "Reduced deposit ($500 off)", quoteNotes: "12-month term; parking stall +$150." });
  quote(6, "TH-3", 3250, -2, 5, "Sent", { termMonths: 18, concessions: "5% off for 18 months", quoteNotes: "Pet rent $45/mo for the dog." });
  quote(6, "TH-4", 3395, -9, -2, "Expired", { quoteNotes: "Superseded by the TH-3 quote." });
  quote(7, "TH-4", 3395, -6, 8, "Accepted", { concessions: "Look-and-lease $500 off" });
  quote(9, "B-101", 1850, -22, -15, "Accepted");
  quote(5, "L-201", 2100, -4, 10, "Declined", { quoteNotes: "Construction noise concern." });
  quote(4, "L-401", 3450, -1, 13, "Draft", { termMonths: 6, quoteNotes: "Furnished rate, utilities capped at $200." });

  // Showings.
  const showings = rows("showings");
  for (const [n, pn, label, listing, date, time, type, agent, status, feedback, meta] of SHOWING_PLAN) {
    const u = unit(label);
    const p = must("prospects", PR(pn));
    const cols = {
      name: `${p.name} · ${u.propertyName} ${u.label}`, prospect_id: p.id, prospect_name: p.name, prospect_contact: p.phone || p.email || "",
      listing_id: listing, listing_name: byId("listings", listing)?.name || "", property_id: u.propertyId, property_name: u.propertyName,
      unit_id: u.id, unit: u.display, showing_date: D(date), showing_time: time, duration_minutes: type === "Virtual" ? 30 : type === "Self-guided" ? 60 : 30,
      showing_type: type, agent: agent ? agent.name : "", feedback, status,
      scheduled_for: null, scheduled_time: null,
    };
    if (n <= 11) {
      const row = must("showings", SH(n));
      Object.assign(row, cols);
      const { feedback: _f, ...keep } = row.metadata || {};
      row.metadata = { ...keep, ...meta };
    } else {
      showings.push({ id: SH(n), ...cols, metadata: meta, created_at: T(Math.min(date, 0) - 2, 10) });
    }
  }

  // Applications.
  const unitRent = (label) => unit(label).rent;
  for (const [n, plan] of Object.entries(APPLICATION_PLAN)) {
    const row = must("applications", AP(Number(n)));
    const u = ALL_UNITS.find((x) => x.id === row.unit_id);
    const { creditScore: _c, backgroundCheck: _b, evictionHistory: _e, incomeVerified: _i, coApplicants: _co, decisionReason: _d, convertedTenantId: _t, convertedLeaseId: _l, ...keep } = row.metadata || {};
    Object.assign(row, {
      applicant_name: row.name, property_label: u.propertyName, property_id: u.propertyId, listing_id: plan.listing,
      listing_name: byId("listings", plan.listing)?.name || "", source: plan.source, occupants: plan.occupants, status: plan.status,
      decision: plan.decision, score: plan.score, fee_paid: plan.feePaid ?? row.fee_paid, applied_on: D(plan.applied), requested_lease_start: row.move_in_date,
      tenant_id: plan.tenant ?? null, lease_id: plan.lease ?? null, created_at: T(plan.applied, 14), updated_at: T(Math.min(0, plan.applied + 2), 16),
    });
    row.metadata = { ...keep, quotedRent: unitRent(u.label), ...plan.meta };
  }
  {
    const a = NEW_APPLICATION;
    const u = unit(a.label);
    rows("applications").push({
      id: AP(a.n), name: a.name, applicant_name: a.name, email: a.email, phone: a.phone, unit_id: u.id, unit: u.display, property_id: u.propertyId,
      property_label: u.propertyName, listing_id: a.listing, listing_name: byId("listings", a.listing)?.name || "", source: a.source,
      monthly_income: a.income, occupants: a.occupants, move_in_date: D(a.moveIn), requested_lease_start: D(a.moveIn), application_fee: 50,
      fee_paid: a.paid, prospect_id: null, status: a.status, decision: "", score: 0, applied_on: D(a.applied), tenant_id: null, lease_id: null,
      metadata: { quotedRent: u.rent, ...a.meta }, created_at: T(0, 8), updated_at: T(0, 8),
    });
  }
  // Application child records.
  const app = (n) => AP(n);
  item("application", app(1), "co_applicant", { name: "Laura Whitaker", amount: 4200, status: "Requested" }, { role: "tenant", relationship: "Spouse", email: "laura.whitaker@mail.example", phone: "(253) 555-0288", employer: "Tacoma Public Library" });
  item("application", app(1), "occupant", { name: "Eli Whitaker" }, { relationship: "Child", dateOfBirth: "2019-05-14", minor: true });
  item("application", app(1), "pet", { name: "Pip" }, { petType: "Dog", breed: "Corgi", weightLbs: 26, assistanceAnimal: false, vaccinated: true });
  item("application", app(1), "vehicle", { name: "Subaru Forester" }, { year: 2021, color: "Gray", plate: "CFD8812", plateState: "WA" });
  item("application", app(1), "residence", { name: "4410 N 26th St, Tacoma, WA", status: "Current", startsOn: D(-1100), amount: 2650 }, { ownership: "Rent", landlordName: "Proctor Property Group", landlordPhone: "(253) 555-0610", reasonForLeaving: "Need a third bedroom", verified: false });
  item("application", app(1), "reference", { name: "Proctor Property Group", status: "Left message" }, { relationship: "Landlord", phone: "(253) 555-0610" });
  item("application", app(1), "fee", { name: "Application fee", amount: 50, status: "Due", startsOn: D(-1) }, { feeKind: "Application fee" });
  item("application", app(2), "fee", { name: "Application fee", amount: 50, status: "Paid", startsOn: D(-6) }, { feeKind: "Application fee", method: "Card", reference: "ch_demo_2" });
  item("application", app(2), "residence", { name: "1120 S 11th St, Tacoma, WA", status: "Current", startsOn: D(-1500), amount: 1850 }, { ownership: "Rent", landlordName: "Hilltop Rentals", verified: true });
  item("application", app(2), "reference", { name: "Hilltop Rentals", status: "Verified" }, { relationship: "Landlord", phone: "(253) 555-0622", notes: "On-time payer for four years." });
  item("application", app(2), "reference", { name: "Dr. Alan Pierce", status: "Verified" }, { relationship: "Employer", phone: "(253) 555-0629" });
  item("application", app(3), "fee", { name: "Application fee", amount: 50, status: "Paid", startsOn: D(-3) }, { feeKind: "Application fee", method: "Card" });
  item("application", app(3), "fee", { name: "Holding deposit", amount: 500, status: "Paid", startsOn: D(-3) }, { feeKind: "Holding deposit", method: "ACH", reference: "Applied to move-in if approved" });
  item("application", app(3), "residence", { name: "2400 Eastlake Ave E, Seattle, WA", status: "Current", startsOn: D(-700), amount: 1795 }, { ownership: "Rent", landlordName: "Lake Union Living", verified: false });
  item("application", app(3), "residence", { name: "Family home, Spokane, WA", status: "Previous", startsOn: D(-2500), endsOn: D(-701), amount: 0 }, { ownership: "Family" });
  item("application", app(3), "reference", { name: "Lake Union Living", status: "Not contacted" }, { relationship: "Landlord" });
  item("application", app(4), "co_applicant", { name: "Maja Lindqvist", amount: 3900, status: "Complete" }, { role: "tenant", relationship: "Spouse", email: "maja.lindqvist@mail.example", phone: "(206) 555-0220", employer: "Fred Hutch" });
  item("application", app(4), "fee", { name: "Application fee", amount: 50, status: "Paid", startsOn: D(-5) }, { feeKind: "Application fee", method: "ACH" });
  item("application", app(4), "fee", { name: "Screening fee — co-applicant", amount: 35, status: "Waived", startsOn: D(-5) }, { feeKind: "Screening fee", waiveReason: "Spouse screened on the same report." });
  item("application", app(4), "reference", { name: "Harborline Logistics HR", status: "Verified" }, { relationship: "Employer", phone: "(206) 555-0640" });
  item("application", app(5), "co_applicant", { name: "Curtis Carter", amount: 6800, status: "Complete" }, { role: "guarantor", relationship: "Parent", email: "curtis.carter@mail.example", phone: "(503) 555-1866", employer: "Daimler Trucks" });
  item("application", app(5), "fee", { name: "Application fee", amount: 50, status: "Paid", startsOn: D(-9) }, { feeKind: "Application fee", method: "Card" });
  item("application", app(5), "residence", { name: "2210 NE Alberta St, Portland, OR", status: "Current", startsOn: D(-900), amount: 1350 }, { ownership: "Rent", landlordName: "Alberta Arts Apartments", verified: true });
  item("application", app(6), "fee", { name: "Application fee", amount: 50, status: "Paid", startsOn: D(-20) }, { feeKind: "Application fee", method: "Card" });
  item("application", app(6), "fee", { name: "Admin fee", amount: 150, status: "Paid", startsOn: D(-17) }, { feeKind: "Admin fee", method: "ACH" });
  item("application", app(6), "residence", { name: "1580 Pearl St, Denver, CO", status: "Current", startsOn: D(-800), amount: 1700 }, { ownership: "Rent", landlordName: "Pearl Street Flats", verified: true });
  item("application", app(6), "reference", { name: "Pearl Street Flats", status: "Verified" }, { relationship: "Landlord", notes: "Would rent to her again." });
  item("application", app(7), "fee", { name: "Application fee", amount: 50, status: "Refunded", startsOn: D(-11) }, { feeKind: "Application fee", method: "Card", reference: "Refunded on withdrawal (goodwill)" });
  item("application", app(8), "fee", { name: "Application fee", amount: 50, status: "Paid", startsOn: D(-14) }, { feeKind: "Application fee", method: "Money order" });
  item("application", app(8), "reference", { name: "Prior landlord (2023)", status: "Negative" }, { relationship: "Landlord", notes: "Eviction judgment for nonpayment." });
  item("application", app(9), "fee", { name: "Application fee", amount: 50, status: "Paid", startsOn: D(0) }, { feeKind: "Application fee", method: "Card" });

  // Waitlist.
  for (const [n, plan] of Object.entries(WAITLIST_PLAN)) {
    const row = must("waitlist_entries", WL(Number(n)));
    const u = plan.unitLabel ? unit(plan.unitLabel) : null;
    Object.assign(row, {
      status: plan.status, position: plan.position, desired_bedrooms: plan.bedrooms, budget: plan.budget, joined_on: (row.created_at || T(-30)).slice(0, 10),
      unit_id: u?.id ?? null, unit: u?.display ?? "", prospect_id: plan.prospect ?? null, application_id: plan.application ?? null,
      prospect_name: null, contact: null, desired_unit: null,
    });
    row.metadata = { ...(row.metadata || {}), ...plan.meta };
  }
  rows("waitlist_entries").push(...NEW_WAITLIST.map((w) => ({
    id: WL(w.n), name: w.name, email: w.email, phone: w.phone, property_id: w.prop.id, property_name: w.prop.name, unit_preference: w.preference,
    move_in_date: D(w.moveIn), position: w.position, status: w.status, desired_bedrooms: w.bedrooms, budget: w.budget, joined_on: D(-w.joined),
    unit_id: null, unit: "", prospect_id: null, application_id: null, metadata: w.meta, created_at: T(-w.joined, 11), updated_at: T(-w.joined, 11),
  })));

  // Rent comps + observations.
  const obs = (id, list) => list.forEach(([days, amount, concessions]) => item("rent_comp", id, "observation", { name: "Site visit", startsOn: D(days), amount }, { concessions, daysOnMarket: Math.abs(days) % 40, observationNotes: "" }));
  for (const [n, plan] of Object.entries(COMP_PLAN)) {
    const row = must("rent_comps", RC(Number(n)));
    const { address: _a, amenities: _am, ...keep } = row.metadata || {};
    Object.assign(row, { address: plan.address, source: plan.source, comp_date: null });
    row.metadata = { ...keep, ...plan.meta };
    obs(row.id, plan.obs.map(([d, a, c]) => [d, a, c]));
    RECORD_ITEMS.filter((r) => r.owner_id === row.id).forEach((r) => (r.name = plan.source));
  }
  for (const c of NEW_COMPS) {
    rows("rent_comps").push({
      id: RC(c.n), name: c.name, property_id: c.prop.id, property_name: c.prop.name, address: c.address, distance_mi: c.distance,
      bedrooms: c.beds, bathrooms: c.baths, sqft: c.sqft, rent: c.rent, source: c.source, observed_date: D(c.observed), status: c.status, metadata: c.meta,
    });
    obs(RC(c.n), c.obs);
    RECORD_ITEMS.filter((r) => r.owner_id === RC(c.n)).forEach((r) => (r.name = c.source));
  }
}

// =====================================================================================
// Leasing: renewals, moves, inspections, deposits, notices, templates, e-sign, addenda
// =====================================================================================

const MV = (n) => (n <= 8 ? sid(31, n) : sid(84, 100 + n)); // moves (sandbox 1–8, ours 9+)
const IN = (n) => (n <= 10 ? sid(32, n) : sid(84, 200 + n)); // inspections
const DP = (n) => (n <= 12 ? sid(33, n) : sid(84, 300 + n)); // security deposits
const NT = (n) => (n <= 9 ? sid(34, n) : sid(84, 400 + n)); // notices
const ES = (n) => (n <= 9 ? sid(36, n) : sid(84, 600 + n)); // e-sign requests
const AD = (n) => (n <= 9 ? sid(37, n) : sid(84, 700 + n)); // addenda

const leaseName = (id) => byId("leases", id)?.name || "";
// Shared lease link columns for moves / inspections / deposits.
function linkCols(t, leaseId = t.leaseId) {
  const l = byId("leases", leaseId);
  const u = ALL_UNITS.find((x) => x.id === (l?.unit_id || t.unitId));
  return { lease_id: leaseId, lease_name: l?.name || "", tenant_id: t.id, tenant_name: t.name, unit_id: u.id, unit: u.display, property_id: u.propertyId };
}

// --- renewals ---------------------------------------------------------------------------

const RENEWAL_PLAN = {
  1: { offerSent: -5, due: 10, term: 12, meta: { marketRent: 2025, rentCapPct: 7, offerOptions: [{ term: 12, rent: 1995 }, { term: 15, rent: 1975 }], offerLetter: "Offer letter emailed with 12- and 15-month options." } },
  2: { offerSent: -70, due: -40, term: 12, meta: { declineReason: "Relocating for work", decidedOn: D(-41) } },
  3: { offerSent: -60, due: -30, term: 12, meta: { declineReason: "Bought a home", decidedOn: D(-33) } },
  4: { offerSent: -12, due: 18, term: 15, meta: { marketRent: 1575, rentCapPct: 7, offerOptions: [{ term: 12, rent: 1575 }, { term: 15, rent: 1545 }], counters: [{ on: D(-8), rent: 1525, term: 12, notes: "Resident counter", agreed: false }, { on: D(-6), rent: 1545, term: 15, notes: "Our counter — 15-month term", agreed: false }] } },
  5: { offerSent: null, due: null, term: 12, meta: { marketRent: 2050 } },
  6: { offerSent: -235, due: -205, term: 12, accepted: "grace", meta: { decidedOn: D(-200) } },
  7: { offerSent: -200, due: -170, term: 12, accepted: "noah", meta: { decidedOn: D(-160) } },
  8: { offerSent: -290, due: -260, term: 12, accepted: "aisha", meta: { decidedOn: D(-250) } },
  9: { offerSent: -140, due: -110, term: 12, meta: { declineReason: "Relocating closer to family", decidedOn: D(-112) } },
};

function applyRenewals() {
  for (const [n, plan] of Object.entries(RENEWAL_PLAN)) {
    const r = must("renewals", sid(30, Number(n)));
    const { noticeDate: _n, responseDue: _r, appliedAt, ...keep } = r.metadata || {};
    const cols = {
      offer_sent_on: plan.offerSent == null ? null : D(plan.offerSent), response_due: plan.due == null ? null : D(plan.due),
      term_months: plan.term, offered_rent: r.proposed_rent,
      created_at: T((plan.offerSent ?? -3) - 4, 9),
    };
    if (plan.accepted) {
      const t = T_[plan.accepted];
      cols.lease_id = PRIOR[plan.accepted].id;
      plan.meta.newLeaseId = t.leaseId;
      plan.meta.newLeaseName = leaseName(t.leaseId);
      if (appliedAt) plan.meta.appliedAt = appliedAt;
    }
    Object.assign(r, cols);
    r.metadata = { ...keep, ...plan.meta };
  }
}

// --- inspections -----------------------------------------------------------------------

// rooms([[room, [[item, condition, notes?], …]], …]) → the editor's room/item tree.
const rooms = (prefix, spec) => spec.map(([name, its], i) => ({
  id: `${prefix}-r${i + 1}`, name,
  items: its.map(([iname, condition = "", notes = ""], j) => ({ id: `${prefix}-r${i + 1}-i${j + 1}`, name: iname, condition, notes, photos: [] })),
}));
const blank = (spec) => spec.map(([room, its]) => [room, its.map((i) => [i])]);
const sig = (date, ...who) => Object.fromEntries(who.map(([role, name]) => [role, { name, signedOn: D(date), signedAt: T(date, 16) }]));

const TH_ROOMS = (c = {}) => [
  ["Living room", [["Walls", c.lrWalls ?? "good", c.lrWallsNote], ["Floors", "good"], ["Windows & blinds", "good"]]],
  ["Kitchen", [["Appliances", "good"], ["Counters", "good"], ["Cabinets", "good"]]],
  ["Primary bedroom", [["Walls", "good"], ["Carpet", c.primaryCarpet ?? "good", c.primaryCarpetNote], ["Closet", "good"]]],
  ["Bedroom 2", [["Walls", "good"], ["Carpet", c.bed2Carpet ?? "good", c.bed2CarpetNote]]],
  ["Bedroom 3", [["Walls", "good"], ["Carpet", "good"]]],
  ["Bathrooms", [["Fixtures", "good"], ["Tile & grout", c.tile ?? "good"]]],
  ["Garage", [["Drywall", c.garage ?? "good", c.garageNote], ["Door opener", "good"]]],
];
const APT_ROOMS = (c = {}) => [
  ["Living area", [["Walls", c.walls ?? "good", c.wallsNote], ["Floors", c.floors ?? "good"], ["Windows", "good"]]],
  ["Kitchen", [["Appliances", c.appliances ?? "good"], ["Counters", c.counters ?? "good", c.countersNote], ["Cabinets", "good"]]],
  ["Bedroom", [["Walls", c.bedWalls ?? "good", c.bedWallsNote], ["Floors", "good"], ["Closet", "good"]]],
  ["Bathroom", [["Fixtures", "good"], ["Tile & grout", "good"]]],
];

function applyInspections() {
  const insp = rows("inspections");
  // [n, tenant key | null, unit, kind, inspector, date, status, move n | null, rooms, extra]
  const PLAN = [
    [1, "omar", "B-102", "annual", "Casey Nolan", 5, "Scheduled", null, rooms("in1", blank(APT_ROOMS())), {}],
    [2, "zoe", "B-101", "move_in", "Alex Rivera", 13, "Scheduled", 1, rooms("in2", blank(APT_ROOMS())), {}],
    [3, "chloe", "TH-3", "move_out", "Jordan Lee", -2, "In progress", 2, rooms("in3", TH_ROOMS({ lrWalls: "fair", lrWallsNote: "Nail holes from pictures", primaryCarpet: "fair", primaryCarpetNote: "Traffic wear by the closet" }).map(([r, its], i) => [r, i > 3 ? its.map(([n]) => [n]) : its])), { conditionNotes: "Pre-move-out walk. Final inspection on move-out day once furniture is out.", tenantPresent: true, weather: "Overcast" }],
    [4, null, "S-201", "routine", "Casey Nolan", -6, "Failed", null, rooms("in4", [["Kitchen", [["Sink cabinet", "damaged", "Water damage from the supply line"], ["Subfloor", "damaged", "Soft under the sink"], ["Appliances", "good"]]], ["Bathroom", [["Subfloor by toilet", "poor", "Soft spot"], ["Fixtures", "good"]]], ["Living area", [["Walls", "good"], ["Floors", "good"]]]]), { conditionNotes: "Slow leak from the kitchen supply line damaged the cabinet base and subfloor. Unit taken offline; plumbing and flooring repair ordered.", tenantPresent: false }],
    [5, "aisha", "TH-1", "drive_by", "Jordan Lee", -12, "Complete", null, rooms("in5", [["Exterior", [["Gutters", "fair", "Clear before winter"], ["Yard", "good"], ["Garage door", "good"]]]]), { conditionNotes: "Exterior and yard well kept. Gutters need clearing before winter.", signatures: sig(-12, ["inspector", "Jordan Lee"]) }],
    [6, "ravi", "Main house", "annual", "Casey Nolan", -30, "Complete", null, rooms("in6", [["Kitchen", [["Appliances", "good"], ["Counters", "good"]]], ["Living & dining", [["Floors", "good"], ["Fireplace", "good"]]], ["Bedrooms (4)", [["Walls", "good"], ["Carpet", "fair", "Normal wear"]]], ["Bathrooms (3)", [["Primary shower", "fair", "Re-caulk"], ["Fixtures", "good"]]], ["Systems", [["Furnace", "good", "Filter replaced"], ["Smoke & CO detectors", "new", "Replaced 2 detectors"]]]]), { conditionNotes: "Home is well maintained. Smoke and CO detectors tested OK.", tenantPresent: true, signatures: sig(-30, ["inspector", "Casey Nolan"], ["tenant", "Ravi Patel"]) }],
    [7, "emily", "TH-4", "move_out", "Jordan Lee", -54, "Complete", 6, rooms("in7", TH_ROOMS({ bed2Carpet: "damaged", bed2CarpetNote: "Stains — professional cleaning needed", garage: "damaged", garageNote: "6\" hole in drywall", lrWalls: "fair", lrWallsNote: "Minor scuffs", tile: "fair" })), { conditionNotes: "Carpet in bedroom 2 needs professional cleaning; 6\" hole in garage drywall. Deductions itemized on the deposit.", tenantPresent: false, depositId: DP(2), signatures: sig(-54, ["inspector", "Jordan Lee"], ["landlord", "Alex Rivera"]) }],
    [8, "liam", "L-302", "move_in", "Alex Rivera", -76, "Complete", 7, rooms("in8", APT_ROOMS({ bedWalls: "fair", bedWallsNote: "Scuff on the wall by the window" })), { tenantPresent: true, signatures: sig(-76, ["inspector", "Alex Rivera"], ["tenant", "Liam O'Connor"]) }],
    [9, "jamal", "N-201", "move_in", "Jordan Lee", 20, "Scheduled", 3, rooms("in9", blank(APT_ROOMS())), {}],
    [10, "lucas", "A-202", "move_out", "Alex Rivera", 29, "Scheduled", 4, rooms("in10", blank(APT_ROOMS())), {}],
    [11, "emily", "TH-4", "move_in", "Jordan Lee", -421, "Complete", null, rooms("in11", TH_ROOMS()), { tenantPresent: true, signatures: sig(-421, ["inspector", "Jordan Lee"], ["tenant", "Emily Davis"]) }],
    [12, "chloe", "TH-3", "move_in", "Jordan Lee", -351, "Complete", null, rooms("in12", TH_ROOMS()), { tenantPresent: true, signatures: sig(-351, ["inspector", "Jordan Lee"], ["tenant", "Chloe Martin"]) }],
    [13, "ethan", "S-102", "move_in", "Jordan Lee", -40, "Complete", 5, rooms("in13", APT_ROOMS({ counters: "fair", countersNote: "Small chip on the counter edge — photographed" })), { conditionNotes: "Unit in good condition. Small chip on the kitchen counter edge noted.", tenantPresent: true, signatures: sig(-40, ["inspector", "Jordan Lee"], ["tenant", "Ethan Walker"]) }],
    [14, "hannah", "A-301", "move_in", "Alex Rivera", -96, "Complete", 8, rooms("in14", APT_ROOMS()), { tenantPresent: true, signatures: sig(-96, ["inspector", "Alex Rivera"], ["tenant", "Hannah Brooks"]) }],
    [15, "owen", "L-401", "move_out", "Alex Rivera", -25, "Complete", 9, rooms("in15", APT_ROOMS({ walls: "fair", wallsNote: "Picture-hanging holes", floors: "fair" })), { conditionNotes: "Normal wear; deep clean needed.", tenantPresent: true, depositId: DP(11), signatures: sig(-25, ["inspector", "Alex Rivera"], ["tenant", "Owen Pryce"]) }],
    [16, "kira", "B-201", "move_out", "Casey Nolan", -34, "Complete", 10, rooms("in16", APT_ROOMS({ walls: "damaged", wallsNote: "Holes and marker on two walls", floors: "poor", appliances: "poor", bedWalls: "damaged" })), { conditionNotes: "Unit abandoned — furniture and trash left behind. Junk removal and repairs itemized against the deposit.", tenantPresent: false, depositId: DP(12), signatures: sig(-34, ["inspector", "Casey Nolan"], ["landlord", "Alex Rivera"]) }],
    [17, "cobalt", "Suite 200", "move_in", "Dana Kowal", -300, "Complete", 12, rooms("in17", [["Open office", [["Ceiling", "new"], ["Carpet tile", "new"], ["Lighting", "new"]]], ["Private offices", [["Walls", "new"], ["Doors & hardware", "good"]]], ["Kitchenette", [["Appliances", "new"], ["Sink", "new"]]], ["Restroom", [["Fixtures", "good"]]]]), { tenantPresent: true, signatures: sig(-300, ["inspector", "Dana Kowal"], ["tenant", "Devon Price"]) }],
  ];
  const KIND_LABEL = { move_in: "Move-in", move_out: "Move-out", routine: "Routine", annual: "Annual", drive_by: "Drive-by" };
  for (const [n, key, label, kind, inspector, days, status, moveN, rms, extra] of PLAN) {
    const u = unit(label);
    const t = key ? T_[key] : null;
    const link = t ? linkCols(t, key === "emily" || key === "chloe" ? t.leaseId : t.leaseId) : { lease_id: null, lease_name: "", tenant_id: null, tenant_name: "", unit_id: u.id, unit: u.display, property_id: u.propertyId };
    const cols = { name: `${u.display} — ${KIND_LABEL[kind]}`, inspector, inspection_date: D(days), status, kind, move_id: moveN ? MV(moveN) : null, ...link, unit_id: u.id, unit: u.display, property_id: u.propertyId };
    const meta = { rooms: rms, ...extra };
    if (n <= 10) {
      const row = must("inspections", IN(n));
      const { inspectionType: _k, rooms: _r, signedOn: _s, ...keep } = row.metadata || {};
      Object.assign(row, cols);
      row.metadata = { ...keep, ...meta };
    } else {
      insp.push({ id: IN(n), ...cols, metadata: meta, created_at: T(Math.min(days, 0) - 5, 9) });
    }
  }
}

// --- moves -----------------------------------------------------------------------------

const IN_LIST = MOVE_IN_DONE;
const OUT_LIST = ["Notice to vacate received", "Forwarding address collected", "Move-out inspection scheduled", "Keys and access codes returned", "Utilities transferred back", "Final meter readings recorded", "Deposit disposition sent", "Unit turn started"];
const moveChecklist = (prefix, labels, doneCount) => checks(prefix, labels.map((l, i) => [l, i < doneCount]));

function applyMoves() {
  // [n, tenant key, kind, date, status, inspection n | null, deposit n | null, checklist done, meta]
  const PLAN = [
    [1, "zoe", "in", 14, "Scheduled", 2, 1, 0, { checklist: checks("mv1", [[IN_LIST[0], true], [IN_LIST[1], true], [IN_LIST[2], false], [IN_LIST[3], false], [IN_LIST[4], false], [IN_LIST[5], false], [IN_LIST[6], false], [IN_LIST[7], true]]), timeWindow: "10:00–12:00", assignedTo: M.tasha.name, elevatorReserved: true, electricStatus: "Pending", gasStatus: "N/A", waterStatus: "Landlord account", internetStatus: "Pending", activityNotes: "Moving from Denver; truck arrives at the Tower B loading dock." }],
    [2, "chloe", "out", 15, "In progress", 3, 3, 3, { timeWindow: "09:00–13:00", assignedTo: M.jordan.name, forwardingAddress: "2214 W Riverside Ave, Spokane, WA 99201", forwardingEmail: emailOf("Chloe Martin"), forwardingPhone: "(206) 555-1681", refundMethod: "Check", moveOutReason: "Relocating for work", electricStatus: "Pending", gasStatus: "Pending", waterStatus: "Landlord account", internetStatus: "Pending" }],
    [3, "jamal", "in", 21, "Scheduled", 9, 13, 0, { checklist: checks("mv3", IN_LIST.map((l) => [l, false])), timeWindow: "14:00–16:00", assignedTo: M.riley.name, electricStatus: "Pending", waterStatus: "Landlord account", activityNotes: "Waiting on the extra deposit and the guaranty signature." }],
    [4, "lucas", "out", 30, "Scheduled", 10, 4, 3, { timeWindow: "10:00–12:00", assignedTo: M.alex.name, forwardingAddress: "5810 24th Ave NW, Seattle, WA 98107", forwardingEmail: emailOf("Lucas Fernández"), refundMethod: "ACH", moveOutReason: "Bought a home", elevatorReserved: true }],
    [5, "ethan", "in", -40, "Complete", 13, null, 8, { timeWindow: "09:00–11:00", assignedTo: M.jordan.name, electricStatus: "Transferred", gasStatus: "N/A", waterStatus: "Landlord account", internetStatus: "Transferred", electricReading: 18422, readingsTakenOn: D(-40), completedOn: D(-40) }],
    [6, "emily", "out", -55, "Complete", 7, 2, 8, { timeWindow: "08:00–12:00", assignedTo: M.jordan.name, forwardingAddress: "907 Capitol Way S, Olympia, WA 98501", forwardingEmail: emailOf("Emily Davis"), refundMethod: "ACH", moveOutReason: "Relocating", electricStatus: "Transferred", gasStatus: "Transferred", waterStatus: "Transferred", internetStatus: "N/A", electricReading: 30915, gasReading: 4410, waterReading: 1288, readingsTakenOn: D(-55), completedOn: D(-55) }],
    [7, "liam", "in", -75, "Complete", 8, 5, 8, { timeWindow: "12:00–15:00", assignedTo: M.alex.name, elevatorReserved: true, electricStatus: "Transferred", waterStatus: "Landlord account", internetStatus: "Transferred", completedOn: D(-75) }],
    [8, "hannah", "in", -95, "Complete", 14, 6, 8, { timeWindow: "10:00–12:00", assignedTo: M.tasha.name, electricStatus: "Transferred", internetStatus: "Transferred", waterStatus: "Landlord account", gasStatus: "N/A", completedOn: D(-95) }],
    [9, "owen", "out", -25, "Complete", 15, 11, 7, { timeWindow: "09:00–12:00", assignedTo: M.alex.name, forwardingAddress: "1580 Wynkoop St, Denver, CO 80202", forwardingEmail: emailOf("Owen Pryce"), refundMethod: "ACH", moveOutReason: "Early termination", electricStatus: "Transferred", waterStatus: "Landlord account", internetStatus: "N/A", electricReading: 22710, readingsTakenOn: D(-25), completedOn: D(-25) }],
    [10, "kira", "out", -35, "Complete", 16, 12, 5, { assignedTo: M.casey.name, moveOutReason: "Abandonment", electricStatus: "Landlord account", waterStatus: "Landlord account", internetStatus: "N/A", completedOn: D(-35), activityNotes: "Unit found abandoned after the notice period; possession recovered." }],
    [11, "zoe", "in", 7, "Cancelled", null, null, 0, { timeWindow: "10:00–12:00", assignedTo: M.tasha.name, activityNotes: "Rescheduled a week later — Zoe's start date at work moved." }],
    [12, "cobalt", "in", -300, "Complete", 17, 15, 8, { timeWindow: "18:00–22:00", assignedTo: M.dana.name, elevatorReserved: true, electricStatus: "Transferred", internetStatus: "Transferred", waterStatus: "Landlord account", completedOn: D(-300) }],
  ];
  for (const [n, key, kind, days, status, inspN, depN, done, meta] of PLAN) {
    const t = T_[key];
    const cols = { name: `${unit(ALL_UNITS.find((u) => u.id === t.unitId).label).display} — ${t.name}`, kind, move_date: D(days), status, inspection_id: inspN ? IN(inspN) : null, deposit_id: depN ? DP(depN) : null, ...linkCols(t) };
    const checklist = meta.checklist || moveChecklist(`mv${n}`, kind === "in" ? IN_LIST : OUT_LIST, done);
    const full = { ...meta, checklist };
    if (n <= 8) {
      const row = must("moves", MV(n));
      const { keys: _k, inspectionScheduled: _a, inspector: _b, inspectionDate: _c, inspectionComplete: _d, depositHeld: _e, deductionsTotal: _f, conditionSummary: _g, ...keep } = row.metadata || {};
      Object.assign(row, cols);
      row.metadata = { ...keep, ...full };
    } else {
      rows("moves").push({ id: MV(n), ...cols, metadata: full, created_at: T(Math.min(days, 0) - 20, 9) });
    }
  }
  // Keys handed over / returned (record_items owner "move", kind "key").
  const key = (n, name, qty, status, tag) => item("move", MV(n), "key", { name, amount: qty, status }, { tag });
  key(5, "Unit door key", 2, "Handed over", "S102-A");
  key(5, "Building fob", 2, "Handed over", "FOB-PC-221");
  key(7, "Loft door key", 2, "Handed over", "L302-A");
  key(7, "Freight elevator fob", 1, "Handed over", "FOB-CL-018");
  key(8, "Unit door key", 2, "Handed over", "A301-A");
  key(8, "Parking remote", 1, "Handed over", "GAR-114");
  key(6, "Unit door key", 2, "Returned", "TH4-A");
  key(6, "Garage remote", 1, "Missing", "GAR-TH4");
  key(9, "Loft door key", 2, "Returned", "L401-A");
  key(9, "Building fob", 1, "Returned", "FOB-CL-031");
  key(10, "Unit door key", 2, "Missing", "B201-A");
  key(12, "Suite keys", 4, "Handed over", "STE200");
  key(12, "After-hours badges", 14, "Handed over", "BDG-P-200");
}

// --- security deposits ------------------------------------------------------------------

const ded = (prefix, rowsSpec) => list(prefix, rowsSpec.map(([label, category, amount, extra = {}]) => ({ label, category, amount, invoiceNumber: "", notes: "", ...extra })));

function applyDeposits() {
  // [n, tenant key, status, kind, amount|null, meta, cols]
  const PLAN = [
    [1, "zoe", "Held", "Security deposit", null, { receivedOn: D(-3), receiptNumber: "R-24519" }, {}],
    [2, "emily", "Partially returned", "Security deposit", null, { receivedOn: D(-421), deductions: ded("dp2", [["Carpet cleaning — bedroom 2", "Carpet / flooring", 275, { inspectionId: IN(7), invoiceNumber: "CV-8812" }], ["Garage drywall patch & paint", "Damage repair", 150, { inspectionId: IN(7) }]]), refundMethod: "ACH", letterSentOn: D(-41), forwardingAddress: "907 Capitol Way S, Olympia, WA 98501", activityNotes: "Itemized statement sent within the 30-day window." }, { move_id: MV(6), move_out_date: D(-55), return_due: D(-25), returned_on: D(-40), refund_amount: 2575 }],
    [3, "chloe", "Held", "Security deposit", null, { receivedOn: D(-351) }, { move_id: MV(2), move_out_date: D(15), return_due: D(45) }],
    [4, "lucas", "Held", "Security deposit", null, { receivedOn: D(-336) }, { move_id: MV(4), move_out_date: D(30), return_due: D(60) }],
    [5, "liam", "Held", "Security deposit", null, { receivedOn: D(-77), receiptNumber: "R-24311" }, {}],
    [6, "hannah", "Held", "Security deposit", null, { receivedOn: D(-97) }, {}],
    [7, "omar", "Held", "Security deposit", null, { receivedOn: D(-402) }, {}],
    [8, "grace", "Held", "Security deposit", null, { receivedOn: D(-515), activityNotes: "Moved to the renewal lease." }, {}],
    [9, "ravi", "Held", "Security deposit", null, { receivedOn: D(-502), interestBearing: true, interestRateOverride: 1.5, interestPaidAnnually: true, interestAccrued: 86.4, interestCalculatedOn: D(-20) }, {}],
    [10, "maya", "Held", "Security deposit", null, { receivedOn: D(-262) }, {}],
    [11, "owen", "Awaiting disposition", "Security deposit", 2000, { receivedOn: D(-396), deductions: ded("dp11", [["Deep clean", "Cleaning", 180, { inspectionId: IN(15) }], ["Touch-up paint — living area", "Painting", 120, { inspectionId: IN(15) }]]), forwardingAddress: "1580 Wynkoop St, Denver, CO 80202", refundMethod: "ACH", activityNotes: "Draft disposition ready — waiting on the cleaning invoice." }, { move_id: MV(9), move_out_date: D(-25), return_due: D(5) }],
    [12, "kira", "Forfeited", "Security deposit", 1000, { receivedOn: D(-400), deductions: ded("dp12", [["Unpaid rent — final month", "Unpaid rent", 1525], ["Junk removal", "Trash removal", 180, { inspectionId: IN(16) }], ["Rekey after unreturned keys", "Key / lock replacement", 95]]), letterSentOn: D(-12), activityNotes: "Unit abandoned with a month's rent unpaid. Deductions exceed the deposit; balance sent to collections." }, { move_id: MV(10), move_out_date: D(-35), return_due: D(-5), returned_on: D(-12), refund_amount: 0 }],
    [13, "jamal", "Pending", "Security deposit", 2275, { depositKind: "Security deposit", activityNotes: "Standard $1,500 plus the $775 conditional-approval add-on — due before key release." }, {}],
    [14, "noah", "Returned", "Pet deposit", 400, { receivedOn: D(-480), refundMethod: "Check", checkNumber: "10482", letterSentOn: D(-60), activityNotes: "Dog rehomed; pet deposit refunded in full after an inspection." }, { returned_on: D(-60), refund_amount: 400 }],
    [15, "cobalt", "Held", "Security deposit", 13900, { receivedOn: D(-330), receiptNumber: "R-22004" }, {}],
    [16, "cobalt", "Held", "Last month's rent", 6950, { receivedOn: D(-330) }, {}],
    [17, "liam", "Held", "Key deposit", 75, { receivedOn: D(-77) }, {}],
    [18, "cobalt", "Held", "Other", 500, { receivedOn: D(-330), activityNotes: "Signage restoration deposit — refundable when signage is removed." }, {}],
  ];
  const TRUST = (pid) => (pid === PINECREST.id ? "Security deposit trust · OR" : "Security deposit trust · WA");
  for (const [n, key, status, kind, amount, meta, cols] of PLAN) {
    const t = T_[key];
    const link = linkCols(t);
    const base = { name: `${link.unit} — ${t.name}${kind === "Security deposit" ? "" : ` (${kind.toLowerCase()})`}`, status, held_location: TRUST(link.property_id), ...link, ...cols };
    if (amount != null) base.amount = amount;
    const full = { depositKind: kind, ...meta };
    if (n <= 12) {
      const row = must("security_deposits", DP(n));
      const { tenantName: _t, refundDate: _d, refundAmount: _r, returnedAmount: _a, documents: _doc, ...keep } = row.metadata || {};
      Object.assign(row, base);
      row.metadata = { ...keep, ...full };
    } else {
      rows("security_deposits").push({ id: DP(n), ...base, amount: amount ?? 0, metadata: full, created_at: T(-(meta.receivedOn ? 0 : 3), 9) });
    }
  }
}

// --- notices ----------------------------------------------------------------------------

const svc = (prefix, entries) => list(prefix, entries.map(([label, days]) => ({ label, date: human(D(days)) })));

function applyNotices() {
  // Patches for sandbox notices.
  const PATCH = {
    1: { key: "omar", direction: "outgoing", reason: "Nonpayment of rent", meta: { serviceLog: svc("nt1-svc", [["Posted on unit door, photo taken", -4], ["Copy mailed first-class", -4]]) } },
    2: { key: "lucas", direction: "outgoing", reason: "Pre-move-out walkthrough" },
    3: { key: "priya", direction: "outgoing", reason: "Renewal rent increase" },
    4: { key: "liam", direction: "outgoing", reason: "Past-due balance", meta: { serviceLog: svc("nt4-svc", [["Emailed and posted to portal", -12]]) } },
    5: { key: "marcus", direction: "outgoing", type: "Pay or quit", reason: "Nonpayment of rent", meta: { serviceLog: svc("nt5-svc", [["Certified mail sent", -25], ["Delivery confirmed", -22], ["Escalated to eviction (cure period)", -15]]) } },
    6: { key: "hannah", direction: "outgoing", reason: "Unauthorized pet", meta: { curedOn: D(-12) } },
    7: { key: "grace", direction: "outgoing", reason: "Parking in fire lane", meta: { curedOn: D(-40), serviceLog: svc("nt7-svc", [["Posted on the vehicle and unit door", -45]]) } },
    8: { key: "noah", direction: "outgoing", reason: "Trash bins left out" },
    9: { key: "ethan", direction: "outgoing", reason: "Smoking on balcony" },
  };
  for (const [n, p] of Object.entries(PATCH)) {
    const row = must("notices", NT(Number(n)));
    const t = T_[p.key];
    Object.assign(row, { lease_id: t.leaseId, property_id: t.propertyId, ...(p.type ? { notice_type: p.type } : {}), created_at: T(row.served_date ? Number((new Date(`${row.served_date}T00:00:00`) - new Date(`${D(0)}T00:00:00`)) / 86400000) - 1 : -1, 9) });
    row.metadata = { ...(row.metadata || {}), direction: p.direction, reason: p.reason, ...(p.meta || {}) };
  }
  // Added notices covering the remaining types / delivery methods.
  const ADD = [
    [10, "Notice to vacate — TH-3", "Notice to vacate", "chloe", -17, 15, "Email", "Received", { direction: "incoming", reason: "Relocating for work", noticeText: "Please accept this as my written notice to vacate TH-3 at the end of my lease." }],
    [11, "Notice to vacate — A-202", "Notice to vacate", "lucas", -32, 30, "Portal", "Received", { direction: "incoming", reason: "Bought a home", noticeText: "I'll be moving out when my lease ends — closing on a condo in Ballard." }],
    [12, "Non-renewal notice — B-201", "Non-renewal", "kira", -95, -35, "First-class mail", "Closed", { direction: "outgoing", reason: "Repeated late payments", noticeText: "Your lease for B-201 will not be renewed and ends on its scheduled end date." }],
    [13, "Cure or quit — unauthorized occupant", "Cure or quit", "liam", -3, 7, "Hand delivered", "Served", { direction: "outgoing", reason: "Unauthorized long-term guest", noticeText: "An additional person has been living in L-302 for over 14 days without approval. Add them to the lease through an application or have them move out within 10 days.", serviceLog: svc("nt13-svc", [["Hand delivered to Liam O'Connor", -3]]) }],
    [14, "Notice to quit — B-201", "Unconditional quit", "kira", -45, -42, "Posted", "Closed", { direction: "outgoing", reason: "Nonpayment and abandonment", amountDue: 1525, serviceLog: svc("nt14-svc", [["Posted on unit door", -45], ["Mailed first-class", -45]]) }],
    [15, "Notice of belief of abandonment — B-201", "Other", "kira", -38, -31, "Posted", "Closed", { direction: "outgoing", reason: "Abandonment", noticeText: "We believe you have abandoned B-201. If you intend to stay, contact us within 7 days; otherwise we will take possession and store any property as required by law." }],
    [16, "Eviction notice — summons & complaint (draft)", "Eviction notice", "marcus", null, null, "Hand delivered", "Draft", { direction: "outgoing", reason: "Nonpayment of rent", amountDue: 2150, noticeText: "Draft summons prepared by counsel — serve only if Friday's $1,000 payment does not post." }],
  ];
  for (const [n, name, type, key, served, cure, delivery, status, meta] of ADD) {
    const t = T_[key];
    const l = byId("leases", t.leaseId);
    rows("notices").push({
      id: NT(n), name, notice_type: type, tenant_id: t.id, tenant_name: t.name, unit_id: l.unit_id, unit: l.unit, lease_id: l.id, property_id: l.property_id,
      served_date: served == null ? null : D(served), cure_by: cure == null ? null : D(cure), delivery_method: delivery, status, metadata: meta,
      created_at: T(served ?? -1, 9),
    });
  }
}

// --- lease templates ---------------------------------------------------------------------

const BODY = `RESIDENTIAL LEASE AGREEMENT

This Lease is made on {{today}} between {{landlord.name}} ("Landlord") and {{lease.tenants}} ("Tenant").

1. PREMISES. Landlord leases to Tenant the premises at {{property.address}} ({{unit.name}}).

2. TERM. The term begins on {{lease.start}} and ends on {{lease.end}} ({{lease.term}}).

3. RENT. Tenant shall pay {{lease.rent}} per month, due on the {{lease.due_day}} of each month. Rent received more than {{lease.grace_days}} days late incurs a late fee of {{lease.late_fee}}. Returned payments incur {{lease.nsf_fee}}.

4. RECURRING CHARGES.
{{lease.recurring_charges}}

5. SECURITY DEPOSIT. Tenant shall pay a security deposit of {{lease.deposit}}, held in trust and returned less lawful, itemized deductions.

6. UTILITIES.
{{lease.utilities}}

7. RENTERS INSURANCE. Tenant keeps renters insurance with at least {{lease.insurance_minimum}} liability coverage.

8. NOTICE. Either party may end the tenancy at term end with {{lease.notice_days}} days' written notice.

9. ADDITIONAL TERMS.
{{lease.clauses}}

SIGNATURES
Landlord: ____________________   Tenant: ____________________   Co-signers: {{lease.cosigners}}`;
const stateBody = (state, extra) => BODY.replace("\n\nSIGNATURES", `\n\n10. STATE DISCLOSURES (${state}). ${extra}\n\nSIGNATURES`);
const COMMERCIAL_BODY = `COMMERCIAL LEASE (TRIPLE NET)

Landlord: {{landlord.name}}, {{landlord.address}}
Tenant: {{tenant.name}}
Premises: {{unit.name}}, {{property.address}}

1. TERM. {{lease.start}} to {{lease.end}} ({{lease.term}}).
2. BASE RENT. {{lease.rent}} per month, payable on the {{lease.due_day}}.
3. ESCALATIONS.
{{lease.rent_schedule}}
4. OPERATING EXPENSES. Tenant pays its pro-rata share of taxes, insurance and common-area maintenance.
5. SECURITY DEPOSIT. {{lease.deposit}}.
6. INSURANCE. Commercial general liability of at least {{lease.insurance_minimum}} naming Landlord as additional insured.
7. ADDITIONAL TERMS.
{{lease.clauses}}

GUARANTY: {{lease.cosigners}}`;

const LIBRARY = list("lib", [
  { title: "No smoking", category: "General", body: CLAUSE.smoking.detail, required: true, states: [] },
  { title: "Renters insurance", category: "Legal", body: CLAUSE.insurance.detail, required: true, states: [] },
  { title: "Pet agreement", category: "Pets", body: CLAUSE.pets.detail, required: false, states: [] },
  { title: "Assigned parking", category: "Parking", body: CLAUSE.parking.detail, required: false, states: ["WA"] },
  { title: "Quiet hours", category: "Use of premises", body: CLAUSE.quiet.detail, required: false, states: [] },
  { title: "Utility transfer", category: "Utilities", body: CLAUSE.utilitiesTransfer.detail, required: false, states: [] },
]).map((c, i) => ({ ...c, id: ["lib-smoking", "lib-insurance", "lib-pets", "lib-parking", "lib-quiet", "lib-utilitiesTransfer"][i] }));

const versions = (n, labels) => list(`tv${n}`, labels.map(([label, days]) => ({ label, date: D(days) })));
const TEMPLATE_PLAN = {
  1: { body: BODY, meta: { version: 3, effectiveOn: D(-300), versions: versions(1, [["v1 — original", -900], ["v2 — late-fee wording", -500], ["v3 — utilities & insurance merge fields", -300]]), clauseLibrary: LIBRARY, leaseType: "residential", language: "English", defaultTermMonths: 12, legalReviewedOn: D(-310), legalReviewer: "Harmon & Liu, PLLC", isDefault: false } },
  2: { body: stateBody("WA", "Tenant acknowledges receipt of the mold information pamphlet, fire safety and protection information, and the written move-in condition checklist."), meta: { version: 4, effectiveOn: D(-200), versions: versions(2, [["v3 — 2025 RCW 59.18 updates", -500], ["v4 — 30-day deposit return", -200]]), clauseLibrary: [...LIBRARY, { id: "lib-renovation", title: "Renovation acknowledgement", category: "Other", body: CLAUSE.renovation.detail, required: false, states: ["WA"] }, { id: "lib-filters", title: "Furnace filters & yard", category: "Maintenance", body: CLAUSE.filters.detail, required: false, states: [] }], leaseType: "residential", language: "English", defaultTermMonths: 12, legalReviewedOn: D(-205), legalReviewer: "Harmon & Liu, PLLC", isDefault: true } },
  3: { body: stateBody("OR", "Tenant acknowledges the smoking policy, flood-zone disclosure, and recycling information for the premises."), meta: { version: 2, effectiveOn: D(-260), versions: versions(3, [["v1", -800], ["v2 — ORS 90.323 rent cap note", -260]]), clauseLibrary: LIBRARY, leaseType: "residential", language: "English", defaultTermMonths: 12, legalReviewedOn: D(-265), legalReviewer: "Columbia Law Group" } },
  4: { body: `${BODY}\n\nYARD & SYSTEMS. Tenant maintains the lawn and replaces furnace filters quarterly.`, meta: { version: 1, effectiveOn: D(-500), clauseLibrary: [...LIBRARY, { id: "lib-filters", title: "Furnace filters & yard", category: "Maintenance", body: CLAUSE.filters.detail, required: false, states: [] }], leaseType: "residential", language: "English", defaultTermMonths: 24 } },
  5: { body: BODY.replace("2. TERM. The term begins on {{lease.start}} and ends on {{lease.end}} ({{lease.term}}).", "2. TERM. Month-to-month beginning {{lease.start}}; either party may end it with {{lease.notice_days}} days' written notice. Month-to-month premium: {{lease.mtm_premium}}."), meta: { version: 1, leaseType: "residential", language: "English", defaultTermMonths: 1 } },
  6: { body: stateBody("CA", "Tenant acknowledges the required state disclosures listed in the attached addendum."), meta: { version: 1, leaseType: "residential", language: "English", defaultTermMonths: 12 } },
  7: { body: BODY.replace("RESIDENTIAL LEASE AGREEMENT", "FURNISHED SHORT-TERM LEASE"), meta: { version: 2, leaseType: "residential", language: "English", defaultTermMonths: 6 } },
};

function applyTemplates() {
  for (const [n, plan] of Object.entries(TEMPLATE_PLAN)) {
    const row = must("lease_templates", sid(35, Number(n)));
    const { mergeFields: _m, ...keep } = row.metadata || {};
    row.body = plan.body;
    row.metadata = { ...keep, mergeFields: [], ...plan.meta };
  }
  rows("lease_templates").push({
    id: TPL.commercial, name: "Commercial office lease (NNN)", scope: "generic", state: "", status: "Published", body: COMMERCIAL_BODY,
    metadata: { version: 2, effectiveOn: D(-420), versions: versions(8, [["v1", -700], ["v2 — CAM reconciliation language", -420]]), mergeFields: [], clauseLibrary: list("lib-com", [
      { title: "Permitted use", category: "Use of premises", body: "General office use only.", required: true, states: [] },
      { title: "Signage", category: "Other", body: "Tenant signage at Tenant's cost, removed at lease end.", required: false, states: [] },
      { title: "Operating expenses", category: "Legal", body: "Pro-rata share of taxes, insurance and CAM, reconciled annually.", required: true, states: [] },
    ]).map((c, i) => ({ ...c, id: ["lib-com-use", "lib-com-signage", "lib-com-cam"][i] })), leaseType: "commercial", language: "English", defaultTermMonths: 60, legalReviewedOn: D(-425), legalReviewer: "Harmon & Liu, PLLC" },
    created_at: T(-700, 9),
  });
}

// --- e-signature ---------------------------------------------------------------------------

const signer = (prefix, entries) => list(prefix, entries.map(([label, em, role, done, signedOn]) => ({ label, email: em, role, done, ...(done && signedOn != null ? { signedOn: D(signedOn) } : {}) })));
const audit = (prefix, entries) => list(prefix, entries.map(([label, days]) => ({ label, date: human(D(days)) })));

function applyEsign() {
  const alex = ["Alex Rivera", email(M.alex), "landlord"];
  const jordan = ["Jordan Lee", email(M.jordan), "landlord"];
  const PATCH = {
    1: { status: "Signed", sent: -4, signed: -1, meta: { signers: signer("es1", [["Zoe Nguyen", T_.zoe.email, "tenant", true, -2], [...alex, true, -1]]), audit: audit("es1", [["Request created", -4], ["Sent to Zoe Nguyen", -4], ["Viewed by Zoe Nguyen", -3], ["Signed by Zoe Nguyen", -2], ["Countersigned by Alex Rivera", -1]]), signingOrder: "sequential", message: "Welcome to The Marlowe! Please review and sign your lease before move-in.", reminderCadence: "Every 3 days", expiresOn: D(10) } },
    2: { status: "Draft", meta: { signers: signer("es2", [["Jamal Carter", T_.jamal.email, "tenant", false], ["Curtis Carter", "curtis.carter@mail.example", "guarantor", false], [...jordan, false]]), audit: audit("es2", [["Request created", -1]]), signingOrder: "sequential", reminderCadence: "Off" } },
    3: { status: "Sent", sent: -3, meta: { signers: signer("es3", [["Omar Haddad", T_.omar.email, "tenant", false]]), audit: audit("es3", [["Request created", -3], ["Sent to Omar Haddad", -3], ["Reminder sent", -1]]), signingOrder: "any", reminderCadence: "Daily", lastReminder: D(-1), reminderNote: "Arabic translation attached.", expiresOn: D(11) } },
    4: { status: "Viewed", sent: -5, meta: { signers: signer("es4", [["Priya Raman", T_.priya.email, "tenant", false]]), audit: audit("es4", [["Sent to Priya Raman", -5], ["Viewed by Priya Raman", -4]]), signingOrder: "any", reminderCadence: "Weekly", lastReminder: D(-2), expiresOn: D(10) } },
    5: { status: "Signed", sent: -56, signed: -54, meta: { signers: signer("es5", [["Ethan Walker", T_.ethan.email, "tenant", true, -55], [...jordan, true, -54]]), audit: audit("es5", [["Sent to Ethan Walker", -56], ["Signed by Ethan Walker", -55], ["Countersigned by Jordan Lee", -54]]), signingOrder: "sequential", reminderCadence: "Off" } },
    6: { status: "Signed", sent: -19, signed: -18, meta: { signers: signer("es6", [["Hannah Brooks", T_.hannah.email, "tenant", true, -18]]), audit: audit("es6", [["Sent to Hannah Brooks", -19], ["Signed by Hannah Brooks", -18]]), signingOrder: "any" } },
    7: { status: "Declined", sent: -140, meta: { signers: signer("es7", [["Emily Davis", T_.emily.email, "tenant", false]]), audit: audit("es7", [["Sent to Emily Davis", -140], ["Declined — not renewing", -135]]), signingOrder: "any", reminderCadence: "Off" } },
    8: { status: "Signed", sent: -152, signed: -150, meta: { signers: signer("es8", [["Noah Schmidt", T_.noah.email, "tenant", true, -151], ["Lena Schmidt", "lena.schmidt@mail.example", "tenant", true, -151], [...jordan, true, -150]]), audit: audit("es8", [["Sent to Noah & Lena Schmidt", -152], ["Signed by both tenants", -151], ["Countersigned by Jordan Lee", -150]]), signingOrder: "sequential" } },
    9: { status: "Signed", sent: -182, signed: -180, meta: { signers: signer("es9", [["Grace Kim", T_.grace.email, "tenant", true, -181], [...jordan, true, -180]]), audit: audit("es9", [["Sent to Grace Kim", -182], ["Signed by Grace Kim", -181], ["Countersigned by Jordan Lee", -180]]), signingOrder: "sequential" } },
  };
  for (const [n, p] of Object.entries(PATCH)) {
    const row = must("esign_requests", ES(Number(n)));
    Object.assign(row, { status: p.status, sent_at: p.sent != null ? T(p.sent, 10) : null, signed_at: p.signed != null ? T(p.signed, 17) : null });
    row.metadata = { ...(row.metadata || {}), documentLink: "", ...p.meta };
    // Signed lease agreements stamp the lease's signed date.
    if (p.status === "Signed" && /^(Lease|Renewal) agreement/.test(row.name)) {
      const l = byId("leases", row.lease_id);
      if (l) l.signed_date = D(p.signed);
    }
  }
  const ADD = [
    [10, "Guaranty agreement — N-201", "Jamal Carter", sid(10, 17), "Partially signed", -2, null, { signers: signer("es10", [["Jamal Carter", T_.jamal.email, "tenant", true, -1], ["Curtis Carter", "curtis.carter@mail.example", "guarantor", false]]), audit: audit("es10", [["Sent to Jamal & Curtis Carter", -2], ["Signed by Jamal Carter", -1]]), signingOrder: "any", reminderCadence: "Every 3 days", lastReminder: D(0), expiresOn: D(12) }],
    [11, "Lease agreement — L-401 (Nadia Rahman)", "Nadia Rahman", null, "Voided", -12, null, { signers: signer("es11", [["Nadia Rahman", "nadia.rahman@mail.example", "tenant", false]]), audit: audit("es11", [["Sent to Nadia Rahman", -12], ["Voided — application withdrawn", -8]]), signingOrder: "any", reminderCadence: "Off" }],
    [12, "Commercial lease — Suite 200", "Cobalt Design Studio LLC", LEASE_ID.cobalt, "Signed", -335, -330, { signers: signer("es12", [["Devon Price (Cobalt Design Studio)", "devon@cobaltdesign.example", "tenant", true, -331], ["Devon Price (guarantor)", "devon@cobaltdesign.example", "guarantor", true, -331], ["Dana Kowal", email(M.dana), "landlord", true, -330]]), audit: audit("es12", [["Sent to Cobalt Design Studio", -335], ["Signed by tenant and guarantor", -331], ["Countersigned by Dana Kowal", -330]]), signingOrder: "sequential" }],
  ];
  for (const [n, name, signerName, leaseId, status, sent, signed, meta] of ADD) {
    rows("esign_requests").push({
      id: ES(n), name, signer: signerName, lease_id: leaseId, status, sent_at: T(sent, 10), signed_at: signed != null ? T(signed, 17) : null,
      metadata: { documentLink: "", message: "", ...meta }, created_at: T(sent - 1, 9), updated_at: T(signed ?? sent, 17),
    });
  }
}

function applyAddenda() {
  const PATCH = {
    1: { effectiveDate: D(5), requiresSignature: true },
    2: { effectiveDate: D(21), requiresSignature: true },
    3: { effectiveDate: D(14), requiresSignature: false },
    4: { effectiveDate: D(14), requiresSignature: false },
    5: { effectiveDate: D(-180), requiresSignature: false },
    6: { effectiveDate: D(-32), signedOn: D(-31), requiresSignature: true },
    7: { effectiveDate: D(-75), signedOn: D(-76), requiresSignature: true },
    8: { effectiveDate: D(-18), signedOn: D(-18), requiresSignature: true },
    9: { effectiveDate: D(-260), signedOn: D(-262), requiresSignature: true },
  };
  for (const [n, meta] of Object.entries(PATCH)) {
    const row = must("lease_addenda", AD(Number(n)));
    row.metadata = { ...(row.metadata || {}), ...meta };
  }
  rows("lease_addenda").push({ id: AD(10), name: "Signage & exclusive-use rider", lease_id: LEASE_ID.cobalt, body: "Tenant may install suite and lobby-directory signage. Landlord will not lease other suites to a competing design studio during the term.", status: "Signed", metadata: { effectiveDate: D(-300), signedOn: D(-331), requiresSignature: true } });
}

// Lease child records (record_items owner "lease").
function applyLeaseItems() {
  const lease = (key) => T_[key].leaseId;
  item("lease", lease("hannah"), "pet", { name: "Miso", amount: 35, endsOn: D(150) }, { species: "Cat", breed: "Domestic shorthair", weightLbs: 9, age: 4, color: "Orange tabby", petFee: 350, serviceAnimal: false, spayedNeutered: true });
  item("lease", lease("priya"), "pet", { name: "Pepper", amount: 35, endsOn: D(200) }, { species: "Cat", breed: "Siamese mix", weightLbs: 8, age: 6, petFee: 350, spayedNeutered: true });
  item("lease", lease("ravi"), "pet", { name: "Biscuit", amount: 50, endsOn: D(45) }, { species: "Dog", breed: "Golden retriever", weightLbs: 68, age: 5, color: "Golden", petFee: 0, licenseNumber: "KC-77120", spayedNeutered: true });
  item("lease", lease("aisha"), "pet", { name: "Kona", amount: 0, endsOn: D(-10) }, { species: "Dog", breed: "Labrador mix", weightLbs: 55, age: 3, serviceAnimal: true, spayedNeutered: true });
  item("lease", lease("maya"), "vehicle", { name: "Honda Civic", amount: 150, endsOn: D(70) }, { year: 2019, color: "Blue", plate: "CBZ4421", plateState: "WA", parkingSpace: "P-14", permitNumber: "MAR-P14" });
  item("lease", lease("hannah"), "vehicle", { name: "Toyota Prius", amount: 150, endsOn: D(270) }, { year: 2022, color: "White", plate: "CDK1180", plateState: "WA", parkingSpace: "P-22", permitNumber: "MAR-P22" });
  item("lease", lease("ravi"), "vehicle", { name: "Subaru Outback", amount: 0 }, { year: 2023, color: "Green", plate: "BXR7006", plateState: "WA", parkingSpace: "Garage" });
  const pol = (key, carrier, liab, start, end, status, extra = {}) => item("lease", lease(key), "insurance_policy", { name: carrier, amount: liab, startsOn: D(start), endsOn: D(end), status }, { policyNumber: `HO4-${String(liab).slice(0, 2)}${start * -1}`, personalProperty: 25000, interestedParty: true, agentContact: "", ...extra });
  pol("maya", "Cascade Mutual", 100000, -225, 140, "Active");
  pol("hannah", "Northwest Renters Co.", 300000, -95, 250, "Active");
  pol("lucas", "Puget Home & Auto", 100000, -355, 10, "Active");
  pol("liam", "Evergreen Renters", 100000, -385, -20, "Expired", { interestedParty: false });
  pol("zoe", "Cascade Mutual", 100000, 14, 379, "Active", { agentContact: "Submitted through the portal — pending review." });
  pol("cobalt", "Pacific Commercial Insurance", 2000000, -300, 65, "Active", { personalProperty: 150000, agentContact: "certs@pacificcommercial.example" });
  const code = (key, name, start, end, status, extra) => item("lease", lease(key), "access_code", { name, startsOn: start == null ? null : D(start), endsOn: end == null ? null : D(end), status }, extra);
  code("zoe", "Front door smart lock", 14, 379, "Scheduled", { accessType: "Smart lock", code: "481920", issuedTo: "Zoe Nguyen", notes: "Activates at 10am on move-in day." });
  code("maya", "Garage gate", -260, 105, "Active", { accessType: "Gate code", code: "#7731", issuedTo: "Maya Chen" });
  code("maya", "Package lockers", -260, 105, "Active", { accessType: "Amenity", code: "2210", issuedTo: "Maya Chen" });
  code("emily", "Garage keypad", -420, -55, "Revoked", { accessType: "Garage", code: "5530", issuedTo: "Emily Davis", notes: "Revoked at move-out." });
  code("liam", "Freight elevator (move-in)", -76, -74, "Expired", { accessType: "Fob", code: "FOB-018", issuedTo: "Liam O'Connor" });
  code("cobalt", "Suite 200 door", -300, 1525, "Active", { accessType: "Door keypad", code: "9020", issuedTo: "Cobalt Design Studio" });
  const charge = (key, name, amount, due, status, extra = {}) => item("lease", lease(key), "move_in_charge", { name, amount, startsOn: D(due), status }, { refundable: false, memo: "", ...extra });
  charge("zoe", "Admin fee", 150, -17, "Paid");
  charge("zoe", "Key / fob fee", 50, 14, "Unpaid", { refundable: true, memo: "Refundable when fobs are returned." });
  charge("jamal", "Move-in fee", 200, 21, "Unpaid");
  charge("jamal", "Last month's rent", 1550, 21, "Unpaid", { refundable: true, memo: "Condition of approval." });
  charge("ethan", "Admin fee", 150, -40, "Waived", { memo: "Waived — referral special." });
  charge("hannah", "Pet fee (non-refundable)", 350, -95, "Paid");
  charge("cobalt", "Other", 450, -300, "Paid", { memo: "Signage installation." });
  const conc = (key, name, amount, start, end, status, extra) => item("lease", lease(key), "concession", { name, amount, startsOn: D(start), endsOn: D(end), status }, extra);
  conc("zoe", "First month 50% off", 950, 14, 44, "Active", { concessionType: "one_time", months: 1, reason: "Leased during the Tower B promotion", approvedBy: M.alex.name });
  conc("cobalt", "Two months free", 2, -300, -240, "Used", { concessionType: "free_month", months: 2, reason: "Five-year term", approvedBy: M.dana.name });
  conc("liam", "$100 off for 3 months", 100, -75, -15, "Expired", { concessionType: "amount_off", months: 3, reason: "Lobby renovation disruption", approvedBy: M.alex.name });
  conc("ethan", "Waived admin fee", 150, -40, -40, "Used", { concessionType: "waived_fee", months: 0, reason: "Resident referral" });
  conc("maya", "5% renewal discount (offered)", 5, 106, 470, "Active", { concessionType: "percent_off", months: 15, reason: "Counter-offer on the 15-month renewal", approvedBy: M.alex.name });
}

// =====================================================================================
// record_items for properties, buildings, units, people and work orders
// =====================================================================================

function applyPropertyItems() {
  const P = (p) => p.id;
  const policy = (owner, ownerType, carrier, type, number, coverage, deductible, premium, start, end, extra = {}) =>
    item(ownerType, owner, "insurance_policy", { name: carrier, amount: premium, startsOn: D(start), endsOn: D(end) }, { policyType: type, policyNumber: number, coverage, deductible, agentName: "Priya Natarajan", agentPhone: "(206) 555-0177", agentEmail: "certs@pnwinsurance.example", paymentFrequency: "Annually", additionalInsured: true, autoRenew: true, documentUrl: "", ...extra });
  policy(P(MARLOWE), "property", "Travelers", "Property / hazard", "TRV-PH-558210", 26000000, 25000, 48200, -165, 200);
  policy(P(MARLOWE), "property", "Travelers", "General liability", "TRV-GL-558211", 2000000, 0, 9800, -165, 200);
  policy(P(MARLOWE), "property", "Chubb", "Umbrella", "CHB-UM-10442", 10000000, 0, 6400, -165, 200, { paymentFrequency: "Semi-annually" });
  policy(P(PINECREST), "property", "Liberty Mutual", "Property / hazard", "LM-PH-77310", 9000000, 10000, 21500, -325, 40, { notes: "Renewal quote requested — premium likely +8%." });
  policy(P(PINECREST), "property", "Liberty Mutual", "Earthquake", "LM-EQ-77311", 4500000, 225000, 7900, -325, 40);
  policy(P(ALDER), "property", "State Farm", "Property / hazard", "SF-PH-20193", 3000000, 5000, 6900, -90, 275, { paymentFrequency: "Quarterly" });
  policy(P(BIRCHWOOD), "property", "Allstate", "Property / hazard", "ALS-DP3-8812", 1700000, 2500, 3100, -200, 165, { paymentFrequency: "Escrowed", additionalInsured: false, notes: "Landlord (DP-3) policy paid from the owner's escrow." });
  policy(P(CASCADE), "property", "Zurich", "Builder's risk", "ZUR-BR-33019", 2500000, 10000, 12800, -120, 245, { autoRenew: false, notes: "Covers the lobby and façade renovation." });
  policy(P(CASCADE), "property", "Zurich", "Property / hazard", "ZUR-PH-33018", 10000000, 25000, 24100, -340, 25, { notes: "Renewal application submitted; broker chasing the quote." });
  policy(P(CASCADE), "property", "Zurich", "Loss of rents", "ZUR-LR-33020", 600000, 0, 2600, -340, 25);
  policy(P(NP.queenAnne), "property", "CAU (Community Association Underwriters)", "Property / hazard", "CAU-MP-61022", 14000000, 10000, 31800, -60, 305, { notes: "Master policy for the association." });
  policy(P(NP.queenAnne), "property", "CAU (Community Association Underwriters)", "Workers' comp", "CAU-WC-61023", 1000000, 0, 1400, -60, 305);
  policy(P(NP.pioneer), "property", "Hartford", "Property / hazard", "HTF-PH-90071", 12000000, 25000, 27400, -230, 135);
  policy(P(NP.pioneer), "property", "Hartford", "Flood", "HTF-FL-90072", 500000, 5000, 3900, -230, 135);
  policy(P(NP.greenwood), "property", "Zurich", "Builder's risk", "ZUR-BR-34001", 6500000, 10000, 15400, -75, 290, { autoRenew: false });
  policy(P(NP.greenwood), "property", "Zurich", "Wind / hail", "ZUR-WH-34002", 3000000, 25000, 2100, -75, 290);
  policy(P(NP.lakewood), "property", "Travelers", "Property / hazard", "TRV-PH-410022", 18000000, 25000, 39000, -415, -50, { autoRenew: false, notes: "Owner placed their own coverage after management ended." });
  policy(P(NP.udistrict), "property", "Liberty Mutual", "Other", "LM-VAC-88120", 4000000, 10000, 9300, -100, 265, { notes: "Vacancy endorsement while off-market." });

  const comp = (owner, ownerType, name, category, status, authority, ref, freq, start, end, fee, extra = {}) =>
    item(ownerType, owner, "compliance_item", { name, status, startsOn: start == null ? null : D(start), endsOn: end == null ? null : D(end), amount: fee }, { category, authority, referenceNumber: ref, frequency: freq, responsible: extra.responsible || "Property manager", documentUrl: "", notes: extra.notes || "" });
  comp(P(MARLOWE), "property", "Annual fire & life safety inspection", "Inspection", "Compliant", "Seattle Fire Department", "SFD-FLS-26-1188", "Annually", -60, 305, 450);
  comp(P(MARLOWE), "property", "Rental registration (RRIO)", "Rental registration", "Compliant", "Seattle SDCI", "RRIO-0412337", "Every 5 years", -400, 1425, 175);
  comp(P(MARLOWE), "property", "Backflow assembly test", "Certification", "Pending", "Seattle Public Utilities", "BF-11872", "Annually", -340, 25, 120, { responsible: "Rainier Plumbing Co." });
  comp(P(PINECREST), "property", "Portland rental registration", "Rental registration", "Action needed", "Portland Revenue Division", "PDX-RR-77001", "Annually", -345, 20, 60, { notes: "Unit count changed — refile before renewal." });
  comp(P(PINECREST), "property", "Fire extinguisher service", "Inspection", "Failed", "Portland Fire & Rescue", "PFR-EXT-2210", "Annually", -380, -15, 280, { notes: "Two extinguishers past service date — vendor booked." });
  comp(P(CASCADE), "property", "Lead / asbestos disclosure (pre-1978)", "Lead / asbestos disclosure", "Compliant", "EPA / HUD", "", "One-time", -880, null, 0);
  comp(P(CASCADE), "property", "Lobby renovation building permit", "Permit", "Pending", "Seattle SDCI", "SDCI-6981442-CN", "One-time", -150, 210, 3850, { notes: "Phase 2 inspection booked." });
  comp(P(CASCADE), "property", "Façade (FIMS) inspection", "Inspection", "Action needed", "Seattle SDCI", "FIMS-2026-0091", "Every 5 years", -1800, -40, 1200, { notes: "Report flagged loose brick at the parapet — repairs in phase 2." });
  comp(P(BIRCHWOOD), "property", "Smoke & CO detector certification", "Certification", "Compliant", "Bellevue Fire", "", "Annually", -30, 335, 0, { responsible: "Casey Nolan" });
  comp(P(NP.greenwood), "property", "Certificate of occupancy — Row A", "Certificate of occupancy", "Compliant", "Seattle SDCI", "CO-7012339", "One-time", -45, null, 950);
  comp(P(NP.queenAnne), "property", "Elevator operating permit", "License", "Compliant", "WA L&I", "ELV-QA-1192", "Annually", -200, 165, 410);
  comp(P(NP.pioneer), "property", "Certificate of occupancy — office", "Certificate of occupancy", "Compliant", "Seattle SDCI", "CO-5501876", "One-time", -2800, null, 0);

  const asset = (owner, ownerType, name, category, status, condition, make, model, serial, location, start, end, interval, lastServiced, cost, life, notes = "") =>
    item(ownerType, owner, "asset", { name, status, startsOn: D(start), endsOn: end == null ? null : D(end), amount: cost }, { category, condition, make, model, serialNumber: serial, location, serviceIntervalMonths: interval, lastServicedOn: lastServiced == null ? null : D(lastServiced), expectedLifeYears: life, notes });
  asset(P(MARLOWE), "property", "Rooftop make-up air unit", "HVAC", "In service", "Good", "Carrier", "48FC-12", "CR-48FC-2014-221", "Tower A roof", -4200, -550, 6, -40, 38000, 20);
  asset(P(MARLOWE), "property", "Domestic hot-water boiler", "Water heater", "Needs repair", "Fair", "Lochinvar", "Knight XL", "LV-KXL-88120", "P1 mechanical room", -4100, -450, 12, -250, 26000, 18, "Burner short-cycling — Evergreen HVAC quoted a control board.");
  asset(P(MARLOWE), "property", "Garage gate operator", "Security", "In service", "Excellent", "LiftMaster", "CSW24UL", "LM-CSW-55102", "Garage entrance", -180, 550, 12, -180, 4200, 10);
  asset(P(PINECREST), "property", "Laundry machines (8)", "Laundry", "In service", "Fair", "Speed Queen", "SC60", "Lease #SQ-PDX-118", "Laundry rooms", -1500, null, 6, -60, 9600, 12);
  asset(P(PINECREST), "property", "North building roof", "Roof", "Needs repair", "Poor", "GAF", "Timberline HDZ", "", "North Building", -5100, -1500, 12, -21, 85000, 25, "Gutter replacement next spring; roof nearing end of life.");
  asset(P(CASCADE), "property", "Steam heat exchanger", "HVAC", "In service", "Good", "Armstrong", "SX-200", "ARM-SX-1990", "Basement boiler room", -2100, -100, 12, -40, 31000, 25);
  asset(P(BIRCHWOOD), "property", "Gas furnace", "HVAC", "In service", "Good", "Trane", "S9V2", "TR-S9V2-55021", "Garage", -1300, 2350, 12, -30, 6800, 18);
  asset(P(NP.greenwood), "property", "Solar array", "Electrical", "In service", "Excellent", "REC", "Alpha Pure 400", "REC-GW-0001", "Row A roofs", -45, 9080, 24, null, 42000, 25);
  asset(P(NP.ridgeview), "property", "Community well pump", "Plumbing", "Retired", "Poor", "Grundfos", "SP 17-9", "", "Pump house", -6000, null, 12, -500, 9000, 15, "Transferred with the sale.");

  const key = (owner, ownerType, name, keyType, opens, status, copies, extra = {}) => item(ownerType, owner, "key", { name, status, startsOn: extra.start == null ? null : D(extra.start), endsOn: extra.end == null ? null : D(extra.end) }, { keyType, opens, copies, heldBy: extra.heldBy || "", accessCode: extra.code || "", storageLocation: extra.storage || "Office key cabinet", notes: extra.notes || "" });
  key(P(MARLOWE), "property", "K-100 master", "Key", "All common doors, mechanical rooms", "Available", 3, { storage: "Office key cabinet, hook 1" });
  key(P(MARLOWE), "property", "Roof access fob", "Fob", "Tower A roof door", "Checked out", 1, { heldBy: "Evergreen HVAC Services", start: -2, end: -1, notes: "Due back yesterday — follow up." });
  key(P(MARLOWE), "property", "Showing lockbox", "Lockbox", "Lobby lockbox for self-guided tours", "Available", 1, { code: "4417" });
  key(P(PINECREST), "property", "Boiler room key", "Key", "North & South mechanical rooms", "Available", 2);
  key(P(PINECREST), "property", "Laundry coin box key", "Key", "Laundry machines", "Lost", 0, { notes: "Rekey ordered." });
  key(P(CASCADE), "property", "Construction gate code", "Keypad code", "Pine St construction gate", "Checked out", 1, { heldBy: "General contractor", start: -150, end: 210, code: "8813" });
  key(P(ALDER), "property", "Garage remotes (spares)", "Garage remote", "TH-1 to TH-4", "Available", 4);
  key(P(NP.ridgeview), "property", "Clubhouse keys", "Key", "Clubhouse", "Retired", 0, { notes: "Handed to the buyer at closing." });

  const meter = (owner, ownerType, name, utility, status, number, provider, account, responsibility, cost, reading, readOn, extra = {}) =>
    item(ownerType, owner, "meter", { name, status, amount: cost, startsOn: readOn == null ? null : D(readOn) }, { utility, meterNumber: number, provider, accountNumber: account, responsibility, serves: extra.serves || "", location: extra.location || "", lastReading: reading, rubsMethod: extra.rubsMethod || "", notes: extra.notes || "" });
  meter(P(MARLOWE), "property", "House electric", "Electric", "Active", "SCL-4410298", "Seattle City Light", "880-114-2210", "Owner", 2350, 412880, -5, { serves: "Common areas, garage, elevators", location: "P1 electrical room" });
  meter(P(MARLOWE), "property", "Domestic water", "Water", "Active", "SPU-W-88120", "Seattle Public Utilities", "SPU-55102", "RUBS / bill-back", 3100, 18820, -5, { rubsMethod: "By occupants", serves: "All units" });
  meter(P(MARLOWE), "property", "Sewer", "Sewer", "Active", "", "Seattle Public Utilities", "SPU-55102", "RUBS / bill-back", 1650, 0, -5, { rubsMethod: "By occupants" });
  meter(P(PINECREST), "property", "Gas — North boiler", "Gas", "Active", "NWN-77120", "NW Natural", "NWN-4410-01", "Owner", 640, 22104, -12);
  meter(P(PINECREST), "property", "Trash & recycling", "Trash", "Active", "", "Waste Management", "WM-PDX-2210", "Owner", 820, 0, null, { serves: "Both buildings" });
  meter(P(CASCADE), "property", "District steam", "Steam", "Active", "ES-30118", "Enwave Seattle", "ENW-310PINE", "Owner", 2900, 81120, -10, { serves: "Radiators, all units" });
  meter(P(NP.greenwood), "property", "Solar production", "Solar", "Active", "SOL-GW-1", "REC monitoring", "", "Owner", 0, 1820, -1, { notes: "Net-metered with Seattle City Light." });
  meter(P(NP.pioneer), "property", "Building internet", "Internet", "Active", "", "Lumen", "LMN-111JACK", "Tenant", 450, 0, null, { serves: "Lobby and riser" });
  meter(P(NP.ridgeview), "property", "Well electric", "Electric", "Inactive", "PSE-RV-01", "Puget Sound Energy", "PSE-55210", "Owner", 0, 99120, -125);

  const pv = (owner, vendor, trade, status, nte, afterHours, notes = "") => item("property", owner, "preferred_vendor", { name: vendor.name, status, amount: nte }, { vendorId: vendor.id, trade, afterHours, notes });
  pv(P(MARLOWE), RAINIER, "Plumbing", "Primary", 750, true);
  pv(P(MARLOWE), BRIGHTLINE, "Electrical", "Primary", 600, false);
  pv(P(MARLOWE), EVERGREEN_HVAC, "HVAC", "Primary", 1000, true);
  pv(P(MARLOWE), NV.elevator, "Elevator", "Primary", 2500, true, "Service contract covers monthly maintenance.");
  pv(P(MARLOWE), CLEARVIEW, "Cleaning", "Primary", 500, false);
  pv(P(PINECREST), EVERGREEN_HVAC, "HVAC", "Primary", 1000, true);
  pv(P(PINECREST), NV.pest, "Pest control", "Backup", 300, false, "Trial vendor while onboarding.");
  pv(P(PINECREST), CASCADE_LAND, "Landscaping", "Primary", 400, false);
  pv(P(PINECREST), NV.roofing, "Roofing", "Primary", 2500, false);
  pv(P(ALDER), CASCADE_LAND, "Landscaping", "Primary", 400, false);
  pv(P(ALDER), RAINIER, "Plumbing", "Backup", 500, true);
  pv(P(BIRCHWOOD), SUMMIT, "Appliances", "Primary", 300, false, "Owner approves anything above $300.");
  pv(P(CASCADE), RAINIER, "Plumbing", "Primary", 750, true);
  pv(P(NP.pioneer), NV.windows, "Cleaning", "Primary", 400, false);

  // Buildings: floors plus building-level compliance, assets, keys and meters.
  const floor = (b, name, level, use, units, sqft, access, notes = "") => item("building", b.id, "floor", { name, sort: level }, { use, unitCount: units, sqft, access, notes });
  [["Garage P2", -2, "Parking", 0, 6400, "Elevator & stairs"], ["Garage P1", -1, "Parking", 0, 6400, "Elevator & stairs"], ["Lobby & level 1", 1, "Mixed", 2, 6400, "Ground level", "Leasing office, mailroom, A-101, A-102"], ["Level 2", 2, "Amenity", 2, 6400, "Elevator & stairs", "Fitness centre plus A-201, A-202"], ["Level 3", 3, "Residential", 1, 6400, "Elevator & stairs"], ["Roof", 7, "Amenity", 0, 3200, "Restricted", "Rooftop deck; mechanical behind the fence"]].forEach((f) => floor(TOWER_A, ...f));
  [["Level 1", 1, "Residential", 2, 5700, "Ground level"], ["Level 2", 2, "Residential", 1, 5700, "Elevator & stairs"]].forEach((f) => floor(TOWER_B, ...f));
  [["Basement", -1, "Mechanical", 0, 5680, "Restricted", "Boiler room and temporary lockers"], ["Level 2", 2, "Residential", 1, 5680, "Elevator & stairs"], ["Level 3", 3, "Residential", 1, 5680, "Elevator & stairs"], ["Level 4", 4, "Residential", 1, 5680, "Elevator & stairs"]].forEach((f) => floor(LOFT_BLDG, ...f));
  [["Ground floor", 1, "Commercial", 0, 2600, "Ground level", "Retail tenants (not managed)"], ["Level 2", 2, "Commercial", 1, 2600, "Elevator & stairs"], ["Level 3", 3, "Commercial", 1, 2600, "Elevator & stairs"]].forEach((f) => floor(NB.pioneer, ...f));
  [["Level 1", 1, "Residential", 2, 3400, "Ground level"], ["Level 2", 2, "Residential", 1, 3400, "Stairs only"], ["Level 3", 3, "Residential", 1, 3400, "Stairs only"]].forEach((f) => floor(NORTH_BLDG, ...f));
  comp(TOWER_A.id, "building", "Elevator annual certificate — cars 1 & 2", "Certification", "Compliant", "WA L&I", "ELV-58821-A", "Annually", -95, 270, 380, { responsible: "Emerald City Elevator" });
  comp(TOWER_B.id, "building", "Elevator annual certificate", "Certification", "Pending", "WA L&I", "ELV-58821-B", "Annually", -350, 15, 190, { responsible: "Emerald City Elevator", notes: "Inspection booked next week." });
  comp(NB.rowB.id, "building", "Certificate of occupancy — Row B", "Certificate of occupancy", "Pending", "Seattle SDCI", "CO-7012340", "One-time", null, 160, 950);
  comp(NB.pioneer.id, "building", "Fire alarm monitoring certificate", "Certification", "Compliant", "Seattle Fire Department", "FA-90210", "Annually", -120, 245, 260);
  asset(TOWER_A.id, "building", "Passenger elevator — car 1", "Elevator", "In service", "Good", "Otis", "Gen2", "OT-GEN2-14-01", "Core", -4200, -2400, 1, -20, 160000, 25);
  asset(TOWER_A.id, "building", "Fire alarm panel", "Fire & life safety", "In service", "Good", "Notifier", "NFS2-3030", "NF-3030-221", "Concierge desk", -4200, -2400, 12, -60, 22000, 20);
  asset(LOFT_BLDG.id, "building", "Freight elevator", "Elevator", "Out of service", "Poor", "Dover", "Hydraulic", "DV-HYD-1988", "Rear", -13800, null, 1, -90, 120000, 30, "Down for the phase 2 modernization.");
  key(TOWER_A.id, "building", "Fire panel key", "Key", "Fire alarm panel", "Available", 2, { storage: "Knox box" });
  key(NB.pioneer.id, "building", "Tenant badge stock", "Access card", "Building entry", "Available", 25);
  meter(TOWER_B.id, "building", "EV charger submeter", "Electric", "Active", "SCL-EV-2201", "Seattle City Light", "880-114-2299", "RUBS / bill-back", 410, 22104, -5, { rubsMethod: "By unit", serves: "EV stalls 1–4" });
  policy(NB.pioneer.id, "building", "Hartford", "Umbrella", "HTF-UM-90073", 5000000, 0, 4100, -230, 135);
}

// Unit child records (different vocabularies from property kinds).
function applyUnitItems() {
  const U = (label) => unit(label).id;
  const code = (label, name, code6, assignedType, assignedTo, start, end, status, device = "Latch R") => item("unit", U(label), "access_code", { name, startsOn: D(start), endsOn: end == null ? null : D(end), status }, { code: code6, assignedType, assignedTo, lockDevice: device });
  code("B-101", "Resident code — Zoe Nguyen", "481920", "Lease", "Zoe Nguyen", 14, 379, "active");
  code("GW-1", "Showing code — Wren Castillo", "740219", "Showing", "Wren Castillo", 0, 0, "active");
  code("TH-4", "Vendor code — ClearView Cleaning", "550213", "Vendor", "ClearView Cleaning", -10, -3, "expired", "Schlage Encode");
  code("L-401", "Resident code — Owen Pryce", "118204", "Lease", "Owen Pryce", -395, -25, "revoked", "Yale Assure");
  code("A-101", "Staff code — maintenance", "907711", "Staff", "Ben Alvarez", -60, null, "active");
  const key = (label, name, keyType, status, copies, holder, start, end, notes = "") => item("unit", U(label), "key", { name, status, startsOn: start == null ? null : D(start), endsOn: end == null ? null : D(end) }, { keyType, copies, holder, notes });
  key("A-202", "A-202 unit key set", "Unit", "In office", 2, "", null, null);
  key("TH-4", "TH-4 garage remote", "Garage remote", "Lost", 0, "Emily Davis", -420, -55, "Not returned at move-out — replacement ordered.");
  key("B-201", "B-201 unit key", "Unit", "Checked out", 1, "ClearView Cleaning", -3, 2);
  key("S-201", "S-201 unit key", "Unit", "Checked out", 1, "Rainier Plumbing Co.", -6, -1, "Overdue — repairs still in progress.");
  key("Main house", "Spare house key", "Unit", "In office", 1, "", null, null);
  key("Main house", "Old mailbox key", "Mailbox", "Retired", 0, "", null, null, "Mailbox replaced by USPS.");
  key("Suite 200", "Master suite key", "Master", "In office", 1, "", null, null);
  const meter = (label, name, utility, status, reading, readOn, number, provider, account, billedTo, location) => item("unit", U(label), "meter", { name, status, amount: reading, startsOn: D(readOn) }, { utility, meterNumber: number, provider, accountNumber: account, billedTo, location });
  meter("Main house", "Electric", "Electric", "Active", 48210, -12, "PSE-E-77120", "Puget Sound Energy", "PSE-200118", "Tenant", "Side yard");
  meter("Main house", "Gas", "Gas", "Active", 9120, -12, "PSE-G-77121", "Puget Sound Energy", "PSE-200118", "Tenant", "Side yard");
  meter("TH-1", "Water", "Water", "Active", 1840, -30, "TW-11872", "Tacoma Water", "TW-88-1001", "Tenant", "Curb box");
  meter("L-302", "Water submeter", "Water", "Active", 410, -10, "CL-W-302", "Cascade Lofts submeter", "", "RUBS allocation", "Kitchen sink cabinet");
  meter("Suite 200", "Suite electric", "Electric", "Active", 61220, -15, "SCL-55210", "Seattle City Light", "880-220-1150", "Tenant", "Level 2 electrical closet");
  meter("A-101", "Electric", "Electric", "Inactive", 12002, -270, "SCL-A101", "Seattle City Light", "", "Tenant", "Hall closet");
  const asset = (label, name, category, status, brand, model, serial, start, end, cost, lastService, nextService, notes = "") => item("unit", U(label), "asset", { name, status, startsOn: D(start), endsOn: end == null ? null : D(end), amount: cost }, { category, brand, model, serialNumber: serial, lastServiceOn: lastService == null ? null : D(lastService), nextServiceOn: nextService == null ? null : D(nextService), notes });
  asset("B-102", "Water heater (50 gal)", "Water heater", "In service", "Rheem", "Performance Platinum", "RH-PP-26-4410", -20, 2170, 2350, -20, 345, "Replaced under work order — see Maintenance.");
  asset("Main house", "Refrigerator", "Appliance", "In service", "Samsung", "RF28T5001SR", "SAM-RF28-1120", -900, -170, 1900, -12, null, "Compressor relay replaced.");
  asset("Main house", "Furnace", "HVAC", "Needs repair", "Trane", "S9V2", "TR-S9V2-55021", -1300, 2350, 6800, -30, 150, "Igniter intermittent — monitor.");
  asset("TH-4", "Dishwasher", "Appliance", "Retired", "Whirlpool", "WDT730", "WP-WDT-0091", -2900, -1100, 650, null, null, "Replaced during make-ready.");
  asset("L-401", "Furniture package", "Furniture", "In service", "Article", "Loft set", "", -20, null, 7800, null, null, "For furnished mid-term stays.");
  asset("Suite 200", "Rooftop unit RTU-2", "HVAC", "In service", "Daikin", "Rebel DPS", "DK-DPS-0112", -300, 1525, 24000, -60, 120);
  asset("GW-1", "Smart thermostat", "Electronics", "In service", "Ecobee", "Premium", "EB-GW1-01", -45, 685, 250, null, null);
  asset("A-301", "Ceiling fan — bedroom", "Fixture", "In service", "Hunter", "Dempsey", "", -95, null, 180, null, null);
}

// Tenant child records: contacts, occupants, emergency contacts, pets, vehicles, renters insurance.
function applyTenantItems() {
  const t = (key) => T_[key].id;
  const contact = (key, name, relation, emailAddr, phone, flags = {}) => item("tenant", t(key), "contact", { name }, { relation, email: emailAddr, phone, isPrimary: false, onLease: false, receivesNotices: false, receivesStatements: false, smsOptIn: false, notes: "", ...flags });
  contact("daniel", "Amara Okafor", "Spouse / partner", "amara.okafor@mail.example", "(206) 555-1290", { onLease: true, receivesNotices: true, receivesStatements: true, smsOptIn: true });
  contact("aisha", "Kemi Bello", "Spouse / partner", "kemi.bello@mail.example", "(253) 555-1460", { onLease: true, receivesNotices: true });
  contact("noah", "Lena Schmidt", "Spouse / partner", "lena.schmidt@mail.example", "(253) 555-1517", { onLease: true, receivesStatements: true });
  contact("ravi", "Anjali Patel", "Spouse / partner", "anjali.patel@mail.example", "(425) 555-1714", { onLease: true, receivesNotices: true });
  contact("grace", "Min-jun Park", "Spouse / partner", "minjun.park@mail.example", "(503) 555-1611");
  contact("liam", "Siobhan O'Connor", "Guarantor", "siobhan.oconnor@mail.example", "(509) 555-1802", { receivesNotices: true, notes: "Co-signer on the lease." });
  contact("jamal", "Curtis Carter", "Guarantor", "curtis.carter@mail.example", "(503) 555-1866", { receivesNotices: true });
  contact("cobalt", "Devon Price", "Other", "devon@cobaltdesign.example", "(206) 555-0378", { isPrimary: true, receivesNotices: true, receivesStatements: true, notes: "Managing member and personal guarantor." });
  contact("cobalt", "Ana Ruiz", "Other", "ap@cobaltdesign.example", "(206) 555-0379", { receivesStatements: true, notes: "Accounts payable." });
  contact("marcus", "Tanya Johnson", "Sibling", "tanya.johnson@mail.example", "(503) 555-1388");
  const occ = (key, name, relation, dob, minor, start) => item("tenant", t(key), "occupant", { name, startsOn: D(start) }, { relation, dateOfBirth: dob, isMinor: minor });
  occ("daniel", "Tobi Okafor", "Child", shift(D(0), -730), true, -190);
  occ("aisha", "Ife Bello", "Child", "2014-03-19", true, -575);
  occ("aisha", "Dayo Bello", "Child", "2018-08-07", true, -575);
  occ("noah", "Felix Schmidt", "Child", "2021-04-30", true, -485);
  occ("ravi", "Arjun Patel", "Child", "2011-01-15", true, -500);
  occ("ravi", "Meera Patel", "Child", "2015-09-02", true, -500);
  occ("grace", "Min-jun Park", "Spouse / partner", "1994-02-11", false, -515);
  occ("marcus", "Tanya Johnson", "Sibling", "2000-06-03", false, -230);
  item("tenant", t("marcus"), "occupant", { name: "Jordan Johnson", startsOn: D(-230), endsOn: D(-60) }, { relation: "Sibling", dateOfBirth: "2002-10-11", isMinor: false, notes: "Moved out in the summer." });
  const em = (key, name, relation, phone, extra = {}) => item("tenant", t(key), "emergency_contact", { name }, { relation, phone, altPhone: "", email: "", address: "", notes: "", ...extra });
  for (const [key, name, relation, phone] of [
    ["maya", "Linda Chen", "Parent", "(415) 555-2201"], ["daniel", "Amara Okafor", "Spouse / partner", "(206) 555-1290"], ["priya", "Arun Raman", "Sibling", "(408) 555-2290"],
    ["lucas", "Elena Fernández", "Parent", "(305) 555-2214"], ["hannah", "Mark Brooks", "Parent", "(509) 555-2240"], ["omar", "Layla Haddad", "Spouse / partner", "(206) 555-2271"],
    ["grace", "Min-jun Park", "Spouse / partner", "(503) 555-1611"], ["marcus", "Tanya Johnson", "Sibling", "(503) 555-1388"], ["sofia", "Marco Rossi", "Child", "(503) 555-2290"],
    ["ethan", "Karen Walker", "Parent", "(541) 555-2301"], ["aisha", "Kemi Bello", "Spouse / partner", "(253) 555-1460"], ["noah", "Lena Schmidt", "Spouse / partner", "(253) 555-1517"],
    ["chloe", "Paul Martin", "Parent", "(509) 555-2333"], ["ravi", "Anjali Patel", "Spouse / partner", "(425) 555-1714"], ["liam", "Siobhan O'Connor", "Parent", "(509) 555-1802"],
    ["zoe", "Thu Nguyen", "Parent", "(303) 555-2350"], ["jamal", "Curtis Carter", "Parent", "(503) 555-1866"], ["cobalt", "Devon Price", "Other", "(206) 555-0378"],
  ]) em(key, name, relation, phone);
  em("maya", "Jess Alvarez", "Friend", "(206) 555-2209", { notes: "Has a spare key." });
  em("sofia", "Home Forward caseworker", "Other", "(503) 555-2299", { email: "caseworker@homeforward.example" });
  const pet = (key, name, type, breed, weight, endsOn, rent, extra = {}) => item("tenant", t(key), "pet", { name, endsOn: endsOn == null ? null : D(endsOn), amount: rent }, { petType: type, breed, weight, color: extra.color || "", age: extra.age || "", assistance: extra.assistance || "None", spayedNeutered: true, licenseNumber: extra.license || "", petDeposit: extra.deposit || 0, notes: extra.notes || "" });
  pet("hannah", "Miso", "Cat", "Domestic shorthair", "9 lb", 150, 35, { color: "Orange tabby", age: "4", deposit: 0 });
  pet("priya", "Pepper", "Cat", "Siamese mix", "8 lb", 200, 35, { age: "6" });
  pet("ravi", "Biscuit", "Dog", "Golden retriever", "68 lb", 45, 50, { color: "Golden", age: "5", license: "KC-77120", deposit: 500 });
  pet("aisha", "Kona", "Dog", "Labrador mix", "55 lb", -10, 0, { age: "3", assistance: "Emotional support (ESA)", notes: "ESA letter on file — no pet rent." });
  pet("daniel", "Nimbus", "Fish", "Betta", "", null, 0);
  const car = (key, make, model, year, color, plate, state, spot, permit, endsOn) => item("tenant", t(key), "vehicle", { name: make, endsOn: endsOn == null ? null : D(endsOn) }, { model, year, color, plate, plateState: state, parkingSpot: spot, permitNumber: permit, notes: "" });
  car("maya", "Honda", "Civic", 2019, "Blue", "CBZ4421", "WA", "P-14", "MAR-P14", 70);
  car("hannah", "Toyota", "Prius", 2022, "White", "CDK1180", "WA", "P-22", "MAR-P22", 270);
  car("ravi", "Subaru", "Outback", 2023, "Green", "BXR7006", "WA", "Garage", "", null);
  car("noah", "Toyota", "Highlander", 2020, "Silver", "BTM2214", "WA", "TH-2 garage", "ACT-02", 25);
  car("omar", "Mazda", "CX-5", 2018, "Red", "BRW9031", "WA", "Guest lot", "MAR-G07", -5);
  // Renters insurance (drives the Insurance Compliance report): compliant, expiring, expired, missing, waived.
  const rins = (key, carrier, liab, start, end, status, extra = {}) => item("tenant", t(key), "insurance_policy", { name: carrier, status, startsOn: D(start), endsOn: D(end), amount: liab }, { policyNumber: `RI-${T_[key].n}${String(Math.abs(start)).padStart(3, "0")}`, personalProperty: 25000, deductible: 500, interestedPartyListed: true, insuredNames: T_[key].name, notes: "", ...extra });
  rins("maya", "Cascade Mutual", 100000, -225, 140, "Active");
  rins("daniel", "Northwest Renters Co.", 300000, -165, 200, "Active", { insuredNames: "Daniel & Amara Okafor" });
  rins("priya", "Puget Home & Auto", 100000, -275, 90, "Active");
  rins("lucas", "Puget Home & Auto", 100000, -355, 10, "Active", { notes: "Ends before move-out — no renewal needed." });
  rins("hannah", "Northwest Renters Co.", 300000, -95, 250, "Active");
  rins("omar", "Evergreen Renters", 100000, -343, 22, "Active", { notes: "Renewal reminder sent through the portal." });
  rins("grace", "Evergreen Renters", 100000, -670, -305, "Active", { notes: "Prior policy." });
  rins("grace", "Evergreen Renters", 100000, -305, 60, "Active");
  rins("marcus", "Budget Renters", 100000, -230, 135, "Cancelled", { notes: "Cancelled for nonpayment of premium." });
  rins("sofia", "Cascade Mutual", 100000, -65, 300, "Active");
  rins("ethan", "Cascade Mutual", 100000, -40, 325, "Active");
  rins("aisha", "State Farm", 300000, -245, 120, "Active", { insuredNames: "Aisha & Kemi Bello" });
  rins("noah", "State Farm", 300000, -185, 180, "Active", { insuredNames: "Noah & Lena Schmidt" });
  rins("chloe", "Puget Home & Auto", 100000, -290, 75, "Active");
  rins("liam", "Evergreen Renters", 100000, -385, -20, "Active", { notes: "Lapsed — tenant says the new policy is coming." });
  rins("zoe", "Cascade Mutual", 100000, 14, 379, "Pending", { source: "portal", documentName: "Zoe Nguyen — declarations page.pdf", documentUrl: "", notes: "Uploaded through the resident portal; review before move-in." });
  rins("cobalt", "Pacific Commercial Insurance", 2000000, -300, 65, "Active", { personalProperty: 150000, deductible: 2500, insuredNames: "Cobalt Design Studio LLC" });
}

function applyOwnerItems() {
  const contact = (owner, name, relation, emailAddr, phone, flags = {}) => item("owner", owner.id, "contact", { name }, { relation, email: emailAddr, phone, receivesStatements: false, canApprove: false, notes: "", ...flags });
  contact(NORTHWIND, "Rebecca Lin", "Property manager", "rebecca.lin@northwind.example", "(206) 555-0142", { receivesStatements: true, canApprove: true, notes: "Primary contact — approves capital work." });
  contact(NORTHWIND, "Gary Hsu, CPA", "Accountant", "ghsu@hsucpa.example", "(206) 555-0149", { receivesStatements: true });
  contact(EVERGREEN_TRUST, "Andrea Walsh", "Partner", "awalsh@evergreentrust.example", "(503) 555-0187", { receivesStatements: true, canApprove: true, notes: "Trustee." });
  contact(EVERGREEN_TRUST, "Mills & Ortega LLP", "Attorney", "trusts@millsortega.example", "(503) 555-0190");
  contact(ALDER_PARTNERS, "Marcus Ihle", "Partner", "finance@aldercourt.example", "(253) 555-0119", { receivesStatements: true, canApprove: true });
  contact(REYES, "Elena Reyes", "Spouse / partner", "elena.reyes@mail.example", "(425) 555-0166", { canApprove: true });
  contact(NO.sound, "Priscilla Hart", "Partner", "finance@soundcapital.example", "(206) 555-0181", { receivesStatements: true });
  contact(NO.qaHoa, "Nora Bishop", "Other", "board@queenannecommons.example", "(206) 555-0161", { receivesStatements: true, canApprove: true, notes: "Board president." });
  contact(NO.qaHoa, "Sam Okoye", "Other", "treasurer@queenannecommons.example", "(206) 555-0162", { receivesStatements: true, notes: "Board treasurer." });
  contact(NO.mercantile, "Theo Marchetti", "Property manager", "am@mercantilestreet.example", "(206) 555-0192", { receivesStatements: true, canApprove: true });
  contact(NO.husky, "Rowan Achebe", "Partner", "trustee@huskyhousing.example", "(206) 555-0147", { canApprove: true, notes: "Trustee." });
  contact(NO.lim, "Grace Lim", "Assistant", "grace.lim@mail.example", "(206) 555-0155", { notes: "Daughter — helps with paperwork." });
}

// Vendor contacts, COIs, licenses and reviews; insurance_expiry and rating follow them.
function applyVendorItems() {
  const contact = (v, name, relation, emailAddr, phone, primary = false) => item("vendor", v.id, "contact", { name }, { relation, email: emailAddr, phone, isPrimary: primary, notes: "" });
  contact(RAINIER, "Mike Torres", "Dispatcher", "dispatch@rainierplumbing.example", "(206) 555-0110", true);
  contact(RAINIER, "Jen Alcott", "Billing", "billing@rainierplumbing.example", "(206) 555-0114");
  contact(BRIGHTLINE, "Sara Kowalski", "Owner", "jobs@brightline.example", "(206) 555-0133", true);
  contact(EVERGREEN_HVAC, "Dev Patel", "Dispatcher", "service@evergreenhvac.example", "(503) 555-0176", true);
  contact(EVERGREEN_HVAC, "Rosa Lind", "Estimator", "estimates@evergreenhvac.example", "(503) 555-0178");
  contact(SUMMIT, "Luis Herrera", "Technician", "help@summitappliance.example", "(425) 555-0191", true);
  contact(CLEARVIEW, "Nina Brooks", "Owner", "book@clearview.example", "(206) 555-0158", true);
  contact(CASCADE_LAND, "Tom Becker", "Owner", "crew@cascadelandscaping.example", "(253) 555-0122", true);
  contact(NV.roofing, "Craig Holm", "Estimator", "office@northgateroofing.example", "(206) 555-0227", true);
  contact(NV.elevator, "Vik Rao", "Dispatcher", "service@emeraldelevator.example", "(206) 555-0263", true);
  const coi = (v, carrier, type, perOcc, aggregate, start, end, status = "Active", extra = {}) => item("vendor", v.id, "insurance_policy", { name: carrier, status, startsOn: D(start), endsOn: D(end), amount: perOcc }, { policyType: type, policyNumber: `${carrier.slice(0, 3).toUpperCase()}-${type.slice(0, 2).toUpperCase()}-${Math.abs(start)}${Math.abs(end)}`, aggregate, additionalInsured: type === "General liability", waiverOfSubrogation: type !== "Commercial auto", certificateHolder: "Harbor & Pine Residential LLC", notes: "", ...extra });
  coi(RAINIER, "Liberty Mutual", "General liability", 2000000, 4000000, -155, 210);
  coi(RAINIER, "WA L&I", "Workers' compensation", 1000000, 1000000, -185, 180);
  coi(RAINIER, "Progressive Commercial", "Commercial auto", 1000000, 1000000, -100, 265);
  coi(BRIGHTLINE, "Hartford", "General liability", 1000000, 2000000, -215, 150);
  coi(EVERGREEN_HVAC, "Travelers", "General liability", 2000000, 4000000, -380, -15, "Active", { notes: "Expired — replaced by the renewal below." });
  coi(EVERGREEN_HVAC, "Travelers", "General liability", 2000000, 4000000, -15, 350, "Pending", { source: "portal", documentName: "Evergreen HVAC COI 2026-27.pdf", documentUrl: "", submittedAt: T(-3, 14), notes: "Uploaded through the vendor portal — review the additional-insured wording." });
  coi(EVERGREEN_HVAC, "SAIF", "Workers' compensation", 1000000, 1000000, -60, 305);
  coi(SUMMIT, "Nationwide", "General liability", 1000000, 2000000, -374, -9);
  coi(CASCADE_LAND, "State Farm", "General liability", 1000000, 2000000, -347, 18);
  coi(CASCADE_LAND, "State Farm", "Commercial auto", 1000000, 1000000, -347, 18);
  coi(NV.roofing, "Zurich", "General liability", 2000000, 4000000, -65, 300);
  coi(NV.roofing, "WA L&I", "Workers' compensation", 1000000, 1000000, -65, 300);
  coi(NV.roofing, "Zurich", "Umbrella", 5000000, 5000000, -65, 300);
  coi(NV.locks, "Farmers", "General liability", 1000000, 1000000, -425, -60);
  coi(NV.handyman, "Next Insurance", "General liability", 500000, 1000000, -565, -200);
  coi(NV.handyman, "Next Insurance", "General liability", 500000, 1000000, -200, 165, "Cancelled", { notes: "Policy cancelled by the carrier." });
  coi(NV.elevator, "Chubb", "General liability", 5000000, 10000000, -120, 245);
  coi(NV.elevator, "Chubb", "Professional liability", 2000000, 2000000, -120, 245);
  coi(NV.elevator, "WA L&I", "Workers' compensation", 1000000, 1000000, -120, 245);
  const lic = (v, type, number, state, classification, start, end, status = "Active") => item("vendor", v.id, "license", { name: type, status, startsOn: D(start), endsOn: D(end) }, { number, state, classification, notes: "" });
  lic(RAINIER, "Plumbing contractor", "RAINIPC812JQ", "WA", "PC01 — Plumbing contractor", -600, 130);
  lic(NV.roofing, "General contractor", "NORTHGR902LA", "WA", "Specialty — roofing", -718, 12);
  lic(NV.elevator, "Elevator contractor", "EMERAEC771BK", "WA", "Elevator contractor", -300, 430);
  lic(NV.elevator, "Elevator mechanic", "EM-55120", "WA", "Mechanic (lead)", -300, 65);
  lic(NV.pest, "Pesticide applicator", "PA-90112", "WA", "Structural pest control", -800, -70, "Active");
  lic(BRIGHTLINE, "Electrical contractor", "BRIGHEC921MS", "WA", "EC01 — General electrical", -1095, -1, "Cancelled");
  const review = (v, reviewer, rating, days, wo, quality, timeliness, again, comment) => item("vendor", v.id, "review", { name: reviewer, amount: rating, startsOn: D(days) }, { workOrder: wo, quality, timeliness, wouldHireAgain: again, comment });
  review(RAINIER, M.ben.name, 5, -18, "Water heater replacement — B-102", "Excellent", "On time", true, "Swapped the heater same day and hauled the old one.");
  review(RAINIER, M.jordan.name, 5, -3, "Burst supply line — S-201", "Excellent", "Early", true, "On site within 90 minutes at 11pm.");
  review(RAINIER, M.alex.name, 4, -120, "Main stack clean-out", "Good", "On time", true, "");
  review(BRIGHTLINE, M.ben.name, 4, -60, "Panel inspection", "Good", "Late", true, "Arrived two hours late but great work.");
  review(BRIGHTLINE, M.alex.name, 5, -200, "EV charger install", "Excellent", "On time", true, "");
  review(EVERGREEN_HVAC, M.jordan.name, 5, -30, "Annual furnace service — Birchwood", "Excellent", "On time", true, "");
  review(EVERGREEN_HVAC, M.ben.name, 4, -10, "Filter swap — Tower A", "Good", "On time", true, "");
  review(SUMMIT, M.jordan.name, 4, -14, "Refrigerator not cooling", "Good", "On time", true, "Needed a second visit for the part.");
  review(SUMMIT, M.tasha.name, 3, -90, "Dishwasher repair", "Fair", "Late", false, "Missed the first appointment.");
  review(CLEARVIEW, M.ben.name, 5, -50, "Move-out deep clean — TH-4", "Excellent", "Early", true, "");
  review(CASCADE_LAND, M.jordan.name, 4, -21, "Fall clean-up — Alder Court", "Good", "On time", true, "");
  review(NV.handyman, M.alex.name, 1, -160, "Closet door repair", "Poor", "Late", false, "No-show twice; unlicensed electrical work.");
  review(NV.elevator, M.alex.name, 5, -20, "Monthly maintenance", "Excellent", "On time", true, "");
  review(NV.roofing, M.jordan.name, 4, -21, "Roof condition report — Pinecrest", "Good", "On time", true, "");

  // Derived columns, mirroring the editor's write-backs.
  for (const v of rows("vendors")) {
    const cois = RECORD_ITEMS.filter((r) => r.owner_id === v.id && r.kind === "insurance_policy" && String(r.status).toLowerCase() !== "cancelled" && r.ends_on);
    if (cois.length) {
      const live = cois.filter((r) => r.ends_on >= D(0)).sort((a, b) => a.ends_on.localeCompare(b.ends_on));
      const dead = cois.filter((r) => r.ends_on < D(0)).sort((a, b) => b.ends_on.localeCompare(a.ends_on));
      v.insurance_expiry = (live[0] || dead[0]).ends_on;
    } else if (v.id === CLEARVIEW.id) {
      v.insurance_expiry = D(400); // legacy: no COI rows, expiry kept on the vendor
    } else {
      v.insurance_expiry = null;
    }
    const ratings = RECORD_ITEMS.filter((r) => r.owner_id === v.id && r.kind === "review" && r.amount > 0).map((r) => r.amount);
    v.rating = ratings.length ? Math.round((ratings.reduce((s, x) => s + x, 0) / ratings.length) * 10) / 10 : v.rating || 0;
  }
}

// Work-order estimates (record_items owner "workorder", kind "estimate") on playground work orders.
function applyEstimates() {
  const WO = (n) => sid(40, n);
  const est = (n, vendor, scope, amount, status, received, valid, accepted, notes = "") => item("workorder", WO(n), "estimate", { name: scope, amount, status, startsOn: D(received), endsOn: D(valid) }, { vendorId: vendor.id, vendorName: vendor.name, accepted, notes });
  est(1, EVERGREEN_HVAC, "Replace igniter and flame sensor", 485, "Received", -1, 13, false, "Parts on the truck.");
  est(1, EVERGREEN_HVAC, "Replace furnace (if heat exchanger cracked)", 6900, "Received", -1, 29, false, "Only if the exchanger fails inspection.");
  est(5, RAINIER, "Replace supply line, dry-out and subfloor repair", 4200, "Accepted", -5, 25, true, "Owner approved by phone.");
  est(5, NV.roofing, "Subfloor and cabinet base replacement", 4850, "Declined", -4, 26, false, "Higher and a longer lead time.");
  est(7, BRIGHTLINE, "Replace 4 kitchen GFCI outlets", 680, "Received", -6, 24, false, "On hold until the tenant confirms access.");
  est(8, NV.roofing, "Parapet brick repointing", 18500, "Requested", -2, 28, false);
  est(9, RAINIER, "50-gal water heater replacement", 2350, "Accepted", -22, 8, true);
  est(9, SUMMIT, "Water heater replacement", 2690, "Declined", -21, 9, false, "Not their trade.");
  est(10, SUMMIT, "Compressor relay + recharge", 340, "Accepted", -16, 14, true);
}

// =====================================================================================
// Team, portal access, settings
// =====================================================================================

// Team: [member, role, status, title, phone, added (days ago)] — role is the role *name*.
const NEW_MEMBERS = [
  [M.casey, "Maintenance tech", "Active", "Property inspector", "(206) 555-0110", -330],
  [M.taylor, "Leasing agent", "Active", "Leasing consultant — Downtown & Greenwood", "(206) 555-0111", -210],
  [M.samO, "Leasing agent", "Draft", "Weekend leasing consultant", "(206) 555-0112", -1],
];

function applyTeam() {
  const team = rows("team_members");
  for (const [m, role, status, title, phone, added] of NEW_MEMBERS) {
    team.push({
      id: m.id, name: m.name, email: email(m), role, status, created_at: T(added, 9), updated_at: T(added, 9),
      metadata: { phone, title, ...(status === "Draft" ? { activityNotes: "Offer accepted — account set-up pending." } : {}) },
    });
  }
  // Mirror phone/title into the live columns as well as metadata (the editor reads metadata).
  for (const r of team) {
    Object.assign(r, { phone: r.metadata?.phone ?? null, title: r.metadata?.title ?? null, role_label: r.role, invited_on: (r.created_at || T(-30)).slice(0, 10) });
  }
  team.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}

// portal_members mirror each party's portal state (invited / active / disabled).
function applyPortal() {
  const members = rows("portal_members");
  const next = counter(86, 1);
  let auth = 1;
  const push = (role, party, column, status, invitedDays, activatedDays, lastSeen, inviteCount = 1) => members.push({
    id: next(), email: String(party.email).toLowerCase(), name: party.name, role,
    tenant_id: column === "tenant_id" ? party.id : null, owner_id: column === "owner_id" ? party.id : null, vendor_id: column === "vendor_id" ? party.id : null,
    status, auth_user_id: status === "invited" ? null : fakeAuth(auth++), invited_at: T(invitedDays, 10), invited_by: ctx.createdBy,
    invite_count: inviteCount, activated_at: activatedDays == null ? null : T(activatedDays, 18), last_seen_at: lastSeen,
    metadata: {}, created_at: T(invitedDays, 10), updated_at: lastSeen || T(invitedDays, 10),
  });
  for (const t of rows("tenants")) {
    const state = t.metadata?.portalStatus;
    if (!state || state === "Not invited") continue;
    const n = ALL_TENANTS.find((x) => x.id === t.id)?.n || 1;
    if (state === "Active") push("resident", t, "tenant_id", "active", -(60 + n), -(58 + n), t.portal_last_seen);
    else if (state === "Invited") push("resident", t, "tenant_id", "invited", -(3 + n % 5), null, null, n === 16 ? 2 : 1);
    else push("resident", t, "tenant_id", "disabled", -(400 + n), -(398 + n), T(-(56 + n % 3), 20));
  }
  for (const o of rows("owners")) {
    const state = o.metadata?.portalStatus;
    if (!state || state === "Not invited") continue;
    const invited = o.metadata.portalInvitedAt;
    const days = invited ? Math.round((Date.parse(invited) - Date.now()) / 86400000) : -30;
    if (state === "Active") push("owner", o, "owner_id", "active", days, days + 2, T(-(o.name.length % 6), 8));
    else if (state === "Invited") push("owner", o, "owner_id", "invited", days, null, null, 2);
    else push("owner", o, "owner_id", "disabled", days, days + 3, T(-60, 8));
  }
  for (const v of rows("vendors")) {
    const state = v.metadata?.portalStatus;
    if (!state || state === "Not invited") continue;
    const invited = v.metadata.portalInvitedAt;
    const days = invited ? Math.round((Date.parse(invited) - Date.now()) / 86400000) : -30;
    if (state === "Active") push("vendor", v, "vendor_id", "active", days, days + 1, T(-(v.name.length % 4), 7));
    else if (state === "Invited") push("vendor", v, "vendor_id", "invited", days, null, null);
    else push("vendor", v, "vendor_id", "disabled", days, days + 2, T(-700, 7));
  }
}

const webhookId = (n) => `7e6b0000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function applySettings() {
  const VALUES = {
    company_profile: {
      legalName: "Harbor & Pine Residential LLC", dba: "Harbor & Pine", email: "hello@harborpine.example", phone: "(206) 555-0100",
      address: "1200 Harbor Ave, Suite 300", city: "Seattle", state: "WA", zip: "98101", licenseNumber: "PM-58214",
      timezone: "America/Los_Angeles", currency: "USD",
    },
    branding_portals: {
      displayName: "Harbor & Pine Residential", logoUrl: "", accent: "emerald",
      residentPortal: true, ownerPortal: true, vendorPortal: true,
      portalWelcome: "Welcome home! Pay rent, request maintenance and message your management team any time.",
      supportEmail: "support@harborpine.example", supportPhone: "(206) 555-0100",
    },
    integrations: {
      webhooks: [
        { id: webhookId(1), url: "https://hooks.harborpine.example/property/payments", events: ["payment.received", "lease.signed"], enabled: true },
        { id: webhookId(2), url: "https://ops.harborpine.example/webhooks/maintenance", events: ["work_order.created", "work_order.completed"], enabled: true },
        { id: webhookId(3), url: "https://crm.harborpine.example/inbound/leads", events: ["application.submitted", "tenant.created"], enabled: false },
      ],
    },
    custom_fields: CUSTOM_FIELDS,
  };
  // No `roles` row: saving roles switches RBAC on and demotes non-creator viewers to Manager.
  const settings = rows("settings");
  const rolesAt = settings.findIndex((s) => s.key === "roles");
  if (rolesAt >= 0) settings.splice(rolesAt, 1);
  let n = 1;
  for (const [key, value] of Object.entries(VALUES)) {
    const row = settings.find((s) => s.key === key);
    if (row) row.value = value;
    else settings.push({ id: sid(87, n++), key, value });
  }
}

// =====================================================================================
// Paused reminder jobs: notification_sends rows (status "sent") whose dedupe keys make
// lib/messaging/reminder_jobs.js treat every reminder this seed would trigger as already
// done. notification_sends belongs to the workspace area — call ctx.peoplePausedSends()
// after every area ran (it reads the final rows + notification/fee settings).
// =====================================================================================

const MONTHS_AHEAD = 24;

export function pausedSends(c = ctx) {
  const get = (t) => c.rows(t);
  const today = D(0);
  const out = [];
  const seen = new Set();
  const next = counter(88, 1);
  const add = (dedupe_key, job_key, notification, record_type, record_id) => {
    if (seen.has(dedupe_key)) return;
    seen.add(dedupe_key);
    out.push({ id: next(), dedupe_key, job_key, notification, channel: "email", recipient: null, record_type, record_id, status: "sent", metadata: { seed: "demo-paused" } });
  };
  const setting = (key) => get("settings").find((s) => s.key === key)?.value || {};
  const notif = setting("notifications");
  const buckets = (Array.isArray(notif.leaseReminderDays) ? notif.leaseReminderDays : [60, 30]).map(Number).filter((x) => x > 0);
  const fees = setting("fees_policies");
  const props = new Map(get("properties").map((p) => [p.id, p]));
  const tenants = new Map(get("tenants").map((t) => [t.id, t]));
  const dueDay = (lease) => {
    const o = { ...(fees || {}), ...(props.get(lease.property_id)?.metadata?.policyOverrides || {}), ...(lease.metadata?.policyOverrides || {}) };
    return Math.min(28, Math.max(1, Number(o.rentDueDay) || 1));
  };
  const recipients = (lease) => {
    const set = new Set();
    const t = tenants.get(lease.tenant_id);
    if (t?.email) set.add(t.email.toLowerCase());
    for (const p of get("lease_parties")) if (p.lease_id === lease.id && p.role === "tenant" && p.email && !p.deleted_at) set.add(p.email.toLowerCase());
    return set.size ? [...set] : ["none"];
  };

  // Lease expiry + renewal-window alerts (once per lease term) and monthly rent reminders.
  for (const l of get("leases")) {
    if (l.deleted_at) continue;
    if (["Active", "Expiring soon", "Pending"].includes(l.status) && l.term_end && l.term_end >= today) {
      add(`renewal-window:${l.id}:${l.term_end}`, "lease-reminders", "staff_alerts", "lease", l.id);
      for (const b of buckets) for (const e of recipients(l)) add(`lease-expiring:${l.id}:${l.term_end}:${b}:${e}`, "lease-reminders", "lease_expiring", "lease", l.id);
    }
    if (l.status === "Active" && Number(l.rent) > 0) {
      const day = pad(dueDay(l));
      for (let m = 0; m <= MONTHS_AHEAD; m++) {
        const due = `${addMonths(`${today.slice(0, 8)}01`, m).slice(0, 8)}${day}`;
        if (due < today) continue;
        for (const e of recipients(l)) add(`rent-reminder:${l.id}:${due}:${e}`, "rent-reminders", "rent_reminder", "lease", l.id);
      }
    }
  }

  // Expiring documents: COIs, licenses, renters insurance, pets, vehicles, owner agreements, W-9s, compliance items.
  const items = get("record_items").filter((r) => !r.deleted_at && String(r.status || "").toLowerCase() !== "cancelled");
  const of = (ownerType, id, kind) => items.filter((r) => r.owner_type === ownerType && r.owner_id === id && r.kind === kind);
  const marks = (subject, endsOn, list, recordType, recordId) => list.forEach((mk) => add(`doc-expiring:${subject}:${endsOn || "none"}:${mk}`, "expiring-documents", "document_expiring", recordType, recordId));
  const years = [YEAR, YEAR + 1];
  for (const v of get("vendors")) {
    if (["inactive", "do not use"].includes(String(v.status || "").toLowerCase())) continue;
    const m = v.metadata || {};
    if (!m.coiWaived) {
      const cois = get("record_items").filter((r) => !r.deleted_at && r.owner_type === "vendor" && r.owner_id === v.id && r.kind === "insurance_policy");
      if (cois.length) of("vendor", v.id, "insurance_policy").forEach((r) => r.ends_on && marks(`insurance_policy:${r.id}`, r.ends_on, ["30", "14", "0"], "vendor", v.id));
      else if (v.insurance_expiry) marks(`vendor-coi:${v.id}`, v.insurance_expiry, ["30", "14", "0"], "vendor", v.id);
    }
    if (m.licenseRequired) of("vendor", v.id, "license").forEach((r) => r.ends_on && marks(`license:${r.id}`, r.ends_on, ["30", "0"], "vendor", v.id));
    if (!m.w9OnFile) years.forEach((y) => marks(`w9:vendor:${v.id}:${y}`, null, ["dec"], "vendor", v.id));
  }
  for (const t of get("tenants")) {
    if (t.status === "Past") continue;
    const m = t.metadata || {};
    if (!m.insuranceWaived) {
      const pols = of("tenant", t.id, "insurance_policy");
      if (pols.length) pols.forEach((r) => r.ends_on && marks(`insurance_policy:${r.id}`, r.ends_on, ["30", "7", "0"], "tenant", t.id));
      else if (["Current", "Late", "Notice"].includes(t.status)) {
        for (let k = 0; k <= MONTHS_AHEAD; k++) marks(`renters-missing:${t.id}:${addMonths(`${today.slice(0, 8)}01`, k).slice(0, 7)}`, null, ["missing"], "tenant", t.id);
      }
    }
    for (const kind of ["pet", "vehicle"]) of("tenant", t.id, kind).forEach((r) => r.ends_on && marks(`${kind}:${r.id}`, r.ends_on, ["30", "0"], "tenant", t.id));
  }
  for (const o of get("owners")) {
    if (o.status === "Inactive") continue;
    const m = o.metadata || {};
    if (m.agreementEnd) marks(`owner-agreement:${o.id}`, m.agreementEnd, ["60", "30", "0"], "owner", o.id);
    if (!m.w9OnFile && m.requires1099 !== false) years.forEach((y) => marks(`w9:owner:${o.id}:${y}`, null, ["dec"], "owner", o.id));
  }
  for (const r of items.filter((x) => x.kind === "compliance_item" && x.ends_on)) {
    for (const mk of ["30", "0"]) add(`doc-staff:compliance:${r.id}:${r.ends_on}:${mk}`, "expiring-documents", "staff_alerts", r.owner_type, r.owner_id);
  }
  return out;
}

// Realistic created_at for rows that would otherwise all read "created just now".
function stampDates() {
  const stamp = (table, dateOf) => {
    for (const r of rows(table)) {
      if (r.created_at) continue;
      const d = dateOf(r);
      if (d) r.created_at = r.updated_at = at(d > D(0) ? D(-1) : d, 9);
    }
  };
  stamp("properties", (r) => r.metadata?.purchaseDate || r.metadata?.management?.agreementStart || D(-400));
  stamp("leases", (r) => (r.signed_date ? shift(r.signed_date, -2) : D(-2)));
  stamp("tenants", (r) => (r.lease_start ? shift(r.lease_start, -20) : D(-3)));
  stamp("owners", (r) => r.since);
  stamp("vendors", (r) => r.metadata?.since);
  stamp("lease_templates", () => D(-700));
}

// =====================================================================================

export async function apply(c) {
  ctx = c;
  applyPropertySection();
  applyPeopleTenantsLeases();
  applyLeaseParties();
  applyOwners();
  applyVendors();
  applyMarketing();
  applyRenewals();
  applyInspections();
  applyMoves();
  applyDeposits();
  applyNotices();
  applyTemplates();
  applyEsign();
  applyAddenda();
  applyLeaseItems();
  applyPropertyItems();
  applyUnitItems();
  applyTenantItems();
  applyOwnerItems();
  applyVendorItems();
  applyEstimates();
  rows("record_items").push(...RECORD_ITEMS);
  stampDates();
  applyTeam();
  applyPortal();
  applySettings();
  // Reminder-job dedupe rows for the workspace area's notification_sends (see pausedSends).
  c.peoplePausedSends = () => pausedSends(c);
}
