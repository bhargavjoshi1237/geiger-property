import { listMessages, sendMessage } from "@/lib/portal/common";
import { ownFiles } from "@/lib/portal/files";
import { portalError, portalJson, readBody } from "@/lib/portal/http";
import { residentPermissions } from "@/lib/portal/resident";
import { withPortal } from "@/lib/portal/session";

const allowed = (ctx) => ctx.member.role !== "resident" || residentPermissions(ctx).messages;

// GET — conversations with the office.
export const GET = withPortal(async (ctx) => {
  if (!allowed(ctx)) return portalJson({ threads: [], disabled: true });
  return portalJson({ threads: await listMessages(ctx) });
});

// POST { threadId?, subject?, body, attachments? } — message the office.
export const POST = withPortal(async (ctx, request) => {
  if (!allowed(ctx)) return portalError(403, "Messaging the office is turned off for your account.");
  const body = await readBody(request);
  const res = await sendMessage(ctx, { ...body, attachments: ownFiles(body.attachments, ctx.member.id, 6) });
  if (!res.ok) return portalError(400, res.error);
  return portalJson({ threadId: res.threadId });
});
