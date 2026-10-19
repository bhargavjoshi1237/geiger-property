"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  CalendarClock,
  CalendarPlus,
  MessageSquare,
  Phone,
  PhoneCall,
  PhoneIncoming,
  PhoneMissed,
  PhoneOutgoing,
  Video,
  X,
} from "lucide-react";
import { Badge, Button } from "@geiger/ui";
import {
  DataTable,
  EmptyState,
  ListLoading,
  ScreenHeader,
  SearchInput,
  SectionCard,
  Toolbar,
} from "@/components/internal/shared/screen_kit";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { useChat } from "@/lib/chat/chat_context";
import { ME, getPerson, usePeopleVersion } from "@/lib/chat/people_store";
import { useMyConversations } from "@/lib/chat/use_my_conversations";
import { cancelScheduledCall, createScheduledCall, listCalls, listScheduledCalls } from "@/lib/supabase/chat_calls";
import { createOrGetDm } from "@/lib/supabase/chat_conversations";
import { notifyPeople } from "@/lib/supabase/chat_notifications";
import { cn } from "@/lib/utils";
import { useCallApi } from "./call_provider";
import { CALL_FILTER_OPTIONS, dateTime, durationLabel, fromNow } from "./constants";
import { NewCallDialog, ScheduleCallDialog } from "./parts/call_dialogs";
import { ChatPage } from "./parts/chat_page";
import { AvatarStack, UserAvatar } from "./parts/user_avatar";

const DIRECTION = {
  missed: { label: "Missed", icon: PhoneMissed, className: "text-red-600 dark:text-red-400" },
  incoming: { label: "Incoming", icon: PhoneIncoming, className: "text-muted-foreground" },
  outgoing: { label: "Outgoing", icon: PhoneOutgoing, className: "text-muted-foreground" },
};

// A DM or channel to ring for a stored call: the real conversation when I'm in
// it, otherwise one rebuilt from the call's participants.
function conversationFor(byId, conversationId, participantIds) {
  const known = conversationId ? byId(conversationId) : null;
  if (known) return known;
  const others = participantIds.filter((id) => id !== ME.id);
  if (!conversationId || !others.length) return null;
  return others.length === 1
    ? { id: conversationId, type: "dm", participantId: others[0], memberIds: [ME.id, others[0]] }
    : { id: conversationId, type: "channel", name: "call", memberIds: [ME.id, ...others] };
}

function soonLabel(iso) {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return { label: "Now", variant: "success" };
  if (diff <= 15 * 60 * 1000) return { label: `In ${Math.max(1, Math.round(diff / 60000))} min`, variant: "warning" };
  return null;
}

// Calls: start or schedule a call, see what's coming up, and the call history.
export function CallsScreen({ onOpenConversation }) {
  usePeopleVersion();
  const { projectId, me } = useChat();
  const { callConversation, status } = useCallApi();
  const { conversations, byId } = useMyConversations();
  const [calls, setCalls] = useState(null);
  const [scheduled, setScheduled] = useState(null);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);

  const loadCalls = useCallback(async () => {
    const rows = await listCalls(projectId, me.id);
    if (!rows) toast.error("Couldn't load your call history.");
    setCalls(rows || []);
  }, [projectId, me.id]);

  const loadScheduled = useCallback(async () => {
    const rows = await listScheduledCalls(projectId, me.id);
    setScheduled(rows || []);
  }, [projectId, me.id]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listCalls(projectId, me.id), listScheduledCalls(projectId, me.id)]).then(([history, upcoming]) => {
      if (cancelled) return;
      if (!history) toast.error("Couldn't load your call history.");
      setCalls(history || []);
      setScheduled(upcoming || []);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, me.id]);

  // A call just ended → its history row lands shortly after; refresh then.
  const lastStatus = useRef(status);
  useEffect(() => {
    const ended = lastStatus.current !== "idle" && status === "idle";
    lastStatus.current = status;
    if (!ended) return undefined;
    const timer = setTimeout(loadCalls, 1000);
    return () => clearTimeout(timer);
  }, [status, loadCalls]);

  const channels = useMemo(() => conversations.filter((c) => c.type === "channel"), [conversations]);

  const resolveTarget = async (target) => {
    if (target.type === "channel") return target.conversation;
    const dm = await createOrGetDm(ME.id, target.person.id, projectId);
    if (!dm) toast.error("Couldn't open a conversation with them.");
    return dm;
  };

  const handleStart = async ({ target, kind }) => {
    const conversation = await resolveTarget(target);
    if (conversation) callConversation(conversation, kind);
  };

  const handleSchedule = async ({ title, scheduledAt, kind, target }) => {
    const conversation = await resolveTarget(target);
    if (!conversation) return false;
    const participantIds = conversation.type === "channel" ? conversation.memberIds : [ME.id, conversation.participantId];
    const created = await createScheduledCall({ projectId, conversationId: conversation.id, title, kind, scheduledAt, createdBy: ME.id, participantIds });
    if (!created) {
      toast.error("Couldn't schedule the call.");
      return false;
    }
    setScheduled((prev) => [...(prev || []), created].sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt)));
    notifyPeople(
      participantIds.filter((id) => id !== ME.id),
      {
        projectId,
        type: "scheduled_call",
        title: `${ME.name} scheduled “${title}”`,
        body: `${kind === "video" ? "Video" : "Audio"} call · ${dateTime(scheduledAt)}`,
        actorId: ME.id,
        conversationId: conversation.id,
        meta: { scheduledCallId: created.id, scheduledAt, conversationType: conversation.type },
      },
    );
    toast.success("Call scheduled");
    return true;
  };

  const handleCancel = async (call) => {
    setScheduled((prev) => prev.filter((c) => c.id !== call.id));
    if (await cancelScheduledCall(call.id)) toast.success("Call cancelled");
    else {
      toast.error("Couldn't cancel the call.");
      loadScheduled();
    }
  };

  const ring = (conversationId, participantIds, kind, title) => {
    const conversation = conversationFor(byId, conversationId, participantIds);
    if (conversation) callConversation(conversation, kind, title);
    else toast.error("There's no one to call for this one.");
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (calls || []).filter((call) => {
      if (filter === "missed" && !call.missed) return false;
      if ((filter === "incoming" || filter === "outgoing") && (call.missed || call.direction !== filter)) return false;
      const names = call.participantIds.map((id) => getPerson(id).name).join(" ");
      return !q || `${call.title} ${names}`.toLowerCase().includes(q);
    });
  }, [calls, filter, query]);

  const columns = [
    {
      key: "call",
      header: "Call",
      render: (call) => {
        const people = call.participantIds.filter((id) => id !== ME.id).map(getPerson);
        return (
          <div className="flex min-w-0 items-center gap-3">
            <UserAvatar person={people[0] || ME} size="md" />
            <div className="min-w-0">
              <p className={cn("truncate text-sm font-medium", call.missed ? "text-red-600 dark:text-red-400" : "text-foreground")}>{call.title}</p>
              <p className="truncate text-xs text-text-secondary">{people.map((p) => p.firstName).join(", ") || "—"}</p>
            </div>
          </div>
        );
      },
    },
    {
      key: "direction",
      header: "Direction",
      render: (call) => {
        const meta = call.missed ? DIRECTION.missed : DIRECTION[call.direction] || DIRECTION.outgoing;
        return (
          <span className={cn("inline-flex items-center gap-1.5 text-xs", meta.className)}>
            <meta.icon className="h-3.5 w-3.5" /> {meta.label}
          </span>
        );
      },
    },
    {
      key: "kind",
      header: "Type",
      render: (call) => (
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          {call.kind === "video" ? <Video className="h-3.5 w-3.5" /> : <Phone className="h-3.5 w-3.5" />}
          {call.kind === "video" ? "Video" : "Audio"}
        </span>
      ),
    },
    { key: "duration", header: "Duration", className: "text-xs text-muted-foreground", render: (call) => (call.missed ? "—" : durationLabel(call.durationSecs)) },
    { key: "when", header: "When", className: "text-xs text-muted-foreground", render: (call) => <span title={dateTime(call.createdAt)}>{fromNow(call.createdAt)} ago</span> },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (call) => {
        const conversation = call.conversationId ? byId(call.conversationId) : null;
        return (
          <div className="flex items-center justify-end gap-1">
            <Button variant="ghost" size="icon-sm" title="Call back" aria-label="Call back" onClick={() => ring(call.conversationId, call.participantIds, call.kind, call.title)}>
              <PhoneCall className="h-4 w-4" />
            </Button>
            {conversation ? (
              <Button
                variant="ghost"
                size="icon-sm"
                title="Open conversation"
                aria-label="Open conversation"
                onClick={() => onOpenConversation(conversation.id, conversation.type)}
              >
                <MessageSquare className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        );
      },
    },
  ];

  const hasFilters = filter !== "all" || query.trim();

  return (
    <ChatPage>
      <ScreenHeader
        title="Calls"
        description="Ring a teammate or a whole channel, plan calls ahead, and look back at your history."
        actions={
          <>
            <Button variant="outline" onClick={() => setScheduleOpen(true)}>
              <CalendarPlus className="h-4 w-4" /> Schedule
            </Button>
            <Button onClick={() => setNewOpen(true)}>
              <Phone className="h-4 w-4" /> New call
            </Button>
          </>
        }
      />

      <SectionCard title="Upcoming" description="Calls you're invited to. You'll get a reminder 15 minutes before." bodyPadding={false}>
        {scheduled === null ? (
          <ListLoading className="border-0" label="Loading upcoming calls" />
        ) : scheduled.length === 0 ? (
          <EmptyState icon={CalendarClock} title="Nothing scheduled" description="Plan a call with a teammate or a channel." className="py-10" />
        ) : (
          <ul className="divide-y divide-border">
            {scheduled.map((call) => {
              const soon = soonLabel(call.scheduledAt);
              const people = call.participantIds.filter((id) => id !== ME.id).map(getPerson);
              return (
                <li key={call.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-card text-muted-foreground">
                    {call.kind === "video" ? <Video className="h-4 w-4" /> : <Phone className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-foreground">{call.title}</p>
                      {soon ? <Badge variant={soon.variant}>{soon.label}</Badge> : null}
                    </div>
                    <p className="truncate text-xs text-text-secondary">
                      {dateTime(call.scheduledAt)}
                      {call.createdBy && call.createdBy !== ME.id ? ` · by ${getPerson(call.createdBy).firstName}` : ""}
                    </p>
                  </div>
                  <AvatarStack people={people} max={4} />
                  <div className="flex items-center gap-1">
                    <Button size="sm" onClick={() => ring(call.conversationId, call.participantIds, call.kind, call.title)}>
                      {call.kind === "video" ? <Video className="h-4 w-4" /> : <Phone className="h-4 w-4" />} Start
                    </Button>
                    {call.createdBy === ME.id ? (
                      <Button variant="ghost" size="icon-sm" title="Cancel call" aria-label="Cancel call" onClick={() => handleCancel(call)}>
                        <X className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>

      <Toolbar>
        <div>
          <FilterDropdown value={filter} onValueChange={setFilter} options={CALL_FILTER_OPTIONS} height="h-9" />
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Search calls…" />
      </Toolbar>

      {calls === null ? (
        <ListLoading label="Loading call history" />
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          getRowKey={(call) => call.id}
          empty={
            <EmptyState
              icon={Phone}
              title={hasFilters ? "No calls match" : "No calls yet"}
              description={hasFilters ? "Try another filter or search." : "Calls you make or receive in this project show up here."}
              action={
                hasFilters ? (
                  <Button variant="outline" size="sm" onClick={() => { setFilter("all"); setQuery(""); }}>
                    Clear filters
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => setNewOpen(true)}>
                    <Phone className="h-4 w-4" /> New call
                  </Button>
                )
              }
              className="rounded-xl border border-border bg-surface-subtle"
            />
          }
        />
      )}

      <NewCallDialog open={newOpen} onOpenChange={setNewOpen} channels={channels} onStart={handleStart} />
      <ScheduleCallDialog open={scheduleOpen} onOpenChange={setScheduleOpen} channels={channels} onSchedule={handleSchedule} />
    </ChatPage>
  );
}
