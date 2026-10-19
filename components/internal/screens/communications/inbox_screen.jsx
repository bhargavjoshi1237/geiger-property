"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Bell, Check, Inbox, MailOpen, MoreHorizontal, Trash2 } from "lucide-react";
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@geiger/ui";
import { EmptyState, ListLoading, ScreenHeader, SearchInput, Toolbar } from "@/components/internal/shared/screen_kit";
import { SegmentedTabs } from "@/components/internal/shared/segmented_tabs";
import { useChat } from "@/lib/chat/chat_context";
import { ensurePeople, getPerson, usePeopleVersion } from "@/lib/chat/people_store";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  normalizeNotification,
  softDeleteNotification,
  subscribeNotifications,
} from "@/lib/supabase/chat_notifications";
import { cn } from "@/lib/utils";
import { NOTIFICATION_TYPE_MAP, dateTime, fromNow } from "./constants";
import { ChatPage } from "./parts/chat_page";
import { UserAvatar } from "./parts/user_avatar";

const CALL_TYPES = new Set(["scheduled_call", "call_reminder"]);

function NotificationRow({ notification, onOpen, onToggleRead, onDelete }) {
  const meta = NOTIFICATION_TYPE_MAP[notification.type] || { label: "Update", icon: Bell, tone: "bg-surface-card border-border text-muted-foreground" };
  const Icon = meta.icon;
  const actor = notification.actorId ? getPerson(notification.actorId) : null;
  const unread = !notification.read;

  return (
    <div
      className={cn(
        "group flex items-start gap-3 rounded-xl border p-4 transition-colors",
        unread ? "border-border bg-surface-subtle hover:border-border-strong" : "border-transparent hover:bg-surface-hover",
      )}
    >
      <button type="button" onClick={() => onOpen(notification)} className="flex min-w-0 flex-1 items-start gap-3 text-left">
        <span className="relative mt-0.5 shrink-0">
          {actor ? (
            <UserAvatar person={actor} size="md" />
          ) : (
            <span className={cn("flex h-9 w-9 items-center justify-center rounded-lg border", meta.tone)}>
              <Icon className="h-4 w-4" />
            </span>
          )}
          {actor ? (
            <span className={cn("absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border", meta.tone, "bg-background")}>
              <Icon className="h-3 w-3" />
            </span>
          ) : null}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-3">
            <span className={cn("truncate text-sm", unread ? "font-semibold text-foreground" : "font-medium text-muted-foreground")}>{notification.title}</span>
            <span className="shrink-0 text-[11px] text-text-secondary" title={dateTime(notification.createdAt)}>
              {fromNow(notification.createdAt)}
            </span>
          </span>
          {notification.body ? <span className="mt-0.5 line-clamp-2 block text-xs text-text-secondary">{notification.body}</span> : null}
          <span className="mt-2 inline-block rounded-md border border-border bg-surface-card px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-text-secondary">
            {meta.label}
          </span>
        </span>
      </button>
      <div className="flex shrink-0 items-center gap-1">
        {unread ? <span className="mt-1 h-2 w-2 rounded-full bg-primary" aria-label="Unread" /> : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Notification options" className="opacity-0 focus-visible:opacity-100 group-hover:opacity-100">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44 border-border bg-surface-subtle">
            <DropdownMenuItem onSelect={() => onToggleRead(notification)}>
              {unread ? <Check className="h-4 w-4" /> : <MailOpen className="h-4 w-4" />}
              {unread ? "Mark as read" : "Mark as unread"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onDelete(notification)} className="text-red-600 focus:bg-red-500/10 dark:text-red-400">
              <Trash2 className="h-4 w-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

// Mentions, channel invites, missed calls and call reminders for me in this
// project. Opening one marks it read and jumps to where it happened.
export function InboxScreen({ onNavigate, onOpenConversation, onInboxChange }) {
  usePeopleVersion();
  const { projectId, me } = useChat();
  const [items, setItems] = useState(null);
  const [tab, setTab] = useState("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    listNotifications(me.id, projectId).then(async (rows) => {
      if (rows) await ensurePeople(rows.map((n) => n.actorId));
      if (cancelled) return;
      if (!rows) toast.error("Couldn't load your inbox.");
      setItems(rows || []);
    });
    const unsubscribe = subscribeNotifications(me.id, (row, type) => {
      if (row?.project_id !== projectId) return;
      const n = normalizeNotification(row);
      if (n.actorId) ensurePeople([n.actorId]);
      setItems((prev) => {
        if (!prev) return prev;
        if (row.deleted_at) return prev.filter((x) => x.id !== n.id);
        if (prev.some((x) => x.id === n.id)) return prev.map((x) => (x.id === n.id ? n : x));
        return type === "INSERT" ? [n, ...prev] : prev;
      });
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [me.id, projectId]);

  const unreadCount = (items || []).filter((n) => !n.read).length;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (items || []).filter(
      (n) => (tab === "all" || !n.read) && (!q || `${n.title} ${n.body}`.toLowerCase().includes(q)),
    );
  }, [items, tab, query]);

  const setRead = async (n, read) => {
    setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read } : x)));
    const ok = await markNotificationRead(n.id, read);
    if (!ok) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: n.read } : x)));
      toast.error("Couldn't update the notification.");
    }
    onInboxChange?.();
  };

  const handleOpen = (n) => {
    if (!n.read) setRead(n, true);
    if (CALL_TYPES.has(n.type)) onNavigate("Calls");
    else if (n.conversationId) onOpenConversation(n.conversationId, n.type === "channel_invite" ? "channel" : n.meta.conversationType || "dm");
  };

  const handleDelete = async (n) => {
    setItems((prev) => prev.filter((x) => x.id !== n.id));
    if (!(await softDeleteNotification(n.id))) {
      setItems((prev) => [n, ...prev].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
      toast.error("Couldn't delete the notification.");
    }
    onInboxChange?.();
  };

  const handleMarkAll = async () => {
    const before = items;
    setItems((prev) => prev.map((x) => ({ ...x, read: true })));
    if (await markAllNotificationsRead(me.id, projectId)) toast.success("All caught up");
    else {
      setItems(before);
      toast.error("Couldn't mark everything as read.");
    }
    onInboxChange?.();
  };

  const tabs = [
    { value: "all", label: "All" },
    { value: "unread", label: unreadCount ? `Unread (${unreadCount})` : "Unread" },
  ];

  return (
    <ChatPage secondary>
      <ScreenHeader
        title="Inbox"
        description="Mentions, channel invites, missed calls and call reminders."
        actions={
          <Button variant="outline" onClick={handleMarkAll} disabled={!unreadCount}>
            <MailOpen className="h-4 w-4" /> Mark all read
          </Button>
        }
      />
      <Toolbar>
        <div>
          <SegmentedTabs tabs={tabs} value={tab} onChange={setTab} />
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Search notifications…" />
      </Toolbar>
      {items === null ? (
        <ListLoading label="Loading inbox" />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={query.trim() || tab === "unread" ? "Nothing here" : "You're all caught up"}
          description={
            query.trim() || tab === "unread"
              ? "No notifications match this view."
              : "When someone mentions you, adds you to a channel or misses you on a call, it shows up here."
          }
          className="rounded-xl border border-border bg-surface-subtle"
        />
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((n) => (
            <NotificationRow key={n.id} notification={n} onOpen={handleOpen} onToggleRead={(x) => setRead(x, !x.read)} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </ChatPage>
  );
}
