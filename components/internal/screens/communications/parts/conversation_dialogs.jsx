"use client";

import React, { useState } from "react";
import { Globe, Lock, PenSquare, Plus, UserPlus } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
} from "@geiger/ui";
import { Field, SearchInput } from "@/components/internal/shared/screen_kit";
import { isExternalPerson } from "@/lib/chat/people_store";
import { cn } from "@/lib/utils";
import { ExternalBadge } from "./external_badge";
import { PeoplePicker, usePeopleSearch } from "./people_picker";
import { UserAvatar } from "./user_avatar";

// Spreads the props Radix's asChild trigger injects (onClick, ref, aria-*).
function IconTrigger({ label, icon: Icon, ...props }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={label}
      className="rounded-full text-muted-foreground hover:text-foreground"
      {...props}
    >
      <Icon className="h-[17px] w-[17px]" />
    </Button>
  );
}

// "New message": pick a teammate, or type an exact email / username to reach
// someone outside the project. Calls onStartDm(person) or onStartDm({ query }).
export function NewMessageDialog({ onStartDm }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const results = usePeopleSearch(query);

  const close = () => {
    setOpen(false);
    setQuery("");
  };
  const start = (target) => {
    close();
    onStartDm?.(target);
  };
  const looksLikeAddress = /^\S+@\S+\.\S+$|^[\w.-]{3,}$/.test(query.trim());

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : close())}>
      <DialogTrigger asChild>
        <IconTrigger label="New message" icon={PenSquare} />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New message</DialogTitle>
          <DialogDescription>Message a teammate, or enter someone&apos;s exact email to reach them.</DialogDescription>
        </DialogHeader>
        <SearchInput expanded value={query} onChange={setQuery} placeholder="Name, email or username" />
        <div className="max-h-72 space-y-0.5 overflow-y-auto scrollbar-subtle">
          {results.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => start(p)}
              className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-surface-hover"
            >
              <UserAvatar person={p} size="md" showPresence />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{p.name}</p>
                <p className="truncate text-xs text-text-secondary">{p.email || p.role}</p>
              </div>
              {isExternalPerson(p) ? <ExternalBadge /> : null}
            </button>
          ))}
          {results.length === 0 && query.trim() && looksLikeAddress ? (
            <button
              type="button"
              onClick={() => start({ query: query.trim() })}
              className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-surface-hover"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full border border-border-strong bg-surface-card text-muted-foreground">
                <UserPlus className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-foreground">Message “{query.trim()}”</span>
                <span className="block truncate text-xs text-text-secondary">Look up this exact email or username</span>
              </span>
            </button>
          ) : null}
          {results.length === 0 && !(query.trim() && looksLikeAddress) ? (
            <p className="px-3 py-8 text-center text-sm text-text-secondary">
              {query.trim() ? "No people found." : "No teammates have opened chat in this project yet."}
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

const VISIBILITY = [
  { key: "public", label: "Public", hint: "Everyone on the project joins", icon: Globe },
  { key: "private", label: "Private", hint: "Only people you add", icon: Lock },
];

// "Create channel": name, optional topic, visibility, and people to add.
export function CreateChannelDialog({ onCreateChannel }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [visibility, setVisibility] = useState("public");
  const [memberIds, setMemberIds] = useState([]);

  const reset = () => {
    setName("");
    setTopic("");
    setVisibility("public");
    setMemberIds([]);
  };
  const clean = name.trim().replace(/^#/, "").replace(/\s+/g, "-").toLowerCase();
  const create = () => {
    if (!clean) return;
    setOpen(false);
    onCreateChannel?.({ name: clean, topic: topic.trim(), visibility, memberIds });
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <IconTrigger label="Create channel" icon={Plus} />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a channel</DialogTitle>
          <DialogDescription>Channels keep a team conversation in one place — a building, a turn, a vendor.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Name" htmlFor="channel-name" hint={clean ? `#${clean}` : undefined}>
            <Input
              id="channel-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && create()}
              placeholder="e.g. maple-court-maintenance"
            />
          </Field>
          <Field label="Topic" htmlFor="channel-topic">
            <Input id="channel-topic" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="What's this channel about? (optional)" />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            {VISIBILITY.map((o) => (
              <button
                key={o.key}
                type="button"
                onClick={() => setVisibility(o.key)}
                className={cn(
                  "flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors",
                  visibility === o.key ? "border-border-strong bg-surface-active" : "border-border bg-surface-card hover:border-border-strong",
                )}
              >
                <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <o.icon className="h-4 w-4 text-muted-foreground" /> {o.label}
                </span>
                <span className="text-xs text-text-secondary">{o.hint}</span>
              </button>
            ))}
          </div>
          <Field label={`Add people${memberIds.length ? ` (${memberIds.length})` : ""}`}>
            <PeoplePicker
              selectedIds={memberIds}
              onToggle={(id) => setMemberIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={create} disabled={!clean}>
            Create channel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Add people to an existing channel.
export function InviteMembersDialog({ channelName, excludeIds = [], onInvite }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState([]);
  const invite = () => {
    if (!selected.length) return;
    setOpen(false);
    onInvite?.(selected);
    setSelected([]);
  };
  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSelected([]); }}>
      <DialogTrigger asChild>
        <IconTrigger label="Add people" icon={UserPlus} />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add people to #{channelName}</DialogTitle>
          <DialogDescription>They&apos;ll see the channel&apos;s history and get an Inbox notification.</DialogDescription>
        </DialogHeader>
        <PeoplePicker
          selectedIds={selected}
          excludeIds={excludeIds}
          onToggle={(id) => setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))}
          emptyLabel="Everyone here is already in the channel."
        />
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={invite} disabled={!selected.length}>
            Add{selected.length ? ` ${selected.length}` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
