import { indexAccounts, normalizeEntry, normalizeLine } from "@/lib/ledger/postings";
import { fetchAccounts } from "@/lib/ledger/store";
import { rowsIn, rowsOf } from "./http";

// Server-only general-ledger reads for the portals (service-role client): lines
// for one party (with their entry attached) and the project's account index.
// Void entries and their reversals are dropped so statements show live activity.

export async function accountIndex(admin, projectId) {
  try {
    return indexAccounts(await fetchAccounts(admin, projectId || undefined));
  } catch (e) {
    console.error("[portal.ledger.accounts]", e);
    return indexAccounts([]);
  }
}

// Lines matching a PostgREST `or` filter → normalized lines with `.entry`.
export async function linesWhere(admin, orFilter, tag = "ledger") {
  const raw = await rowsOf(
    admin.from("ledger_lines").select("*").is("deleted_at", null).or(orFilter).order("entry_date", { ascending: true }),
    tag,
  );
  const unique = new Map(raw.map((r) => [r.id, r]));
  const lines = [...unique.values()].map(normalizeLine);
  const entries = (await rowsIn(admin, "ledger_entries", "id", lines.map((l) => l.entryId), tag)).map(normalizeEntry);
  const byId = new Map(entries.map((e) => [e.id, e]));
  const voided = new Set(entries.filter((e) => e.status === "void").map((e) => e.id));
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

// Owner: lines tagged to the owner plus untagged lines on their properties.
export async function ownerLines(admin, ownerId, propertyIds = []) {
  const parts = [`owner_id.eq.${ownerId}`];
  const props = idList(propertyIds);
  if (props) parts.push(`and(property_id.in.(${props}),owner_id.is.null)`);
  return linesWhere(admin, parts.join(","), "ledger.owner");
}
