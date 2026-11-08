import "server-only";
import { forProject } from "@/lib/supabase/scope";
import { projectToday } from "@/lib/jobs/business_date";
import { fail } from "@/lib/billing/post";
import { stepRow, loadRentSteps } from "@/lib/billing/steps";
import { initialStepFor } from "@/lib/billing/rent";
import { FILES_BUCKET, inPrefix, isUuid } from "@/lib/files/refs";
import { isMonthStart, openingDate } from "@/lib/ledger/conversion";
import { loadBatchLines, postBatch, projectIsLive, voidBatch } from "@/lib/ledger/conversion_server";
import { IMPORT_ENTITIES, SOURCE_SYSTEMS, importLabel, importSpec, isBalanceEntity } from "./import_spec";
import { applyMapping, mappingCoverage, unmappedRequired } from "./mapping";
import { buildIndex } from "./index";
import { planRows, statusCounts } from "./validate";
import { normalizeOptions } from "./options";
import { IMPORT_NEEDS as NEEDS, WRITE_ORDER as TABLE_ORDER, committedStatus, plannedWrites, rowView } from "./plan";
import { money, tieOut } from "./balances";
import { stableUuid } from "./ids";
import { MAX_ROWS_PER_IMPORT as MAX_ROWS, STAGE_CHUNK as STAGE_LIMIT } from "./limits";

// Server-only import jobs (PLAT-03), behind the /api/import routes (requireStaff + property.data.import + service role):
// create a job for an uploaded file, stage its rows, validate them all, commit in chunks of 200 in dependency order
// (re-runnable: every write has a fixed id), roll back (soft deletes and restores, never hard deletes).

export { STAGE_CHUNK as STAGE_LIMIT, MAX_ROWS_PER_IMPORT as MAX_ROWS } from "./limits";
export const COMMIT_CHUNK = 200;
const PAGE = 1000;
const WRITE_BATCH = 500;
const IN_CHUNK = 150;
const EDITABLE = ["uploaded", "mapped", "validated"];
const must = (res, what) => {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
};
const nowIso = () => new Date().toISOString();
const chunks = (list, n) => Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, i * n + n));
const metaOf = (r) => (r?.metadata && typeof r.metadata === "object" ? r.metadata : {});

async function pagedRows(build, what) {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const rows = must(await build().range(from, from + PAGE - 1), what);
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

const loadTable = (admin, projectId, table) => pagedRows(() => forProject(admin.from(table).select("*"), projectId).is("deleted_at", null).order("created_at").order("id"), table);

async function rowsIn(admin, projectId, table, col, ids, select = "*") {
  const out = [];
  for (const part of chunks([...new Set(ids.filter(Boolean))], IN_CHUNK)) out.push(...must(await forProject(admin.from(table).select(select).in(col, part), projectId).is("deleted_at", null), table));
  return out;
}

async function readSetting(admin, projectId, key) {
  const rows = must(await forProject(admin.from("settings").select("id, value, deleted_at").eq("key", key), projectId).limit(1), `settings ${key}`);
  return rows[0] && !rows[0].deleted_at ? rows[0] : null;
}

// --- Jobs -----------------------------------------------------------------------------------------------------

export async function loadJob(admin, projectId, id) {
  if (!isUuid(id)) throw fail("Import not found.", 404);
  const row = must(await forProject(admin.from("import_jobs").select("*").eq("id", id), projectId).maybeSingle(), "import job");
  if (!row || row.deleted_at) throw fail("Import not found.", 404);
  return row;
}

const updateJob = async (admin, job, patch) => {
  must(await admin.from("import_jobs").update(patch).eq("id", job.id), "import job");
  Object.assign(job, patch);
  return job;
};

function cleanMapping(spec, mapping) {
  const keys = new Set(spec.fields.map((x) => x.key));
  return Object.fromEntries(Object.entries(mapping || {}).filter(([k, v]) => keys.has(k) && typeof v === "string" && v.trim() && v.length <= 200));
}

// POST /api/import/jobs → a job for a parsed file; the file ref is kept only inside <projectId>/import_jobs/<jobId>/.
export async function createJob(admin, projectId, body, { actor } = {}) {
  const entity = String(body.entity || "");
  if (!IMPORT_ENTITIES.includes(entity)) throw fail("Pick what you're importing.");
  const source = SOURCE_SYSTEMS.includes(body.sourceSystem) ? body.sourceSystem : "generic";
  let id = isUuid(body.id) ? body.id : crypto.randomUUID();
  const taken = must(await admin.from("import_jobs").select("id").eq("id", id).maybeSingle(), "import job");
  if (taken) id = crypto.randomUUID();
  const ref = body.file || {};
  const keepFile = ref.bucket === FILES_BUCKET && inPrefix(String(ref.path || ""), `${projectId}/import_jobs/${body.id}`) && id === body.id;
  const headers = (Array.isArray(body.headers) ? body.headers : []).map((h) => String(h).slice(0, 200)).slice(0, 300);
  const spec = importSpec(entity, { custom: (await readSetting(admin, projectId, "custom_fields"))?.value || {} });
  const mapping = cleanMapping(spec, body.mapping);
  const today = await projectToday(admin, projectId);
  const row = {
    id,
    project_id: projectId,
    entity,
    source_system: source,
    file_name: String(body.fileName || "").slice(0, 255) || null,
    bucket: keepFile ? FILES_BUCKET : null,
    storage_path: keepFile ? ref.path : null,
    mapping,
    options: normalizeOptions(entity, body.options, today),
    status: Object.keys(mapping).length ? "mapped" : "uploaded",
    counts: { total: 0 },
    created_by: actor?.id || null,
    metadata: { headers, sheet: String(body.sheet || "").slice(0, 120), detected: body.detected && typeof body.detected === "object" ? { label: String(body.detected.label || ""), score: Number(body.detected.score) || 0 } : null, createdByName: actor?.name || "" },
  };
  return must(await admin.from("import_jobs").insert(row).select("*").single(), "import job");
}

const cleanRaw = (raw) =>
  Object.fromEntries(
    Object.entries(raw && typeof raw === "object" ? raw : {})
      .slice(0, 300)
      .map(([k, v]) => [String(k).slice(0, 200), v === null || v === undefined ? "" : String(v).slice(0, 2000)]),
  );

// Rows for a job, upserted by row number (re-sending a chunk is harmless).
export async function stageRows(admin, job, rows) {
  if (!EDITABLE.includes(job.status)) throw fail("This import has already been committed.", 409);
  const list = (Array.isArray(rows) ? rows : []).filter((r) => Number.isInteger(r?.rowNo) && r.rowNo > 0);
  if (!list.length) throw fail("No rows to add.");
  if (list.length > STAGE_LIMIT) throw fail(`Send at most ${STAGE_LIMIT} rows at a time.`);
  const payload = list.map((r) => ({ project_id: job.project_id, job_id: job.id, row_no: r.rowNo, raw: cleanRaw(r.raw), mapped: {}, status: "pending", messages: [], target_table: null, target_id: null, before: null }));
  must(await admin.from("import_rows").upsert(payload, { onConflict: "job_id,row_no" }), "import rows");
  const { count, error } = await admin.from("import_rows").select("id", { count: "exact", head: true }).eq("job_id", job.id);
  if (error) throw new Error(error.message);
  if (count > MAX_ROWS) throw fail(`An import holds at most ${MAX_ROWS.toLocaleString("en-US")} rows — split the file.`);
  await updateJob(admin, job, { counts: { ...(job.counts || {}), total: count } });
  return { staged: list.length, total: count };
}

const jobRows = (admin, job, select = "id, row_no, raw, status") => pagedRows(() => admin.from("import_rows").select(select).eq("job_id", job.id).order("row_no"), "import rows");

// --- Context ------------------------------------------------------------------------------------------------------

async function specFor(admin, job) {
  return importSpec(job.entity, { custom: (await readSetting(admin, job.project_id, "custom_fields"))?.value || {} });
}

async function buildContext(admin, job, spec) {
  const existing = {};
  await Promise.all(NEEDS[job.entity].map(async (t) => (existing[t] = await loadTable(admin, job.project_id, t))));
  const options = job.options || {};
  return {
    jobId: job.id,
    entity: job.entity,
    spec,
    source: job.source_system,
    options,
    today: await projectToday(admin, job.project_id),
    opening: openingDate(options.cutoverDate),
    ix: buildIndex(existing),
    existing,
  };
}

const recordsOf = (rows, spec, job) => rows.map((r) => ({ rowNo: r.row_no, id: r.id, mapped: applyMapping(r.raw, spec, job.mapping, { source: job.source_system }) }));

// Mapping problems that stop a validation before any row is read.
function mappingProblems(job, spec) {
  const m = job.mapping || {};
  const out = unmappedRequired(spec, m).map((x) => `Map the ${x.label} column.`);
  if (job.entity === "leases" && !m.unit_id && !m["unit.external_id"]) out.push("Map the Unit column (or the unit's old-system ID).");
  if (["tenants", "owners"].includes(job.entity) && !m.name && !(m.first_name && m.last_name)) out.push("Map the Name column (or First and Last name).");
  if (job.entity === "leases" && !m["tenant.name"] && !m["tenant.email"] && !(m["tenant.first_name"] && m["tenant.last_name"])) out.push("Map the Tenant column (name, email, or first and last name).");
  if (job.entity === "gl_opening" && !m.debit && !m.credit && !m.balance) out.push("Map the Debit and Credit columns, or a Balance column.");
  if (job.entity === "open_balances" && !m.balance && !m.deposit && !m.age_0_30) out.push("Map a Balance, aging or Deposit column.");
  if (isBalanceEntity(job.entity) && !isMonthStart(job.options?.cutoverDate)) out.push("Pick the cutover date — the first day of a month.");
  return out;
}

// Tie-out targets other trial-balance imports left on the same batch.
async function batchTargets(admin, job, batchId) {
  if (!batchId) return [];
  const jobs = must(await forProject(admin.from("import_jobs").select("id, counts").eq("entity", "gl_opening").eq("status", "committed"), job.project_id).is("deleted_at", null), "import jobs");
  return jobs.filter((j) => j.id !== job.id && j.counts?.batch?.id === batchId).flatMap((j) => j.counts?.tieOutTargets || []);
}

// The batch these lines would make, with the trial balance's held-back accounts → tieOut().
async function balancesPreview(admin, job, ctx, results) {
  const batchId = job.counts?.batch?.id || job.options?.batchId || "";
  const existing = batchId ? (await loadBatchLines(admin, job.project_id, batchId)).filter((l) => metaOf(l).importJobId !== job.id) : [];
  const targets = [...results.filter((r) => r.tieOut && r.status !== "error").map((r) => r.tieOut), ...(await batchTargets(admin, job, batchId))];
  const fees = await readSetting(admin, job.project_id, "fees_policies");
  const t = tieOut({
    lines: [...existing, ...results.filter((r) => r.status !== "error").flatMap((r) => r.lines)],
    accounts: ctx.ix.gl_accounts.all().map((e) => e.row),
    banks: ctx.existing.bank_accounts || (await loadTable(admin, job.project_id, "bank_accounts")),
    batch: { id: batchId || "draft", cutoverDate: job.options?.cutoverDate, metadata: {} },
    targets,
    depositHeldIn: fees?.value?.depositHeldIn || "trust",
  });
  return { clearingNet: t.clearingNet, ready: t.ready, rows: t.rows, totals: t.totals, errors: t.errors.slice(0, 20).map((e) => e.message), targets: results.filter((r) => r.tieOut).map((r) => r.tieOut) };
}

// POST rows { action: "validate" }: re-map every staged row, validate and plan it, and save each row's status.
export async function validateJob(admin, job, { mapping, options } = {}) {
  if (!EDITABLE.includes(job.status)) throw fail("This import has already been committed — start a new import to change it.", 409);
  const spec = await specFor(admin, job);
  const today = await projectToday(admin, job.project_id);
  if (mapping) job.mapping = cleanMapping(spec, mapping);
  if (options) job.options = normalizeOptions(job.entity, { ...(job.options || {}), ...options }, today);
  const problems = mappingProblems(job, spec);
  if (problems.length) throw Object.assign(fail(problems[0], 400), { problems });
  if (isBalanceEntity(job.entity) && job.options.batchId) {
    const b = must(await forProject(admin.from("conversion_batches").select("id, status, cutover_date, deleted_at").eq("id", job.options.batchId), job.project_id).maybeSingle(), "batch");
    if (!b || b.deleted_at) throw fail("That opening-balance batch isn't in this project.", 404);
    if (b.status !== "Draft") throw fail("That opening-balance batch is already posted — pick a draft batch or start a new one.", 409);
    if (b.cutover_date !== job.options.cutoverDate) throw fail(`That batch cuts over on ${b.cutover_date} — use the same cutover date.`, 409);
  }
  const rows = await jobRows(admin, job);
  if (!rows.length) throw fail("Add the file's rows first.");
  const ctx = await buildContext(admin, job, spec);
  const records = recordsOf(rows, spec, job);
  const { results, problems: jobProblems } = planRows(records, ctx);
  const byNo = new Map(records.map((r) => [r.rowNo, r]));
  for (const part of chunks(results, WRITE_BATCH)) {
    const payload = part.map((r) => ({ id: byNo.get(r.rowNo).id, project_id: job.project_id, job_id: job.id, row_no: r.rowNo, mapped: byNo.get(r.rowNo).mapped, status: r.status, messages: r.messages, target_table: null, target_id: null, before: null }));
    must(await admin.from("import_rows").upsert(payload, { onConflict: "id" }), "import rows");
  }
  const counts = {
    ...statusCounts(results),
    writes: plannedWrites(results),
    coverage: mappingCoverage(job.metadata?.headers || [], job.mapping),
    problems: jobProblems.map((p) => p.text),
    ...(job.counts?.batch ? { batch: job.counts.batch } : {}),
  };
  if (isBalanceEntity(job.entity)) {
    counts.balances = await balancesPreview(admin, job, ctx, results);
    if (job.entity === "gl_opening") counts.tieOutTargets = counts.balances.targets;
  }
  await updateJob(admin, job, { mapping: job.mapping, options: job.options, status: "validated", counts, error: null });
  return { job, counts, rows: results.slice(0, 200).map((r) => rowView(byNo.get(r.rowNo), r)) };
}

// --- Commit ------------------------------------------------------------------------------------------------------

// The draft batch a balance import writes into: the one picked, the one this job made earlier, else a new one.
async function ensureBatch(admin, job, actor) {
  const id = job.counts?.batch?.id || job.options?.batchId || stableUuid(`import:${job.id}:batch`);
  const found = must(await forProject(admin.from("conversion_batches").select("*").eq("id", id), job.project_id).maybeSingle(), "batch");
  if (found && !found.deleted_at) {
    if (found.status === "Voided") throw fail("The opening-balance batch was voided — start a new import.", 409);
    if (found.status === "Posted" && job.status !== "committing") throw fail("That opening-balance batch is already posted.", 409);
    if (!job.counts?.batch) await updateJob(admin, job, { counts: { ...job.counts, batch: { id, created: false } } });
    return found;
  }
  const row = {
    id,
    project_id: job.project_id,
    name: `Import · ${job.file_name || importLabel(job.entity)}`.slice(0, 120),
    cutover_date: job.options.cutoverDate,
    status: "Draft",
    created_by: actor?.id || null,
    metadata: { banks: [], importJobIds: [job.id] },
  };
  must(await admin.from("conversion_batches").upsert(row, { onConflict: "id", ignoreDuplicates: true }), "batch");
  await updateJob(admin, job, { counts: { ...job.counts, batch: { id, created: true } } });
  return must(await admin.from("conversion_batches").select("*").eq("id", id).single(), "batch");
}

async function executeOps(admin, job, results, actor) {
  const ops = results.filter((r) => r.status !== "error").flatMap((r) => r.ops);
  for (const table of TABLE_ORDER) {
    const inserts = ops.filter((o) => o.table === table && o.op === "insert").map((o) => ({ ...o.values, project_id: job.project_id, created_by: actor?.id || null }));
    for (const part of chunks(inserts, WRITE_BATCH)) must(await admin.from(table).upsert(part, { onConflict: "id", ignoreDuplicates: true }), table);
    for (const o of ops.filter((x) => x.table === table && x.op === "update")) must(await forProject(admin.from(table).update(o.values), job.project_id).eq("id", o.id), table);
  }
}

async function insertLines(admin, job, batch, results, actor) {
  const lines = results.filter((r) => r.status !== "error").flatMap((r) => r.lines).map((l) => ({ ...l, project_id: job.project_id, batch_id: batch.id, created_by: actor?.id || null }));
  for (const part of chunks(lines, WRITE_BATCH)) must(await admin.from("conversion_lines").upsert(part, { onConflict: "id", ignoreDuplicates: true }), "batch lines");
}

// Live leases the chunk created get CORE-01's rent schedule and rent account (billing starts at the job's billing start).
async function setupBilling(admin, job, results, actor) {
  const ids = results.filter((r) => r.status !== "error").flatMap((r) => r.billing);
  if (!ids.length) return;
  const leases = await rowsIn(admin, job.project_id, "leases", "id", ids);
  const steps = await loadRentSteps(admin, ids);
  const stepRows = leases.filter((l) => !(steps.get(l.id) || []).length).map((l) => stepRow(l, { ...initialStepFor(l), metadata: { auto: true, importJobId: job.id } }, actor));
  for (const part of chunks(stepRows, WRITE_BATCH)) must(await admin.from("lease_rent_steps").insert(part), "rent steps");
  const have = new Set((await rowsIn(admin, job.project_id, "rent_accounts", "lease_id", ids, "lease_id")).map((r) => r.lease_id));
  const props = new Map((await rowsIn(admin, job.project_id, "properties", "id", leases.map((l) => l.property_id), "id, name")).map((p) => [p.id, p.name]));
  const accounts = leases
    .filter((l) => !have.has(l.id))
    .map((l) => {
      const who = [l.unit, l.tenant_name].filter(Boolean).join(" — ") || l.name || "Rent account";
      const propertyName = props.get(l.property_id) || "";
      return { project_id: job.project_id, name: propertyName ? `${propertyName} · ${who}` : who, unit: l.unit || null, tenant_name: l.tenant_name || null, tenant_id: l.tenant_id || null, unit_id: l.unit_id || null, property_id: l.property_id || null, lease_id: l.id, status: "Current", autopay: false, created_by: actor?.id || null, metadata: { autoCreated: true, importJobId: job.id, ...(propertyName ? { propertyName } : {}) } };
    });
  for (const part of chunks(accounts, WRITE_BATCH)) must(await admin.from("rent_accounts").insert(part), "rent accounts");
}

// properties.unit_count and owners.properties_count follow the rows (the screens keep them the same way).
async function recount(admin, projectId, { propertyIds = [], ownerIds = [] }) {
  for (const id of [...new Set(propertyIds.filter(Boolean))]) {
    const { count, error } = await forProject(admin.from("units").select("id", { count: "exact", head: true }).eq("property_id", id), projectId).is("deleted_at", null);
    if (!error) must(await forProject(admin.from("properties").update({ unit_count: count || 0 }), projectId).eq("id", id), "unit count");
  }
  for (const id of [...new Set(ownerIds.filter(Boolean))]) {
    const { count, error } = await forProject(admin.from("property_owners").select("id", { count: "exact", head: true }).eq("owner_id", id), projectId).is("deleted_at", null);
    if (!error) must(await forProject(admin.from("owners").update({ properties_count: count || 0 }), projectId).eq("id", id), "owner count");
  }
}

const touched = (results) => {
  const ops = results.filter((r) => r.status !== "error").flatMap((r) => r.ops);
  return {
    propertyIds: ops.filter((o) => o.table === "units").map((o) => o.values.property_id || null).concat(ops.filter((o) => o.table === "properties").map((o) => o.id)),
    ownerIds: ops.filter((o) => o.table === "property_owners").map((o) => o.values.owner_id || null),
  };
};

async function markCommitted(admin, job, records, results) {
  const byNo = new Map(records.map((r) => [r.rowNo, r]));
  const payload = results.map((r) => {
    const updates = r.ops.filter((o) => o.op === "update").map((o) => ({ table: o.table, id: o.id, before: o.before, after: o.values }));
    const created = [...r.ops.filter((o) => o.op === "insert").map((o) => ({ table: o.table, id: o.id })), ...r.lines.map((l) => ({ table: "conversion_lines", id: l.id }))];
    return {
      id: byNo.get(r.rowNo).id,
      project_id: job.project_id,
      job_id: job.id,
      row_no: r.rowNo,
      status: committedStatus(r),
      messages: r.messages,
      target_table: r.primary?.table || null,
      target_id: r.primary?.id || null,
      before: updates.length ? updates : null,
      metadata: { created, ...(r.tieOut ? { tieOut: r.tieOut } : {}) },
    };
  });
  for (const part of chunks(payload, WRITE_BATCH)) must(await admin.from("import_rows").upsert(part, { onConflict: "id" }), "import rows");
}

async function rowCounts(admin, job) {
  const rows = await jobRows(admin, job, "status");
  const out = { total: rows.length };
  for (const r of rows) out[r.status] = (out[r.status] || 0) + 1;
  return out;
}

// After the last chunk: counts, and for balances the batch's tie-out — posted through INTL-04 when it nets to $0.00.
async function finalize(admin, job, { actor, canPost, isAdmin }) {
  const counts = { ...job.counts, rows: await rowCounts(admin, job) };
  if (isBalanceEntity(job.entity) && counts.batch?.id) {
    const batch = must(await admin.from("conversion_batches").select("*").eq("id", counts.batch.id).single(), "batch");
    const lines = await loadBatchLines(admin, job.project_id, batch.id);
    const targets = [...(job.entity === "gl_opening" ? counts.tieOutTargets || [] : []), ...(await batchTargets(admin, job, batch.id))];
    const accounts = await loadTable(admin, job.project_id, "gl_accounts");
    const banks = await loadTable(admin, job.project_id, "bank_accounts");
    const fees = await readSetting(admin, job.project_id, "fees_policies");
    const t = tieOut({ lines, accounts, banks, batch: { id: batch.id, cutoverDate: batch.cutover_date, metadata: batch.metadata || {} }, targets, depositHeldIn: fees?.value?.depositHeldIn || "trust" });
    const info = { id: batch.id, created: counts.batch.created, name: batch.name, status: batch.status, cutoverDate: batch.cutover_date, clearingNet: t.clearingNet, ready: t.ready, tieOut: t.rows, totals: t.totals, note: "" };
    if (batch.status === "Draft" && job.options?.post !== false) {
      if (!t.ready) info.note = Math.abs(t.clearingNet) >= 0.005 ? `Saved to the draft batch: Opening Balance Equity is off by ${money(t.clearingNet)}, so it isn't posted yet. Import the trial balance (or finish it in Opening Balances) to post.` : `Saved to the draft batch: ${t.errors[0]?.message || "it isn't ready to post yet."}`;
      else if (!canPost) info.note = "Saved to the draft batch — someone who can post opening balances can post it from Chart of Accounts › Opening Balances.";
      else {
        try {
          const res = await postBatch(admin, batch, { actor, isAdmin });
          info.status = "Posted";
          info.posted = res.created;
          info.warnings = res.warnings;
        } catch (e) {
          info.note = `Saved to the draft batch, but posting failed: ${e.message}`;
        }
      }
    }
    counts.batch = info;
  }
  await updateJob(admin, job, { status: "committed", committed_at: job.committed_at || nowIso(), counts, error: null });
  return { done: true, counts };
}

// POST rows { action: "commit" }: the next chunk of valid rows, re-planned against fresh records; { done } once none are left.
export async function commitChunk(admin, job, { actor = null, canPost = false, isAdmin = false } = {}) {
  if (job.status === "committed") return { done: true, already: true, counts: job.counts };
  if (!["validated", "committing", "failed"].includes(job.status)) throw fail("Validate the import before committing it.", 409);
  if (job.counts?.problems?.length) throw fail(job.counts.problems[0], 409);
  const spec = await specFor(admin, job);
  if (job.status !== "committing") await updateJob(admin, job, { status: "committing", error: null });
  try {
    const batch = isBalanceEntity(job.entity) ? await ensureBatch(admin, job, actor) : null;
    const rows = must(await admin.from("import_rows").select("id, row_no, raw").eq("job_id", job.id).in("status", ["valid", "warning"]).order("row_no").limit(COMMIT_CHUNK), "import rows");
    if (!rows.length) return await finalize(admin, job, { actor, canPost, isAdmin });
    if (batch && batch.status !== "Draft") throw fail("The opening-balance batch was posted while this import ran — start a new import for the rest.", 409);
    const ctx = await buildContext(admin, job, spec);
    const records = recordsOf(rows, spec, job);
    const { results } = planRows(records, ctx);
    await executeOps(admin, job, results, actor);
    if (batch) await insertLines(admin, job, batch, results, actor);
    if (job.entity === "leases") await setupBilling(admin, job, results, actor);
    await recount(admin, job.project_id, touched(results));
    await markCommitted(admin, job, records, results);
    const { count: left } = await admin.from("import_rows").select("id", { count: "exact", head: true }).eq("job_id", job.id).in("status", ["valid", "warning"]);
    return { done: false, processed: rows.length, written: results.filter((r) => r.status !== "error").length, failed: results.filter((r) => r.status === "error").length, left: left ?? null };
  } catch (e) {
    await updateJob(admin, job, { status: "failed", error: String(e.message || e).slice(0, 500) });
    throw e;
  }
}

// --- Rollback ---------------------------------------------------------------------------------------------------

const CREATED_TABLES = ["lease_parties", "leases", "tenants", "property_owners", "vendors", "owners", "units", "properties", "gl_accounts"];
// Records outside the import that point at what it created, by table and column.
const REFERENCES = {
  properties: [["units", "property_id"], ["leases", "property_id"], ["tenants", "property_id"], ["property_owners", "property_id"], ["work_orders", "property_id"], ["bills", "property_id"], ["security_deposits", "property_id"], ["bank_accounts", "property_id"]],
  units: [["leases", "unit_id"], ["tenants", "unit_id"], ["work_orders", "unit_id"], ["security_deposits", "unit_id"]],
  owners: [["property_owners", "owner_id"], ["bills", "owner_id"]],
  vendors: [["bills", "vendor_id"], ["work_orders", "vendor_id"]],
  tenants: [["leases", "tenant_id"], ["lease_parties", "tenant_id"], ["security_deposits", "tenant_id"], ["work_orders", "tenant_id"]],
  leases: [["lease_parties", "lease_id"], ["security_deposits", "lease_id"], ["work_orders", "lease_id"], ["conversion_lines", "lease_id"]],
};
const LEDGER_DIMS = { properties: "property_id", units: "unit_id", owners: "owner_id", vendors: "vendor_id", tenants: "tenant_id", leases: "lease_id", gl_accounts: "gl_account_id" };
const NOUN = { properties: ["property", "properties"], units: ["unit"], owners: ["owner"], vendors: ["vendor"], leases: ["lease"], tenants: ["tenant"], property_owners: ["ownership"], lease_parties: ["lease party", "lease parties"], work_orders: ["work order"], bills: ["bill"], security_deposits: ["deposit record"], bank_accounts: ["bank account"], conversion_lines: ["opening balance"], gl_accounts: ["account"] };
const noun = (table, n = 1) => {
  const [one, many] = NOUN[table] || [table];
  return n === 1 ? one : many || `${one}s`;
};

async function createdBy(admin, job, table) {
  return pagedRows(() => forProject(admin.from(table).select("*").eq("metadata->>importJobId", job.id), job.project_id).is("deleted_at", null).order("id"), table);
}

// Live ledger activity on these ids that isn't a voided entry, a reversal, or `ownBatch`'s conversion → [{ entry, line }].
async function ledgerActivity(admin, projectId, col, ids, ownBatches = new Set()) {
  if (!ids.length) return [];
  const lines = await rowsIn(admin, projectId, "ledger_lines", col, ids, "id, entry_id, lease_id, tenant_id, entry_date");
  if (!lines.length) return [];
  const entries = new Map((await rowsIn(admin, projectId, "ledger_entries", "id", lines.map((l) => l.entry_id), "id, status, reversal_of, source_type, entry_date, memo, metadata, created_at")).map((e) => [e.id, e]));
  return lines
    .map((line) => ({ line, entry: entries.get(line.entry_id) }))
    .filter(({ entry }) => entry && entry.status !== "void" && !entry.reversal_of && !(entry.metadata?.conversion && ownBatches.has(entry.metadata?.batchId)));
}

// Why the import can't be rolled back (ledger activity on, or records outside it pointing at, what it created), or [].
async function rollbackBlockers(admin, job, created, ownBatches) {
  const out = [];
  for (const [table, col] of Object.entries(LEDGER_DIMS)) {
    const ids = (created[table] || []).map((r) => r.id);
    const activity = await ledgerActivity(admin, job.project_id, col, ids, ownBatches);
    if (activity.length) {
      const e = activity[0].entry;
      const what = e.source_type === "payment" ? "a payment" : e.metadata?.conversion ? "opening balances" : `a ${e.source_type || "ledger"} entry`;
      out.push(`${what} on ${e.entry_date} is posted against a ${noun(table)} this import created (${activity.length} ledger line${activity.length === 1 ? "" : "s"}) — reverse ${e.metadata?.conversion ? "or roll back those balances" : "it"} first.`);
    }
  }
  const ours = new Set(Object.values(created).flat().map((r) => r.id));
  for (const [table, refs] of Object.entries(REFERENCES)) {
    const ids = (created[table] || []).map((r) => r.id);
    if (!ids.length) continue;
    for (const [refTable, col] of refs) {
      let hits = (await rowsIn(admin, job.project_id, refTable, col, ids, "id, metadata" + (refTable === "conversion_lines" ? ", batch_id" : ""))).filter((r) => !ours.has(r.id) && metaOf(r).importJobId !== job.id);
      if (refTable === "conversion_lines" && hits.length) {
        const live = new Set((await rowsIn(admin, job.project_id, "conversion_batches", "id", hits.map((h) => h.batch_id), "id, status")).filter((b) => b.status !== "Voided").map((b) => b.id));
        hits = hits.filter((h) => live.has(h.batch_id));
      }
      const n = hits.length;
      if (n) out.push(`${n} ${noun(refTable, n)} from outside this import ${n === 1 ? "points" : "point"} at ${noun(table, 2)} it created — ${refTable === "conversion_lines" || metaOf(hits[0]).importJobId ? "roll that import back first" : "remove or move them first"}.`);
    }
  }
  return out;
}

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null) || (a !== null && b !== null && a !== undefined && b !== undefined && String(a) === String(b));

// Put back what "update" rows changed, column by column, unless the column changed again since.
async function restoreUpdates(admin, job) {
  const rows = await pagedRows(() => admin.from("import_rows").select("id, row_no, before").eq("job_id", job.id).not("before", "is", null).order("row_no"), "import rows");
  let restored = 0;
  const kept = [];
  for (const r of rows) {
    for (const u of r.before || []) {
      const cur = must(await forProject(admin.from(u.table).select("*").eq("id", u.id), job.project_id).maybeSingle(), u.table);
      if (!cur || cur.deleted_at) continue;
      const patch = {};
      for (const [col, val] of Object.entries(u.before || {})) {
        if (same(cur[col], u.after?.[col])) patch[col] = val;
        else kept.push(`Row ${r.row_no}: ${col} on the ${noun(u.table)} changed after the import, so it was left as is.`);
      }
      if (Object.keys(patch).length) {
        must(await forProject(admin.from(u.table).update(patch), job.project_id).eq("id", u.id), u.table);
        restored += 1;
      }
    }
  }
  return { restored, kept };
}

// Balance imports: void the batch they posted (INTL-04, before go-live) — every import that fed it goes with it — or drop
// this job's lines from a draft batch.
async function rollbackBalances(admin, job, { actor, canVoid }) {
  const batchId = job.counts?.batch?.id;
  const batch = batchId ? must(await admin.from("conversion_batches").select("*").eq("id", batchId).maybeSingle(), "batch") : null;
  const jobs = [job];
  let voided = 0;
  if (batch && !batch.deleted_at && batch.status === "Posted") {
    if (!canVoid) throw fail("Rolling back posted opening balances voids them — your role needs Void ledger entries and Post opening balances.", 403);
    // Anything posted on these leases since the batch (a payment against a converted charge) would be stranded by the void.
    const lines = (await loadBatchLines(admin, job.project_id, batch.id)).filter((l) => l.lease_id);
    const since = new Date(batch.posted_at || job.committed_at || 0).getTime();
    const activity = (await ledgerActivity(admin, job.project_id, "lease_id", lines.map((l) => l.lease_id), new Set([batch.id]))).filter(({ entry }) => new Date(entry.created_at).getTime() >= since);
    if (activity.length) throw fail(`A ${activity[0].entry.source_type === "payment" ? "payment" : "posting"} on ${activity[0].entry.entry_date} was made against a lease in these opening balances — reverse it before rolling back.`, 409);
    const others = must(await forProject(admin.from("import_jobs").select("*").in("entity", ["open_balances", "gl_opening"]).eq("status", "committed"), job.project_id).is("deleted_at", null), "import jobs").filter((j) => j.id !== job.id && j.counts?.batch?.id === batch.id);
    jobs.push(...others);
    voided = (await voidBatch(admin, batch, { actor })).voided;
  }
  const at = nowIso();
  for (const j of jobs) must(await forProject(admin.from("conversion_lines").update({ deleted_at: at }).eq("metadata->>importJobId", j.id), job.project_id).is("deleted_at", null), "batch lines");
  if (batch && !batch.deleted_at && job.counts?.batch?.created) {
    const left = must(await forProject(admin.from("conversion_lines").select("id").eq("batch_id", batch.id), job.project_id).is("deleted_at", null).limit(1), "batch lines");
    if (!left.length) must(await admin.from("conversion_batches").update({ deleted_at: at }).eq("id", batch.id), "batch");
  }
  return { jobs, voided };
}

// POST /api/import/jobs/[id]/rollback → { rolledBack, removed, restored, voided, alsoRolledBack, kept }.
export async function rollbackJob(admin, job, { actor = null, canVoid = false } = {}) {
  if (job.status === "rolled_back") return { rolledBack: false, already: true };
  if (!["committed", "failed"].includes(job.status)) throw fail("Only a committed import can be rolled back.", 409);
  const balance = isBalanceEntity(job.entity);
  const created = {};
  for (const t of CREATED_TABLES) created[t] = await createdBy(admin, job, t);
  const ownBatches = new Set(balance && job.counts?.batch?.id ? [job.counts.batch.id] : []);
  const blockers = await rollbackBlockers(admin, job, created, ownBatches);
  if (blockers.length) throw Object.assign(fail(`Can't roll back: ${blockers[0]}`, 409), { blockers });
  const live = await projectIsLive(admin, job.project_id);
  let res = { jobs: [job], voided: 0 };
  if (balance) {
    if (live && job.counts?.batch?.status === "Posted") throw fail("The project is live, so posted opening balances can't be rolled back — correct them with a journal entry.", 409);
    res = await rollbackBalances(admin, job, { actor, canVoid });
  }
  const at = nowIso();
  let removed = 0;
  const leaseIds = created.leases.map((l) => l.id);
  for (const part of chunks(leaseIds, IN_CHUNK)) {
    must(await forProject(admin.from("lease_rent_steps").update({ deleted_at: at }).in("lease_id", part), job.project_id).is("deleted_at", null), "rent steps");
    must(await forProject(admin.from("rent_accounts").update({ deleted_at: at }).in("lease_id", part), job.project_id).is("deleted_at", null), "rent accounts");
  }
  for (const t of CREATED_TABLES) {
    const ids = created[t].map((r) => r.id);
    for (const part of chunks(ids, IN_CHUNK)) must(await forProject(admin.from(t).update({ deleted_at: at }).in("id", part), job.project_id).is("deleted_at", null), t);
    removed += ids.length;
  }
  const { restored, kept } = await restoreUpdates(admin, job);
  await recount(admin, job.project_id, {
    propertyIds: [...created.units.map((u) => u.property_id), ...created.properties.map((p) => p.id)],
    ownerIds: created.property_owners.map((p) => p.owner_id),
  });
  for (const j of res.jobs) {
    must(await admin.from("import_rows").update({ status: "rolled_back" }).eq("job_id", j.id).in("status", ["created", "updated"]), "import rows");
    must(await admin.from("import_jobs").update({ status: "rolled_back", rolled_back_at: at, counts: { ...(j.counts || {}), rollback: { at, by: actor?.name || "", removed: j.id === job.id ? removed : 0, restored: j.id === job.id ? restored : 0, voided: res.voided, viaJob: j.id === job.id ? null : job.id } } }).eq("id", j.id), "import job");
  }
  return { rolledBack: true, removed, restored, voided: res.voided, kept, alsoRolledBack: res.jobs.filter((j) => j.id !== job.id).map((j) => ({ id: j.id, fileName: j.file_name, entity: j.entity })) };
}

// --- Saved mappings (settings key import_mappings) ---------------------------------------------------------------------

export const MAPPINGS_KEY = "import_mappings";

// { action: "save", name, entity, sourceSystem, mapping } | { action: "remove", id } → the saved list.
export async function saveMapping(admin, projectId, body, { actor } = {}) {
  const row = await readSetting(admin, projectId, MAPPINGS_KEY);
  const list = Array.isArray(row?.value?.mappings) ? row.value.mappings : [];
  let next = list;
  if (body.action === "remove") next = list.filter((m) => m.id !== body.id);
  else {
    const entity = String(body.entity || "");
    if (!IMPORT_ENTITIES.includes(entity)) throw fail("Pick what the mapping imports.");
    const name = String(body.name || "").trim().slice(0, 80);
    if (!name) throw fail("Name the mapping.");
    const spec = importSpec(entity);
    const mapping = Object.fromEntries(Object.entries(body.mapping || {}).filter(([k, v]) => spec.fields.some((x) => x.key === k || k.startsWith("cf_")) && typeof v === "string" && v.trim()));
    if (!Object.keys(mapping).length) throw fail("Map at least one column first.");
    const existing = list.find((m) => m.entity === entity && m.name.toLowerCase() === name.toLowerCase());
    const entry = { id: existing?.id || crypto.randomUUID(), name, entity, sourceSystem: SOURCE_SYSTEMS.includes(body.sourceSystem) ? body.sourceSystem : "generic", mapping, savedAt: nowIso(), savedBy: actor?.name || "" };
    next = [entry, ...list.filter((m) => m.id !== entry.id)].slice(0, 100);
  }
  const value = { ...(row?.value || {}), mappings: next };
  const res = row ? await admin.from("settings").update({ value, deleted_at: null }).eq("id", row.id) : await admin.from("settings").insert({ project_id: projectId, key: MAPPINGS_KEY, value });
  if (res.error) throw new Error(`settings: ${res.error.message}`);
  return next;
}
