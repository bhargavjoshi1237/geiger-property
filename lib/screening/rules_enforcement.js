import { formatEffect } from "./rules_schema";

// Where merged screening rules (RISK-05) meet the app: applicant questions to hide, the checks a screening package may hold,
// criteria and fee warnings. Inputs are mergeEffects() output; enforcement is advisory (warn) unless a deciding rule says block.
// Seams: RISK-06 reads packageChecks/criteriaWarnings, RISK-07 noticeRequirements, RISK-08/13 packageChecks, RISK-10 feeWarnings.

// Applicant-form fields asked before a conditional offer, by the history they ask about (LEAS online forms reuse the keys).
export const PRE_OFFER_FIELDS = Object.freeze({ criminal: ["felonyDisclosed"], eviction: ["evictedBefore"] });

// Screening checks (marketing/shared.js SCREENING_CHECKS keys) and the effect that governs each.
const CHECK_TOPIC = { background: "criminal", eviction: "eviction" };

const fieldOf = (merged, path) => merged?.fields?.[path] || null;
const valueOf = (merged, path) => fieldOf(merged, path)?.value;
const deciders = (merged, path) => (fieldOf(merged, path)?.sources || []).filter((s) => s.wins);
// A two-step rule: criminal history only once the applicant otherwise qualifies or has a conditional offer (RISK-13).
const twoStep = (merged) => ["after_prequalification", "after_conditional_offer"].includes(valueOf(merged, "criminal.timing"));
const blocks = (merged, path) => deciders(merged, path).some((s) => s.enforcement === "block");
const cite = (merged, path) => deciders(merged, path).map((s) => s.citation || s.title).filter(Boolean).join("; ");

function note(merged, path, severity, message) {
  return { path, severity, message, citation: cite(merged, path), sources: deciders(merged, path), block: severity === "warn" && blocks(merged, path) };
}

// History topics an applicant may not be asked about up front: listed bans, plus criminal history where it may not be
// considered at all or only in a second step, and eviction history where it may not be a basis.
export function preOfferBannedTopics(merged) {
  const out = new Set(valueOf(merged, "preOfferInquiryBanned") || []);
  if (valueOf(merged, "criminal.allowed") === false || twoStep(merged)) out.add("criminal");
  if (valueOf(merged, "eviction.allowed") === false) out.add("eviction");
  return [...out].sort();
}

// Applicant fields to hide → [{ key, topic, why, reason }]; why: inquiry_banned (asking is barred), not_considered (the
// answer can't be used) or after_offer (only after a conditional offer); reason cites the deciding rules.
export function hiddenApplicantFields(merged) {
  const banned = new Set(valueOf(merged, "preOfferInquiryBanned") || []);
  const whyOf = (topic) => {
    if (banned.has(topic)) return { why: "inquiry_banned", path: "preOfferInquiryBanned" };
    if (valueOf(merged, `${topic}.allowed`) === false) return { why: "not_considered", path: `${topic}.allowed` };
    return { why: "after_offer", path: "criminal.timing" };
  };
  return preOfferBannedTopics(merged).flatMap((topic) => {
    const { why, path } = whyOf(topic);
    const reason = path === "preOfferInquiryBanned" ? (fieldOf(merged, path)?.sources || []).filter((s) => s.value.includes(topic)).map((s) => s.citation || s.title).join("; ") : cite(merged, path);
    return (PRE_OFFER_FIELDS[topic] || []).map((key) => ({ key, topic, why, reason }));
  });
}

// The checks a package may hold here → { included, excluded: [{ key, reason }], deferred: [{ key, reason }] }. A history the
// rules bar is left out; criminal history under a two-step rule waits for a conditional offer (RISK-13).
export function packageChecks(merged, checks = ["background", "credit", "eviction", "income"]) {
  const included = [];
  const excluded = [];
  const deferred = [];
  for (const key of checks) {
    const topic = CHECK_TOPIC[key];
    if (topic && valueOf(merged, `${topic}.allowed`) === false) excluded.push({ key, reason: cite(merged, `${topic}.allowed`), block: blocks(merged, `${topic}.allowed`) });
    else if (topic === "criminal" && twoStep(merged)) {
      deferred.push({ key, reason: cite(merged, "criminal.timing") });
      included.push(key);
    } else included.push(key);
  }
  return { included, excluded, deferred };
}

const num = (v) => (v === "" || v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v));

// Screening criteria (RISK-04 values) against the rules → [{ key, path, severity: warn|info, message, citation, sources }].
export function criteriaWarnings(criteria, merged) {
  const c = criteria || {};
  const out = [];
  const push = (key, path, severity, message) => out.push({ key, ...note(merged, path, severity, message) });

  const maxMultiple = valueOf(merged, "income.maxMultiple");
  const multiple = num(c.incomeMultiple);
  if (maxMultiple !== undefined && multiple !== null && multiple > maxMultiple) {
    push("incomeMultiple", "income.maxMultiple", "warn", `The income multiple (${multiple}×) is above the ${formatEffect("income.maxMultiple", maxMultiple)} allowed here.`);
  }
  if (valueOf(merged, "income.tenantPortionForVoucher") && c.voucherIncomeBasis === "full_rent") {
    push("voucherIncomeBasis", "income.tenantPortionForVoucher", "warn", "Voucher holders must be tested on their share of the rent, not the full rent.");
  }
  if (valueOf(merged, "criminal.allowed") === false && c.criminalPolicy && c.criminalPolicy !== "none") {
    push("criminalPolicy", "criminal.allowed", "warn", "Criminal history may not be considered here, but the criteria still review it.");
  } else if (c.criminalPolicy !== "none") {
    const years = num(c.criminalLookbackYears);
    for (const kind of ["felony", "misdemeanor"]) {
      const limit = valueOf(merged, `criminal.lookbackYears.${kind}`);
      if (limit === undefined || (years !== null && years <= limit)) continue;
      push("criminalLookbackYears", `criminal.lookbackYears.${kind}`, "warn", `${kind === "felony" ? "Felony" : "Misdemeanor"} records older than ${formatEffect(`criminal.lookbackYears.${kind}`, limit)} generally may not be considered here (see the rule for exceptions); the criteria look back ${years === null ? "without a limit" : `${years} years`}.`);
    }
    if (twoStep(merged)) {
      push("criminalPolicy", "criminal.timing", "info", "Criminal history may only be checked in a second step, once the applicant otherwise qualifies, with an individualized assessment.");
    }
  }
  if (valueOf(merged, "eviction.allowed") === false) {
    push("evictionLookbackYears", "eviction.allowed", "warn", "Eviction history may not be a basis to deny here.");
  } else {
    const max = valueOf(merged, "eviction.lookbackYearsMax");
    const years = num(c.evictionLookbackYears);
    if (max !== undefined && (years === null || years > max)) {
      push("evictionLookbackYears", "eviction.lookbackYearsMax", "warn", `Evictions older than ${formatEffect("eviction.lookbackYearsMax", max)} may not be considered; the criteria look back ${years === null ? "without a limit" : `${years} years`}.`);
    }
    if (valueOf(merged, "eviction.excludeDismissed") && c.evictionJudgmentsOnly === false) {
      push("evictionJudgmentsOnly", "eviction.excludeDismissed", "warn", "Dismissed eviction cases may not be considered; count judgments only.");
    }
  }
  if (valueOf(merged, "credit.voucherHolderLimits") && num(c.minCreditScore) !== null) {
    push("minCreditScore", "credit.voucherHolderLimits", "info", "Credit history is limited for voucher holders here; check before applying the minimum score to them.");
  }
  if (valueOf(merged, "process.criteriaDisclosureBeforeFee") && !String(c.publishedCriteriaText || "").trim()) {
    push("publishedCriteriaText", "process.criteriaDisclosureBeforeFee", "warn", "Written screening criteria must be given to applicants before a fee is charged; none are published.");
  }
  return out;
}

// An application fee against the rules → [{ path, severity, message, citation, sources, block }] (RISK-10 enforces).
export function feeWarnings(amount, merged) {
  const fee = num(amount);
  if (!fee) return [];
  const out = [];
  const type = valueOf(merged, "fees.capType");
  const cap = valueOf(merged, "fees.cap");
  if (type === "banned") out.push(note(merged, "fees.capType", "warn", `Application fees aren't allowed here; this application records ${formatEffect("fees.cap", fee)}.`));
  else if (cap !== undefined && fee > cap) out.push(note(merged, "fees.cap", "warn", `The ${formatEffect("fees.cap", fee)} fee is above the ${formatEffect("fees.cap", cap)} cap.`));
  if (type !== "banned" && valueOf(merged, "fees.actualCostLimit")) out.push(note(merged, "fees.actualCostLimit", "info", "The fee may not exceed the actual cost of screening."));
  if (type !== "banned" && valueOf(merged, "fees.receiptRequired")) out.push(note(merged, "fees.receiptRequired", "info", "Give the applicant a receipt for the fee."));
  return out;
}

// What public criteria (LEAS-01 listing pages) say about histories the rules bar or defer → { criminal, eviction }, each
// "not_considered", "after_offer" or null; the landlord's other criteria are shown as written.
export function publicCriteriaLimits(merged) {
  const criminal = valueOf(merged, "criminal.allowed") === false ? "not_considered" : twoStep(merged) ? "after_offer" : null;
  return { criminal, eviction: valueOf(merged, "eviction.allowed") === false ? "not_considered" : null };
}

// Notice content the rules add (RISK-07 adverse-action and RISK-13 fair-chance notices) → [{ key, citation }].
export function noticeRequirements(merged) {
  const f = fieldOf(merged, "notices.extraContent");
  if (!f) return [];
  return f.value.map((key) => ({ key, citation: f.sources.filter((s) => s.value.includes(key)).map((s) => s.citation || s.title).join("; ") }));
}
