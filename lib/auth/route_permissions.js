// Every /api handler and what guards it (PLAT-01f). Keys are "<METHOD> <path under app/api>".
// Staff handlers: the permission their requireStaff / billingAccess call declares — a key or keys (all required),
// or { anyOf } (one is enough). lib/auth/route_permissions.test.js fails when a handler is missing here or its route
// declares something else, so a permission change shows up in this file's diff.

const ACCOUNTING_VIEW = "property.accounting.view";
const POST = "property.accounting.post";

export const STAFF_ROUTES = {
  // Accounting (CORE-09 bills, INTL-04 conversion, INTL-07 export).
  "POST accounting/bills": POST,
  "POST accounting/bills/[id]/approve": POST,
  "POST accounting/bills/[id]/open": POST,
  "POST accounting/bills/[id]/post": POST,
  "POST accounting/conversion/[batchId]/post": "property.accounting.convert",
  "POST accounting/conversion/[batchId]/void": ["property.accounting.convert", "property.accounting.void"],
  "POST accounting/export": "property.report.export",

  // Billing (CORE-01 to CORE-06, CORE-11, CORE-16); every posting route matches ledger_post's accounting.post gate, a void ledger_void's accounting.void.
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
  "POST billing/payments": POST,
  "GET billing/receipts/[entryId]": { anyOf: [POST, ACCOUNTING_VIEW] },
  "POST billing/receipts/[entryId]/send": POST,
  "POST billing/renewals/[renewalId]/accept": "property.renewal.manage",
  // Resident statements (CORE-12): ledger figures need accounting access; printing needs export, sending and settings rent.manage.
  "GET billing/statements/[leaseId]": { permission: ACCOUNTING_VIEW, anyOf: ["property.report.export", "property.rent.manage"] },
  "POST billing/statements/print": ["property.report.export", ACCOUNTING_VIEW],
  "POST billing/statements/send": ["property.rent.manage", ACCOUNTING_VIEW],
  "GET billing/statements/settings": { anyOf: ["property.rent.manage", "property.settings.manage", ACCOUNTING_VIEW] },
  "PATCH billing/statements/settings": "property.rent.manage",

  // Scheduled jobs: the catalog, the pause switch, "Run now" and "Run everything due" for one project.
  "GET cron/jobs": "property.settings.manage",
  "PATCH cron/jobs": "property.settings.manage",
  "POST cron/[job]": "property.settings.manage",
  "POST cron/run-due": "property.settings.manage",

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
};

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
};

// Every other portal/ handler (except portal/staff/) runs as the signed-in portal member through one of these.
export const PORTAL_GUARDS = ["withPortal", "requirePortal"];
