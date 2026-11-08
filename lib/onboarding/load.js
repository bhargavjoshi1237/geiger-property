import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/supabase/components/property-client";
import { scopeQuery } from "@/lib/supabase/scope";
import { getPaymentsStatus } from "@/lib/payments/api";
import { ONBOARDING_SETTING_KEY } from "./steps";

// Browser loader for the checklist: one scoped read per source (null when a read fails, so its steps read "unknown").

const SETTING_KEYS = ["company_profile", "fees_policies", "branding_portals", "integrations", "accounting_export", "notifications", "online_payments", "modules"];
const PAGE = 1000;

// Every row of a scoped, soft-delete-filtered select, paged past the 1000-row cap.
async function rows(sb, table, columns) {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await scopeQuery(sb.from(table).select(columns)).is("deleted_at", null).order("id").range(from, from + PAGE - 1);
    if (error) {
      console.error(`[onboarding.${table}]`, error.message);
      return null;
    }
    out.push(...(data || []));
    if (!data || data.length < PAGE) return out;
  }
}

// Rows mapped through `map`, keeping null on a failed read.
const mapped = async (sb, table, columns, map) => (await rows(sb, table, columns))?.map(map) ?? null;

// The active project's settings by key; null when the read failed.
async function settings(sb, keys) {
  const { data, error } = await scopeQuery(sb.from("settings").select("key, value").in("key", keys).is("deleted_at", null));
  if (error) {
    console.error("[onboarding.settings]", error.message);
    return null;
  }
  return Object.fromEntries((data || []).map((r) => [r.key, r.value]));
}

// The saved checklist state, or null when the read failed ({} when never saved).
export async function loadOnboardingSetting() {
  if (!isSupabaseConfigured()) return null;
  const s = await settings(createClient(), [ONBOARDING_SETTING_KEY]);
  return s ? s[ONBOARDING_SETTING_KEY] || {} : null;
}

// Everything the step checks read, in the shape lib/onboarding/steps.js expects.
export async function loadOnboardingData() {
  if (!isSupabaseConfigured()) return null;
  const sb = createClient();
  const [stored, bankAccounts, properties, units, propertyOwners, owners, leases, rentAccounts, teamMembers, portalMembers, conversionBatches, status] = await Promise.all([
    settings(sb, SETTING_KEYS),
    mapped(sb, "bank_accounts", "id, account_type, status, gl_account_id", (r) => ({ id: r.id, accountType: r.account_type, status: r.status, glAccountId: r.gl_account_id })),
    mapped(sb, "properties", "id, status", (r) => ({ id: r.id, status: r.status })),
    mapped(sb, "units", "id", (r) => ({ id: r.id })),
    mapped(sb, "property_owners", "id, owner_id, property_id, ownership_pct, ends_on", (r) => ({ ownerId: r.owner_id, propertyId: r.property_id, pct: Number(r.ownership_pct ?? 0), endsOn: r.ends_on })),
    mapped(sb, "owners", "id, metadata", (r) => ({ id: r.id, agreementStart: r.metadata?.agreementStart ?? "" })),
    mapped(sb, "leases", "id, status", (r) => ({ id: r.id, status: r.status })),
    mapped(sb, "rent_accounts", "id, lease_id", (r) => ({ leaseId: r.lease_id })),
    mapped(sb, "team_members", "id, role, status", (r) => ({ role: r.role, status: r.status })),
    mapped(sb, "portal_members", "id, role, status", (r) => ({ role: r.role, status: r.status })),
    mapped(sb, "conversion_batches", "id, status, cutover_date, totals", (r) => ({ id: r.id, status: r.status, cutoverDate: r.cutover_date, totals: r.totals || {} })),
    getPaymentsStatus(),
  ]);
  return {
    settings: stored,
    bankAccounts,
    properties,
    units,
    propertyOwners,
    owners,
    leases,
    rentAccounts,
    teamMembers,
    portalMembers,
    conversionBatches,
    stripe: status?.ok ? status.stripe : null,
  };
}
