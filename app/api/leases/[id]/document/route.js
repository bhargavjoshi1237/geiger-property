import { jsonError, readJson, requireStaff } from "@/lib/auth/staff";
import { isUuid } from "@/lib/files/refs";
import { generateLeasePdf } from "@/lib/leasing/documents/generate";

// POST — generate the lease PDF (LEAS-08): template + addenda merged, signature blocks, saved privately to the lease's Documents.
// Body { projectId, templateId?, includeAddenda? } → { document, unknown, empty, pages, warnings }; the file opens through signed URLs.

export const maxDuration = 60;

export async function POST(request, { params }) {
  const { id } = await params;
  const body = await readJson(request);
  const auth = await requireStaff(request, body.projectId, { permission: "property.lease.manage", denied: "Your role can't generate lease documents." });
  if (!auth.ok) return jsonError(auth.status, auth.error);
  if (!auth.admin) return jsonError(503, "Private storage isn't configured.");
  if (!isUuid(id)) return jsonError(400, "This lease id isn't valid.");
  try {
    const res = await generateLeasePdf(auth.admin, id, {
      projectId: auth.projectId,
      actor: auth.user,
      templateId: isUuid(body.templateId) ? body.templateId : undefined,
      includeAddenda: body.includeAddenda !== false,
    });
    return Response.json({ ok: true, document: res.document, unknown: res.unknown, empty: res.empty, pages: res.pages, warnings: res.warnings });
  } catch (e) {
    if (!e?.status) console.error("[leases.document]", e);
    return jsonError(Number(e?.status) || 500, e?.status ? e.message : "Couldn't generate the lease document.");
  }
}
