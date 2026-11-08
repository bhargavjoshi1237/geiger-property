import { FILES_BUCKET, LEGACY_BUCKET, LEGACY_PREFIX, PUBLIC_BUCKET, legacyPath, migratedPath } from "@/lib/files/refs";
import { emptyResult, projectError } from "./contract";

// storage-migrate (PLAT-01g): moves pre-01g public files (products/property/…) into the Property buckets. Server-only, service role.
// copy (staff Run now): copies each referenced object server-side to <projectId>/… in property-files (covers, logos and listing
// photos: property-public) and records the ref beside the old url, which stays. Idempotent: rows already holding a ref are skipped.
// cleanup (operator, at least 14 days after the first copy run): removes the old products objects and clears the old urls.
// dryRun: either step reports what it would do and writes nothing.

// Tables whose file is bucket + storage_path (their `url` column is the legacy copy).
export const FILE_TABLES = ["documents", "media", "maintenance_attachments", "tenant_documents", "chat_files"];
export const CLEANUP_MIN_DAYS = 14;
const DAY = 86400000;

const camel = (s) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
const isObj = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);
// A column `cover_url` keeps its ref in metadata as `coverFile` (`image_url` → `imageFile`).
export const metaKeyForColumn = (column) => `${camel(column.replace(/_url$/, ""))}File`;
// `documentUrl` / `attachmentLink` → the sibling `documentFile` / `attachmentFile`.
const siblingKey = (key) => key.replace(/(Url|Link)$/, "File");
const LINK_KEY = /^[a-zA-Z0-9]+(Url|Link)$/;

// Public-facing files (covers, portal logos, listing photos) go to property-public; everything else stays private.
export function targetBucket({ table, column, key, row }) {
  if (table === "properties" && column === "cover_url") return PUBLIC_BUCKET;
  if (table === "media" && row?.owner_type === "listing") return PUBLIC_BUCKET;
  if (key === "coverUrl" || key === "logoUrl") return PUBLIC_BUCKET;
  return FILES_BUCKET;
}

// Copy step for a JSON value (metadata, settings value): objects with a legacy `url` gain { bucket, path }; legacy `<x>Url` strings gain
// a sibling `<x>File`. `ok(src)` limits refs to sources that copied. Returns { value, copies, changed }.
export function addRefs(value, { projectId, table, column, row, ok = () => true }) {
  const copies = [];
  const walk = (v, key) => {
    if (Array.isArray(v)) return v.map((x) => walk(x, key));
    if (!isObj(v)) return v;
    const out = {};
    for (const [k, x] of Object.entries(v)) out[k] = walk(x, k);
    const src = typeof v.url === "string" && !v.path ? legacyPath(v.url) : null;
    if (src) {
      const bucket = targetBucket({ table, column, key, row });
      const dest = migratedPath(projectId, src);
      if (dest) {
        copies.push({ src, bucket, dest });
        if (ok(src)) Object.assign(out, { bucket, path: dest });
      }
    }
    for (const [k, x] of Object.entries(v)) {
      if (!LINK_KEY.test(k) || typeof x !== "string" || v[siblingKey(k)]?.path) continue;
      const legacy = legacyPath(x);
      const dest = legacy && migratedPath(projectId, legacy);
      if (!dest) continue;
      const bucket = targetBucket({ table, column, key: k, row });
      copies.push({ src: legacy, bucket, dest });
      if (ok(legacy)) out[siblingKey(k)] = { bucket, path: dest };
    }
    return out;
  };
  const next = walk(value, column);
  return { value: next, copies, changed: JSON.stringify(next) !== JSON.stringify(value) };
}

// Cleanup step for a JSON value: legacy urls whose ref is recorded are dropped (public refs: repointed). Returns { value, removes, changed }.
export function dropLegacy(value, { publicUrl, keep = () => false }) {
  const removes = [];
  const walk = (v) => {
    if (Array.isArray(v)) return v.map(walk);
    if (!isObj(v)) return v;
    const out = {};
    for (const [k, x] of Object.entries(v)) out[k] = walk(x);
    const src = typeof v.url === "string" ? legacyPath(v.url) : null;
    if (src && v.bucket && v.path && !keep(src)) {
      removes.push(src);
      if (v.bucket === PUBLIC_BUCKET) out.url = publicUrl(v.path);
      else delete out.url;
    }
    for (const [k, x] of Object.entries(v)) {
      const ref = LINK_KEY.test(k) && typeof x === "string" ? v[siblingKey(k)] : null;
      const legacy = ref?.path ? legacyPath(x) : null;
      if (!legacy || keep(legacy)) continue;
      removes.push(legacy);
      out[k] = ref.bucket === PUBLIC_BUCKET ? publicUrl(ref.path) : "";
    }
    return out;
  };
  const next = walk(value);
  return { value: next, removes, changed: JSON.stringify(next) !== JSON.stringify(value) };
}

// The copy plan for one row: { copies, columns, meta, value, unhandled } (columns: a column patch, meta: a merge_meta patch, value: settings).
export function planCopy({ table, row, columns, ok = () => true }) {
  const projectId = row.project_id;
  const out = { copies: [], columns: {}, meta: {}, value: null, unhandled: [] };
  const meta = isObj(row.metadata) ? row.metadata : {};
  const add = (src, bucket) => {
    const dest = migratedPath(projectId, src);
    if (!dest) return null;
    out.copies.push({ src, bucket, dest });
    return ok(src) ? dest : null;
  };
  for (const column of columns) {
    const raw = row[column];
    if (column === "metadata" || (table === "settings" && column === "value")) {
      const r = addRefs(raw, { projectId, table, column, row, ok });
      out.copies.push(...r.copies);
      if (!r.changed) continue;
      if (column === "value") out.value = r.value;
      else for (const k of Object.keys(r.value)) if (JSON.stringify(r.value[k]) !== JSON.stringify(meta[k])) out.meta[k] = r.value[k];
      continue;
    }
    const src = typeof raw === "string" ? legacyPath(raw) : null;
    if (!src) {
      out.unhandled.push(column);
      continue;
    }
    const bucket = targetBucket({ table, column, row });
    if (FILE_TABLES.includes(table) && column === "url") {
      if (row.storage_path) continue;
      const dest = add(src, bucket);
      if (dest) Object.assign(out.columns, { bucket, storage_path: dest });
    } else if (table === "media" && column === "thumb_url" && raw === row.url) {
      continue;
    } else if (/_url$/.test(column)) {
      const key = metaKeyForColumn(column);
      if (meta[key]?.path) continue;
      const dest = add(src, bucket);
      if (dest) out.meta[key] = { bucket, path: dest };
    } else {
      out.unhandled.push(column);
    }
  }
  return out;
}

// The cleanup plan for one row: { removes, columns, meta, value }; `keep(src)` holds back sources other rows still need.
export function planCleanup({ table, row, columns, publicUrl, keep = () => false }) {
  const out = { removes: [], columns: {}, meta: {}, value: null };
  const meta = isObj(row.metadata) ? row.metadata : {};
  const repoint = (ref) => (ref.bucket === PUBLIC_BUCKET ? publicUrl(ref.path) : null);
  for (const column of columns) {
    const raw = row[column];
    if (column === "metadata" || (table === "settings" && column === "value")) {
      const r = dropLegacy(raw, { publicUrl, keep });
      out.removes.push(...r.removes);
      if (!r.changed) continue;
      if (column === "value") out.value = r.value;
      else for (const k of Object.keys(r.value)) if (JSON.stringify(r.value[k]) !== JSON.stringify(meta[k])) out.meta[k] = r.value[k];
      continue;
    }
    const src = typeof raw === "string" ? legacyPath(raw) : null;
    if (!src || keep(src)) continue;
    let ref = null;
    if (FILE_TABLES.includes(table) && (column === "url" || (column === "thumb_url" && raw === row.url))) {
      ref = row.storage_path ? { bucket: row.bucket, path: row.storage_path } : null;
    } else if (/_url$/.test(column)) {
      ref = meta[metaKeyForColumn(column)]?.path ? meta[metaKeyForColumn(column)] : null;
    }
    if (!ref) continue;
    out.removes.push(src);
    out.columns[column] = repoint(ref);
  }
  return out;
}

const hasWrites = (p) => Object.keys(p.columns).length || Object.keys(p.meta).length || p.value;

// Copy one legacy object server-side → "copied" | "exists" | "missing" | an error message.
async function copyObject(admin, { src, bucket, dest }) {
  const { error } = await admin.storage.from(LEGACY_BUCKET).copy(src, dest, { destinationBucket: bucket });
  if (!error) return "copied";
  const text = `${error.message || ""} ${error.statusCode || error.status || ""}`;
  if (/already exists|duplicate|409/i.test(text)) return "exists";
  if (/not.?found|404/i.test(text)) return "missing";
  return error.message || "copy failed";
}

async function writeRow(admin, table, row, plan) {
  if (Object.keys(plan.columns).length) {
    const { error } = await admin.from(table).update(plan.columns).eq("id", row.id).eq("project_id", row.project_id);
    if (error) throw new Error(`${table} ${row.id}: ${error.message}`);
  }
  if (Object.keys(plan.meta).length) {
    const { error } = await admin.rpc("merge_meta", { p_table: table, p_id: row.id, p_patch: plan.meta });
    if (error) throw new Error(`${table} ${row.id} metadata: ${error.message}`);
  }
  if (plan.value) {
    const { error } = await admin.from(table).update({ value: plan.value }).eq("id", row.id).eq("project_id", row.project_id);
    if (error) throw new Error(`${table} ${row.id} value: ${error.message}`);
  }
}

// When cleanup may run: the project's first finished storage-migrate run (the copy) is at least CLEANUP_MIN_DAYS old.
export async function cleanupGate(admin, projectId, now = new Date(), minDays = CLEANUP_MIN_DAYS) {
  const { data, error } = await admin
    .from("job_runs")
    .select("started_at")
    .eq("job_key", "storage-migrate")
    .eq("project_id", projectId)
    .in("status", ["succeeded", "partial"])
    .is("deleted_at", null)
    .order("started_at", { ascending: true })
    .limit(1);
  if (error) return { ok: false, reason: `job_runs: ${error.message}` };
  const first = data?.[0]?.started_at;
  if (!first) return { ok: false, reason: "No storage-migrate copy run has finished for this project yet." };
  const ready = new Date(new Date(first).getTime() + minDays * DAY);
  return ready <= now ? { ok: true, firstCopyAt: first } : { ok: false, firstCopyAt: first, reason: `The first copy ran ${first}; cleanup opens ${ready.toISOString()}.` };
}

// One run. projectId null scans every project (dry runs only). Returns the job result plus a per-row report.
export async function runStorageMigrate({ admin, projectId = null, mode = "copy", dryRun = false, now = new Date(), minDays = CLEANUP_MIN_DAYS } = {}) {
  const res = { ...emptyResult(), mode, dryRun, rows: [], missing: [], unhandled: [] };
  if (!["copy", "cleanup"].includes(mode)) return { ...res, errors: [`Unknown mode "${mode}"`] };
  if (!projectId && !dryRun) return { ...res, errors: ["A project is required for a run that writes."] };
  if (mode === "cleanup" && !dryRun) {
    const gate = await cleanupGate(admin, projectId, now, minDays);
    if (!gate.ok) return { ...res, errors: [projectError(projectId, `Cleanup refused: ${gate.reason}`)] };
  }

  const { data: hits, error } = await admin.rpc("storage_legacy_refs", { p_project: projectId });
  if (error) return { ...res, errors: [projectError(projectId, `storage_legacy_refs: ${error.message}`)] };
  const groups = new Map();
  for (const h of hits || []) {
    const k = `${h.table_name}|${h.row_id}`;
    if (!groups.has(k)) groups.set(k, { table: h.table_name, id: h.row_id, projectId: h.project_id, columns: [] });
    groups.get(k).columns.push(h.column_name);
  }
  const loaded = [];
  for (const g of groups.values()) {
    const { data: row, error: readError } = await admin.from(g.table).select("*").eq("id", g.id).eq("project_id", g.projectId).maybeSingle();
    if (readError || !row) res.errors.push(projectError(g.projectId, `${g.table} ${g.id}: ${readError?.message || "not found"}`));
    else loaded.push({ ...g, row });
  }

  const base = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const publicUrl = (path) => `${base}/storage/v1/object/public/${PUBLIC_BUCKET}/${path}`;
  // Sources some row still points at without a ref: cleanup keeps them.
  const pending = new Set(loaded.flatMap((g) => planCopy(g).copies.filter((c) => c.src).map((c) => c.src)));
  for (const g of loaded) {
    const row = g.row;
    const entry = { table: g.table, id: g.id, projectId: g.projectId, deleted: Boolean(row.deleted_at) };
    try {
      if (mode === "copy") {
        const plan = planCopy(g);
        if (plan.unhandled.length) res.unhandled.push({ table: g.table, id: g.id, columns: plan.unhandled });
        entry.copies = plan.copies;
        if (!plan.copies.length) {
          res.skipped += 1;
          entry.status = "already copied";
        } else if (dryRun) {
          const found = await Promise.all(plan.copies.map((c) => admin.storage.from(LEGACY_BUCKET).exists(c.src)));
          const missing = plan.copies.filter((c, i) => found[i].data !== true);
          for (const c of missing) res.missing.push({ table: g.table, id: g.id, src: c.src });
          entry.status = missing.length === plan.copies.length ? "would skip (original missing)" : "would copy";
        } else {
          const outcome = new Map();
          for (const c of plan.copies) if (!outcome.has(c.src)) outcome.set(c.src, await copyObject(admin, c));
          const ok = (src) => ["copied", "exists"].includes(outcome.get(src));
          for (const [src, o] of outcome) {
            if (o === "copied") res.created += 1;
            else if (o === "missing") res.missing.push({ table: g.table, id: g.id, src });
            else if (o !== "exists") res.errors.push(projectError(g.projectId, `${g.table} ${g.id}: copy ${src}: ${o}`));
          }
          const final = planCopy({ ...g, ok });
          if (hasWrites(final)) {
            await writeRow(admin, g.table, row, final);
            res.processed += 1;
          } else res.skipped += 1;
          entry.status = [...outcome.values()].join(", ");
        }
      } else {
        const plan = planCleanup({ ...g, publicUrl, keep: (src) => pending.has(src) });
        entry.removes = plan.removes;
        if (!plan.removes.length && !hasWrites(plan)) {
          res.skipped += 1;
          entry.status = planCopy(g).copies.length ? "waiting for a copy run" : "nothing to clean";
        } else if (dryRun) {
          entry.status = "would clean";
        } else {
          const unique = [...new Set(plan.removes)];
          // Only property/… objects are ever removed, and only once their copy is in place.
          for (const src of unique) {
            if (!src.startsWith(LEGACY_PREFIX)) throw new Error(`refusing to remove ${src}`);
            const dest = migratedPath(row.project_id, src);
            const found = await Promise.all([FILES_BUCKET, PUBLIC_BUCKET].map((b) => admin.storage.from(b).exists(dest)));
            if (!found.some((f) => f.data === true)) throw new Error(`the copy of ${src} is missing; run the copy again first`);
          }
          await writeRow(admin, g.table, row, plan);
          const { error: removeError } = unique.length ? await admin.storage.from(LEGACY_BUCKET).remove(unique) : { error: null };
          if (removeError) throw new Error(`remove: ${removeError.message}`);
          res.created += unique.length;
          res.processed += 1;
          entry.status = "cleaned";
        }
      }
    } catch (e) {
      res.errors.push(projectError(g.projectId, e?.message || String(e)));
      entry.status = "error";
    }
    res.rows.push(entry);
  }
  return res;
}

export const storageMigrateJob = {
  key: "storage-migrate",
  label: "Move files to private storage",
  description: "Copies files saved before private storage into the project's private bucket and links each record to its copy. Run now only.",
  schedule: "",
  manual: true,
  manualWhilePaused: true,
  run: ({ admin, now, projectId }) => runStorageMigrate({ admin, projectId, mode: "copy", now }),
};
