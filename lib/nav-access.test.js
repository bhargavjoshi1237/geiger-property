import test from "node:test";
import assert from "node:assert/strict";
import { filterNavByAccess } from "./nav-access.js";

const nav = [
  { title: "Overview" },
  { title: "Money", subItems: [{ title: "Bills" }, { title: "Bank Accounts" }] },
  { title: "People", subItems: [{ title: "Owners" }] },
];

test("drops denied pages and empties sections", () => {
  const out = filterNavByAccess(nav, (t) => !["Owners", "Bank Accounts"].includes(t));
  assert.deepEqual(out.map((i) => i.title), ["Overview", "Money"]);
  assert.deepEqual(out[1].subItems.map((s) => s.title), ["Bills"]);
});

test("top-level role check applies only to top-level items", () => {
  const out = filterNavByAccess(nav, (t, top) => !(top && t === "Overview"));
  assert.equal(out[0].title, "Money");
  assert.equal(out[1].subItems.length, 1);
});

test("empty nav", () => {
  assert.deepEqual(filterNavByAccess(null, () => true), []);
});
