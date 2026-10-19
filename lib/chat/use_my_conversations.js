"use client";

import { useCallback, useEffect, useState } from "react";
import { useChat } from "./chat_context";
import { ensurePeople } from "./people_store";
import { listConversations } from "@/lib/supabase/chat_conversations";

// All my DMs and channels in this project (no timelines) — for screens that
// need to name a conversation or call into it (Calls, Files, Inbox).
export function useMyConversations() {
  const { projectId, me } = useChat();
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [dms, channels] = await Promise.all([
      listConversations(me.id, "dm", projectId),
      listConversations(me.id, "channel", projectId),
    ]);
    const all = [...(dms || []), ...(channels || [])];
    await ensurePeople(all.flatMap((c) => c.memberIds));
    return all;
  }, [me.id, projectId]);

  useEffect(() => {
    let cancelled = false;
    load().then((all) => {
      if (cancelled) return;
      setConversations(all);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const byId = useCallback((id) => conversations.find((c) => c.id === id) || null, [conversations]);
  return { conversations, loading, byId };
}
