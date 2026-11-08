import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { permissionKeys } from "@geiger/rbac";
import rbacConfig from "@/geiger-rbac.config";
import { demandMet, permissionDemand } from "./permissions";
import { OPEN_ROUTES, PORTAL_GUARDS, SCREENING_ROUTE_PREFIXES, STAFF_ROUTES } from "./route_permissions";

// PLAT-01f: every handler under app/api is either a staff route that declares its permission (and matches the map),
// an open route calling its own guard, or a portal route behind the portal session.

const API = path.resolve("app/api");
const CATALOG = new Set(permissionKeys(rbacConfig));
const HANDLER = /^export (?:async function (GET|POST|PUT|PATCH|DELETE)\b|const (GET|POST|PUT|PATCH|DELETE)\s*=)/gm;

// Each exported handler with its source, up to the next handler.
function handlersOf(src) {
  const marks = [...src.matchAll(HANDLER)].map((m) => ({ method: m[1] || m[2], at: m.index }));
  return marks.map((m, i) => ({ method: m.method, body: src.slice(m.at, marks[i + 1]?.at ?? src.length) }));
}

// The argument text of the first `name(` call, balancing brackets.
function callArgs(body, name) {
  const at = body.search(new RegExp(`\\b${name}\\(`));
  if (at < 0) return null;
  let depth = 0;
  const start = body.indexOf("(", at);
  for (let i = start; i < body.length; i += 1) {
    if ("([{".includes(body[i])) depth += 1;
    if (")]}".includes(body[i]) && --depth === 0) return body.slice(start + 1, i);
  }
  return null;
}

// Split call arguments at top-level commas.
function topLevel(args) {
  const out = [];
  let depth = 0;
  let cur = "";
  for (const ch of args) {
    if ("([{".includes(ch)) depth += 1;
    if (")]}".includes(ch)) depth -= 1;
    if (ch === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

// String literals only: a key behind a constant or a call can't be checked here, so it doesn't count as declared.
function literals(expr) {
  const text = String(expr || "").trim();
  if (!/^(\[\s*)?"[^"]*"(\s*,\s*"[^"]*")*\s*,?\s*\]?$/.test(text)) return null;
  return [...text.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
}

// What a handler declares: { permission, anyOf } from requireStaff's options or billingAccess's keys, else null.
function declaredPermission(body) {
  const staff = callArgs(body, "requireStaff");
  if (staff !== null) {
    const options = topLevel(staff)[2];
    if (!options?.startsWith("{")) return null;
    const permission = options.match(/\bpermission:\s*(\[[^\]]*\]|"[^"]*")/)?.[1];
    const anyOf = options.match(/\banyOf:\s*(\[[^\]]*\])/)?.[1];
    // A permission or anyOf option that isn't string literals can't be checked.
    if ((/\bpermission:/.test(options) && !permission) || (/\banyOf:/.test(options) && !anyOf)) return null;
    const all = permission ? literals(permission) : [];
    const any = anyOf ? literals(anyOf) : [];
    if (!all || !any || (!all.length && !any.length)) return null;
    return { permission: all, anyOf: any };
  }
  const billing = callArgs(body, "billingAccess");
  if (billing !== null) {
    const keys = topLevel(billing)[2];
    const list = literals(keys);
    if (!list?.length) return null;
    return keys.trim().startsWith("[") ? { permission: [], anyOf: list } : { permission: list, anyOf: [] };
  }
  return null;
}

// The map entry in the same shape.
const expected = (entry) => {
  const { all, any } = permissionDemand(typeof entry === "string" || Array.isArray(entry) ? { permission: entry } : entry);
  return { permission: all, anyOf: any };
};

function apiHandlers() {
  return readdirSync(API, { recursive: true })
    .map(String)
    .filter((f) => path.basename(f) === "route.js")
    .flatMap((f) => {
      const route = path.dirname(f).split(path.sep).join("/");
      return handlersOf(readFileSync(path.join(API, f), "utf8")).map((h) => ({ id: `${h.method} ${route}`, route, body: h.body }));
    });
}

const isPortal = (route) => route.startsWith("portal/") && !route.startsWith("portal/staff/");

test("route map: every staff handler declares the permission the map lists", () => {
  const problems = [];
  for (const h of apiHandlers()) {
    if (OPEN_ROUTES[h.id] || isPortal(h.route)) continue;
    const declared = declaredPermission(h.body);
    if (!declared) {
      problems.push(`${h.id}: no declared permission — call requireStaff(request, projectId, { permission: "property.<key>" }) with string literals`);
      continue;
    }
    if (!STAFF_ROUTES[h.id]) {
      problems.push(`${h.id}: declares ${JSON.stringify(declared)} but isn't in STAFF_ROUTES (lib/auth/route_permissions.js)`);
      continue;
    }
    const listed = expected(STAFF_ROUTES[h.id]);
    if (JSON.stringify(declared) !== JSON.stringify(listed)) {
      problems.push(`${h.id}: declares ${JSON.stringify(declared)}, lib/auth/route_permissions.js lists ${JSON.stringify(listed)}`);
    }
  }
  assert.deepEqual(problems, []);
});

test("route map: open and portal handlers call their own guard", () => {
  for (const h of apiHandlers()) {
    if (OPEN_ROUTES[h.id]) {
      assert.ok(h.body.includes(`${OPEN_ROUTES[h.id].guard}(`), `${h.id} should call ${OPEN_ROUTES[h.id].guard}()`);
      assert.equal(declaredPermission(h.body), null, `${h.id} is listed as open but calls a staff guard`);
    } else if (isPortal(h.route)) {
      assert.ok(PORTAL_GUARDS.some((g) => h.body.includes(`${g}(`)), `${h.id} is a portal route without withPortal / requirePortal`);
    }
  }
});

test("route map: no stale entries, and every key is in the permission catalog", () => {
  const ids = new Set(apiHandlers().map((h) => h.id));
  for (const id of [...Object.keys(STAFF_ROUTES), ...Object.keys(OPEN_ROUTES)]) assert.ok(ids.has(id), `${id} has no handler in app/api`);
  for (const [id, entry] of Object.entries(STAFF_ROUTES)) {
    const { keys } = permissionDemand(typeof entry === "string" || Array.isArray(entry) ? { permission: entry } : entry);
    assert.ok(keys.length, `${id} declares no key`);
    for (const key of keys) assert.ok(CATALOG.has(key), `${id}: ${key} isn't a catalog key (geiger-rbac.config.js)`);
  }
});

test("route map: the PLAT-01f spec table", () => {
  const spec = {
    "POST messages/send": "property.message.send",
    "POST messages/announce": "property.message.send",
    "POST payments/checkout": "property.payment.collect",
    "POST payments/options": "property.payment.collect",
    "POST payments/autopay": "property.payment.collect",
    "POST payments/cancel": "property.payment.collect",
    "POST payments/refund": "property.payment.refund",
    "POST payments/sync": "property.accounting.view",
    "GET payments/status": "property.accounting.view",
    "POST cron/[job]": "property.settings.manage",
    "POST cron/run-due": "property.settings.manage",
    "GET cron/jobs": "property.settings.manage",
    "POST portal/staff/access": "property.portal.manage",
  };
  for (const [id, key] of Object.entries(spec)) assert.deepEqual(expected(STAFF_ROUTES[id]), { permission: [key], anyOf: [] }, id);
  // Ledger-posting routes carry the same key ledger_post checks (PLAT-01c).
  for (const id of ["POST accounting/bills", "POST billing/payments", "POST billing/leases/[leaseId]/bill", "POST billing/deposits/[id]/charge"]) {
    assert.deepEqual(expected(STAFF_ROUTES[id]).permission, ["property.accounting.post"], id);
  }
});

// RISK-03: screening, identity and income routes are gated by the screening keys, and report routes by view_reports.
const SCREENING = "property.screening.";
function screeningRouteIssue(id, entry) {
  const route = id.split(" ")[1];
  if (!SCREENING_ROUTE_PREFIXES.some((p) => route.startsWith(p))) return null;
  if (!entry) return `${id}: a screening route must be a staff route with a screening key`;
  const { all, any } = permissionDemand(typeof entry === "string" || Array.isArray(entry) ? { permission: entry } : entry);
  if (!all.some((k) => k.startsWith(SCREENING)) && !(any.length && any.every((k) => k.startsWith(SCREENING)))) {
    return `${id}: declares no property.screening.* key (an any-of list must hold only screening keys)`;
  }
  if (route.split("/").some((seg) => seg === "report" || seg === "reports") && !all.includes(`${SCREENING}view_reports`)) {
    return `${id}: report routes require property.screening.view_reports`;
  }
  return null;
}

test("route map: screening, identity and income routes declare screening keys; reports need view_reports", () => {
  // Open routes (a vendor webhook, an applicant's token link) carry their own guard, checked above.
  const problems = apiHandlers()
    .filter((h) => !OPEN_ROUTES[h.id])
    .map((h) => screeningRouteIssue(h.id, STAFF_ROUTES[h.id]))
    .filter(Boolean);
  assert.deepEqual(problems, []);
  assert.deepEqual(expected(STAFF_ROUTES["GET screening/applications/[applicationId]/report"]), {
    permission: ["property.screening.view_reports"],
    anyOf: [],
  });
  // The rule itself: a view key, a mixed any-of, an open route and a report without view_reports are all caught.
  assert.match(screeningRouteIssue("GET screening/orders", "property.applications.view"), /no property\.screening/);
  assert.match(screeningRouteIssue("GET income/x", { anyOf: ["property.screening.order", "property.accounting.post"] }), /no property\.screening/);
  assert.match(screeningRouteIssue("POST identity/sessions", undefined), /must be a staff route/);
  assert.match(screeningRouteIssue("GET screening/orders/[id]/report", "property.screening.order"), /view_reports/);
  assert.equal(screeningRouteIssue("POST screening/orders", ["property.screening.order", "property.accounting.post"]), null);
  assert.equal(screeningRouteIssue("GET billing/x", "property.accounting.post"), null);
});

test("route scanner: a handler without a declared permission is caught", () => {
  const bare = `export async function POST(request) {\n  const auth = await requireStaff(request, projectId);\n}\n`;
  const constant = `export async function POST(request) {\n  const auth = await requireStaff(request, projectId, { permission: KEY, anyOf: ["a.b"] });\n}\n`;
  const none = `export async function GET() {\n  return Response.json({});\n}\n`;
  for (const src of [bare, constant, none]) assert.equal(declaredPermission(handlersOf(src)[0].body), null);
  const ok = `export const GET = 1;\nexport async function POST(request) {\n  const a = await requireStaff(request, id, { anyOf: ["a.b", "c.d"], denied: "No." });\n}\n`;
  const [get, post] = handlersOf(ok);
  assert.equal(get.method, "GET");
  assert.deepEqual(declaredPermission(post.body), { permission: [], anyOf: ["a.b", "c.d"] });
  assert.deepEqual(declaredPermission(`billingAccess(request, projectId, "x.y", "No.")`), { permission: ["x.y"], anyOf: [] });
  assert.deepEqual(declaredPermission(`billingAccess(request, projectId, ["x.y", "z.w"], "No.")`), { permission: [], anyOf: ["x.y", "z.w"] });
  assert.equal(declaredPermission(`billingAccess(request, projectId, [KEY, "z.w"], "No.")`), null);
});

test("permission demand: all-of, any-of and an empty demand", () => {
  const held = new Set(["property.a.view", "property.b.post"]);
  assert.equal(demandMet(permissionDemand({ permission: "property.a.view" }), held), true);
  assert.equal(demandMet(permissionDemand({ permission: ["property.a.view", "property.c.void"] }), held), false);
  assert.equal(demandMet(permissionDemand({ anyOf: ["property.c.void", "property.b.post"] }), held), true);
  assert.equal(demandMet(permissionDemand({ anyOf: ["property.c.void"] }), held), false);
  assert.equal(demandMet(permissionDemand({}), held), false);
  assert.deepEqual(permissionDemand({ permission: "accounting.post" }).all, ["property.accounting.post"]);
});
