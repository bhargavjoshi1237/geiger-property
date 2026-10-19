"use client";

import React from "react";
import { MainScreenWrapper, SecondaryScreenWrapper } from "@/components/internal/shared/screen_wrappers";

// Scrolling page frame for the document-style Communications screens (Contacts,
// Calls, Files, Inbox, Settings). Communications renders full-bleed, so these
// restore the workspace's usual padding inside the pane.
export function ChatPage({ secondary = false, children }) {
  const Wrapper = secondary ? SecondaryScreenWrapper : MainScreenWrapper;
  return (
    <div className="h-full overflow-y-auto p-4 scrollbar-subtle md:p-8">
      <Wrapper>{children}</Wrapper>
    </div>
  );
}
