import { adminClient } from "@/lib/supabase/admin";

import { sendSuiteEmail } from "./client";
import {
  NOTIFICATIONS_SETTING_KEY,
  getNotification,
  isNotificationAllowed,
  resolveNotificationConfig,
} from "./catalog";

// Server-only: send a catalog notification through geiger-dash, honoring the
// project's toggles (settings key `notifications`, read with the service role).
// Never throws — returns { ok, skipped?, error? } like sendSuiteEmail.

const CACHE_TTL_MS = 30_000;
const cache = new Map();

export async function getNotificationConfig(projectId, db) {
  const cacheKey = projectId || "none";
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.config;

  const sb = db || adminClient();
  if (!sb) return resolveNotificationConfig(null);

  try {
    let q = sb
      .from("settings")
      .select("value")
      .eq("key", NOTIFICATIONS_SETTING_KEY)
      .is("deleted_at", null);
    q = projectId ? q.eq("project_id", projectId) : q.is("project_id", null);
    const { data, error } = await q.limit(1);
    if (error) {
      console.error("[email.notifications] read failed:", error.message);
      return resolveNotificationConfig(null);
    }
    const config = resolveNotificationConfig(data?.[0]?.value);
    cache.set(cacheKey, { at: Date.now(), config });
    return config;
  } catch (e) {
    console.error("[email.notifications] read failed:", e);
    return resolveNotificationConfig(null);
  }
}

export async function isNotificationEnabled(projectId, notification, db) {
  const config = await getNotificationConfig(projectId, db);
  return isNotificationAllowed(config, notification);
}

export async function sendNotificationEmail({
  projectId,
  notification,
  template,
  to,
  data = {},
  subject,
  db,
} = {}) {
  if (notification && !(await isNotificationEnabled(projectId, notification, db))) {
    return { ok: false, skipped: true, error: "disabled" };
  }
  const resolved = template || getNotification(notification)?.template;
  if (!resolved) return { ok: false, error: "unknown_notification" };
  return sendSuiteEmail({ template: resolved, to, data, subject });
}

export const isEmailConfigured = () => Boolean(process.env.GEIGER_EMAIL_API_KEY);
