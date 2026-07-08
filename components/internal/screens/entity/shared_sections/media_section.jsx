"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ImageIcon, Star, Trash2, UploadCloud } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/internal/shared/screen_kit";
import { cn } from "@/lib/utils";
import {
  listMedia,
  createMedia,
  softDeleteMedia,
  setCoverMedia,
} from "@/lib/supabase/media";
import { uploadPropertyImage } from "@/lib/supabase/property_storage";

// Polymorphic per-owner photo/media gallery. Upload compresses images to <500KB,
// persists the public URL, supports set-as-cover and delete. Optimistic.
export function MediaSection({ item, config }) {
  const ownerType = config.key;
  const [media, setMedia] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    let alive = true;
    listMedia(ownerType, item.id)
      .then((rows) => {
        if (!alive) return;
        setMedia(rows ?? []);
        setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setMedia([]);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [ownerType, item.id]);

  const onPick = async (e) => {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    setBusy(true);
    const uploaded = await uploadPropertyImage(ownerType, item.id, file);
    if (!uploaded?.url) {
      setBusy(false);
      toast.error("Couldn't upload that image.");
      return;
    }
    const optimistic = {
      id: crypto.randomUUID(),
      ownerType,
      ownerId: item.id,
      kind: "photo",
      name: file.name,
      url: uploaded.url,
      isCover: media.length === 0,
      sizeBytes: uploaded.sizeBytes || 0,
      status: "Published",
    };
    setMedia((prev) => [...prev, optimistic]);
    setBusy(false);
    const created = await createMedia(optimistic);
    if (created) {
      setMedia((prev) => prev.map((m) => (m.id === optimistic.id ? created : m)));
    } else {
      setMedia((prev) => prev.filter((m) => m.id !== optimistic.id));
      toast.error("Couldn't save that image.");
    }
  };

  const makeCover = async (m) => {
    setMedia((prev) => prev.map((x) => ({ ...x, isCover: x.id === m.id })));
    const ok = await setCoverMedia(ownerType, item.id, m.id);
    if (!ok) toast.error("Couldn't set the cover.");
  };

  const remove = async (m) => {
    const prev = media;
    setMedia((list) => list.filter((x) => x.id !== m.id));
    const ok = await softDeleteMedia(m.id);
    if (!ok) {
      setMedia(prev);
      toast.error("Couldn't delete that image.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-text-secondary">
          Photos and media for this {config.singular.toLowerCase()}.
        </p>
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
          <UploadCloud className="h-4 w-4" /> {busy ? "Uploading…" : "Upload photo"}
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading media…</p>
      ) : media.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface-subtle">
          <EmptyState
            icon={ImageIcon}
            title="No media yet"
            description="Upload photos to build this gallery."
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {media.map((m) => (
            <div
              key={m.id}
              className="group relative overflow-hidden rounded-xl border border-border bg-surface-subtle"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={m.url}
                alt={m.name || "Media"}
                className="aspect-video w-full object-cover"
              />
              {m.isCover ? (
                <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
                  <Star className="h-3 w-3 fill-current" /> Cover
                </span>
              ) : null}
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-end gap-1 bg-gradient-to-t from-black/70 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className={cn(
                    "text-white hover:bg-white/15",
                    m.isCover && "text-amber-300",
                  )}
                  onClick={() => makeCover(m)}
                  aria-label="Set as cover"
                >
                  <Star className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-red-300 hover:bg-red-500/20"
                  onClick={() => remove(m)}
                  aria-label="Delete image"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default MediaSection;
