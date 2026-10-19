"use client";

import React, { createContext, useCallback, useContext, useMemo } from "react";
import { toast } from "sonner";
import { useCall } from "@/lib/chat/use_call";
import { useChat } from "@/lib/chat/chat_context";
import { ME } from "@/lib/chat/people_store";
import { createOrGetDm } from "@/lib/supabase/chat_conversations";
import { conversationTitle } from "./chat_utils";
import { CallStage } from "./parts/call_stage";
import { IncomingCallDialog } from "./parts/incoming_call_dialog";

// One call engine for the whole Communications area, so a call (and the ring
// listener) survives switching between rail tabs. Screens start calls through
// useCallApi(); the stage and the incoming-call prompt render here.

const CallContext = createContext(null);

export function CallProvider({ children }) {
  const { projectId, me } = useChat();
  const engine = useCall(me?.id || null);
  const { start } = engine;

  // Ring everyone else in a conversation. `title` overrides the call's name
  // (a scheduled call keeps its own).
  const callConversation = useCallback(
    (conversation, kind = "audio", title) => {
      if (!conversation) return;
      const targetIds =
        conversation.type === "channel"
          ? (conversation.memberIds || []).filter((id) => id !== ME.id)
          : [conversation.participantId];
      start({
        projectId,
        conversationId: conversation.id,
        kind,
        title: title || conversationTitle(conversation),
        targetIds,
        type: conversation.type,
      });
    },
    [projectId, start],
  );

  // Call one person through our DM (created on first call).
  const callPerson = useCallback(
    async (person, kind = "audio") => {
      if (!person?.id || !ME.id) return;
      const dm = await createOrGetDm(ME.id, person.id, projectId);
      if (!dm) {
        toast.error("Couldn't start the call.");
        return;
      }
      callConversation(dm, kind);
    },
    [projectId, callConversation],
  );

  const value = useMemo(
    () => ({ status: engine.status, inCall: engine.status !== "idle", callConversation, callPerson }),
    [engine.status, callConversation, callPerson],
  );

  return (
    <CallContext.Provider value={value}>
      {children}
      {engine.status !== "idle" ? (
        <CallStage
          call={engine.call}
          status={engine.status}
          remoteStreams={engine.remoteStreams}
          localStream={engine.localStream}
          micOn={engine.micOn}
          camOn={engine.camOn}
          onToggleMic={engine.toggleMic}
          onToggleCam={engine.toggleCam}
          onHangup={engine.hangup}
        />
      ) : null}
      <IncomingCallDialog incoming={engine.incoming} onAccept={engine.accept} onDecline={engine.decline} />
    </CallContext.Provider>
  );
}

export function useCallApi() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error("useCallApi must be used within a CallProvider");
  return ctx;
}
