import { forProject } from "@/lib/supabase/scope";
import { indexAccounts, normalizeGlAccount, toRpcArgs } from "./postings";
import { DEFAULT_EXTRA_KEYS, ensureExtraAccounts } from "./chart";
import { LOCK_ERROR_CODE, isLockError, lockMessage, lockedThroughOf } from "./periods";

// Ledger I/O for the browser layer (signed-in client) and server code (service role); throws with err.code, callers decide how to degrade.
// The RPCs check permission inside (PLAT-01c): a signed-in caller needs property.accounting.post / .void on the project.

// System accounts the posting builders rely on; any missing → seed the chart.
const REQUIRED_KEYS = [
  "operating_cash",
  "trust_cash",
  "deposit_cash",
  "accounts_receivable",
  "accounts_payable",
  "security_deposits",
  "owner_distributions",
  "owner_contributions",
  "rent_income",
  "late_fee_income",
  "management_fees",
  "management_fee_income",
  "undeposited_funds",
  "deferred_receivable",
  "other_deposits",
  "subsidy_receivable",
];

// One project's chart of accounts; throws without a project (there is no shared chart).
export async function fetchAccounts(sb, projectId) {
  const { data, error } = await forProject(sb.from("gl_accounts").select("*").is("deleted_at", null), projectId);
  if (error) throw new Error(error.message);
  return (data || []).map(normalizeGlAccount);
}

// Supabase error → thrown Error keeping the Postgres code (42501 = not allowed); a period-lock refusal (CORE-40) reads as a sentence, status 409.
const rpcError = (error) =>
  isLockError(error)
    ? Object.assign(new Error(lockMessage(lockedThroughOf(error))), { code: LOCK_ERROR_CODE, status: 409, lockedThrough: lockedThroughOf(error) || null })
    : Object.assign(new Error(error.message), { code: error.code });

export async function ensureChart(sb, projectId) {
  if (!projectId) throw new Error("A project is required for its chart of accounts.");
  const { data, error } = await sb.rpc("ledger_ensure_default_chart", { p_project_id: projectId });
  if (error) throw rpcError(error);
  return Number(data) || 0;
}

// Account index with the default chart and the `extraKeys` system accounts (lib/ledger/chart.js) present; a reader who may not seed them keeps the existing chart.
export async function loadAccountIndex(sb, projectId, { extraKeys = DEFAULT_EXTRA_KEYS } = {}) {
  let rows = await fetchAccounts(sb, projectId);
  let idx = indexAccounts(rows);
  // ledger_ensure_default_chart adopts a same-number custom account only when its subtype agrees, else inserts a second one: a visible duplicate number beats moving its history into the wrong sub-ledger (a custom 1220 "receivable" would count HAP as tenant AR).
  if (REQUIRED_KEYS.some((k) => !idx.byKey.has(k))) {
    try {
      await ensureChart(sb, projectId);
    } catch (e) {
      if (e.code !== "42501" || !rows.length) throw e;
      return idx;
    }
    rows = await fetchAccounts(sb, projectId);
    idx = indexAccounts(rows);
  }
  if (extraKeys.some((k) => !idx.byKey.has(k))) {
    try {
      await ensureExtraAccounts(sb, projectId, extraKeys.filter((k) => !idx.byKey.has(k)));
    } catch (e) {
      if (e.code !== "42501") throw e;
      return idx;
    }
    idx = indexAccounts(await fetchAccounts(sb, projectId));
  }
  return idx;
}

// Post a built { entry, lines } through property.ledger_post → entry id.
export async function postBuilt(sb, built, ctx = {}) {
  const { data, error } = await sb.rpc("ledger_post", toRpcArgs(built, ctx));
  if (error) throw rpcError(error);
  return data;
}

export async function voidPosted(sb, entryId, { date, memo } = {}) {
  const { data, error } = await sb.rpc("ledger_void", {
    p_entry_id: entryId,
    p_date: date || null,
    p_memo: memo || null,
  });
  if (error) throw rpcError(error);
  return data;
}
