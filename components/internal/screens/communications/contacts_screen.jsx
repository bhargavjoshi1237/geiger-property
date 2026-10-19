"use client";

import React, { useMemo, useState } from "react";
import { toast } from "sonner";
import { MessageSquare, Phone, Settings2, Users, Video } from "lucide-react";
import { Button } from "@geiger/ui";
import { DataTable, EmptyState, ScreenHeader, SearchInput, StatusPill, Toolbar } from "@/components/internal/shared/screen_kit";
import { SegmentedTabs } from "@/components/internal/shared/segmented_tabs";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { useChat } from "@/lib/chat/chat_context";
import { ME, isExternalPerson, usePeopleVersion } from "@/lib/chat/people_store";
import { createOrGetDm } from "@/lib/supabase/chat_conversations";
import { useCallApi } from "./call_provider";
import { CONTACT_STATUS_MAP, PRESENCE_FILTER_OPTIONS, fromNow } from "./constants";
import { ChatPage } from "./parts/chat_page";
import { ExternalBadge } from "./parts/external_badge";
import { UserAvatar } from "./parts/user_avatar";

function lastActive(row) {
  if (row.pending) return "—";
  if (row.presence === "online") return "Active now";
  return row.lastSeenAt ? `${fromNow(row.lastSeenAt)} ago` : "—";
}

function IconAction({ label, icon: Icon, onClick }) {
  return (
    <Button type="button" variant="ghost" size="icon-sm" title={label} aria-label={label} onClick={onClick} className="text-muted-foreground hover:text-foreground">
      <Icon className="h-4 w-4" />
    </Button>
  );
}

// The project team as chat sees it: everyone who has opened this project's chat,
// plus Team & Members entries who haven't yet (shown, but not reachable).
export function ContactsScreen({ onOpenConversation }) {
  usePeopleVersion();
  const { projectId, directory, roster } = useChat();
  const { callPerson } = useCallApi();
  const { setTab } = useWorkspaceUrl();
  const [query, setQuery] = useState("");
  const [presence, setPresence] = useState("all");

  const rows = useMemo(() => {
    const emails = new Set(directory.map((p) => (p.email || "").toLowerCase()));
    if (ME.email) emails.add(ME.email.toLowerCase());
    const pending = roster
      .filter((m) => !emails.has(m.email))
      .map((m) => ({ id: `team-${m.id}`, name: m.name || m.email, email: m.email, role: m.role, presence: "offline", pending: true }));
    return [...directory, ...pending];
  }, [directory, roster]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (presence !== "all" && (row.pending || row.presence !== presence)) return false;
      return !q || [row.name, row.email, row.role].some((v) => v?.toLowerCase().includes(q));
    });
  }, [rows, query, presence]);

  const message = async (person) => {
    const dm = await createOrGetDm(ME.id, person.id, projectId);
    if (dm) onOpenConversation(dm.id, "dm");
    else toast.error("Couldn't open the conversation.");
  };

  const columns = [
    {
      key: "member",
      header: "Member",
      render: (row) => (
        <div className="flex min-w-0 items-center gap-3">
          <UserAvatar person={row} size="md" showPresence={!row.pending} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-sm font-medium text-foreground">{row.name}</span>
              {!row.pending && isExternalPerson(row) ? <ExternalBadge /> : null}
            </div>
            <p className="truncate text-xs text-text-secondary">{row.email}</p>
          </div>
        </div>
      ),
    },
    { key: "role", header: "Role", className: "text-sm text-muted-foreground", render: (row) => row.role || "—" },
    {
      key: "status",
      header: "Status",
      render: (row) => <StatusPill status={row.pending ? "pending" : row.presence} map={CONTACT_STATUS_MAP} />,
    },
    { key: "lastActive", header: "Last active", className: "text-sm text-muted-foreground", render: lastActive },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (row) =>
        row.pending ? (
          <span className="text-xs text-text-tertiary">Invite them to open Communications</span>
        ) : (
          <div className="flex items-center justify-end gap-1">
            <IconAction label={`Message ${row.firstName}`} icon={MessageSquare} onClick={() => message(row)} />
            <IconAction label={`Audio call ${row.firstName}`} icon={Phone} onClick={() => callPerson(row, "audio")} />
            <IconAction label={`Video call ${row.firstName}`} icon={Video} onClick={() => callPerson(row, "video")} />
          </div>
        ),
    },
  ];

  const hasFilters = query.trim() || presence !== "all";

  return (
    <ChatPage>
      <ScreenHeader
        title="Contacts"
        description="Your project team in chat. Message or call anyone in one click."
        actions={
          <Button variant="outline" onClick={() => setTab("Team & Members")}>
            <Settings2 className="h-4 w-4" /> Manage team
          </Button>
        }
      />
      <Toolbar>
        <div>
          <SegmentedTabs tabs={PRESENCE_FILTER_OPTIONS} value={presence} onChange={setPresence} />
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Search people…" />
      </Toolbar>
      <DataTable
        columns={columns}
        data={filtered}
        getRowKey={(row) => row.id}
        empty={
          <EmptyState
            icon={Users}
            title={hasFilters ? "No one matches" : "No teammates yet"}
            description={
              hasFilters
                ? "Try another search or status."
                : "Teammates appear here once they open Communications, or when they're added under Team & Members."
            }
            action={
              hasFilters ? (
                <Button variant="outline" size="sm" onClick={() => { setQuery(""); setPresence("all"); }}>
                  Clear filters
                </Button>
              ) : null
            }
            className="rounded-xl border border-border bg-surface-subtle"
          />
        }
      />
    </ChatPage>
  );
}
