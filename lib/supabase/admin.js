import { createClient } from "@supabase/supabase-js";

// Server-only Supabase client using the SERVICE ROLE key (bypasses RLS) for
// scheduled jobs, webhooks and portal routes. Import ONLY from server code:
// SUPABASE_SERVICE_ROLE_KEY is non-public, so adminClient() is null in the browser.

export function isAdminConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function adminClient() {
  if (!isAdminConfigured()) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    db: { schema: "property" },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
