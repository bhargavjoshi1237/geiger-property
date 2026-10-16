"use client";

import { createClient } from "@/lib/supabase/client";
import { getActiveProjectId } from "@/lib/supabase/project_scope";
import { isSandbox } from "@/lib/sandbox/sandbox_mode";

// Browser helper for this area's server routes (/api/messages/*, /api/cron/*).
// Adds the basePath, the active project id and the session token; never throws —
// resolves { ok:false, error } so screens decide the toast.

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || "";

async function accessToken() {
  try {
    const { data } = await createClient().auth.getSession();
    return data?.session?.access_token || null;
  } catch {
    return null;
  }
}

export async function callApi(path, { method = "POST", body } = {}) {
  if (isSandbox()) return { ok: false, error: "Sending isn't available in the playground." };
  const projectId = getActiveProjectId();
  const token = await accessToken();
  const url = new URL(`${BASE}${path}`, window.location.origin);
  if (method === "GET" && projectId) url.searchParams.set("projectId", projectId);
  try {
    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      credentials: "same-origin",
      ...(method === "GET" ? {} : { body: JSON.stringify({ projectId, ...(body || {}) }) }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: json?.error || `Request failed (${res.status})`, status: res.status };
    return { ok: true, ...json };
  } catch (e) {
    console.error("[messaging.api]", e);
    return { ok: false, error: "Couldn't reach the server." };
  }
}

export const sendMessage = (body) => callApi("/api/messages/send", { body });
export const sendAnnouncementNow = (announcementId) => callApi("/api/messages/announce", { body: { announcementId } });
export const getDeliveryStatus = () => callApi("/api/messages/status", { method: "GET" });
export const listScheduledJobs = () => callApi("/api/cron/jobs", { method: "GET" });
export const runJobNow = (key) => callApi(`/api/cron/${encodeURIComponent(key)}`);
export const runDueJobsNow = () => callApi("/api/cron/run-due");

// Human label for a delivery status.
export const DELIVERY_LABEL = {
  sent: "Sent",
  failed: "Failed",
  not_sent: "Not sent",
  skipped: "Skipped",
  logged: "Logged",
  received: "Received",
};
