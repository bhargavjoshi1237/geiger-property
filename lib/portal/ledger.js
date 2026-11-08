import { indexAccounts, normalizeEntry, normalizeLine } from "@/lib/ledger/postings";
import { fetchAccounts } from "@/lib/ledger/store";
import { rowsIn, rowsOf } from "./http";

// Server-only general-ledger reads for the portals (service-role client): lines
// for one party (with their entry attached) and the project's account index.
// Resident ledgers drop void entries and their reversals so they show live activity;
// owner statements keep both, dated as posted, so they match the staff report.

export async function accountIndex(admin, projectId) {
  try {
    return indexAccounts(await fetchAccounts(admin, projectId || undefined));
  } catch (e) {
    console.error("[portal.ledger.accounts]", e);
    return indexAccounts([]);
  }
}

const PAGE = 1000;

// Lines matching a PostgREST `or` filter → normalized lines with `.entry` (paged past the 1,000-row cap).
export async function linesWhere(admin, orFilter, tag = "ledger", { keepVoids = false } = {}) {
  const raw = [];
  for (let from = 0; ; from += PAGE) {
    const page = await rowsOf(
      admin
        .from("ledger_lines")
        .select("*")
        .is("deleted_at", null)
        .or(orFilter)
        .order("entry_date", { ascending: true })
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1),
      tag,
    );
    raw.push(...page);
    if (page.length < PAGE) break;
  }
  const unique = new Map(raw.map((r) => [r.id, r]));
  const lines = [...unique.values()].map(normalizeLine);
  const entries = (await rowsIn(admin, "ledger_entries", "id", lines.map((l) => l.entryId), tag)).map(normalizeEntry);
  const byId = new Map(entries.map((e) => [e.id, e]));
  const voided = new Set(keepVoids ? [] : entries.filter((e) => e.status === "void").map((e) => e.id));
  return lines
    .map((l) => ({ ...l, entry: byId.get(l.entryId) || null }))
    .filter((l) => l.entry && !voided.has(l.entryId) && !(l.entry.reversalOf && voided.has(l.entry.reversalOf)));
}

const idList = (ids) => [...new Set((ids || []).filter(Boolean))].join(",");

// Resident: lines on the tenant or any of their leases.
export function residentLines(admin, tenantId, leaseIds = []) {
  const parts = [`tenant_id.eq.${tenantId}`];
  const leases = idList(leaseIds);
  if (leases) parts.push(`lease_id.in.(${leases})`);
  return linesWhere(admin, parts.join(","), "ledger.resident");
}

// Owner: lines tagged to the owner plus every line on a property they've owned; ownerScopedLines
// (lib/ledger/ownership.js) then keeps their share of each.
export async function ownerLines(admin, ownerId, propertyIds = []) {
  const parts = [`owner_id.eq.${ownerId}`];
  const props = idList(propertyIds);
  if (props) parts.push(`property_id.in.(${props})`);
  return linesWhere(admin, parts.join(","), "ledger.owner", { keepVoids: true });
}
