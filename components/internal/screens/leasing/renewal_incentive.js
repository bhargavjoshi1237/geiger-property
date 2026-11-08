import { POSTING_TYPES, concessionSummary } from "@/lib/billing/concessions";
import { CONCESSION_TYPE_OPTIONS } from "./shared";

// Structured renewal incentive (CORE-05): a concession type, amount and months that become a concession on the renewed lease when the renewal is accepted.

export const INCENTIVE_TYPE_OPTIONS = [{ value: "none", label: "None" }, ...CONCESSION_TYPE_OPTIONS.filter((o) => POSTING_TYPES.includes(o.value))];

const typeOf = (v) => v?.metadata?.concessionType ?? v?.concessionType ?? "";
const is = (...types) => (v) => types.includes(typeOf(v));

// Incentive fields for the offer wizard (flat values) or the renewal editor (meta: true, saved to metadata).
export function renewalIncentiveFields({ meta = false } = {}) {
  const m = meta ? { meta: true } : {};
  const required = !meta;
  return [
    { key: "concessionType", label: "Incentive", type: "select", options: INCENTIVE_TYPE_OPTIONS, hint: "Credits the new lease's rent once the renewal is accepted.", ...m },
    { key: "concessionAmount", label: "Amount off each month", type: "currency", required, showIf: is("amount_off"), ...m },
    { key: "concessionAmount", label: "Percent off", type: "percent", required, showIf: is("percent_off"), ...m },
    { key: "concessionAmount", label: "Credit amount", type: "currency", required, showIf: is("one_time"), ...m },
    { key: "concessionMonths", label: "Free months", type: "number", min: 0, required, showIf: is("free_month"), ...m },
    { key: "concessionMonths", label: "For how many months", type: "number", min: 0, showIf: is("amount_off", "percent_off"), hint: "Blank = the whole new term.", ...m },
    { key: "concession", label: "Incentive note", type: "text", full: true, placeholder: "e.g. Free carpet cleaning", hint: "Shown on the offer letter.", ...m },
  ];
}

// The incentive as offer-letter text, e.g. "1 month free — Free carpet cleaning".
export function renewalIncentiveText(meta = {}) {
  const type = meta.concessionType;
  const terms = POSTING_TYPES.includes(type) ? concessionSummary({ id: "", amount: meta.concessionAmount, metadata: { concessionType: type, months: meta.concessionMonths } }) : "";
  return [terms, String(meta.concession || "").trim()].filter(Boolean).join(" — ");
}
