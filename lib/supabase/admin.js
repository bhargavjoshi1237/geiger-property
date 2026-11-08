import "server-only";
import { createClient } from "@supabase/supabase-js";

// Server-only Supabase client using the SERVICE ROLE key (bypasses RLS) for
// scheduled jobs, webhooks and portal routes. Import ONLY from server code:
// SUPABASE_SERVICE_ROLE_KEY is non-public, so adminClient() is null in the browser.

export function isAdminConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

// Audit headers read by property.audit_row(): the change's source (app, job:<key>, portal…) and the
// signed-in user a service-role call acts for.
function auditHeaders({ source, actor } = {}) {
  const headers = {};
  if (source) headers["x-geiger-source"] = String(source);
  if (actor?.id) headers["x-geiger-actor-id"] = String(actor.id);
  if (actor?.email) headers["x-geiger-actor-email"] = String(actor.email);
  return headers;
}

export function adminClient({ source, actor } = {}) {
  if (!isAdminConfigured()) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    db: { schema: "property" },
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: auditHeaders({ source, actor }) },
  });
}
