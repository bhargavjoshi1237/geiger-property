"use client";

import { callApi } from "@/lib/messaging/api";

// Browser calls for the bill routes; never throw — { ok:false, error } on failure.
export const createBillApi = (input) => callApi("/api/accounting/bills", { body: input });
export const approveBillApi = (id, note = "") => callApi(`/api/accounting/bills/${id}/approve`, { body: { note } });
export const postBillApi = (id) => callApi(`/api/accounting/bills/${id}/post`, { body: {} });
export const openBillApi = (id) => callApi(`/api/accounting/bills/${id}/open`, { body: {} });
