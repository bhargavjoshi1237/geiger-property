import { test } from "node:test";
import assert from "node:assert/strict";

import { requireStaff } from "./staff";

// PLAT-01f: requireStaff fails closed before it touches the network — no declared permission, no Supabase, no project,
// a malformed project id, or no session (a cookie-less call without a bearer token).

const PROJECT = "ebcc7910-1a0e-4e91-8c3b-752f3c4292d3";
const request = (headers = {}) => new Request("https://example.test/api", { method: "POST", headers });

async function withEnv(env, fn) {
  const keys = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"];
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  for (const k of keys) {
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
  try {
    return await fn();
  } finally {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

const configured = { NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon" };
const status = (res) => [res.ok, res.status];

test("requireStaff: a route that declares no permission is refused", async () => {
  await withEnv(configured, async () => {
    assert.deepEqual(status(await requireStaff(request(), PROJECT)), [false, 500]);
    assert.deepEqual(status(await requireStaff(request(), PROJECT, { denied: "No." })), [false, 500]);
    assert.deepEqual(status(await requireStaff(request(), PROJECT, { permission: [], anyOf: [] })), [false, 500]);
  });
});

test("requireStaff: no Supabase, no project or a malformed project id", async () => {
  const declared = { permission: "property.message.send" };
  await withEnv({}, async () => assert.deepEqual(status(await requireStaff(request(), PROJECT, declared)), [false, 503]));
  await withEnv(configured, async () => {
    assert.deepEqual(status(await requireStaff(request(), null, declared)), [false, 400]);
    assert.deepEqual(status(await requireStaff(request(), "not-a-uuid", declared)), [false, 400]);
  });
});

test("requireStaff: without a session cookie or bearer token the caller must sign in", async () => {
  await withEnv(configured, async () => {
    const res = await requireStaff(request(), PROJECT, { permission: "property.message.send" });
    assert.deepEqual([res.ok, res.status, res.error], [false, 401, "Sign in to continue."]);
  });
});
