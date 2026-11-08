"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Ruler, Trash2, UploadCloud } from "lucide-react";

import { Button } from "@geiger/ui/button";
import { EmptyState } from "@/components/internal/shared/screen_kit";
import { StoredImage, StoredLink } from "@/components/internal/shared/stored_file";
import { fileRef as toFileRef, isPdf } from "@/lib/files/refs";
import { uploadPropertyFile } from "@/lib/supabase/property_storage";

// Floor Plans · Plan File — upload/replace the plan drawing (image or PDF). Its private { bucket, path } is committed to
// metadata.imageFile (persisted immediately); a legacy imageUrl still shows until it is replaced.
export function PlanFileSection({ item, onCommit }) {
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const meta = item.metadata || {};
  const drawing = toFileRef(meta.imageFile, item.imageUrl);

  const onPick = async (e) => {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    setBusy(true);
    const uploaded = await uploadPropertyFile("floor_plan", item.id, file);
    setBusy(false);
    if (!uploaded?.path) {
      toast.error("Couldn't upload that file.");
      return;
    }
    onCommit({ imageUrl: "", metadata: { ...meta, imageFile: { bucket: uploaded.bucket, path: uploaded.path, name: file.name } } });
    toast.success("Floor plan updated.");
  };

  const clear = () => {
    onCommit({ imageUrl: "", metadata: { ...meta, imageFile: null } });
    toast.success("Floor plan removed.");
  };

  const isImage = drawing && !isPdf(drawing);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-text-secondary">
          Upload the plan drawing (image or PDF).
        </p>
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={onPick}
          />
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
          >
            <UploadCloud className="h-4 w-4" />
            {busy ? "Uploading…" : drawing ? "Replace" : "Upload"}
          </Button>
          {drawing ? (
            <Button
              variant="ghost"
              size="icon"
              className="text-red-600 dark:text-red-300 hover:bg-red-500/10"
              onClick={clear}
              aria-label="Remove floor plan"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </div>

      {drawing ? (
        <div className="overflow-hidden rounded-xl border border-border bg-surface-subtle">
          {isImage ? (
            <StoredImage file={drawing} alt={item.name} className="w-full object-contain" fallback={<div className="h-40 w-full bg-surface-card" />} />
          ) : (
            <StoredLink file={drawing} className="flex items-center gap-2 p-4 text-sm text-foreground hover:underline">
              <Ruler className="h-4 w-4" /> View plan file
            </StoredLink>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface-subtle">
          <EmptyState
            icon={Ruler}
            title="No plan file yet"
            description="Upload a drawing to preview it here."
          />
        </div>
      )}
    </div>
  );
}

export default PlanFileSection;
