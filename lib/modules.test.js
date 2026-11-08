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
  modulesOfTitle,
  offModuleOfTitle,
} from "./modules";
import { triggerModule, TRIGGERS } from "./automations/catalog";
import { runAutomations } from "./automations/runner";
import { DETECTORS, activeDetectors } from "./signals/detectors";
import { runProjectSignals } from "./signals/engine";
import { executeJob } from "./jobs/execute";
import { JOBS } from "./jobs/registry";
import { workspaceNav } from "@/components/internal/sidebar/sidebar_nav";

const KEYS = ["leasing", "commercial", "affordable", "regulation", "associations"];

// Minimal PostgREST stand-in: every builder method chains; awaiting resolves `respond(table, op, { eq, single })`.
function fakeAdmin(respond) {
  const calls = [];
  return {
    calls,
    from(table) {
      const meta = { op: "select", eq: {}, single: false };
      const builder = new Proxy(
        {},
        {
          get(_, prop) {
            if (prop === "then") {
              const res = respond(table, meta.op, meta);
              return (ok, fail) => Promise.resolve(res).then(ok, fail);
            }
            return (...args) => {
              if (["insert", "update", "upsert", "delete"].includes(prop)) meta.op = prop;
              if (prop === "eq") meta.eq[args[0]] = args[1];
              if (prop === "single" || prop === "maybeSingle") meta.single = true;
              calls.push({ table, op: meta.op, prop, args });
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
  assert.deepEqual(modulesOfTitle(nav, "Overview"), []);
  assert.deepEqual(modulesOfTitle(nav, "Leads"), ["leasing"]);
  assert.deepEqual(modulesOfTitle(nav, "Prospects"), ["leasing"]);
  assert.deepEqual(modulesOfTitle(nav, "Ledger"), []);
  assert.deepEqual(modulesOfTitle(nav, "CAM"), ["commercial"]);
  assert.deepEqual(modulesOfTitle(nav, "Missing"), []);
  assert.equal(offModuleOfTitle(nav, null, "Prospects"), null);
  assert.equal(offModuleOfTitle(nav, { leasing: false }, "Prospects"), "leasing");
  assert.equal(offModuleOfTitle(nav, null, "Vouchers"), "affordable");
  assert.equal(offModuleOfTitle(nav, { leasing: false, commercial: false, affordable: false }, "Ledger"), null);

  assert.deepEqual(moduleHiddenTitles(nav, null), ["Vouchers"]);
  assert.deepEqual(moduleHiddenTitles(nav, { leasing: false, commercial: false, affordable: true }), ["Leads", "CAM"]);
  assert.deepEqual(moduleNavTitles(nav, "leasing"), ["Listings", "Prospects"]);
  assert.deepEqual(moduleNavTitles(nav, "commercial"), ["CAM"]);
  assert.deepEqual(moduleNavTitles(nav, "affordable"), ["Vouchers"]);
  assert.deepEqual(moduleNavTitles(nav, "associations"), []);
});

test("a page is gated on both its own module and its section's", () => {
  const nav = [{ title: "Leads", module: "leasing", subItems: [{ title: "Prospects" }, { title: "Vouchers", module: "affordable" }] }];
  assert.deepEqual(modulesOfTitle(nav, "Vouchers"), ["affordable", "leasing"]);
  assert.equal(offModuleOfTitle(nav, { affordable: true }, "Vouchers"), null);
  assert.equal(offModuleOfTitle(nav, { affordable: true, leasing: false }, "Vouchers"), "leasing");
  assert.equal(offModuleOfTitle(nav, { affordable: false }, "Vouchers"), "affordable");
  assert.equal(offModuleOfTitle(nav, { affordable: false }, "Prospects"), null);
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
    assert.deepEqual(modulesOfTitle(workspaceNav, title), ["leasing"], title);
    assert.equal(offModuleOfTitle(workspaceNav, null, title), null, title);
    assert.equal(offModuleOfTitle(workspaceNav, { leasing: false }, title), "leasing", title);
  }
  assert.equal(offModuleOfTitle(workspaceNav, { commercial: false }, "CAM Reconciliation"), "commercial");
  for (const title of ["Leases", "Renewals", "Rent Collection", "Modules", "Overview"]) assert.deepEqual(modulesOfTitle(workspaceNav, title), [], title);
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

test("loadModuleCheck pages through every project's setting and falls back to defaults", async () => {
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

  // 1,000 rows fill a page, so a second page is read (and the short one ends it).
  let pages = 0;
  const paged = fakeAdmin((table) => {
    if (table !== "settings") return { data: [], error: null };
    pages += 1;
    const rows = pages === 1 ? Array.from({ length: 1000 }, (_, i) => ({ project_id: `p${i}`, value: {} })) : [{ project_id: "late", value: { leasing: false } }];
    return { data: rows, error: null };
  });
  const check = await loadModuleCheck(paged);
  assert.equal(pages, 2);
  assert.equal(check("late", "leasing"), false);
  assert.ok(paged.calls.some((c) => c.prop === "range" && c.args[0] === 1000));

  // One project: the read is narrowed to it.
  const one = settingsAdmin([{ project_id: "p1", value: { leasing: false } }]);
  assert.equal((await loadModuleCheck(one, "p1"))("p1", "leasing"), false);
  assert.ok(one.calls.some((c) => c.prop === "eq" && c.args[0] === "project_id" && c.args[1] === "p1"));
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
  const admin = settingsAdmin([{ project_id: "p1", value: { leasing: false } }]);
  const res = await executeJob(job, { admin, projectId: "p1", trigger: "manual" });
  assert.equal(ran, 0);
  assert.equal(res.ok, true);
  assert.equal(res.status, "skipped");
  assert.equal(res.module, "leasing");
  assert.ok(!admin.calls.some((c) => c.table === "job_runs"), "no job_runs row for a skipped run");
});

test("every job gets moduleOn(projectId, key = its module): a cron run fans out and skips projects with the module off", async () => {
  const respond = (table, op) => {
    if (table === "settings") return { data: [{ project_id: "p1", value: { leasing: false, affordable: true } }], error: null };
    if (table === "job_runs" && op === "insert") return { data: { id: "run-1" }, error: null };
    return { data: [], error: null };
  };
  const seen = [];
  const job = {
    key: "test-module-job",
    module: "leasing",
    run: async ({ projectId, moduleOn }) => (seen.push({ projectId, own: moduleOn(projectId), affordable: moduleOn(projectId, "affordable") }), {}),
  };
  const admin = { ...fakeAdmin(respond), rpc: async () => ({ data: ["p1", "p2"], error: null }) };
  const res = await executeJob(job, { admin, trigger: "cron" });
  assert.equal(res.status, "succeeded");
  assert.deepEqual(seen, [{ projectId: "p2", own: true, affordable: false }]);
  assert.deepEqual(res.projects.map((p) => [p.projectId, p.status]), [["p1", "skipped"], ["p2", "succeeded"]]);

  // A one-project core job: its own module is core (true); other keys answer from the project's setting, a missing project means the run's own.
  let core = null;
  const coreJob = { key: "test-core-job", run: async ({ moduleOn }) => ((core = { own: moduleOn("p1"), leasing: moduleOn("p1", "leasing"), runProject: moduleOn(null, "affordable") }), {}) };
  await executeJob(coreJob, { admin: fakeAdmin(respond), projectId: "p1", trigger: "manual" });
  assert.deepEqual(core, { own: true, leasing: false, runProject: true });
});

test("module check: project-less settings rows are never read (PLAT-01b/01h)", async () => {
  const admin = fakeAdmin((table) => (table === "settings" ? { data: [{ project_id: null, value: { leasing: false } }, { project_id: "p1", value: { affordable: true } }], error: null } : { data: [], error: null }));
  const check = await loadModuleCheck(admin);
  assert.equal(check(null, "leasing"), isModuleOn(undefined, "leasing"), "no project answers the defaults, not a legacy row");
  assert.equal(check("p1", "affordable"), true);
  assert.ok(admin.calls.some((c) => c.table === "settings" && c.prop === "not" && c.args[0] === "project_id"), "the read excludes rows without a project");
});

// One p1 workflow on application.submitted and one pending event in p1 whose record carries no project.
function automationsAdmin(modulesValue, { workflowProject = "p1", eventProject = "p1" } = {}) {
  return fakeAdmin((table, op, meta) => {
    if (table === "settings") return { data: [{ project_id: "p1", value: modulesValue }], error: null };
    if (table === "automations" && op === "select") {
      const row = { id: "wf1", project_id: workflowProject, name: "Applicant follow-up", enabled: true, status: "Active", trigger_event: "application.submitted", autonomy: "auto", run_count: 0, metadata: { steps: [{ id: "s1", type: "create_task", config: { title: "Call the applicant" } }] } };
      return { data: [row], error: null };
    }
    if (table === "automation_events" && op === "select") {
      return { data: [{ id: "ev1", event_type: "application.submitted", source_table: "applications", record_id: "app1", project_id: eventProject, status: "pending", attempts: 0, metadata: {} }], error: null };
    }
    if (table === "applications" && meta.single) return { data: { id: "app1", name: "Pat Applicant", status: "Submitted", metadata: {} }, error: null };
    if (table === "automation_runs" && op === "upsert") return { data: [{ id: "run1" }], error: null };
    return { data: [], error: null };
  });
}

test("runAutomations drops an application.submitted event for a project with Leasing off", async () => {
  const now = new Date("2026-11-08T12:00:00Z");
  const off = automationsAdmin({ leasing: false });
  const res = await runAutomations({ admin: off, now });
  assert.deepEqual(res.errors, []);
  assert.equal(res.created, 0);
  assert.equal(res.skipped, 1);
  assert.ok(!off.calls.some((c) => c.table === "automation_runs" && c.op === "upsert"), "no run is created");

  // The event's project decides when the record carries none; with Leasing on the same event starts a run.
  const on = automationsAdmin({ leasing: true });
  const ran = await runAutomations({ admin: on, now });
  assert.deepEqual(ran.errors, []);
  assert.equal(ran.created, 1);
  assert.ok(on.calls.some((c) => c.table === "automation_runs" && c.op === "upsert"));
});

test("a workflow or event without a project, or another project's event, never starts a run (PLAT-01b)", async () => {
  const now = new Date("2026-11-08T12:00:00Z");
  const cases = [{ workflowProject: null }, { eventProject: null }, { eventProject: "p2" }];
  for (const scope of cases) {
    const admin = automationsAdmin({ leasing: true }, scope);
    const res = await runAutomations({ admin, now });
    assert.deepEqual(res.errors, [], JSON.stringify(scope));
    assert.equal(res.created, 0, JSON.stringify(scope));
    assert.ok(!admin.calls.some((c) => c.table === "automation_runs" && c.op === "upsert"), JSON.stringify(scope));
    const marked = admin.calls.find((c) => c.table === "automation_events" && c.prop === "update");
    assert.equal(marked?.args[0].status, "ignored", JSON.stringify(scope));
  }
  // The cron pass asks only for workflows that have a project.
  const cron = automationsAdmin({ leasing: true });
  await runAutomations({ admin: cron, now });
  assert.ok(cron.calls.some((c) => c.table === "automations" && c.prop === "not" && c.args[0] === "project_id"));
});

// Signals for p1: an application waiting 38 days, which application_pending flags; every other source is empty.
function signalsAdmin(modulesValue) {
  return fakeAdmin((table, op, meta) => {
    if (table === "settings") return { data: meta.eq.key === "modules" ? [{ value: modulesValue }] : [], error: null };
    if (table === "applications" && op === "select") {
      const row = { id: "app1", project_id: "p1", name: "Pat Applicant", status: "Submitted", applied_on: "2026-10-01", property_id: "prop1", created_at: "2026-10-01T00:00:00Z", metadata: {} };
      return { data: [row], error: null };
    }
    return { data: [], error: null };
  });
}
const upsertedDetectors = (admin) => admin.calls.filter((c) => c.table === "signals" && c.prop === "upsert").flatMap((c) => c.args[0].map((r) => r.detector_key));

test("runProjectSignals skips application_pending while Leasing is off", async () => {
  const now = new Date("2026-11-08T12:00:00Z");
  const on = signalsAdmin({});
  await runProjectSignals(on, "p1", { now });
  assert.ok(upsertedDetectors(on).includes("application_pending"), "Leasing on: the waiting application is flagged");

  const off = signalsAdmin({ leasing: false });
  await runProjectSignals(off, "p1", { now });
  assert.ok(!upsertedDetectors(off).includes("application_pending"), "Leasing off: application_pending doesn't run");
});
