import "server-only";
import { FILES_BUCKET } from "@/lib/files/refs";
import { forProject } from "@/lib/supabase/scope";
import { notifyMembers } from "@/lib/notifications/server";
import { sendNotificationEmail } from "@/lib/email/notifications";
import { CSV_BOM } from "@/lib/reports/csv";
import { emptyResult } from "@/lib/jobs/contract";
import { getEntity, hasEntity } from "./schemas";
import {
  ENTITY_SYNC_LIMIT,
  EXCLUDED_TABLES,
  LINK_SECONDS,
  README,
  REF_TARGETS,
  archiveName,
  buildManifest,
  customDefs,
  documentEntry,
  entityColumns,
  entityEntry,
  entityFileName,
  entityNeeds,
  exportEntities,
  exportPrefix,
  exportView,
  headerLine,
  isSecretKey,
  labelColumns,
  rowLine,
  selectColumns,
  tableColumns,
  tableEntry,
} from "./export";
import { createZipStream } from "./zip_stream";

// Server-only export runs (PLAT-04), with the service role behind /api/export (requireStaff + property.data.export):
// - entityCsv: one catalogue entity's live rows in the import-template format, returned at once (up to ENTITY_SYNC_LIMIT rows).
// - runExport: a queued export_jobs row. Full: every project table as CSV, the import-format entity files, the stored documents and
//   manifest.json, zipped as they stream into property-files/<project>/exports/<id>/ in parts of at most 45 MB (the bucket takes 50 MB).
//   A large entity CSV streams the same way as one .csv. Nothing touches local disk; memory holds a page of rows and one 6 MB upload chunk.
// - The requester gets 7-day signed links by email (export_ready) and an in-app notice; expired archives are removed.

export const PAGE = 1000;
export const PART_LIMIT = 45 * 1024 * 1024;
const PART_MAX_ENTRIES = 60000;
// Reference targets bigger than this aren't resolved to labels (their ids stay).
const LOOKUP_LIMIT = 200000;
// Leaves the function time to record the failure before maxDuration (300 s).
export const RUN_BUDGET_MS = 270000;
export const STALE_MINUTES = 15;
// Download links from the screen are short-lived; the emailed ones last LINK_SECONDS.
export const SCREEN_LINK_SECONDS = 900;
const MINUTE = 60000;

const appBase = () => `${(process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "")}${process.env.NEXT_PUBLIC_BASE_PATH || ""}`;
export const exportsPath = (projectId) => `/project/${projectId}/importexport`;
const shortError = (e) => String(e?.message || e || "The export failed").slice(0, 500);

// Network blips (a dropped connection, a gateway timeout) are retried a few times; anything else fails the export.
const TRANSIENT = /fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|other side closed|(502|503|504)/i;
export async function withRetry(fn, { tries = 4, wait = 600 } = {}) {
  for (let i = 1; ; i += 1) {
    try {
      return await fn();
    } catch (e) {
      if (i >= tries || !TRANSIENT.test(String(e?.message || e) + String(e?.cause?.code || ""))) throw e;
      await new Promise((r) => setTimeout(r, wait * i));
    }
  }
}

// A PostgREST call (built fresh per attempt) → its data; errors throw, prefixed with `what`.
const read = (what, build) =>
  withRetry(async () => {
    const { data, error } = await build();
    if (error) throw new Error(`${what}: ${error.message}`);
    return data;
  });

// The export's view of the project: its tables with their columns, the custom-field setting and the project's name.
async function loadContext(admin, projectId) {
  const data = await read("export_tables", () => admin.rpc("export_tables"));
  const tables = new Map((data || []).filter((t) => !EXCLUDED_TABLES.includes(t.table_name)).map((t) => [t.table_name, t.columns || []]));
  const cf = await read("settings", () => forProject(admin.from("settings").select("value").eq("key", "custom_fields").is("deleted_at", null), projectId).limit(1));
  const project = await read("projects", () => admin.schema("public").from("projects").select("id, name").eq("id", projectId).maybeSingle());
  return { projectId, tables, customFields: cf?.[0]?.value || {}, project: { id: projectId, name: project?.name || "" } };
}

// One table's rows for the project in id order, a page at a time (keyset paging); `live` leaves soft-deleted rows out.
async function* pages(admin, { projectId, table, select, live = false }) {
  let last = null;
  for (;;) {
    const after = last;
    const data = await read(table, () => {
      let q = forProject(admin.from(table).select(select.join(",")), projectId).order("id", { ascending: true }).limit(PAGE);
      if (live) q = q.is("deleted_at", null);
      return after !== null ? q.gt("id", after) : q;
    });
    if (!data?.length) return;
    yield data;
    if (data.length < PAGE) return;
    last = data[data.length - 1].id;
  }
}

async function tableMeta(admin, projectId, table) {
  const data = await read(`export_table_meta(${table})`, () => admin.rpc("export_table_meta", { p_project: projectId, p_table: table }));
  const row = Array.isArray(data) ? data[0] : data;
  return { rows: Number(row?.row_count) || 0, deleted: Number(row?.deleted_count) || 0, metadataKeys: row?.metadata_keys || [] };
}

// Lookup rows per target table (id + the columns labels and references resolve by) → ctx.row(table, id).
async function loadLookups(admin, ctx, needs) {
  const maps = new Map();
  for (const [table, wanted] of needs) {
    const columns = ctx.tables.get(table);
    if (!columns?.includes("id")) continue;
    const select = ["id", ...[...wanted].filter((c) => c !== "id" && columns.includes(c) && !isSecretKey(c))];
    const map = new Map();
    let tooBig = false;
    for await (const rows of pages(admin, { projectId: ctx.projectId, table, select })) {
      for (const r of rows) map.set(r.id, r);
      if (map.size > LOOKUP_LIMIT) {
        tooBig = true;
        break;
      }
    }
    if (!tooBig) maps.set(table, map);
  }
  return { tables: new Set(maps.keys()), row: (table, id) => maps.get(table)?.get(id) || null };
}

const addNeeds = (needs, table, cols) => {
  if (!needs.has(table)) needs.set(table, new Set(["id"]));
  for (const c of cols) needs.get(table).add(c);
};

// Everything a full export resolves: readable labels for REF_TARGETS, and each entity's lookups.
function fullNeeds(ctx) {
  const needs = new Map();
  for (const target of new Set(Object.values(REF_TARGETS))) if (ctx.tables.has(target)) addNeeds(needs, target, labelColumns(target));
  for (const entity of exportEntities(new Set(ctx.tables.keys()))) {
    const columns = ctx.tables.get(getEntity(entity).table);
    for (const [target, cols] of entityNeeds(entity, columns, { custom: customDefs(ctx.customFields, entity) }).lookups) addNeeds(needs, target, cols);
  }
  return needs;
}

const storageEnv = () => {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { base: `${String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "")}/storage/v1`, headers: { Authorization: `Bearer ${key}`, apikey: key } };
};

// Supabase's resumable (TUS) uploads take 6 MB chunks; a held-open streamed upload times out on the storage side instead.
const TUS_CHUNK = 6 * 1024 * 1024;

// One object written to property-files as it is produced: a TUS upload with its length declared at the end, sent 6 MB at a time.
function openUpload(path, contentType) {
  const { base, headers } = storageEnv();
  const tus = { ...headers, "Tus-Resumable": "1.0.0" };
  const meta = [
    ["bucketName", FILES_BUCKET],
    ["objectName", path],
    ["contentType", contentType],
    ["cacheControl", "3600"],
  ]
    .map(([k, v]) => `${k} ${Buffer.from(v).toString("base64")}`)
    .join(",");
  let location = null;
  let offset = 0;
  let pending = [];
  let pendingBytes = 0;
  const start = () =>
    withRetry(async () => {
      const res = await fetch(`${base}/upload/resumable`, { method: "POST", headers: { ...tus, "Upload-Defer-Length": "1", "x-upsert": "false", "Upload-Metadata": meta } });
      location = res.headers.get("location");
      if (res.status !== 201 || !location) throw new Error(`storage: couldn't start the upload of ${path} (${res.status} ${(await res.text()).slice(0, 200)})`);
    });
  const total = (bytes, final) => (final ? { "Upload-Length": String(offset + bytes.length) } : {});
  // A chunk that fails mid-air is resent from the offset the server reports (it may already hold part of it).
  const send = (bytes, final) => {
    let retry = false;
    return withRetry(async () => {
      if (retry) {
        const head = await fetch(location, { method: "HEAD", headers: tus });
        const at = Number(head.headers.get("upload-offset"));
        if (head.ok && Number.isFinite(at) && at > offset && at <= offset + bytes.length) {
          bytes = bytes.subarray(at - offset);
          offset = at;
        }
      }
      retry = true;
      const res = await fetch(location, {
        method: "PATCH",
        headers: { ...tus, "Upload-Offset": String(offset), "Content-Type": "application/offset+octet-stream", ...total(bytes, final) },
        body: bytes,
      });
      if (res.status !== 204) throw new Error(`storage: the upload of ${path} failed (${res.status} ${(await res.text()).slice(0, 200)})`);
      offset += bytes.length;
    });
  };
  return {
    path,
    get bytes() {
      return offset + pendingBytes;
    },
    async write(chunk) {
      if (!location) await start();
      pending.push(Buffer.from(chunk));
      pendingBytes += chunk.length;
      while (pendingBytes > TUS_CHUNK) {
        const all = Buffer.concat(pending);
        await send(all.subarray(0, TUS_CHUNK), false);
        pending = [all.subarray(TUS_CHUNK)];
        pendingBytes = all.length - TUS_CHUNK;
      }
    },
    async close() {
      if (!location) await start();
      await send(Buffer.concat(pending), true);
      pending = [];
      pendingBytes = 0;
    },
    async abort() {
      pending = [];
      if (location) await fetch(location, { method: "DELETE", headers: tus }).catch(() => {});
    },
  };
}

// A stored file's bytes as a stream (service role), so a document never sits whole in memory.
async function openObject(bucket, name) {
  const { base, headers } = storageEnv();
  const path = String(name).split("/").map(encodeURIComponent).join("/");
  return withRetry(async () => {
    const res = await fetch(`${base}/object/authenticated/${bucket}/${path}`, { headers });
    if (!res.ok || !res.body) throw new Error(`storage: couldn't read ${bucket}/${name} (${res.status})`);
    return res.body;
  });
}

// ZIP parts under one prefix: part 1 is <base>.zip, then <base>-part2.zip …; `full()` says when to start the next one.
function zipParts({ prefix, now, limit, upload }) {
  const parts = [];
  let current = null;
  const open = () => {
    const n = parts.length + 1;
    const name = archiveName(now, n);
    const up = upload(`${prefix}/${name}`, "application/zip");
    current = { n, name, path: up.path, up, zip: createZipStream((b) => up.write(b), { now }) };
    parts.push(current);
    return current;
  };
  const close = async (p) => {
    const done = await p.zip.finish();
    await p.up.close();
    p.result = { part: p.n, name: p.name, path: p.path, bytes: done.bytes, entries: done.entries };
  };
  return {
    parts,
    get current() {
      return current || open();
    },
    full: (extra = 0) => Boolean(current) && current.zip.count > 0 && (current.zip.size + extra >= limit || current.zip.count >= PART_MAX_ENTRIES),
    async rotate() {
      if (current) await close(current);
      open();
    },
    async finish() {
      if (current) await close(current);
      return parts.map((p) => p.result);
    },
    async abort(e) {
      for (const p of parts) if (!p.result) await p.up.abort(e);
    },
  };
}

// One CSV written as entries of the current part; a table that outgrows the part continues as <name>-2 in the next one.
async function writeCsv(zp, { entryName, header, rows, guard }) {
  const files = [];
  let piece = 1;
  let pieceRows = 0;
  let entry = await zp.current.zip.open(entryName(piece));
  await entry.write(header);
  const close = async () => {
    const res = await entry.close();
    files.push({ file: res.name, part: zp.current.n, rows: pieceRows, bytes: res.bytes, sha256: res.sha256 });
  };
  for await (const page of rows) {
    guard();
    if (pieceRows > 0 && zp.full()) {
      await close();
      await zp.rotate();
      piece += 1;
      pieceRows = 0;
      entry = await zp.current.zip.open(entryName(piece));
      await entry.write(header);
    }
    await entry.write(page.text);
    pieceRows += page.count;
  }
  await close();
  return files;
}

// Pages as CSV text, counting rows and soft-deleted rows into `tally`.
async function* csvPages(source, cols, lookups, tally) {
  for await (const page of source) {
    let text = "";
    for (const row of page) {
      text += rowLine(cols, row, lookups);
      if (row.deleted_at) tally.deleted += 1;
    }
    tally.rows += page.length;
    yield { text, count: page.length };
  }
}

// The whole project: tables, import files, documents, README and manifest, zipped into parts.
async function writeFullArchive(admin, row, { ctx, zp, guard, partLimit, deps }) {
  const lookups = await loadLookups(admin, ctx, fullNeeds(ctx));
  const tables = [];
  const excludedColumns = [];
  await zp.current.zip.add("README.txt", README);
  for (const [table, columns] of ctx.tables) {
    guard();
    const meta = await tableMeta(admin, ctx.projectId, table);
    const cols = tableColumns(columns, { metadataKeys: meta.metadataKeys, refTables: lookups.tables });
    excludedColumns.push(...columns.filter(isSecretKey).map((c) => `${table}.${c}`));
    excludedColumns.push(...meta.metadataKeys.filter(isSecretKey).map((k) => `${table}.metadata.${k}`));
    const tally = { rows: 0, deleted: 0 };
    const source = pages(admin, { projectId: ctx.projectId, table, select: selectColumns(columns) });
    const files = await writeCsv(zp, { entryName: (n) => tableEntry(table, n), header: headerLine(cols), rows: csvPages(source, cols, lookups, tally), guard });
    tables.push({ table, rows: tally.rows, deleted: tally.deleted, columns: cols.map((c) => c.header), files });
  }

  const entities = [];
  for (const entity of exportEntities(new Set(ctx.tables.keys()))) {
    guard();
    const table = getEntity(entity).table;
    const custom = customDefs(ctx.customFields, entity);
    const cols = entityColumns(entity, { custom });
    const { select } = entityNeeds(entity, ctx.tables.get(table), { custom });
    const tally = { rows: 0, deleted: 0 };
    const source = pages(admin, { projectId: ctx.projectId, table, select, live: true });
    const name = (n) => (n > 1 ? entityEntry(entity).replace(/\.csv$/, `-${n}.csv`) : entityEntry(entity));
    const files = await writeCsv(zp, { entryName: name, header: headerLine(cols), rows: csvPages(source, cols, lookups, tally), guard });
    entities.push({ entity, table, rows: tally.rows, headers: cols.map((c) => c.header), files });
  }

  const documents = { files: [], skipped: [] };
  const stored = await read("export_files", () => admin.rpc("export_files", { p_project: ctx.projectId }));
  for (const f of stored || []) {
    guard();
    const bytes = Number(f.size) || 0;
    if (bytes > partLimit) {
      documents.skipped.push({ bucket: f.bucket, path: f.name, bytes, reason: "Bigger than one archive part; download it from the record instead" });
      continue;
    }
    if (zp.full(bytes)) await zp.rotate();
    const body = await (deps.openObject || openObject)(f.bucket, f.name);
    const entry = await zp.current.zip.open(documentEntry(ctx.projectId, f.bucket, f.name));
    for await (const chunk of body) await entry.write(chunk);
    const res = await entry.close();
    documents.files.push({ bucket: f.bucket, path: f.name, file: res.name, part: zp.current.n, bytes: res.bytes, sha256: res.sha256 });
  }

  const last = zp.current;
  const parts = zp.parts.map((p) => ({ part: p.n, name: p.name, entries: p.zip.count + (p === last ? 1 : 0) }));
  const manifest = buildManifest({
    exportId: row.id,
    project: ctx.project,
    createdAt: new Date().toISOString(),
    requestedBy: row.metadata?.requestedByEmail || null,
    tables,
    entities,
    documents,
    parts,
    excludedColumns,
  });
  await last.zip.add("manifest.json", JSON.stringify(manifest, null, 2));
  return manifest;
}

// A large entity's CSV as one streamed .csv object.
async function writeEntityFile(admin, row, { ctx, prefix, now, guard, upload }) {
  const entity = row.entity;
  const table = getEntity(entity).table;
  const custom = customDefs(ctx.customFields, entity);
  const columns = ctx.tables.get(table);
  const { select, lookups: needs } = entityNeeds(entity, columns, { custom });
  const lookups = await loadLookups(admin, ctx, needs);
  const cols = entityColumns(entity, { custom });
  const name = entityFileName(entity, now);
  const up = upload(`${prefix}/${name}`, "text/csv;charset=utf-8");
  const enc = new TextEncoder();
  const tally = { rows: 0, deleted: 0 };
  try {
    await up.write(enc.encode(CSV_BOM + headerLine(cols)));
    for await (const page of csvPages(pages(admin, { projectId: ctx.projectId, table, select, live: true }), cols, lookups, tally)) {
      guard();
      await up.write(enc.encode(page.text));
    }
    await up.close();
  } catch (e) {
    await up.abort(e);
    throw e;
  }
  return { files: [{ part: 1, name, path: up.path, bytes: up.bytes, entries: 1 }], counts: { rows: tally.rows, bytes: up.bytes } };
}

// Signed download links for an export's files ({ name, url, bytes }).
export async function signExportFiles(admin, files, seconds) {
  const out = [];
  for (const f of files || []) {
    const { data, error } = await admin.storage.from(FILES_BUCKET).createSignedUrl(f.path, seconds, { download: f.name });
    if (error) throw new Error(`storage: ${error.message}`);
    out.push({ name: f.name, url: data.signedUrl, bytes: Number(f.bytes) || 0 });
  }
  return out;
}

const sizeLabel = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

// Email (export_ready, honouring the project's notification switches) and an in-app notice to whoever asked; never throws.
async function deliver(admin, row, { links, deps }) {
  const view = exportView(row);
  const what = row.kind === "entity" ? `${view.label} CSV` : "full data export";
  const until = new Date(row.expires_at).toUTCString();
  const subject = `Your ${what} is ready`;
  const paragraphs = [
    `Your ${what} has finished${row.kind === "full" ? ` (${row.counts?.rows ?? 0} rows across ${row.counts?.tables ?? 0} tables, ${row.counts?.documents ?? 0} documents)` : ""}.`,
    ...links.map((l) => `${l.name} (${sizeLabel(l.bytes)}): ${l.url}`),
    `The links work until ${until}. Anyone with a link can download the file, so don't forward this email.`,
  ];
  const out = { email: "skipped", notice: "skipped" };
  try {
    const res = await (deps.notify || notifyMembers)(admin, {
      projectId: row.project_id,
      userIds: row.requested_by ? [row.requested_by] : [],
      title: subject,
      body: "Download it from Settings → Import & Export.",
      url: exportsPath(row.project_id),
      category: "update",
      dedupeKey: `export-ready:${row.id}`,
      data: { exportId: row.id },
    });
    out.notice = res ? "sent" : "skipped";
  } catch (e) {
    console.error("[export.notify]", e);
    out.notice = "failed";
  }
  const to = row.metadata?.requestedByEmail;
  if (to) {
    try {
      const res = await (deps.sendEmail || sendNotificationEmail)({
        db: admin,
        projectId: row.project_id,
        notification: "export_ready",
        to,
        subject,
        data: { recipientName: row.metadata?.requestedByName || "", subject, body: paragraphs.join("\n\n"), paragraphs, ctaUrl: links[0]?.url, ctaLabel: "Download", links, expiresAt: row.expires_at, appUrl: appBase() ? `${appBase()}${exportsPath(row.project_id)}` : undefined },
      });
      out.email = res?.ok ? "sent" : res?.skipped ? "disabled" : res?.error || "failed";
    } catch (e) {
      console.error("[export.email]", e);
      out.email = "failed";
    }
  }
  return out;
}

// Run one claimed export row to the end: success records files, counts, expiry and delivery; failure removes what was uploaded.
export async function runExport(admin, row, { now = new Date(), deadline = Date.now() + RUN_BUDGET_MS, partLimit = PART_LIMIT, deps = {} } = {}) {
  const guard = () => {
    if (Date.now() > deadline) throw new Error("The export ran out of time. Try again, or export one list at a time.");
  };
  const upload = (path, type) => (deps.openUpload || openUpload)(path, type);
  const prefix = exportPrefix(row.project_id, row.id);
  const zp = zipParts({ prefix, now, limit: partLimit, upload });
  let written = [];
  try {
    const ctx = await loadContext(admin, row.project_id);
    let files;
    let counts;
    if (row.kind === "entity") {
      if (!hasEntity(row.entity) || !ctx.tables.has(getEntity(row.entity).table)) throw new Error(`Unknown export list: ${row.entity}`);
      ({ files, counts } = await writeEntityFile(admin, row, { ctx, prefix, now, guard, upload }));
    } else {
      const manifest = await writeFullArchive(admin, row, { ctx, zp, guard, partLimit, deps });
      files = await zp.finish();
      const t = manifest.totals;
      counts = { tables: t.tables, rows: t.rows, deletedRows: t.deletedRows, documents: t.documents, documentBytes: t.documentBytes, parts: files.length, bytes: files.reduce((n, f) => n + f.bytes, 0) };
    }
    written = files;
    const expiresAt = new Date(Date.now() + LINK_SECONDS * 1000).toISOString();
    const patch = { status: "succeeded", bucket: FILES_BUCKET, storage_path: files[0]?.path || null, files, counts, expires_at: expiresAt, finished_at: new Date().toISOString(), error: null };
    const { data: saved, error } = await admin.from("export_jobs").update(patch).eq("id", row.id).select("*").single();
    if (error) throw new Error(`export_jobs: ${error.message}`);
    const links = await signExportFiles(admin, files, LINK_SECONDS);
    const delivery = await deliver(admin, saved, { links, deps });
    await admin.from("export_jobs").update({ metadata: { ...(saved.metadata || {}), delivery } }).eq("id", row.id);
    return { ...saved, delivery, links };
  } catch (e) {
    await zp.abort(e);
    const paths = [...zp.parts.filter((p) => p.result).map((p) => p.path), ...written.map((f) => f.path)].filter(Boolean);
    if (paths.length) await admin.storage.from(FILES_BUCKET).remove([...new Set(paths)]).catch(() => {});
    await admin.from("export_jobs").update({ status: "failed", error: shortError(e), finished_at: new Date().toISOString() }).eq("id", row.id);
    throw e;
  }
}

// Fail queued/running rows a dead worker left behind, and remove archives past their 7 days (status expired).
export async function tidyExports(admin, projectId, now = new Date()) {
  const stale = new Date(now.getTime() - STALE_MINUTES * MINUTE).toISOString();
  const at = now.toISOString();
  const error = "The export stopped part-way. Start it again.";
  await forProject(admin.from("export_jobs").update({ status: "failed", error, finished_at: at }), projectId).eq("status", "running").lt("started_at", stale);
  await forProject(admin.from("export_jobs").update({ status: "failed", error, finished_at: at }), projectId).eq("status", "queued").lt("created_at", stale);
  const { data: expired } = await forProject(admin.from("export_jobs").select("id, files, metadata"), projectId).eq("status", "succeeded").lt("expires_at", at).is("deleted_at", null).limit(50);
  for (const row of expired || []) {
    const paths = (row.files || []).map((f) => f.path).filter(Boolean);
    if (paths.length) {
      const { error: rmError } = await admin.storage.from(FILES_BUCKET).remove(paths);
      if (rmError) continue;
    }
    await admin.from("export_jobs").update({ status: "expired", metadata: { ...(row.metadata || {}), purgedAt: at } }).eq("id", row.id);
  }
}

// Claim the project's oldest queued export (queued → running), or null.
async function claimNext(admin, projectId) {
  const { data } = await forProject(admin.from("export_jobs").select("id"), projectId).eq("status", "queued").is("deleted_at", null).order("created_at").limit(1);
  if (!data?.[0]) return null;
  const { data: row } = await admin.from("export_jobs").update({ status: "running", started_at: new Date().toISOString() }).eq("id", data[0].id).eq("status", "queued").select("*").maybeSingle();
  return row || null;
}

// The export-full job's body: tidy, then run what is queued for the project (one at a time; the unique index allows one).
export async function processQueuedExports(admin, { projectId, now = new Date(), deps = {}, partLimit } = {}) {
  const result = emptyResult();
  await tidyExports(admin, projectId, now);
  const deadline = Date.now() + RUN_BUDGET_MS;
  for (let row = await claimNext(admin, projectId); row; row = await claimNext(admin, projectId)) {
    try {
      const done = await runExport(admin, row, { now, deadline, deps, partLimit });
      result.processed += 1;
      result.created += done.files.length;
    } catch (e) {
      console.error("[export.run]", e);
      result.errors.push(shortError(e));
    }
    if (Date.now() > deadline) break;
  }
  return result;
}

// Live rows per catalogue entity, for the per-list buttons.
export async function entityCounts(admin, projectId) {
  const { data, error } = await admin.rpc("export_tables");
  if (error) throw new Error(`export_tables: ${error.message}`);
  const tables = new Set((data || []).map((t) => t.table_name));
  const out = [];
  for (const entity of exportEntities(tables)) {
    const e = getEntity(entity);
    const { count } = await forProject(admin.from(e.table).select("id", { count: "exact", head: true }), projectId).is("deleted_at", null);
    out.push({ key: entity, label: e.label, plural: e.plural, rows: count || 0, sync: (count || 0) <= ENTITY_SYNC_LIMIT });
  }
  return out;
}

// One entity's live rows as an import-format CSV (with BOM), or { tooMany } past ENTITY_SYNC_LIMIT.
export async function entityCsv(admin, { projectId, entity, now = new Date() }) {
  if (!hasEntity(entity)) throw new Error(`Unknown export list: ${entity}`);
  const ctx = await loadContext(admin, projectId);
  const table = getEntity(entity).table;
  const columns = ctx.tables.get(table);
  if (!columns) throw new Error(`Unknown export list: ${entity}`);
  const { count, error } = await forProject(admin.from(table).select("id", { count: "exact", head: true }), projectId).is("deleted_at", null);
  if (error) throw new Error(`${table}: ${error.message}`);
  if ((count || 0) > ENTITY_SYNC_LIMIT) return { tooMany: true, rows: count };
  const custom = customDefs(ctx.customFields, entity);
  const { select, lookups: needs } = entityNeeds(entity, columns, { custom });
  const lookups = await loadLookups(admin, ctx, needs);
  const cols = entityColumns(entity, { custom });
  const tally = { rows: 0, deleted: 0 };
  let text = headerLine(cols);
  for await (const page of csvPages(pages(admin, { projectId, table, select, live: true }), cols, lookups, tally)) text += page.text;
  return { csv: CSV_BOM + text, rows: tally.rows, fileName: entityFileName(entity, now), headers: cols.map((c) => c.header) };
}
