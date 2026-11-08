import { test } from "node:test";
import assert from "node:assert/strict";
import { rowsIn } from "./http";
import { residentLines } from "./ledger";

// PLAT-01e: every portal read by id stays inside the member's project.

// A fake service-role client: `handler(q)` answers each query; every query is kept in `queries`.
function fakeDb(handler = () => ({ data: [], error: null })) {
  const queries = [];
  const from = (table) => {
    const q = { table, filters: [] };
    queries.push(q);
    const builder = new Proxy(
      {},
      {
        get(_, prop) {
          if (prop === "then") return (ok, fail) => Promise.resolve(handler(q)).then(ok, fail);
          return (...args) => {
            if (prop !== "select") q.filters.push([prop, ...args]);
            return builder;
          };
        },
      },
    );
    return builder;
  };
  return { queries, from };
}

const projectOf = (q) => q.filters.find((f) => f[0] === "eq" && f[1] === "project_id")?.[2];

test("rowsIn narrows every chunk to the project and refuses to run without one", async () => {
  const db = fakeDb();
  const ids = Array.from({ length: 160 }, (_, i) => `id${i}`);
  await rowsIn(db, "leases", "id", ids, "t", { projectId: "p1" });
  assert.equal(db.queries.length, 2);
  assert.deepEqual(db.queries.map(projectOf), ["p1", "p1"]);
  await assert.rejects(rowsIn(db, "leases", "id", ids, "t"), /project is required/);
  await assert.rejects(rowsIn(db, "leases", "id", [], "t"), /project is required/);
});

test("portal ledger lines and their entries are read inside the member's project only", async () => {
  const db = fakeDb((q) =>
    q.table === "ledger_lines"
      ? { data: [{ id: "l1", entry_id: "e1", tenant_id: "t1", debit: 10, credit: 0 }], error: null }
      : { data: [{ id: "e1", status: "posted" }], error: null },
  );
  await residentLines(db, "p1", "t1", ["lease1"]);
  assert.deepEqual(db.queries.map((q) => [q.table, projectOf(q)]), [["ledger_lines", "p1"], ["ledger_entries", "p1"]]);
  await assert.rejects(residentLines(fakeDb(), null, "t1"), /project is required/);
});
