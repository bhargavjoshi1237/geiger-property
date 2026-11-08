"use client";

import { callApi } from "@/lib/messaging/api";

// Browser calls for the leasing server routes; never throw — { ok:false, error } on failure.

// Generate the lease PDF (LEAS-08) → { ok, document, unknown, empty, pages, warnings }.
export const generateLeasePdfApi = (leaseId, { templateId, includeAddenda = true } = {}) =>
  callApi(`/api/leases/${leaseId}/document`, { body: { templateId, includeAddenda } });
