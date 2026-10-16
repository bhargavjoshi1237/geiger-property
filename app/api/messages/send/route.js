import { jsonError, readJson, requireStaff } from "@/lib/messaging/auth";
import { sendStaffMessage } from "@/lib/messaging/send";

// POST — signed-in staff send / reply. Merges the (template) message with the
// recipient's real data, delivers it (email via geiger-dash; SMS is stored as
// "not sent" until a provider is connected; channel "note" is internal-only),
// appends it to the party's inbox thread and the tenant communication log.
// Body: { projectId, threadId? | recipient: { type: tenant|owner|vendor|prospect, id } | { email, name },
//         channel?: email|sms|note, subject?, body?, templateId?, leaseId?, propertyId? }

export const maxDuration = 60;

export async function POST(request) {
  const input = await readJson(request);
  if (!input.projectId) return jsonError(400, "projectId is required.");
  const auth = await requireStaff(request, input.projectId);
  if (!auth.ok) return jsonError(auth.status, auth.error);

  const result = await sendStaffMessage({ db: auth.db, projectId: auth.projectId, actor: auth.user, input });
  if (!result.ok && !result.threadId) return jsonError(400, result.error || "Couldn't send the message.");
  return Response.json(result);
}
