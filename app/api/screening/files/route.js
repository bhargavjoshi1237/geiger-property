import { jsonError, requireStaff } from "@/lib/auth/staff";
import { moduleEnabled } from "@/lib/modules";
import { logScreeningAccess, storeFingerprints } from "@/lib/screening/protect";
import { screeningFileRef, signedScreeningUrl, uploadScreeningFile } from "@/lib/screening/storage";
import { SCREENING_BUCKET } from "@/lib/files/refs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_STORE = { "Cache-Control": "no-store" };
const OPEN_ACTIONS = ["view", "download", "print"];

// Screening files (RISK-02): an application's IDs, pay stubs, reports and notices, in the private property-screening bucket.
// POST stores one (screening.order or view_reports); GET signs one for 5 minutes (view_reports), logging the access first.

// POST multipart { projectId, applicationId, file }
export async function POST(request) {
  let form;
  try {
    form = await request.formData();
  } catch {
    return jsonError(400, "Choose a file to upload.");
  }
  const projectId = String(form.get("projectId") || "");
  const applicationId = String(form.get("applicationId") || "");
  const auth = await requireStaff(request, projectId, {
    anyOf: ["property.screening.order", "property.screening.view_reports"],
    denied: "Your role can't add screening documents.",
  });
  if (!auth.ok) return jsonError(auth.status, auth.error);
  if (!UUID.test(applicationId)) return jsonError(400, "applicationId isn't valid.");
  if (!auth.admin) return jsonError(503, "Screening files need the server's service role.");
  try {
    if (!(await moduleEnabled(auth.db, projectId, "leasing"))) return jsonError(404, "Leasing & screening is switched off for this project.");
    const app = await auth.scoped("applications").select("id").eq("id", applicationId).is("deleted_at", null).maybeSingle();
    if (app.error) throw new Error(app.error.message);
    if (!app.data) return jsonError(404, "Application not found.");
    const stored = await uploadScreeningFile(auth.admin, { projectId, applicationId, file: form.get("file") });
    if (!stored.ok) return jsonError(400, stored.error);
    const { file } = stored;
    const row = await auth.admin
      .from("documents")
      .insert({
        project_id: projectId,
        owner_type: "application",
        owner_id: applicationId,
        kind: "other",
        name: file.name,
        bucket: file.bucket,
        storage_path: file.path,
        size_bytes: file.size,
        created_by: auth.user.id,
        metadata: { contentType: file.type },
      })
      .select("id, owner_type, owner_id, kind, name, bucket, storage_path, size_bytes, created_by, created_at")
      .single();
    if (row.error) throw new Error(row.error.message);
    try {
      await storeFingerprints(auth.admin, { projectId, applicationId, actorId: auth.user.id, values: { document_sha256: file.sha256 } });
    } catch (e) {
      console.error("[screening.fingerprints]", e?.message || e);
    }
    const d = row.data;
    return Response.json(
      {
        ok: true,
        document: { id: d.id, ownerType: d.owner_type, ownerId: d.owner_id, kind: d.kind, name: d.name, bucket: d.bucket, storagePath: d.storage_path, sizeBytes: Number(d.size_bytes) || 0, createdBy: d.created_by, createdAt: d.created_at },
      },
      { headers: NO_STORE },
    );
  } catch (e) {
    console.error("[screening.files.upload]", e?.message || e);
    return jsonError(500, "Couldn't store that file.");
  }
}

// GET ?projectId=&path=&bucket=&action=view|download|print — a 5-minute signed URL for a live application document.
export async function GET(request) {
  const q = request.nextUrl.searchParams;
  const projectId = q.get("projectId");
  const auth = await requireStaff(request, projectId, {
    permission: "property.screening.view_reports",
    denied: "Your role can't open screening documents.",
  });
  if (!auth.ok) return jsonError(auth.status, auth.error);
  const action = q.get("action") || "view";
  if (!OPEN_ACTIONS.includes(action)) return jsonError(400, "action must be view, download or print.");
  const ref = screeningFileRef(projectId, q.get("bucket") || SCREENING_BUCKET, q.get("path"));
  if (!ref) return jsonError(400, "That isn't an application file in this project.");
  if (!auth.admin) return jsonError(503, "Screening files need the server's service role.");
  try {
    if (!(await moduleEnabled(auth.db, projectId, "leasing"))) return jsonError(404, "Leasing & screening is switched off for this project.");
    const doc = await auth
      .scoped("documents")
      .select("id, name, owner_id")
      .eq("owner_type", "application")
      .eq("bucket", ref.bucket)
      .eq("storage_path", ref.path)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();
    if (doc.error) throw new Error(doc.error.message);
    if (!doc.data) return jsonError(404, "File not found.");
    await logScreeningAccess(auth.admin, {
      projectId,
      actor: auth.user,
      applicationId: doc.data.owner_id || ref.applicationId,
      objectType: "document",
      objectId: doc.data.id,
      action,
      request,
      metadata: { bucket: ref.bucket },
    });
    const signed = await signedScreeningUrl(auth.admin, ref.path, undefined, { bucket: ref.bucket, download: action === "download" ? doc.data.name || true : null });
    return Response.json({ ok: true, url: signed.url, expiresIn: signed.expiresIn }, { headers: NO_STORE });
  } catch (e) {
    console.error("[screening.files.sign]", e?.message || e);
    return jsonError(500, "Couldn't open that file.");
  }
}
