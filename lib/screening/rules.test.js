import { test } from "node:test";
import assert from "node:assert/strict";

import { formatEffect, normalizeScreeningRule, ruleProblems, toScreeningRuleRow, validateEffects } from "./rules_schema";
import { jurisdictionCodesFor, jurisdictionLabel, loadScreeningRules, mergeEffects, resolveJurisdiction, withShadowing } from "./jurisdictions";
import { criteriaWarnings, feeWarnings, hiddenApplicantFields, noticeRequirements, packageChecks, preOfferBannedTopics } from "./rules_enforcement";

// Synthetic rules (not the seed): the merge and enforcement logic, independent of any jurisdiction's actual law.
let n = 0;
const rule = (code, effects, extra = {}) =>
  normalizeScreeningRule({
    id: `r${++n}`,
    project_id: extra.project_id ?? null,
    jurisdiction_code: code,
    scope: extra.scope ?? (code === "US" ? "federal" : code.split("-").length === 2 ? "state" : "city"),
    rule_key: extra.rule_key ?? `rule_${n}`,
    title: extra.title ?? `Rule ${n}`,
    topic: extra.topic ?? "criminal",
    effects,
    status: extra.status ?? "active",
    enforcement: extra.enforcement ?? "warn",
    citation: extra.citation ?? `Cite ${n}`,
    source_url: "https://example.gov/rule",
    verification: "verified",
    verified_on: "2026-11-08",
    effective_from: extra.effective_from ?? null,
    effective_to: extra.effective_to ?? null,
  });

const AS_OF = "2026-11-08";

test("jurisdictions: a property's codes run federal → state → county → city", () => {
  assert.deepEqual(jurisdictionCodesFor({ city: "Oakland", state: "CA", metadata: { county: "Alameda County" } }), ["US", "US-CA", "US-CA-ALAMEDA", "US-CA-OAKLAND"]);
  assert.deepEqual(jurisdictionCodesFor({ city: "Seattle", state: "Washington", county: "King" }), ["US", "US-WA", "US-WA-KING", "US-WA-SEATTLE"]);
  assert.deepEqual(jurisdictionCodesFor({ city: "Los Angeles", state: "Calif.", county: "Los Angeles" }), ["US", "US-CA", "US-CA-LOS_ANGELES_COUNTY", "US-CA-LOS_ANGELES"]);
  assert.deepEqual(jurisdictionCodesFor({ city: "Washington", state: "DC" }), ["US", "US-DC"]);
  assert.deepEqual(jurisdictionCodesFor({ city: "Anywhere", state: "" }), ["US"]);
  assert.deepEqual(jurisdictionCodesFor(null), ["US"]);
});

test("jurisdictions: NYC boroughs, neighbourhood names and NYC ZIPs resolve to US-NY-NYC", () => {
  for (const city of ["New York", "NYC", "Brooklyn", "The Bronx", "Staten Island", "Astoria", "Long Island City"]) {
    assert.ok(jurisdictionCodesFor({ city, state: "NY" }).includes("US-NY-NYC"), city);
  }
  assert.ok(jurisdictionCodesFor({ city: "Brooklyn Heights", state: "NY", zip: "11201" }).includes("US-NY-NYC"), "ZIP wins over a neighbourhood name");
  assert.ok(!jurisdictionCodesFor({ city: "Yonkers", state: "NY", zip: "10701" }).includes("US-NY-NYC"));
  assert.ok(!jurisdictionCodesFor({ city: "Floral Park", state: "NY", zip: "11001" }).includes("US-NY-NYC"), "110 is shared with Nassau");
});

test("jurisdictions: a blank county is inferred for single-county cities and flagged; an override replaces the chain", () => {
  const chicago = resolveJurisdiction({ city: "Chicago", state: "IL" });
  assert.deepEqual(chicago.codes, ["US", "US-IL", "US-IL-COOK", "US-IL-CHICAGO"]);
  assert.equal(chicago.countyInferred, true);
  assert.equal(resolveJurisdiction({ city: "Chicago", state: "IL", county: "Cook" }).countyInferred, false);
  const o = resolveJurisdiction({ city: "Somewhere", state: "CA", metadata: { screeningJurisdictionOverride: "US-NY-NYC" } });
  assert.deepEqual(o.codes, ["US", "US-NY", "US-NY-NYC"]);
  assert.equal(o.overridden, true);
  assert.deepEqual(jurisdictionCodesFor({ state: "IL", metadata: { screeningJurisdictionOverride: "us-il-cook, US-IL-CHICAGO, bogus" } }), ["US", "US-IL", "US-IL-COOK", "US-IL-CHICAGO"]);
  assert.equal(jurisdictionLabel("US-NY-NYC"), "New York City, NY");
  assert.equal(jurisdictionLabel("US-IL-COOK", "county"), "Cook County, IL");
  assert.equal(jurisdictionLabel("US-CA"), "California");
  assert.equal(jurisdictionLabel("US"), "Federal");
});

test("merge: the most protective value wins on every field and every rule that set it stays a source", () => {
  const state = rule("US-XX", {
    criminal: { allowed: true, timing: "any", lookbackYears: { misdemeanor: 5, felony: 10 }, excluded: ["juvenile"], responseDays: 5, individualizedAssessment: false },
    eviction: { lookbackYearsMax: 7 },
    income: { maxMultiple: 3 },
    fees: { capType: "actual_cost", cap: 50, receiptRequired: false },
    fees2: { ignored: true },
  });
  const city = rule("US-XX-CITY", {
    criminal: { allowed: false, timing: "after_conditional_offer", lookbackYears: { misdemeanor: 3, felony: 12 }, excluded: ["arrests_without_conviction"], responseDays: 10, individualizedAssessment: true },
    eviction: { lookbackYearsMax: 3 },
    income: { maxMultiple: 2.5 },
    fees: { capType: "fixed", cap: 20, receiptRequired: true },
    notices: { extraContent: ["copy_of_report"] },
  });
  const m = mergeEffects([state, city], { asOf: AS_OF });
  assert.equal(m.values.criminal.allowed, false, "a ban beats an allowance");
  assert.equal(m.values.criminal.timing, "after_conditional_offer");
  assert.equal(m.values.criminal.lookbackYears.misdemeanor, 3, "shortest look-back");
  assert.equal(m.values.criminal.lookbackYears.felony, 10, "shortest look-back, per field");
  assert.deepEqual(m.values.criminal.excluded, ["arrests_without_conviction", "juvenile"], "exclusions add up");
  assert.equal(m.values.criminal.responseDays, 10, "longest response window");
  assert.equal(m.values.criminal.individualizedAssessment, true);
  assert.equal(m.values.eviction.lookbackYearsMax, 3);
  assert.equal(m.values.income.maxMultiple, 2.5);
  assert.equal(m.values.fees.cap, 20, "lowest fee cap");
  assert.equal(m.values.fees.capType, "fixed", "the cap type follows the lowest cap");
  assert.equal(m.values.fees.receiptRequired, true);
  assert.equal(m.values.fees2, undefined, "unknown effect fields are dropped");
  assert.deepEqual(m.applied.sort(), [state.id, city.id].sort());

  const allowed = m.fields["criminal.allowed"];
  assert.deepEqual(allowed.sources.map((s) => [s.ruleId, s.value, s.wins]), [[state.id, true, false], [city.id, false, true]]);
  assert.equal(allowed.sources[1].citation, city.citation);
  assert.equal(allowed.sources[1].sourceUrl, "https://example.gov/rule");
  const felony = m.fields["criminal.lookbackYears.felony"];
  assert.deepEqual(felony.sources.map((s) => [s.ruleId, s.value, s.wins]), [[state.id, 10, true], [city.id, 12, false]]);
  assert.deepEqual(m.fields["notices.extraContent"].sources.map((s) => s.ruleId), [city.id]);
});

test("merge: a fee ban beats any cap; the order of rules never changes the result", () => {
  const a = rule("US-XX", { fees: { capType: "fixed", cap: 20 } });
  const b = rule("US-XX-CITY", { fees: { capType: "banned" } });
  const c = rule("US", { fees: { capType: "cpi", cap: 62.02 } });
  const one = mergeEffects([a, b, c], { asOf: AS_OF });
  const two = mergeEffects([c, b, a], { asOf: AS_OF });
  assert.equal(one.values.fees.capType, "banned");
  assert.deepEqual(one.values, two.values);
  assert.equal(mergeEffects([a, c], { asOf: AS_OF }).values.fees.capType, "fixed");
  assert.equal(mergeEffects([c], { asOf: AS_OF }).values.fees.cap, 62.02);
});

test("merge: withdrawn, enjoined, pending, not-yet-effective and ended rules change no outcome", () => {
  const base = rule("US-XX", { criminal: { allowed: true, lookbackYears: { felony: 7 } } });
  const baseline = mergeEffects([base], { asOf: AS_OF });
  const protective = { criminal: { allowed: false, individualizedAssessment: true, excluded: ["arrests_without_conviction"], lookbackYears: { felony: 1 } } };
  const notInForce = [
    rule("US", protective, { status: "withdrawn" }),
    rule("US", protective, { status: "enjoined" }),
    rule("US", protective, { status: "pending" }),
    rule("US", protective, { status: "repealed" }),
    rule("US", protective, { effective_from: "2027-01-01" }),
    rule("US", protective, { effective_to: "2025-12-31" }),
  ];
  const merged = mergeEffects([base, ...notInForce], { asOf: AS_OF });
  assert.deepEqual(merged.values, baseline.values);
  assert.deepEqual(merged.fields, baseline.fields);
  assert.deepEqual(merged.ignored.map((x) => x.reason), ["withdrawn", "enjoined", "pending", "repealed", "not_yet", "ended"]);
  assert.equal(mergeEffects([rule("US", protective, { effective_from: "2026-11-08" })], { asOf: AS_OF }).values.criminal.allowed, false, "in force on its first day");
});

test("merge: a project's rule replaces the shared rule with the same key", () => {
  const shared = rule("US-XX", { income: { maxMultiple: 2 } }, { rule_key: "income_cap" });
  const own = rule("US-XX", { income: { maxMultiple: 2.5 } }, { rule_key: "income_cap", project_id: "p1" });
  const other = rule("US-XX", { income: { maxMultiple: 2.2 } }, { rule_key: "income_cap_b" });
  const rules = withShadowing([shared, own, other]);
  assert.equal(rules[0].shadowedBy, own.id);
  const m = mergeEffects(rules, { asOf: AS_OF });
  assert.equal(m.values.income.maxMultiple, 2.2);
  assert.deepEqual(m.fields["income.maxMultiple"].sources.map((s) => s.ruleId), [own.id, other.id]);
  assert.deepEqual(m.ignored, [{ id: shared.id, reason: "replaced" }]);
});

test("loader: reads the codes, global plus the project's rows, flags what's in force and sorts by the chain", async () => {
  const calls = [];
  const rows = [
    { id: "a", project_id: null, jurisdiction_code: "US-XX-CITY", scope: "city", rule_key: "k1", title: "City", effects: {}, status: "active", source_url: "u", verified_on: "2026-01-01" },
    { id: "b", project_id: null, jurisdiction_code: "US", scope: "federal", rule_key: "k2", title: "Federal", effects: {}, status: "withdrawn" },
  ];
  const q = {
    select: (c) => (calls.push(["select", c]), q),
    in: (c, v) => (calls.push(["in", c, v]), q),
    is: (c, v) => (calls.push(["is", c, v]), q),
    or: (f) => (calls.push(["or", f]), q),
    then: (resolve) => resolve({ data: rows, error: null }),
  };
  const db = { from: (t) => (calls.push(["from", t]), q) };
  const pid = "ebcc7910-1a0e-4e91-8c3b-752f3c4292d3";
  const out = await loadScreeningRules(db, ["US", "US-XX", "US-XX-CITY", "bad code"], { projectId: pid, asOf: AS_OF });
  assert.deepEqual(out.map((r) => [r.id, r.inForce, r.reason]), [["b", false, "withdrawn"], ["a", true, null]]);
  assert.deepEqual(calls.find((c) => c[0] === "in"), ["in", "jurisdiction_code", ["US", "US-XX", "US-XX-CITY"]]);
  assert.deepEqual(calls.find((c) => c[0] === "or"), ["or", `project_id.is.null,project_id.eq.${pid}`]);
  await assert.rejects(loadScreeningRules(db, ["US"], { projectId: "x) or (true" }), /projectId/);
});

test("effects: validation keeps documented fields, coerces types and reports the rest", () => {
  const { effects, problems } = validateEffects({ criminal: { allowed: "false", lookbackYears: { felony: "7" }, timing: "later" }, preOfferInquiryBanned: ["criminal"], extra: 1 });
  assert.deepEqual(effects, { criminal: { allowed: false, lookbackYears: { felony: 7 } }, preOfferInquiryBanned: ["criminal"] });
  assert.equal(problems.length, 2);
  assert.match(problems.join(" "), /extra/);
  assert.match(problems.join(" "), /criminal\.timing/);
  assert.deepEqual(validateEffects({ preOfferInquiryBanned: ["credit"] }).problems.length, 1);
  assert.equal(formatEffect("income.maxMultiple", 2.5), "2.5× rent");
  assert.equal(formatEffect("fees.cap", 62.02), "$62.02");
  assert.equal(formatEffect("criminal.allowed", false), "May not be considered");
  assert.deepEqual(toScreeningRuleRow({ jurisdictionCode: " us-ca ", verifiedOn: "", effects: { bogus: 1 } }), { jurisdiction_code: "US-CA", verified_on: null, effects: {} });
  assert.equal(ruleProblems({ jurisdictionCode: "US-CA", ruleKey: "k", title: "t", topic: "fees", status: "active" }).length, 1, "active needs a source and date");
  assert.equal(ruleProblems({ jurisdictionCode: "US-CA", ruleKey: "k", title: "t", topic: "fees", status: "active", sourceUrl: "https://x", verifiedOn: "2026-11-08" }).length, 0);
});

test("enforcement: an outright criminal ban hides the conviction question and leaves the check out of every package", () => {
  const ban = mergeEffects([rule("US-CA-OAKLAND", { criminal: { allowed: false }, preOfferInquiryBanned: ["criminal"] }, { citation: "OMC 8.25" })], { asOf: AS_OF });
  assert.deepEqual(preOfferBannedTopics(ban), ["criminal"]);
  assert.deepEqual(hiddenApplicantFields(ban), [{ key: "felonyDisclosed", topic: "criminal", why: "inquiry_banned", reason: "OMC 8.25" }]);
  const noUse = mergeEffects([rule("US-WA-SEATTLE", { criminal: { allowed: false } }, { citation: "SMC 14.09" })], { asOf: AS_OF });
  assert.deepEqual(hiddenApplicantFields(noUse), [{ key: "felonyDisclosed", topic: "criminal", why: "not_considered", reason: "SMC 14.09" }]);
  const pkg = packageChecks(ban);
  assert.deepEqual(pkg.included, ["credit", "eviction", "income"]);
  assert.deepEqual(pkg.excluded.map((x) => [x.key, x.reason]), [["background", "OMC 8.25"]]);
  assert.match(criteriaWarnings({ criminalPolicy: "lookback" }, ban)[0].message, /may not be considered/);
  assert.equal(criteriaWarnings({ criminalPolicy: "none" }, ban).length, 0);
});

test("enforcement: a two-step rule defers the criminal check and hides the question; no rules change nothing", () => {
  const two = mergeEffects([rule("US-NY-NYC", { criminal: { timing: "after_conditional_offer" } })], { asOf: AS_OF });
  assert.deepEqual(hiddenApplicantFields(two).map((h) => [h.key, h.why]), [["felonyDisclosed", "after_offer"]]);
  const pkg = packageChecks(two);
  assert.deepEqual(pkg.included, ["background", "credit", "eviction", "income"]);
  assert.deepEqual(pkg.deferred.map((x) => x.key), ["background"]);
  const pre = mergeEffects([rule("US-IL-COOK", { criminal: { timing: "after_prequalification" } })], { asOf: AS_OF });
  assert.deepEqual(packageChecks(pre).deferred.map((x) => x.key), ["background"], "pre-qualification is a two-step rule too");
  assert.deepEqual(hiddenApplicantFields(pre).map((h) => h.why), ["after_offer"]);
  const both = mergeEffects([rule("US-IL-COOK", { criminal: { timing: "after_prequalification" } }), rule("US-IL-X", { criminal: { timing: "after_conditional_offer" } })], { asOf: AS_OF });
  assert.equal(both.values.criminal.timing, "after_conditional_offer", "a conditional offer is the later, more protective step");
  const none = mergeEffects([], { asOf: AS_OF });
  assert.deepEqual(hiddenApplicantFields(none), []);
  assert.deepEqual(packageChecks(none).excluded, []);
  assert.deepEqual(criteriaWarnings({ incomeMultiple: 3, criminalPolicy: "lookback" }, none), []);
  assert.deepEqual(feeWarnings(45, none), []);
  assert.deepEqual(noticeRequirements(none), []);
});

test("enforcement: criteria and fee warnings name the rule", () => {
  const m = mergeEffects(
    [
      rule("US-XX", { income: { maxMultiple: 2.5, tenantPortionForVoucher: true }, eviction: { lookbackYearsMax: 3 }, process: { criteriaDisclosureBeforeFee: true } }, { citation: "Code 1" }),
      rule("US-XX-CITY", { fees: { capType: "cpi", cap: 62.02, actualCostLimit: true }, notices: { extraContent: ["copy_of_report"] } }, { citation: "Code 2", topic: "fees" }),
    ],
    { asOf: AS_OF },
  );
  const w = criteriaWarnings({ incomeMultiple: 3, voucherIncomeBasis: "full_rent", evictionLookbackYears: 7, publishedCriteriaText: "" }, m);
  assert.deepEqual(w.map((x) => x.key), ["incomeMultiple", "voucherIncomeBasis", "evictionLookbackYears", "publishedCriteriaText"]);
  assert.ok(w.every((x) => x.citation === "Code 1" && x.severity === "warn"));
  assert.deepEqual(criteriaWarnings({ incomeMultiple: 2.5, voucherIncomeBasis: "tenant_portion", evictionLookbackYears: 3, publishedCriteriaText: "Our criteria" }, m), []);
  const fee = feeWarnings(75, m);
  assert.equal(fee[0].severity, "warn");
  assert.match(fee[0].message, /\$75 fee is above the \$62\.02 cap/);
  assert.equal(fee[0].citation, "Code 2");
  assert.equal(feeWarnings(60, m).filter((x) => x.severity === "warn").length, 0);
  assert.equal(feeWarnings(10, mergeEffects([rule("US-MA", { fees: { capType: "banned" } })], { asOf: AS_OF }))[0].severity, "warn");
  assert.deepEqual(noticeRequirements(m), [{ key: "copy_of_report", citation: "Code 2" }]);
});
