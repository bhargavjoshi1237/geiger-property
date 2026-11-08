"use client";

import { callApi } from "@/lib/messaging/api";

// Browser calls for journal imports and reversals (CORE-46); never throw — { ok:false, error } on failure.
export const previewJournalImportApi = (body) => callApi("/api/accounting/journal-imports", { body });
export const postJournalImportApi = (importId) => callApi(`/api/accounting/journal-imports/${importId}/post`, { body: {} });
export const reverseEntryApi = (entryId, { date, memo } = {}) => callApi(`/api/accounting/journal/${entryId}/reverse`, { body: { date, memo } });
