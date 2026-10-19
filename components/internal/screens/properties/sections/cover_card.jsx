"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";

import { Button } from "@geiger/ui/button";
import { uploadPropertyImage } from "@/lib/supabase/property_storage";

// Cover photo: upload to storage under <ownerType>/<id>/ and persist the public
// URL in the cover_url column (or metadata.coverUrl when `meta`).
export function CoverCard({ item, config, onCommit, onCommitMeta, meta = false }) {
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  const url = meta ? item.metadata?.coverUrl || item.coverUrl : item.coverUrl;
  const write = (v) => (meta ? onCommitMeta({ coverUrl: v }) : onCommit({ coverUrl: v }));

  const onFile = async (file) => {
    if (!file) return;
    setBusy(true);
    const res = await uploadPropertyImage(config.key, item.id, file);
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
    if (!res?.url) {
      toast.error(`Couldn't upload ${file.name}.`);
      return;
    }
    if (await write(res.url)) toast.success("Cover photo updated.");
  };

  return (
    <div className="space-y-3">
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
      {url ? (
        <div className="overflow-hidden rounded-lg border border-border bg-surface-card">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={item.name || "Cover"} className="max-h-64 w-full object-cover" />
        </div>
      ) : (
        <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-border bg-surface-card text-sm text-text-tertiary">
          No cover photo yet
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          className="border-border bg-surface-card hover:bg-surface-hover"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
          {url ? "Replace Photo" : "Upload Photo"}
        </Button>
        {url ? (
          <Button variant="ghost" className="text-red-600 dark:text-red-300 hover:bg-red-500/10" onClick={() => write("")}>
            <Trash2 className="h-4 w-4" /> Remove
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export default CoverCard;
