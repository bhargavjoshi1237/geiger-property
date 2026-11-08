import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { extraAccountRows, ensureExtraAccounts } from "./chart";
import { loadAccountIndex, postBuilt } from "./store";

// CORE-40: the period lock lives in the database (triggers on both ledger tables, ledger_void's first-open-day reversal); later migrations
// that redefine these keep them. Extra system accounts seed through ledger_ensure_accounts.

const DIR = path.resolve("supabase/migrations");
const migrations = () =>
  readdirSync(DIR, { recursive: true })
    .filter((f) => String(f).endsWith(".sql"))
    .map((f) => ({ name: path.basename(String(f)), sql: readFileSync(path.join(DIR, String(f)), "utf8") }))
    .sort((a, b) => a.name.localeCompare(b.name));
const upOf = (sql) => (sql.includes("-- @up") ? sql.split("-- @up")[1].split("-- @down")[0] : sql).replace(/--[^\n]*/g, "").toLowerCase();

// The newest @up text defining `fn`, or the newest migration touching `needle`.
function newest(fn) {
  let found = null;
  for (const m of migrations()) {
    const up = upOf(m.sql);
    const at = up.search(new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+property\\.${fn}\\s*\\(`));
    if (at >= 0) found = { name: m.name, body: up.slice(at, up.indexOf("$$;", up.indexOf("$$", at) + 2) + 3) };
  }
  return found;
}

test("period lock: both ledger tables carry a before insert/update/delete lock trigger, and no later migration drops it", () => {
  for (const t of ["ledger_entries", "ledger_lines"]) {
    const created = migrations().filter((m) => upOf(m.sql).includes(`create trigger ${t}_period_lock before insert or update or delete on property.${t}`));
    assert.ok(created.length, `${t}_period_lock is created`);
    const last = created[created.length - 1].name;
    const dropped = migrations().filter((m) => m.name > last && new RegExp(`drop trigger if exists ${t}_period_lock\\b`).test(upOf(m.sql)));
    assert.deepEqual(dropped.map((m) => m.name), [], `${t}_period_lock is dropped later without being recreated`);
    const fn = newest(`${t}_period_lock`);
    assert.match(fn.body, /security definer/);
    assert.match(fn.body, /errcode = 'gl001'/);
    assert.match(fn.body, /period closed through/);
  }
});

test("period lock: the newest ledger_void dates a reversal past the lock", () => {
  const def = newest("ledger_void");
  assert.ok(def.body.includes("property.accounting_periods"), `${def.name}: ledger_void must read the lock date`);
  assert.match(def.body, /greatest\(coalesce\(p_date, current_date\), v_entry\.entry_date, v_locked \+ 1\)/);
});

test("period lock: close / reopen / ensure_accounts stay definer with their permission checks", () => {
  for (const [fn, key] of [
    ["accounting_period_close", "property.accounting.close"],
    ["accounting_period_reopen", "property.accounting.close"],
    ["ledger_ensure_accounts", "property.accounting.post"],
  ]) {
    const def = newest(fn);
    assert.ok(def, `${fn} is defined`);
    assert.match(def.body, /security definer/);
    assert.match(def.body, /set search_path = ''/);
    assert.ok(def.body.includes("property.is_trusted_session()") && def.body.includes(`property.rbac_allows('${key}'`), `${fn} checks ${key}`);
  }
});

// A fake client: gl_accounts reads answer `accounts()`, rpc(name) answers each RPC.
function fakeDb(accounts, rpc) {
  const calls = [];
  const query = { select: () => query, is: () => query, eq: () => query, then: (ok, fail) => Promise.resolve({ data: accounts(), error: null }).then(ok, fail) };
  return { calls, from: () => query, rpc: async (name, args) => (calls.push([name, args]), rpc(name, args)) };
}
const DEFAULT_KEYS = [
  "operating_cash", "trust_cash", "deposit_cash", "accounts_receivable", "accounts_payable", "security_deposits", "owner_distributions", "owner_contributions",
  "rent_income", "late_fee_income", "management_fees", "management_fee_income", "undeposited_funds", "deferred_receivable", "other_deposits", "subsidy_receivable",
];
const row = (system_key) => ({ id: system_key, name: system_key, account_type: "Asset", system_key });

test("chart: retained_earnings 3900 seeds through ledger_ensure_accounts when an account load finds it missing", async () => {
  assert.deepEqual(extraAccountRows(["retained_earnings", "nope"]), [
    { system_key: "retained_earnings", number: "3900", name: "Retained Earnings", account_type: "Equity", subtype: "equity", is_trust: false, parent_key: null },
  ]);
  let seeded = false;
  const db = fakeDb(
    () => [...DEFAULT_KEYS.map(row), ...(seeded ? [row("retained_earnings")] : [])],
    (name) => ((seeded = name === "ledger_ensure_accounts"), { data: 1, error: null }),
  );
  const idx = await loadAccountIndex(db, "p1");
  assert.deepEqual(db.calls.map((c) => c[0]), ["ledger_ensure_accounts"]);
  assert.equal(db.calls[0][1].p_accounts[0].system_key, "retained_earnings");
  assert.ok(idx.byKey.has("retained_earnings"));
  const again = fakeDb(() => [...DEFAULT_KEYS.map(row), row("retained_earnings")], () => ({ data: 0, error: null }));
  await loadAccountIndex(again, "p1");
  assert.deepEqual(again.calls, [], "nothing to seed");
});

test("chart: a reader who may not seed extras keeps the chart; ensureExtraAccounts needs a project", async () => {
  const db = fakeDb(() => DEFAULT_KEYS.map(row), () => ({ data: null, error: { code: "42501", message: "You don't have permission to set up the chart of accounts." } }));
  const idx = await loadAccountIndex(db, "p1");
  assert.equal(idx.byKey.has("retained_earnings"), false);
  await assert.rejects(ensureExtraAccounts(db, null), /project is required/);
});

test("store: a period-lock refusal reads as a sentence with code GL001 and status 409", async () => {
  const db = fakeDb(() => [], () => ({ data: null, error: { code: "GL001", message: "ledger: period closed through 2027-03-31" } }));
  await assert.rejects(postBuilt(db, { entry: { date: "2027-03-15" }, lines: [] }, { projectId: "p1" }), (e) => {
    assert.equal(e.code, "GL001");
    assert.equal(e.status, 409);
    assert.equal(e.lockedThrough, "2027-03-31");
    assert.match(e.message, /^The books are closed through Mar 31, 2027\. Date it Apr 1, 2027 or later/);
    return true;
  });
});
