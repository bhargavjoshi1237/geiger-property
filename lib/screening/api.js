"use client";

import { accessToken, callApi } from "@/lib/messaging/api";
import { getActiveProjectId } from "@/lib/supabase/scope";
import { isSandbox } from "@/lib/sandbox/sandbox_mode";

// Browser calls for the /api/screening routes (RISK-03, RISK-02, RISK-05); never throw — { ok:false, error, status } on failure.
const BASE = process.env.NEXT_PUBLIC_BASE_PATH || "";
const app = (id) => `/api/screening/applications/${encodeURIComponent(id)}`;

export const screeningReportApi = (applicationId) => callApi(`${app(applicationId)}/report`, { method: "GET" });

// Protected detail: scope "identity" (date of birth, ID, disclosures) or "report" (reference, findings); each read is access-logged.
export const screeningDetailApi = (applicationId, scope) => callApi(`${app(applicationId)}/detail?scope=${encodeURIComponent(scope)}`, { method: "GET" });

export const saveScreeningDetailApi = (applicationId, partyRef, patch) => callApi(`${app(applicationId)}/detail`, { method: "PATCH", body: { partyRef, patch } });

// A 5-minute signed URL for an application document ({ bucket, storagePath }); action view | download | print.
export const openScreeningFileApi = (doc, action = "view") =>
  callApi(`/api/screening/files?bucket=${encodeURIComponent(doc.bucket || "")}&path=${encodeURIComponent(doc.storagePath || "")}&action=${action}`, { method: "GET" });

// Upload one file to an application's private screening files → { ok, document }.
export async function uploadScreeningFileApi(applicationId, file) {
  if (isSandbox()) return { ok: false, error: "Uploading screening files isn't available in the playground." };
  const form = new FormData();
  form.set("projectId", getActiveProjectId() || "");
  form.set("applicationId", applicationId);
  form.set("file", file);
  const token = await accessToken();
  try {
    const res = await fetch(new URL(`${BASE}/api/screening/files`, window.location.origin), {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: "same-origin",
      body: form,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ...json, ok: false, error: json?.error || `Request failed (${res.status})`, status: res.status };
    return { ok: true, ...json };
  } catch (e) {
    console.error("[screening.upload]", e);
    return { ok: false, error: "Couldn't reach the server." };
  }
}

// Location rules in force at a property (RISK-05) → { ok, property, jurisdiction, rules, effects, fields, ignored, asOf }.
export const screeningRulesApi = (propertyId) =>
  callApi(`/api/screening/rules${propertyId ? `?propertyId=${encodeURIComponent(propertyId)}` : ""}`, { method: "GET" });
