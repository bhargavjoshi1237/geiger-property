"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { FileText, Loader2, Lock, Trash2, UploadCloud } from "lucide-react";

import { Button } from "@geiger/ui/button";
import { Badge } from "@geiger/ui/badge";
import { EmptyState, ListLoading } from "@/components/internal/shared/screen_kit";
import { RoleNote } from "@/components/internal/shared/role_gate";
import {
  listDocuments,
  createDocument,
  softDeleteDocument,
} from "@/lib/supabase/documents";
import { uploadPropertyFile } from "@/lib/supabase/property_storage";
import { useSignedUrls } from "@/lib/supabase/file_urls";
import { usePermission } from "@/context/rbac-context";
import { SCREENING_PERMISSIONS } from "@/lib/screening/permissions";
import { isScreeningOwner } from "@/lib/screening/sensitive";
import { openScreeningFileApi, uploadScreeningFileApi } from "@/lib/screening/api";

function formatBytes(n) {
  const b = Number(n) || 0;
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

// Polymorphic per-owner Documents. Owner = config.key / item.id. Uploads to private storage, opens through signed URLs,
// optimistic add/remove, reconcile on failure. Screening owners (applications, RISK-02) store through /api/screening/files into
// the private screening bucket and open each file through a logged, 5-minute link that needs report access.
export function DocumentsSection({ item, config }) {
  const ownerType = config.key;
  const screening = isScreeningOwner(ownerType);
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const canDelete = usePermission("records.delete");
  const canOrder = usePermission(SCREENING_PERMISSIONS.order);
  const canViewReports = usePermission(SCREENING_PERMISSIONS.viewReports);
  const canUpload = !screening || canOrder || canViewReports;
  const fileRef = useRef(null);
  const urlOf = useSignedUrls(screening ? [] : docs);

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

  // Screening files: the server stores the object and its documents row together.
  const uploadPrivate = async (file) => {
    setBusy(true);
    const res = await uploadScreeningFileApi(item.id, file);
    setBusy(false);
    if (!res.ok || !res.document) {
      toast.error(res.error || "Couldn't upload that file.");
      return;
    }
    setDocs((prev) => [res.document, ...prev]);
  };

  const onPick = async (e) => {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    if (screening) return uploadPrivate(file);
    setBusy(true);
    const uploaded = await uploadPropertyFile(ownerType, item.id, file, {
      compress: false,
    });
    if (!uploaded?.path) {
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
      bucket: uploaded.bucket,
      storagePath: uploaded.path,
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

  // A screening file opens in a new tab through a signed link the server creates (and logs) on demand.
  const openPrivate = async (doc) => {
    const tab = window.open("", "_blank");
    if (tab) tab.opener = null;
    const res = await openScreeningFileApi(doc);
    if (res.ok && res.url) {
      if (tab) tab.location.replace(res.url);
      else window.open(res.url, "_blank", "noopener,noreferrer");
      return;
    }
    tab?.close();
    toast.error(res.error || "Couldn't open that file.");
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
    return <ListLoading label="Loading documents" className="py-10" />;
  }

  const fileLabel = (d) => (
    <>
      <FileText className="h-4 w-4 shrink-0 text-text-secondary" />
      <span className="min-w-0 text-left">
        <span className="block truncate text-sm font-medium text-foreground hover:underline">{d.name}</span>
        <span className="text-xs text-text-tertiary">{formatBytes(d.sizeBytes)}</span>
      </span>
    </>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-text-secondary">
          {screening
            ? "Private files for this application. Opening one needs report access, is logged, and its link lasts 5 minutes."
            : `Files and paperwork for this ${config.singular.toLowerCase()}.`}
        </p>
        <input ref={fileRef} type="file" className="hidden" accept={screening ? "image/*,application/pdf" : undefined} onChange={onPick} />
        {canUpload ? (
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />} {busy ? "Uploading…" : "Upload"}
          </Button>
        ) : null}
      </div>
      {screening && !canViewReports ? <RoleNote>These files are private. Opening them needs report access.</RoleNote> : null}

      {docs.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface-subtle">
          <EmptyState
            icon={FileText}
            title="No documents yet"
            description={canUpload ? "Upload a file to attach it here." : "No files are attached yet."}
          />
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface-subtle">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-3">
              {!screening ? (
                <a href={urlOf(d) || undefined} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-3">
                  {fileLabel(d)}
                </a>
              ) : canViewReports && d.storagePath ? (
                <button type="button" onClick={() => openPrivate(d)} className="flex min-w-0 items-center gap-3">
                  {fileLabel(d)}
                </button>
              ) : (
                <span className="flex min-w-0 items-center gap-3">{fileLabel(d)}</span>
              )}
              <div className="flex items-center gap-2">
                {screening ? (
                  <Badge variant="neutral" className="gap-1">
                    <Lock className="h-3 w-3" /> Private
                  </Badge>
                ) : (
                  <Badge variant="neutral">{d.kind}</Badge>
                )}
                {canDelete ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-red-600 dark:text-red-300 hover:bg-red-500/10"
                    onClick={() => remove(d)}
                    aria-label="Delete document"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default DocumentsSection;
