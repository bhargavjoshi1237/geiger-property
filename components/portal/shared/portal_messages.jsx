"use client";

import React, { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Loader2, MessagesSquare, Plus, Send } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@geiger/ui/button";
import { Input } from "@geiger/ui/input";
import { Textarea } from "@geiger/ui/textarea";
import { ScreenHeader } from "@/components/internal/shared/screen_kit";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { portalApi } from "@/lib/portal/portal_fetch";
import { DataGate, Notice, PortalEmpty, fmtDateTime, usePortalData } from "../portal_kit";

function Composer({ threadId, onSent, autoFocus }) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (!body.trim()) return toast.error("Write a message first.");
    setBusy(true);
    const res = await portalApi("/api/portal/messages", { method: "POST", body: { threadId, subject, body } });
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("Message sent to the office.");
    setBody("");
    setSubject("");
    onSent(res.threadId);
  };
  return (
    <div className="space-y-2">
      {!threadId ? <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" autoFocus={autoFocus} /> : null}
      <Textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a message…" autoFocus={autoFocus && Boolean(threadId)} />
      <div className="flex justify-end">
        <Button onClick={send} disabled={busy || !body.trim()} className="bg-primary text-primary-foreground hover:bg-primary/90">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send
        </Button>
      </div>
    </div>
  );
}

// Two-way conversation with the office (the office answers from the staff inbox).
export function PortalMessages() {
  const state = usePortalData("/api/portal/messages");
  const [openId, setOpenId] = useState(null);
  const [composing, setComposing] = useState(false);
  const threads = useMemo(() => state.data?.threads || [], [state.data]);
  const open = threads.find((t) => t.id === openId) || null;

  const sent = (threadId) => {
    setComposing(false);
    setOpenId(threadId);
    state.reload();
  };

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Messages"
        description="Questions for the office? Send a message — replies arrive here and by email."
        actions={
          state.data && !state.data.disabled ? (
            <Button onClick={() => { setComposing(true); setOpenId(null); }} className="bg-primary text-primary-foreground hover:bg-primary/90">
              <Plus className="h-4 w-4" /> New Message
            </Button>
          ) : null
        }
      />
      <DataGate state={state}>
        {(data) =>
          data.disabled ? (
            <Notice>Messaging the office is turned off for your account. Please call or email the office.</Notice>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
              <div className={cn("space-y-2", (open || composing) && "hidden lg:block")}>
                {threads.length ? (
                  threads.map((t) => {
                    const last = t.messages[t.messages.length - 1];
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => { setOpenId(t.id); setComposing(false); }}
                        className={cn(
                          "w-full rounded-xl border p-3 text-left transition-colors",
                          t.id === openId ? "border-border-strong bg-surface-active" : "border-border bg-surface-subtle hover:bg-surface-hover",
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-medium text-foreground">{t.subject}</p>
                          <span className="shrink-0 text-[11px] text-text-tertiary">{fmtDateTime(t.lastMessageAt)}</span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs text-text-secondary">
                          {last?.direction === "inbound" ? "You: " : ""}
                          {last?.body}
                        </p>
                      </button>
                    );
                  })
                ) : (
                  <PortalEmpty icon={MessagesSquare} title="No messages yet" description="Start a conversation with the office." />
                )}
              </div>

              <div className={cn(!(open || composing) && "hidden lg:block")}>
                {composing ? (
                  <div className="rounded-xl border border-border bg-surface-subtle p-4">
                    <button type="button" onClick={() => setComposing(false)} className="mb-3 inline-flex items-center gap-1 text-xs text-text-secondary hover:text-foreground lg:hidden">
                      <ArrowLeft className="h-3.5 w-3.5" /> Back
                    </button>
                    <h2 className="mb-3 text-sm font-semibold text-foreground">New Message</h2>
                    <Composer onSent={sent} autoFocus />
                  </div>
                ) : open ? (
                  <div className="flex flex-col rounded-xl border border-border bg-surface-subtle">
                    <div className="border-b border-border px-4 py-3">
                      <button type="button" onClick={() => setOpenId(null)} className="mb-1 inline-flex items-center gap-1 text-xs text-text-secondary hover:text-foreground lg:hidden">
                        <ArrowLeft className="h-3.5 w-3.5" /> All messages
                      </button>
                      <h2 className="text-sm font-semibold text-foreground">{open.subject}</h2>
                    </div>
                    <div className="space-y-3 p-4">
                      {open.messages.map((m) => {
                        const mine = m.direction === "inbound";
                        return (
                          <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                            <div className={cn("max-w-[85%] rounded-xl border px-3 py-2", mine ? "border-border-strong bg-surface-active" : "border-border bg-surface-card")}>
                              <p className="whitespace-pre-wrap text-sm text-foreground">{m.body}</p>
                              <p className="mt-1 text-[11px] text-text-tertiary">
                                {m.fromName} · {fmtDateTime(m.sentAt)}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="border-t border-border p-4">
                      <Composer threadId={open.id} onSent={sent} />
                    </div>
                  </div>
                ) : threads.length ? (
                  <PortalEmpty icon={MessagesSquare} title="Pick a conversation" description="Or start a new message to the office." />
                ) : null}
              </div>
            </div>
          )
        }
      </DataGate>
    </MainScreenWrapper>
  );
}

export default PortalMessages;
