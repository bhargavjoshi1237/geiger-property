import { createClient } from "./client";
import { isSupabaseConfigured } from "@/supabase/components/property-client";
import { scopeQuery } from "./project_scope";

// Data-access layer for Legal Resources. Owns `property.legal_jurisdictions`
// (states, DC and "US" federal: main statute + rent-regulation status) and
// `property.legal_resources` (pinned links to official landlord-tenant sources).
// Shared reference rows have project_id null, so scopeQuery keeps them visible in
// every project. Pure actions: console.error on failure, return null / [].
// DB is snake_case; UI is camelCase.

const JURISDICTIONS = "legal_jurisdictions";
const RESOURCES = "legal_resources";
// PostgREST caps a response at 1,000 rows, so the full index is read in pages.
const PAGE = 1000;

const asArray = (v) => (Array.isArray(v) ? v : []);
const asMeta = (v) => (v && typeof v === "object" ? v : {});

export function normalizeJurisdiction(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code ?? "",
    name: row.name ?? "",
    kind: row.kind ?? "state",
    primaryLawCitation: row.primary_law_citation ?? "",
    statewideRentCap: Boolean(row.statewide_rent_cap),
    rentControlPreempted: row.rent_control_preempted ?? "unknown",
    rentRegulationSummary: row.rent_regulation_summary ?? "",
    rentRegulationSourceUrl: row.rent_regulation_source_url ?? "",
    localRentControl: asArray(row.local_rent_control),
    lastReviewedAt: row.last_reviewed_at ?? null,
    metadata: asMeta(row.metadata),
  };
}

export function normalizeLegalResource(row) {
  if (!row) return null;
  return {
    id: row.id,
    jurisdictionCode: row.jurisdiction_code ?? "",
    scope: row.scope ?? "state",
    locality: row.locality ?? "",
    title: row.title ?? "",
    url: row.url ?? "",
    publisher: row.publisher ?? "",
    publisherType: row.publisher_type ?? "other",
    category: row.category ?? "other",
    topics: asArray(row.topics),
    audience: row.audience ?? "both",
    format: row.format ?? "html",
    description: row.description ?? "",
    citation: row.citation ?? "",
    sourceUpdated: row.source_updated ?? "",
    verification: row.verification ?? "checked",
    verificationNote: row.verification_note ?? "",
    checkedAt: row.checked_at ?? null,
    metadata: asMeta(row.metadata),
  };
}

export async function listLegalJurisdictions() {
  if (!isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const { data, error } = await scopeQuery(
      sb.from(JURISDICTIONS).select("*").is("deleted_at", null).order("name", { ascending: true }),
    );
    if (error) {
      console.error("[legal.jurisdictions]", error.message);
      return null;
    }
    return (data || []).map(normalizeJurisdiction);
  } catch (e) {
    console.error("[legal.jurisdictions]", e);
    return null;
  }
}

// Lightweight rows for every resource (counts, coverage, verification share).
export async function listLegalResourceIndex() {
  if (!isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const rows = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await scopeQuery(
        sb
          .from(RESOURCES)
          .select("id, jurisdiction_code, scope, locality, category, verification")
          .is("deleted_at", null)
          .order("id", { ascending: true })
          .range(from, from + PAGE - 1),
      );
      if (error) {
        console.error("[legal.index]", error.message);
        return null;
      }
      rows.push(...(data || []));
      if (!data || data.length < PAGE) break;
    }
    return rows.map(normalizeLegalResource);
  } catch (e) {
    console.error("[legal.index]", e);
    return null;
  }
}

// Every resource pinned to one jurisdiction code ("CA", "US"…), statewide and local.
export async function listLegalResources(jurisdictionCode) {
  if (!jurisdictionCode || !isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const { data, error } = await scopeQuery(
      sb
        .from(RESOURCES)
        .select("*")
        .eq("jurisdiction_code", jurisdictionCode)
        .is("deleted_at", null)
        .order("title", { ascending: true }),
    );
    if (error) {
      console.error("[legal.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeLegalResource);
  } catch (e) {
    console.error("[legal.list]", e);
    return null;
  }
}

export const legalResourcesData = {
  listJurisdictions: listLegalJurisdictions,
  listIndex: listLegalResourceIndex,
  list: listLegalResources,
};
