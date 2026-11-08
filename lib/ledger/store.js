import { forProject } from "@/lib/supabase/scope";
import { indexAccounts, normalizeGlAccount, toRpcArgs } from "./postings";

// Client-agnostic ledger I/O shared by the browser data layer (anon client) and
// the scheduled jobs (service-role client). Callers pass a Supabase client
// pinned to the `property` schema. These throw on failure; the callers decide
// how to degrade (the data layer returns null, jobs record an error).

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
];

// One project's chart of accounts; throws without a project (there is no shared chart).
export async function fetchAccounts(sb, projectId) {
  const { data, error } = await forProject(sb.from("gl_accounts").select("*").is("deleted_at", null), projectId);
  if (error) throw new Error(error.message);
  return (data || []).map(normalizeGlAccount);
}

export async function ensureChart(sb, projectId) {
  if (!projectId) throw new Error("A project is required for its chart of accounts.");
  const { data, error } = await sb.rpc("ledger_ensure_default_chart", { p_project_id: projectId });
  if (error) throw new Error(error.message);
  return Number(data) || 0;
}

// Account index with the default chart guaranteed present.
export async function loadAccountIndex(sb, projectId) {
  let rows = await fetchAccounts(sb, projectId);
  let idx = indexAccounts(rows);
  if (REQUIRED_KEYS.some((k) => !idx.byKey.has(k))) {
    await ensureChart(sb, projectId);
    rows = await fetchAccounts(sb, projectId);
    idx = indexAccounts(rows);
  }
  return idx;
}

// Post a built { entry, lines } through property.ledger_post → entry id.
export async function postBuilt(sb, built, ctx = {}) {
  const { data, error } = await sb.rpc("ledger_post", toRpcArgs(built, ctx));
  if (error) throw new Error(error.message);
  return data;
}

export async function voidPosted(sb, entryId, { date, memo } = {}) {
  const { data, error } = await sb.rpc("ledger_void", {
    p_entry_id: entryId,
    p_date: date || null,
    p_memo: memo || null,
  });
  if (error) throw new Error(error.message);
  return data;
}
