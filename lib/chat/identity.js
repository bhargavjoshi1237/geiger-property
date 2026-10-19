"use client";

import { getUser } from "@/lib/supabase/user";
import { ensureProfile } from "@/lib/supabase/chat_profiles";

// Resolves "me" for the chat workspace and makes sure my profile lists this
// project. A signed-in user is themselves; the landing playground (no session)
// gets a stable demo identity kept in localStorage.

const DEMO_KEY = "geiger-property-chat-identity";
const COLORS = ["#6366f1", "#0ea5e9", "#ec4899", "#10b981", "#f59e0b", "#8b5cf6", "#14b8a6", "#ef4444"];

function demoIdentity() {
  try {
    const raw = window.localStorage.getItem(DEMO_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* storage unavailable */
  }
  const n = Math.floor(Math.random() * 9000) + 1000;
  const demo = { id: crypto.randomUUID(), email: `you+${n}@example.com`, username: `you${n}`, name: "You" };
  try {
    window.localStorage.setItem(DEMO_KEY, JSON.stringify(demo));
  } catch {
    /* storage unavailable */
  }
  return demo;
}

// One bootstrap per project at a time (React may mount the provider twice).
const inFlight = new Map();

export function ensureIdentity(projectId) {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (!inFlight.has(projectId)) {
    const pending = resolveIdentity(projectId).finally(() => inFlight.delete(projectId));
    inFlight.set(projectId, pending);
  }
  return inFlight.get(projectId);
}

async function resolveIdentity(projectId) {
  const user = await getUser().catch(() => null);
  const input = user?.id
    ? { id: user.id, email: user.email, username: user.email?.split("@")[0], name: user.name }
    : demoIdentity();
  if (!input?.id) return null;
  return ensureProfile({
    ...input,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    projectId,
  });
}
