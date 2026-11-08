import { test } from "node:test";
import assert from "node:assert/strict";
import { forProject, forProjectOrAll, getActiveProjectId, scopeQuery, scopeReference, setActiveProjectId, stampProject } from "./scope";

// A query builder that records each filter call.
const recorder = () => {
  const calls = [];
  const q = new Proxy({}, { get: (_, prop) => (...args) => (calls.push([prop, ...args]), q) });
  return { q, calls };
};

test("forProject narrows to one project and throws without one", () => {
  const { q, calls } = recorder();
  forProject(q, "p1");
  assert.deepEqual(calls, [["eq", "project_id", "p1"]]);
  for (const missing of [null, undefined, ""]) assert.throws(() => forProject(recorder().q, missing), /project is required/);
});

test("forProjectOrAll is one project for Run now, every project (never a project-less row) for cron", () => {
  const one = recorder();
  forProjectOrAll(one.q, "p1");
  assert.deepEqual(one.calls, [["eq", "project_id", "p1"]]);
  const all = recorder();
  forProjectOrAll(all.q, null);
  assert.deepEqual(all.calls, [["not", "project_id", "is", null]]);
});

test("scopeQuery reads only the active project, and no rows without one", () => {
  setActiveProjectId(null);
  const none = recorder();
  scopeQuery(none.q);
  assert.equal(none.calls.length, 1);
  assert.equal(none.calls[0][0], "eq");
  assert.equal(none.calls[0][1], "project_id");
  assert.match(none.calls[0][2], /^0{8}-0{4}-0{4}-0{4}-0{12}$/);

  setActiveProjectId("p1");
  assert.equal(getActiveProjectId(), "p1");
  const one = recorder();
  scopeQuery(one.q);
  assert.deepEqual(one.calls, [["eq", "project_id", "p1"]]);
  setActiveProjectId(null);
});

test("scopeReference keeps global reference rows next to the project's own", () => {
  setActiveProjectId(null);
  const none = recorder();
  scopeReference(none.q);
  assert.deepEqual(none.calls, [["is", "project_id", null]]);

  setActiveProjectId("p1");
  const one = recorder();
  scopeReference(one.q);
  assert.deepEqual(one.calls, [["or", "project_id.is.null,project_id.eq.p1"]]);
  setActiveProjectId(null);
});

test("stampProject fills the active project unless the payload has one", () => {
  setActiveProjectId(null);
  assert.deepEqual(stampProject({ name: "a" }), { name: "a" });
  setActiveProjectId("p1");
  assert.deepEqual(stampProject({ name: "a" }), { name: "a", project_id: "p1" });
  assert.deepEqual(stampProject({ name: "a", project_id: "p2" }), { name: "a", project_id: "p2" });
  setActiveProjectId(null);
});
