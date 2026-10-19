"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ensureIdentity } from "./identity";
import { ME, hydratePeople, setCurrentProject, setMe, setTeamEmails } from "./people_store";
import { listProfiles, normalizeProfile, setPresence, subscribeProfiles } from "@/lib/supabase/chat_profiles";
import { listTeamRoster } from "@/lib/supabase/chat_roster";
import { ensureChannelMembership } from "@/lib/supabase/chat_conversations";

// Session state shared by every Communications screen: who I am, the project's
// chat directory and team roster, and my presence heartbeat. Mounted once by the
// Communications host (keyed per project), so the screens never bootstrap
// identity themselves.

const ChatContext = createContext(null);

const HEARTBEAT_MS = 30 * 1000;
const IDLE_MS = 5 * 60 * 1000;
const RECONCILE_MS = 45 * 1000;

export function ChatProvider({ projectId, projectName, children }) {
  const [me, setMeState] = useState(null);
  const [directory, setDirectory] = useState([]);
  const [roster, setRoster] = useState([]);
  const [status, setStatus] = useState("loading"); // loading | ready | unavailable

  const loadDirectory = useCallback(async () => {
    const profiles = await listProfiles(projectId);
    if (!profiles) return;
    hydratePeople(profiles);
    setDirectory(profiles.filter((p) => p.id !== ME.id));
  }, [projectId]);

  // Identity first (it adds this project to my profile), then directory + roster.
  useEffect(() => {
    let cancelled = false;
    setCurrentProject(projectId);
    (async () => {
      const profile = projectId ? await ensureIdentity(projectId) : null;
      if (cancelled) return;
      if (!profile) {
        setStatus("unavailable");
        return;
      }
      setMe(profile);
      setMeState(profile);
      // #general exists and I'm in every public channel before any list loads.
      await ensureChannelMembership(profile.id, projectId);
      if (cancelled) return;
      const [, team] = await Promise.all([loadDirectory(), listTeamRoster()]);
      if (cancelled) return;
      setTeamEmails(team ? team.map((m) => m.email) : null);
      setRoster(team || []);
      setStatus("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, loadDirectory]);

  // Presence: online while the page is open, away after real inactivity, dnd when
  // I've asked for it. Peers derive "offline" from a stale heartbeat, so nothing
  // is written on unmount — only best-effort on a real unload.
  const ready = status === "ready";
  useEffect(() => {
    if (!ready || !ME.id) return undefined;
    let lastActivity = Date.now();
    const current = () => (ME.doNotDisturb ? "dnd" : Date.now() - lastActivity > IDLE_MS ? "away" : "online");
    const beat = () => setPresence(ME.id, current());
    const onActivity = () => {
      const wasIdle = Date.now() - lastActivity > IDLE_MS;
      lastActivity = Date.now();
      if (wasIdle) beat();
    };
    const onUnload = () => setPresence(ME.id, "offline");
    const events = ["pointerdown", "keydown", "wheel", "touchstart"];
    beat();
    const timer = setInterval(beat, HEARTBEAT_MS);
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    window.addEventListener("beforeunload", onUnload);
    return () => {
      clearInterval(timer);
      events.forEach((e) => window.removeEventListener(e, onActivity));
      window.removeEventListener("beforeunload", onUnload);
    };
  }, [ready]);

  // Live presence / profile edits for people in this project, plus a periodic
  // re-read since "offline" is judged against the wall clock and realtime can drop.
  useEffect(() => {
    if (!ready) return undefined;
    const unsubscribe = subscribeProfiles((row) => {
      const person = normalizeProfile(row);
      if (!person?.id || person.id === ME.id || !person.projectIds.includes(projectId)) return;
      hydratePeople([person]);
      setDirectory((prev) => {
        const i = prev.findIndex((p) => p.id === person.id);
        if (i === -1) return [...prev, person].sort((a, b) => a.name.localeCompare(b.name));
        const next = prev.slice();
        next[i] = person;
        return next;
      });
    });
    const timer = setInterval(loadDirectory, RECONCILE_MS);
    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  }, [ready, projectId, loadDirectory]);

  // Apply a saved profile change to "me" everywhere.
  const updateMe = useCallback((patch) => {
    setMe(patch);
    setMeState((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const value = useMemo(
    () => ({ projectId, projectName, me, directory, roster, status, ready, updateMe, refreshDirectory: loadDirectory }),
    [projectId, projectName, me, directory, roster, status, ready, updateMe, loadDirectory],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used within a ChatProvider");
  return ctx;
}
