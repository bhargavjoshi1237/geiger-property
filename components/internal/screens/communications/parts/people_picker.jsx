"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
import { SearchInput } from "@/components/internal/shared/screen_kit";
import { useChat } from "@/lib/chat/chat_context";
import { ME } from "@/lib/chat/people_store";
import { searchProfiles } from "@/lib/supabase/chat_profiles";
import { cn } from "@/lib/utils";
import { UserAvatar } from "./user_avatar";

// Search the project's chat directory by name, username or email. Merges the
// loaded directory with a debounced server search.
export function usePeopleSearch(query, { excludeIds = [] } = {}) {
  const { projectId, directory } = useChat();
  const [remote, setRemote] = useState([]);

  useEffect(() => {
    const q = query.trim();
    const timer = setTimeout(() => {
      if (!q) setRemote([]);
      else searchProfiles(q, { projectId }).then(setRemote);
    }, 250);
    return () => clearTimeout(timer);
  }, [query, projectId]);

  return useMemo(() => {
    const excluded = new Set([ME.id, ...excludeIds]);
    const q = query.trim().toLowerCase();
    const matches = (p) =>
      !q || [p.name, p.username, p.email].some((v) => v?.toLowerCase().includes(q));
    const out = directory.filter((p) => !excluded.has(p.id) && matches(p));
    const seen = new Set(out.map((p) => p.id));
    for (const p of remote) {
      if (p?.id && !excluded.has(p.id) && !seen.has(p.id)) {
        seen.add(p.id);
        out.push(p);
      }
    }
    return out;
  }, [directory, remote, query, excludeIds]);
}

// Searchable multi-select of people (create channel, add people, schedule call).
export function PeoplePicker({ selectedIds = [], onToggle, excludeIds = [], emptyLabel = "No people found." }) {
  const [query, setQuery] = useState("");
  const results = usePeopleSearch(query, { excludeIds });
  const selected = new Set(selectedIds);

  return (
    <div className="space-y-2">
      <SearchInput expanded value={query} onChange={setQuery} placeholder="Search by name or email" />
      <div className="max-h-60 space-y-0.5 overflow-y-auto scrollbar-subtle">
        {results.map((p) => {
          const isSelected = selected.has(p.id);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onToggle?.(p.id)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors",
                isSelected ? "bg-surface-active" : "hover:bg-surface-hover",
              )}
            >
              <UserAvatar person={p} size="sm" showPresence />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{p.name}</p>
                <p className="truncate text-xs text-text-secondary">{p.email || p.role}</p>
              </div>
              <span
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors",
                  isSelected ? "border-primary bg-primary text-primary-foreground" : "border-border-strong text-transparent",
                )}
              >
                <Check className="h-3 w-3" />
              </span>
            </button>
          );
        })}
        {results.length === 0 ? <p className="px-3 py-8 text-center text-sm text-text-secondary">{emptyLabel}</p> : null}
      </div>
    </div>
  );
}
