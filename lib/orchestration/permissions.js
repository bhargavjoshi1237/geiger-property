import { getRoleById, normalizeRoleId, roleAllows } from "@/lib/rbac";
import { PERMISSION_RESOLVER } from "@/components/internal/screens/settings/permissions";
import { getProjectSetting } from "@/lib/messaging/context";

// Server-side check of a signed-in member's workspace permissions, mirroring RbacProvider (context/rbac-context.js):
// no roles saved → allowed; project creator → allowed; else the team member matching the user's email / id → their
// role (disabled members get nothing), falling back to Manager. Used by routes whose actions have side effects
// (approving, posting, running workflows); the browser hides the same controls.

const norm = (s) => String(s || "").trim().toLowerCase();

export async function staffCan(admin, { projectId, user }, keys) {
  const wanted = Array.isArray(keys) ? keys : [keys];
  if (!admin || !projectId || !user?.id) return false;
  const stored = await getProjectSetting(admin, projectId, "roles");
  const roles = Array.isArray(stored) ? stored.filter((r) => r?.id) : [];
  if (!roles.length) return true;
  const { data: project } = await admin.schema("public").from("projects").select("created_by").eq("id", projectId).maybeSingle();
  if (project?.created_by && project.created_by === user.id) return true;
  const { data: members } = await admin.from("team_members").select("email, role, status, metadata").eq("project_id", projectId).is("deleted_at", null);
  const member = (members || []).find((m) => (user.email && norm(m.email) === norm(user.email)) || m.metadata?.userId === user.id);
  if (member?.status === "Disabled") return false;
  const roleId = normalizeRoleId(member?.role);
  const role = (roleId && roles.find((r) => r.id === roleId || normalizeRoleId(r.name) === roleId)) || getRoleById(roles, "manager");
  return wanted.every((k) => roleAllows(role, k, PERMISSION_RESOLVER));
}
