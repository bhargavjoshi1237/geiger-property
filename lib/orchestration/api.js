"use client";

import { callApi } from "@/lib/messaging/api";

// Browser calls for the orchestration routes; never throw — { ok:false, error } on failure.
export const reviewAction = (id, action, input = {}) => callApi("/api/orchestration/review", { body: { id, action, input } });
export const reviewBulkAction = (ids, action, input = {}) => callApi("/api/orchestration/review", { body: { ids, action, input } });
export const previewLaunch = (payload) => callApi("/api/orchestration/launch", { body: { ...payload, mode: "preview" } });
export const runLaunch = (payload) => callApi("/api/orchestration/launch", { body: { ...payload, mode: "run" } });
export const attachmentUrl = (path) => callApi("/api/orchestration/attachments", { body: { path } });
