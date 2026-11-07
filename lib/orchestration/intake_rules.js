// Maintenance keyword rules (isomorphic, pure), shared by email intake (ORCH-10) and the maintenance intake
// playbook (ORCH-07). Stored in the settings key `intake_rules`; defaults below. A rule matches when any of its
// keywords appears as a whole word or phrase in the text (case-insensitive).

export const INTAKE_RULES_KEY = "intake_rules";

export const INTAKE_RULE_DEFAULTS = {
  // Words that make a request Urgent and page on-call.
  emergencyKeywords: [
    "flood", "flooding", "leak", "leaking", "burst", "gas", "smoke", "fire", "sparking", "no heat",
    "no water", "sewage", "overflowing", "carbon monoxide", "locked out", "break-in", "broken window",
  ],
  categories: [
    { category: "Plumbing", keywords: ["leak", "leaking", "toilet", "sink", "drain", "clog", "faucet", "pipe", "water heater", "shower", "sewage"] },
    { category: "Electrical", keywords: ["outlet", "breaker", "light", "lights", "power", "sparking", "switch", "wiring"] },
    { category: "HVAC", keywords: ["heat", "heating", "no heat", "furnace", "ac", "air conditioning", "thermostat", "boiler"] },
    { category: "Appliance", keywords: ["fridge", "refrigerator", "oven", "stove", "dishwasher", "washer", "dryer", "microwave"] },
    { category: "Pest control", keywords: ["mice", "mouse", "rats", "roaches", "cockroach", "bugs", "bed bugs", "ants", "pest"] },
    { category: "Landscaping", keywords: ["tree", "lawn", "snow", "yard", "gutter"] },
  ],
  defaultCategory: "General",
  // Inbound email: create without review only when the sender is known and this is "auto".
  autonomy: "suggest",
};

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const hasPhrase = (text, phrase) => {
  const p = String(phrase || "").trim().toLowerCase();
  return p ? new RegExp(`(^|[^a-z0-9])${escape(p)}([^a-z0-9]|$)`).test(text) : false;
};

export function resolveIntakeRules(stored) {
  const s = stored && typeof stored === "object" ? stored : {};
  return {
    ...INTAKE_RULE_DEFAULTS,
    ...s,
    emergencyKeywords: Array.isArray(s.emergencyKeywords) ? s.emergencyKeywords : INTAKE_RULE_DEFAULTS.emergencyKeywords,
    categories: Array.isArray(s.categories) ? s.categories : INTAKE_RULE_DEFAULTS.categories,
  };
}

// → { category, emergency, priority, matched: { emergency: [..], category: [..] } }
export function classifyMaintenanceText(text, rules = INTAKE_RULE_DEFAULTS) {
  const t = String(text || "").toLowerCase();
  const r = resolveIntakeRules(rules);
  const emergency = r.emergencyKeywords.filter((k) => hasPhrase(t, k));
  let best = null;
  for (const c of r.categories) {
    const hits = (c.keywords || []).filter((k) => hasPhrase(t, k));
    if (hits.length && (!best || hits.length > best.hits.length)) best = { category: c.category, hits };
  }
  return {
    category: best?.category || r.defaultCategory || "General",
    emergency: emergency.length > 0,
    priority: emergency.length ? "Urgent" : "Medium",
    matched: { emergency, category: best?.hits || [] },
  };
}
