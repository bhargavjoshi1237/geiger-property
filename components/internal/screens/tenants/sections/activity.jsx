"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { MessageSquare, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/internal/shared/screen_kit";
import { listCommunications, createCommunication, softDeleteCommunication } from "@/lib/supabase/tenant_communications";

// Tenants · Communication Log section — lists the tenant's messages from the
// `property.tenant_communications` data layer (no static seed). Fetch on mount,
// optimistic add/remove, reconcile on failure.
export function ActivitySection({ item }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [subject, setSubject] = useState("");

  useEffect(() => {
    let alive = true;
    listCommunications(item.id)
      .then((rows) => {
        if (!alive) return;
        setLogs(rows ?? []);
        setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setLogs([]);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [item.id]);

  const add = async () => {
    const trimmed = subject.trim();
    if (!trimmed) {
      toast.error("Add a subject for the message.");
      return;
    }
    const optimistic = {
      id: crypto.randomUUID(),
      tenantId: item.id,
      channel: "note",
      direction: "outbound",
      subject: trimmed,
      body: "",
      occurredAt: new Date().toISOString(),
    };
    setLogs((prev) => [optimistic, ...prev]);
    setSubject("");
    const created = await createCommunication(optimistic);
    if (created) {
      setLogs((prev) => prev.map((l) => (l.id === optimistic.id ? created : l)));
    } else {
      setLogs((prev) => prev.filter((l) => l.id !== optimistic.id));
      toast.error("Couldn't log the message.");
    }
  };

  const remove = async (log) => {
    const prev = logs;
    setLogs((l) => l.filter((x) => x.id !== log.id));
    const ok = await softDeleteCommunication(log.id);
    if (!ok) {
      setLogs(prev);
      toast.error("Couldn't delete the message.");
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading communication log…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Log a message (subject)"
          className="bg-surface-card"
        />
        <Button
          className="bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={add}
        >
          <Plus className="h-4 w-4" /> Log
        </Button>
      </div>

      {logs.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface-subtle">
          <EmptyState
            icon={MessageSquare}
            title="No messages logged"
            description="Record emails, calls, SMS, and notes with this tenant."
          />
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface-subtle">
          {logs.map((log) => (
            <li
              key={log.id}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">
                  {log.subject}
                </p>
                <p className="text-xs text-text-secondary">
                  {log.channel} · {log.direction}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-red-300 hover:bg-red-500/10"
                onClick={() => remove(log)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default ActivitySection;
