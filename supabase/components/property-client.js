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

// Pre-guarded client pinned to this product's schema (null when unconfigured) so
// callers don't repeat the guard + createClient().schema("property") dance.
export function schemaClient() {
  return isSupabaseConfigured() ? createClient().schema("property") : null;
}
