// Target of the demo seed and the seed-file layout. The base dataset is the
// landing playground's sample portfolio (lib/sandbox/seed), re-keyed from its
// sandbox ids onto this project; areas/*.mjs extend it to every other table.

export const TARGET = {
  projectId: "ebcc7910-1a0e-4e91-8c3b-752f3c4292d3",
  organizationId: "fcc95889-9832-4072-a34f-3c3ce55d8893",
  // Project creator — stamped as created_by so storage RLS lets them upload media.
  createdBy: "77bc4a76-4959-4a23-a5ae-eaccdf731bb3",
  // Sandbox ids are "5a0d0000-0000-4000-a000-<group><n>"; demo ids swap the prefix.
  idPrefix: "ebcc7910-0000-4000-a000-",
};

export const SANDBOX_PREFIX = "5a0d0000-0000-4000-a000-";

// Seed files in run order → the tables each one writes, in FK-safe order.
export const FILES = [
  ["01_core", [
    "portfolios", "properties", "buildings", "floor_plans", "unit_types", "amenities",
    "amenity_links", "floor_plan_links", "units", "owners", "property_owners", "vendors",
    "tenants", "tenant_households", "tenant_occupants", "leases", "lease_parties",
    "team_members", "settings", "portal_members",
  ]],
  ["02_leasing", [
    "listings", "prospects", "showings", "applications", "waitlist_entries", "rent_comps",
    "renewals", "moves", "inspections", "security_deposits", "notices", "lease_templates",
    "esign_requests", "lease_addenda", "record_items",
  ]],
  ["03_maintenance", [
    "work_orders", "vendor_assignments", "pm_schedules", "unit_turns", "inventory_items",
    "maintenance_attachments", "cost_jobs",
  ]],
  ["04_accounting", [
    "gl_accounts", "bank_accounts", "rent_accounts", "recurring_charges", "bills", "transactions",
    "budgets", "budget_lines", "ledger_entries", "ledger_lines", "bank_reconciliations",
    "cam_reconciliations", "utility_allocations", "autopay_plans", "online_payments",
  ]],
  ["05_workspace", [
    "announcements", "announcement_deliveries", "message_templates", "tenant_communications",
    "message_threads", "thread_messages", "documents", "tenant_documents", "media",
    "amenity_reservations", "resident_events", "automations", "automation_events",
    "automation_runs", "report_schedules", "report_runs", "job_runs", "notification_sends",
    "activity",
  ]],
];

// Per-table upsert overrides; default is `on conflict (id) do update` over every column.
export const CONFLICT = {
  // One row per (project, key); the existing custom_fields row keeps its id.
  settings: {
    target: "((coalesce(project_id, '00000000-0000-0000-0000-000000000000'::uuid)), key)",
    update: ["value", "metadata", "updated_at"],
  },
};

// Tables the seed never writes (orphans, webhook logs, global reference data).
export const SKIP_TABLES = new Set(["projects", "stripe_events", "legal_jurisdictions", "legal_resources"]);
