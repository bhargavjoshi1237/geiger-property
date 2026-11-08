"use client";

import { callApi } from "@/lib/messaging/api";

// Browser calls for the /api/billing routes (CORE-01); never throw — { ok:false, error } on failure.
export const activateLeaseBilling = (leaseId) => callApi(`/api/billing/leases/${leaseId}/activate`, { body: {} });
export const createRentStepApi = (leaseId, step) => callApi(`/api/billing/leases/${leaseId}/rent-steps`, { body: { action: "create", step } });
export const cancelRentStepApi = (leaseId, stepId) => callApi(`/api/billing/leases/${leaseId}/rent-steps`, { body: { action: "cancel", stepId } });
export const billLeaseNowApi = (leaseId) => callApi(`/api/billing/leases/${leaseId}/bill`, { body: {} });
export const acceptRenewalApi = (renewalId, { transferCharges = true, transferDeposits = true } = {}) =>
  callApi(`/api/billing/renewals/${renewalId}/accept`, { body: { transferCharges, transferDeposits } });
export const postNextChargeApi = (chargeId) => callApi(`/api/billing/charges/${chargeId}/post-next`, { body: {} });
export const previewCloseOutApi = (leaseId, through) =>
  callApi(`/api/billing/leases/${leaseId}/preview?through=${encodeURIComponent(through || "")}`, { method: "GET" });
export const closeOutLeaseApi = (leaseId, through) => callApi(`/api/billing/leases/${leaseId}/close-out`, { body: { through } });
