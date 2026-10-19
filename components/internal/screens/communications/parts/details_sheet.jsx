"use client";

import React, { useState } from "react";
import { AtSign, Bell, BellOff, Briefcase, Clock, Hash, Lock, LogOut, Phone, Video } from "lucide-react";
import { Button, Input, Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@geiger/ui";
import { Field } from "@/components/internal/shared/screen_kit";
import { ME, getPerson, isExternalPerson } from "@/lib/chat/people_store";
import { PRESENCE, fromNow } from "../constants";
import { ExternalBadge } from "./external_badge";
import { UserAvatar } from "./user_avatar";

function lastActive(person) {
  if (person.presence === "online") return "Active now";
  if (person.presence === "dnd") return "Do not disturb";
  return person.lastSeenAt ? `${fromNow(person.lastSeenAt)} ago` : "—";
}

function ActionButton({ icon: Icon, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-1 flex-col items-center gap-1.5 rounded-xl border border-border bg-surface-card py-3 text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
    >
      <Icon className="h-[18px] w-[18px]" />
      <span className="text-xs font-medium">{label}</span>
    </button>
  );
}

function Row({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-3 px-5 py-2.5">
      <Icon className="h-4 w-4 shrink-0 text-text-secondary" />
      <span className="w-24 shrink-0 text-xs text-text-secondary">{label}</span>
      <span className="min-w-0 flex-1 truncate text-sm text-foreground">{value || "—"}</span>
    </div>
  );
}

function SectionLabel({ children }) {
  return <p className="px-5 pb-1 pt-4 text-xs font-medium uppercase tracking-wider text-text-secondary">{children}</p>;
}

// Name + topic editor for a channel.
function ChannelAbout({ conversation, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(conversation.name);
  const [topic, setTopic] = useState(conversation.topic);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const clean = name.trim().replace(/^#/, "").replace(/\s+/g, "-").toLowerCase();
    if (!clean) return;
    setSaving(true);
    const ok = await onUpdate?.(conversation, { name: clean, topic });
    setSaving(false);
    if (ok) setEditing(false);
  };

  if (!editing) {
    return (
      <>
        <div className="flex items-center justify-between px-5 pb-1 pt-4">
          <p className="text-xs font-medium uppercase tracking-wider text-text-secondary">About</p>
          {onUpdate ? (
            <Button variant="ghost" size="xs" onClick={() => { setName(conversation.name); setTopic(conversation.topic); setEditing(true); }}>
              Edit
            </Button>
          ) : null}
        </div>
        <Row icon={Hash} label="Channel" value={`#${conversation.name}`} />
        <Row icon={Briefcase} label="Topic" value={conversation.topic} />
        <Row icon={Lock} label="Visibility" value={conversation.visibility === "private" ? "Private" : "Public"} />
      </>
    );
  }

  return (
    <div className="grid gap-3 px-5 pt-4">
      <Field label="Name" htmlFor="channel-edit-name">
        <Input id="channel-edit-name" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Topic" htmlFor="channel-edit-topic">
        <Input id="channel-edit-topic" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="What's this channel about?" />
      </Field>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
          Cancel
        </Button>
        <Button size="sm" onClick={save} disabled={saving || !name.trim()}>
          Save
        </Button>
      </div>
    </div>
  );
}

// Slide-over details: a contact card for a DM, channel info and members otherwise.
export function DetailsSheet({ conversation, open, onOpenChange, onCall, onMute, onLeave, onUpdateChannel }) {
  if (!conversation) return null;
  const isChannel = conversation.type === "channel";
  const person = isChannel ? null : getPerson(conversation.participantId);
  const members = (conversation.memberIds || []).map(getPerson).sort((a, b) => a.name.localeCompare(b.name));
  const presence = person ? PRESENCE[person.presence] || PRESENCE.offline : null;
  const close = (fn) => () => {
    onOpenChange(false);
    fn?.();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 border-l border-border bg-surface-subtle p-0 text-foreground sm:max-w-sm">
        <SheetHeader className="gap-0 border-b border-border p-5">
          <div className="flex flex-col items-center text-center">
            {isChannel ? (
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-surface-card text-muted-foreground">
                {conversation.visibility === "private" ? <Lock className="h-7 w-7" /> : <Hash className="h-7 w-7" />}
              </div>
            ) : (
              <UserAvatar person={person} size="xl" showPresence />
            )}
            <SheetTitle className="mt-3 flex items-center gap-1.5 text-lg text-foreground">
              {isChannel ? `#${conversation.name}` : person.name}
              {!isChannel && isExternalPerson(person) ? <ExternalBadge /> : null}
            </SheetTitle>
            <SheetDescription className="mt-0.5">
              {isChannel ? `${members.length} ${members.length === 1 ? "member" : "members"}` : [person.role, presence.label].filter(Boolean).join(" · ")}
            </SheetDescription>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto pb-6 scrollbar-subtle">
          <div className="flex gap-2 p-5">
            <ActionButton icon={Phone} label="Audio" onClick={close(() => onCall?.("audio"))} />
            <ActionButton icon={Video} label="Video" onClick={close(() => onCall?.("video"))} />
            <ActionButton
              icon={conversation.muted ? Bell : BellOff}
              label={conversation.muted ? "Unmute" : "Mute"}
              onClick={() => onMute?.(conversation, !conversation.muted)}
            />
          </div>

          {isChannel ? (
            <>
              <ChannelAbout key={conversation.id} conversation={conversation} onUpdate={onUpdateChannel} />
              <SectionLabel>Members</SectionLabel>
              {members.map((m) => {
                const p = PRESENCE[m.presence] || PRESENCE.offline;
                return (
                  <div key={m.id} className="flex items-center gap-3 px-5 py-2">
                    <UserAvatar person={m} size="md" showPresence />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-foreground">
                        {m.name}
                        {m.id === ME.id ? <span className="text-text-secondary"> (you)</span> : null}
                      </p>
                      <p className="truncate text-xs text-text-secondary">{m.role}</p>
                    </div>
                    <span className="shrink-0 text-xs" style={{ color: p.color }}>
                      {p.label}
                    </span>
                  </div>
                );
              })}
              <div className="px-5 pt-4">
                <Button variant="ghost" className="w-full justify-center text-red-600 hover:bg-red-500/10 dark:text-red-400" onClick={close(() => onLeave?.(conversation))}>
                  <LogOut className="h-4 w-4" /> Leave channel
                </Button>
              </div>
            </>
          ) : (
            <>
              <SectionLabel>Contact</SectionLabel>
              <Row icon={AtSign} label="Email" value={person.email} />
              <Row icon={Briefcase} label="Role" value={person.role} />
              <Row icon={Clock} label="Last active" value={lastActive(person)} />
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
