import "server-only";
import { createHmac } from "node:crypto";

// Short-lived TURN credentials (PLAT-01h), the TURN REST scheme coturn's `use-auth-secret` checks: username "<expiry>:<user>",
// credential base64(HMAC-SHA1(TURN_SECRET, username)). The secret never leaves the server; /api/chat/turn hands these out.

export const TURN_TTL_SECONDS = 60 * 60;

export const turnUrls = (env = process.env) =>
  String(env.TURN_URLS || "")
    .split(/[\s,]+/)
    .filter((u) => /^turns?:/.test(u));

export const isTurnConfigured = (env = process.env) => Boolean(turnUrls(env).length && env.TURN_SECRET);

// → { urls, username, credential, expiresAt } for one signed-in user, or null when TURN isn't configured.
export function turnCredentials(userId, { now = Date.now(), ttl = TURN_TTL_SECONDS, env = process.env } = {}) {
  if (!userId || !isTurnConfigured(env)) return null;
  const expires = Math.floor(now / 1000) + ttl;
  const username = `${expires}:${userId}`;
  const credential = createHmac("sha1", env.TURN_SECRET).update(username).digest("base64");
  return { urls: turnUrls(env), username, credential, expiresAt: new Date(expires * 1000).toISOString() };
}
