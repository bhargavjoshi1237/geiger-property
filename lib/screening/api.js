"use client";

import { callApi } from "@/lib/messaging/api";

// Browser calls for the /api/screening routes (RISK-03); never throw — { ok:false, error, status } on failure.
export const screeningReportApi = (applicationId) =>
  callApi(`/api/screening/applications/${encodeURIComponent(applicationId)}/report`, { method: "GET" });
