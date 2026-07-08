"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { FileText, Trash2, UploadCloud } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/internal/shared/screen_kit";
import {
  listDocuments,
  createDocument,
  softDeleteDocument,
} from "@/lib/supabase/documents";
import { uploadPropertyImage } from "@/lib/supabase/property_storage";

function formatBytes(n) {
  const b = Number(n) || 0;
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

// Polymorphic per-owner Documents. Owner = config.key / item.id. Real upload to
// storage, optimistic add/remove, reconcile on failure.
export function DocumentsSection({ item, config }) {
  const ownerType = config.key;
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    let alive = true;
    listDocuments(ownerType, item.id)
      .then((rows) => {
        if (!alive) return;
        setDocs(rows ?? []);
        setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setDocs([]);
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
    const uploaded = await uploadPropertyImage(ownerType, item.id, file, {
      compress: false,
    });
    if (!uploaded?.url) {
      setBusy(false);
      toast.error("Couldn't upload that file.");
      return;
    }
    const optimistic = {
      id: crypto.randomUUID(),
      ownerType,
      ownerId: item.id,
      kind: "other",
      name: file.name,
      url: uploaded.url,
      sizeBytes: uploaded.sizeBytes || file.size || 0,
    };
    setDocs((prev) => [optimistic, ...prev]);
    setBusy(false);
    const created = await createDocument(optimistic);
    if (created) {
      setDocs((prev) => prev.map((d) => (d.id === optimistic.id ? created : d)));
    } else {
      setDocs((prev) => prev.filter((d) => d.id !== optimistic.id));
      toast.error("Couldn't save that document.");
    }
  };

  const remove = async (doc) => {
    const prev = docs;
    setDocs((d) => d.filter((x) => x.id !== doc.id));
    const ok = await softDeleteDocument(doc.id);
    if (!ok) {
      setDocs(prev);
      toast.error("Couldn't delete that document.");
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading documents…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-text-secondary">
          Files and paperwork for this {config.singular.toLowerCase()}.
        </p>
        <input ref={fileRef} type="file" className="hidden" onChange={onPick} />
        <Button
          className="bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
        >
          <UploadCloud className="h-4 w-4" /> {busy ? "Uploading…" : "Upload"}
        </Button>
      </div>

      {docs.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface-subtle">
          <EmptyState
            icon={FileText}
            title="No documents yet"
            description="Upload a file to attach it here."
          />
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface-subtle">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <a
                href={d.url || "#"}
                target="_blank"
                rel="noreferrer"
                className="flex min-w-0 items-center gap-3"
              >
                <FileText className="h-4 w-4 shrink-0 text-text-secondary" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-foreground hover:underline">
                    {d.name}
                  </span>
                  <span className="text-xs text-text-tertiary">
                    {formatBytes(d.sizeBytes)}
                  </span>
                </span>
              </a>
              <div className="flex items-center gap-2">
                <Badge variant="neutral">{d.kind}</Badge>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-red-300 hover:bg-red-500/10"
                  onClick={() => remove(d)}
                  aria-label="Delete document"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default DocumentsSection;
