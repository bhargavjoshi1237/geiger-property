import { Hash, Inbox, MessageSquare, Paperclip, Phone, Settings, Users } from "lucide-react";

// The Communications screen's own rail. Titles key SCREENS in communications.jsx.
export const CHAT_NAV = [
  { title: "Messages", icon: MessageSquare },
  { title: "Channels", icon: Hash },
  { title: "Contacts", icon: Users },
  { title: "Calls", icon: Phone },
  { title: "Files", icon: Paperclip },
  { title: "Inbox", icon: Inbox },
  { title: "Settings", icon: Settings },
];

export const DEFAULT_CHAT_TAB = CHAT_NAV[0].title;

// The rail tab and the open conversation live in the query string
// (?chat=Channels&conversation=<id>) so a refresh or a shared link reopens them.
export const CHAT_TAB_PARAM = "chat";
export const CONVERSATION_PARAM = "conversation";
