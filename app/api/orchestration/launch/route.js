import { jsonError, readJson, requireStaff } from "@/lib/messaging/auth";
import { adminClient } from "@/lib/supabase/admin";
import { launchRuns, simulateLaunch } from "@/lib/automations/runner";
import { staffCan } from "@/lib/auth/permissions";

// POST — run a workflow by hand on chosen records (ORCH-08). mode "preview" is a dry run that writes nothing;
// mode "run" starts one run per record (conditions still apply) and executes them now under the workflow's autonomy.
// Body: { projectId, mode, automationId, recordType, recordIds, overrides?, source?, launchId? } (launchId makes a repeat request a no-op)

export const maxDuration = 300;

export async function POST(request) {
  const { projectId, mode = "preview", automationId, recordType, recordIds, overrides, source, launchId } = await readJson(request);
  if (!projectId || !automationId || !Array.isArray(recordIds) || !recordIds.length) {
    return jsonError(400, "projectId, automationId and recordIds are required.");
  }
  const auth = await requireStaff(request, projectId);
  if (!auth.ok) return jsonError(auth.status, auth.error);
  const admin = adminClient({ source: "app", actor: auth.user });
  if (!admin) return jsonError(503, "SUPABASE_SERVICE_ROLE_KEY isn't set, so workflows can't be launched.");
  if (!(await staffCan(auth, "property.automation.run"))) return jsonError(403, "Your role can't run workflows by hand.");
  try {
    if (mode === "run") {
      const res = await launchRuns(admin, {
        automationId,
        projectId,
        recordType,
        recordIds,
        overrides: overrides || {},
        actor: auth.user,
        source: source && typeof source === "object" ? source : {},
        launchId,
      });
      if (!res) return jsonError(404, "Workflow not found.");
      if (res.error) return jsonError(400, res.error);
      if (source?.signalId) {
        await admin.from("signals").update({ status: "actioned", actioned_at: new Date().toISOString() }).eq("id", source.signalId).eq("project_id", projectId);
      }
      return Response.json(res);
    }
    const plan = await simulateLaunch(admin, { automationId, projectId, recordType, recordIds, overrides: overrides || {} });
    if (!plan) return jsonError(404, "Workflow not found.");
    return Response.json(plan);
  } catch (e) {
    return jsonError(500, e?.message || "Couldn't launch the workflow.");
  }
}
