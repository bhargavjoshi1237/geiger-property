import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MODULES,
  MODULES_SETTING_KEY,
  MODULE_DEFAULTS,
  getModule,
  isModuleOn,
  isSwitchable,
  loadModuleCheck,
  moduleEnabled,
  moduleHiddenTitles,
  moduleNavTitles,
  moduleOfTitle,
} from "./modules";
import { triggerModule, TRIGGERS } from "./automations/catalog";
import { DETECTORS, activeDetectors } from "./signals/detectors";
import { executeJob } from "./jobs/execute";
import { JOBS } from "./jobs/registry";
import { workspaceNav } from "@/components/internal/sidebar/sidebar_nav";

const KEYS = ["leasing", "commercial", "affordable", "regulation", "associations"];

// Minimal PostgREST stand-in: every builder method chains; awaiting resolves `respond(table, op)`.
function fakeAdmin(respond) {
  const calls = [];
  return {
    calls,
    from(table) {
      let op = "select";
      const builder = new Proxy(
        {},
        {
          get(_, prop) {
            if (prop === "then") {
              const res = respond(table, op);
              return (ok, fail) => Promise.resolve(res).then(ok, fail);
            }
            return (...args) => {
              if (["insert", "update", "upsert", "delete"].includes(prop)) op = prop;
              calls.push({ table, op, prop, args });
              return builder;
            };
          },
        },
      );
      return builder;
    },
  };
}

const settingsAdmin = (rows, error = null) =>
  fakeAdmin((table) => (table === "settings" ? { data: error ? null : rows, error } : { data: [], error: null }));

test("the catalogue lists the five optional verticals with their defaults", () => {
  assert.equal(MODULES_SETTING_KEY, "modules");
  assert.deepEqual(
    MODULES.map((m) => m.key),
    KEYS,
  );
  for (const m of MODULES) {
    assert.equal(typeof m.label, "string");
    assert.ok(m.label && m.description, `${m.key} has a label and description`);
    assert.equal(typeof m.defaultOn, "boolean");
  }
  assert.deepEqual(MODULE_DEFAULTS, { leasing: true, commercial: true, affordable: false, regulation: false, associations: false });
  assert.ok(Object.isFrozen(MODULE_DEFAULTS));
  assert.equal(getModule("leasing").label, "Leasing & screening");
  assert.equal(getModule("nope"), null);
});

test("isModuleOn falls back to each module's default when nothing is saved", () => {
  for (const settings of [null, undefined, {}, "garbage", 42]) {
    assert.equal(isModuleOn(settings, "leasing"), true);
    assert.equal(isModuleOn(settings, "commercial"), true);
    assert.equal(isModuleOn(settings, "affordable"), false);
    assert.equal(isModuleOn(settings, "regulation"), false);
    assert.equal(isModuleOn(settings, "associations"), false);
  }
});

test("isModuleOn honours saved booleans and ignores anything else", () => {
  const saved = { leasing: false, affordable: true, commercial: "false", regulation: 1, associations: null };
  assert.equal(isModuleOn(saved, "leasing"), false);
  assert.equal(isModuleOn(saved, "affordable"), true);
  assert.equal(isModuleOn(saved, "commercial"), true);
  assert.equal(isModuleOn(saved, "regulation"), false);
  assert.equal(isModuleOn(saved, "associations"), false);
});

test("core features (no module or an unknown key) are never switchable", () => {
  const allOff = Object.fromEntries(KEYS.map((k) => [k, false]));
  for (const key of [null, undefined, "", "core", "accounting"]) {
    assert.equal(isSwitchable(key), false);
    assert.equal(isModuleOn({ ...allOff, [key]: false }, key), true);
  }
  for (const key of KEYS) assert.equal(isSwitchable(key), true);
});

test("nav helpers resolve a page's module from itself or its section", () => {
  const nav = [
    { title: "Overview" },
    { title: "Leads", module: "leasing", subItems: [{ title: "Listings" }, { title: "Prospects" }] },
    { title: "Accounting", subItems: [{ title: "Ledger" }, { title: "CAM", module: "commercial" }] },
    { title: "Vouchers", module: "affordable" },
  ];
  assert.equal(moduleOfTitle(nav, "Overview"), null);
  assert.equal(moduleOfTitle(nav, "Leads"), "leasing");
  assert.equal(moduleOfTitle(nav, "Prospects"), "leasing");
  assert.equal(moduleOfTitle(nav, "Ledger"), null);
  assert.equal(moduleOfTitle(nav, "CAM"), "commercial");
  assert.equal(moduleOfTitle(nav, "Missing"), null);

  assert.deepEqual(moduleHiddenTitles(nav, null), ["Vouchers"]);
  assert.deepEqual(moduleHiddenTitles(nav, { leasing: false, commercial: false, affordable: true }), ["Leads", "CAM"]);
  assert.deepEqual(moduleNavTitles(nav, "leasing"), ["Listings", "Prospects"]);
  assert.deepEqual(moduleNavTitles(nav, "commercial"), ["CAM"]);
  assert.deepEqual(moduleNavTitles(nav, "affordable"), ["Vouchers"]);
  assert.deepEqual(moduleNavTitles(nav, "associations"), []);
});

test("the workspace nav is unchanged by default; Leasing off hides Marketing & Leads", () => {
  for (const item of workspaceNav) {
    for (const node of [item, ...(item.subItems || [])]) {
      if (node.module) assert.ok(isSwitchable(node.module), `${node.title} names a catalogue module`);
    }
  }
  assert.deepEqual(moduleHiddenTitles(workspaceNav, null), []);
  assert.deepEqual(moduleHiddenTitles(workspaceNav, MODULE_DEFAULTS), []);
  assert.deepEqual(moduleHiddenTitles(workspaceNav, { leasing: false }), ["Marketing & Leads"]);
  assert.deepEqual(moduleHiddenTitles(workspaceNav, { commercial: false }), ["CAM Reconciliation"]);
  for (const title of ["Marketing & Leads", "Listings", "Prospects", "Showings", "Applications", "Waitlist", "Rent Comparables"]) {
    assert.equal(moduleOfTitle(workspaceNav, title), "leasing", title);
  }
  for (const title of ["Leases", "Renewals", "Rent Collection", "Modules", "Overview"]) assert.equal(moduleOfTitle(workspaceNav, title), null, title);
  assert.ok(workspaceNav.find((i) => i.title === "Settings").subItems.some((s) => s.title === "Modules"));
});

test("moduleEnabled reads the project's modules setting", async () => {
  const off = settingsAdmin([{ value: { leasing: false } }]);
  assert.equal(await moduleEnabled(off, "p1", "leasing"), false);
  assert.equal(await moduleEnabled(off, "p1", "commercial"), true);
  assert.equal(await moduleEnabled(off, "p1", "affordable"), false);
  assert.equal(await moduleEnabled(settingsAdmin([]), "p1", "leasing"), true);
  assert.equal(await moduleEnabled(settingsAdmin(null, { message: "boom" }), "p1", "leasing"), true);
  // Core never touches the database.
  const untouched = settingsAdmin([]);
  assert.equal(await moduleEnabled(untouched, "p1", null), true);
  assert.equal(untouched.calls.length, 0);
});

test("loadModuleCheck reads every project once and falls back to defaults", async () => {
  const admin = settingsAdmin([
    { project_id: "p1", value: { leasing: false } },
    { project_id: "p2", value: { affordable: true } },
  ]);
  const on = await loadModuleCheck(admin);
  assert.equal(on("p1", "leasing"), false);
  assert.equal(on("p2", "leasing"), true);
  assert.equal(on("p2", "affordable"), true);
  assert.equal(on("p3", "affordable"), false);
  assert.equal(on(null, "leasing"), true);
  assert.equal(on("p1", null), true);
  const failed = await loadModuleCheck(settingsAdmin(null, { message: "boom" }));
  assert.equal(failed("p1", "leasing"), true);
});

test("application triggers and the application detector belong to Leasing", () => {
  assert.equal(triggerModule("application.submitted"), "leasing");
  assert.equal(triggerModule("application.approved"), "leasing");
  assert.equal(triggerModule("Application submitted"), "leasing");
  assert.equal(triggerModule("lease.created"), null);
  assert.equal(triggerModule("rent.overdue"), null);
  for (const t of TRIGGERS) if (t.module) assert.ok(isSwitchable(t.module), t.key);

  const all = DETECTORS.map((d) => d.key);
  assert.deepEqual(activeDetectors({ disabled: [] }, null).map((d) => d.key), all);
  const leasingOff = activeDetectors({ disabled: [] }, { leasing: false }).map((d) => d.key);
  assert.ok(!leasingOff.includes("application_pending"));
  assert.ok(leasingOff.includes("renewal_at_risk"), "lease lifecycle signals stay core");
  assert.equal(leasingOff.length, all.length - 1);
  assert.ok(!activeDetectors({ disabled: ["rent_delinquency"] }, null).some((d) => d.key === "rent_delinquency"));
  for (const d of DETECTORS) if (d.module) assert.ok(isSwitchable(d.module), d.key);
  for (const j of JOBS) if (j.module) assert.ok(isSwitchable(j.module), j.key);
});

test("a module job skips a one-project run while its module is off", async () => {
  let ran = 0;
  const job = { key: "test-module-job", module: "leasing", run: async () => (ran += 1) && { processed: 1 } };
  const admin = settingsAdmin([{ value: { leasing: false } }]);
  const res = await executeJob(job, { admin, projectId: "p1", trigger: "manual" });
  assert.equal(ran, 0);
  assert.equal(res.ok, true);
  assert.equal(res.status, "skipped");
  assert.equal(res.module, "leasing");
  assert.ok(!admin.calls.some((c) => c.table === "job_runs"), "no job_runs row for a skipped run");
});

test("a cross-project module job gets moduleOn for its own module; core jobs always see true", async () => {
  const respond = (table, op) => {
    if (table === "settings") return { data: [{ project_id: "p1", value: { leasing: false } }], error: null };
    if (table === "job_runs" && op === "insert") return { data: { id: "run-1" }, error: null };
    return { data: [], error: null };
  };
  let seen = null;
  const job = { key: "test-module-job", module: "leasing", run: async ({ moduleOn }) => ((seen = { p1: moduleOn("p1"), p2: moduleOn("p2") }), {}) };
  const res = await executeJob(job, { admin: fakeAdmin(respond), trigger: "cron" });
  assert.equal(res.status, "succeeded");
  assert.deepEqual(seen, { p1: false, p2: true });

  let core = null;
  const coreJob = { key: "test-core-job", run: async ({ moduleOn }) => ((core = moduleOn("p1")), {}) };
  await executeJob(coreJob, { admin: fakeAdmin(respond), projectId: "p1", trigger: "manual" });
  assert.equal(core, true);
});
