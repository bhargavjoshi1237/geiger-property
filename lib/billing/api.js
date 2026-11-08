"use client";

import { callApi } from "@/lib/messaging/api";

// Browser calls for the /api/billing routes (CORE-01); never throw — { ok:false, error } on failure.
export const activateLeaseBilling = (leaseId, { billDeposits = true } = {}) => callApi(`/api/billing/leases/${leaseId}/activate`, { body: { billDeposits } });
export const createRentStepApi = (leaseId, step) => callApi(`/api/billing/leases/${leaseId}/rent-steps`, { body: { action: "create", step } });
export const cancelRentStepApi = (leaseId, stepId) => callApi(`/api/billing/leases/${leaseId}/rent-steps`, { body: { action: "cancel", stepId } });
export const billLeaseNowApi = (leaseId) => callApi(`/api/billing/leases/${leaseId}/bill`, { body: {} });
export const acceptRenewalApi = (renewalId, { transferCharges = true, transferDeposits = true } = {}) =>
  callApi(`/api/billing/renewals/${renewalId}/accept`, { body: { transferCharges, transferDeposits } });
export const postNextChargeApi = (chargeId) => callApi(`/api/billing/charges/${chargeId}/post-next`, { body: {} });

// Security deposits on the ledger (CORE-04).
export const depositStatusApi = (id) => callApi(`/api/billing/deposits/${id}`, { method: "GET" });
export const chargeDepositApi = (id, { date } = {}) => callApi(`/api/billing/deposits/${id}/charge`, { body: { date } });
export const recordDepositReceivedApi = (id, { bankAccountId, date } = {}) => callApi(`/api/billing/deposits/${id}/received`, { body: { bankAccountId, date } });
export const sweepDepositApi = (id, paymentEntryId) => callApi(`/api/billing/deposits/${id}/sweep`, { body: { paymentEntryId } });
export const disposeDepositApi = (id, { commit = false, deductions, version, date } = {}) =>
  callApi(`/api/billing/deposits/${id}/dispose`, { body: { commit, deductions, version, date } });
export const pendingSweepsApi = () => callApi("/api/billing/deposits/sweeps", { method: "GET" });
