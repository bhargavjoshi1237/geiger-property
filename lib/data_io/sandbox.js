"use client";

import { createClient } from "@/lib/supabase/client";
import { getActiveProjectId, scopeQuery } from "@/lib/supabase/scope";
import { getSetting, saveSetting } from "@/lib/supabase/settings";
import { importSpec, isBalanceEntity } from "./import_spec";
import { applyMapping } from "./mapping";
import { buildIndex } from "./index";
import { planRows, statusCounts } from "./validate";
import { IMPORT_NEEDS, WRITE_ORDER, committedStatus, plannedWrites, rowView } from "./plan";

// The landing playground's import (PLAT-03): the same plan as the server, written to the in-memory sandbox store through the
// browser client — no job history, no files, no ledger. Balance imports need the real ledger, so they stay server-only.

export const SANDBOX_BALANCES = "Opening balances post to the ledger, so the playground can't import them — try properties, units, owners, vendors, tenants or leases.";
const today = () => new Date().toISOString().slice(0, 10);

// Plan every row → the review's { counts, rows } plus what a commit writes.
export async function sandboxValidate({ entity, source, mapping, options, records, custom }) {
  if (isBalanceEntity(entity)) return { ok: false, error: SANDBOX_BALANCES };
  const sb = createClient();
  const existing = {};
  for (const t of IMPORT_NEEDS[entity]) {
    const { data } = await scopeQuery(sb.from(t).select("*").is("deleted_at", null));
    existing[t] = data || [];
  }
  const spec = importSpec(entity, { custom });
  const recs = records.map((r) => ({ rowNo: r.rowNo, mapped: applyMapping(r.raw, spec, mapping, { source }) }));
  const ctx = { jobId: crypto.randomUUID(), entity, spec, source, options, today: today(), opening: "", ix: buildIndex(existing) };
  const { results, problems } = planRows(recs, ctx);
  const byNo = new Map(recs.map((r) => [r.rowNo, r]));
  return {
    ok: true,
    counts: { ...statusCounts(results), writes: plannedWrites(results), problems: problems.map((p) => p.text) },
    rows: results.slice(0, 200).map((r) => rowView(byNo.get(r.rowNo), r)),
    plan: results,
  };
}

// Write a plan's records → { counts: { rows }, written } (written is what a roll back undoes).
export async function sandboxCommit(plan) {
  const sb = createClient();
  const projectId = getActiveProjectId();
  const ok = plan.filter((r) => r.status !== "error");
  const ops = ok.flatMap((r) => r.ops);
  const written = { created: [], updated: [] };
  for (const table of WRITE_ORDER) {
    const inserts = ops.filter((o) => o.table === table && o.op === "insert").map((o) => ({ ...o.values, project_id: projectId }));
    if (inserts.length) {
      const { error } = await sb.from(table).insert(inserts);
      if (error) return { ok: false, error: error.message };
      written.created.push(...inserts.map((r) => ({ table, id: r.id })));
    }
    for (const o of ops.filter((x) => x.table === table && x.op === "update")) {
      const { error } = await sb.from(table).update(o.values).eq("id", o.id);
      if (error) return { ok: false, error: error.message };
      written.updated.push({ table, id: o.id, before: o.before });
    }
  }
  const rows = { total: plan.length };
  for (const r of plan) rows[committedStatus(r)] = (rows[committedStatus(r)] || 0) + 1;
  return { ok: true, done: true, counts: { rows }, written };
}

// Undo a sandbox commit: soft-delete what it created (children first) and put back what it changed.
export async function sandboxRollback(written) {
  const sb = createClient();
  const at = new Date().toISOString();
  for (const table of [...WRITE_ORDER].reverse()) {
    const ids = written.created.filter((c) => c.table === table).map((c) => c.id);
    if (ids.length) await sb.from(table).update({ deleted_at: at }).in("id", ids);
  }
  for (const u of written.updated) await sb.from(u.table).update(u.before).eq("id", u.id);
  return { ok: true, removed: written.created.length, restored: written.updated.length, voided: 0, alsoRolledBack: [] };
}

// Saved mappings in the playground live in its own settings store.
export async function sandboxSaveMapping(entry) {
  const value = (await getSetting("import_mappings", { mappings: [] })) || { mappings: [] };
  const list = Array.isArray(value.mappings) ? value.mappings : [];
  const existing = list.find((m) => m.entity === entry.entity && m.name.toLowerCase() === entry.name.toLowerCase());
  const next = [{ ...entry, id: existing?.id || crypto.randomUUID(), savedAt: new Date().toISOString() }, ...list.filter((m) => m.id !== existing?.id)];
  const ok = await saveSetting("import_mappings", { ...value, mappings: next });
  return ok ? { ok: true, mappings: next } : { ok: false, error: "Couldn't save the mapping." };
}
