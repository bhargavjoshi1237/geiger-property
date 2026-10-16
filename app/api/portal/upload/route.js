import { storePortalFile } from "@/lib/portal/files";
import { portalError, portalJson } from "@/lib/portal/http";
import { withPortal } from "@/lib/portal/session";

// POST multipart { file, purpose } — store a photo / PDF under the member's own prefix.
export const POST = withPortal(async (ctx, request) => {
  let form;
  try {
    form = await request.formData();
  } catch {
    return portalError(400, "Choose a file to upload.");
  }
  const res = await storePortalFile(ctx.admin, ctx.member.id, form.get("file"), String(form.get("purpose") || "other"));
  if (!res.ok) return portalError(400, res.error);
  return portalJson({ file: res.file });
});
