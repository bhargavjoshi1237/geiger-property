import { after } from "next/server";

import { jsonError, readJson, requireStaff } from "@/lib/auth/staff";
import { adminClient } from "@/lib/supabase/admin";
import { forProject } from "@/lib/supabase/scope";
import { executeJob } from "@/lib/jobs/execute";
import { exportFullJob } from "@/lib/jobs/export_full";
import { hasEntity } from "@/lib/data_io/schemas";
import { exportView } from "@/lib/data_io/export";
import { SCREEN_LINK_SECONDS, entityCounts, entityCsv, signExportFiles, tidyExports } from "@/lib/data_io/export_server";

// Data export (PLAT-04), staff holding Export data (property.data.export); every export is an export_jobs row, audited (PLAT-09).
// GET  ?projectId — row counts per list and the recent exports; &id=<export> — one export (the screen polls it while it runs).
// POST { kind: "full" } queues the whole-project export and builds it after the response (the export-full job);
//      { kind: "entity", entity } returns one list as an import-format CSV at once (up to 5,000 rows), else queues it the same way;
//      { action: "link", id, file? } a 15-minute download link for a finished export's file.

export const maxDuration = 300;

const DENIED = "Your role can't export data.";
const RECENT = 10;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadExport(admin, projectId, id) {
  if (!UUID.test(String(id || ""))) return null;
  const { data, error } = await forProject(admin.from("export_jobs").select("*"), projectId).eq("id", id).is("deleted_at", null).maybeSingle();
  if (error) throw new Error(`export_jobs: ${error.message}`);
  return data;
}

const requester = (auth) => ({ requestedByEmail: auth.user.email || "", requestedByName: auth.user.name || "" });

// Queue an export and build it once the response is sent; one export at a time per project.
async function queue(auth, fields, now) {
  await tidyExports(auth.admin, auth.projectId, now);
  const { data: row, error } = await auth.admin
    .from("export_jobs")
    .insert({ project_id: auth.projectId, ...fields, status: "queued", requested_by: auth.user.id, created_by: auth.user.id, metadata: requester(auth) })
    .select("*")
    .single();
  if (error?.code === "23505") return jsonError(409, "An export is already running for this project. Wait for it to finish.");
  if (error) throw new Error(`export_jobs: ${error.message}`);
  const admin = adminClient({ source: `job:${exportFullJob.key}`, actor: auth.user });
  after(() =>
    executeJob(exportFullJob, { admin, projectId: auth.projectId, trigger: "manual", actorId: auth.user.id }).catch((e) => console.error("[export.job]", e)),
  );
  return Response.json({ ok: true, export: exportView(row, now) }, { status: 202 });
}

// One list at once: the CSV comes back in the response and the export is recorded; past the limit it is queued instead.
async function entityNow(auth, entity, now) {
  if (!hasEntity(entity)) return jsonError(400, "Pick a list to export.");
  const out = await entityCsv(auth.admin, { projectId: auth.projectId, entity, now });
  if (out.tooMany) return queue(auth, { kind: "entity", entity }, now);
  const at = now.toISOString();
  const { data: row, error } = await auth.admin
    .from("export_jobs")
    .insert({
      project_id: auth.projectId,
      kind: "entity",
      entity,
      status: "succeeded",
      counts: { rows: out.rows },
      started_at: at,
      finished_at: at,
      requested_by: auth.user.id,
      created_by: auth.user.id,
      metadata: { ...requester(auth), delivery: "download", fileName: out.fileName },
    })
    .select("*")
    .single();
  if (error) throw new Error(`export_jobs: ${error.message}`);
  return Response.json({ ok: true, csv: out.csv, fileName: out.fileName, rows: out.rows, export: exportView(row, now) });
}

// A short-lived link to a finished export's file; each one is counted on the row (and so in the audit log).
async function link(auth, body, now) {
  const row = await loadExport(auth.admin, auth.projectId, body.id);
  if (!row) return jsonError(404, "That export doesn't exist.");
  const view = exportView(row, now);
  if (view.status === "expired") return jsonError(410, "This export has expired. Start a new one.");
  if (view.status !== "succeeded") return jsonError(409, "This export isn't ready yet.");
  const files = Array.isArray(row.files) ? row.files : [];
  const file = body.file ? files.find((f) => f.name === body.file) : files[0];
  if (!file?.path) return jsonError(404, "That file isn't part of this export.");
  const seconds = Math.max(1, Math.min(SCREEN_LINK_SECONDS, Math.floor((new Date(row.expires_at) - now) / 1000)));
  const [signed] = await signExportFiles(auth.admin, [file], seconds);
  const meta = row.metadata || {};
  await auth.admin
    .from("export_jobs")
    .update({ metadata: { ...meta, downloads: (Number(meta.downloads) || 0) + 1, lastDownloadAt: now.toISOString(), lastDownloadBy: auth.user.email || auth.user.id } })
    .eq("id", row.id);
  return Response.json({ ok: true, url: signed.url, name: signed.name, expiresIn: seconds });
}

export async function GET(request) {
  const params = new URL(request.url).searchParams;
  const auth = await requireStaff(request, params.get("projectId"), { permission: "property.data.export", denied: DENIED });
  if (!auth.ok) return jsonError(auth.status, auth.error);
  if (!auth.admin) return jsonError(503, "SUPABASE_SERVICE_ROLE_KEY is not configured.");
  const now = new Date();
  try {
    await tidyExports(auth.admin, auth.projectId, now);
    if (params.get("id")) {
      const row = await loadExport(auth.admin, auth.projectId, params.get("id"));
      return row ? Response.json({ ok: true, export: exportView(row, now) }) : jsonError(404, "That export doesn't exist.");
    }
    const [entities, recent] = await Promise.all([
      entityCounts(auth.admin, auth.projectId),
      forProject(auth.admin.from("export_jobs").select("*"), auth.projectId).is("deleted_at", null).order("created_at", { ascending: false }).limit(RECENT),
    ]);
    if (recent.error) throw new Error(`export_jobs: ${recent.error.message}`);
    return Response.json({ ok: true, entities, exports: (recent.data || []).map((r) => exportView(r, now)) });
  } catch (e) {
    console.error("[export.get]", e);
    return jsonError(500, "Couldn't load your exports.");
  }
}

export async function POST(request) {
  const body = await readJson(request);
  const auth = await requireStaff(request, body.projectId, { permission: "property.data.export", denied: DENIED });
  if (!auth.ok) return jsonError(auth.status, auth.error);
  if (!auth.admin) return jsonError(503, "SUPABASE_SERVICE_ROLE_KEY is not configured.");
  const now = new Date();
  try {
    if (body.action === "link") return await link(auth, body, now);
    if (body.kind === "entity") return await entityNow(auth, body.entity, now);
    if (body.kind === "full") return await queue(auth, { kind: "full" }, now);
    return jsonError(400, "Choose what to export.");
  } catch (e) {
    console.error("[export.post]", e);
    return jsonError(500, "Couldn't export your data.");
  }
}
