"use client";

import React, { useMemo, useState } from "react";
import { toast } from "sonner";
import { Hash, Lock, Phone, Video } from "lucide-react";
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input } from "@geiger/ui";
import { Field, SearchInput } from "@/components/internal/shared/screen_kit";
import { SegmentedTabs } from "@/components/internal/shared/segmented_tabs";
import { cn } from "@/lib/utils";
import { usePeopleSearch } from "./people_picker";
import { UserAvatar } from "./user_avatar";

const KIND_TABS = [
  { value: "audio", label: "Audio", icon: Phone },
  { value: "video", label: "Video", icon: Video },
];

const TARGET_TABS = [
  { value: "person", label: "Person" },
  { value: "channel", label: "Channel" },
];

// Pick who a call is with: one teammate, or one of my channels.
// Value: { type: "person", person } | { type: "channel", conversation } | null.
function TargetPicker({ channels, value, onChange }) {
  const [mode, setMode] = useState(value?.type || "person");
  const [query, setQuery] = useState("");
  const people = usePeopleSearch(mode === "person" ? query : "");
  const matchingChannels = useMemo(() => {
    const q = query.trim().toLowerCase();
    return channels.filter((c) => !q || c.name.toLowerCase().includes(q));
  }, [channels, query]);

  const rowClass = (selected) =>
    cn("flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors", selected ? "bg-surface-active" : "hover:bg-surface-hover");

  return (
    <div className="space-y-2">
      <SegmentedTabs tabs={TARGET_TABS} value={mode} onChange={(next) => { setMode(next); setQuery(""); }} fullWidth />
      <SearchInput expanded value={query} onChange={setQuery} placeholder={mode === "person" ? "Search people" : "Search channels"} />
      <div className="max-h-56 space-y-0.5 overflow-y-auto scrollbar-subtle">
        {mode === "person"
          ? people.map((p) => (
              <button key={p.id} type="button" onClick={() => onChange({ type: "person", person: p })} className={rowClass(value?.person?.id === p.id)}>
                <UserAvatar person={p} size="sm" showPresence />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">{p.name}</span>
                  <span className="block truncate text-xs text-text-secondary">{p.email || p.role}</span>
                </span>
              </button>
            ))
          : matchingChannels.map((c) => (
              <button key={c.id} type="button" onClick={() => onChange({ type: "channel", conversation: c })} className={rowClass(value?.conversation?.id === c.id)}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-card text-muted-foreground">
                  {c.visibility === "private" ? <Lock className="h-4 w-4" /> : <Hash className="h-4 w-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">#{c.name}</span>
                  <span className="block truncate text-xs text-text-secondary">{c.memberIds.length} members</span>
                </span>
              </button>
            ))}
        {(mode === "person" ? people : matchingChannels).length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-text-secondary">{mode === "person" ? "No people found." : "No channels found."}</p>
        ) : null}
      </div>
    </div>
  );
}

export function targetLabel(target) {
  if (!target) return "";
  return target.type === "person" ? target.person.name : `#${target.conversation.name}`;
}

// Ring someone (or a channel) now.
export function NewCallDialog({ open, onOpenChange, channels, onStart }) {
  const [target, setTarget] = useState(null);
  const [kind, setKind] = useState("audio");
  const close = (v) => {
    onOpenChange(v);
    if (!v) setTarget(null);
  };
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New call</DialogTitle>
          <DialogDescription>Ring a teammate, or everyone in a channel.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <TargetPicker channels={channels} value={target} onChange={setTarget} />
          <Field label="Call type">
            <SegmentedTabs tabs={KIND_TABS} value={kind} onChange={setKind} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button
            disabled={!target}
            onClick={() => {
              onStart({ target, kind });
              close(false);
            }}
          >
            {kind === "video" ? <Video className="h-4 w-4" /> : <Phone className="h-4 w-4" />}
            Call{target ? ` ${targetLabel(target)}` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// The next half hour, as local date + time input values.
function nextSlot() {
  const d = new Date(Date.now() + 30 * 60 * 1000);
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0);
  const pad = (n) => String(n).padStart(2, "0");
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

// Plan a call; participants get an Inbox notice now and a reminder 15 minutes before.
export function ScheduleCallDialog({ open, onOpenChange, channels, onSchedule }) {
  const [title, setTitle] = useState("");
  const [slot, setSlot] = useState(nextSlot);
  const [kind, setKind] = useState("video");
  const [target, setTarget] = useState(null);
  const [saving, setSaving] = useState(false);

  const close = (v) => {
    onOpenChange(v);
    if (!v) {
      setTitle("");
      setSlot(nextSlot());
      setTarget(null);
    }
  };
  const when = new Date(`${slot.date}T${slot.time}`);
  const valid = target && slot.date && slot.time && !Number.isNaN(when.getTime());

  const submit = async () => {
    if (!valid) return;
    if (when.getTime() <= Date.now()) {
      toast.error("Pick a time in the future.");
      return;
    }
    setSaving(true);
    const ok = await onSchedule({ title: title.trim() || `Call with ${targetLabel(target)}`, scheduledAt: when.toISOString(), kind, target });
    setSaving(false);
    if (ok) close(false);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Schedule a call</DialogTitle>
          <DialogDescription>Everyone invited gets an Inbox notice now and a reminder 15 minutes before.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Title" htmlFor="call-title">
            <Input id="call-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Weekly maintenance sync" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date" htmlFor="call-date">
              <Input id="call-date" type="date" value={slot.date} onChange={(e) => setSlot((s) => ({ ...s, date: e.target.value }))} />
            </Field>
            <Field label="Time" htmlFor="call-time">
              <Input id="call-time" type="time" value={slot.time} onChange={(e) => setSlot((s) => ({ ...s, time: e.target.value }))} />
            </Field>
          </div>
          <Field label="Call type">
            <SegmentedTabs tabs={KIND_TABS} value={kind} onChange={setKind} />
          </Field>
          <Field label="With">
            <TargetPicker channels={channels} value={target} onChange={setTarget} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button disabled={!valid || saving} onClick={submit}>
            Schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
