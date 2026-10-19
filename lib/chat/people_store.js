"use client";

import { useSyncExternalStore } from "react";

// In-memory people directory for the chat workspace, hydrated from
// property.chat_profiles so any component can resolve a person by id during
// render. Components re-render on hydration via usePeopleVersion().

const people = {};
let currentProjectId = null;
let teamEmails = null; // Set of lower-cased emails from Team & Members, or null while unknown

// "Me" — a stable object so modules holding the ME binding see it fill in.
export const ME = {
  id: null,
  name: "You",
  firstName: "You",
  role: "",
  color: "#6366f1",
  presence: "online",
  email: "",
  projectIds: [],
  doNotDisturb: false,
  notify: { dms: true, mentions: true, channels: false },
};

// --- change subscription -------------------------------------------------

let version = 0;
const listeners = new Set();

function emit() {
  version += 1;
  for (const listener of listeners) listener();
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Bumps whenever people hydrate, so a tree reading getPerson() re-renders.
export function usePeopleVersion() {
  return useSyncExternalStore(subscribe, () => version, () => 0);
}

// --- scope -----------------------------------------------------------------

export function setCurrentProject(id) {
  const next = id || null;
  if (next !== currentProjectId) teamEmails = null;
  currentProjectId = next;
}

export function setTeamEmails(emails) {
  teamEmails = emails ? new Set(emails.map((e) => String(e).toLowerCase())) : null;
  emit();
}

// A person outside this project: they haven't opened its chat and aren't on its
// team list. Unknown placeholders and "me" are never external.
export function isExternalPerson(person) {
  if (!person?.id || !currentProjectId || !Array.isArray(person.projectIds)) return false;
  if (ME.id && person.id === ME.id) return false;
  if (person.projectIds.includes(currentProjectId)) return false;
  if (teamEmails?.has((person.email || "").toLowerCase())) return false;
  return true;
}

// --- people ----------------------------------------------------------------

export function hydratePeople(list = []) {
  let changed = false;
  for (const p of list) {
    if (!p?.id) continue;
    people[p.id] = p;
    changed = true;
  }
  if (changed) emit();
}

export function setMe(profile) {
  if (!profile) return;
  Object.assign(ME, profile);
  if (ME.id) people[ME.id] = { ...ME };
  emit();
}

// Resolve ids missing from the directory (authors / members from outside this
// project) by fetching them, so nobody renders as "Unknown".
export async function ensurePeople(ids = []) {
  const missing = [...new Set((ids || []).filter((id) => id && id !== ME.id && !people[id]))];
  if (!missing.length) return;
  const { getProfilesByIds } = await import("@/lib/supabase/chat_profiles");
  hydratePeople(await getProfilesByIds(missing));
}

export function getPerson(id) {
  if (id && ME.id === id) return ME;
  if (id && people[id]) return people[id];
  return { id, name: "Unknown", firstName: "Unknown", role: "", color: "#737373", presence: "offline" };
}
