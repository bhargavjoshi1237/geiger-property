"use client";

// WebRTC call engine for chat: a peer-to-peer mesh (one RTCPeerConnection per
// remote participant), so DMs and small channels both work. Ringing and the
// offer/answer/ICE exchange ride Supabase broadcast (chat_call_signaling).
//
// Status: idle → calling (my outgoing ring) | connecting (accepted) → active → idle.
// An incoming invite surfaces via `incoming` while status stays idle.

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ME, getPerson } from "./people_store";
import { logCall } from "@/lib/supabase/chat_calls";
import { sendMessage } from "@/lib/supabase/chat_messages";
import { notifyPeople } from "@/lib/supabase/chat_notifications";
import { callsSupported, iceServers, joinCall, ring, subscribeRing } from "@/lib/supabase/chat_call_signaling";

const RING_TIMEOUT_MS = 45 * 1000;
const INVITE_EXPIRY_MS = 60 * 1000;
const CONNECT_TIMEOUT_MS = 30 * 1000;

export function useCall(meId) {
  const [status, setStatus] = useState("idle");
  const [call, setCall] = useState(null);
  const [incoming, setIncoming] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [localStream, setLocalStream] = useState(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(false);

  const statusRef = useRef("idle");
  const callRef = useRef(null);
  const incomingRef = useRef(null);
  const localStreamRef = useRef(null);
  const peersRef = useRef(new Map()); // peerId -> { pc, pendingIce: [] }
  const knownRef = useRef(new Set());
  const declinedRef = useRef(new Set());
  const sigRef = useRef(null);
  const ringTimerRef = useRef(null);
  const inviteTimerRef = useRef(null);
  const connectTimerRef = useRef(null);
  const busyRef = useRef(false); // a start/accept is waiting on the media prompt
  const cancelledRef = useRef(new Set()); // invites the caller withdrew
  const streamPromiseRef = useRef(null);
  const hangupRef = useRef(() => {});

  const updateStatus = useCallback((next) => {
    statusRef.current = typeof next === "function" ? next(statusRef.current) : next;
    setStatus(statusRef.current);
  }, []);

  const showIncoming = useCallback((invite) => {
    incomingRef.current = invite;
    setIncoming(invite);
    clearTimeout(inviteTimerRef.current);
  }, []);

  // One media prompt at a time; concurrent callers share it.
  const ensureLocalStream = useCallback(async (kind) => {
    if (localStreamRef.current) return localStreamRef.current;
    if (!streamPromiseRef.current) {
      streamPromiseRef.current = navigator.mediaDevices
        .getUserMedia(kind === "video" ? { audio: true, video: true } : { audio: true })
        .then((stream) => {
          localStreamRef.current = stream;
          setLocalStream(stream);
          setMicOn(true);
          setCamOn(kind === "video");
          return stream;
        })
        .finally(() => {
          streamPromiseRef.current = null;
        });
    }
    return streamPromiseRef.current;
  }, []);

  const releaseLocalStream = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    setLocalStream(null);
  }, []);

  const removePeer = useCallback((peerId) => {
    const peer = peersRef.current.get(peerId);
    if (peer) {
      try {
        peer.pc.close();
      } catch {
        /* already closed */
      }
      peersRef.current.delete(peerId);
    }
    knownRef.current.delete(peerId);
    setRemoteStreams((prev) => {
      if (!(peerId in prev)) return prev;
      const next = { ...prev };
      delete next[peerId];
      return next;
    });
    // In a DM, the other side leaving ends the call.
    if (callRef.current?.type === "dm" && peersRef.current.size === 0 && statusRef.current !== "idle") {
      hangupRef.current();
    }
  }, []);

  // The lexicographically smaller id makes the offer, which avoids glare.
  const createPeer = useCallback(
    (peerId, initiator) => {
      const existing = peersRef.current.get(peerId);
      if (existing) return existing;
      const pc = new RTCPeerConnection({ iceServers: iceServers() });
      const peer = { pc, pendingIce: [] };
      peersRef.current.set(peerId, peer);

      const local = localStreamRef.current;
      if (local) local.getTracks().forEach((t) => pc.addTrack(t, local));

      pc.onicecandidate = (e) => {
        if (e.candidate) sigRef.current?.send("ice", { from: meId, to: peerId, candidate: e.candidate });
      };
      pc.ontrack = (e) => {
        const [stream] = e.streams;
        if (stream) setRemoteStreams((prev) => ({ ...prev, [peerId]: stream }));
      };
      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        if (state === "connected") {
          if (callRef.current && !callRef.current.connectedAt) callRef.current.connectedAt = Date.now();
          clearTimeout(ringTimerRef.current);
          clearTimeout(connectTimerRef.current);
          updateStatus((cur) => (cur === "calling" || cur === "connecting" ? "active" : cur));
        } else if (state === "failed" || state === "closed") {
          // "disconnected" is usually a network blip that recovers on its own.
          removePeer(peerId);
        }
      };

      if (initiator) {
        pc.createOffer()
          .then((offer) => pc.setLocalDescription(offer))
          .then(() => sigRef.current?.send("offer", { from: meId, to: peerId, sdp: pc.localDescription }))
          .catch((err) => console.error("[call.offer]", err));
      }
      return peer;
    },
    [meId, removePeer, updateStatus],
  );

  // ICE can arrive before the remote description; queue it until then.
  const flushIce = useCallback(async (peer) => {
    const queued = peer.pendingIce.splice(0);
    for (const candidate of queued) {
      try {
        await peer.pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.error("[call.addIce]", e);
      }
    }
  }, []);

  const attachSignaling = useCallback(
    (conversationId) => {
      knownRef.current = new Set();
      sigRef.current = joinCall(conversationId, {
        onReady: () => sigRef.current?.send("join", { from: meId }),
        onJoin: ({ from } = {}) => {
          if (!from || from === meId || knownRef.current.has(from)) return;
          knownRef.current.add(from);
          sigRef.current?.send("join", { from: meId }); // answer back so they learn me
          if (meId < from) createPeer(from, true);
        },
        onOffer: async ({ from, to, sdp } = {}) => {
          if (to !== meId || !from) return;
          knownRef.current.add(from);
          const peer = createPeer(from, false);
          try {
            await peer.pc.setRemoteDescription(new RTCSessionDescription(sdp));
            await flushIce(peer);
            const answer = await peer.pc.createAnswer();
            await peer.pc.setLocalDescription(answer);
            sigRef.current?.send("answer", { from: meId, to: from, sdp: peer.pc.localDescription });
          } catch (e) {
            console.error("[call.answer]", e);
          }
        },
        onAnswer: async ({ from, to, sdp } = {}) => {
          const peer = to === meId ? peersRef.current.get(from) : null;
          if (!peer) return;
          try {
            await peer.pc.setRemoteDescription(new RTCSessionDescription(sdp));
            await flushIce(peer);
          } catch (e) {
            console.error("[call.setAnswer]", e);
          }
        },
        onIce: async ({ from, to, candidate } = {}) => {
          const peer = to === meId && candidate ? peersRef.current.get(from) : null;
          if (!peer) return;
          if (!peer.pc.remoteDescription) {
            peer.pendingIce.push(candidate);
            return;
          }
          try {
            await peer.pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (e) {
            console.error("[call.addIce]", e);
          }
        },
        onLeave: ({ from } = {}) => {
          if (from) removePeer(from);
        },
      });
    },
    [meId, createPeer, removePeer, flushIce],
  );

  const hangup = useCallback(() => {
    const data = callRef.current;
    if (statusRef.current === "idle" && !data) return;
    clearTimeout(ringTimerRef.current);
    clearTimeout(connectTimerRef.current);

    peersRef.current.forEach(({ pc }) => {
      try {
        pc.close();
      } catch {
        /* already closed */
      }
    });
    peersRef.current.clear();
    releaseLocalStream();
    sigRef.current?.send("leave", { from: meId });
    sigRef.current?.leave();
    sigRef.current = null;

    if (data && meId) {
      const outgoing = data.fromId === meId;
      const connected = Boolean(data.connectedAt);
      const durationSecs = connected ? (Date.now() - data.connectedAt) / 1000 : 0;
      // The caller withdraws any invite still ringing.
      if (outgoing) ring(data.targetIds, "cancel", { callId: data.callId });

      logCall({
        projectId: data.projectId,
        conversationId: data.conversationId,
        ownerId: meId,
        title: data.title,
        kind: data.kind,
        direction: outgoing ? "outgoing" : "incoming",
        missed: !connected,
        durationSecs,
        participantIds: data.targetIds,
      });

      if (outgoing) {
        // One call card per call, posted by the caller; realtime delivers it.
        sendMessage({
          conversationId: data.conversationId,
          authorId: meId,
          text: "",
          call: {
            status: connected ? "ended" : "missed",
            kind: data.kind,
            durationSecs: Math.round(durationSecs),
            initiatorId: meId,
            participantIds: data.targetIds,
          },
        });
        // Nobody picked up: tell everyone who didn't explicitly decline.
        const missedBy = connected ? [] : data.targetIds.filter((id) => !declinedRef.current.has(id));
        if (missedBy.length) {
          notifyPeople(missedBy, {
            projectId: data.projectId,
            type: "missed_call",
            title: `Missed ${data.kind === "video" ? "video" : "audio"} call from ${ME.name}`,
            body: data.type === "channel" ? `In ${data.title}` : "",
            actorId: meId,
            conversationId: data.conversationId,
            meta: { kind: data.kind, conversationType: data.type },
          });
        }
      }
    }

    knownRef.current = new Set();
    declinedRef.current = new Set();
    callRef.current = null;
    setRemoteStreams({});
    setCall(null);
    updateStatus("idle");
  }, [meId, updateStatus, releaseLocalStream]);

  useEffect(() => {
    hangupRef.current = hangup;
  }, [hangup]);

  // Ring the other members of a conversation.
  const start = useCallback(
    async ({ projectId, conversationId, kind = "audio", title, targetIds = [], type = "dm" }) => {
      if (statusRef.current !== "idle" || busyRef.current) return;
      if (!callsSupported()) {
        toast.error("Calls need a live connection, which isn't available here.");
        return;
      }
      const ids = [...new Set(targetIds)].filter((id) => id && id !== meId);
      if (!conversationId || !ids.length) {
        toast.error("There's no one else in this conversation to call.");
        return;
      }
      // Held across the media prompt so a double click can't start two calls.
      busyRef.current = true;
      try {
        await ensureLocalStream(kind);
      } catch {
        toast.error("Couldn't access your microphone or camera.");
        return;
      } finally {
        busyRef.current = false;
      }
      const data ={ callId: crypto.randomUUID(), projectId, conversationId, kind, title, targetIds: ids, type, fromId: meId };
      callRef.current = data;
      declinedRef.current = new Set();
      setCall(data);
      updateStatus("calling");
      attachSignaling(conversationId);
      ring(ids, "invite", { callId: data.callId, projectId, conversationId, from: meId, fromName: ME.name, kind, type, title });
      ringTimerRef.current = setTimeout(() => {
        if (statusRef.current !== "calling") return;
        toast("No answer");
        hangupRef.current();
      }, RING_TIMEOUT_MS);
    },
    [meId, ensureLocalStream, attachSignaling, updateStatus],
  );

  // Give up on a call that was accepted but never connected.
  const armConnectTimeout = useCallback(() => {
    clearTimeout(connectTimerRef.current);
    connectTimerRef.current = setTimeout(() => {
      if (statusRef.current !== "connecting") return;
      toast.error("Couldn't connect the call.");
      hangupRef.current();
    }, CONNECT_TIMEOUT_MS);
  }, []);

  const accept = useCallback(async () => {
    const invite = incomingRef.current;
    if (!invite || busyRef.current) return;
    showIncoming(null);
    busyRef.current = true;
    try {
      await ensureLocalStream(invite.kind);
    } catch {
      toast.error("Couldn't access your microphone or camera.");
      ring([invite.from], "decline", { callId: invite.callId, from: meId });
      return;
    } finally {
      busyRef.current = false;
    }
    // The caller may have hung up while the media prompt was open.
    if (cancelledRef.current.has(invite.callId)) {
      releaseLocalStream();
      toast("The call ended before you joined.");
      return;
    }
    const data = {
      callId: invite.callId,
      projectId: invite.projectId,
      conversationId: invite.conversationId,
      kind: invite.kind,
      title: invite.type === "channel" ? invite.title : getPerson(invite.from).name || invite.fromName,
      targetIds: [invite.from],
      type: invite.type || "dm",
      fromId: invite.from,
    };
    callRef.current = data;
    setCall(data);
    updateStatus("connecting");
    armConnectTimeout();
    attachSignaling(invite.conversationId);
    ring([invite.from], "accept", { callId: invite.callId, from: meId });
  }, [meId, ensureLocalStream, releaseLocalStream, attachSignaling, armConnectTimeout, showIncoming, updateStatus]);

  const decline = useCallback(() => {
    const invite = incomingRef.current;
    if (!invite) return;
    ring([invite.from], "decline", { callId: invite.callId, from: meId });
    showIncoming(null);
  }, [meId, showIncoming]);

  const toggleMic = useCallback(() => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMicOn(track.enabled);
  }, []);

  const toggleCam = useCallback(() => {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setCamOn(track.enabled);
  }, []);

  // My ring channel, alive for the whole session.
  useEffect(() => {
    if (!meId) return undefined;
    const logMissedInvite = (invite) =>
      logCall({
        projectId: invite.projectId,
        conversationId: invite.conversationId,
        ownerId: meId,
        title: invite.type === "channel" ? invite.title : invite.fromName,
        kind: invite.kind,
        direction: "incoming",
        missed: true,
        participantIds: [invite.from],
      });

    const unsubscribe = subscribeRing(meId, {
      onInvite: (invite) => {
        if (!invite?.callId) return;
        if (statusRef.current !== "idle" || incomingRef.current || busyRef.current || ME.doNotDisturb) {
          ring([invite.from], "busy", { callId: invite.callId, from: meId, reason: ME.doNotDisturb ? "dnd" : "busy" });
          logMissedInvite(invite);
          return;
        }
        showIncoming(invite);
        // Drop an invite whose caller vanished without cancelling.
        inviteTimerRef.current = setTimeout(() => {
          if (incomingRef.current?.callId !== invite.callId) return;
          showIncoming(null);
          logMissedInvite(invite);
        }, INVITE_EXPIRY_MS);
      },
      onCancel: (payload) => {
        if (!payload?.callId) return;
        // Remembered so an accept still waiting on the media prompt can bail out.
        cancelledRef.current.add(payload.callId);
        const invite = incomingRef.current;
        if (!invite || invite.callId !== payload.callId) return;
        showIncoming(null);
        logMissedInvite(invite);
      },
      onDecline: (payload) => {
        const data = callRef.current;
        if (!data || data.callId !== payload?.callId) return;
        if (payload.from) declinedRef.current.add(payload.from);
        // A DM ends on decline; a channel call only once everyone has declined.
        if (data.type === "dm" || data.targetIds.every((id) => declinedRef.current.has(id))) {
          if (statusRef.current === "calling") {
            toast(data.type === "dm" ? `${getPerson(payload.from).firstName} declined the call` : "Everyone declined the call");
            hangupRef.current();
          }
        }
      },
      onAccept: (payload) => {
        if (callRef.current?.callId !== payload?.callId || statusRef.current !== "calling") return;
        updateStatus("connecting");
        armConnectTimeout();
      },
      onBusy: (payload) => {
        const data = callRef.current;
        if (!data || data.callId !== payload?.callId || data.type !== "dm" || statusRef.current !== "calling") return;
        const name = getPerson(payload.from).firstName;
        toast(payload.reason === "dnd" ? `${name} has Do Not Disturb on` : `${name} is on another call`);
        hangupRef.current();
      },
    });
    return () => {
      unsubscribe();
      clearTimeout(inviteTimerRef.current);
    };
  }, [meId, showIncoming, updateStatus, armConnectTimeout]);

  // Leaving Communications mid-call hangs up cleanly.
  useEffect(() => () => hangupRef.current(), []);

  return { status, call, incoming, remoteStreams, localStream, micOn, camOn, start, accept, decline, hangup, toggleMic, toggleCam };
}
