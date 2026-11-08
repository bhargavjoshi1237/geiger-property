"use client";

import { callApi } from "@/lib/messaging/api";

// Browser calls for the opening-balance routes (INTL-04); never throw — { ok:false, error } on failure.
export const postConversionBatchApi = (batchId) => callApi(`/api/accounting/conversion/${batchId}/post`, { body: {} });
export const voidConversionBatchApi = (batchId) => callApi(`/api/accounting/conversion/${batchId}/void`, { body: {} });
