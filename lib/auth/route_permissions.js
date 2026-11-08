// Every /api handler and what guards it (PLAT-01f). Keys are "<METHOD> <path under app/api>".
// Staff handlers: the permission their requireStaff / billingAccess call declares — a key or keys (all required),
// or { anyOf } (one is enough). lib/auth/route_permissions.test.js fails when a handler is missing here or its route
// declares something else, so a permission change shows up in this file's diff.

const ACCOUNTING_VIEW = "property.accounting.view";
const POST = "property.accounting.post";
// Payment plans (CORE-14): setting one up, cancelling or defaulting it; recording its down payment also takes POST.
const PLANS = "property.accounting.payment_plans";

export const STAFF_ROUTES = {
  // Accounting (CORE-09 bills, INTL-04 conversion, INTL-07 export, CORE-46 journal imports and reversals).
  "POST accounting/bills": POST,
  "POST accounting/bills/[id]/approve": POST,
  "POST accounting/bills/[id]/open": POST,
  "POST accounting/bills/[id]/post": POST,
  "POST accounting/conversion/[batchId]/post": "property.accounting.convert",
  "POST accounting/conversion/[batchId]/void": ["property.accounting.convert", "property.accounting.void"],
  "POST accounting/export": "property.report.export",
  // Journal-entry files need POST, opening-balance files accounting.convert; the route checks which once it knows the kind.
  "POST accounting/journal-imports": { anyOf: [POST, "property.accounting.convert"] },
  "POST accounting/journal-imports/[importId]/post": { anyOf: [POST, "property.accounting.convert"] },
  "POST accounting/journal/[entryId]/reverse": POST,

  // Billing (CORE-01 to CORE-06, CORE-11, CORE-14, CORE-16, CORE-17); every posting route matches ledger_post's accounting.post gate, a void ledger_void's accounting.void, payment plans their own key.
  // Amenity reservation fees and deposits (CORE-18); cancel also checks accounting.void when it voids.
  "GET billing/amenity-reservations/[id]": { anyOf: [POST, ACCOUNTING_VIEW] },
  "POST billing/amenity-reservations/[id]/cancel": POST,
  "POST billing/amenity-reservations/[id]/charge": POST,
  "POST billing/amenity-reservations/[id]/forfeit": POST,
  "POST billing/amenity-reservations/[id]/release": POST,
  "POST billing/bank-deposits": POST,
  "GET billing/bank-deposits/undeposited": { anyOf: [POST, ACCOUNTING_VIEW] },
  "POST billing/bank-deposits/[id]/void": "property.accounting.void",
  "GET billing/bank-deposits/[id]/slip": { anyOf: [POST, ACCOUNTING_VIEW] },
  "POST billing/charges/[id]/post-next": POST,
  "GET billing/deposits/[id]": { anyOf: [POST, "property.security_deposits.view"] },
  "POST billing/deposits/[id]/charge": POST,
  "POST billing/deposits/[id]/dispose": POST,
  "POST billing/deposits/[id]/received": POST,
  "POST billing/deposits/[id]/sweep": POST,
  "GET billing/deposits/sweeps": POST,
  "POST billing/leases/[leaseId]/activate": POST,
  "POST billing/leases/[leaseId]/bill": POST,
  "POST billing/leases/[leaseId]/close-out": POST,
  "GET billing/leases/[leaseId]/concessions/preview": { anyOf: ["property.leases.view", "property.rent.manage"] },
  "POST billing/leases/[leaseId]/concessions": { anyOf: ["property.rent.manage", "property.lease.manage"] },
  "GET billing/leases/[leaseId]/late-fee": { anyOf: ["property.rent_collection.view", POST] },
  "POST billing/leases/[leaseId]/late-fee": POST,
  "GET billing/leases/[leaseId]/preview": { anyOf: [POST, "property.leases.view"] },
  "POST billing/leases/[leaseId]/rent-steps": { anyOf: ["property.rent.manage", "property.lease.manage"] },
  "GET billing/payment-plans": { anyOf: [PLANS, POST, "property.rent_collection.view"] },
  "POST billing/payment-plans": PLANS,
  "GET billing/payment-plans/[id]/agreement": { anyOf: [PLANS, POST, "property.rent_collection.view"] },
  "POST billing/payment-plans/[id]/agreement": PLANS,
  "POST billing/payment-plans/[id]/cancel": PLANS,
  "POST billing/payment-plans/[id]/default": PLANS,
  "POST billing/payments": POST,
  "GET billing/payments/[entryId]/return": { anyOf: ["property.accounting.void", ACCOUNTING_VIEW] },
  "POST billing/payments/[entryId]/return": "property.accounting.void",
  "GET billing/receipts/[entryId]": { anyOf: [POST, ACCOUNTING_VIEW] },
  "POST billing/receipts/[entryId]/send": POST,
  "POST billing/renewals/[renewalId]/accept": "property.renewal.manage",
  // Resident statements (CORE-12): ledger figures need accounting access; printing needs export, sending and settings rent.manage.
  "GET billing/statements/[leaseId]": { permission: ACCOUNTING_VIEW, anyOf: ["property.report.export", "property.rent.manage"] },
  "POST billing/statements/print": ["property.report.export", ACCOUNTING_VIEW],
  "POST billing/statements/send": ["property.rent.manage", ACCOUNTING_VIEW],
  "GET billing/statements/settings": { anyOf: ["property.rent.manage", "property.settings.manage", ACCOUNTING_VIEW] },
  "PATCH billing/statements/settings": "property.rent.manage",

  // Chat calls: short-lived TURN credentials (PLAT-01h).
  "GET chat/turn": "property.communications.view",

  // Scheduled jobs: the catalog, the pause switch, "Run now" and "Run everything due" for one project.
  "GET cron/jobs": "property.settings.manage",
  "PATCH cron/jobs": "property.settings.manage",
  "POST cron/[job]": "property.settings.manage",
  "POST cron/run-due": "property.settings.manage",

  // Leasing site (LEAS-01): refresh the public pages after a listing or site change.
  "POST leasing/public/revalidate": { anyOf: ["property.listings.view", "property.settings.manage"] },

  // Messaging.
  "POST messages/announce": "property.message.send",
  "POST messages/send": "property.message.send",
  "GET messages/status": "property.notifications.view",

  // Orchestration (ORCH-04, ORCH-08, ORCH-10).
  "POST orchestration/attachments": "property.review_queue.view",
  "POST orchestration/launch": "property.automation.run",
  "POST orchestration/review": "property.review.resolve",

  // Online payments (Stripe).
  "POST payments/autopay": "property.payment.collect",
  "POST payments/cancel": "property.payment.collect",
  "POST payments/checkout": "property.payment.collect",
  "POST payments/options": "property.payment.collect",
  "POST payments/refund": "property.payment.refund",
  "GET payments/status": ACCOUNTING_VIEW,
  "POST payments/sync": ACCOUNTING_VIEW,

  // Portal access managed by staff.
  "POST portal/staff/access": "property.portal.manage",

  // Screening (RISK-03): full reports and verification detail need view_reports; see SCREENING_ROUTE_PREFIXES.
  "GET screening/applications/[applicationId]/report": "property.screening.view_reports",
};

// Every staff handler under these declares a property.screening.* key (all-of), or only screening keys (any-of); one under a
// report/ or reports/ segment needs property.screening.view_reports. Open routes (webhooks) are exempt. Tested in route_permissions.test.js.
export const SCREENING_ROUTE_PREFIXES = ["screening/", "identity/", "income/"];

// Handlers that aren't staff routes: the call each must make instead of requireStaff, and why it's safe.
export const OPEN_ROUTES = {
  "GET cron/[job]": { guard: "authorizeScheduler", why: "Vercel Cron, CRON_SECRET bearer (timing-safe)" },
  "GET cron/run-due": { guard: "authorizeScheduler", why: "Vercel Cron, CRON_SECRET bearer (timing-safe)" },
  "POST messages/inbound": { guard: "authorizeScheduler", why: "INBOUND_EMAIL_SECRET bearer; the project comes from the matched thread or a project address" },
  "GET payments/link/[token]": { guard: "openPaymentLink", why: "Payer link from an email, gated by its unguessable token" },
  "GET payments/verify": { guard: "fulfillCheckoutSession", why: "Checkout return; the session is re-read from Stripe" },
  "POST stripe/webhook": { guard: "constructEvent", why: "Stripe signature" },
  "POST portal/auth/otp": { guard: "checkPortalEmail", why: "Portal sign-in email, only to active portal members" },
  "POST portal/auth/verify": { guard: "verifyEmailCode", why: "Portal sign-in code" },
  "POST portal/auth/logout": { guard: "signOutPortal", why: "Ends the caller's own portal session" },
  "GET portal/me": { guard: "getPortalSession", why: "The caller's own portal memberships" },
  "GET public/listings/[handle]": {
    guard: "cachedSite",
    why: "Public vacancy feed (LEAS-01): enabled sites only, allowlisted fields, cached 60s; Vercel WAF rate limit",
  },
};

// Public pages outside app/api (LEAS-01): the guard each calls first; it answers 404 unless the site is enabled and
// Leasing is on, and every read goes through the service role and the public serializer. Vercel WAF rate-limits /l/*.
export const PUBLIC_PAGES = {
  "l/[handle]/(site)/layout.js": { guard: "cachedSite", why: "Site chrome and the 404 for disabled or unknown sites" },
  "l/[handle]/(site)/page.js": { guard: "cachedSite", why: "Vacancy search" },
  "l/[handle]/(site)/[slug]/page.js": { guard: "cachedListing", why: "Listing detail: Active, website channel on, else 404" },
  "l/[handle]/(site)/[slug]/gone/page.js": { guard: "cachedListing", why: "410 page for leased or archived listings (proxy.js)" },
  "l/[handle]/(site)/p/[propertyId]/page.js": { guard: "cachedProperty", why: "One property's availability" },
  "l/[handle]/embed/page.js": { guard: "cachedSite", why: "Chrome-less vacancy widget for iframes" },
  "l/[handle]/sitemap.xml/route.js": { guard: "cachedSite", why: "Sitemap of the site's live pages" },
};

// Every other portal/ handler (except portal/staff/) runs as the signed-in portal member through one of these.
export const PORTAL_GUARDS = ["withPortal", "requirePortal"];
