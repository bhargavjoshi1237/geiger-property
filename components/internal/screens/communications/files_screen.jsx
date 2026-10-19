"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Download, FileText, MessageSquare, Paperclip, Trash2 } from "lucide-react";
import { Button } from "@geiger/ui";
import { DataTable, EmptyState, ListLoading, ScreenHeader, SearchInput, Toolbar } from "@/components/internal/shared/screen_kit";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { useChat } from "@/lib/chat/chat_context";
import { ME, ensurePeople, getPerson, usePeopleVersion } from "@/lib/chat/people_store";
import { useMyConversations } from "@/lib/chat/use_my_conversations";
import { listFiles, softDeleteFile } from "@/lib/supabase/chat_files";
import { FILE_KIND_FILTER_OPTIONS, FILE_KIND_META, dateTime, formatSize, fromNow } from "./constants";
import { conversationTitle } from "./chat_utils";
import { ChatPage } from "./parts/chat_page";

// Every file shared in this project's conversations I can see.
export function FilesScreen({ onOpenConversation }) {
  usePeopleVersion();
  const { projectId } = useChat();
  const { byId, loading: conversationsLoading } = useMyConversations();
  const [files, setFiles] = useState(null);
  const [kind, setKind] = useState("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    listFiles(projectId).then(async (rows) => {
      if (rows) await ensurePeople(rows.map((f) => f.ownerId));
      if (cancelled) return;
      if (!rows) toast.error("Couldn't load files.");
      setFiles(rows || []);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // Only files from conversations I'm in.
  const visible = useMemo(
    () => (files || []).filter((f) => !f.conversationId || byId(f.conversationId)),
    [files, byId],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return visible.filter((f) => (kind === "all" || f.kind === kind) && (!q || f.name.toLowerCase().includes(q)));
  }, [visible, kind, query]);

  const handleDelete = async (file) => {
    setFiles((prev) => prev.filter((f) => f.id !== file.id));
    if (await softDeleteFile(file)) toast.success("File removed");
    else {
      setFiles((prev) => [file, ...prev]);
      toast.error("Couldn't remove the file.");
    }
  };

  const columns = [
    {
      key: "name",
      header: "Name",
      render: (f) => {
        const Icon = FILE_KIND_META[f.kind]?.icon || FileText;
        return (
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-card text-muted-foreground">
              <Icon className="h-[18px] w-[18px]" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{f.name}</p>
              <p className="truncate text-xs text-text-secondary">
                {f.ownerId === ME.id ? "You" : getPerson(f.ownerId).firstName} · <span title={dateTime(f.createdAt)}>{fromNow(f.createdAt)} ago</span>
              </p>
            </div>
          </div>
        );
      },
    },
    { key: "kind", header: "Type", headClassName: "hidden md:table-cell", className: "hidden text-xs text-muted-foreground md:table-cell", render: (f) => FILE_KIND_META[f.kind]?.label || "File" },
    {
      key: "where",
      header: "Shared in",
      headClassName: "hidden md:table-cell",
      className: "hidden max-w-[200px] truncate text-xs text-muted-foreground md:table-cell",
      render: (f) => (f.conversationId && byId(f.conversationId) ? conversationTitle(byId(f.conversationId)) : "—"),
    },
    { key: "size", header: "Size", headClassName: "hidden sm:table-cell", className: "hidden text-xs text-muted-foreground sm:table-cell", render: (f) => formatSize(f.size) },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (f) => {
        const conversation = f.conversationId ? byId(f.conversationId) : null;
        return (
          <div className="flex items-center justify-end gap-1">
            <Button asChild variant="ghost" size="icon-sm" title="Download" aria-label={`Download ${f.name}`}>
              <a href={f.url} target="_blank" rel="noopener noreferrer" download={f.name}>
                <Download className="h-4 w-4" />
              </a>
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
            {f.ownerId === ME.id ? (
              <Button
                variant="ghost"
                size="icon-sm"
                title="Remove file"
                aria-label={`Remove ${f.name}`}
                onClick={() => handleDelete(f)}
                className="text-red-600 hover:bg-red-500/10 dark:text-red-400"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        );
      },
    },
  ];

  const hasFilters = kind !== "all" || query.trim();

  return (
    <ChatPage>
      <ScreenHeader title="Files" description="Everything shared in this project's conversations — photos, leases, invoices and more." />
      <Toolbar>
        <div>
          <FilterDropdown value={kind} onValueChange={setKind} options={FILE_KIND_FILTER_OPTIONS} height="h-9" />
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Search files…" />
      </Toolbar>
      {files === null || conversationsLoading ? (
        <ListLoading label="Loading files" />
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          getRowKey={(f) => f.id}
          empty={
            <EmptyState
              icon={Paperclip}
              title={hasFilters ? "No files match" : "No files yet"}
              description={hasFilters ? "Try another type or search." : "Attach a file in any conversation and it shows up here."}
              action={
                hasFilters ? (
                  <Button variant="outline" size="sm" onClick={() => { setKind("all"); setQuery(""); }}>
                    Clear filters
                  </Button>
                ) : null
              }
              className="rounded-xl border border-border bg-surface-subtle"
            />
          }
        />
      )}
    </ChatPage>
  );
}
