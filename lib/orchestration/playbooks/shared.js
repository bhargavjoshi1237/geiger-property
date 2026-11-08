import { DEFAULT_AUTONOMY, stepDefaults } from "@/lib/automations/catalog";
import { AUTONOMY_MODES } from "@/lib/orchestration/autonomy";

// Building blocks for playbook definitions (isomorphic, pure). A playbook is
//   { key, version, area, title, outcome, description, prerequisites, questions(ctx), defaults(ctx),
//     workflows(config) → [workflow], defaultAutonomy, kpis, signals, changes }
// and a workflow is { key, name, description, triggerEvent, trigger, conditionRules?, conditions?, steps }.
// Step ids are stable (`<workflowKey>-<n>`) so upgrades can tell an edited workflow from a generated one.

export const AREAS = ["Collections", "Leases", "Maintenance", "Compliance", "Accounting", "Managing agents", "Analytics"];

export const step = (id, type, config = {}) => ({ id, type, config: { ...stepDefaults(type), ...config } });

// Numbered steps for one workflow: steps("ladder", [["send_email", {...}], ...]).
export const steps = (workflowKey, list) => list.map(([type, config], i) => step(`${workflowKey}-${i + 1}`, type, config));

export const num = (v, fallback) => (v === "" || v === null || v === undefined || Number.isNaN(Number(v)) ? fallback : Number(v));
export const clampDay = (d) => Math.min(28, Math.max(1, Math.round(num(d, 1))));
export const usd = (n) => `$${(Number(n) || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

// Property scope as conditions on the record's property_id: one property → a plain rule, several → an OR group.
export function propertyConditions(config) {
  const ids = Array.isArray(config?.propertyIds) ? config.propertyIds.filter(Boolean) : [];
  if (!ids.length) return {};
  if (ids.length === 1) return { conditionRules: [{ field: "property_id", op: "equals", value: ids[0] }] };
  return { conditions: { op: "or", rules: ids.map((id) => ({ field: "property_id", op: "equals", value: id })) } };
}

// --- Prerequisites ---------------------------------------------------------------
// check(ctx) runs client-side against ctx = { status: { email, stripe }, counts: { bankAccounts, owners, vendors,
// properties, teamMembers } }. `required: false` marks a limitation the card states plainly without blocking install.

export const PREREQS = {
  email: {
    key: "email",
    label: "Email sending",
    required: true,
    check: (ctx) => Boolean(ctx?.status?.email),
    missing: "Email isn't connected, so nothing this playbook sends would arrive. Connect the suite email service.",
    tab: "Notifications",
  },
  stripe: {
    key: "stripe",
    label: "Online payments (Stripe)",
    required: true,
    check: (ctx) => Boolean(ctx?.status?.stripe?.configured),
    missing: "Online payments aren't connected, so autopay never runs and can't fail. Connect Stripe first.",
    tab: "Payment Processing",
  },
  bankAccounts: {
    key: "bankAccounts",
    label: "Bank accounts",
    required: true,
    check: (ctx) => (ctx?.counts?.bankAccounts || 0) > 0,
    missing: "Add your trust and operating bank accounts so reconciliation can be checked.",
    tab: "Bank Accounts",
  },
  owners: {
    key: "owners",
    label: "Owners linked to properties",
    required: true,
    check: (ctx) => (ctx?.counts?.owners || 0) > 0,
    missing: "Add owners and link them to their properties.",
    tab: "Owners",
  },
  vendors: {
    key: "vendors",
    label: "Vendors with a trade",
    required: false,
    check: (ctx) => (ctx?.counts?.vendors || 0) > 0,
    missing: "No vendors yet — requests are acknowledged, but nobody can be assigned until you add vendors with a trade.",
    tab: "Vendors",
  },
  payoutsProvider: {
    key: "payoutsProvider",
    label: "Outbound payments provider",
    required: true,
    check: () => false,
    missing: "Owner payouts need an outbound payments provider (CORE-51/54). That decision is still pending, so Geiger can't send payouts yet.",
    tab: "Payment Processing",
  },
  paymentPlans: {
    key: "paymentPlans",
    label: "Payment plans",
    required: true,
    check: () => false,
    missing: "Geiger doesn't record payment-plan installments yet, so there's nothing to follow up on. Payment plans are a pending build item.",
    tab: "Rent Collection",
  },
  periodClose: {
    key: "periodClose",
    label: "Period close",
    required: false,
    check: () => true,
    missing: "Close periods in General Ledger → Close periods.",
    tab: "General Ledger",
  },
  rentCaps: {
    key: "rentCaps",
    label: "Jurisdiction rent caps",
    required: false,
    check: () => false,
    missing: "Local rent-cap tables (HOUS-07) aren't loaded. Proposed rents are checked against the maximum increase you set here.",
    tab: "Renewals",
  },
  listings: {
    key: "listings",
    label: "Automatic listing publishing",
    required: false,
    check: () => false,
    missing: "Listings can't be published automatically yet — the playbook gives you a task to publish once make-ready is done.",
    tab: "Listings",
  },
  depositRefunds: {
    key: "depositRefunds",
    label: "Deposit refund posting",
    required: false,
    check: () => false,
    missing: "Deposit refunds aren't posted automatically yet (CORE-04). After approval you issue the refund from Security Deposits.",
    tab: "Security Deposits",
  },
};

// [{ ...prereq, ok }] for a playbook in a context.
export const prerequisiteStatus = (playbook, ctx) => (playbook.prerequisites || []).map((p) => ({ ...p, ok: Boolean(p.check(ctx)) }));
export const blockingPrerequisites = (playbook, ctx) => prerequisiteStatus(playbook, ctx).filter((p) => p.required && !p.ok);

// --- Shared wizard questions -------------------------------------------------------

export const propertyOptions = (ctx) => (ctx?.properties || []).map((p) => ({ value: p.id, label: p.name || "Property" }));
export const memberOptions = (ctx) => [{ value: "", label: "Nobody" }, ...(ctx?.members || []).map((m) => ({ value: m.id, label: m.name || m.email || "Member" }))];

export const scopeStep = (ctx) => ({
  key: "scope",
  title: "Properties",
  description: "Leave empty to run for every property, or pick the ones this playbook covers.",
  fields: [{ key: "propertyIds", label: "Properties", type: "multiselect", options: propertyOptions(ctx), full: true }],
});

export const autonomyStep = (defaultMode = DEFAULT_AUTONOMY) => ({
  key: "autonomy",
  title: "Autonomy",
  description: `How much it may do on its own. Guardrails (Settings → Automation Settings) apply in every mode. Recommended: ${
    AUTONOMY_MODES.find((m) => m.value === defaultMode)?.label || "Ask first"
  }.`,
  fields: [
    { key: "autonomy", label: "Autonomy", type: "select", options: AUTONOMY_MODES.map((m) => ({ value: m.value, label: `${m.label} — ${m.desc}` })), full: true },
    { key: "threshold", label: "Ask when a charge is at least", type: "currency", showIf: (v) => v.autonomy === "approve_over" },
    { key: "activate", label: "Switch the workflows on now (otherwise they install as drafts)", type: "switch", full: true },
  ],
});

export const autonomyDefaults = (defaultMode = DEFAULT_AUTONOMY) => ({ autonomy: defaultMode, threshold: 100, activate: false, propertyIds: [] });

// Autonomy fields for every generated workflow (config answers win; Ask first gates money and legal steps).
export const autonomyFor = (config, playbook) => {
  const mode = config?.autonomy || playbook?.defaultAutonomy || DEFAULT_AUTONOMY;
  return {
    autonomy: mode,
    // Suggest-only gates every side effect (empty appliesTo); the other modes ask about money and legal steps.
    autonomyConfig: { appliesTo: mode === "suggest" ? [] : ["money", "legal"], threshold: num(config?.threshold, 0), approverRole: "" },
  };
};
