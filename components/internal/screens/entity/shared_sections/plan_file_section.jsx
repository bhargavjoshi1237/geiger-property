"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Ruler, Trash2, UploadCloud } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/internal/shared/screen_kit";
import { uploadFloorPlanImage } from "@/lib/supabase/property_storage";

// Floor Plans · Plan File — upload/replace the plan drawing (image or PDF). The
// public URL is committed to the working form's imageUrl (persisted immediately).
export function PlanFileSection({ item, onCommit }) {
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const onPick = async (e) => {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    setBusy(true);
    const uploaded = await uploadFloorPlanImage(item.id, file);
    setBusy(false);
    if (!uploaded?.url) {
      toast.error("Couldn't upload that file.");
      return;
    }
    onCommit({ imageUrl: uploaded.url });
    toast.success("Floor plan updated.");
  };

  const clear = () => {
    onCommit({ imageUrl: "" });
    toast.success("Floor plan removed.");
  };

  const isImage = item.imageUrl && !/\.pdf($|\?)/i.test(item.imageUrl);

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
            {busy ? "Uploading…" : item.imageUrl ? "Replace" : "Upload"}
          </Button>
          {item.imageUrl ? (
            <Button
              variant="ghost"
              size="icon"
              className="text-red-300 hover:bg-red-500/10"
              onClick={clear}
              aria-label="Remove floor plan"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </div>

      {item.imageUrl ? (
        <div className="overflow-hidden rounded-xl border border-border bg-surface-subtle">
          {isImage ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={item.imageUrl} alt={item.name} className="w-full object-contain" />
          ) : (
            <a
              href={item.imageUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 p-4 text-sm text-foreground hover:underline"
            >
              <Ruler className="h-4 w-4" /> View plan file
            </a>
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
