import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

import { TURN_TTL_SECONDS, isTurnConfigured, turnCredentials, turnUrls } from "./turn.js";

const env = { TURN_URLS: "turn:turn.example.com:3478?transport=udp, turns:turn.example.com:5349 stun:ignored", TURN_SECRET: "s3cret" };

test("turn: credentials expire, name the user and verify against the shared secret", () => {
  const now = Date.UTC(2026, 10, 8, 12);
  const c = turnCredentials("user-1", { now, env });
  const expires = now / 1000 + TURN_TTL_SECONDS;
  assert.equal(c.username, `${expires}:user-1`);
  assert.equal(c.credential, createHmac("sha1", "s3cret").update(c.username).digest("base64"));
  assert.equal(c.expiresAt, new Date(expires * 1000).toISOString());
  assert.deepEqual(c.urls, ["turn:turn.example.com:3478?transport=udp", "turns:turn.example.com:5349"]);
  assert.notEqual(turnCredentials("user-2", { now, env }).credential, c.credential, "per user");
});

test("turn: nothing without URLs, a secret or a user", () => {
  assert.equal(isTurnConfigured({}), false);
  assert.equal(turnCredentials("u", { env: { TURN_URLS: env.TURN_URLS } }), null);
  assert.equal(turnCredentials("u", { env: { TURN_SECRET: "x" } }), null);
  assert.equal(turnCredentials(null, { env }), null);
  assert.deepEqual(turnUrls({ TURN_URLS: "stun:only" }), []);
});

test("turn: the browser never reads a TURN secret from a public env var", () => {
  const client = readFileSync("lib/supabase/chat_call_signaling.js", "utf8");
  assert.doesNotMatch(client, /NEXT_PUBLIC_TURN/);
  assert.match(client, /\/api\/chat\/turn/);
});
