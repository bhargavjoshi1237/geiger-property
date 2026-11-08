"use client";

import { callApi } from "@/lib/messaging/api";

// Browser calls for the /api/import routes (PLAT-03); never throw — { ok:false, error } on failure.
export const createImportJobApi = (job) => callApi("/api/import/jobs", { body: job });
export const stageImportRowsApi = (jobId, rows) => callApi(`/api/import/jobs/${jobId}/rows`, { body: { action: "stage", rows } });
export const validateImportApi = (jobId, { mapping, options } = {}) => callApi(`/api/import/jobs/${jobId}/rows`, { body: { action: "validate", mapping, options } });
export const commitImportChunkApi = (jobId) => callApi(`/api/import/jobs/${jobId}/rows`, { body: { action: "commit" } });
export const rollbackImportApi = (jobId) => callApi(`/api/import/jobs/${jobId}/rollback`, { body: {} });
export const saveImportMappingApi = (mapping) => callApi("/api/import/mappings", { body: { action: "save", ...mapping } });
export const removeImportMappingApi = (id) => callApi("/api/import/mappings", { body: { action: "remove", id } });
