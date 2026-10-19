"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { listLegalResources } from "@/lib/supabase/legal_resources";

// Session cache of per-jurisdiction rows so flipping between states doesn't refetch; failed reads aren't cached.
export function useResourceLoader() {
  const cache = useRef(new Map());
  return useCallback((code) => {
    if (!cache.current.has(code)) {
      const pending = listLegalResources(code).then((rows) => {
        if (rows === null) cache.current.delete(code);
        return rows;
      });
      cache.current.set(code, pending);
    }
    return cache.current.get(code);
  }, []);
}

// One jurisdiction's resources through the loader; `loading` holds until rows for this exact code land.
export function useJurisdictionResources(code, load) {
  const [result, setResult] = useState({ code: null, rows: [] });

  useEffect(() => {
    if (!code) return undefined;
    let alive = true;
    load(code).then((rows) => {
      if (!alive) return;
      if (rows === null) toast.error("Couldn't load resources for this jurisdiction.");
      setResult({ code, rows: rows ?? [] });
    });
    return () => {
      alive = false;
    };
  }, [code, load]);

  const ready = result.code === code;
  return { rows: ready ? result.rows : [], loading: !ready };
}
