"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Clock, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/internal/shared/screen_kit";
import { listActivity, createActivity } from "@/lib/supabase/activity_log";
import { getUser } from "@/lib/supabase/user";

function relativeTime(iso) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

// Polymorphic per-owner Activity timeline — system entries plus user notes.
export function ActivitySection({ item, config }) {
  const ownerType = config.key;
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");

  useEffect(() => {
    let alive = true;
    listActivity(ownerType, item.id)
      .then((rows) => {
        if (!alive) return;
        setEntries(rows ?? []);
        setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setEntries([]);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [ownerType, item.id]);

  const post = async () => {
    const trimmed = note.trim();
    if (!trimmed) return;
    const user = await getUser();
    const optimistic = {
      id: crypto.randomUUID(),
      ownerType,
      ownerId: item.id,
      verb: "note",
      summary: trimmed,
      actorName: user?.name || "You",
      occurredAt: new Date().toISOString(),
    };
    setEntries((prev) => [optimistic, ...prev]);
    setNote("");
    const created = await createActivity(optimistic);
    if (created) {
      setEntries((prev) => prev.map((e) => (e.id === optimistic.id ? created : e)));
    } else {
      setEntries((prev) => prev.filter((e) => e.id !== optimistic.id));
      toast.error("Couldn't post that note.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Add a note to the timeline…"
          rows={2}
          className="w-full rounded-md border border-border bg-surface-card px-3 py-2 text-sm text-foreground placeholder:text-text-tertiary outline-none transition-colors focus-visible:border-border-strong focus-visible:ring-2 focus-visible:ring-border"
        />
        <Button
          className="bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={post}
          disabled={!note.trim()}
        >
          <Send className="h-4 w-4" /> Post
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading activity…</p>
      ) : entries.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface-subtle">
          <EmptyState
            icon={Clock}
            title="No activity yet"
            description="Notes and changes will show up here."
          />
        </div>
      ) : (
        <ol className="space-y-3">
          {entries.map((e) => (
            <li key={e.id} className="flex gap-3">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-card text-text-secondary">
                <Clock className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm text-foreground">{e.summary}</p>
                <p className="text-xs text-text-tertiary">
                  {[e.actorName, relativeTime(e.occurredAt)].filter(Boolean).join(" · ")}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export default ActivitySection;
