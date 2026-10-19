"use client";

import React from "react";
import { Globe } from "lucide-react";
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@geiger/ui";
import { useChat } from "@/lib/chat/chat_context";
import { ExternalBadge } from "./external_badge";
import { UserAvatar } from "./user_avatar";

// Confirm before opening a DM with someone outside this project's team.
export function ExternalContactDialog({ person, onConfirm, onCancel }) {
  const { projectName } = useChat();
  return (
    <Dialog open={!!person} onOpenChange={(open) => !open && onCancel?.()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-full border border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400">
            <Globe className="h-5 w-5" />
          </div>
          <DialogTitle>Start an external conversation?</DialogTitle>
          <DialogDescription>
            {person?.name || "This person"} isn&apos;t on the{" "}
            <span className="font-medium text-foreground">{projectName || "project"}</span> team. They&apos;ll see this
            conversation, but nothing else in the workspace.
          </DialogDescription>
        </DialogHeader>
        {person ? (
          <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-card p-3">
            <UserAvatar person={person} size="md" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-sm font-semibold text-foreground">{person.name}</span>
                <ExternalBadge />
              </div>
              {person.email ? <p className="truncate text-xs text-text-secondary">{person.email}</p> : null}
            </div>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onConfirm}>Message anyway</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
