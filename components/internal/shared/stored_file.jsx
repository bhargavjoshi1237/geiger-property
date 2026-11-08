"use client";

import { useSignedUrl } from "@/lib/supabase/file_urls";

// A stored file's image or link (PLAT-01g): private files resolve to a signed URL, public and legacy ones to their URL.

export function StoredImage({ file, alt = "", fallback = null, ...props }) {
  const url = useSignedUrl(file);
  /* eslint-disable-next-line @next/next/no-img-element */
  return url ? <img src={url} alt={alt} {...props} /> : fallback;
}

export function StoredLink({ file, children, ...props }) {
  const url = useSignedUrl(file);
  return (
    <a href={url || undefined} target="_blank" rel="noreferrer" aria-disabled={!url || undefined} {...props}>
      {children}
    </a>
  );
}
