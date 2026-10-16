"use client";

import React from "react";

import { getScreen } from "@/components/internal/screens/registry";
import { ComingSoonScreen } from "@/components/internal/screens/coming_soon";

// The resolved screen, or the Coming Soon fallback the workspace uses for a nav
// item without one. Screen arrives as a prop so the registry lookup stays in the
// parent render, mirroring ScreenArea in the workspace shell.
function ScreenSlot({ Screen, activeItem }) {
  if (!Screen) {
    return <ComingSoonScreen title={activeItem.title} icon={activeItem.icon} />;
  }
  return <Screen />;
}

// Resolves a sidebar tab to its real screen, exactly like the workspace shell
// (app/project/[projectId]/[[...rest]]/page.js). Its own module so the registry —
// which statically imports every screen — loads after the landing page, not with it.
export default function PlaygroundScreenHost({ activeItem }) {
  return <ScreenSlot Screen={getScreen(activeItem.title)} activeItem={activeItem} />;
}
