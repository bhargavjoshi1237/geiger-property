import "server-only";
import { createHmac } from "node:crypto";

import { getPublicListing, getSiteByHandle } from "@/lib/leasing/public/site";
import { isValidHandle } from "@/lib/leasing/slug";
import { clip, cleanUrl, cleanUtm, normalizeEmail, normalizePhone } from "./contact";
import { ingestLead } from "./intake";
import { verifyTurnstile } from "./turnstile";

// The public inquiry form's server side (LEAS-02): POST /api/public/leads from a listing page or the embed widget.
// Order: honeypot, field checks, a per-IP ceiling, then Turnstile (tokens are single-use), then ingestLead. A refusal
// writes nothing. The site and listing come from the handle and slug through LEAS-01's public reads, so a request can
// only reach an enabled site's live listing, and the answer never carries a project or prospect id.

export const RATE_LIMIT = { max: 20, windowMs: 60_000 };
const SLUG = /^[a-z0-9-]{1,80}$/;

const fail = (status, error, field) => ({ status, json: { ok: false, error, ...(field ? { field } : {}) } });

// The client IP from the platform's forwarding headers (Vercel sets x-forwarded-for; the first entry is the client).
export function clientIp(headers) {
  const get = (k) => (typeof headers?.get === "function" ? headers.get(k) : headers?.[k]) || "";
  return clip(String(get("x-forwarded-for")).split(",")[0], 64) || clip(get("x-real-ip"), 64) || "";
}

// A keyed hash of the IP for the inquiry row and the rate limit (the raw IP is kept only on a consent's proof).
export const ipHashOf = (ip, key = process.env.TURNSTILE_SECRET_KEY || "leads") => (ip ? createHmac("sha256", key).update(ip).digest("hex").slice(0, 32) : null);

// Inquiries this IP filed in the window, across every project.
async function recentFromIp(db, ipHash, now) {
  if (!ipHash) return 0;
  const since = new Date(now.getTime() - RATE_LIMIT.windowMs).toISOString();
  const { count, error } = await db
    .from("record_items")
    .select("id", { count: "exact", head: true })
    .eq("kind", "inquiry")
    .eq("metadata->>ipHash", ipHash)
    .gte("created_at", since)
    .is("deleted_at", null);
  if (error) throw new Error(error.message);
  return count || 0;
}

// The submitted fields, trimmed and bounded → { input } or { error, field }.
export function readForm(body = {}) {
  const b = body && typeof body === "object" ? body : {};
  const input = {
    handle: clip(b.handle, 40).toLowerCase(),
    listingSlug: clip(b.listingSlug, 80).toLowerCase(),
    name: clip(b.name, 120),
    email: clip(b.email, 254),
    phone: clip(b.phone, 40),
    message: clip(b.message, 2000),
    consent: b.consent === true || b.consent === "true" || b.consent === "on",
    consentText: clip(b.consentText, 1000),
    utm: cleanUtm(b.utm),
    referrer: cleanUrl(b.referrer),
    landingUrl: cleanUrl(b.landingUrl || b.pageUrl),
    turnstileToken: String(b.turnstileToken || b["cf-turnstile-response"] || ""),
    hp: String(b.hp ?? ""),
  };
  if (!isValidHandle(input.handle)) return { error: "This form isn't linked to a leasing site." };
  if (input.listingSlug && !SLUG.test(input.listingSlug)) return { error: "This home isn't available." };
  if (!input.name) return { error: "Enter your name.", field: "name" };
  if (!input.email && !input.phone) return { error: "Enter an email or a phone number so we can reply.", field: "email" };
  if (input.email && !normalizeEmail(input.email)) return { error: "Enter a valid email address.", field: "email" };
  if (input.phone && !normalizePhone(input.phone)) return { error: "Enter a valid phone number.", field: "phone" };
  if (input.consent && !input.phone) return { error: "Enter a phone number to get texts, or untick the box.", field: "phone" };
  return { input };
}

// handlePublicLead({ body, headers }, deps) → { status, json }.
export async function handlePublicLead({ body, headers } = {}, deps = {}) {
  const db = deps.db;
  const now = deps.now ? new Date(deps.now) : new Date();
  if (!db) return fail(503, "Inquiries can't be taken right now.");
  if (String(body?.hp ?? "").trim()) return fail(400, "We couldn't send your message.");
  if (!String(body?.turnstileToken || body?.["cf-turnstile-response"] || "").trim()) return fail(400, "Please complete the check and try again.");

  const { input, error, field } = readForm(body);
  if (error) return fail(400, error, field);

  const ip = clientIp(headers);
  const ipHash = ipHashOf(ip, deps.ipKey);
  if ((await recentFromIp(db, ipHash, now)) >= RATE_LIMIT.max) return fail(429, "Too many messages from this connection. Try again in a minute.");

  const check = await (deps.verify || verifyTurnstile)(input.turnstileToken, { ip });
  if (!check.ok) {
    if (check.reason === "not_configured") return fail(503, "The inquiry form isn't set up yet. Call or email the office instead.");
    if (check.reason === "unreachable") return fail(503, "We couldn't check your submission. Try again in a moment.");
    return fail(400, "Please complete the check and try again.");
  }

  const site = await getSiteByHandle(input.handle, { db });
  if (!site) return fail(404, "This leasing site isn't available.");
  let listingId = null;
  if (input.listingSlug) {
    const res = await getPublicListing(site, input.listingSlug, { db });
    if (res?.state !== "live") return fail(404, "This home is no longer taking inquiries.");
    listingId = res.listing.id;
  }

  const userAgent = clip(typeof headers?.get === "function" ? headers.get("user-agent") : headers?.["user-agent"], 400);
  const result = await (deps.ingest || ingestLead)(
    db,
    {
      projectId: site.projectId,
      listingId,
      channel: "web_form",
      source: "Website",
      contact: { name: input.name, email: input.email, phone: input.phone },
      message: input.message,
      utm: input.utm,
      referrer: input.referrer,
      landingUrl: input.landingUrl,
      consent: input.consent ? { given: true, text: input.consentText, ip, userAgent } : null,
      ipHash,
      receivedAt: now.toISOString(),
    },
    deps.ingestDeps,
  );
  if (!result.ok) return fail(500, "We couldn't send your message. Try again, or call the office.");
  return { status: 200, json: { ok: true } };
}
