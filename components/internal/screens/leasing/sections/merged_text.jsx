"use client";

import { cn } from "@/lib/utils";

// Renders merged template parts: filled tokens tinted green, empty values amber,
// unknown placeholders red — so gaps are visible before a document is generated.
export function MergedText({ parts, className }) {
  return (
    <pre
      className={cn(
        "max-h-[560px] overflow-auto whitespace-pre-wrap font-mono text-[13px] leading-relaxed text-foreground",
        className,
      )}
    >
      {parts.map((p, i) =>
        p.token ? (
          <span
            key={i}
            title={`{{${p.token}}}`}
            className={cn(
              "rounded px-0.5",
              !p.known
                ? "bg-red-500/10 text-red-600 dark:text-red-400"
                : p.empty
                  ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                  : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
            )}
          >
            {p.text}
          </span>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </pre>
  );
}

export default MergedText;
