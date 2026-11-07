import { createServerNotifier } from "@geiger/notify/server";

// In-app suite notifications for Property members (server-only, service-role admin client).
//
//   notifyMembers(admin, {
//     projectId,                         // required: scopes the notice and the member lookup
//     memberIds?, emails?, userIds?,     // any mix; team_members ids → emails → auth user ids
//     includeOwner?,                     // also the project's creator (public.projects.created_by)
//     title, body?, url?,                // url: "/project/<id>/<tab>?item=…" (base path is added here)
//     type?, category?, priority?, tone?, icon?, dedupeKey?, data?, actions?, expiresIn?,
//   }) → { id, delivered, recipients, deduped } | null
//
// team_members has no auth user id column, so members resolve by email against auth.users
// (admin.auth.admin.listUsers, cached for a few minutes). Never throws.

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";
const USER_CACHE_MS = 5 * 60 * 1000;
let userCache = { at: 0, byEmail: new Map() };

const norm = (s) => String(s || "").trim().toLowerCase();

// Prefix in-app links with the deployment base path (/property in production).
export function appPath(url) {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url)) return url;
  if (!BASE_PATH || url.startsWith(`${BASE_PATH}/`)) return url;
  return `${BASE_PATH}${url.startsWith("/") ? "" : "/"}${url}`;
}

async function usersByEmail(admin) {
  if (Date.now() - userCache.at < USER_CACHE_MS && userCache.byEmail.size) return userCache.byEmail;
  const byEmail = new Map();
  try {
    for (let page = 1; page <= 20; page += 1) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw error;
      const users = data?.users || [];
      for (const u of users) if (u.email) byEmail.set(norm(u.email), u.id);
      if (users.length < 1000) break;
    }
    userCache = { at: Date.now(), byEmail };
  } catch (e) {
    console.error("[notifications.users]", e?.message || e);
  }
  return byEmail;
}

// Auth user ids for a set of members / emails / ids (+ the project owner).
export async function resolveUserIds(admin, { projectId, memberIds = [], emails = [], userIds = [], includeOwner = false } = {}) {
  const ids = new Set((userIds || []).filter(Boolean));
  const wanted = new Set((emails || []).map(norm).filter(Boolean));
  if (memberIds?.length) {
    const { data } = await admin.from("team_members").select("id, email, metadata").in("id", memberIds).is("deleted_at", null);
    for (const m of data || []) {
      if (m.metadata?.userId) ids.add(m.metadata.userId);
      else if (m.email) wanted.add(norm(m.email));
    }
  }
  if (wanted.size) {
    const byEmail = await usersByEmail(admin);
    for (const e of wanted) if (byEmail.has(e)) ids.add(byEmail.get(e));
  }
  if (includeOwner && projectId) {
    const { data } = await admin.schema("public").from("projects").select("created_by").eq("id", projectId).maybeSingle();
    if (data?.created_by) ids.add(data.created_by);
  }
  return [...ids];
}

export async function notifyMembers(admin, input = {}) {
  try {
    if (!admin || !input.title) return null;
    const userIds = await resolveUserIds(admin, input);
    if (!userIds.length) return null;
    const notifier = createServerNotifier({ supabase: admin, app: "property" });
    if (!notifier) return null;
    return await notifier.notifyUsers(userIds, {
      type: input.type,
      category: input.category || "update",
      title: input.title,
      body: input.body || undefined,
      url: appPath(input.url),
      icon: input.icon,
      tone: input.tone,
      priority: input.priority || "normal",
      projectId: input.projectId || undefined,
      dedupeKey: input.dedupeKey,
      actions: (input.actions || []).map((a) => ({ ...a, url: appPath(a.url) })),
      expiresIn: input.expiresIn,
      data: input.data,
    });
  } catch (e) {
    console.error("[notifications.members]", e?.message || e);
    return null;
  }
}
