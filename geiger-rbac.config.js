import { defineRbacConfig, defineRole } from "@geiger/rbac";

import { PRODUCT, navPermissionKey } from "@/lib/rbac";
import { NAV_TREE as workspaceNav } from "@/lib/workspace/nav_tree";

// Property's @geiger/rbac catalog (server-safe: no React): a property.<slug>.view key per nav section and page, the
// action keys, and the system roles. Roles live in the shared public.roles; who holds them is property.role_grants.
// A new key goes to Manager unless it is listed in OWNER_ONLY, and to Admin unless it is listed in ADMIN_EXCLUDED.
// View keys derive from nav titles (lib/workspace/nav_tree.js): renaming a title changes its key.
// Sensitive keys (SENSITIVE_KEYS) reach no system role but Owner's `*`: they're ticked one by one, never inherited or synced.
// Keys or system roles changed? `npm run db:new -- rbac_system_roles`, then `npm run rbac:sql -- <that file>`.
// lib/rbac_sql.test.js fails until the newest migration's SQL copy matches this file.

export { navPermissionKey };

// Child page key → its section's key, for canView() and catalog top-ups.
const SECTION_OF = new Map();

function navPermissions() {
  const out = [];
  for (const item of workspaceNav) {
    if (!item.subItems?.length) {
      out.push({ key: navPermissionKey(item.title), label: item.title, group: "Pages" });
      continue;
    }
    const section = navPermissionKey(item.title);
    out.push({ key: section, label: `${item.title} section`, group: item.title });
    for (const sub of item.subItems) {
      SECTION_OF.set(navPermissionKey(sub.title), section);
      out.push({ key: navPermissionKey(sub.title), label: sub.title, group: item.title });
    }
  }
  return out;
}

const ACTION_PERMISSIONS = [
  { key: "property.team.invite", label: "Invite members", group: "Team control" },
  { key: "property.team.assign", label: "Assign roles", group: "Team control" },
  { key: "property.role.manage", label: "Create and edit roles", group: "Team control" },
  { key: "property.billing.manage", label: "Manage billing", group: "Administration" },
  { key: "property.settings.manage", label: "Manage settings", group: "Administration" },
  { key: "property.integration.manage", label: "Manage integrations and webhooks", group: "Administration" },
  { key: "property.api_key.manage", label: "Manage API keys", group: "Administration" },
  { key: "property.portal.manage", label: "Manage portal access", group: "Administration" },
  { key: "property.privacy.manage", label: "Handle privacy requests", group: "Administration" },
  { key: "property.audit.view", label: "View the audit log", group: "Administration" },
  { key: "property.record.delete", label: "Delete records", group: "Records" },
  { key: "property.data.import", label: "Import data", group: "Records" },
  { key: "property.data.export", label: "Export data", group: "Records" },
  { key: "property.lease.manage", label: "Set up leases before they bill (starting rent, concessions)", group: "Leasing controls" },
  { key: "property.renewal.manage", label: "Accept renewals", group: "Leasing controls" },
  { key: "property.listing.publish", label: "Publish listings to the public site and listing sites", group: "Leasing controls" },
  { key: "property.screening.order", label: "Order screening, ID and income checks", group: "Screening controls" },
  { key: "property.screening.view_reports", label: "Open full screening reports and verification detail", group: "Screening controls" },
  { key: "property.screening.decide", label: "Record or change application decisions", group: "Screening controls" },
  { key: "property.screening.adverse_action", label: "Send adverse-action and fair-chance notices", group: "Screening controls" },
  { key: "property.screening.fraud_review", label: "Clear or confirm fraud flags", group: "Screening controls" },
  { key: "property.accounting.post", label: "Post charges, payments, bills & journal entries", group: "Accounting controls" },
  { key: "property.accounting.void", label: "Void ledger entries", group: "Accounting controls" },
  { key: "property.accounting.override_restrictions", label: "Override tenant payment restrictions", group: "Accounting controls" },
  { key: "property.accounting.convert", label: "Post opening balances", group: "Accounting controls" },
  { key: "property.accounting.payment_plans", label: "Set up, cancel and default payment plans", group: "Accounting controls" },
  { key: "property.accounting.write_off", label: "Write off bad debt and record recoveries", group: "Accounting controls" },
  { key: "property.accounting.close", label: "Close and reopen periods", group: "Accounting controls" },
  { key: "property.rent.manage", label: "Change rent schedules and billing settings", group: "Accounting controls" },
  { key: "property.payment.collect", label: "Collect payments and set up autopay", group: "Accounting controls" },
  { key: "property.payment.refund", label: "Refund payments", group: "Accounting controls" },
  { key: "property.report.export", label: "Export reports (CSV / PDF)", group: "Report controls" },
  { key: "property.report.schedule", label: "Schedule report emails", group: "Report controls" },
  { key: "property.message.send", label: "Send messages and announcements", group: "Communication controls" },
  { key: "property.review.resolve", label: "Resolve, retry and assign review items", group: "Automation controls" },
  { key: "property.automation.manage", label: "Install playbooks, set autonomy and guardrails", group: "Automation controls" },
  { key: "property.automation.run", label: "Run workflows by hand on records", group: "Automation controls" },
  { key: "property.screening.criteria", label: "Edit screening criteria", group: "Screening controls" },
];

// An action a role never decided on inherits the key that gated it before it existed (pre-01a `inherits`).
const ACTION_PARENT = new Map([
  ["property.accounting.post", navPermissionKey("Accounting")],
  ["property.accounting.void", navPermissionKey("Accounting")],
  ["property.accounting.convert", "property.accounting.post"],
  ["property.accounting.payment_plans", "property.accounting.post"],
  ["property.accounting.write_off", "property.accounting.post"],
  ["property.accounting.close", navPermissionKey("Accounting")],
  ["property.rent.manage", navPermissionKey("Accounting")],
  ["property.lease.manage", navPermissionKey("Leases")],
  ["property.renewal.manage", navPermissionKey("Renewals")],
  ["property.listing.publish", navPermissionKey("Listings")],
  ["property.screening.order", navPermissionKey("Applications")],
  ["property.screening.decide", navPermissionKey("Applications")],
  ["property.screening.adverse_action", "property.screening.decide"],
  ["property.screening.fraud_review", "property.screening.decide"],
  ["property.payment.collect", "property.accounting.post"],
  ["property.payment.refund", "property.accounting.post"],
  ["property.report.export", navPermissionKey("Reports")],
  ["property.report.schedule", navPermissionKey("Reports")],
  ["property.message.send", navPermissionKey("Communications")],
  ["property.review.resolve", navPermissionKey("Review Queue")],
  ["property.automation.manage", navPermissionKey("Automations")],
  ["property.automation.run", navPermissionKey("Automations")],
  ["property.screening.criteria", "property.settings.manage"],
]);

// Consumer-report access (RISK-03): no parent, no system role but Owner's `*`, and role sync never adds them.
export const SENSITIVE_KEYS = new Set(["property.screening.view_reports"]);
export const isSensitiveKey = (key) => SENSITIVE_KEYS.has(key);

// Unique by key (first wins), nav first so parents precede children in catalog order.
const PERMISSIONS = [...new Map([...navPermissions(), ...ACTION_PERMISSIONS].map((p) => [p.key, p])).values()];
const ALL_KEYS = PERMISSIONS.map((p) => p.key);

// Pages every staff role should reach regardless of their section: they follow Overview instead.
const PAGE_PARENT = new Map([[navPermissionKey("Setup & Go-live"), navPermissionKey("Overview")]]);

// The key a page or action falls back to when a role never decided on it.
export const parentKeyOf = (key) => PAGE_PARENT.get(key) || SECTION_OF.get(key) || ACTION_PARENT.get(key) || null;

// The nav section a page sits in (seeing the page also needs its section).
export const sectionKeyOf = (key) => SECTION_OF.get(key) || null;

// View keys for whole nav sections and/or single pages (adding the parent section), plus action keys.
function pages({ sections = [], titles = [], actions = [] }) {
  const keys = new Set();
  for (const title of sections) {
    keys.add(navPermissionKey(title));
    const item = workspaceNav.find((x) => x.title === title);
    for (const sub of item?.subItems || []) keys.add(navPermissionKey(sub.title));
  }
  for (const title of titles) {
    const key = navPermissionKey(title);
    keys.add(key);
    if (SECTION_OF.has(key)) keys.add(SECTION_OF.get(key));
  }
  for (const action of actions) keys.add(action);
  return [...keys].filter((k) => ALL_KEYS.includes(k));
}

// Kept from Manager: billing, role definitions and the two sensitive data controls.
const OWNER_ONLY = new Set([
  "property.billing.manage",
  "property.role.manage",
  navPermissionKey("Roles & Permissions"),
  "property.api_key.manage",
  "property.privacy.manage",
]);

// Kept from Admin (org admins): only billing stays with the Owner.
const ADMIN_EXCLUDED = new Set(["property.billing.manage"]);

// Viewer (read-only, e.g. prospects touring the demo): every page Manager sees, no action key and not the audit log.
const VIEW_ONLY = ALL_KEYS.filter((k) => k.endsWith(".view") && !OWNER_ONLY.has(k) && k !== "property.audit.view");

const SYSTEM_ROLES = [
  defineRole({
    key: "owner",
    name: "Owner",
    description: "Full access to everything, including billing.",
    color: "violet",
    permissions: ["*"],
    sort: 0,
  }),
  defineRole({
    key: "admin",
    name: "Admin",
    description: "Manages the workspace, team and roles; no billing.",
    color: "blue",
    permissions: ALL_KEYS.filter((k) => !ADMIN_EXCLUDED.has(k) && !SENSITIVE_KEYS.has(k)),
    sort: 1,
  }),
  defineRole({
    key: "manager",
    name: "Manager",
    description: "Runs the portfolio day to day; can't edit roles or billing.",
    color: "emerald",
    permissions: ALL_KEYS.filter((k) => !OWNER_ONLY.has(k) && !SENSITIVE_KEYS.has(k)),
    sort: 2,
  }),
  defineRole({
    key: "leasing_agent",
    name: "Leasing agent",
    description: "Marketing, leasing and resident communication.",
    color: "sky",
    permissions: pages({
      sections: ["Marketing & Leads", "Leasing", "Communications"],
      titles: [
        "Overview",
        "Setup & Go-live",
        "Briefing",
        "Review Queue",
        "Properties",
        "Units",
        "Tenants",
        "Document Library",
        "Templates",
        "E-signature",
        "Occupancy & Vacancy",
        "Leasing Report",
        "Screening Rules",
      ],
      actions: [
        "property.report.export",
        "property.review.resolve",
        "property.automation.run",
        "property.message.send",
        "property.lease.manage",
        "property.renewal.manage",
        "property.listing.publish",
        "property.screening.order",
        "property.screening.decide",
        "property.screening.adverse_action",
      ],
    }),
    sort: 5,
  }),
  defineRole({
    key: "maintenance_tech",
    name: "Maintenance tech",
    description: "Work orders, turns and vendors.",
    color: "orange",
    permissions: pages({
      sections: ["Maintenance"],
      titles: ["Overview", "Setup & Go-live", "Briefing", "Review Queue", "Properties", "Units", "Vendors", "Maintenance Report", "Insurance Compliance"],
      actions: ["property.report.export", "property.review.resolve", "property.automation.run"],
    }),
    sort: 6,
  }),
  defineRole({
    key: "accountant",
    name: "Accountant",
    description: "The books: posting, payments and financial reports.",
    color: "amber",
    permissions: pages({
      sections: ["Accounting", "Reports"],
      titles: ["Overview", "Setup & Go-live", "Briefing", "Review Queue", "Tenants", "Owners", "Vendors", "Document Library"],
      actions: [
        "property.accounting.post",
        "property.accounting.void",
        "property.accounting.convert",
        "property.accounting.payment_plans",
        "property.accounting.write_off",
        "property.accounting.close",
        "property.rent.manage",
        "property.payment.collect",
        "property.payment.refund",
        "property.report.export",
        "property.report.schedule",
        "property.review.resolve",
        "property.automation.run",
      ],
    }),
    sort: 7,
  }),
  defineRole({
    key: "viewer",
    name: "Viewer",
    description: "Read-only: sees the workspace, changes nothing.",
    color: "slate",
    permissions: VIEW_ONLY,
    sort: 8,
  }),
];

export default defineRbacConfig({ product: PRODUCT, permissions: PERMISSIONS, systemRoles: SYSTEM_ROLES });
