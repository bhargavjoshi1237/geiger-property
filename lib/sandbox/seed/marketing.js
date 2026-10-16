import { sid, daysFromNow, isoDaysFromNow } from "./ids";
import { PROPERTIES, UNITS, TENANTS, LEASES } from "./core";

// Marketing & leads sample data: listings, prospects, showings, applications,
// waitlist_entries and rent_comps. Rows link to core units/properties by id and
// carry the matching denormalized display columns (unit, property_name…).

const G = { listing: 20, prospect: 21, showing: 22, application: 23, waitlist: 24, comp: 25 };

const unit = (label) => UNITS.find((u) => u.label === label);
const property = (name) => PROPERTIES.find((p) => p.name === name);
const tenant = (name) => TENANTS.find((t) => t.name === name);

const MARLOWE = property("The Marlowe");
const PINECREST = property("Pinecrest Commons");
const ALDER = property("Alder Court Townhomes");
const BIRCHWOOD = property("14 Birchwood Lane");
const CASCADE = property("Cascade Lofts");

const ZOE = tenant("Zoe Nguyen");
const JAMAL = tenant("Jamal Carter");
const ZOE_LEASE = LEASES.find((l) => l.tenantId === ZOE.id);

// Listings: [n, unit label, title, asking rent | null (unit rent), available (days), status, metadata?]
const LISTING_SPECS = [
  [1, "L-201", "Sunlit loft one-bedroom with exposed brick", null, -3, "Active", {
    description: "Corner one-bedroom in a converted 1920s warehouse — 12' ceilings, original timber beams, oversized windows and a chef's kitchen with quartz counters. Steps from Pike Place and the waterfront.",
    syndication: { "Company website": true, Zillow: true, "Apartments.com": true, Craigslist: true },
    promotions: [{ id: "promo-l201-1", label: "Move-in special", value: "First month 50% off" }],
    notes: "Lobby renovation noise limited to 9am–4pm; mention on tours.",
  }],
  [2, "TH-4", "Three-bed townhome with garage and private yard", 3395, 7, "Active", {
    description: "Freshly refinished two-level townhome with an attached garage, fenced yard, in-unit laundry and an ensuite primary. Quiet Tacoma street near Proctor shops.",
    syndication: { "Company website": true, Zillow: true, Trulia: true, "Facebook Marketplace": true },
    promotions: [{ id: "promo-th4-1", label: "Look-and-lease", value: "$500 off if signed within 48h of tour" }],
  }],
  [3, "TH-3", "Corner townhome — available next month", 3250, 16, "Active", {
    description: "End-unit townhome with extra windows, a two-car tandem garage and a south-facing patio. Current resident moving out; pre-leasing now.",
    syndication: { "Company website": true, Zillow: true },
  }],
  [4, "A-202", "Two-bed, two-bath with balcony at The Marlowe", 2595, 31, "Active", {
    description: "Split two-bedroom with an ensuite primary, private balcony and in-unit washer/dryer. Rooftop deck, fitness centre and secured parking on site.",
    syndication: { "Company website": true, "Apartments.com": true, "Rent.com": true },
  }],
  [5, "B-201", "Downtown studio with sleeping alcove", null, 10, "Draft", {
    description: "Efficient studio with a separate sleeping alcove. Photos to follow after make-ready.",
  }],
  [6, "L-401", "Top-floor two-bed loft with skyline views", 2850, 21, "Draft"],
  [7, "S-201", "Renovated two-bed at Pinecrest (post-repair)", 2050, 45, "Draft", {
    notes: "Hold until water-damage repairs are signed off.",
  }],
  [8, "N-201", "Garden-level one-bed near transit", null, 21, "Paused", {
    description: "Bright one-bedroom on the second floor of the North Building, a short walk to the Division St bus line.",
    syndication: { "Company website": true, Zillow: true },
    notes: "Paused while Jamal Carter's application is finalised.",
  }],
  [9, "B-101", "Tower B one-bed with walk-in closet", null, 14, "Leased", {
    syndication: { "Company website": true, Zillow: true, "Apartments.com": true },
    notes: "Leased to Zoe Nguyen — move-in scheduled.",
  }],
];

// Prospects: [n, name, email, phone, source, unit label, budget, move-in (days), status, created (days ago), metadata?]
const PROSPECT_SPECS = [
  [1, "Isabella Moreno", "isabella.moreno@mail.example", "(206) 555-0231", "Zillow", "L-201", 2200, 20, "New", 0, {
    preferredContact: "Text", bedrooms: 1, pets: true, mustHaves: "Cat-friendly, natural light",
    followups: [{ id: "fu-1-1", label: "Confirm Thursday tour time", date: daysFromNow(1), done: false }],
  }],
  [2, "Kevin Tran", "kevin.tran@mail.example", "(253) 555-0248", "Website", "TH-4", 3400, 30, "New", 1],
  [3, "Hana Sato", "hana.sato@mail.example", "(206) 555-0275", "Apartments.com", "A-202", 2600, 35, "Contacted", 3, {
    preferredContact: "Email", bedrooms: 2, pets: false, mustHaves: "In-unit laundry, parking stall",
    followups: [
      { id: "fu-3-1", label: "Send floor plan for The Birch", date: daysFromNow(-2), done: true },
      { id: "fu-3-2", label: "Schedule virtual tour", date: daysFromNow(2), done: false },
    ],
  }],
  [4, "Samuel Osei", "samuel.osei@mail.example", "(206) 555-0293", "Referral", "L-401", 2800, 40, "Contacted", 5],
  [5, "Fatima Yusuf", "fatima.yusuf@mail.example", "(206) 555-0216", "Zillow", "L-201", 2150, 14, "Touring", 7, {
    preferredContact: "Phone", bedrooms: 1, pets: false,
    notes: "Liked the brick and ceilings; worried about lobby construction noise.",
  }],
  [6, "Diego Alvarez", "diego.alvarez@mail.example", "(253) 555-0264", "Referral", "TH-3", 3300, 20, "Touring", 9, {
    preferredContact: "Text", bedrooms: 3, pets: true, mustHaves: "Garage, fenced yard for the dog",
    followups: [{ id: "fu-6-1", label: "Send application link", date: daysFromNow(0), done: false }],
  }],
  [7, "Ben Whitaker", "ben.whitaker@mail.example", "(253) 555-0287", "Social", "TH-4", 3500, 25, "Applied", 12],
  [8, "Jamal Carter", JAMAL.email, JAMAL.phone, "Website", "N-201", 1600, 21, "Applied", 18, {
    preferredContact: "Email", bedrooms: 1, pets: false, mustHaves: "Near the bus line",
  }],
  [9, "Zoe Nguyen", ZOE.email, ZOE.phone, "Apartments.com", "B-101", 1900, 14, "Leased", 30, {
    preferredContact: "Text", bedrooms: 1, pets: false,
    notes: "Signed for B-101 — moving in from out of state.",
  }],
  [10, "Rachel Goldberg", "rachel.goldberg@mail.example", "(206) 555-0252", "Walk-in", "B-201", 1500, 10, "Lost", 21, {
    notes: "Missed tour, didn't respond to two follow-ups. Chose a place closer to work.",
  }],
  [11, "Nathan Brooks-Ellis", "nathan.be@mail.example", "(503) 555-0209", "Apartments.com", "N-201", 1450, 15, "Lost", 34],
];

// Showings: [n, prospect n, unit label, date (days), time, type, agent, status, metadata?]
const SHOWING_SPECS = [
  [1, 1, "L-201", 2, "2:30 PM", "In-person", "Taylor Brooks", "Scheduled"],
  [2, 2, "TH-4", 3, "11:00 AM", "Self-guided", "Sam Ortiz", "Scheduled"],
  [3, 3, "A-202", 5, "6:00 PM", "Virtual", "Taylor Brooks", "Scheduled"],
  [4, 4, "L-401", 6, "10:30 AM", "In-person", "Taylor Brooks", "Scheduled"],
  [5, 6, "TH-3", -2, "1:00 PM", "In-person", "Sam Ortiz", "Completed", {
    interest: "High", followUpNeeded: true, feedback: "Loved the yard and garage; asked about pet rent for a 40 lb dog.",
  }],
  [6, 5, "L-201", -4, "5:30 PM", "In-person", "Taylor Brooks", "Completed", {
    interest: "Medium", followUpNeeded: true, feedback: "Liked the space, concerned about construction noise in the lobby.",
  }],
  [7, 7, "TH-4", -6, "12:00 PM", "Self-guided", "Sam Ortiz", "Completed", {
    interest: "High", followUpNeeded: false, feedback: "Applied the same evening.",
  }],
  [8, 6, "TH-4", -3, "3:00 PM", "In-person", "Sam Ortiz", "Cancelled", {
    notes: "Rescheduled to tour TH-3 instead (earlier availability).",
  }],
  [9, 10, "B-201", -9, "4:00 PM", "In-person", "Taylor Brooks", "No-show"],
  [10, 8, "N-201", -12, "10:00 AM", "In-person", "Riley Chen", "Completed", {
    interest: "High", followUpNeeded: false, feedback: "Wants to move in within three weeks.",
  }],
  [11, 9, "B-101", -24, "7:00 PM", "Virtual", "Taylor Brooks", "Completed", {
    interest: "High", followUpNeeded: false, feedback: "Toured by video from Denver; applied next day.",
  }],
];

// Applications: [n, name, email, phone, unit label, move-in (days), income, fee paid, prospect n | null, status, submitted (days ago), metadata]
const APPLICATION_SPECS = [
  [1, "Ben Whitaker", "ben.whitaker@mail.example", "(253) 555-0287", "TH-4", 25, 11200, false, 7, "Submitted", 1, {
    employer: "Puget Sound Health", position: "Physical therapist", employmentLength: "4 years",
    coApplicants: [{ id: "co-1-1", label: "Laura Whitaker", relationship: "Co-applicant" }, { id: "co-1-2", label: "Eli Whitaker", relationship: "Child" }],
  }],
  [2, "Olivia Hart", "olivia.hart@mail.example", "(253) 555-0230", "TH-3", 20, 10400, true, null, "Submitted", 2, {
    employer: "Tacoma Unified Schools", position: "Teacher", employmentLength: "7 years",
    feePaidDate: daysFromNow(-2), feeMethod: "Card",
  }],
  [3, "Andre Mitchell", "andre.mitchell@mail.example", "(206) 555-0281", "L-201", 14, 6900, true, null, "Screening", 3, {
    employer: "Northlake Design Studio", position: "UX designer", employmentLength: "2 years",
    creditScore: 712, backgroundCheck: "Pending", evictionHistory: "None", incomeVerified: false,
    feePaidDate: daysFromNow(-3), feeMethod: "Card",
  }],
  [4, "Victor Lindqvist", "victor.lindqvist@mail.example", "(206) 555-0219", "A-202", 32, 8200, true, null, "Screening", 5, {
    employer: "Harborline Logistics", position: "Operations manager", employmentLength: "5 years",
    creditScore: 748, backgroundCheck: "Clear", evictionHistory: "None", incomeVerified: true,
    feePaidDate: daysFromNow(-5), feeMethod: "ACH",
  }],
  [5, "Jamal Carter", JAMAL.email, JAMAL.phone, "N-201", 21, 4300, true, 8, "Conditionally approved", 9, {
    employer: "Rose City Transit", position: "Mechanic", employmentLength: "1 year",
    creditScore: 655, backgroundCheck: "Clear", evictionHistory: "None", incomeVerified: true,
    feePaidDate: daysFromNow(-9), feeMethod: "Card",
    decisionReason: "Approved on condition of an additional half-month deposit (income 2.8× rent).",
    currentAddress: "2210 NE Alberta St, Portland, OR",
  }],
  [6, "Zoe Nguyen", ZOE.email, ZOE.phone, "B-101", 14, 6400, true, 9, "Approved", 20, {
    employer: "Cedar & Sound Architects", position: "Project architect", employmentLength: "3 years",
    creditScore: 781, backgroundCheck: "Clear", evictionHistory: "None", incomeVerified: true,
    feePaidDate: daysFromNow(-20), feeMethod: "Card",
    decisionReason: "Meets all criteria — income 3.5× rent, strong rental history.",
    currentAddress: "1580 Pearl St, Denver, CO",
    convertedTenantId: ZOE.id, convertedLeaseId: ZOE_LEASE.id, convertedAt: isoDaysFromNow(-17),
  }],
  [7, "Nadia Rahman", "nadia.rahman@mail.example", "(206) 555-0244", "L-401", 30, 7600, true, null, "Withdrawn", 11, {
    employer: "Emerald Bay Credit Union", position: "Analyst", employmentLength: "3 years",
    creditScore: 735, backgroundCheck: "Clear", evictionHistory: "None",
    notes: "Withdrew — accepted a job offer in Spokane.",
  }],
  [8, "Tyler Brennan", "tyler.brennan@mail.example", "(206) 555-0268", "B-201", 7, 3100, true, null, "Denied", 14, {
    creditScore: 542, backgroundCheck: "Flagged", evictionHistory: "Found", incomeVerified: true,
    decisionReason: "Prior eviction (2023) and income below 2.5× rent. Adverse-action notice sent.",
  }],
];

// Waitlist: [n, name, email, phone, property, preference, move-in (days), position, status, joined (days ago)]
const WAITLIST_SPECS = [
  [1, "Elena Petrova", "elena.petrova@mail.example", "(206) 555-0213", MARLOWE, "2BR, high floor", 30, 1, "Offered", 62],
  [2, "Jonah Feldman", "jonah.feldman@mail.example", "(253) 555-0236", ALDER, "3BR townhome with garage", 45, 2, "Waiting", 55],
  [3, "Priyanka Desai", "priyanka.desai@mail.example", "(206) 555-0257", MARLOWE, "Studio or 1BR", 60, 3, "Waiting", 41],
  [4, "Owen Gallagher", "owen.gallagher@mail.example", "(503) 555-0272", PINECREST, "2BR ground floor, pet-friendly", 50, 4, "Waiting", 33],
  [5, "Lena Fischer", "lena.fischer@mail.example", "(206) 555-0289", CASCADE, "1BR loft", 14, 5, "Offered", 27],
  [6, "Carlos Mendes", "carlos.mendes@mail.example", "(425) 555-0201", BIRCHWOOD, "Any 3BR+ house", 90, 6, "Waiting", 19],
  [7, "Zoe Nguyen", ZOE.email, ZOE.phone, MARLOWE, "1BR", 14, 0, "Converted", 48],
  [8, "Aaron Feld", "aaron.feld@mail.example", "(503) 555-0225", PINECREST, "1BR", 20, 0, "Removed", 70],
];

// Rent comps: [n, name, property, distance mi, beds, baths, sqft, rent, source, observed (days), status, metadata?]
const COMP_SPECS = [
  [1, "Linden & Fifth · 1BR", MARLOWE, 0.4, 1, 1, 710, 1925, "Zillow", -6, "Active", {
    address: "1510 5th Ave, Seattle, WA",
    amenities: [{ id: "am-1-1", label: "Fitness centre" }, { id: "am-1-2", label: "In-unit laundry" }],
  }],
  [2, "Bayline Flats · 2BR", MARLOWE, 0.7, 2, 2, 1010, 2695, "Site visit", -12, "Active", {
    address: "2201 Western Ave, Seattle, WA",
    amenities: [{ id: "am-2-1", label: "Rooftop deck" }, { id: "am-2-2", label: "Covered parking" }, { id: "am-2-3", label: "Concierge" }],
    notes: "Newer build; two weeks free on 13-month leases.",
  }],
  [3, "Third Avenue Studios · Studio", MARLOWE, 0.5, 0, 1, 450, 1450, "Apartments.com", -9, "Active"],
  [4, "Division Gardens · 2BR", PINECREST, 0.3, 2, 1, 920, 1925, "Zillow", -15, "Active", {
    address: "4620 SE Division St, Portland, OR",
    amenities: [{ id: "am-4-1", label: "Shared laundry" }, { id: "am-4-2", label: "Off-street parking" }],
  }],
  [5, "Hawthorne Row · 1BR", PINECREST, 0.9, 1, 1, 680, 1595, "Apartments.com", -20, "Active"],
  [6, "Ruston Ridge Townhomes · 3BR", ALDER, 1.2, 3, 2.5, 1520, 3195, "Zillow", -8, "Active", {
    address: "512 N Ruston Way, Tacoma, WA",
    amenities: [{ id: "am-6-1", label: "Attached garage" }, { id: "am-6-2", label: "Private yard" }],
  }],
  [7, "Proctor Commons · 3BR", ALDER, 0.8, 3, 2, 1400, 3350, "Site visit", -25, "Active", {
    notes: "Includes water/sewer/garbage — adjust ~$90 when comparing.",
  }],
  [8, "Lake Hills residence · 4BR", BIRCHWOOD, 1.5, 4, 2.5, 2200, 4100, "Rent survey", -30, "Active"],
  [9, "Pioneer Mill Lofts · 1BR", CASCADE, 0.6, 1, 1, 760, 2195, "Site visit", -4, "Active", {
    address: "118 Occidental Ave S, Seattle, WA",
    amenities: [{ id: "am-9-1", label: "Exposed brick" }, { id: "am-9-2", label: "Bike storage" }],
  }],
  [10, "Foundry Lofts · 2BR", CASCADE, 0.9, 2, 1, 980, 2650, "Zillow", -200, "Archived", {
    notes: "Stale — building converted to condos.",
  }],
];

const PROSPECT_UNIT = new Map(PROSPECT_SPECS.map(([n, name, , , , label]) => [n, { name, unit: unit(label) }]));

export function marketingTables() {
  return {
    listings: LISTING_SPECS.map(([n, label, name, asking, available, status, metadata]) => {
      const u = unit(label);
      return {
        id: sid(G.listing, n), name, property_id: u.propertyId, property_name: u.propertyName,
        unit_id: u.id, unit: u.display, rent: asking ?? u.rent, available_date: daysFromNow(available),
        bedrooms: u.bedrooms, bathrooms: u.bathrooms, status, metadata: metadata ?? {},
      };
    }),
    prospects: PROSPECT_SPECS.map(([n, name, email, phone, source, label, budget, moveIn, status, ago, metadata]) => {
      const u = unit(label);
      return {
        id: sid(G.prospect, n), name, email, phone, source, unit_id: u.id, unit: u.display,
        move_in_date: daysFromNow(moveIn), budget, status, metadata: metadata ?? {},
        created_at: isoDaysFromNow(-ago, 9), updated_at: isoDaysFromNow(-ago, 9),
      };
    }),
    showings: SHOWING_SPECS.map(([n, prospectN, label, date, time, type, agent, status, metadata]) => {
      const u = unit(label);
      const prospect = PROSPECT_UNIT.get(prospectN);
      return {
        id: sid(G.showing, n), name: `${prospect.name} · ${u.propertyName} ${u.label}`, prospect_id: sid(G.prospect, prospectN),
        prospect_name: prospect.name, unit_id: u.id, unit: u.display, showing_date: daysFromNow(date),
        showing_time: time, showing_type: type, agent, status, metadata: metadata ?? {},
      };
    }),
    applications: APPLICATION_SPECS.map(([n, name, email, phone, label, moveIn, income, paid, prospectN, status, ago, metadata]) => {
      const u = unit(label);
      return {
        id: sid(G.application, n), name, email, phone, unit_id: u.id, unit: u.display,
        move_in_date: daysFromNow(moveIn), monthly_income: income, application_fee: 50, fee_paid: paid,
        prospect_id: prospectN ? sid(G.prospect, prospectN) : null, status, metadata,
        created_at: isoDaysFromNow(-ago, 14), updated_at: isoDaysFromNow(-ago, 14),
      };
    }),
    waitlist_entries: WAITLIST_SPECS.map(([n, name, email, phone, prop, preference, moveIn, position, status, ago]) => ({
      id: sid(G.waitlist, n), name, email, phone, property_id: prop.id, property_name: prop.name,
      unit_preference: preference, move_in_date: daysFromNow(moveIn), position, status,
      created_at: isoDaysFromNow(-ago, 11), updated_at: isoDaysFromNow(-ago, 11),
    })),
    rent_comps: COMP_SPECS.map(([n, name, prop, distance, beds, baths, sqft, rent, source, observed, status, metadata]) => ({
      id: sid(G.comp, n), name, property_id: prop.id, property_name: prop.name, distance_mi: distance,
      bedrooms: beds, bathrooms: baths, sqft, rent, source, observed_date: daysFromNow(observed),
      status, metadata: metadata ?? {},
    })),
  };
}
