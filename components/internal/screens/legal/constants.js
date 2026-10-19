// Lookups for the Legal Resources area. Config only — rows come from lib/supabase/legal_resources.js.

export const FEDERAL_CODE = "US";

export const FEDERAL_DESCRIPTION =
  "Federal agencies and national directories that apply in every state: HUD, CFPB, FTC, EPA, DOJ and legal-aid finders.";

// Rent-regulation status derived from a jurisdiction row (see rentStatus); `short` labels the filter tabs, `desc` heads its directory group.
export const RENT_STATUS_MAP = {
  cap: {
    label: "Statewide Rent Cap",
    short: "Rent Cap",
    desc: "State law caps yearly rent increases for covered units.",
    variant: "purple",
    dotClass: "bg-violet-500 dark:bg-violet-300",
  },
  local: {
    label: "Local Rent Control Allowed",
    short: "Local Control",
    desc: "No statewide cap, but cities and counties can adopt their own rent rules.",
    variant: "info",
    dotClass: "bg-sky-500 dark:bg-sky-400",
  },
  restricted: {
    label: "Partly Preempted",
    short: "Partly Preempted",
    desc: "No statewide cap, and state law limits what cities and counties can regulate.",
    variant: "warning",
    dotClass: "bg-amber-500 dark:bg-amber-400",
  },
  preempted: {
    label: "Preempted by State",
    short: "Preempted",
    desc: "State law bars cities and counties from controlling rent.",
    variant: "neutral",
    dotClass: "bg-text-tertiary",
  },
  unconfirmed: {
    label: "Not Confirmed",
    short: "Not Confirmed",
    desc: "We couldn't confirm whether local rent control is allowed. Check the state's own sources.",
    variant: "outline",
    dotClass: "border-[1.5px] border-border-strong",
  },
};

export function rentStatus(j) {
  if (!j || j.kind === "federal") return null;
  if (j.statewideRentCap) return "cap";
  return { no: "local", partial: "restricted", yes: "preempted" }[j.rentControlPreempted] || "unconfirmed";
}

export const PREEMPTION_LABELS = { yes: "Preempted by state law", no: "Allowed", partial: "Partly preempted", unknown: "Not confirmed" };

// Shown on hover for links that couldn't be re-checked in the October 2026 review.
export const VERIFICATION_NOTES = {
  unverifiable: "The publisher blocks automated checks. The link points to the official site.",
  checked: "Opened once during research; not yet re-checked.",
};

export const AUDIENCE_TAGS = { tenant: "For Tenants", landlord: "For Landlords" };

// Section order + labels for resource groups on a jurisdiction page.
export const CATEGORY_ORDER = [
  "statute",
  "official_guide",
  "rent_regulation",
  "court_self_help",
  "legal_aid_directory",
  "fair_housing",
  "complaint_filing",
  "code_enforcement",
  "health_safety",
  "rental_assistance",
  "hud_state_page",
  "data_source",
  "other",
];

export const CATEGORY_LABELS = {
  statute: { label: "Statutes", desc: "Official text of the landlord-tenant law and its key sections." },
  official_guide: { label: "Official Guides", desc: "Handbooks published by the state, attorney general or courts." },
  rent_regulation: { label: "Rent Regulation", desc: "Rent caps, rent boards and preemption laws." },
  court_self_help: { label: "Court Self-Help", desc: "Court process, forms and self-help for landlord-tenant cases." },
  legal_aid_directory: { label: "Legal Aid", desc: "Free legal help and plain-language housing guides." },
  fair_housing: { label: "Fair Housing", desc: "Where to learn about and report housing discrimination." },
  complaint_filing: { label: "File a Complaint", desc: "Consumer-protection and agency complaint pages." },
  code_enforcement: { label: "Code Enforcement", desc: "Report repair and housing-code violations." },
  health_safety: { label: "Health & Safety", desc: "Lead, mold, pests and other health hazards." },
  rental_assistance: { label: "Rental Assistance", desc: "Programs that help with rent and housing costs." },
  hud_state_page: { label: "HUD", desc: "The federal housing department's page for this state." },
  data_source: { label: "Data & Research", desc: "Datasets and research indexes." },
  other: { label: "More Resources", desc: "Other official pages, including rental registration." },
};

export const categoryKey = (c) => (CATEGORY_LABELS[c] ? c : "other");
export const categoryLabel = (c) => CATEGORY_LABELS[categoryKey(c)].label;

// Library topics; each matches any of its resource topics.
export const TOPIC_FILTERS = [
  { value: "all", label: "Everything", topics: [] },
  { value: "repairs", label: "Repairs", topics: ["repairs_habitability"] },
  { value: "rent", label: "Rent", topics: ["rent_increase", "rent_control", "late_fees"] },
  { value: "deposits", label: "Deposits", topics: ["security_deposit"] },
  { value: "eviction", label: "Eviction", topics: ["eviction", "lease_termination"] },
  { value: "entry", label: "Entry & Retaliation", topics: ["entry_privacy", "retaliation"] },
  { value: "fair", label: "Fair Housing", topics: ["fair_housing", "accessibility", "tenant_screening"] },
  { value: "safety", label: "Health & Safety", topics: ["lead_mold_pests", "utilities"] },
  { value: "assistance", label: "Assistance", topics: ["rental_assistance"] },
];

// Library tiers: statewide categories folded into four plain-language buckets (local programs get their own tier).
export const LIBRARY_TIERS = [
  { key: "law", label: "The Law", desc: "Statutes and codes", categories: ["statute"] },
  {
    key: "guidance",
    label: "Official Guidance",
    desc: "Agency and attorney-general guides, rent rules",
    categories: ["official_guide", "rent_regulation", "hud_state_page", "other", "data_source"],
    tagged: true,
  },
  { key: "courts", label: "Courts & Forms", desc: "Court process and self-help", categories: ["court_self_help"] },
  {
    key: "help",
    label: "Help & Enforcement",
    desc: "Legal aid, complaints, code enforcement",
    categories: ["legal_aid_directory", "fair_housing", "complaint_filing", "code_enforcement", "health_safety", "rental_assistance"],
    tagged: true,
  },
];

// Categories the map preview suggests first, in order.
export const START_WITH = ["official_guide", "statute", "court_self_help", "legal_aid_directory"];

// Tile-grid map of the US: [column, row] per state on a 12 × 8 grid.
export const STATE_TILES = {
  AK: [0, 0], ME: [11, 0],
  VT: [10, 1], NH: [11, 1],
  WA: [1, 2], ID: [2, 2], MT: [3, 2], ND: [4, 2], MN: [5, 2], IL: [6, 2], WI: [7, 2], MI: [8, 2], NY: [9, 2], RI: [10, 2], MA: [11, 2],
  OR: [1, 3], NV: [2, 3], WY: [3, 3], SD: [4, 3], IA: [5, 3], IN: [6, 3], OH: [7, 3], PA: [8, 3], NJ: [9, 3], CT: [10, 3],
  CA: [1, 4], UT: [2, 4], CO: [3, 4], NE: [4, 4], MO: [5, 4], KY: [6, 4], WV: [7, 4], VA: [8, 4], MD: [9, 4], DE: [10, 4],
  AZ: [2, 5], NM: [3, 5], KS: [4, 5], AR: [5, 5], TN: [6, 5], NC: [7, 5], SC: [8, 5], DC: [9, 5],
  OK: [4, 6], LA: [5, 6], MS: [6, 6], AL: [7, 6], GA: [8, 6],
  HI: [0, 7], TX: [4, 7], FL: [9, 7],
};

// Resolve free-text property states ("CA", "california", "Calif.") to a jurisdiction code.
export function resolveStateCode(value, jurisdictions) {
  const v = String(value || "").trim().toLowerCase().replace(/\.$/, "");
  if (!v) return null;
  const hit = jurisdictions.find((j) => j.kind === "state" && (j.code.toLowerCase() === v || j.name.toLowerCase() === v));
  return hit ? hit.code : null;
}

export const isLocal = (r) => r.scope === "city" || r.scope === "county";

export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export function matchesTopic(r, value) {
  const topics = TOPIC_FILTERS.find((t) => t.value === value)?.topics || [];
  return !topics.length || r.topics.some((t) => topics.includes(t));
}

export const matchesText = (r, q) =>
  !q || `${r.title} ${r.publisher} ${r.citation} ${r.locality} ${r.description}`.toLowerCase().includes(q);

// A citation is only worth a second line when the title doesn't already quote its section number.
export function citeIfNew(r) {
  if (!r.citation) return "";
  const key = r.citation.replace(/^.*?§+\s*/, "").split(/[\s,]/)[0];
  return key && r.title.includes(key) ? "" : r.citation;
}

// "Los Angeles, CA" → "Los Angeles" for local-program labels.
export const localityName = (r) => (r.locality || "Local").replace(/, [A-Z]{2}$/, "");

export const formatDate = (v) =>
  v ? new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";

export const hostOf = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};
