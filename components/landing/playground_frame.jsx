"use client";

import { useEffect, useRef, useState } from "react";

// The live playground card: the app's own /playground route in an iframe, so the workspace's portalled dialogs, sheets, menus and toasts open inside the card; it mounts near the viewport and shows a skeleton until loaded.
export function PlaygroundFrame({ src, title, className = "" }) {
  const holder = useRef(null);
  const [visible, setVisible] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const node = holder.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={holder}
      className={`relative h-[640px] overflow-hidden rounded-lg border border-border bg-background sm:h-[700px] lg:h-[860px] ${className}`}
    >
      {!loaded ? (
        <div aria-hidden className="absolute inset-0 flex animate-pulse">
          <div className="hidden w-60 shrink-0 border-r border-border bg-muted/40 md:block" />
          <div className="flex flex-1 flex-col gap-4 p-6">
            <div className="h-8 w-1/3 rounded-md bg-muted" />
            <div className="grid grid-cols-3 gap-4">
              <div className="h-24 rounded-lg bg-muted" />
              <div className="h-24 rounded-lg bg-muted" />
              <div className="h-24 rounded-lg bg-muted" />
            </div>
            <div className="flex-1 rounded-lg bg-muted/60" />
          </div>
        </div>
      ) : null}
      {visible ? (
        <iframe
          src={src}
          title={title}
          onLoad={() => setLoaded(true)}
          className={`block h-full w-full border-0 transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
        />
      ) : null}
    </div>
  );
}

export default PlaygroundFrame;
