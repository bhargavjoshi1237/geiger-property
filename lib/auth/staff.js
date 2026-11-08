import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { createClient as createServerClient } from "@/utils/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { scopedTo } from "@/lib/supabase/scope";
import { toPermissionKey } from "@/lib/rbac";
import { demandMet, permissionDemand } from "@/lib/auth/permissions";

// Staff guard for /api routes (PLAT-01f): a signed-in member of the project (public.is_project_member) who holds the
// route's permission (property.rbac_allows), both asked as the caller. Each route's keys are listed in lib/auth/route_permissions.js.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const hasEnv = () => Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const refuse = (status, error) => ({ ok: false, status, error });

function tokenClient(token) {
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    db: { schema: "property" },
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

// The caller's RLS-bound client: the suite's shared auth cookie, else an `Authorization: Bearer <access token>`.
async function callerClient(request) {
  let sb = null;
  let user = null;
  try {
    sb = await createServerClient();
    user = (await sb.auth.getUser()).data?.user ?? null;
  } catch {
    // No request cookies (outside a request scope): only the bearer token can identify the caller.
  }
  if (!user) {
    const header = request?.headers?.get("authorization") || "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (token) {
      sb = tokenClient(token);
      user = (await sb.auth.getUser(token)).data?.user ?? null;
    }
  }
  return { sb, user };
}

// requireStaff(request, projectId, { permission?, anyOf?, denied? }) → { ok, user, projectId, db, admin, userDb, scoped, can }
// or { ok: false, status, error }. `db` is the service role when configured (else the caller's client), `admin` is the
// service role or null, `scoped(table)` is `db` narrowed to the project, `can(key)` answers for the declared keys.
export async function requireStaff(request, projectId, declaration = {}) {
  const demand = permissionDemand(declaration);
  if (!demand.keys.length) {
    console.error("[auth.staff] a staff route called requireStaff without a permission");
    return refuse(500, "This route doesn't declare a permission.");
  }
  if (!hasEnv()) return refuse(503, "Supabase is not configured.");
  if (!projectId) return refuse(400, "projectId is required.");
  if (!UUID.test(String(projectId))) return refuse(400, "projectId isn't valid.");
  try {
    const { sb, user } = await callerClient(request);
    if (!user) return refuse(401, "Sign in to continue.");

    const { data: member, error } = await sb.schema("public").rpc("is_project_member", { p_project: projectId });
    if (error || member !== true) return refuse(403, "You don't have access to this project.");

    const answers = await Promise.all(demand.keys.map((key) => sb.rpc("rbac_allows", { p_permission: key, p_project: projectId })));
    const held = new Set(demand.keys.filter((_, i) => !answers[i].error && answers[i].data === true));
    if (!demandMet(demand, held)) return refuse(403, declaration.denied || "Your role doesn't allow this.");

    const meta = user.user_metadata || {};
    const profile = { id: user.id, email: user.email || "", name: meta.full_name || meta.name || user.email || "Staff" };
    const admin = adminClient({ source: "app", actor: profile });
    const db = admin || sb;
    return {
      ok: true,
      projectId,
      user: profile,
      db,
      admin,
      // The caller's own client, for checks that must run as them (staffCan → property.rbac_allows).
      userDb: sb,
      scoped: scopedTo(db, projectId),
      can: (key) => held.has(toPermissionKey(key)),
    };
  } catch (e) {
    console.error("[auth.staff]", e);
    return refuse(500, "Couldn't verify your session.");
  }
}

export const jsonError = (status, error) => Response.json({ ok: false, error }, { status });

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}
