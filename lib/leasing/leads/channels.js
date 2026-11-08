// Lead channels (LEAS-02, isomorphic): how an inquiry reached us, its label on the inquiry row, the prospect's
// default source and the "Inquiry channel" value on the prospect's Source tab.

export const LEAD_CHANNELS = {
  web_form: { label: "Web form", source: "Website", inquiryChannel: "Web form", live: false },
  listing_site: { label: "Listing site email", source: "Other", inquiryChannel: "Listing site", live: false },
  email: { label: "Email", source: "Other", inquiryChannel: "Email", live: false },
  phone: { label: "Phone call", source: "Phone call", inquiryChannel: "Phone", live: true },
  walk_in: { label: "Walk-in", source: "Walk-in", inquiryChannel: "Walk-in", live: true },
  text: { label: "Text", source: "Other", inquiryChannel: "Text", live: false },
};

export const channelOf = (key) => LEAD_CHANNELS[key] || LEAD_CHANNELS.email;

// Staff quick capture ("Log inquiry"): the channels a person logs by hand.
export const STAFF_CHANNELS = ["phone", "walk_in", "email", "text"];

// The inquiry row's name: the listing site for a parsed listing-site email, else the channel label.
export const inquiryLabel = (channel, source) =>
  channel === "listing_site" && source && source !== "Other" ? `${source} email` : channelOf(channel).label;

// Prospect stage new leads start in, and the hours to first response when a listing sets none.
export const NEW_LEAD_STAGE = "New";
export const DEFAULT_RESPONSE_GOAL_HOURS = 2;

// A listing's response goal (Listing → Contact → "Lead response goal (hours)"), else the default.
export function responseGoalHours(listing) {
  const raw = listing?.metadata?.responseGoalHours ?? listing?.responseGoalHours;
  const n = Number(raw);
  return raw !== "" && raw !== null && raw !== undefined && Number.isFinite(n) && n > 0 ? n : DEFAULT_RESPONSE_GOAL_HOURS;
}
