"use client";

// Desktop notifications for chat: the browser permission, the user's own on/off
// preference (kept in localStorage) and the display itself. Safe during SSR and
// in browsers without the Notification API — everything degrades to "off".

const PREF_KEY = "geiger-property-chat-desktop";

export function isSupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

export function permission() {
  return isSupported() ? Notification.permission : "unsupported";
}

export function isEnabled() {
  if (!isSupported()) return false;
  try {
    return window.localStorage.getItem(PREF_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setEnabled(enabled) {
  try {
    window.localStorage.setItem(PREF_KEY, enabled ? "on" : "off");
  } catch {
    /* storage unavailable */
  }
  emit();
}

// --- external store for useSyncExternalStore --------------------------------

const listeners = new Set();
const SERVER_SNAPSHOT = { supported: false, permission: "unsupported", enabled: false };
let snapshot = SERVER_SNAPSHOT;

function compute() {
  const next = { supported: isSupported(), permission: permission(), enabled: isEnabled() };
  const same =
    next.supported === snapshot.supported &&
    next.permission === snapshot.permission &&
    next.enabled === snapshot.enabled;
  if (!same) snapshot = next;
  return snapshot;
}

function emit() {
  const before = snapshot;
  if (compute() !== before) for (const listener of listeners) listener();
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Recomputed on read so a permission granted through the browser UI is picked up.
export const getSnapshot = compute;
export const getServerSnapshot = () => SERVER_SNAPSHOT;

// Must run from a user gesture in most browsers.
export async function requestPermission() {
  if (!isSupported()) return "unsupported";
  if (Notification.permission !== "default") return Notification.permission;
  try {
    const result = await Notification.requestPermission();
    emit();
    return result;
  } catch {
    return Notification.permission;
  }
}

// `tag` collapses repeats from one conversation; clicking refocuses this tab.
export function notify({ title, body, tag, onClick }) {
  if (!isSupported() || !isEnabled() || Notification.permission !== "granted") return null;
  try {
    const n = new Notification(title, {
      body,
      tag,
      renotify: Boolean(tag),
      icon: `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/logo1.svg`,
    });
    n.onclick = () => {
      window.focus();
      onClick?.();
      n.close();
    };
    return n;
  } catch {
    return null;
  }
}
