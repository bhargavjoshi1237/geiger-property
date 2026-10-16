import { createClient as createServerClient } from "@/utils/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { PORTAL_ROLES, PORTAL_SETTINGS_KEY } from "./constants";
import { meta, rowOf, rowsOf } from "./http";

// Server-only portal session: the signed-in Supabase user (shared suite auth
// cookie) → their portal_members rows → the active member and its party record.
// Every /api/portal route resolves through requirePortal() and then reads or
// writes only that member's records with the service-role client.

const SEEN_EVERY_MS = 5 * 60 * 1000;

export async function getAuthUser() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return null;
  try {
    const sb = await createServerClient();
    const { data } = await sb.auth.getUser();
    return data?.user ?? null;
  } catch {
    return null;
  }
}

// Per-project branding_portals values (toggles + brand), keyed by project id ("" = unscoped).
export async function loadPortalSettings(admin, projectIds) {
  const ids = [...new Set(projectIds.filter(Boolean))];
  let q = admin.from("settings").select("project_id, value").eq("key", PORTAL_SETTINGS_KEY).is("deleted_at", null);
  q = ids.length ? q.or(`project_id.in.(${ids.join(",")}),project_id.is.null`) : q.is("project_id", null);
  const rows = await rowsOf(q, "settings");
  const out = {};
  for (const r of rows) out[r.project_id || ""] = r.value && typeof r.value === "object" ? r.value : {};
  return out;
}

export const settingsFor = (settings, projectId) => settings[projectId || ""] || {};

export const roleEnabled = (settings, projectId, role) =>
  Boolean(settingsFor(settings, projectId)[PORTAL_ROLES[role]?.toggle]);

async function projectNames(admin, ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return {};
  const rows = await rowsOf(admin.schema("public").from("projects").select("id, name").in("id", unique), "projects");
  return Object.fromEntries(rows.map((r) => [r.id, r.name || ""]));
}

// Members for an auth user: rows already linked to them plus invites to their email.
async function membersFor(admin, user) {
  const email = String(user.email || "").trim().toLowerCase();
  const [linked, invited] = await Promise.all([
    rowsOf(admin.from("portal_members").select("*").eq("auth_user_id", user.id).is("deleted_at", null), "members"),
    email
      ? rowsOf(admin.from("portal_members").select("*").eq("email", email).is("deleted_at", null), "members")
      : [],
  ]);
  const byId = new Map();
  for (const m of [...linked, ...invited]) {
    // An email match already claimed by another login stays theirs.
    if (m.auth_user_id && m.auth_user_id !== user.id) continue;
    byId.set(m.id, m);
  }
  return [...byId.values()];
}

// Link first sign-ins, flip invites to active and stamp last seen (best effort).
async function touchMembers(admin, user, members) {
  const now = new Date();
  await Promise.all(
    members.map(async (m) => {
      const patch = {};
      if (!m.auth_user_id) patch.auth_user_id = user.id;
      if (m.status === "invited") {
        patch.status = "active";
        patch.activated_at = now.toISOString();
      }
      const seen = m.last_seen_at ? new Date(m.last_seen_at).getTime() : 0;
      if (now.getTime() - seen > SEEN_EVERY_MS) patch.last_seen_at = now.toISOString();
      if (!Object.keys(patch).length) return;
      const { error } = await admin.from("portal_members").update(patch).eq("id", m.id);
      if (error) return console.error("[portal.touch]", error.message);
      Object.assign(m, patch);
      if (patch.status === "active") await markPartyActive(admin, m);
      if (m.role === "resident" && m.tenant_id && patch.last_seen_at) {
        await admin.from("tenants").update({ portal_last_seen: patch.last_seen_at }).eq("id", m.tenant_id);
      }
    }),
  );
}

// Mirror an accepted invite onto the staff record's portal status.
async function markPartyActive(admin, m) {
  const cfg = PORTAL_ROLES[m.role];
  const partyId = m[cfg.partyColumn];
  if (!partyId) return;
  await admin.rpc("merge_meta", {
    p_table: cfg.partyTable,
    p_id: partyId,
    p_patch: { portalStatus: "Active", portalActivatedAt: new Date().toISOString() },
  });
}

// Member view model the browser sees.
export function memberView(m, { settings, names }) {
  const cfg = PORTAL_ROLES[m.role] || PORTAL_ROLES.resident;
  const brand = settingsFor(settings, m.project_id);
  return {
    id: m.id,
    role: m.role,
    roleLabel: cfg.label,
    title: cfg.title,
    name: m.name || "",
    email: m.email || "",
    status: m.status,
    projectId: m.project_id || null,
    projectName: names[m.project_id] || "",
    partyId: m[cfg.partyColumn] || null,
    enabled: Boolean(brand[cfg.toggle]),
    lastSeenAt: m.last_seen_at || null,
    brand: {
      displayName: brand.displayName || names[m.project_id] || "",
      logoUrl: brand.logoUrl || "",
      accent: brand.accent || "blue",
      welcome: brand.portalWelcome || "",
      supportEmail: brand.supportEmail || "",
      supportPhone: brand.supportPhone || "",
    },
  };
}

// Everything the portal page needs about the signer: { user, members } (enabled, non-disabled only).
export async function getPortalSession() {
  const admin = adminClient();
  const user = await getAuthUser();
  if (!user) return { admin, user: null, members: [], hidden: [] };
  if (!admin) return { admin: null, user, members: [], hidden: [], notConfigured: true };
  const raw = (await membersFor(admin, user)).filter((m) => m.status !== "disabled");
  const [settings, names] = await Promise.all([
    loadPortalSettings(admin, raw.map((m) => m.project_id)),
    projectNames(admin, raw.map((m) => m.project_id)),
  ]);
  const order = Object.keys(PORTAL_ROLES);
  const live = raw
    .filter((m) => roleEnabled(settings, m.project_id, m.role))
    .sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role) || String(a.created_at).localeCompare(String(b.created_at)));
  await touchMembers(admin, user, live);
  return {
    admin,
    user,
    rawMembers: live,
    settings,
    members: live.map((m) => memberView(m, { settings, names })),
    // Invited/active members whose portal is switched off for their project.
    hidden: raw.filter((m) => !roleEnabled(settings, m.project_id, m.role)).map((m) => memberView(m, { settings, names })),
  };
}

// Route guard: { ok, admin, user, member, party, view } or { ok:false, status, error }.
export async function requirePortal(request, { role } = {}) {
  if (!adminClient()) return { ok: false, status: 503, error: "The portal isn't configured on this server yet." };
  const session = await getPortalSession();
  if (!session.user) return { ok: false, status: 401, error: "Sign in to continue." };
  if (!session.rawMembers?.length) return { ok: false, status: 403, error: "You don't have portal access." };

  const url = new URL(request.url);
  const wanted = request.headers.get("x-portal-member") || url.searchParams.get("member") || "";
  let member = session.rawMembers.find((m) => m.id === wanted);
  if (!member) member = session.rawMembers.find((m) => !role || m.role === role);
  if (!member) return { ok: false, status: 403, error: "You don't have access to this portal." };
  if (role && member.role !== role) return { ok: false, status: 403, error: "This account can't use that portal." };

  const cfg = PORTAL_ROLES[member.role];
  const partyId = member[cfg.partyColumn];
  const party = partyId
    ? await rowOf(session.admin.from(cfg.partyTable).select("*").eq("id", partyId).is("deleted_at", null).maybeSingle(), "party")
    : null;
  if (!party) return { ok: false, status: 403, error: "Your portal record is no longer available." };
  if (member.project_id && party.project_id && party.project_id !== member.project_id) {
    return { ok: false, status: 403, error: "Your portal record is no longer available." };
  }

  return {
    ok: true,
    admin: session.admin,
    user: session.user,
    member,
    party,
    partyMeta: meta(party),
    projectId: member.project_id || party.project_id || null,
    settings: settingsFor(session.settings, member.project_id),
    actorName: party.name || member.name || session.user.email || "Portal user",
  };
}

// Wrap a route handler: (ctx, request, routeCtx) → Response.
export function withPortal(handler, { role } = {}) {
  return async (request, routeCtx) => {
    const ctx = await requirePortal(request, { role });
    if (!ctx.ok) return Response.json({ ok: false, error: ctx.error }, { status: ctx.status });
    try {
      return await handler(ctx, request, routeCtx);
    } catch (e) {
      console.error("[portal.route]", e);
      return Response.json({ ok: false, error: "Something went wrong. Try again." }, { status: 500 });
    }
  };
}
