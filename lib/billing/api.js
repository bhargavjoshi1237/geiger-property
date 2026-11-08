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
export const saveConcessionApi = (leaseId, concession, concessionId) =>
  callApi(`/api/billing/leases/${leaseId}/concessions`, { body: { action: concessionId ? "update" : "create", concession, concessionId } });
export const removeConcessionApi = (leaseId, concessionId) => callApi(`/api/billing/leases/${leaseId}/concessions`, { body: { action: "remove", concessionId } });
export const copyListingSpecialsApi = (leaseId, listingId) => callApi(`/api/billing/leases/${leaseId}/concessions`, { body: { action: "copy_specials", listingId } });
export const concessionPreviewApi = (leaseId) => callApi(`/api/billing/leases/${leaseId}/concessions/preview`, { method: "GET" });

// Security deposits on the ledger (CORE-04).
export const depositStatusApi = (id) => callApi(`/api/billing/deposits/${id}`, { method: "GET" });
export const chargeDepositApi = (id, { date } = {}) => callApi(`/api/billing/deposits/${id}/charge`, { body: { date } });
export const recordDepositReceivedApi = (id, { bankAccountId, date } = {}) => callApi(`/api/billing/deposits/${id}/received`, { body: { bankAccountId, date } });
export const sweepDepositApi = (id, paymentEntryId) => callApi(`/api/billing/deposits/${id}/sweep`, { body: { paymentEntryId } });
export const disposeDepositApi = (id, { commit = false, deductions, version, date } = {}) =>
  callApi(`/api/billing/deposits/${id}/dispose`, { body: { commit, deductions, version, date } });
export const pendingSweepsApi = () => callApi("/api/billing/deposits/sweeps", { method: "GET" });

// Move-out close-out (CORE-02).
export const previewCloseOutApi = (leaseId, through) =>
  callApi(`/api/billing/leases/${leaseId}/preview?through=${encodeURIComponent(through || "")}`, { method: "GET" });
export const closeOutLeaseApi = (leaseId, through) => callApi(`/api/billing/leases/${leaseId}/close-out`, { body: { through } });

// Late fees for one lease (CORE-06): preview by rent month, or assess and post what's due.
export const lateFeePreviewApi = (leaseId) => callApi(`/api/billing/leases/${leaseId}/late-fee`, { method: "GET" });
export const assessLateFeeApi = (leaseId) => callApi(`/api/billing/leases/${leaseId}/late-fee`, { body: {} });

// Office payments and receipts (CORE-11): record through the server, the receipt page as { html }, and email it again.
export const recordPaymentApi = (payment) => callApi("/api/billing/payments", { body: payment });
export const receiptHtmlApi = (entryId) => callApi(`/api/billing/receipts/${entryId}?format=json`, { method: "GET" });
export const resendReceiptApi = (entryId, { to } = {}) => callApi(`/api/billing/receipts/${entryId}/send`, { body: { to } });

// Resident statements (CORE-12): one lease's page as { html, statement }, send (or dry-run) a batch, a print batch, and the statements setting.
export const statementApi = (leaseId, period) => callApi(`/api/billing/statements/${leaseId}?format=json&period=${encodeURIComponent(period || "")}`, { method: "GET" });
export const sendStatementsApi = ({ leaseIds, view, period, dryRun = false, resend = false }) => callApi("/api/billing/statements/send", { body: { leaseIds, view, period, dryRun, resend } });
export const printStatementsApi = (leaseIds, period) => callApi("/api/billing/statements/print", { body: { leaseIds, period } });
export const statementSettingsApi = () => callApi("/api/billing/statements/settings", { method: "GET" });
export const saveStatementSettingsApi = (statements) => callApi("/api/billing/statements/settings", { method: "PATCH", body: { statements } });
