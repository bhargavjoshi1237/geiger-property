import { makeEntityData } from "./entity_factory";

// Data layer for property.jurisdiction_rules (CORE-13 deposit rules; HOUS-07 adds its kinds): user-maintained rules per state, city or property.
// Pure like every layer: null / false on failure. Members read; settings.manage writes (RLS).

export const jurisdictionRules = makeEntityData({
  table: "jurisdiction_rules",
  tag: "jurisdiction_rules",
  order: { col: "jurisdiction_code", ascending: true },
  fields: [
    { key: "jurisdictionCode", col: "jurisdiction_code", type: "text" },
    { key: "locality", col: "locality", type: "text" },
    { key: "propertyId", col: "property_id", type: "uuid" },
    { key: "kind", col: "kind", type: "text" },
    { key: "name", col: "name", type: "text" },
    { key: "status", col: "status", type: "text", default: "active" },
    { key: "enforcement", col: "enforcement", type: "text", default: "warn" },
    { key: "params", col: "params", type: "text", default: {} },
    { key: "citation", col: "citation", type: "text" },
    { key: "sourceUrl", col: "source_url", type: "text" },
    { key: "effectiveFrom", col: "effective_from", type: "date" },
    { key: "effectiveTo", col: "effective_to", type: "date" },
    { key: "reviewedAt", col: "reviewed_at", type: "date" },
  ],
});

export const listDepositRules = () => jurisdictionRules.list({ kind: "deposit_disposition" });
