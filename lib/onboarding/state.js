import { ONBOARDING_SETTING_KEY } from "./steps";

// Saved checklist state (settings key `onboarding`); reducers are pure and return a new object.
export { ONBOARDING_SETTING_KEY };

export const ONBOARDING_DEFAULTS = Object.freeze({
  startedAt: null,
  dismissedAt: null,
  cutoverDate: null,
  goLiveAt: null,
  newPortfolio: false,
  helpLink: "",
  skipped: {},
  manualDone: {},
});

export function normalizeState(stored) {
  const s = stored && typeof stored === "object" ? stored : {};
  const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
  return { ...ONBOARDING_DEFAULTS, ...s, skipped: { ...obj(s.skipped) }, manualDone: { ...obj(s.manualDone) } };
}

// The Overview card hides once dismissed or live; the Setup & Go-live screen always shows.
export const isClosed = (state) => Boolean(state?.dismissedAt || state?.goLiveAt);

const without = (map, id) => Object.fromEntries(Object.entries(map || {}).filter(([k]) => k !== id));
const started = (state, now) => (state.startedAt ? state : { ...state, startedAt: now });
const stamp = () => new Date().toISOString();

export const skipStep = (state, id, reason, now = stamp()) =>
  started({ ...state, skipped: { ...state.skipped, [id]: String(reason || "").trim() }, manualDone: without(state.manualDone, id) }, now);
export const unskipStep = (state, id) => ({ ...state, skipped: without(state.skipped, id) });
export const markDone = (state, id, now = stamp()) => started({ ...state, skipped: without(state.skipped, id), manualDone: { ...state.manualDone, [id]: now } }, now);
export const unmarkDone = (state, id) => ({ ...state, manualDone: without(state.manualDone, id) });
export const setNewPortfolio = (state, on, now = stamp()) => started({ ...state, newPortfolio: Boolean(on) }, now);
export const dismissCard = (state, now = stamp()) => started({ ...state, dismissedAt: now }, now);
export const restoreCard = (state) => ({ ...state, dismissedAt: null });
export const goLive = (state, now = stamp()) => started({ ...state, goLiveAt: now }, now);
export const reopenSetup = (state) => ({ ...state, goLiveAt: null });
// Only http(s) and mailto links are kept; anything else clears the override.
export const safeLink = (link) => (/^(https?:\/\/|mailto:)/i.test(String(link || "").trim()) ? String(link).trim() : "");
export const setHelpLink = (state, link) => ({ ...state, helpLink: safeLink(link) });
