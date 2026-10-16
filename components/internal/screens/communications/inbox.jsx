"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowUpRight,
  Inbox,
  Loader2,
  Mail,
  MessageSquare,
  NotebookPen,
  Plus,
  Reply,
  Send,
  Smartphone,
  TriangleAlert,
} from "lucide-react";
import { LogoLoading } from "@geiger/ui";

import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import {
  EmptyState,
  Field,
  ListLoading,
  ScreenHeader,
  SearchInput,
  StatsBar,
  StatusPill,
  Toolbar,
} from "@/components/internal/shared/screen_kit";
import { SegmentedTabs } from "@/components/internal/shared/segmented_tabs";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import {
  listThreadMessages,
  listThreads,
  logThreadMessage,
  markThreadRead,
  updateThread,
} from "@/lib/supabase/message_threads";
import { sendMessage } from "@/lib/messaging/api";
import {
  DELIVERY_STATUS_MAP,
  PARTY_LABEL,
  PARTY_TAB,
  PARTY_TYPES,
  THREAD_STATUS_MAP,
  formatDateTime,
  selectOptions,
  timeAgo,
} from "./shared";
import {
  MergeFieldPicker,
  RecordPicker,
  TemplatePicker,
  insertAtCursor,
  useTemplates,
} from "./messaging_kit";

// Inbox — two-way conversations with tenants, owners, vendors and prospects
// (owns `property.message_threads` / `property.thread_messages`). Replies are
// merged and emailed through /api/messages/send; SMS is stored as "not sent"
// until a provider is connected; inbound replies are logged by hand here (or by
// the /api/messages/inbound webhook once a mail provider is pointed at it).

const STATUS_VIEWS = [
  { value: "open", label: "Open", filter: (t) => t.status !== "Closed" },
  { value: "unread", label: "Unread", filter: (t) => Number(t.unreadCount) > 0 },
  { value: "waiting", label: "Waiting", filter: (t) => t.status === "Waiting" },
  { value: "closed", label: "Closed", filter: (t) => t.status === "Closed" },
  { value: "all", label: "All", filter: () => true },
];

const PARTY_FILTER = [{ value: "all", label: "Everyone" }, ...PARTY_TYPES];

const COMPOSE_MODES = [
  { value: "email", label: "Email", icon: Mail },
  { value: "sms", label: "SMS", icon: Smartphone },
  { value: "note", label: "Internal note", icon: NotebookPen },
  { value: "inbound", label: "Log reply", icon: Reply },
];

const initials = (name) =>
  String(name || "?")
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("") || "?";

function Avatar({ name, className }) {
  return (
    <div
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface-card text-xs font-semibold text-text-secondary",
        className,
      )}
    >
      {initials(name)}
    </div>
  );
}

function ThreadRow({ thread, active, onClick }) {
  const unread = Number(thread.unreadCount) > 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-3 border-b border-border px-4 py-3 text-left transition-colors last:border-b-0",
        active ? "bg-surface-active" : "hover:bg-surface-hover",
      )}
    >
      <Avatar name={thread.partyName} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className={cn("truncate text-sm", unread ? "font-semibold text-foreground" : "font-medium text-foreground")}>
            {thread.partyName || thread.partyEmail || "Unknown contact"}
          </span>
          <span className="shrink-0 text-[11px] text-text-tertiary">{timeAgo(thread.lastMessageAt || thread.createdAt)}</span>
        </div>
        <p className="truncate text-xs text-text-secondary">{thread.subject || "(no subject)"}</p>
        <div className="mt-1 flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-xs text-text-tertiary">
            {thread.lastDirection === "outbound" ? "You: " : ""}
            {thread.lastMessagePreview || "No messages yet"}
          </p>
          {unread ? (
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
              {thread.unreadCount}
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
}

function MessageBubble({ message }) {
  const inbound = message.direction === "inbound";
  const note = message.direction === "internal";
  const status = message.deliveryStatus;
  const showStatus = !inbound && !note && status && status !== "sent" && status !== "logged";
  return (
    <div className={cn("flex", inbound ? "justify-start" : "justify-end")}>
      <div
        className={cn(
          "max-w-[85%] rounded-xl border px-4 py-3",
          note
            ? "border-amber-500/20 bg-amber-500/10"
            : inbound
              ? "border-border bg-surface-card"
              : "border-border bg-surface-hover",
          message.pending && "opacity-60",
        )}
      >
        <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-text-tertiary">
          <span className="font-medium text-text-secondary">
            {note ? "Internal note" : inbound ? message.fromName || "Them" : message.fromName || "You"}
          </span>
          <span className="uppercase">{message.channel}</span>
          <span>{formatDateTime(message.sentAt || message.createdAt)}</span>
        </div>
        {message.subject && !note ? <p className="mb-1 text-sm font-medium text-foreground">{message.subject}</p> : null}
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{message.body}</p>
        {showStatus ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusPill status={status} map={DELIVERY_STATUS_MAP} />
            {message.deliveryError ? <span className="text-xs text-text-secondary">{message.deliveryError}</span> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// Composer: email / SMS replies go through the server; notes + logged replies are written directly.
function Composer({ thread, templates, onSent }) {
  const [mode, setMode] = useState("email");
  const [body, setBody] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);

  const pickTemplate = (id) => {
    setTemplateId(id);
    const t = (templates || []).find((x) => x.id === id);
    if (t?.body) setBody(t.body);
  };

  const submit = async () => {
    if (!body.trim()) {
      toast.error("Write a message first.");
      return;
    }
    setBusy(true);
    const text = body;
    const optimistic = {
      id: crypto.randomUUID(),
      direction: mode === "inbound" ? "inbound" : mode === "note" ? "internal" : "outbound",
      channel: mode === "note" || mode === "inbound" ? thread.channel || "email" : mode,
      body: text,
      fromName: mode === "inbound" ? thread.partyName : "",
      sentAt: new Date().toISOString(),
      pending: true,
    };
    onSent({ optimistic });
    setBody("");
    setTemplateId("");

    let ok = false;
    if (mode === "inbound") {
      ok = Boolean(
        await logThreadMessage(thread, {
          direction: "inbound",
          body: text,
          fromName: thread.partyName,
          fromAddress: thread.partyEmail,
        }),
      );
      if (ok) toast.success("Reply logged.");
    } else {
      const res = await sendMessage({
        threadId: thread.id,
        channel: mode,
        body: text,
        subject: thread.subject ? `Re: ${thread.subject.replace(/^re:\s*/i, "")}` : "",
        templateId: templateId || undefined,
      });
      ok = res.ok;
      if (!res.ok) toast.error(res.error || "Couldn't send.");
      else if (res.status === "sent") toast.success("Sent.");
      else if (res.status === "logged") toast.success("Note added.");
      else toast.warning(`Saved — ${res.error || DELIVERY_STATUS_MAP[res.status]?.label || "not delivered"}.`);
    }
    if (!ok) setBody(text);
    setBusy(false);
    onSent({ done: true, ok });
  };

  const placeholder =
    mode === "inbound"
      ? `Paste the reply you received from ${thread.partyName || "them"}…`
      : mode === "note"
        ? "Only your team sees internal notes…"
        : "Write a reply — merge fields like {{tenant_first_name}} are filled in…";

  return (
    <div className="border-t border-border p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <SegmentedTabs tabs={COMPOSE_MODES} value={mode} onChange={setMode} />
        {mode === "email" || mode === "sms" ? (
          <div className="flex items-center gap-2">
            <div className="w-56">
              <TemplatePicker templates={templates} value={templateId} onChange={pickTemplate} channel={mode} />
            </div>
            <MergeFieldPicker onInsert={(t) => setBody((b) => insertAtCursor(ref.current, b, t))} label="Field" />
          </div>
        ) : null}
      </div>
      {mode === "sms" ? (
        <p className="mb-2 flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
          <TriangleAlert className="h-3.5 w-3.5" />
          No SMS provider is connected — the message is saved as &ldquo;not sent&rdquo;.
        </p>
      ) : null}
      <Textarea
        ref={ref}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={placeholder}
        className="min-h-[96px]"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
        }}
      />
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-xs text-text-tertiary">Ctrl + Enter to send</span>
        <Button className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={busy} onClick={submit}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {mode === "inbound" ? "Log reply" : mode === "note" ? "Add note" : "Send"}
        </Button>
      </div>
    </div>
  );
}

function Conversation({ thread, templates, onBack, onThreadChange }) {
  const { openItemInTab } = useWorkspaceUrl();
  const [messages, setMessages] = useState(null);
  const endRef = useRef(null);
  const threadId = thread.id;

  const load = useCallback(() => listThreadMessages(threadId).then((rows) => setMessages(rows ?? [])), [threadId]);

  useEffect(() => {
    let alive = true;
    listThreadMessages(threadId).then((rows) => alive && setMessages(rows ?? []));
    return () => {
      alive = false;
    };
  }, [threadId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  const setStatus = async (status) => {
    onThreadChange({ ...thread, status });
    const ok = await updateThread(thread.id, { status });
    if (!ok) {
      onThreadChange(thread);
      toast.error("Couldn't update the conversation.");
    }
  };

  const handleSent = ({ optimistic, done }) => {
    if (optimistic) setMessages((prev) => [...(prev || []), optimistic]);
    if (done) {
      load();
      onThreadChange(null, { reload: true });
    }
  };

  const tab = PARTY_TAB[thread.partyType];

  return (
    <div className="flex min-h-[560px] flex-col">
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:bg-surface-active hover:text-foreground lg:hidden"
            onClick={onBack}
            aria-label="Back to conversations"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Avatar name={thread.partyName} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-semibold text-foreground">{thread.partyName || thread.partyEmail || "Unknown contact"}</p>
              <Badge variant="neutral">{PARTY_LABEL[thread.partyType] || "Contact"}</Badge>
            </div>
            <p className="truncate text-xs text-text-secondary">
              {[thread.partyEmail, thread.partyPhone].filter(Boolean).join(" · ") || "No contact details"}
              {thread.subject ? ` — ${thread.subject}` : ""}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {tab && thread.partyId ? (
            <Button
              variant="outline"
              size="sm"
              className="border-border bg-surface-card text-muted-foreground hover:bg-surface-hover hover:text-foreground"
              onClick={() => openItemInTab(thread.partyId, tab)}
            >
              <ArrowUpRight className="h-3.5 w-3.5" /> Open record
            </Button>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="border-border bg-surface-card hover:bg-surface-hover">
                <StatusPill status={thread.status} map={THREAD_STATUS_MAP} className="border-0 bg-transparent px-0" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="border-border bg-surface-subtle">
              <DropdownMenuRadioGroup value={thread.status} onValueChange={setStatus}>
                {selectOptions(THREAD_STATUS_MAP).map((o) => (
                  <DropdownMenuRadioItem key={o.value} value={o.value}>
                    {o.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4" style={{ maxHeight: 520 }}>
        {messages === null ? (
          <div className="flex justify-center py-16">
            <LogoLoading size={40} aria-label="Loading messages" />
          </div>
        ) : messages.length ? (
          messages.map((m) => <MessageBubble key={m.id} message={m} />)
        ) : (
          <EmptyState icon={MessageSquare} title="No messages yet" description="Send the first message below." />
        )}
        <div ref={endRef} />
      </div>

      <Composer thread={thread} templates={templates} onSent={handleSent} />
    </div>
  );
}

const EMPTY_DRAFT = { partyType: "tenant", partyId: "", channel: "email", templateId: "", subject: "", body: "" };

function NewMessageDialog({ open, onOpenChange, templates, onCreated }) {
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);
  const bodyRef = useRef(null);
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setDraft(EMPTY_DRAFT);
  }

  const pickTemplate = (id) => {
    const t = (templates || []).find((x) => x.id === id);
    setDraft((d) => ({ ...d, templateId: id, subject: t?.subject || d.subject, body: t?.body || d.body }));
  };

  const submit = async () => {
    if (!draft.partyId) return toast.error("Choose who the message is for.");
    if (!draft.body.trim()) return toast.error("Write the message.");
    setBusy(true);
    const res = await sendMessage({
      recipient: { type: draft.partyType, id: draft.partyId },
      channel: draft.channel,
      subject: draft.subject,
      body: draft.body,
      templateId: draft.templateId || undefined,
    });
    setBusy(false);
    if (!res.ok) return toast.error(res.error || "Couldn't send the message.");
    if (res.status === "sent") toast.success("Message sent.");
    else toast.warning(`Saved — ${res.error || DELIVERY_STATUS_MAP[res.status]?.label || "not delivered"}.`);
    onOpenChange(false);
    onCreated(res.threadId);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>New message</DialogTitle>
          <DialogDescription>
            Merge fields fill in from the recipient&apos;s tenant, lease, unit and balance records.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Recipient type" htmlFor="nm-type">
            <Select value={draft.partyType} onValueChange={(v) => setDraft((d) => ({ ...d, partyType: v, partyId: "" }))}>
              <SelectTrigger id="nm-type" className="w-full bg-surface-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PARTY_TYPES.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Recipient" htmlFor="nm-party">
            <RecordPicker id="nm-party" type={draft.partyType} value={draft.partyId} onChange={set("partyId")} />
          </Field>
          <Field label="Channel" htmlFor="nm-channel">
            <Select value={draft.channel} onValueChange={set("channel")}>
              <SelectTrigger id="nm-channel" className="w-full bg-surface-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="sms">SMS (provider not connected)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Template" htmlFor="nm-template">
            <TemplatePicker id="nm-template" templates={templates} value={draft.templateId} onChange={pickTemplate} channel={draft.channel} />
          </Field>
          {draft.channel === "email" ? (
            <Field label="Subject" htmlFor="nm-subject" className="sm:col-span-2">
              <Input
                id="nm-subject"
                value={draft.subject}
                onChange={(e) => set("subject")(e.target.value)}
                placeholder="e.g. A quick note about {{unit}}"
                className="bg-surface-card"
              />
            </Field>
          ) : null}
          <div className="space-y-1.5 sm:col-span-2">
            <div className="flex items-center justify-between">
              <label htmlFor="nm-body" className="text-sm font-medium text-muted-foreground">
                Message
              </label>
              <MergeFieldPicker onInsert={(t) => set("body")(insertAtCursor(bodyRef.current, draft.body, t))} label="Field" />
            </div>
            <Textarea
              id="nm-body"
              ref={bodyRef}
              value={draft.body}
              onChange={(e) => set("body")(e.target.value)}
              placeholder="Hi {{tenant_first_name}}, …"
              className="min-h-[140px]"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={busy} onClick={submit}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function InboxScreen() {
  const { itemId, openItem, closeItem } = useWorkspaceUrl();
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("open");
  const [party, setParty] = useState("all");
  const [search, setSearch] = useState("");
  const [composeOpen, setComposeOpen] = useState(false);
  const templates = useTemplates();

  const reload = useCallback(
    () =>
      listThreads().then((rows) => {
        setThreads(rows ?? []);
        setLoading(false);
      }),
    [],
  );

  useEffect(() => {
    let alive = true;
    listThreads().then((rows) => {
      if (!alive) return;
      setThreads(rows ?? []);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  const active = threads.find((t) => t.id === itemId) || null;

  // Opening an unread thread marks it read.
  const open = (t) => {
    openItem(t.id);
    if (Number(t.unreadCount) > 0) {
      setThreads((prev) => prev.map((x) => (x.id === t.id ? { ...x, unreadCount: 0 } : x)));
      markThreadRead(t.id);
    }
  };

  const onThreadChange = (next, opts) => {
    if (next) setThreads((prev) => prev.map((x) => (x.id === next.id ? next : x)));
    if (opts?.reload) reload();
  };

  const filtered = useMemo(() => {
    const viewFilter = STATUS_VIEWS.find((v) => v.value === view)?.filter || (() => true);
    const q = search.trim().toLowerCase();
    return threads.filter(
      (t) =>
        viewFilter(t) &&
        (party === "all" || t.partyType === party) &&
        (!q ||
          [t.partyName, t.partyEmail, t.subject, t.lastMessagePreview].some((v) => String(v || "").toLowerCase().includes(q))),
    );
  }, [threads, view, party, search]);

  const stats = useMemo(() => {
    const openCount = threads.filter((t) => t.status !== "Closed").length;
    const unread = threads.filter((t) => Number(t.unreadCount) > 0).length;
    const waiting = threads.filter((t) => t.status === "Waiting").length;
    const needsReply = threads.filter((t) => t.status !== "Closed" && t.lastDirection === "inbound").length;
    return [
      { label: "Open conversations", value: String(openCount), footer: `${threads.length} total` },
      { label: "Unread", value: String(unread), footer: "New replies" },
      { label: "Needs reply", value: String(needsReply), footer: "Last message was theirs" },
      { label: "Waiting on them", value: String(waiting), footer: "Awaiting a response" },
    ];
  }, [threads]);

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Inbox"
        description="Two-way conversations with tenants, owners, vendors, and prospects — replies are merged with record data and emailed."
        actions={
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => setComposeOpen(true)}>
            <Plus className="h-4 w-4" /> New message
          </Button>
        }
      />
      <StatsBar stats={stats} />
      <Toolbar>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedTabs tabs={STATUS_VIEWS} value={view} onChange={setView} />
          <FilterDropdown value={party} onValueChange={setParty} options={PARTY_FILTER} />
        </div>
        <SearchInput value={search} onChange={setSearch} placeholder="Search conversations…" className="sm:w-72" />
      </Toolbar>

      {loading ? (
        <ListLoading label="Loading conversations" />
      ) : !threads.length ? (
        <div className="rounded-xl border border-border bg-surface-subtle">
          <EmptyState
            icon={Inbox}
            title="No conversations yet"
            description="Start one with a tenant, owner, vendor, or prospect. Replies you log or receive land here."
            action={
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => setComposeOpen(true)}>
                <Plus className="h-4 w-4" /> New message
              </Button>
            }
          />
        </div>
      ) : (
        <div className="grid overflow-hidden rounded-xl border border-border bg-surface-subtle lg:grid-cols-[340px_1fr]">
          <div className={cn("border-border lg:border-r", active ? "hidden lg:block" : "block")}>
            {filtered.length ? (
              <div className="max-h-[680px] overflow-y-auto">
                {filtered.map((t) => (
                  <ThreadRow key={t.id} thread={t} active={t.id === itemId} onClick={() => open(t)} />
                ))}
              </div>
            ) : (
              <EmptyState
                title="No conversations match"
                description="Try another view or clear the search."
                action={
                  <Button
                    variant="outline"
                    className="border-border bg-surface-card"
                    onClick={() => {
                      setView("all");
                      setParty("all");
                      setSearch("");
                    }}
                  >
                    Clear filters
                  </Button>
                }
              />
            )}
          </div>
          <div className={cn(active ? "block" : "hidden lg:block")}>
            {active ? (
              <Conversation
                key={active.id}
                thread={active}
                templates={templates}
                onBack={closeItem}
                onThreadChange={onThreadChange}
              />
            ) : (
              <EmptyState
                icon={MessageSquare}
                title="Select a conversation"
                description="Pick a thread on the left to read it and reply."
                className="min-h-[560px]"
              />
            )}
          </div>
        </div>
      )}

      <NewMessageDialog
        open={composeOpen}
        onOpenChange={setComposeOpen}
        templates={templates}
        onCreated={(threadId) => {
          reload();
          if (threadId) openItem(threadId);
        }}
      />
    </MainScreenWrapper>
  );
}

export default InboxScreen;
