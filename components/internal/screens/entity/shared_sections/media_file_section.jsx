"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { ImageIcon, Trash2, UploadCloud } from "lucide-react";

import { Button } from "@geiger/ui/button";
import { EmptyState } from "@/components/internal/shared/screen_kit";
import { StoredImage } from "@/components/internal/shared/stored_file";
import { fileRef as toFileRef } from "@/lib/files/refs";
import { uploadPropertyFile } from "@/lib/supabase/property_storage";

// Media · File — upload/replace the asset itself. Persists its bucket and path (and size) to the working form immediately via onCommit;
// listing media goes to the public bucket. Owner scope is the media's current owner, or the shared library when unassigned.
export function MediaFileSection({ item, onCommit }) {
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const stored = toFileRef(item);

  const onPick = async (e) => {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    setBusy(true);
    const uploaded = await uploadPropertyFile(item.ownerType || "media", item.ownerId || item.id, file, {
      public: item.ownerType === "listing",
    });
    setBusy(false);
    if (!uploaded?.path) {
      toast.error("Couldn't upload that file.");
      return;
    }
    onCommit({ url: uploaded.url, thumbUrl: uploaded.url, bucket: uploaded.bucket, storagePath: uploaded.path, sizeBytes: uploaded.sizeBytes || 0 });
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
            {busy ? "Uploading…" : stored ? "Replace" : "Upload"}
          </Button>
          {stored ? (
            <Button
              variant="ghost"
              size="icon"
              className="text-red-600 dark:text-red-300 hover:bg-red-500/10"
              onClick={() => onCommit({ url: "", thumbUrl: "", bucket: null, storagePath: null })}
              aria-label="Remove file"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </div>

      {stored ? (
        <div className="overflow-hidden rounded-xl border border-border bg-surface-subtle">
          <StoredImage file={stored} alt={item.name} className="max-h-80 w-full object-contain" fallback={<div className="h-40 w-full bg-surface-card" />} />
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
