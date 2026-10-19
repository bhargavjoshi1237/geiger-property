"use client";

import React from "react";
import { Download, FileText, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { FILE_KIND_META, formatSize } from "../constants";

// A message's files: images as inline previews, everything else as a download card.
export function MessageAttachments({ attachments = [], isMe }) {
  if (!attachments.length) return null;
  const images = attachments.filter((a) => a.kind === "image");
  const docs = attachments.filter((a) => a.kind !== "image");

  return (
    <div className={cn("mt-1 flex w-fit max-w-full flex-col gap-1.5", isMe && "items-end")}>
      {images.length ? (
        <div className={cn("flex flex-wrap gap-1.5", isMe && "justify-end")}>
          {images.map((a) => {
            const img = a.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={a.url} alt={a.name || "Image"} className="h-40 w-40 rounded-xl border border-border object-cover" />
            ) : (
              <div className="h-40 w-40 rounded-xl border border-border bg-surface-card" />
            );
            return a.uploading ? (
              <div key={a.id} className="relative overflow-hidden rounded-xl">
                {img}
                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                  <Loader2 className="h-5 w-5 animate-spin text-white" />
                </div>
              </div>
            ) : (
              <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer" title={a.name} className="block overflow-hidden rounded-xl transition-opacity hover:opacity-90">
                {img}
              </a>
            );
          })}
        </div>
      ) : null}

      {docs.map((a) => {
        const Icon = FILE_KIND_META[a.kind]?.icon || FileText;
        return (
          <a
            key={a.id}
            href={a.uploading ? undefined : a.url}
            target="_blank"
            rel="noopener noreferrer"
            title={a.uploading ? "Uploading…" : a.name}
            className={cn(
              "flex w-64 max-w-full items-center gap-2.5 rounded-xl border border-border bg-surface-card px-3 py-2 transition-colors",
              a.uploading ? "cursor-default opacity-70" : "hover:bg-surface-hover",
            )}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-hover text-muted-foreground">
              <Icon className="h-[18px] w-[18px]" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-foreground">{a.name}</span>
              <span className="block text-xs text-text-secondary">{formatSize(a.size)}</span>
            </span>
            {a.uploading ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-text-secondary" />
            ) : (
              <Download className="h-4 w-4 shrink-0 text-text-secondary" />
            )}
          </a>
        );
      })}
    </div>
  );
}
