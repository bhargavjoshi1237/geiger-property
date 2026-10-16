import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { createClient as createServerClient } from "@/utils/supabase/server";
import { adminClient } from "@/lib/supabase/admin";

// Server-only staff guard for /api routes. Verifies the Supabase session from
// the suite's shared auth cookie (or an `Authorization: Bearer <access token>`
// fallback), then checks the caller can see the project through RLS on
// public.projects. Returns { ok, user, db, projectId } or { ok:false, status, error }.

const hasEnv = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

function tokenClient(token) {
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    db: { schema: "property" },
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

export async function requireStaff(request, projectId) {
  if (!hasEnv()) return { ok: false, status: 503, error: "Supabase is not configured." };
  try {
    let sb = await createServerClient();
    let { data } = await sb.auth.getUser();
    let user = data?.user ?? null;

    if (!user) {
      const auth = request?.headers?.get("authorization") || "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
      if (token) {
        sb = tokenClient(token);
        ({ data } = await sb.auth.getUser(token));
        user = data?.user ?? null;
      }
    }
    if (!user) return { ok: false, status: 401, error: "Sign in to continue." };

    if (projectId) {
      const { data: project, error } = await sb
        .schema("public")
        .from("projects")
        .select("id")
        .eq("id", projectId)
        .maybeSingle();
      if (error || !project) return { ok: false, status: 403, error: "You don't have access to this project." };
    }

    const meta = user.user_metadata || {};
    return {
      ok: true,
      projectId: projectId || null,
      user: { id: user.id, email: user.email || "", name: meta.full_name || meta.name || user.email || "Staff" },
      // Service role when available (writes across tables); else the caller's RLS-bound client.
      db: adminClient() || sb,
    };
  } catch (e) {
    console.error("[messaging.auth]", e);
    return { ok: false, status: 500, error: "Couldn't verify your session." };
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
