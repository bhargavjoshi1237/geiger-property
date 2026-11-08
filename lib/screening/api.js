"use client";

import { callApi } from "@/lib/messaging/api";

// Browser calls for the /api/screening routes (RISK-03); never throw — { ok:false, error, status } on failure.
export const screeningReportApi = (applicationId) =>
  callApi(`/api/screening/applications/${encodeURIComponent(applicationId)}/report`, { method: "GET" });
// Location rules in force at a property (RISK-05) → { ok, property, jurisdiction, rules, effects, fields, ignored, asOf }.
export const screeningRulesApi = (propertyId) =>
  callApi(`/api/screening/rules${propertyId ? `?propertyId=${encodeURIComponent(propertyId)}` : ""}`, { method: "GET" });
