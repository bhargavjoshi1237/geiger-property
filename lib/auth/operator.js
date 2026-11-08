import "server-only";

import { createClient } from "@/utils/supabase/server";

// Platform operators (PLAT-01h): signed-in suite users with a confirmed email listed in PROPERTY_OPERATOR_EMAILS. Not a project role:
// operators see only what belongs to no project (lib/operator/events.js), never a project's data.

export const operatorEmails = (env = process.env) =>
  String(env.PROPERTY_OPERATOR_EMAILS || "")
    .split(/[\s,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

// The user is an operator: a confirmed email on the list.
export function isOperator(user, env = process.env) {
  const email = String(user?.email || "").toLowerCase();
  const confirmed = Boolean(user?.email_confirmed_at || user?.confirmed_at);
  return Boolean(email && confirmed && operatorEmails(env).includes(email));
}

// The signed-in operator ({ id, email }) or null.
export async function currentOperator() {
  try {
    const sb = await createClient();
    const { data } = await sb.auth.getUser();
    const user = data?.user;
    return isOperator(user) ? { id: user.id, email: user.email } : null;
  } catch {
    return null;
  }
}
