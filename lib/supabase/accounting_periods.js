"use client";

import { createClient } from "./client";
import { isSupabaseConfigured } from "@/supabase/components/property-client";
import { getActiveProjectId, scopeQuery } from "./scope";
import { getUser } from "./user";
import { runCloseChecks } from "@/lib/accounting/close_checks";

// Data-access layer for period close (CORE-40, owns property.accounting_periods). Reads go through RLS; closes and reopens go through the
// accounting_period_close / accounting_period_reopen RPCs, which check property.accounting.close. Pure: null / [] / false on failure,
// console.error, never throw or toast; the last failure reason is readable through periodsErrorMessage().

const TABLE = "accounting_periods";
let lastError = "";

const fail = (tag, e) => {
  lastError = e?.message || String(e || "Unknown error");
  console.error(`[accounting_periods.${tag}]`, lastError);
  return null;
};

// Human-readable reason for the last failed call ("" when none).
export const periodsErrorMessage = () => lastError;

// DB row → view model; history is the close / reopen events, oldest first.
export function normalizePeriod(row) {
  if (!row) return null;
  const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    id: row.id,
    projectId: row.project_id ?? null,
    periodStart: row.period_start ?? "",
    periodEnd: row.period_end ?? "",
    kind: row.kind ?? "month",
    status: row.status ?? "closed",
    closedAt: row.closed_at ?? null,
    closedBy: row.closed_by ?? null,
    closedByName: row.closed_by_name ?? "",
    reopenedAt: row.reopened_at ?? null,
    reopenedBy: row.reopened_by ?? null,
    reopenReason: row.reopen_reason ?? "",
    checklist: Array.isArray(row.checklist) ? row.checklist : [],
    history: Array.isArray(meta.history) ? meta.history : [],
    metadata: meta,
    createdAt: row.created_at ?? null,
  };
}

// Every period row of the active project, newest period first (months before the year that ends with them).
export async function listPeriods() {
  if (!isSupabaseConfigured()) return null;
  try {
    const { data, error } = await scopeQuery(createClient().from(TABLE).select("*").is("deleted_at", null))
      .order("period_end", { ascending: false })
      .order("kind", { ascending: true });
    if (error) throw new Error(error.message);
    return (data || []).map(normalizePeriod);
  } catch (e) {
    return fail("list", e);
  }
}

// The active project's lock date, cached for 30 s like the account index; "" when nothing is closed, null when the read failed.
let lockCache = { projectId: undefined, at: 0, value: null };
const LOCK_TTL = 30 * 1000;

export function invalidateLockedThrough() {
  lockCache = { projectId: undefined, at: 0, value: null };
}

export async function getLockedThrough({ fresh = false } = {}) {
  if (!isSupabaseConfigured()) return null;
  const projectId = getActiveProjectId();
  if (!projectId) return "";
  const now = Date.now();
  if (!fresh && lockCache.value !== null && lockCache.projectId === projectId && now - lockCache.at < LOCK_TTL) return lockCache.value;
  try {
    const { data, error } = await createClient().rpc("ledger_locked_through", { p_project: projectId });
    if (error) throw new Error(error.message);
    const value = data ? String(data).slice(0, 10) : "";
    lockCache = { projectId, at: now, value };
    return value;
  } catch (e) {
    return fail("lockedThrough", e);
  }
}

// Close the month ending `periodEnd` with its checklist snapshot ([{ key, label, ok, count, note }]) → the period id, or null.
export async function closePeriod({ periodEnd, checklist = [] }) {
  if (!isSupabaseConfigured() || !periodEnd) return null;
  try {
    lastError = "";
    const user = await getUser();
    const { data, error } = await createClient().rpc("accounting_period_close", {
      p_project: getActiveProjectId(),
      p_period_end: periodEnd,
      p_checklist: checklist,
      p_actor_name: user?.name || null,
    });
    if (error) throw new Error(error.message);
    invalidateLockedThrough();
    return data || null;
  } catch (e) {
    return fail("close", e);
  }
}

// Reopen the latest closed period with a reason → the period id, or null.
export async function reopenPeriod(id, reason) {
  if (!isSupabaseConfigured() || !id) return null;
  if (!String(reason || "").trim()) return fail("reopen", "Give a reason for reopening the period.");
  try {
    lastError = "";
    const user = await getUser();
    const { data, error } = await createClient().rpc("accounting_period_reopen", { p_id: id, p_reason: String(reason).trim(), p_actor_name: user?.name || null });
    if (error) throw new Error(error.message);
    invalidateLockedThrough();
    return data || null;
  } catch (e) {
    return fail("reopen", e);
  }
}

// The close checklist for a period ({ start, end, key }) → [{ key, label, ok, count, link, detail }], or null.
export async function runPeriodChecks(period) {
  if (!isSupabaseConfigured() || !period?.end) return null;
  try {
    lastError = "";
    return await runCloseChecks(createClient(), getActiveProjectId(), period);
  } catch (e) {
    return fail("checks", e);
  }
}
