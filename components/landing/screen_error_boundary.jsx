"use client";

import React from "react";
import { TriangleAlert } from "lucide-react";

import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ScreenHeader } from "@/components/internal/shared/screen_kit";

// The playground runs the real workspace screens on a public page, so one screen
// tripping over the sample data must not take the landing page down with it.
// Give it a `key` (the tab title) so switching tabs resets it.
export class ScreenErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error("[playground] screen failed to render", error);
  }

  render() {
    if (!this.state.failed) return this.props.children;

    const title = this.props.title || "This screen";
    return (
      <MainScreenWrapper>
        <ScreenHeader
          title={title}
          description="This screen needs a signed-in workspace to render fully."
        />
        <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border bg-background px-6 py-20 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-surface-subtle text-muted-foreground">
            <TriangleAlert className="h-6 w-6" />
          </div>
          <div className="space-y-1.5">
            <p className="text-base font-semibold text-foreground">
              {title} couldn&apos;t load in the playground
            </p>
            <p className="mx-auto max-w-md text-sm text-text-secondary">
              Pick another screen from the sidebar, or open the workspace to see
              this one with your own data.
            </p>
          </div>
        </div>
      </MainScreenWrapper>
    );
  }
}

export default ScreenErrorBoundary;
