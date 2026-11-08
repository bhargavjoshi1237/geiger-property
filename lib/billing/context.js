import "server-only";
import { effectivePolicies } from "@/lib/policies";
import { loadAccountIndex } from "@/lib/ledger/store";
import { forProject } from "@/lib/supabase/scope";
import { DEFAULT_TIME_ZONE, businessDate } from "./periods";
import { BILLING_SETTINGS_KEY, normalizeBillingSettings } from "./settings";

// Server-only per-run billing context: cached accounts, settings, properties and policies, the business date in the company time zone, and the CORE-40 open-period seam.

async function readSetting(admin, projectId, key) {
  const { data, error } = await forProject(admin.from("settings").select("id, value, deleted_at").eq("key", key), projectId).limit(1);
  if (error) throw new Error(`settings ${key}: ${error.message}`);
  return data?.[0] || null;
}

// opts.settings overrides billing_settings in memory for this run only (tests and support tools; never written back).
export function makeBillingContext(admin, { now = new Date(), settings: override = null } = {}) {
  const accounts = new Map();
  const settingRows = new Map();
  const properties = new Map();
  const memo = (map, key, load) => {
    if (!map.has(key)) map.set(key, load());
    return map.get(key);
  };
  const setting = (projectId, key) => memo(settingRows, `${projectId || ""}|${key}`, () => readSetting(admin, projectId, key));

  const ctx = {
    admin,
    now,
    accounts: (projectId) => memo(accounts, projectId || "", () => loadAccountIndex(admin, projectId || null)),
    async company(projectId) {
      const row = await setting(projectId, "fees_policies");
      return row && !row.deleted_at ? row.value || {} : {};
    },
    async timeZone(projectId) {
      const row = await setting(projectId, "company_profile");
      return (row && !row.deleted_at && row.value?.timezone) || DEFAULT_TIME_ZONE;
    },
    async today(projectId) {
      return businessDate(now, await ctx.timeZone(projectId));
    },
    async settings(projectId) {
      const row = await setting(projectId, BILLING_SETTINGS_KEY);
      return normalizeBillingSettings({ ...(row && !row.deleted_at ? row.value : {}), ...(override || {}) });
    },
    // Go-live guard: the first billing action records billingStartsOn as today, so rent already due (billed in the old system) isn't billed again.
    async goLiveSettings(projectId) {
      const current = await ctx.settings(projectId);
      if (current.billingStartsOn) return current;
      const today = await ctx.today(projectId);
      const row = await setting(projectId, BILLING_SETTINGS_KEY);
      const value = { ...(row && !row.deleted_at ? row.value || {} : {}), billingStartsOn: today };
      const { error } = row
        ? await admin.from("settings").update({ value, deleted_at: null }).eq("id", row.id)
        : await admin.from("settings").insert({ project_id: projectId || null, key: BILLING_SETTINGS_KEY, value });
      // A concurrent first run inserted the row (settings_project_key_uidx): use what it wrote.
      if (error && error.code !== "23505") throw new Error(`billing_settings: ${error.message}`);
      settingRows.delete(`${projectId || ""}|${BILLING_SETTINGS_KEY}`);
      const saved = await ctx.settings(projectId);
      return saved.billingStartsOn ? saved : { ...saved, billingStartsOn: today };
    },
    async loadProperties(ids) {
      const want = [...new Set((ids || []).filter((id) => id && !properties.has(id)))];
      for (let i = 0; i < want.length; i += 150) {
        const { data, error } = await admin.from("properties").select("id, name, metadata").in("id", want.slice(i, i + 150));
        if (error) throw new Error(`properties: ${error.message}`);
        for (const p of data || []) properties.set(p.id, p);
      }
      for (const id of want) if (!properties.has(id)) properties.set(id, null);
    },
    async property(propertyId) {
      if (!propertyId) return null;
      if (!properties.has(propertyId)) await ctx.loadProperties([propertyId]);
      return properties.get(propertyId);
    },
    // Effective policies for a lease row (company → property → lease overrides).
    async policies(lease) {
      const projectId = lease.project_id ?? lease.projectId ?? null;
      const property = await ctx.property(lease.property_id ?? lease.propertyId);
      return effectivePolicies({ company: await ctx.company(projectId), property, lease });
    },
    // Period close (CORE-40) narrows this; every period is open until then.
    isPeriodOpen: async () => true,
  };
  return ctx;
}
