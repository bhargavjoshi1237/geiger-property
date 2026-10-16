"use client";

import { useEffect, useState } from "react";

// Tiny cross-section refresh signal: a header action that writes child rows
// (bulk units, owners, buildings) bumps the sections that show them.
export function emitRefresh(topic, id) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(`geiger:refresh:${topic}`, { detail: id }));
}

// A counter to use as a React `key`; bumps when `topic` fires for this id.
export function useRefreshKey(topic, id) {
  const [key, setKey] = useState(0);
  useEffect(() => {
    const name = `geiger:refresh:${topic}`;
    const onEvent = (e) => {
      if (!id || !e.detail || e.detail === id) setKey((k) => k + 1);
    };
    window.addEventListener(name, onEvent);
    return () => window.removeEventListener(name, onEvent);
  }, [topic, id]);
  return key;
}
