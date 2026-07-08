import { createClient } from "@/lib/supabase/client";

// Shared Supabase helpers for Geiger Property. Import these everywhere instead of
// constructing a client ad hoc, so activity tracking / env / schema live in one
// place. Property owns the `property` Postgres schema; the shared suite tables
// (public.users, public.projects) are read through a plain createClient().

export function isSupabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

// Pre-guarded client for this product's schema. createClient() already pins the
// default db schema to `property` (see lib/supabase/client.js), so this just
// returns that client (null when unconfigured); re-calling `.schema("property")`
// is a harmless no-op, so callers just use createClient() directly.
// NOTE: the `property` schema must be added to Supabase → Settings → API →
// Exposed schemas, or PostgREST rejects every call with PGRST106
// "Invalid schema: property" (HTTP 406). That's a project setting, not a code fix.
export function schemaClient() {
  return isSupabaseConfigured() ? createClient() : null;
}
