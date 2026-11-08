import { isoDate } from "./periods";

// Project billing settings (key `billing_settings`): billingStartsOn stops back-billing at go-live, jobsPaused pauses the billing job, useUndepositedFunds holds paper payments in 1050 until a bank deposit (CORE-16); pure.

export const BILLING_SETTINGS_KEY = "billing_settings";

export const BILLING_DEFAULTS = Object.freeze({ autoBillRent: true, billingStartsOn: "", rentPostLeadDays: 0, jobsPaused: false, useUndepositedFunds: true });

// Office check / cash / money order payments land in 1050 Undeposited Funds unless the project turned it off.
export const usesUndepositedFunds = (value) => value?.useUndepositedFunds !== false && value?.useUndepositedFunds !== "false";

export function normalizeBillingSettings(value) {
  const v = value && typeof value === "object" ? value : {};
  return {
    ...v,
    autoBillRent: v.autoBillRent !== false,
    billingStartsOn: isoDate(v.billingStartsOn),
    rentPostLeadDays: Math.max(0, Math.min(28, Math.trunc(Number(v.rentPostLeadDays) || 0))),
    jobsPaused: Boolean(v.jobsPaused),
    useUndepositedFunds: usesUndepositedFunds(v),
  };
}
