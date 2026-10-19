"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { mentionSegments } from "../chat_utils";

const URL_PATTERN = /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g;

// Plain text → text with clickable links.
function linkify(text, keyPrefix, linkClass) {
  const parts = text.split(URL_PATTERN);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <a key={`${keyPrefix}-${i}`} href={part} target="_blank" rel="noopener noreferrer" className={cn("underline underline-offset-2", linkClass)}>
        {part}
      </a>
    ) : (
      <React.Fragment key={`${keyPrefix}-${i}`}>{part}</React.Fragment>
    ),
  );
}

// Message body with @mentions highlighted and URLs linked; keeps line breaks.
export function MessageText({ text, mentions = [], onPrimary = false }) {
  const segments = mentionSegments(text, mentions);
  return (
    <span className="whitespace-pre-wrap break-words">
      {segments.map((seg, i) =>
        seg.mentionId ? (
          <span
            key={i}
            className={cn(
              "rounded px-0.5 font-medium",
              onPrimary
                ? "bg-primary-foreground/15"
                : seg.isMe
                  ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                  : "bg-sky-500/10 text-sky-700 dark:text-sky-300",
            )}
          >
            {seg.text}
          </span>
        ) : (
          <React.Fragment key={i}>{linkify(seg.text, i, onPrimary ? "text-primary-foreground" : "text-sky-600 dark:text-sky-400")}</React.Fragment>
        ),
      )}
    </span>
  );
}
