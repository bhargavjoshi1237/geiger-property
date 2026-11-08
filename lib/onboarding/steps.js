import { isModuleOn } from "@/lib/modules";

// Get-started checklist (INTL-03): an ordered, pure step catalogue. To add a step, append one entry to STEPS
// ({ id, title, why, screen, helpSlug, required, needs, check }) and its source to load.js if it needs new data.

export const ONBOARDING_SETTING_KEY = "onboarding";

// Help articles live in geiger-dash at /help/property/<slug>; the contact page is the default onboarding-help link.
export const HELP_BASE_URL = "https://geiger.studio";
export const DEFAULT_HELP_LINK = `${HELP_BASE_URL}/contact`;
export const helpUrl = (slug) => (slug ? `${HELP_BASE_URL}/help/property/${slug}` : null);

const ACTIVE_LEASE = new Set(["Active", "Expiring soon", "Month-to-month", "Notice given"]);
const filled = (v) => String(v ?? "").trim() !== "";
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const list = (parts) => parts.filter(Boolean).join(", ");
const todo = (detail, count = 0) => ({ done: false, detail, count });
const complete = (detail, count = 0) => ({ done: true, detail, count });

// Owners' shares of a property count only while the share has not ended.
const liveShare = (row, today) => !row.endsOn || String(row.endsOn) >= today;

function companyProfile({ settings }) {
  const p = settings.company_profile || {};
  const missing = [!filled(p.legalName) && "legal name", !filled(p.state) && "state", !filled(p.licenseNumber) && "licence number"].filter(Boolean);
  return missing.length ? todo(`Add ${missing.join(", ")}`, missing.length) : complete(p.legalName);
}

function bankAccounts({ settings, bankAccounts: rows }) {
  const live = rows.filter((r) => r.status !== "Closed" && r.status !== "Draft");
  const need = [["Operating", "an Operating"], ["Trust", "a Trust"]];
  if (settings.fees_policies?.depositHeldIn === "separate") need.push(["Security deposit", "a deposit trust"]);
  const missing = need.filter(([type]) => !live.some((r) => r.accountType === type)).map(([, label]) => label);
  const unlinked = live.filter((r) => !r.glAccountId).length;
  if (missing.length || unlinked) {
    const parts = [missing.length && `Add ${missing.join(" and ")} account`, unlinked && `${plural(unlinked, "account")} not linked to the chart`];
    return todo(list(parts), missing.length + unlinked);
  }
  return complete(plural(live.length, "bank account"));
}

// Deposits held in trust move to their own Security deposit account (CORE-04); without one they stay where they were paid (warn, don't block).
function depositAccount({ settings, bankAccounts: rows }) {
  if ((settings.fees_policies?.depositHeldIn || "trust") !== "trust") return complete("Deposits are held in the operating account");
  const live = rows.filter((r) => r.status !== "Closed" && r.status !== "Draft" && r.accountType === "Security deposit");
  return live.length ? complete(live.map((r) => r.name).filter(Boolean).join(", ") || plural(live.length, "deposit account")) : todo("Add a Security deposit bank account — until then deposit money stays in the account it's paid into", 1);
}

function feesPolicies({ settings }) {
  const f = settings.fees_policies;
  if (!f || typeof f !== "object") return todo("Review and save the company defaults", 3);
  const missing = [f.rentDueDay == null && "rent due day", f.lateFeeType == null && "late fee", f.managementFeePct == null && "management fee"].filter(Boolean);
  return missing.length ? todo(`Set ${missing.join(", ")}`, missing.length) : complete("Rent, late fee and management fee saved");
}

function propertiesUnits({ properties, units }) {
  if (!properties.length) return todo("No properties yet — add one or import a list");
  if (!units.length) return todo(`${plural(properties.length, "property", "properties")}, no units yet`, properties.length);
  return complete(`${plural(properties.length, "property", "properties")}, ${plural(units.length, "unit")}`, properties.length);
}

function owners({ properties, propertyOwners, owners: ownerRows, today }) {
  if (!properties.length) return todo("Add properties first");
  const live = propertyOwners.filter((x) => liveShare(x, today));
  const byProperty = new Map();
  for (const r of live) byProperty.set(r.propertyId, (byProperty.get(r.propertyId) || 0) + Number(r.pct || 0));
  const under = properties.filter((p) => Math.abs((byProperty.get(p.id) || 0) - 100) > 0.01).length;
  const ownerIds = new Set(live.map((x) => x.ownerId));
  const noAgreement = ownerRows.filter((o) => ownerIds.has(o.id) && !filled(o.agreementStart)).length;
  if (under || noAgreement) {
    const parts = [under && `${plural(under, "property", "properties")} under 100%`, noAgreement && `${plural(noAgreement, "owner")} without an agreement start`];
    return todo(list(parts), under + noAgreement);
  }
  return complete(`${plural(ownerIds.size, "owner")} cover all ${plural(properties.length, "property", "properties")}`, ownerIds.size);
}

function tenantsLeases({ leases, rentAccounts }) {
  const active = leases.filter((l) => ACTIVE_LEASE.has(l.status));
  if (!active.length) return todo("No active leases yet");
  const billed = new Set(rentAccounts.map((r) => r.leaseId).filter(Boolean));
  const without = active.filter((l) => !billed.has(l.id)).length;
  return without ? todo(`${plural(without, "active lease")} without a rent account`, without) : complete(plural(active.length, "active lease"), active.length);
}

// Opening balances have no automatic signal until INTL-04; it is ticked by hand or skipped for a new portfolio.
function openingBalances() {
  return todo("Post opening balances and clear conversion clearing to $0");
}

function onlinePayments({ settings, stripe }) {
  if (!stripe.configured) return todo("Stripe is not configured");
  if (!stripe.webhookConfigured) return todo("Add the Stripe webhook secret");
  if (settings.online_payments?.enabled === false) return todo("Online payments are switched off");
  return complete(stripe.mode === "live" ? "Stripe live" : "Stripe test mode");
}

function portals({ settings, portalMembers }) {
  const b = settings.branding_portals || {};
  const live = portalMembers.filter((m) => m.status !== "disabled");
  const residents = live.filter((m) => m.role === "resident").length;
  const ownerInvites = live.filter((m) => m.role === "owner").length;
  const missing = [!filled(b.displayName) && "save branding", !residents && "invite residents", !ownerInvites && "invite owners"].filter(Boolean);
  return missing.length ? todo(`To do: ${missing.join(", ")}`, missing.length) : complete(`${plural(residents, "resident")} and ${plural(ownerInvites, "owner")} invited`, residents + ownerInvites);
}

function team({ teamMembers }) {
  const live = teamMembers.filter((m) => m.status !== "Disabled");
  if (!live.length) return todo("No teammates invited");
  const noRole = live.filter((m) => !filled(m.role)).length;
  return noRole ? todo(`${plural(noRole, "member")} without a role`, noRole) : complete(plural(live.length, "member"), live.length);
}

function notifications({ settings }) {
  const n = settings.notifications;
  if (!n || typeof n !== "object") return todo("Review and save your notification settings");
  if (n.enabled === false) return todo("Email notifications are off");
  return complete("Email notifications on");
}

function accountingExport({ settings }) {
  const i = settings.integrations || {};
  const hooks = Array.isArray(i.webhooks) ? i.webhooks.length : 0;
  if (i.quickbooks?.connected) return complete("QuickBooks connected");
  return hooks ? complete(plural(hooks, "webhook"), hooks) : todo("Connect your accounting tool or set up an export");
}

function goLive(data, ctx) {
  if (ctx.state.goLiveAt) return complete("Live");
  const open = ctx.results.filter((r) => r.required && !r.complete).length;
  return todo(open ? `${plural(open, "required step")} still open` : "Ready to go live", open);
}

// `needs` names the data sources a check reads; a failed load leaves them null and the step reads "unknown".
export const STEPS = [
  { id: "company_profile", title: "Company profile", why: "Your legal name, state and licence number print on leases, notices and statements.", screen: "Company Profile", helpSlug: "setup-company-profile", required: true, needs: ["settings"], check: companyProfile },
  { id: "bank_accounts", title: "Bank accounts", why: "Operating and trust accounts, each linked to the chart, keep owner and tenant money apart.", screen: "Bank Accounts", helpSlug: "setup-bank-accounts", required: true, needs: ["settings", "bankAccounts"], check: bankAccounts },
  { id: "deposit_account", title: "Security deposit account", why: "Many states require deposits in their own account; deposit payments are moved there from Bank Accounts → Deposits to transfer.", screen: "Bank Accounts", helpSlug: "setup-deposit-account", needs: ["settings", "bankAccounts"], check: depositAccount },
  { id: "fees_policies", title: "Fees & policies", why: "Rent due day, late fee and management fee drive charges and owner statements.", screen: "Fees & Policies", helpSlug: "setup-fees-policies", required: true, needs: ["settings"], check: feesPolicies },
  { id: "properties_units", title: "Properties & units", why: "Everything else hangs off your properties and units.", screen: "Properties", helpSlug: "setup-properties-units", required: true, needs: ["properties", "units"], check: propertiesUnits },
  { id: "owners", title: "Owners", why: "Each property needs owners totalling 100% and a management agreement start date.", screen: "Owners", helpSlug: "setup-owners", required: true, needs: ["properties", "propertyOwners", "owners"], check: owners },
  { id: "tenants_leases", title: "Tenants & leases", why: "Every active lease needs a rent account so rent is billed.", screen: "Leases", helpSlug: "setup-tenants-leases", required: true, needs: ["leases", "rentAccounts"], check: tenantsLeases },
  // INTL-04 repoints this to its Opening Balances screen and adds the automatic check.
  { id: "opening_balances", title: "Opening balances", why: "Bring in what you owe and are owed so the books start right.", screen: "Transactions", helpSlug: "setup-opening-balances", required: true, manual: true, skippable: false, check: openingBalances },
  { id: "online_payments", title: "Online payments", why: "Stripe lets residents pay rent by card or ACH.", screen: "Payment Processing", helpSlug: "setup-online-payments", needs: ["settings", "stripe"], check: onlinePayments },
  { id: "portals", title: "Portals", why: "Brand the resident and owner portals, then invite people in.", screen: "Branding & Portals", helpSlug: "setup-portals", needs: ["settings", "portalMembers"], check: portals },
  { id: "team", title: "Team & roles", why: "Invite your team and give each person the right role.", screen: "Team & Members", helpSlug: "setup-team", needs: ["teamMembers"], check: team },
  { id: "notifications", title: "Notifications", why: "Choose which emails go out and who gets alerts.", screen: "Notifications", helpSlug: "setup-notifications", needs: ["settings"], check: notifications },
  { id: "accounting_export", title: "Accounting export", why: "Connect QuickBooks or set up an export for your accountant.", screen: "Integrations", helpSlug: "setup-accounting-export", manual: true, needs: ["settings"], check: accountingExport },
  // Go-live is confirmed on the Setup & Go-live screen (INTL-06 adds the readiness check).
  { id: "go_live", title: "Go-live check", why: "Confirm everything above, then switch the project to live.", screen: "Setup & Go-live", helpSlug: "setup-go-live", required: true, skippable: false, check: goLive },
];

export const STEP_IDS = STEPS.map((s) => s.id);

// Steps shown for a project: a step tagged `module` hides when that optional vertical is off.
export const visibleSteps = (modules) => STEPS.filter((s) => !s.module || isModuleOn(modules, s.module));

const isoDay = (d) => d.toISOString().slice(0, 10);

// Run every visible step over loaded `data` ({ settings, bankAccounts, ... } with null for a failed read) and the saved `state`.
export function evaluateSteps(data, state, { modules = data?.settings?.modules, today = isoDay(new Date()) } = {}) {
  const src = { ...data, settings: data?.settings || {}, today };
  const results = [];
  for (const step of visibleSteps(modules)) {
    const failed = (step.needs || []).some((k) => (k === "settings" ? !data?.settings : src[k] == null));
    let auto = { done: false, detail: "Couldn't load — try again", count: 0 };
    let broken = failed;
    if (!failed) {
      // One bad check must not take the screen down.
      try {
        auto = step.check(src, { state, results });
      } catch (e) {
        console.error(`[onboarding.${step.id}]`, e?.message || e);
        broken = true;
      }
    }
    const ticked = Boolean(state.manualDone?.[step.id]);
    const skippedBy = state.skipped?.[step.id];
    const newPortfolio = step.id === "opening_balances" && Boolean(state.newPortfolio);
    let status = "todo";
    if (auto.done || ticked) status = "done";
    else if (skippedBy !== undefined || newPortfolio) status = "skipped";
    else if (broken) status = "unknown";
    let detail = auto.detail;
    if (status === "skipped") detail = skippedBy ? `Skipped: ${skippedBy}` : newPortfolio ? "New portfolio — nothing to bring over" : "Skipped";
    else if (status === "done" && !auto.done) detail = "Marked done by hand";
    results.push({
      id: step.id,
      title: step.title,
      why: step.why,
      screen: step.screen,
      helpSlug: step.helpSlug,
      required: Boolean(step.required),
      manual: Boolean(step.manual),
      skippable: step.skippable ?? !step.required,
      status,
      detail,
      count: auto.count || 0,
      auto: Boolean(auto.done),
      complete: status === "done" || status === "skipped",
    });
  }
  return results;
}

// { done, total, percent, next } where done counts finished and skipped steps and next lists the first open ones.
export function progressOf(results, nextCount = 3) {
  const total = results.length;
  const done = results.filter((r) => r.complete).length;
  return { done, total, percent: total ? Math.round((done / total) * 100) : 0, next: results.filter((r) => !r.complete).slice(0, nextCount) };
}
