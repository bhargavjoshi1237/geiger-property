import { EFFECT_FIELDS, JURISDICTION_CODE, getPath, normalizeScreeningRule, setPath } from "./rules_schema";

// Which screening rules apply to a property (RISK-05): its jurisdiction chain (federal → state → county → city), the rule
// loader and mergeEffects ("most protective wins", each field keeping its sources). Alias-free and isomorphic: `db` is any
// supabase client scoped to the property schema (the browser's, or the service role on the server).

export const STATE_NAMES = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware",
  DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon",
  PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah",
  VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

const STATE_BY_NAME = new Map(Object.entries(STATE_NAMES).map(([code, name]) => [name.toUpperCase(), code]));
const STATE_ALIASES = { "WASHINGTON DC": "DC", "WASHINGTON D C": "DC", "D C": "DC", CALIF: "CA", MASS: "MA", PENN: "PA", "N Y": "NY", "N J": "NJ" };

// "Los Angeles" → LOS_ANGELES, "St. Paul" → ST_PAUL: the segment a jurisdiction code uses.
export const slug = (s) =>
  String(s || "")
    .toUpperCase()
    .replace(/&/g, " AND ")
    .replace(/['’.]/g, "")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

export function stateCodeOf(value) {
  const v = String(value || "").trim().toUpperCase().replace(/\./g, "").replace(/\s+/g, " ");
  if (!v) return null;
  if (STATE_NAMES[v]) return v;
  return STATE_BY_NAME.get(v) || STATE_ALIASES[v] || null;
}

const countyKey = (value) => slug(String(value || "").replace(/\b(county|parish|borough)\b/gi, ""));

// City names that map to one jurisdiction: NYC's boroughs and the place names its postal addresses use.
const CITY_ALIASES = {
  NY: Object.fromEntries(
    [
      "NEW_YORK", "NEW_YORK_CITY", "NYC", "CITY_OF_NEW_YORK", "MANHATTAN", "BROOKLYN", "QUEENS", "BRONX", "THE_BRONX", "STATEN_ISLAND",
      "ASTORIA", "LONG_ISLAND_CITY", "FLUSHING", "JAMAICA", "FOREST_HILLS", "JACKSON_HEIGHTS", "EAST_ELMHURST", "ELMHURST", "CORONA",
      "WOODSIDE", "SUNNYSIDE", "RIDGEWOOD", "MASPETH", "MIDDLE_VILLAGE", "REGO_PARK", "KEW_GARDENS", "RICHMOND_HILL",
      "SOUTH_RICHMOND_HILL", "OZONE_PARK", "SOUTH_OZONE_PARK", "WOODHAVEN", "HOWARD_BEACH", "BAYSIDE", "WHITESTONE",
      "COLLEGE_POINT", "FRESH_MEADOWS", "HOLLIS", "QUEENS_VILLAGE", "SAINT_ALBANS", "ST_ALBANS", "SPRINGFIELD_GARDENS", "ROSEDALE",
      "CAMBRIA_HEIGHTS", "LAURELTON", "FAR_ROCKAWAY", "ARVERNE", "ROCKAWAY_PARK", "BREEZY_POINT", "LITTLE_NECK", "DOUGLASTON",
      "OAKLAND_GARDENS",
    ].map((c) => [c, "NYC"]),
  ),
};

// ZIP prefixes wholly inside New York City (Manhattan, Staten Island, the Bronx, Brooklyn, Queens); 110 is shared with Nassau.
const NYC_ZIP_PREFIXES = new Set(["100", "101", "102", "103", "104", "111", "112", "113", "114", "116"]);

// County when the property doesn't record one, only for cities wholly or almost wholly in one county; shown as inferred.
const CITY_COUNTY = {
  IL: { CHICAGO: "COOK", EVANSTON: "COOK", OAK_PARK: "COOK", SKOKIE: "COOK", CICERO: "COOK" },
  CA: { OAKLAND: "ALAMEDA", BERKELEY: "ALAMEDA", SAN_FRANCISCO: "SAN_FRANCISCO" },
  WA: { SEATTLE: "KING", BELLEVUE: "KING", TACOMA: "PIERCE" },
  MN: { MINNEAPOLIS: "HENNEPIN", SAINT_PAUL: "RAMSEY", ST_PAUL: "RAMSEY" },
};

// Override codes from metadata.screeningJurisdictionOverride ("US-NY-NYC", "US-IL-COOK, US-IL-CHICAGO" or a list).
export function parseJurisdictionOverride(value) {
  const list = Array.isArray(value) ? value : String(value || "").split(/[\s,;]+/);
  return [...new Set(list.map((c) => String(c).trim().toUpperCase()).filter((c) => JURISDICTION_CODE.test(c)))];
}

const field = (p, key) => p?.[key] ?? p?.metadata?.[key] ?? "";

// A property's jurisdictions → { codes, state, county, city, countyInferred, overridden }; codes run federal → local.
export function resolveJurisdiction(property) {
  const override = parseJurisdictionOverride(field(property, "screeningJurisdictionOverride"));
  if (override.length) {
    const states = override.map((c) => c.split("-")[1]).filter(Boolean);
    const state = states[0] || null;
    const codes = ["US", ...(state ? [`US-${state}`] : []), ...override.filter((c) => c.split("-").length === 3 && c.split("-")[1] === state)];
    return { codes: [...new Set(codes)], state, county: null, city: null, countyInferred: false, overridden: true };
  }
  const state = stateCodeOf(field(property, "state"));
  if (!state) return { codes: ["US"], state: null, county: null, city: null, countyInferred: false, overridden: false };
  if (state === "DC") return { codes: ["US", "US-DC"], state, county: null, city: null, countyInferred: false, overridden: false };
  const zip = String(field(property, "zip")).trim();
  let city = slug(field(property, "city")) || null;
  if (state === "NY" && /^\d{5}/.test(zip) && NYC_ZIP_PREFIXES.has(zip.slice(0, 3))) city = "NYC";
  else if (city && CITY_ALIASES[state]?.[city]) city = CITY_ALIASES[state][city];
  let county = countyKey(field(property, "county")) || null;
  const countyInferred = !county && Boolean(city && CITY_COUNTY[state]?.[city]);
  if (countyInferred) county = CITY_COUNTY[state][city];
  // A county named like its city (Los Angeles) takes a _COUNTY suffix so the two jurisdictions stay apart.
  if (county && county === city) county = `${county}_COUNTY`;
  const codes = ["US", `US-${state}`];
  if (county) codes.push(`US-${state}-${county}`);
  if (city) codes.push(`US-${state}-${city}`);
  return { codes: [...new Set(codes)], state, county, city, countyInferred, overridden: false };
}

export const jurisdictionCodesFor = (property) => resolveJurisdiction(property).codes;

const title = (segment) => segment.toLowerCase().split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
const LOCAL_NAMES = { NYC: "New York City" };

// "US" → Federal, "US-CA" → California, "US-IL-COOK" → Cook (IL); `kind` adds County when known.
export function jurisdictionLabel(code, kind) {
  const [, state, local] = String(code || "").split("-");
  if (!state) return "Federal";
  if (!local) return STATE_NAMES[state] || state;
  const name = LOCAL_NAMES[local] || title(local);
  return `${name}${kind === "county" ? " County" : ""}, ${state}`;
}

// --- Loading --------------------------------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const todayISO = () => new Date().toISOString().slice(0, 10);

// Is a rule in force on `asOf` (YYYY-MM-DD)? Only active rules inside their effective window count.
export function ruleInForce(rule, asOf = todayISO()) {
  if (rule.status !== "active") return false;
  if (rule.effectiveFrom && rule.effectiveFrom > asOf) return false;
  if (rule.effectiveTo && rule.effectiveTo < asOf) return false;
  return true;
}

// Why a rule isn't in force: its status, "not_yet" or "ended" (null when it is).
export function notInForceReason(rule, asOf = todayISO()) {
  if (rule.status !== "active") return rule.status;
  if (rule.effectiveFrom && rule.effectiveFrom > asOf) return "not_yet";
  if (rule.effectiveTo && rule.effectiveTo < asOf) return "ended";
  return null;
}

// A project's own rule replaces the shared rule with the same jurisdiction and key (counsel's correction or retirement).
export function withShadowing(rules) {
  const own = new Map(rules.filter((r) => r.custom).map((r) => [`${r.jurisdictionCode}|${r.ruleKey}`, r]));
  return rules.map((r) => {
    const by = !r.custom ? own.get(`${r.jurisdictionCode}|${r.ruleKey}`) : null;
    return by ? { ...r, shadowedBy: by.id } : r;
  });
}

const SCOPE_ORDER = { federal: 0, state: 1, county: 2, city: 3 };
const byChain = (codes) => (a, b) =>
  codes.indexOf(a.jurisdictionCode) - codes.indexOf(b.jurisdictionCode) ||
  (SCOPE_ORDER[a.scope] ?? 9) - (SCOPE_ORDER[b.scope] ?? 9) ||
  a.title.localeCompare(b.title);

// Shared rules for `codes` plus the project's own, every status, each with `inForce` (and `shadowedBy` when replaced).
// Throws on a read error. Callers merge only the rules in force.
export async function loadScreeningRules(db, codes, { projectId = null, asOf = todayISO() } = {}) {
  const list = (codes || []).filter((c) => JURISDICTION_CODE.test(c));
  if (!list.length) return [];
  let q = db.from("screening_rules").select("*").in("jurisdiction_code", list).is("deleted_at", null);
  if (projectId && !UUID.test(String(projectId))) throw new Error("screening rules: projectId isn't valid");
  q = projectId ? q.or(`project_id.is.null,project_id.eq.${projectId}`) : q.is("project_id", null);
  const { data, error } = await q;
  if (error) throw new Error(`screening rules: ${error.message}`);
  const rules = (data || []).map(normalizeScreeningRule).map((r) => ({ ...r, inForce: ruleInForce(r, asOf), reason: notInForceReason(r, asOf) }));
  return withShadowing(rules).sort(byChain(list));
}

// --- Merging --------------------------------------------------------------------------------

// What a field records about a rule that sets it.
const sourceOf = (rule, value) => ({
  ruleId: rule.id,
  ruleKey: rule.ruleKey,
  jurisdictionCode: rule.jurisdictionCode,
  scope: rule.scope,
  title: rule.title,
  citation: rule.citation,
  sourceUrl: rule.sourceUrl,
  verification: rule.verification,
  verifiedOn: rule.verifiedOn,
  enforcement: rule.enforcement,
  custom: Boolean(rule.custom),
  value,
});

function winner(field, entries) {
  const values = entries.map((e) => e.value);
  switch (field.merge) {
    case "falseWins":
      return values.includes(false) ? false : true;
    case "trueWins":
      return values.includes(true);
    case "min":
      return Math.min(...values);
    case "max":
      return Math.max(...values);
    case "union":
      return [...new Set(values.flat())].sort();
    case "rank":
    case "feeType":
      return values.reduce((best, v) => (field.rank.indexOf(v) > field.rank.indexOf(best) ? v : best));
    default:
      return values[0];
  }
}

const sameValue = (a, b) => (Array.isArray(a) ? Array.isArray(b) && b.every((x) => a.includes(x)) : a === b);

// Merge the in-force rules (shadowed ones skipped): for each field the most protective value wins — a ban beats an allowance,
// the shortest look-back, the lowest fee cap, the longest response window — and every rule that set it stays in `sources`
// (`wins` marks the ones that decided it). A fee cap's type follows the lowest cap unless a rule bans fees outright.
// → { values (nested effects), fields: { path: { value, sources } }, applied: [rule ids], ignored: [{ id, reason }] }.
export function mergeEffects(rules, { asOf = todayISO() } = {}) {
  const applied = [];
  const ignored = [];
  for (const r of rules || []) {
    const inForce = r.shadowedBy ? false : ruleInForce(r, asOf);
    if (inForce) applied.push(r);
    else ignored.push({ id: r.id, reason: r.shadowedBy ? "replaced" : notInForceReason(r, asOf) });
  }
  const values = {};
  const fields = {};
  for (const field of EFFECT_FIELDS) {
    const entries = applied.map((r) => ({ rule: r, value: getPath(r.effects, field.path) })).filter((e) => e.value !== undefined);
    if (!entries.length) continue;
    let value = winner(field, entries);
    if (field.path === "fees.capType" && value !== "banned") {
      const capped = applied.filter((r) => getPath(r.effects, "fees.cap") !== undefined);
      const lowest = capped.sort((a, b) => getPath(a.effects, "fees.cap") - getPath(b.effects, "fees.cap"))[0];
      if (lowest && getPath(lowest.effects, "fees.capType")) value = getPath(lowest.effects, "fees.capType");
    }
    setPath(values, field.path, value);
    fields[field.path] = {
      value,
      sources: entries.map((e) => ({ ...sourceOf(e.rule, e.value), wins: sameValue(value, e.value) || (Array.isArray(value) && e.value.length > 0) })),
    };
  }
  return { values, fields, applied: applied.map((r) => r.id), ignored };
}
