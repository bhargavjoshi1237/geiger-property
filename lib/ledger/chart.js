// System accounts beyond ledger_ensure_default_chart, declared here and seeded through property.ledger_ensure_accounts (CORE-40).
// Later items add rows instead of redefining the default chart; accounts are matched by system key, never by number.

export const EXTRA_SYSTEM_ACCOUNTS = [
  // Imported or adjusted opening equity only: the year-end close is virtual, so reports roll prior-year earnings in beside it.
  { systemKey: "retained_earnings", number: "3900", name: "Retained Earnings", accountType: "Equity", subtype: "equity", isTrust: false, parentKey: null },
];

// Extra accounts every account load makes sure exist.
export const DEFAULT_EXTRA_KEYS = ["retained_earnings"];

export const RETAINED_EARNINGS_KEY = "retained_earnings";

// Declarations for `keys` → the RPC's snake_case rows (unknown keys are skipped).
export function extraAccountRows(keys = DEFAULT_EXTRA_KEYS) {
  const want = new Set(keys);
  return EXTRA_SYSTEM_ACCOUNTS.filter((a) => want.has(a.systemKey)).map((a) => ({
    system_key: a.systemKey,
    number: a.number,
    name: a.name,
    account_type: a.accountType,
    subtype: a.subtype,
    is_trust: Boolean(a.isTrust),
    parent_key: a.parentKey || null,
  }));
}

// Seed the extra accounts `keys` names → accounts inserted; throws with err.code (42501 = not allowed).
export async function ensureExtraAccounts(sb, projectId, keys = DEFAULT_EXTRA_KEYS) {
  if (!projectId) throw new Error("A project is required for its chart of accounts.");
  const rows = extraAccountRows(keys);
  if (!rows.length) return 0;
  const { data, error } = await sb.rpc("ledger_ensure_accounts", { p_project_id: projectId, p_accounts: rows });
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  return Number(data) || 0;
}
