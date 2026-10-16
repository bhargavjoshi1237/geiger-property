import { SANDBOX_PROJECT_ID, sid, daysFromNow, isoDaysFromNow } from "./ids";
import { PROPERTIES, BUILDINGS, UNITS, TENANTS, PORTFOLIOS } from "./core";
import { DEFAULT_ROLES } from "@/components/internal/screens/settings/permissions";

// Workspace-wide sample data for the playground: announcements, message_templates,
// tenant_communications (Inbox), documents, tenant_documents, tenant_households,
// tenant_occupants, automations, team_members, settings, activity and media.
// Rows are snake_case DB shape and link to the core portfolio by id.

// Id groups owned by this module (60–79).
const G = {
  announcement: 60,
  template: 61,
  communication: 62,
  document: 63,
  tenantDocument: 64,
  household: 65,
  occupant: 66,
  automation: 67,
  member: 68,
  setting: 69,
  activity: 70,
  media: 71,
};

const [MARLOWE, PINECREST, ALDER, BIRCHWOOD, CASCADE] = PROPERTIES;
const [TOWER_A, TOWER_B] = BUILDINGS;
const [DOWNTOWN] = PORTFOLIOS;
const unit = (n) => UNITS[n - 1];
const tenant = (n) => TENANTS[n - 1];

// Landing-page images that are safe to render in galleries and thumbnails.
const IMG = [
  "https://200rfrtp5x71tlmk.public.blob.vercel-storage.com/geiger-dash/cursor-assets/asset-00a586c62c8782e65c0a.jpg",
  "https://200rfrtp5x71tlmk.public.blob.vercel-storage.com/geiger-dash/cursor-assets/asset-0ec1f3ba625f482c9dc3.jpg",
  "https://200rfrtp5x71tlmk.public.blob.vercel-storage.com/geiger-dash/cursor-assets/asset-85923e7fafe00c9c0d1f.jpg",
  "https://200rfrtp5x71tlmk.public.blob.vercel-storage.com/geiger-dash/cursor-assets/asset-8e2e88cff7f33224ddd7.jpg",
];

// --- team ------------------------------------------------------------------

// Members: [n, name, role, status, title, phone, added (days ago)]
const MEMBER_SPECS = [
  [1, "Morgan Ellis", "Owner", "Active", "Principal broker", "(206) 555-0101", -720],
  [2, "Alex Rivera", "Manager", "Active", "Property manager — Downtown Core", "(206) 555-0102", -540],
  [3, "Jordan Lee", "Manager", "Active", "Property manager — Suburban Homes", "(503) 555-0103", -510],
  [4, "Dana Kowal", "Regional manager", "Active", "Regional manager — Pacific Northwest", "(206) 555-0109", -300],
  [5, "Carmen Diaz", "Accountant", "Active", "Senior accountant", "(206) 555-0104", -420],
  [6, "Tasha Greene", "Leasing agent", "Active", "Leasing consultant", "(206) 555-0105", -260],
  [7, "Ben Alvarez", "Maintenance tech", "Active", "Lead maintenance technician", "(253) 555-0106", -390],
  [8, "Riley Thompson", "Leasing agent", "Invited", "Leasing consultant — Portland", "(503) 555-0107", -3],
  [9, "Sam Whitaker", "Maintenance tech", "Disabled", "Seasonal maintenance tech", "(425) 555-0108", -610],
];

const MEMBERS = MEMBER_SPECS.map(([n, name, role, status, title, phone, added]) => ({
  id: sid(G.member, n),
  name,
  role,
  status,
  title,
  phone,
  added,
  email: `${name.toLowerCase().replace(/\s+/g, ".")}@harborpine.example`,
}));

const member = (name) => MEMBERS.find((m) => m.name === name);

// Regional managers get the manager set minus settings, team and role control.
const MANAGER = DEFAULT_ROLES.find((r) => r.id === "manager");
const SETTINGS_ONLY =
  /^view\.(settings|company_profile|team_members|roles_permissions|custom_fields|fees_policies|branding_portals|integrations)$|^(team|roles|settings)\./;
const ROLES = [
  ...DEFAULT_ROLES,
  {
    id: "regional_manager",
    name: "Regional manager",
    permissions: (MANAGER?.permissions || []).filter((k) => !SETTINGS_ONLY.test(k)),
  },
];

// --- message templates -----------------------------------------------------

// Templates: [n, name, category, channel, status, subject, body]
const TEMPLATE_SPECS = [
  [1, "Rent reminder — 3 days before", "Payments", "Email", "Active",
    "Rent for {{unit}} is due {{due_date}}",
    "Hi {{tenant_name}},\n\nA friendly reminder that your rent of {{rent}} for {{unit}} is due on {{due_date}}. You can pay online through the resident portal by ACH or card.\n\nThank you,\nHarbor & Pine Residential"],
  [2, "Rent overdue notice", "Payments", "Email", "Active",
    "Your rent for {{unit}} is past due",
    "Hi {{tenant_name}},\n\nOur records show your rent of {{rent}} for {{unit}}, due {{due_date}}, hasn't been received. A late fee applies after the 5-day grace period. If you've already paid, please disregard this message, or reply to set up a payment plan.\n\nHarbor & Pine Residential"],
  [3, "Rent reminder — SMS", "Payments", "SMS", "Active",
    "",
    "Harbor & Pine: Hi {{tenant_name}}, rent of {{rent}} for {{unit}} is due {{due_date}}. Pay in the resident portal. Reply STOP to opt out."],
  [4, "Lease renewal offer", "Leasing", "Email", "Active",
    "Your renewal offer for {{unit}}",
    "Hi {{tenant_name}},\n\nYour lease at {{property}} is coming up for renewal and we'd love for you to stay. We're offering a new 12-month term at {{rent}} per month. Please let us know by {{due_date}} so we can prepare your renewal paperwork.\n\nWarm regards,\nThe {{property}} leasing team"],
  [5, "Welcome to your new home", "Leasing", "Email", "Active",
    "Welcome to {{property}}!",
    "Hi {{tenant_name}},\n\nWelcome home! Your keys for {{unit}} will be ready at the leasing office on move-in day. Your first month's rent of {{rent}} is due {{due_date}}. Set up your resident portal to pay rent and submit maintenance requests.\n\nSee you soon,\nHarbor & Pine Residential"],
  [6, "Showing confirmation", "Leasing", "SMS", "Draft",
    "",
    "Harbor & Pine: You're confirmed to tour {{unit}} at {{property}}. Reply C to confirm or R to reschedule."],
  [7, "Work order received", "Maintenance", "Portal", "Active",
    "We received your maintenance request",
    "Hi {{tenant_name}},\n\nThanks for letting us know. We've logged your request for {{unit}} and a technician will reach out within one business day to schedule a visit. For emergencies (flooding, no heat, gas smell) call our 24/7 line."],
  [8, "Work order completed", "Maintenance", "Email", "Active",
    "Your maintenance request for {{unit}} is complete",
    "Hi {{tenant_name}},\n\nOur team has completed the work in {{unit}}. If anything still isn't right, reply to this email or reopen the request in the resident portal. We'd appreciate a quick rating of the visit.\n\nHarbor & Pine Maintenance"],
  [9, "Water shut-off notice", "General", "Email", "Archived",
    "Scheduled water shut-off at {{property}}",
    "Hi {{tenant_name}},\n\nWater service at {{property}} will be shut off for scheduled plumbing work. Please store water for drinking and cooking ahead of time. We'll post an update when service is restored."],
  [10, "Holiday office hours", "General", "Portal", "Draft",
    "Holiday office hours",
    "The leasing office at {{property}} will have reduced hours over the holidays. Rent is still due {{due_date}} — the resident portal stays open around the clock."],
];

// --- automations -----------------------------------------------------------

const cond = (n, label) => ({ id: `cond-${n}`, label });

// --- settings --------------------------------------------------------------

const SETTINGS = {
  company_profile: {
    legalName: "Harbor & Pine Residential LLC",
    dba: "Harbor & Pine",
    email: "hello@harborpine.example",
    phone: "(206) 555-0100",
    address: "1200 Harbor Ave, Suite 300",
    city: "Seattle",
    state: "WA",
    zip: "98101",
    licenseNumber: "PM-58214",
    timezone: "America/Los_Angeles",
    currency: "USD",
  },
  fees_policies: {
    rentDueDay: "1",
    graceDays: "5",
    lateFeeType: "flat",
    lateFeeAmount: "75",
    maxLateFee: "200",
    applicationFee: "50",
    nsfFee: "35",
    paymentMethods: { ach: true, card: true, check: true, cash: false },
  },
  branding_portals: {
    displayName: "Harbor & Pine Residential",
    logoUrl: "",
    accent: "emerald",
    residentPortal: true,
    ownerPortal: true,
    vendorPortal: false,
  },
  integrations: {
    webhooks: [
      { id: "wh-1", url: "https://hooks.harborpine.example/property/payments", events: ["payment.received", "lease.signed"], enabled: true },
      { id: "wh-2", url: "https://ops.harborpine.example/webhooks/maintenance", events: ["work_order.created", "work_order.completed"], enabled: true },
      { id: "wh-3", url: "https://crm.harborpine.example/inbound/leads", events: ["application.submitted", "tenant.created"], enabled: false },
    ],
  },
  custom_fields: {
    properties: [
      { id: "parcel_number", label: "Parcel number", type: "text" },
      { id: "last_roof_inspection", label: "Last roof inspection", type: "date" },
      { id: "trash_pickup_day", label: "Trash pickup day", type: "text" },
    ],
    units: [
      { id: "parking_stall", label: "Parking stall", type: "text" },
      { id: "storage_locker", label: "Storage locker", type: "text" },
      { id: "keys_issued", label: "Keys issued", type: "number" },
    ],
    tenants: [
      { id: "preferred_contact", label: "Preferred contact method", type: "text" },
      { id: "renters_insurance_expiry", label: "Renter's insurance expiry", type: "date" },
    ],
    leases: [
      { id: "concession", label: "Move-in concession ($)", type: "number" },
      { id: "guarantor", label: "Guarantor", type: "text" },
    ],
  },
  roles: ROLES,
};

// --- tables ----------------------------------------------------------------

export function workspaceTables() {
  const templates = TEMPLATE_SPECS.map(([n, name, category, channel, status, subject, body]) => ({
    id: sid(G.template, n),
    name,
    category,
    channel,
    status,
    subject,
    body,
    metadata: n === 2
      ? { activityNotes: "Reviewed with counsel — late fee wording matches the WA lease addendum." }
      : {},
  }));
  const template = (n) => templates[n - 1].id;

  return {
    announcements: [
      { id: sid(G.announcement, 1), name: "Water shut-off — Tower A, Thursday 9am–1pm", audience: "Property tenants", property_id: MARLOWE.id, property_name: MARLOWE.name, channel: "Email", scheduled_for: daysFromNow(3), status: "Scheduled", body: "Rainier Plumbing will replace the main riser valve in Tower A on Thursday. Water will be off from 9am to 1pm. Please store water ahead of time and keep taps closed during the work.", metadata: { activityNotes: "Confirmed the window with Rainier Plumbing dispatch." } },
      { id: sid(G.announcement, 2), name: "Winter weather preparedness", audience: "All tenants", property_id: null, property_name: "", channel: "Email", scheduled_for: daysFromNow(10), status: "Scheduled", body: "Cold weather is on the way. Keep thermostats at 55°F or higher, open sink cabinets on freezing nights, and report any loss of heat through the resident portal right away." },
      { id: sid(G.announcement, 3), name: "Parking lot resurfacing — Pinecrest Commons", audience: "Property tenants", property_id: PINECREST.id, property_name: PINECREST.name, channel: "SMS", scheduled_for: daysFromNow(18), status: "Draft", body: "The Pinecrest lot will be resurfaced over two days. Vehicles must be moved to street parking by 7am on the first day. Towing will be enforced." },
      { id: sid(G.announcement, 4), name: "Holiday office hours", audience: "All tenants", property_id: null, property_name: "", channel: "Portal", scheduled_for: null, status: "Draft", body: "Our leasing offices will close early on Dec 24 and stay closed Dec 25 and Jan 1. Emergency maintenance remains available 24/7." },
      { id: sid(G.announcement, 5), name: "Updated vendor insurance requirements", audience: "Vendors", property_id: null, property_name: "", channel: "Email", scheduled_for: null, status: "Draft", body: "Starting next quarter, all vendors must carry $2M general liability coverage and name Harbor & Pine Residential as additional insured. Please send an updated certificate before your next job." },
      { id: sid(G.announcement, 6), name: "Rooftop deck reopening", audience: "Property tenants", property_id: MARLOWE.id, property_name: MARLOWE.name, channel: "Portal", scheduled_for: daysFromNow(-6), status: "Sent", body: "The rooftop deck at The Marlowe has reopened with new furniture and grills. Reservations for private events can be made through the resident portal.", metadata: { sentAt: isoDaysFromNow(-6, 9) } },
      { id: sid(G.announcement, 7), name: "Q3 owner statements available", audience: "Owners", property_id: null, property_name: "", channel: "Email", scheduled_for: daysFromNow(-9), status: "Sent", body: "Your Q3 owner statements and distribution summaries are ready in the owner portal. Reach out to your property manager with any questions.", metadata: { sentAt: isoDaysFromNow(-9, 8) } },
      { id: sid(G.announcement, 8), name: "Lobby renovation — phase 2 update", audience: "Property tenants", property_id: CASCADE.id, property_name: CASCADE.name, channel: "Email", scheduled_for: daysFromNow(-12), status: "Sent", body: "Phase 2 of the Cascade Lofts lobby renovation begins next week. The main entrance will be closed; please use the Pine St side door. Mail and packages move to the temporary lockers by the elevator.", metadata: { sentAt: isoDaysFromNow(-12, 11) } },
      { id: sid(G.announcement, 9), name: "Pay rent online through the resident portal", audience: "All tenants", property_id: null, property_name: "", channel: "Portal", scheduled_for: daysFromNow(-25), status: "Sent", body: "You can now pay rent by ACH or card in the resident portal and set up autopay so you never miss a due date.", metadata: { sentAt: isoDaysFromNow(-25, 10) } },
    ],

    message_templates: templates,

    tenant_communications: [
      { id: sid(G.communication, 1), tenant_id: tenant(8).id, channel: "call", direction: "outbound", subject: "Late rent follow-up — payment plan", body: `Spoke with ${tenant(8).name} about the $2,150 balance. Agreed to pay $1,000 this Friday and the remainder with next month's rent.`, occurred_at: isoDaysFromNow(0, 9), metadata: { followups: [{ id: "fu-1", label: "Confirm $1,000 payment posted Friday", done: false }, { id: "fu-2", label: "Send payment plan agreement for signature", done: true }] } },
      { id: sid(G.communication, 2), tenant_id: tenant(3).id, channel: "portal", direction: "inbound", subject: "Bathroom fan is very loud", body: "Hi, the bathroom exhaust fan has started rattling loudly whenever it runs. Could someone take a look this week?", occurred_at: isoDaysFromNow(-1, 15) },
      { id: sid(G.communication, 3), tenant_id: tenant(6).id, channel: "email", direction: "outbound", subject: "Your rent for B-102 is past due", body: `Hi ${tenant(6).name}, our records show a balance of $1,450 on your account. A $75 late fee has been applied. Please reach out if you'd like to set up a payment plan.`, occurred_at: isoDaysFromNow(-2, 10), metadata: { followups: [{ id: "fu-3", label: "Call if no response by Monday", done: false }] } },
      { id: sid(G.communication, 4), tenant_id: tenant(13).id, channel: "email", direction: "inbound", subject: "Notice to vacate — TH-3", body: "Please accept this as my 30-day notice. I'll be moving out at the end of my lease. Can we schedule the move-out inspection?", occurred_at: isoDaysFromNow(-3, 16), metadata: { followups: [{ id: "fu-4", label: "Schedule move-out inspection", done: false }, { id: "fu-5", label: "List TH-3 for pre-leasing", done: false }] } },
      { id: sid(G.communication, 5), tenant_id: tenant(16).id, channel: "sms", direction: "outbound", subject: "Move-in day details", body: "Hi Zoe! Your keys for B-101 will be ready at the leasing office at 10am on move-in day. Text us if anything changes.", occurred_at: isoDaysFromNow(-4, 13) },
      { id: sid(G.communication, 6), tenant_id: tenant(4).id, channel: "email", direction: "outbound", subject: "Renewal offer for A-202", body: "Hi Lucas, your lease ends next month. We'd like to offer a 12-month renewal at $2,625. Let us know by the end of the week.", occurred_at: isoDaysFromNow(-5, 11) },
      { id: sid(G.communication, 7), tenant_id: null, channel: "call", direction: "inbound", subject: "Prospect asking about pet policy", body: "Caller asked whether Pinecrest accepts large dogs. Explained the 2-pet limit and pet fee; sent the listing link.", occurred_at: isoDaysFromNow(-6, 14) },
      { id: sid(G.communication, 8), tenant_id: tenant(15).id, channel: "portal", direction: "inbound", subject: "Question about my balance", body: "I see a $650 balance but I paid on the 3rd. Can you check whether my payment went through?", occurred_at: isoDaysFromNow(-7, 19), metadata: { followups: [{ id: "fu-6", label: "Check ACH return with the bank", done: true }] } },
      { id: sid(G.communication, 9), tenant_id: tenant(11).id, channel: "note", direction: "outbound", subject: "Garage door opener replaced", body: "Ben replaced the TH-1 garage remote. Tenant confirmed it works.", occurred_at: isoDaysFromNow(-9, 12) },
      { id: sid(G.communication, 10), tenant_id: tenant(1).id, channel: "email", direction: "inbound", subject: "Package locker code not working", body: "My locker code from the notification text isn't opening the locker. Could you reset it?", occurred_at: isoDaysFromNow(-11, 18) },
      { id: sid(G.communication, 11), tenant_id: tenant(14).id, channel: "call", direction: "outbound", subject: "Annual HVAC service scheduled", body: "Scheduled Evergreen HVAC for the Birchwood furnace service. Tenant will be home to let them in.", occurred_at: isoDaysFromNow(-14, 10) },
      { id: sid(G.communication, 12), tenant_id: null, channel: "email", direction: "inbound", subject: "Neighbour noise complaint — Tower B", body: "Anonymous resident reported late-night noise on the first floor of Tower B over the weekend.", occurred_at: isoDaysFromNow(-16, 8) },
    ],

    documents: [
      { id: sid(G.document, 1), owner_type: "property", owner_id: MARLOWE.id, kind: "inspection", name: "Annual fire & life safety inspection 2026.pdf", url: "", size_bytes: 1843200, created_at: isoDaysFromNow(-2, 10) },
      { id: sid(G.document, 2), owner_type: "unit", owner_id: unit(4).id, kind: "notice", name: "Notice to vacate — A-202.pdf", url: "", size_bytes: 214000, created_at: isoDaysFromNow(-4, 14) },
      { id: sid(G.document, 3), owner_type: "property", owner_id: CASCADE.id, kind: "invoice", name: "Lobby renovation — phase 1 contractor invoice.pdf", url: "", size_bytes: 412000, created_at: isoDaysFromNow(-8, 9) },
      { id: sid(G.document, 4), owner_type: "library", owner_id: SANDBOX_PROJECT_ID, kind: "insurance", name: "2026 general liability certificate.pdf", url: "", size_bytes: 356000, created_at: isoDaysFromNow(-11, 11) },
      { id: sid(G.document, 5), owner_type: "building", owner_id: TOWER_A.id, kind: "inspection", name: "Elevator inspection certificate — Tower A.pdf", url: "", size_bytes: 288000, created_at: isoDaysFromNow(-15, 13) },
      { id: sid(G.document, 6), owner_type: "property", owner_id: PINECREST.id, kind: "inspection", name: "Roof condition report — North & South buildings.pdf", url: "", size_bytes: 5242880, created_at: isoDaysFromNow(-21, 10) },
      { id: sid(G.document, 7), owner_type: "unit", owner_id: unit(18).id, kind: "inspection", name: "Move-out inspection — TH-4.pdf", url: "", size_bytes: 2621440, created_at: isoDaysFromNow(-27, 15) },
      { id: sid(G.document, 8), owner_type: "library", owner_id: SANDBOX_PROJECT_ID, kind: "other", name: "Resident handbook 2026.pdf", url: "", size_bytes: 1468000, created_at: isoDaysFromNow(-34, 9) },
      { id: sid(G.document, 9), owner_type: "property", owner_id: CASCADE.id, kind: "other", name: "Façade restoration permit.pdf", url: "", size_bytes: 731000, created_at: isoDaysFromNow(-46, 10) },
      { id: sid(G.document, 10), owner_type: "portfolio", owner_id: DOWNTOWN.id, kind: "lease", name: "Management agreement — Northwind Holdings.pdf", url: "", size_bytes: 968000, created_at: isoDaysFromNow(-62, 12) },
      { id: sid(G.document, 11), owner_type: "property", owner_id: MARLOWE.id, kind: "insurance", name: "Property insurance policy — The Marlowe.pdf", url: "", size_bytes: 1205000, created_at: isoDaysFromNow(-88, 10) },
      { id: sid(G.document, 12), owner_type: "library", owner_id: SANDBOX_PROJECT_ID, kind: "other", name: "Fair housing & reasonable accommodation policy.pdf", url: "", size_bytes: 402000, created_at: isoDaysFromNow(-120, 9) },
    ],

    tenant_documents: [
      { id: sid(G.tenantDocument, 1), tenant_id: tenant(16).id, kind: "lease", name: "Lease packet — B-101 (Zoe Nguyen).pdf", url: "", size_bytes: 842000, created_at: isoDaysFromNow(-1, 16) },
      { id: sid(G.tenantDocument, 2), tenant_id: tenant(8).id, kind: "notice", name: "14-day pay or vacate notice — N-102.pdf", url: "", size_bytes: 188000, created_at: isoDaysFromNow(-3, 10) },
      { id: sid(G.tenantDocument, 3), tenant_id: tenant(13).id, kind: "notice", name: "Notice to vacate — TH-3.pdf", url: "", size_bytes: 152000, created_at: isoDaysFromNow(-3, 17) },
      { id: sid(G.tenantDocument, 4), tenant_id: tenant(17).id, kind: "identification", name: "Photo ID — Jamal Carter.jpg", url: "", size_bytes: 498000, created_at: isoDaysFromNow(-5, 12) },
      { id: sid(G.tenantDocument, 5), tenant_id: tenant(6).id, kind: "notice", name: "Late rent notice — B-102.pdf", url: "", size_bytes: 176000, created_at: isoDaysFromNow(-6, 9) },
      { id: sid(G.tenantDocument, 6), tenant_id: tenant(1).id, kind: "insurance", name: "Renter's insurance declaration — Maya Chen.pdf", url: "", size_bytes: 264000, created_at: isoDaysFromNow(-19, 14) },
      { id: sid(G.tenantDocument, 7), tenant_id: tenant(10).id, kind: "lease", name: "Signed lease — S-102 (Ethan Walker).pdf", url: "", size_bytes: 905000, created_at: isoDaysFromNow(-40, 11) },
      { id: sid(G.tenantDocument, 8), tenant_id: tenant(5).id, kind: "lease", name: "Signed lease — A-301 (Hannah Brooks).pdf", url: "", size_bytes: 877000, created_at: isoDaysFromNow(-95, 15) },
      { id: sid(G.tenantDocument, 9), tenant_id: tenant(14).id, kind: "other", name: "Pet addendum — Ravi Patel.pdf", url: "", size_bytes: 133000, created_at: isoDaysFromNow(-130, 10) },
      { id: sid(G.tenantDocument, 10), tenant_id: tenant(11).id, kind: "lease", name: "Signed lease — TH-1 (Aisha Bello).pdf", url: "", size_bytes: 918000, created_at: isoDaysFromNow(-210, 13) },
    ],

    tenant_households: [
      { id: sid(G.household, 1), name: "Okafor household", primary_tenant_id: tenant(2).id, property_id: tenant(2).propertyId, occupant_count: 3, metadata: { notes: "Daniel, his partner and their toddler." } },
      { id: sid(G.household, 2), name: "Kim household", primary_tenant_id: tenant(7).id, property_id: tenant(7).propertyId, occupant_count: 2 },
      { id: sid(G.household, 3), name: "Johnson household", primary_tenant_id: tenant(8).id, property_id: tenant(8).propertyId, occupant_count: 2 },
      { id: sid(G.household, 4), name: "Bello family", primary_tenant_id: tenant(11).id, property_id: tenant(11).propertyId, occupant_count: 4 },
      { id: sid(G.household, 5), name: "Schmidt household", primary_tenant_id: tenant(12).id, property_id: tenant(12).propertyId, occupant_count: 3 },
      { id: sid(G.household, 6), name: "Patel family", primary_tenant_id: tenant(14).id, property_id: tenant(14).propertyId, occupant_count: 4 },
    ],

    // Co-residents beyond the primary tenant (who lives in the tenants table).
    tenant_occupants: [
      { id: sid(G.occupant, 1), household_id: sid(G.household, 1), name: "Amara Okafor", relationship: "Spouse", age: 33 },
      { id: sid(G.occupant, 2), household_id: sid(G.household, 1), name: "Tobi Okafor", relationship: "Child", age: 2 },
      { id: sid(G.occupant, 3), household_id: sid(G.household, 2), name: "Min-jun Park", relationship: "Partner", age: 31 },
      { id: sid(G.occupant, 4), household_id: sid(G.household, 3), name: "Tanya Johnson", relationship: "Sibling", age: 26 },
      { id: sid(G.occupant, 5), household_id: sid(G.household, 4), name: "Kemi Bello", relationship: "Spouse", age: 41 },
      { id: sid(G.occupant, 6), household_id: sid(G.household, 4), name: "Ife Bello", relationship: "Child", age: 12 },
      { id: sid(G.occupant, 7), household_id: sid(G.household, 4), name: "Dayo Bello", relationship: "Child", age: 8 },
      { id: sid(G.occupant, 8), household_id: sid(G.household, 5), name: "Lena Schmidt", relationship: "Spouse", age: 36 },
      { id: sid(G.occupant, 9), household_id: sid(G.household, 5), name: "Felix Schmidt", relationship: "Child", age: 5 },
      { id: sid(G.occupant, 10), household_id: sid(G.household, 6), name: "Anjali Patel", relationship: "Spouse", age: 44 },
      { id: sid(G.occupant, 11), household_id: sid(G.household, 6), name: "Arjun Patel", relationship: "Child", age: 15 },
      { id: sid(G.occupant, 12), household_id: sid(G.household, 6), name: "Meera Patel", relationship: "Child", age: 11 },
    ],

    automations: [
      { id: sid(G.automation, 1), name: "Late fee after grace period", trigger_event: "Rent overdue", action_type: "Apply late fee", enabled: true, status: "Active", metadata: { feeAmount: 75, conditions: [cond(1, "Balance is over $100"), cond(2, "5-day grace period has passed")], activityNotes: "Matches the late fee in Fees & Policies." } },
      { id: sid(G.automation, 2), name: "Overdue rent reminder", trigger_event: "Rent overdue", action_type: "Send message (template)", enabled: true, status: "Active", metadata: { templateId: template(2), conditions: [cond(3, "Tenant status is Current or Late")] } },
      { id: sid(G.automation, 3), name: "Mark tenant late", trigger_event: "Rent overdue", action_type: "Change status", enabled: true, status: "Active", metadata: { newStatus: "Late", conditions: [cond(4, "Balance is over $0 after the 6th")] } },
      { id: sid(G.automation, 4), name: "Renewal offer at 60 days", trigger_event: "Lease expiring in 60 days", action_type: "Send message (template)", enabled: true, status: "Active", metadata: { templateId: template(4), conditions: [cond(5, "No notice to vacate on file"), cond(6, "Lease term is 12 months")] } },
      { id: sid(G.automation, 5), name: "Escalate urgent work orders", trigger_event: "Work order created", action_type: "Notify team member", enabled: true, status: "Active", metadata: { notifyMemberId: member("Ben Alvarez").id, conditions: [cond(7, "Priority is High or Urgent")] } },
      { id: sid(G.automation, 6), name: "Screen new applications", trigger_event: "Application submitted", action_type: "Create task/work order", enabled: true, status: "Active", metadata: { taskTitle: "Review application and run screening", taskPriority: "High", conditions: [] } },
      { id: sid(G.automation, 7), name: "Post-repair satisfaction check", trigger_event: "Work order completed", action_type: "Send message (template)", enabled: false, status: "Paused", metadata: { templateId: template(8), conditions: [cond(8, "Work order category is not Preventive")], activityNotes: "Paused while we switch email providers." } },
      { id: sid(G.automation, 8), name: "Schedule move-out inspection", trigger_event: "Move-out scheduled", action_type: "Create task/work order", enabled: false, status: "Draft", metadata: { taskTitle: "Book move-out inspection and key return", taskPriority: "Medium", conditions: [] } },
      { id: sid(G.automation, 9), name: "Vendor insurance expiring", trigger_event: "Insurance expiring", action_type: "Notify team member", enabled: false, status: "Draft", metadata: { notifyMemberId: member("Carmen Diaz").id, conditions: [cond(9, "Expires within 30 days")] } },
    ],

    team_members: MEMBERS.map((m) => ({
      id: m.id,
      name: m.name,
      email: m.email,
      role: m.role,
      status: m.status,
      created_at: isoDaysFromNow(m.added, 9),
      updated_at: isoDaysFromNow(m.added, 9),
      metadata: {
        phone: m.phone,
        title: m.title,
        ...(m.status === "Invited" ? { activityNotes: "Starts on the Portland team next week." } : {}),
        ...(m.status === "Disabled" ? { activityNotes: "Seasonal contract ended — access turned off." } : {}),
      },
    })).sort((a, b) => b.created_at.localeCompare(a.created_at)),

    settings: Object.entries(SETTINGS).map(([key, value], i) => ({
      id: sid(G.setting, i + 1),
      key,
      value,
    })),

    activity: [
      { id: sid(G.activity, 1), owner_type: "property", owner_id: MARLOWE.id, verb: "attached", summary: "Attached Annual fire & life safety inspection 2026.pdf", actor_id: member("Alex Rivera").id, actor_name: "Alex Rivera", occurred_at: isoDaysFromNow(-2, 10) },
      { id: sid(G.activity, 2), owner_type: "property", owner_id: MARLOWE.id, verb: "note", summary: "Rooftop deck reopened with new furniture; reservations now go through the portal.", actor_id: member("Alex Rivera").id, actor_name: "Alex Rivera", occurred_at: isoDaysFromNow(-6, 15) },
      { id: sid(G.activity, 3), owner_type: "property", owner_id: MARLOWE.id, verb: "updated", summary: "Updated amenities: added EV charging", actor_id: member("Dana Kowal").id, actor_name: "Dana Kowal", occurred_at: isoDaysFromNow(-30, 11) },
      { id: sid(G.activity, 4), owner_type: "property", owner_id: CASCADE.id, verb: "updated", summary: "Status changed from Active to Maintenance", actor_id: member("Alex Rivera").id, actor_name: "Alex Rivera", occurred_at: isoDaysFromNow(-12, 9) },
      { id: sid(G.activity, 5), owner_type: "property", owner_id: CASCADE.id, verb: "note", summary: "Phase 2 of the lobby renovation starts next week — side entrance on Pine St.", actor_id: member("Morgan Ellis").id, actor_name: "Morgan Ellis", occurred_at: isoDaysFromNow(-8, 16) },
      { id: sid(G.activity, 6), owner_type: "property", owner_id: PINECREST.id, verb: "note", summary: "Roof report flags North building gutters for replacement next spring.", actor_id: member("Jordan Lee").id, actor_name: "Jordan Lee", occurred_at: isoDaysFromNow(-21, 12) },
      { id: sid(G.activity, 7), owner_type: "unit", owner_id: unit(4).id, verb: "updated", summary: "Status changed from Occupied to Notice", actor_id: member("Tasha Greene").id, actor_name: "Tasha Greene", occurred_at: isoDaysFromNow(-4, 14) },
      { id: sid(G.activity, 8), owner_type: "unit", owner_id: unit(4).id, verb: "note", summary: "Tenant considering renewal at the offered rate — follow up Friday.", actor_id: member("Tasha Greene").id, actor_name: "Tasha Greene", occurred_at: isoDaysFromNow(-1, 11) },
      { id: sid(G.activity, 9), owner_type: "unit", owner_id: unit(6).id, verb: "attached", summary: "Added kitchen photo to the gallery", actor_id: member("Tasha Greene").id, actor_name: "Tasha Greene", occurred_at: isoDaysFromNow(-10, 13) },
      { id: sid(G.activity, 10), owner_type: "unit", owner_id: unit(18).id, verb: "note", summary: "Make-ready: paint and carpet booked, ready in about 10 days.", actor_id: member("Ben Alvarez").id, actor_name: "Ben Alvarez", occurred_at: isoDaysFromNow(-5, 9) },
      { id: sid(G.activity, 11), owner_type: "building", owner_id: TOWER_A.id, verb: "attached", summary: "Attached Elevator inspection certificate — Tower A.pdf", actor_id: member("Ben Alvarez").id, actor_name: "Ben Alvarez", occurred_at: isoDaysFromNow(-15, 13) },
      { id: sid(G.activity, 12), owner_type: "media", owner_id: sid(G.media, 1), verb: "updated", summary: "Set as the cover photo for The Marlowe", actor_id: member("Dana Kowal").id, actor_name: "Dana Kowal", occurred_at: isoDaysFromNow(-18, 10) },
    ],

    media: [
      { id: sid(G.media, 1), owner_type: "property", owner_id: MARLOWE.id, kind: "photo", name: "The Marlowe — exterior at dusk", url: IMG[0], thumb_url: IMG[0], is_cover: true, sort: 0, size_bytes: 486000, status: "Published" },
      { id: sid(G.media, 2), owner_type: "property", owner_id: MARLOWE.id, kind: "photo", name: "The Marlowe — rooftop deck", url: IMG[1], thumb_url: IMG[1], is_cover: false, sort: 1, size_bytes: 452000, status: "Published" },
      { id: sid(G.media, 3), owner_type: "unit", owner_id: unit(5).id, kind: "photo", name: "A-301 — living room", url: IMG[2], thumb_url: IMG[2], is_cover: true, sort: 0, size_bytes: 438000, status: "Published" },
      { id: sid(G.media, 4), owner_type: "unit", owner_id: unit(6).id, kind: "photo", name: "B-101 — kitchen", url: IMG[3], thumb_url: IMG[3], is_cover: true, sort: 0, size_bytes: 471000, status: "Published" },
      { id: sid(G.media, 5), owner_type: "property", owner_id: PINECREST.id, kind: "photo", name: "Pinecrest Commons — courtyard", url: IMG[1], thumb_url: IMG[1], is_cover: true, sort: 0, size_bytes: 463000, status: "Published" },
      { id: sid(G.media, 6), owner_type: "building", owner_id: TOWER_B.id, kind: "photo", name: "Tower B — entrance", url: IMG[0], thumb_url: IMG[0], is_cover: true, sort: 0, size_bytes: 412000, status: "Published" },
      { id: sid(G.media, 7), owner_type: "property", owner_id: ALDER.id, kind: "photo", name: "Alder Court — townhome row", url: IMG[2], thumb_url: IMG[2], is_cover: true, sort: 0, size_bytes: 497000, status: "Published" },
      { id: sid(G.media, 8), owner_type: "property", owner_id: BIRCHWOOD.id, kind: "photo", name: "14 Birchwood Lane — front elevation", url: IMG[3], thumb_url: IMG[3], is_cover: true, sort: 0, size_bytes: 455000, status: "Published" },
      { id: sid(G.media, 9), owner_type: "property", owner_id: CASCADE.id, kind: "photo", name: "Cascade Lofts — lobby concept", url: IMG[1], thumb_url: IMG[1], is_cover: false, sort: 0, size_bytes: 389000, status: "Draft" },
      { id: sid(G.media, 10), owner_type: null, owner_id: null, kind: "360", name: "A-301 — 360° virtual tour", url: "", thumb_url: "", is_cover: false, sort: 0, size_bytes: 0, status: "Draft" },
      { id: sid(G.media, 11), owner_type: null, owner_id: null, kind: "video", name: "Pinecrest Commons — walkthrough video", url: "", thumb_url: "", is_cover: false, sort: 0, size_bytes: 0, status: "Draft" },
    ],
  };
}
