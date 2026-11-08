import { isoDate } from "./periods";

// Project billing settings (key `billing_settings`): billingStartsOn stops back-billing at go-live, jobsPaused pauses the billing job; pure.

export const BILLING_SETTINGS_KEY = "billing_settings";

export const BILLING_DEFAULTS = Object.freeze({ autoBillRent: true, billingStartsOn: "", rentPostLeadDays: 0, jobsPaused: false });

export function normalizeBillingSettings(value) {
  const v = value && typeof value === "object" ? value : {};
  return {
    ...v,
    autoBillRent: v.autoBillRent !== false,
    billingStartsOn: isoDate(v.billingStartsOn),
    rentPostLeadDays: Math.max(0, Math.min(28, Math.trunc(Number(v.rentPostLeadDays) || 0))),
    jobsPaused: Boolean(v.jobsPaused),
  };
}
