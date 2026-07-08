"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { ImageIcon, Trash2, UploadCloud } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/internal/shared/screen_kit";
import { uploadPropertyImage } from "@/lib/supabase/property_storage";

// Media · File — upload/replace the asset itself. Persists the public URL (and
// size) to the working form immediately via onCommit. Owner scope is the media's
// current owner, or the shared library when unassigned.
export function MediaFileSection({ item, onCommit }) {
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const onPick = async (e) => {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    setBusy(true);
    const uploaded = await uploadPropertyImage(
      item.ownerType || "media",
      item.ownerId || item.id,
      file,
    );
    setBusy(false);
    if (!uploaded?.url) {
      toast.error("Couldn't upload that file.");
      return;
    }
    onCommit({ url: uploaded.url, thumbUrl: uploaded.url, sizeBytes: uploaded.sizeBytes || 0 });
    toast.success("Media updated.");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-text-secondary">The image or file for this asset.</p>
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onPick}
          />
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
          >
            <UploadCloud className="h-4 w-4" />
            {busy ? "Uploading…" : item.url ? "Replace" : "Upload"}
          </Button>
          {item.url ? (
            <Button
              variant="ghost"
              size="icon"
              className="text-red-300 hover:bg-red-500/10"
              onClick={() => onCommit({ url: "", thumbUrl: "" })}
              aria-label="Remove file"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </div>

      {item.url ? (
        <div className="overflow-hidden rounded-xl border border-border bg-surface-subtle">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.url} alt={item.name} className="max-h-80 w-full object-contain" />
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface-subtle">
          <EmptyState
            icon={ImageIcon}
            title="No file yet"
            description="Upload an image to preview it here."
          />
        </div>
      )}
    </div>
  );
}

export default MediaFileSection;
