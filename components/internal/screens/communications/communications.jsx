"use client";

import React, { useCallback, useContext, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MessagesSquare } from "lucide-react";
import { LogoLoading } from "@geiger/ui";
import { EmptyState } from "@/components/internal/shared/screen_kit";
import { useProject } from "@/context/project-context";
import { WorkspaceUrlContext } from "@/lib/hooks/use-workspace-url";
import { ChatProvider, useChat } from "@/lib/chat/chat_context";
import { useChatActivity } from "@/lib/chat/use_chat_activity";
import { useCallReminders } from "@/lib/chat/use_call_reminders";
import { CallProvider } from "./call_provider";
import { ChatRail } from "./chat_rail";
import { CHAT_NAV, CHAT_TAB_PARAM, CONVERSATION_PARAM, DEFAULT_CHAT_TAB } from "./nav";
import { ChatScreen } from "./chat_screen";
import { ContactsScreen } from "./contacts_screen";
import { CallsScreen } from "./calls_screen";
import { FilesScreen } from "./files_screen";
import { InboxScreen } from "./inbox_screen";
import { SettingsScreen } from "./settings_screen";

// Communications: the project's team chat, ported from geiger-flow's Grounding
// workspace — messages, channels, contacts, calls, files, inbox and settings
// behind a secondary rail. Everything is scoped to the active project.

const SCREENS = {
  Messages: (props) => <ChatScreen {...props} variant="dm" title="Messages" />,
  Channels: (props) => <ChatScreen {...props} variant="channel" title="Channels" />,
  Contacts: ContactsScreen,
  Calls: CallsScreen,
  Files: FilesScreen,
  Inbox: InboxScreen,
  Settings: SettingsScreen,
};

const isTab = (value) => CHAT_NAV.some((item) => item.title === value);

// The rail tab + open conversation. They live in the query string on the real
// workspace; the landing playground navigates in memory, so they stay local there.
function useChatLocation() {
  const inMemory = Boolean(useContext(WorkspaceUrlContext));
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [local, setLocal] = useState({ tab: DEFAULT_CHAT_TAB, conversationId: null });

  const fromUrl = searchParams.get(CHAT_TAB_PARAM);
  const tab = inMemory ? local.tab : isTab(fromUrl) ? fromUrl : DEFAULT_CHAT_TAB;
  const conversationId = inMemory ? local.conversationId : searchParams.get(CONVERSATION_PARAM);

  const navigate = useCallback(
    (nextTab, { conversationId: nextConversation = null } = {}) => {
      const target = isTab(nextTab) ? nextTab : DEFAULT_CHAT_TAB;
      if (inMemory) {
        setLocal({ tab: target, conversationId: nextConversation });
        return;
      }
      const params = new URLSearchParams(searchParams.toString());
      if (target === DEFAULT_CHAT_TAB) params.delete(CHAT_TAB_PARAM);
      else params.set(CHAT_TAB_PARAM, target);
      if (nextConversation) params.set(CONVERSATION_PARAM, nextConversation);
      else params.delete(CONVERSATION_PARAM);
      const query = params.toString();
      router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [inMemory, router, pathname, searchParams],
  );

  return { tab, conversationId, navigate };
}

function CommunicationsWorkspace() {
  const { status, me, projectId } = useChat();
  const { tab, conversationId, navigate } = useChatLocation();
  const [collapsed, setCollapsed] = useState(false);
  const chatTab = tab === "Messages" || tab === "Channels";

  const openConversation = useCallback(
    (id, type) => navigate(type === "channel" ? "Channels" : "Messages", { conversationId: id }),
    [navigate],
  );

  const activity = useChatActivity({
    projectId,
    meId: me?.id || null,
    openConversationId: chatTab ? conversationId : null,
    onOpenConversation: openConversation,
  });
  useCallReminders(projectId, me?.id || null);

  const badges = useMemo(
    () => ({ Messages: activity.unreadDms, Channels: activity.unreadChannels, Inbox: activity.inboxUnread }),
    [activity.unreadDms, activity.unreadChannels, activity.inboxUnread],
  );

  if (status === "loading") {
    return (
      <div className="flex h-full items-center justify-center">
        <LogoLoading size={80} aria-label="Loading communications" />
      </div>
    );
  }

  if (status === "unavailable") {
    return (
      <EmptyState
        icon={MessagesSquare}
        title="Communications isn't available"
        description="Chat needs a database connection and a signed-in user. Check the Supabase configuration and try again."
        className="h-full"
      />
    );
  }

  const Screen = SCREENS[tab] ?? SCREENS[DEFAULT_CHAT_TAB];

  return (
    <CallProvider>
      <div className="flex h-full min-h-0 w-full overflow-hidden">
        <ChatRail
          activeTab={tab}
          onTabChange={(next) => navigate(next)}
          collapsed={collapsed}
          onToggleCollapsed={() => setCollapsed((c) => !c)}
          badges={badges}
        />
        <div className="min-w-0 flex-1 overflow-hidden">
          <Screen
            conversationId={chatTab ? conversationId : null}
            onNavigate={navigate}
            onOpenConversation={openConversation}
            onInboxChange={activity.refreshInbox}
          />
        </div>
      </div>
    </CallProvider>
  );
}

export function CommunicationsScreen() {
  const { project } = useProject();
  if (!project) return null;
  return (
    <ChatProvider key={project.id} projectId={project.id} projectName={project.name}>
      <CommunicationsWorkspace />
    </ChatProvider>
  );
}

export default CommunicationsScreen;
