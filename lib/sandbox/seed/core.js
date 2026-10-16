import { GROUPS, SANDBOX_PROJECT_ID, SANDBOX_ORG_ID, sid, daysFromNow } from "./ids";

// Core sample portfolio for the playground: portfolios → properties → buildings
// → units, plus the people (tenants, owners, vendors) and leases every other
// area references. Rows are snake_case DB shape; the exported reference arrays
// (PROPERTIES, UNITS, TENANTS, LEASES, OWNERS, VENDORS) let area seeds link to them.

export const PORTFOLIOS = [
  { id: sid(GROUPS.portfolio, 1), name: "Downtown Core", region: "Seattle, WA", manager: "Alex Rivera", color: "sky", description: "Mid-rise apartments and lofts in central Seattle." },
  { id: sid(GROUPS.portfolio, 2), name: "Suburban Homes", region: "Pacific Northwest", manager: "Jordan Lee", color: "emerald", description: "Townhomes, garden-style communities and single-family rentals." },
];

export const PROPERTIES = [
  { id: sid(GROUPS.property, 1), name: "The Marlowe", address: "1200 Harbor Ave", city: "Seattle", state: "WA", zip: "98101", type: "Apartment", status: "Active", portfolioId: PORTFOLIOS[0].id, yearBuilt: 2014, description: "Six-storey mid-rise with rooftop deck, fitness centre and secure parking." },
  { id: sid(GROUPS.property, 2), name: "Pinecrest Commons", address: "4410 SE Division St", city: "Portland", state: "OR", zip: "97206", type: "Multi-family", status: "Active", portfolioId: PORTFOLIOS[1].id, yearBuilt: 1998, description: "Garden-style community across two buildings, close to transit." },
  { id: sid(GROUPS.property, 3), name: "Alder Court Townhomes", address: "88 Alder Ct", city: "Tacoma", state: "WA", zip: "98403", type: "Multi-family", status: "Active", portfolioId: PORTFOLIOS[1].id, yearBuilt: 2008, description: "Three-bedroom townhomes with private garages and yards." },
  { id: sid(GROUPS.property, 4), name: "14 Birchwood Lane", address: "14 Birchwood Ln", city: "Bellevue", state: "WA", zip: "98004", type: "Single-family", status: "Active", portfolioId: PORTFOLIOS[1].id, yearBuilt: 1987, description: "Four-bedroom family home on a quiet cul-de-sac." },
  { id: sid(GROUPS.property, 5), name: "Cascade Lofts", address: "310 Pine St", city: "Seattle", state: "WA", zip: "98101", type: "Condo", status: "Maintenance", portfolioId: PORTFOLIOS[0].id, yearBuilt: 1924, description: "Converted warehouse lofts, mid-way through a lobby and façade renovation." },
];

const [MARLOWE, PINECREST, ALDER, BIRCHWOOD, CASCADE] = PROPERTIES;

export const BUILDINGS = [
  { id: sid(GROUPS.building, 1), name: "Tower A", blockCode: "A", propertyId: MARLOWE.id, floors: 6, yearBuilt: 2014, structureType: "Concrete", wing: "North" },
  { id: sid(GROUPS.building, 2), name: "Tower B", blockCode: "B", propertyId: MARLOWE.id, floors: 4, yearBuilt: 2016, structureType: "Concrete", wing: "South" },
  { id: sid(GROUPS.building, 3), name: "North Building", blockCode: "N", propertyId: PINECREST.id, floors: 3, yearBuilt: 1998, structureType: "Wood frame", wing: "" },
  { id: sid(GROUPS.building, 4), name: "South Building", blockCode: "S", propertyId: PINECREST.id, floors: 3, yearBuilt: 1998, structureType: "Wood frame", wing: "" },
  { id: sid(GROUPS.building, 5), name: "Loft Building", blockCode: "L", propertyId: CASCADE.id, floors: 5, yearBuilt: 1924, structureType: "Brick masonry", wing: "" },
];

export const FLOOR_PLANS = [
  { id: sid(GROUPS.floorPlan, 1), name: "The Alcove", bedrooms: 0, bathrooms: 1, sqft: 480, dimensions: "24' × 20'", propertyId: MARLOWE.id, description: "Open studio with a sleeping alcove." },
  { id: sid(GROUPS.floorPlan, 2), name: "The Aspen", bedrooms: 1, bathrooms: 1, sqft: 690, dimensions: "30' × 23'", propertyId: null, description: "One bedroom with a galley kitchen and balcony." },
  { id: sid(GROUPS.floorPlan, 3), name: "The Birch", bedrooms: 2, bathrooms: 2, sqft: 980, dimensions: "35' × 28'", propertyId: null, description: "Split two-bedroom with an ensuite primary." },
  { id: sid(GROUPS.floorPlan, 4), name: "The Cedar", bedrooms: 3, bathrooms: 2.5, sqft: 1480, dimensions: "Two levels", propertyId: ALDER.id, description: "Two-level townhome with attached garage." },
];

export const UNIT_TYPES = [
  { id: sid(GROUPS.unitType, 1), name: "Studio", bedrooms: 0, bathrooms: 1, sqft: 480, marketRent: 1495, deposit: 1000, floorPlanId: FLOOR_PLANS[0].id },
  { id: sid(GROUPS.unitType, 2), name: "1 Bed / 1 Bath", bedrooms: 1, bathrooms: 1, sqft: 690, marketRent: 1895, deposit: 1500, floorPlanId: FLOOR_PLANS[1].id },
  { id: sid(GROUPS.unitType, 3), name: "2 Bed / 2 Bath", bedrooms: 2, bathrooms: 2, sqft: 980, marketRent: 2550, deposit: 2000, floorPlanId: FLOOR_PLANS[2].id },
  { id: sid(GROUPS.unitType, 4), name: "3 Bed Townhome", bedrooms: 3, bathrooms: 2.5, sqft: 1480, marketRent: 3250, deposit: 3000, floorPlanId: FLOOR_PLANS[3].id },
  { id: sid(GROUPS.unitType, 5), name: "Single-family Home", bedrooms: 4, bathrooms: 3, sqft: 2350, marketRent: 4200, deposit: 4200, floorPlanId: null },
];

const [STUDIO, ONE_BED, TWO_BED, TOWNHOME, HOUSE] = UNIT_TYPES;

export const AMENITIES = [
  { id: sid(GROUPS.amenity, 1), name: "Fitness centre", category: "Community", scope: "property", icon: "Dumbbell", feeType: "none", feeAmount: 0, description: "24/7 keycard-access gym." },
  { id: sid(GROUPS.amenity, 2), name: "Rooftop deck", category: "Outdoor", scope: "property", icon: "Sun", feeType: "none", feeAmount: 0, description: "Shared rooftop with grills and city views." },
  { id: sid(GROUPS.amenity, 3), name: "In-unit laundry", category: "Unit", scope: "unit", icon: "WashingMachine", feeType: "none", feeAmount: 0, description: "Full-size washer and dryer." },
  { id: sid(GROUPS.amenity, 4), name: "Covered parking", category: "Parking", scope: "both", icon: "Car", feeType: "monthly", feeAmount: 150, description: "Reserved stall in the secured garage." },
  { id: sid(GROUPS.amenity, 5), name: "EV charging", category: "Utilities", scope: "property", icon: "Zap", feeType: "monthly", feeAmount: 45, description: "Level 2 chargers, billed monthly." },
  { id: sid(GROUPS.amenity, 6), name: "Package lockers", category: "Security", scope: "property", icon: "Package", feeType: "none", feeAmount: 0, description: "Smart lockers with text notifications." },
  { id: sid(GROUPS.amenity, 7), name: "Pet spa", category: "Community", scope: "property", icon: "Dog", feeType: "one-time", feeAmount: 350, description: "Dog-wash station; one-time pet fee applies." },
];

export const OWNERS = [
  { id: sid(GROUPS.owner, 1), name: "Northwind Holdings LLC", email: "rebecca.lin@northwind.example", phone: "(206) 555-0142", company: "Northwind Holdings", managementFeePct: 8, payoutMethod: "ACH", taxIdLast4: "4471", status: "Active", propertyIds: [MARLOWE.id, CASCADE.id] },
  { id: sid(GROUPS.owner, 2), name: "Evergreen Family Trust", email: "awalsh@evergreentrust.example", phone: "(503) 555-0187", company: "Evergreen Family Trust", managementFeePct: 7, payoutMethod: "ACH", taxIdLast4: "9023", status: "Active", propertyIds: [PINECREST.id] },
  { id: sid(GROUPS.owner, 3), name: "Alder Court Partners LP", email: "finance@aldercourt.example", phone: "(253) 555-0119", company: "Alder Court Partners", managementFeePct: 8.5, payoutMethod: "Wire", taxIdLast4: "6610", status: "Active", propertyIds: [ALDER.id] },
  { id: sid(GROUPS.owner, 4), name: "Jonathan Reyes", email: "jreyes@mail.example", phone: "(425) 555-0164", company: "", managementFeePct: 10, payoutMethod: "Check", taxIdLast4: "3358", status: "Onboarding", propertyIds: [BIRCHWOOD.id] },
];

export const VENDORS = [
  { id: sid(GROUPS.vendor, 1), name: "Rainier Plumbing Co.", contactName: "Mike Torres", email: "dispatch@rainierplumbing.example", phone: "(206) 555-0110", specialty: "Plumbing", rating: 4.8, hourlyRate: 95, insuranceExpiry: daysFromNow(210), status: "Preferred" },
  { id: sid(GROUPS.vendor, 2), name: "Brightline Electric", contactName: "Sara Kowalski", email: "jobs@brightline.example", phone: "(206) 555-0133", specialty: "Electrical", rating: 4.6, hourlyRate: 110, insuranceExpiry: daysFromNow(150), status: "Active" },
  { id: sid(GROUPS.vendor, 3), name: "Evergreen HVAC Services", contactName: "Dev Patel", email: "service@evergreenhvac.example", phone: "(503) 555-0176", specialty: "HVAC", rating: 4.7, hourlyRate: 105, insuranceExpiry: daysFromNow(320), status: "Preferred" },
  { id: sid(GROUPS.vendor, 4), name: "Summit Appliance Repair", contactName: "Luis Herrera", email: "help@summitappliance.example", phone: "(425) 555-0191", specialty: "Appliances", rating: 4.4, hourlyRate: 85, insuranceExpiry: daysFromNow(95), status: "Active" },
  { id: sid(GROUPS.vendor, 5), name: "ClearView Cleaning", contactName: "Nina Brooks", email: "book@clearview.example", phone: "(206) 555-0158", specialty: "Cleaning", rating: 4.9, hourlyRate: 55, insuranceExpiry: daysFromNow(400), status: "Preferred" },
  { id: sid(GROUPS.vendor, 6), name: "Cascade Landscaping", contactName: "Tom Becker", email: "crew@cascadelandscaping.example", phone: "(253) 555-0122", specialty: "Landscaping", rating: 4.3, hourlyRate: 60, insuranceExpiry: daysFromNow(18), status: "Active" },
];

// Units: [n, label, property, building, type, floor, rent, status]
const UNIT_SPECS = [
  [1, "A-101", MARLOWE, 0, STUDIO, "1", 1495, "Occupied"],
  [2, "A-102", MARLOWE, 0, ONE_BED, "1", 1875, "Occupied"],
  [3, "A-201", MARLOWE, 0, ONE_BED, "2", 1925, "Occupied"],
  [4, "A-202", MARLOWE, 0, TWO_BED, "2", 2575, "Notice"],
  [5, "A-301", MARLOWE, 0, TWO_BED, "3", 2650, "Occupied"],
  [6, "B-101", MARLOWE, 1, ONE_BED, "1", 1850, "Vacant"],
  [7, "B-102", MARLOWE, 1, TWO_BED, "1", 2525, "Occupied"],
  [8, "B-201", MARLOWE, 1, STUDIO, "2", 1525, "Make-ready"],
  [9, "N-101", PINECREST, 2, TWO_BED, "1", 1995, "Occupied"],
  [10, "N-102", PINECREST, 2, TWO_BED, "1", 1995, "Occupied"],
  [11, "N-201", PINECREST, 2, ONE_BED, "2", 1550, "Vacant"],
  [12, "S-101", PINECREST, 3, ONE_BED, "1", 1575, "Occupied"],
  [13, "S-102", PINECREST, 3, TWO_BED, "1", 2025, "Occupied"],
  [14, "S-201", PINECREST, 3, TWO_BED, "2", 1995, "Down"],
  [15, "TH-1", ALDER, null, TOWNHOME, "1–2", 3250, "Occupied"],
  [16, "TH-2", ALDER, null, TOWNHOME, "1–2", 3275, "Occupied"],
  [17, "TH-3", ALDER, null, TOWNHOME, "1–2", 3200, "Notice"],
  [18, "TH-4", ALDER, null, TOWNHOME, "1–2", 3350, "Make-ready"],
  [19, "Main house", BIRCHWOOD, null, HOUSE, "1–2", 4200, "Occupied"],
  [20, "L-201", CASCADE, 4, ONE_BED, "2", 2100, "Vacant"],
  [21, "L-302", CASCADE, 4, TWO_BED, "3", 2850, "Occupied"],
  [22, "L-401", CASCADE, 4, TWO_BED, "4", 2795, "Make-ready"],
];

// Tenants: [n, name, unit n | null, status, balance, lease start (days), lease end (days)]
const TENANT_SPECS = [
  [1, "Maya Chen", 1, "Current", 0, -260, 105],
  [2, "Daniel Okafor", 2, "Current", 0, -190, 175],
  [3, "Priya Raman", 3, "Current", 0, -320, 45],
  [4, "Lucas Fernández", 4, "Current", 0, -335, 30],
  [5, "Hannah Brooks", 5, "Current", 0, -95, 270],
  [6, "Omar Haddad", 7, "Late", 1450, -400, 330],
  [7, "Grace Kim", 9, "Current", 0, -150, 215],
  [8, "Marcus Johnson", 10, "Late", 2150, -230, 135],
  [9, "Sofia Rossi", 12, "Current", 0, -310, 55],
  [10, "Ethan Walker", 13, "Current", 0, -40, 325],
  [11, "Aisha Bello", 15, "Current", 0, -210, 155],
  [12, "Noah Schmidt", 16, "Current", 0, -120, 245],
  [13, "Chloe Martin", 17, "Current", 0, -350, 15],
  [14, "Ravi Patel", 19, "Current", 0, -500, 230],
  [15, "Liam O'Connor", 21, "Late", 650, -75, 290],
  [16, "Zoe Nguyen", 6, "Applicant", 0, 14, 379],
  [17, "Jamal Carter", 11, "Applicant", 0, 21, 386],
  [18, "Emily Davis", 18, "Past", 0, -420, -55],
];

// Tenant n → household n (households live in workspace.js, group 65).
const HOUSEHOLD_OF = { 2: 1, 7: 2, 8: 3, 11: 4, 12: 5, 14: 6 };

// The landing page's own hosted images, reused as property covers.
const COVER = (id) => `https://200rfrtp5x71tlmk.public.blob.vercel-storage.com/geiger-dash/cursor-assets/${id}.jpg`;
const COVERS = [
  COVER("asset-00a586c62c8782e65c0a"),
  COVER("asset-0ec1f3ba625f482c9dc3"),
  COVER("asset-85923e7fafe00c9c0d1f"),
  COVER("asset-8e2e88cff7f33224ddd7"),
  COVER("asset-0a66efa21dd4b7e6c526"),
];

const emailFor = (name) =>
  `${name.toLowerCase().normalize("NFD").replace(/[^a-z ]/g, "").trim().replace(/\s+/g, ".")}@mail.example`;

export const UNITS = UNIT_SPECS.map(([n, label, property, b, type, floor, rent, status]) => ({
  id: sid(GROUPS.unit, n),
  label,
  propertyId: property.id,
  propertyName: property.name,
  buildingId: b == null ? null : BUILDINGS[b].id,
  unitTypeId: type.id,
  floorPlanId: type.floorPlanId,
  floor,
  bedrooms: type.bedrooms,
  bathrooms: type.bathrooms,
  sqft: type.sqft,
  rent,
  deposit: type.deposit,
  status,
  display: `${property.name} · ${label}`,
}));

const unitByN = (n) => UNITS[n - 1];

export const TENANTS = TENANT_SPECS.map(([n, name, unitN, status, balance, start, end], i) => {
  const unit = unitN ? unitByN(unitN) : null;
  return {
    id: sid(GROUPS.tenant, n),
    name,
    email: emailFor(name),
    phone: `(206) 555-${String(1200 + n * 37).slice(-4)}`,
    status,
    balance,
    unitId: unit?.id ?? null,
    unit: unit?.display ?? "",
    propertyId: unit?.propertyId ?? null,
    leaseId: sid(GROUPS.lease, i + 1),
    householdId: HOUSEHOLD_OF[n] ? sid(65, HOUSEHOLD_OF[n]) : null,
    leaseStart: daysFromNow(start),
    leaseEnd: daysFromNow(end),
    portalEnabled: status === "Current" || status === "Late",
  };
});

const leaseStatus = (t, endDays) => {
  if (t.status === "Past") return "Ended";
  if (t.status === "Applicant") return t.id === TENANTS[16].id ? "Draft" : "Pending";
  return endDays <= 60 ? "Expiring soon" : "Active";
};

export const LEASES = TENANTS.map((t, i) => {
  const unit = UNITS.find((u) => u.id === t.unitId);
  return {
    id: t.leaseId,
    name: `${unit?.label ?? "Lease"} — ${t.name}`,
    unit: t.unit,
    unitId: t.unitId,
    tenantId: t.id,
    tenantName: t.name,
    propertyId: t.propertyId,
    rent: unit?.rent ?? 0,
    deposit: unit?.deposit ?? 0,
    termStart: t.leaseStart,
    termEnd: t.leaseEnd,
    status: leaseStatus(t, TENANT_SPECS[i][6]),
  };
});

// Current occupant of a unit (Current/Late tenants only).
const occupantOf = (unitId) =>
  TENANTS.find((t) => t.unitId === unitId && (t.status === "Current" || t.status === "Late"));

export function coreTables() {
  const project = {
    id: SANDBOX_PROJECT_ID,
    name: "Harbor & Pine Residential",
    slug: "harbor-pine",
    organization_id: SANDBOX_ORG_ID,
    project_id: null,
  };

  return {
    projects: [project],
    portfolios: PORTFOLIOS.map((p) => ({
      id: p.id, name: p.name, description: p.description, manager: p.manager,
      region: p.region, color: p.color, status: "Active",
    })),
    properties: PROPERTIES.map((p, i) => ({
      id: p.id, name: p.name, address: p.address, city: p.city, state: p.state, zip: p.zip,
      type: p.type, status: p.status, portfolio_id: p.portfolioId, year_built: p.yearBuilt,
      description: p.description, cover_url: COVERS[i],
      unit_count: UNITS.filter((u) => u.propertyId === p.id).length,
    })),
    buildings: BUILDINGS.map((b) => ({
      id: b.id, name: b.name, block_code: b.blockCode, property_id: b.propertyId, floors: b.floors,
      year_built: b.yearBuilt, structure_type: b.structureType, wing: b.wing, description: "", status: "Active",
    })),
    floor_plans: FLOOR_PLANS.map((f) => ({
      id: f.id, name: f.name, bedrooms: f.bedrooms, bathrooms: f.bathrooms, sqft: f.sqft,
      dimensions: f.dimensions, image_url: "", property_id: f.propertyId, description: f.description, status: "Active",
    })),
    unit_types: UNIT_TYPES.map((t) => ({
      id: t.id, name: t.name, bedrooms: t.bedrooms, bathrooms: t.bathrooms, sqft: t.sqft,
      market_rent: t.marketRent, deposit: t.deposit, floor_plan_id: t.floorPlanId, description: "", status: "Active",
    })),
    amenities: AMENITIES.map((a) => ({
      id: a.id, name: a.name, category: a.category, scope: a.scope, icon: a.icon,
      fee_type: a.feeType, fee_amount: a.feeAmount, description: a.description, status: "Active",
    })),
    amenity_links: [
      [1, 1, "property", MARLOWE.id], [2, 2, "property", MARLOWE.id], [3, 4, "property", MARLOWE.id],
      [4, 5, "property", MARLOWE.id], [5, 6, "property", MARLOWE.id], [6, 7, "property", MARLOWE.id],
      [7, 4, "property", PINECREST.id], [8, 6, "property", PINECREST.id], [9, 3, "property", ALDER.id],
      [10, 3, "property", BIRCHWOOD.id], [11, 2, "property", CASCADE.id], [12, 3, "unit_type", TWO_BED.id],
    ].map(([n, a, ownerType, ownerId]) => ({
      id: sid(GROUPS.link, n), amenity_id: sid(GROUPS.amenity, a), owner_type: ownerType, owner_id: ownerId,
    })),
    floor_plan_links: [
      [101, 1, "property", MARLOWE.id], [102, 2, "property", MARLOWE.id], [103, 3, "property", MARLOWE.id],
      [104, 2, "property", PINECREST.id], [105, 3, "property", PINECREST.id], [106, 4, "property", ALDER.id],
    ].map(([n, f, ownerType, ownerId]) => ({
      id: sid(GROUPS.link, n), floor_plan_id: sid(GROUPS.floorPlan, f), owner_type: ownerType, owner_id: ownerId,
    })),
    units: UNITS.map((u) => {
      const occupant = occupantOf(u.id);
      return {
        id: u.id, label: u.label, property_id: u.propertyId, building_id: u.buildingId,
        unit_type_id: u.unitTypeId, floor_plan_id: u.floorPlanId, floor: u.floor,
        bedrooms: u.bedrooms, bathrooms: u.bathrooms, sqft: u.sqft, rent: u.rent, deposit: u.deposit,
        status: u.status, occupant_name: occupant?.name ?? "", tenant_id: occupant?.id ?? null,
        lease_start: occupant?.leaseStart ?? null, lease_end: occupant?.leaseEnd ?? null,
      };
    }),
    tenants: TENANTS.map((t) => ({
      id: t.id, name: t.name, email: t.email, phone: t.phone, unit: t.unit, property_id: t.propertyId,
      unit_id: t.unitId, lease_id: t.leaseId, household_id: t.householdId, status: t.status, balance: t.balance,
      lease_start: t.leaseStart, lease_end: t.leaseEnd, portal_enabled: t.portalEnabled,
      portal_last_seen: t.portalEnabled ? daysFromNow(-(t.name.length % 9)) : null,
    })),
    leases: LEASES.map((l) => ({
      id: l.id, name: l.name, unit: l.unit, tenant_name: l.tenantName, rent: l.rent, deposit: l.deposit,
      term_start: l.termStart, term_end: l.termEnd, unit_id: l.unitId, tenant_id: l.tenantId,
      property_id: l.propertyId, status: l.status,
    })),
    owners: OWNERS.map((o) => ({
      id: o.id, name: o.name, email: o.email, phone: o.phone, company: o.company,
      management_fee_pct: o.managementFeePct, payout_method: o.payoutMethod, tax_id_last4: o.taxIdLast4,
      status: o.status,
      // Ownership splits, in the Owners screen's metadata.properties shape.
      metadata: {
        properties: o.propertyIds.map((pid, i) => ({
          id: sid(GROUPS.link, 200 + Number(o.id.slice(-2)) * 10 + i),
          propertyId: pid,
          label: PROPERTIES.find((p) => p.id === pid).name,
          pct: 100,
        })),
      },
    })),
    vendors: VENDORS.map((v) => ({
      id: v.id, name: v.name, contact_name: v.contactName, email: v.email, phone: v.phone,
      specialty: v.specialty, rating: v.rating, hourly_rate: v.hourlyRate,
      insurance_expiry: v.insuranceExpiry, status: v.status,
    })),
  };
}
