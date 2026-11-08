import "server-only";
import { OPENING_BALANCE_EQUITY_KEY, accountLabel, buildJournal, normalizeEntry, normalizeLine, round2 } from "./postings";
import { loadAccountIndex } from "./store";
import { DEFAULT_EXTRA_KEYS } from "./chart";
import { isIsoDate } from "./conversion";
import { openDateFor, shortDate } from "./periods";
import {
  IMPORT_KINDS,
  JOURNAL_COLUMNS,
  MAX_IMPORT_ROWS,
  buildReversal,
  cutoverFor,
  importKey,
  journalEntryInput,
  markDuplicates,
  parseJournalRows,
  previewOpening,
  reversalKey,
  reverseBlock,
  summarizeEntries,
} from "./journal_io";
import { postBatch } from "./conversion_server";
import { fail, postOnce } from "@/lib/billing/post";
import { FILES_BUCKET, inPrefix } from "@/lib/files/refs";
import { forProject } from "@/lib/supabase/scope";

// Server-only journal imports and reversals (CORE-46): preview a file (every row validated against this project's chart, dimensions, the
// period lock and what is already on the ledger), post its ready entries under jeimp:<importId>:<entry_ref>, route opening balances
// through INTL-04's conversion batch, and reverse a journal entry on a date under jerev:<entryId>:<date>.

const CHUNK = 150;
const PAGE = 1000;
const POOL = 4;
const MAX_ERRORS = 500;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RECORD_KEYS = JOURNAL_COLUMNS.map((c) => c.key);
const today = () => new Date().toISOString().slice(0, 10);
const must = (res, what) => {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
};

async function allRows(build) {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().order("id").range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < PAGE) return out;
  }
}

// The names an import resolves against, as lookup view models.
export async function loadJournalLookups(admin, projectId) {
  const rows = (table, cols) => allRows(() => forProject(admin.from(table).select(cols), projectId).is("deleted_at", null));
  const [properties, units, owners, vendors, leases] = await Promise.all([
    rows("properties", "id, name"),
    rows("units", "id, label, property_id"),
    rows("owners", "id, name, email"),
    rows("vendors", "id, name"),
    rows("leases", "id, name, tenant_name, tenant_id, unit_id, property_id, status"),
  ]);
  return {
    properties,
    owners,
    vendors,
    units: units.map((u) => ({ id: u.id, label: u.label, propertyId: u.property_id })),
    leases: leases.map((l) => ({ id: l.id, name: l.name, tenantName: l.tenant_name, tenantId: l.tenant_id, unitId: l.unit_id, propertyId: l.property_id, status: l.status })),
  };
}

export async function lockedThroughFor(admin, projectId) {
  const { data, error } = await admin.rpc("ledger_locked_through", { p_project: projectId });
  if (error) throw new Error(`lock date: ${error.message}`);
  return data || "";
}

// Browser rows → plain records of known columns (strings or numbers), with their spreadsheet row numbers.
export function sanitizeRecords(raw) {
  if (!Array.isArray(raw) || !raw.length) throw fail("The file has no rows to import.", 400);
  if (raw.length > MAX_IMPORT_ROWS) throw fail(`That file has ${raw.length.toLocaleString("en-US")} rows — import at most ${MAX_IMPORT_ROWS.toLocaleString("en-US")} at a time.`, 413);
  return raw.map((r, i) => {
    const out = { row: Number.isInteger(r?.row) && r.row > 0 ? r.row : i + 2 };
    for (const k of RECORD_KEYS) {
      const v = r?.[k];
      if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
      else if (typeof v === "string") out[k] = v.slice(0, 300);
    }
    return out;
  });
}

// Live posted entries already holding these refs (as ids) or fingerprints, minus the ones this import posted itself.
async function onLedger(admin, projectId, entries, importId) {
  const ids = [...new Set(entries.map((e) => String(e.ref)).filter((r) => UUID.test(r)).map((r) => r.toLowerCase()))];
  const fps = [...new Set(entries.map((e) => e.fingerprint))];
  const entryIds = new Set();
  const fingerprints = new Map();
  for (let i = 0; i < ids.length; i += CHUNK) {
    const rows = must(await forProject(admin.from("ledger_entries").select("id").in("id", ids.slice(i, i + CHUNK)), projectId).is("deleted_at", null).eq("status", "posted"), "entries");
    for (const r of rows) entryIds.add(r.id);
  }
  for (let i = 0; i < fps.length; i += CHUNK) {
    const rows = must(
      await forProject(admin.from("ledger_entries").select("id, entry_date, fp:metadata->>importFingerprint, src:metadata->>sourceFile, imp:metadata->>importId"), projectId)
        .in("metadata->>importFingerprint", fps.slice(i, i + CHUNK))
        .is("deleted_at", null)
        .eq("status", "posted"),
      "fingerprints",
    );
    for (const r of rows) if (r.imp !== importId && !fingerprints.has(r.fp)) fingerprints.set(r.fp, { entryId: r.id, date: r.entry_date, sourceFile: r.src || "" });
  }
  return { entryIds, fingerprints };
}

const capErrors = (list) => (list || []).slice(0, MAX_ERRORS);

// The preview of one entry as the wizard lists it.
function entryView(e, acct) {
  return {
    ref: e.ref,
    rows: e.rows,
    date: e.date,
    memo: e.memo,
    total: e.total,
    status: e.status,
    note: e.note || "",
    errors: e.errors.map((x) => x.message),
    warnings: e.warnings.map((x) => x.message),
    lines: e.lines.map((l) => ({ account: accountLabel(acct.byId.get(l.glAccountId)), debit: l.debit, credit: l.credit })),
  };
}

async function journalPlan(admin, projectId, records, { importId, hasRef }) {
  const [acct, lookups, lockedThrough] = await Promise.all([loadAccountIndex(admin, projectId), loadJournalLookups(admin, projectId), lockedThroughFor(admin, projectId)]);
  const parsed = parseJournalRows(records, acct, lookups, { lockedThrough, hasRef });
  const entries = markDuplicates(parsed.entries, await onLedger(admin, projectId, parsed.entries, importId));
  return { acct, lockedThrough, entries, errors: parsed.errors, warnings: parsed.warnings, summary: summarizeEntries(entries, records.length) };
}

async function openingContext(admin, projectId, { seed = false } = {}) {
  const [acct, lookups, banks, fees] = await Promise.all([
    loadAccountIndex(admin, projectId, seed ? { extraKeys: [...DEFAULT_EXTRA_KEYS, OPENING_BALANCE_EQUITY_KEY] } : undefined),
    loadJournalLookups(admin, projectId),
    forProject(admin.from("bank_accounts").select("id, name, account_type, status, gl_account_id"), projectId).is("deleted_at", null).order("created_at").then((r) => must(r, "bank accounts")),
    forProject(admin.from("settings").select("value").eq("key", "fees_policies"), projectId).is("deleted_at", null).limit(1).then((r) => must(r, "settings")),
  ]);
  return { acct, lookups, banks, depositHeldIn: fees?.[0]?.value?.depositHeldIn || "trust" };
}

const KIND_LABEL = { tenant_balance: "Tenant balance", tenant_credit: "Tenant credit", deposit: "Deposit held", owner_balance: "Owner balance", bill: "Unpaid bill", gl_balance: "GL balance" };

function openingView(plan, acct, lookups) {
  const name = (list, id) => (id ? list.find((x) => x.id === id)?.name || "" : "");
  return {
    lines: plan.lines.map((l) => ({
      row: l.metadata?.row ?? null,
      kind: l.kind,
      kindLabel: KIND_LABEL[l.kind] || l.kind,
      account: l.glAccountId ? accountLabel(acct.byId.get(l.glAccountId)) : "",
      amount: round2(l.amount),
      lease: name(lookups.leases, l.leaseId),
      owner: name(lookups.owners, l.ownerId),
      vendor: name(lookups.vendors, l.vendorId),
      property: name(lookups.properties, l.propertyId),
    })),
    summary: { rows: plan.records, lines: plan.lines.length, ready: plan.ready, clearingNet: plan.clearingNet, totals: plan.totals },
    trialBalance: trialBalanceOf(plan.entries, acct),
  };
}

// The opening trial balance the batch would post, per account (debit-positive balances).
function trialBalanceOf(entries, acct) {
  const per = new Map();
  for (const e of entries || []) {
    for (const l of e.built.lines) {
      const r = per.get(l.glAccountId) || { glAccountId: l.glAccountId, debit: 0, credit: 0 };
      r.debit = round2(r.debit + (Number(l.debit) || 0));
      r.credit = round2(r.credit + (Number(l.credit) || 0));
      per.set(l.glAccountId, r);
    }
  }
  return [...per.values()]
    .map((r) => {
      const a = acct.byId.get(r.glAccountId);
      return { account: a ? accountLabel(a) : "Opening Balance Equity", number: a?.number || "3950", debit: r.debit, credit: r.credit, balance: round2(r.debit - r.credit) };
    })
    .filter((r) => r.balance)
    .sort((x, y) => String(x.number).localeCompare(String(y.number), undefined, { numeric: true }));
}

async function openingPlan(admin, projectId, records, { asOf, importId, seed = false }) {
  const ctx = await openingContext(admin, projectId, { seed });
  const plan = previewOpening(records, ctx.acct, ctx.lookups, { asOf, banks: ctx.banks, depositHeldIn: ctx.depositHeldIn, batchId: importId });
  return { ...ctx, plan: { ...plan, records: records.length } };
}

async function loadImport(admin, projectId, importId) {
  if (!UUID.test(String(importId || ""))) throw fail("Import not found.", 404);
  const row = must(await forProject(admin.from("journal_imports").select("*").eq("id", importId), projectId).maybeSingle(), "import");
  if (!row || row.deleted_at) throw fail("Import not found.", 404);
  return row;
}

// Which kind an import is, so its route can ask for the right permission.
export async function loadImportKind(admin, projectId, importId) {
  return (await loadImport(admin, projectId, importId)).kind;
}

// Validate a file's rows and save them as a preview → what the wizard shows; `body.importId` reuses an earlier preview of the same session.
export async function previewImport(admin, { projectId, actor = null, body = {} }) {
  const kind = body.kind === IMPORT_KINDS.opening ? IMPORT_KINDS.opening : IMPORT_KINDS.journal;
  const records = sanitizeRecords(body.records);
  const fileName = String(body.fileName || "").trim().slice(0, 200) || "Import";
  const format = ["csv", "tsv", "xlsx"].includes(body.format) ? body.format : null;
  const asOf = kind === IMPORT_KINDS.opening && isIsoDate(body.asOf) ? body.asOf : null;
  const hasRef = kind === IMPORT_KINDS.journal ? Boolean(body.hasRef ?? records.some((r) => String(r.entry_ref ?? "").trim())) : false;
  // The browser proposes the id (its file is stored under it); an id held by anything but this session's preview gets a fresh one.
  let importId = UUID.test(String(body.importId || "")) ? String(body.importId).toLowerCase() : "";
  let priorFile = null;
  if (importId) {
    const prior = must(await admin.from("journal_imports").select("id, project_id, status, kind, deleted_at, metadata").eq("id", importId).maybeSingle(), "import");
    if (prior && (prior.project_id !== projectId || prior.status !== "preview" || prior.kind !== kind || prior.deleted_at)) importId = "";
    else priorFile = prior?.metadata?.file || null;
  }
  importId = importId || crypto.randomUUID();
  // The original file, kept in private storage under this project (PLAT-01g); never a public URL.
  const given = body.file || priorFile;
  const file = given?.bucket === FILES_BUCKET && inPrefix(String(given.path || ""), `${projectId}/journal_import`) ? { bucket: FILES_BUCKET, path: String(given.path) } : null;

  let view;
  let errors;
  let entryCount;
  let summary;
  if (kind === IMPORT_KINDS.journal) {
    const p = await journalPlan(admin, projectId, records, { importId, hasRef });
    errors = p.errors;
    summary = p.summary;
    entryCount = p.entries.length;
    view = { summary, entries: p.entries.map((e) => entryView(e, p.acct)), errors: capErrors(p.errors), warnings: capErrors(p.warnings), lockedThrough: p.lockedThrough || "" };
  } else {
    const { acct, lookups, plan } = await openingPlan(admin, projectId, records, { asOf: asOf || "", importId });
    errors = plan.errors;
    summary = { rows: records.length, lines: plan.lines.length, ready: plan.ready, clearingNet: plan.clearingNet };
    entryCount = plan.lines.length;
    view = { ...openingView(plan, acct, lookups), errors: capErrors(plan.errors), warnings: capErrors(plan.warnings), notes: capErrors(plan.notes), asOf, cutover: cutoverFor(asOf || "") };
  }
  const row = {
    id: importId,
    project_id: projectId,
    kind,
    file_name: fileName,
    format,
    status: "preview",
    entry_count: entryCount,
    posted_count: 0,
    errors: capErrors(errors),
    as_of: asOf,
    metadata: { records, hasRef, summary, ...(file ? { file } : {}), previewedAt: new Date().toISOString(), previewedBy: actor?.name || "" },
    created_by: actor?.id || null,
  };
  must(await admin.from("journal_imports").upsert(row, { onConflict: "id" }), "import");
  return { importId, kind, fileName, ...view };
}

// Run `fn` over `items` with a few in flight at once, keeping order.
async function pooled(items, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next;
      next += 1;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(POOL, items.length) }, worker));
  return out;
}

async function postJournalImport(admin, row, actor) {
  const projectId = row.project_id;
  const records = Array.isArray(row.metadata?.records) ? row.metadata.records : [];
  const p = await journalPlan(admin, projectId, records, { importId: row.id, hasRef: row.metadata?.hasRef });
  const ready = p.entries.filter((e) => e.status === "ready");
  const results = await pooled(ready, async (e) => {
    try {
      const built = buildJournal(journalEntryInput(e, { importId: row.id, fileName: row.file_name || "" }));
      if (built.error) throw new Error(built.error);
      const res = await postOnce(admin, projectId, importKey(row.id, e.ref), built, { acct: p.acct, createdBy: actor?.id || null });
      return { ref: e.ref, entryId: res.entryId, created: res.created, total: e.total };
    } catch (err) {
      return { ref: e.ref, row: e.rows[0], error: err?.message || "Couldn't post this entry." };
    }
  });
  const failed = results.filter((r) => r.error);
  const posted = results.filter((r) => r.entryId);
  const result = {
    created: posted.filter((r) => r.created).length,
    existing: posted.filter((r) => !r.created).length,
    duplicates: p.entries.filter((e) => e.status === "duplicate").length,
    blocked: p.entries.filter((e) => e.status === "blocked").length,
    failed: failed.length,
  };
  const errors = [...p.errors, ...failed.map((f) => ({ row: f.row, ref: f.ref, message: `Entry ${f.ref}: ${f.error}` }))];
  const status = posted.length || (!failed.length && result.duplicates) ? "posted" : "failed";
  must(
    await admin
      .from("journal_imports")
      .update({ status, entry_count: p.entries.length, posted_count: posted.length, errors: capErrors(errors), metadata: { ...(row.metadata || {}), result, postedAt: new Date().toISOString(), postedBy: actor?.name || "" } })
      .eq("id", row.id),
    "import",
  );
  return { importId: row.id, kind: row.kind, status, ...result, entries: results, errors: capErrors(errors) };
}

async function postOpeningImport(admin, row, actor, { isAdmin }) {
  const projectId = row.project_id;
  const records = Array.isArray(row.metadata?.records) ? row.metadata.records : [];
  const asOf = row.as_of || "";
  let batchId = row.metadata?.batchId || "";
  let batch = batchId ? must(await forProject(admin.from("conversion_batches").select("*").eq("id", batchId), projectId).is("deleted_at", null).maybeSingle(), "batch") : null;
  let meta = { ...(row.metadata || {}) };
  try {
    const empty = batch?.status === "Draft" && !must(await forProject(admin.from("conversion_lines").select("id").eq("batch_id", batch.id), projectId).is("deleted_at", null).limit(1), "batch lines").length;
    if (!batch || empty) {
      const { plan } = await openingPlan(admin, projectId, records, { asOf, importId: row.id, seed: true });
      if (!plan.ready) throw Object.assign(fail(`Fix ${plan.errors.length === 1 ? "this" : `these ${plan.errors.length}`} first: ${plan.errors.slice(0, 3).map((e) => e.message).join(" ")}`, 409), { errors: plan.errors });
      if (!batch) {
        // INTL-04's batch, recorded on the import before its lines so a retry finds it.
        batchId = crypto.randomUUID();
        batch = must(
          await admin
            .from("conversion_batches")
            .insert({ id: batchId, project_id: projectId, name: `Imported · ${row.file_name || "opening balances"}`.slice(0, 120), cutover_date: cutoverFor(asOf), status: "Draft", metadata: { banks: [], ytd: false, importId: row.id, sourceFile: row.file_name || "" }, created_by: actor?.id || null })
            .select("*")
            .single(),
          "batch",
        );
        meta = { ...meta, batchId };
        must(await admin.from("journal_imports").update({ metadata: meta }).eq("id", row.id), "import");
      }
      const lines = plan.lines.map((l) => ({
        id: l.id,
        project_id: projectId,
        batch_id: batchId,
        kind: l.kind,
        property_id: l.propertyId || null,
        unit_id: l.unitId || null,
        lease_id: l.leaseId || null,
        tenant_id: l.tenantId || null,
        owner_id: l.ownerId || null,
        vendor_id: l.vendorId || null,
        bank_account_id: l.bankAccountId || null,
        gl_account_id: l.glAccountId || null,
        item_date: l.itemDate || null,
        amount: l.amount,
        memo: l.memo || null,
        ref: l.ref || null,
        metadata: l.metadata || {},
        created_by: actor?.id || null,
      }));
      for (let i = 0; i < lines.length; i += CHUNK) must(await admin.from("conversion_lines").insert(lines.slice(i, i + CHUNK)), "batch lines");
    } else {
      // A re-run still seeds the account by declaration before INTL-04 posts.
      await loadAccountIndex(admin, projectId, { extraKeys: [...DEFAULT_EXTRA_KEYS, OPENING_BALANCE_EQUITY_KEY] });
    }
    const res = await postBatch(admin, batch, { actor, isAdmin });
    const result = { created: res.created, posted: res.entries.filter((e) => e.entryId).length, lines: res.entries.length, totals: res.totals };
    must(
      await admin
        .from("journal_imports")
        .update({ status: "posted", entry_count: res.entries.length, posted_count: result.posted, errors: [], metadata: { ...meta, batchId, result, postedAt: new Date().toISOString(), postedBy: actor?.name || "" } })
        .eq("id", row.id),
      "import",
    );
    return { importId: row.id, kind: row.kind, status: "posted", batchId, ...result, warnings: res.warnings };
  } catch (e) {
    const errors = (e.errors || [{ row: null, message: e.message }]).map((x) => ({ row: x.row ?? null, message: x.message }));
    await admin.from("journal_imports").update({ status: "failed", errors: capErrors(errors), metadata: meta }).eq("id", row.id);
    throw e;
  }
}

// Post a previewed import → per-entry results (journal) or INTL-04's batch result (opening balances); re-running posts nothing new.
export async function postImport(admin, { projectId, actor = null, importId, isAdmin = false }) {
  const row = await loadImport(admin, projectId, importId);
  if (row.kind === IMPORT_KINDS.opening) return postOpeningImport(admin, row, actor, { isAdmin });
  return postJournalImport(admin, row, actor);
}

// One entry with its lines (any status), or null.
export async function loadEntry(admin, projectId, entryId) {
  if (!UUID.test(String(entryId || ""))) return null;
  const row = must(await forProject(admin.from("ledger_entries").select("*").eq("id", entryId), projectId).is("deleted_at", null).maybeSingle(), "entry");
  if (!row) return null;
  const lines = must(await forProject(admin.from("ledger_lines").select("*").eq("entry_id", entryId), projectId).is("deleted_at", null).order("line_no"), "lines");
  return { ...normalizeEntry(row), lines: lines.map(normalizeLine) };
}

// Reverse a journal entry on a date (moved to the first open day past a closed period) → { entryId, created, date, requested, moved, key }.
export async function reverseJournalEntry(admin, { projectId, actor = null, entryId, date = "", memo = "" }) {
  const entry = await loadEntry(admin, projectId, entryId);
  const block = reverseBlock(entry);
  if (block) throw fail(block, entry ? 409 : 404);
  const requested = isIsoDate(date) ? date : today();
  const lockedThrough = await lockedThroughFor(admin, projectId);
  const postDate = openDateFor(requested, lockedThrough);
  if (postDate < entry.date) throw fail(`Reverse it on or after the entry's own date (${shortDate(entry.date)}).`, 400);

  // The same date again returns the reversal already posted; a voided one frees the key for ":<n>".
  let n = 1;
  let key = reversalKey(entry.id, postDate);
  for (;;) {
    const held = must(await forProject(admin.from("ledger_entries").select("id, status").eq("idempotency_key", key), projectId).limit(1), "reversal");
    if (!held.length) break;
    if (held[0].status === "posted") return { entryId: held[0].id, created: false, date: postDate, requested, moved: postDate !== requested, key };
    n += 1;
    key = reversalKey(entry.id, postDate, n);
  }
  const live = must(await forProject(admin.from("ledger_entries").select("id, entry_date"), projectId).eq("metadata->>reverses", entry.id).eq("status", "posted").is("deleted_at", null).limit(1), "reversals");
  if (live.length) throw fail(`This entry was already reversed on ${shortDate(live[0].entry_date)} — void that reversal first to reverse it again.`, 409);

  const built = buildReversal(entry, { date: postDate, memo, closedThrough: postDate !== requested ? lockedThrough : "" });
  const res = await postOnce(admin, projectId, key, built, { acct: {}, createdBy: actor?.id || null });
  return { entryId: res.entryId, created: res.created, date: postDate, requested, moved: postDate !== requested, key };
}
