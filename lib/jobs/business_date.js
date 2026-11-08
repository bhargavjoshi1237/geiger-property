import { getProjectSetting } from "@/lib/messaging/context";
import { DEFAULT_TIME_ZONE, businessDate } from "@/lib/billing/periods";
import { BILLING_SETTINGS_KEY, normalizeBillingSettings } from "@/lib/billing/settings";

// Server-only project clock for scheduled jobs (CORE-10): the company time zone (Settings → Company profile), the business date in it, and the jobs pause switch.

export async function projectTimeZone(admin, projectId) {
  const profile = await getProjectSetting(admin, projectId, "company_profile");
  return profile?.timezone || DEFAULT_TIME_ZONE;
}

export const projectToday = async (admin, projectId, now = new Date()) => businessDate(now, await projectTimeZone(admin, projectId));

// Per-run cache of each project's business date, for jobs that walk rows from several projects (no project: the UTC date).
export function businessDates(admin, now = new Date()) {
  const cache = new Map();
  return (projectId) => {
    const key = projectId || "";
    if (!cache.has(key)) cache.set(key, projectId ? projectToday(admin, projectId, now) : Promise.resolve(businessDate(now, "UTC")));
    return cache.get(key);
  };
}

// billing_settings.jobsPaused: scheduled jobs skip the project (the demo stays paused when crons go live).
export async function jobsPausedFor(admin, projectId) {
  return normalizeBillingSettings(await getProjectSetting(admin, projectId, BILLING_SETTINGS_KEY)).jobsPaused;
}

// The paused projects among `ids`, in one read.
export async function pausedProjects(admin, ids) {
  const out = new Set();
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await admin.from("settings").select("project_id, value").eq("key", BILLING_SETTINGS_KEY).in("project_id", ids.slice(i, i + 150)).is("deleted_at", null);
    if (error) throw new Error(`billing_settings: ${error.message}`);
    for (const r of data || []) if (normalizeBillingSettings(r.value).jobsPaused) out.add(r.project_id);
  }
  return out;
}
