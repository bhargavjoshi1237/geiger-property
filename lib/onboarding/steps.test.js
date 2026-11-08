import { test } from "node:test";
import assert from "node:assert/strict";
import { STEPS, STEP_IDS, evaluateSteps, progressOf, helpUrl } from "./steps";
import { ONBOARDING_DEFAULTS, normalizeState, skipStep, markDone, dismissCard, goLive, isClosed, setNewPortfolio, unskipStep } from "./state";
import { workspaceNav } from "@/components/internal/sidebar/sidebar_nav";

const EMPTY = () => ({
  settings: {},
  bankAccounts: [],
  properties: [],
  units: [],
  propertyOwners: [],
  owners: [],
  leases: [],
  rentAccounts: [],
  teamMembers: [],
  portalMembers: [],
  stripe: { configured: false, webhookConfigured: false, mode: null },
});
const run = (data, state = normalizeState(null), opts) => evaluateSteps(data, state, { today: "2026-11-08", ...opts });
const byId = (results, id) => results.find((r) => r.id === id);

test("an empty project is 0 of 13 done with the company profile first", () => {
  const results = run(EMPTY());
  const p = progressOf(results);
  assert.equal(p.done, 0);
  assert.equal(p.total, 13);
  assert.equal(p.next[0].id, "company_profile");
  assert.equal(p.next.length, 3);
});

test("filling in the company profile completes step 1 without a manual tick", () => {
  const data = EMPTY();
  data.settings.company_profile = { legalName: "Harbor & Pine LLC", state: "WA", licenseNumber: "PM-1" };
  const r = byId(run(data), "company_profile");
  assert.equal(r.status, "done");
  assert.equal(r.auto, true);
  assert.equal(progressOf(run(data)).done, 1);
});

test("a partial company profile lists what is missing", () => {
  const data = EMPTY();
  data.settings.company_profile = { legalName: "Harbor", state: "", licenseNumber: " " };
  assert.equal(byId(run(data), "company_profile").detail, "Add state, licence number");
});

test("a property owned 60% reads 1 property under 100%", () => {
  const data = EMPTY();
  data.properties = [{ id: "p1" }, { id: "p2" }];
  data.units = [{ id: "u1" }];
  data.owners = [{ id: "o1", agreementStart: "2026-01-01" }];
  data.propertyOwners = [
    { ownerId: "o1", propertyId: "p1", pct: 100, endsOn: null },
    { ownerId: "o1", propertyId: "p2", pct: 60, endsOn: null },
  ];
  const r = byId(run(data), "owners");
  assert.equal(r.status, "todo");
  assert.equal(r.detail, "1 property under 100%");
});

test("owners complete at 100% with an agreement start; ended shares and missing agreements count", () => {
  const data = EMPTY();
  data.properties = [{ id: "p1" }];
  data.owners = [{ id: "o1", agreementStart: "" }, { id: "o2", agreementStart: "2026-02-01" }];
  data.propertyOwners = [
    { ownerId: "o1", propertyId: "p1", pct: 50, endsOn: null },
    { ownerId: "o2", propertyId: "p1", pct: 50, endsOn: null },
    { ownerId: "o2", propertyId: "p1", pct: 50, endsOn: "2025-01-01" },
  ];
  assert.equal(byId(run(data), "owners").detail, "1 owner without an agreement start");
  data.owners[0].agreementStart = "2026-01-01";
  assert.equal(byId(run(data), "owners").status, "done");
});

test("bank accounts need operating and trust, each linked to the chart", () => {
  const data = EMPTY();
  data.bankAccounts = [{ accountType: "Operating", status: "Active", glAccountId: "g1" }];
  assert.match(byId(run(data), "bank_accounts").detail, /Add a Trust account/);
  data.bankAccounts.push({ accountType: "Trust", status: "Active", glAccountId: "" });
  assert.match(byId(run(data), "bank_accounts").detail, /1 account not linked/);
  data.bankAccounts[1].glAccountId = "g2";
  assert.equal(byId(run(data), "bank_accounts").status, "done");
  data.settings.fees_policies = { depositHeldIn: "separate" };
  assert.match(byId(run(data), "bank_accounts").detail, /deposit trust/);
});

test("leases need a rent account each and at least one active lease", () => {
  const data = EMPTY();
  assert.equal(byId(run(data), "tenants_leases").status, "todo");
  data.leases = [{ id: "l1", status: "Active" }, { id: "l2", status: "Ended" }, { id: "l3", status: "Month-to-month" }];
  data.rentAccounts = [{ leaseId: "l1" }];
  assert.equal(byId(run(data), "tenants_leases").detail, "1 active lease without a rent account");
  data.rentAccounts.push({ leaseId: "l3" });
  assert.equal(byId(run(data), "tenants_leases").status, "done");
});

test("fees and policies need a saved setting", () => {
  const data = EMPTY();
  assert.equal(byId(run(data), "fees_policies").status, "todo");
  data.settings.fees_policies = { rentDueDay: "1", lateFeeType: "flat", managementFeePct: 8 };
  assert.equal(byId(run(data), "fees_policies").status, "done");
});

test("skipping, ticking by hand and the new-portfolio declaration", () => {
  const data = EMPTY();
  let state = skipStep(normalizeState(null), "team", "solo operator");
  let r = byId(run(data, state), "team");
  assert.equal(r.status, "skipped");
  assert.equal(r.detail, "Skipped: solo operator");
  assert.equal(progressOf(run(data, state)).done, 1);
  state = unskipStep(state, "team");
  assert.equal(byId(run(data, state), "team").status, "todo");

  assert.equal(byId(run(data, markDone(state, "opening_balances")), "opening_balances").status, "done");
  const np = setNewPortfolio(state, true);
  assert.equal(byId(run(data, np), "opening_balances").status, "skipped");
  assert.equal(byId(run(data, np), "opening_balances").detail, "New portfolio — nothing to bring over");
});

test("go-live waits on the required steps and completes from goLiveAt", () => {
  const data = EMPTY();
  assert.equal(byId(run(data), "go_live").detail, "7 required steps still open");
  const state = goLive(normalizeState(null));
  assert.equal(byId(run(data, state), "go_live").status, "done");
});

test("a failed source read marks its steps unknown instead of done", () => {
  const data = { ...EMPTY(), bankAccounts: null, stripe: null };
  const results = run(data);
  assert.equal(byId(results, "bank_accounts").status, "unknown");
  assert.equal(byId(results, "online_payments").status, "unknown");
  assert.equal(byId(results, "company_profile").status, "todo");
});

test("online payments need Stripe configured with its webhook", () => {
  const data = EMPTY();
  assert.equal(byId(run(data), "online_payments").detail, "Stripe is not configured");
  data.stripe = { configured: true, webhookConfigured: true, mode: "test" };
  assert.equal(byId(run(data), "online_payments").status, "done");
  data.settings.online_payments = { enabled: false };
  assert.equal(byId(run(data), "online_payments").status, "todo");
});

test("dismissing and going live close the Overview card; state reducers are pure", () => {
  const base = normalizeState(null);
  assert.equal(isClosed(base), false);
  assert.equal(isClosed(dismissCard(base)), true);
  assert.equal(isClosed(goLive(base)), true);
  assert.equal(base.dismissedAt, null);
  assert.deepEqual(ONBOARDING_DEFAULTS.skipped, {});
});

test("catalogue ids are unique and every step opens a real sidebar screen", () => {
  assert.equal(new Set(STEP_IDS).size, STEPS.length);
  const titles = new Set(workspaceNav.flatMap((i) => [i.title, ...(i.subItems || []).map((s) => s.title)]));
  for (const s of STEPS) assert.ok(titles.has(s.screen), `${s.id} -> ${s.screen}`);
  assert.equal(helpUrl("setup-owners"), "https://geiger.studio/help/property/setup-owners");
});

test("a step tagged with an off module is hidden", () => {
  const step = { id: "x", title: "X", why: "", screen: "Company Profile", module: "leasing", check: () => ({ done: true }) };
  STEPS.push(step);
  try {
    assert.equal(run(EMPTY(), undefined, { modules: { leasing: false } }).some((r) => r.id === "x"), false);
    assert.equal(run(EMPTY(), undefined, { modules: { leasing: true } }).some((r) => r.id === "x"), true);
  } finally {
    STEPS.pop();
  }
});
