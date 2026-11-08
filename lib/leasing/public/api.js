"use client";

import { callApi } from "@/lib/messaging/api";

// Browser call that refreshes the public leasing site's cached pages after a listing or site change (LEAS-01).
// Fire-and-forget: the pages also refresh on their own within the 60s cache window.
export function refreshPublicSite(handles = []) {
  return callApi("/api/leasing/public/revalidate", { body: { handles } }).then((res) => {
    if (!res.ok) console.warn("[leasing.public.refresh]", res.error);
    return res;
  });
}

// The public URL of a path on this deployment (basePath included), for previews and copy-link.
export const publicUrl = (path) => `${typeof window === "undefined" ? "" : window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH || ""}${path}`;
