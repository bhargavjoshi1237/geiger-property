"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FileText, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/internal/shared/screen_kit";
import { listTenantDocuments, createTenantDocument, softDeleteTenantDocument } from "@/lib/supabase/tenant_documents";

// Tenants · Documents section — lists the tenant's documents from the
// `property.tenant_documents` data layer (no static seed). Fetch on mount,
// optimistic add/remove, reconcile on failure.
export function DocumentsSection({ item }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");

  useEffect(() => {
    let alive = true;
    listTenantDocuments(item.id)
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
  }, [item.id]);

  const add = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Give the document a name.");
      return;
    }
    const optimistic = { id: crypto.randomUUID(), tenantId: item.id, name: trimmed, kind: "other", url: "", sizeBytes: 0 };
    setDocs((prev) => [optimistic, ...prev]);
    setName("");
    const created = await createTenantDocument(optimistic);
    if (created) {
      setDocs((prev) => prev.map((d) => (d.id === optimistic.id ? created : d)));
    } else {
      setDocs((prev) => prev.filter((d) => d.id !== optimistic.id));
      toast.error("Couldn't add the document.");
    }
  };

  const remove = async (doc) => {
    const prev = docs;
    setDocs((d) => d.filter((x) => x.id !== doc.id));
    const ok = await softDeleteTenantDocument(doc.id);
    if (!ok) {
      setDocs(prev);
      toast.error("Couldn't delete the document.");
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading documents…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New document name"
          className="bg-surface-card"
        />
        <Button
          className="bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={add}
        >
          <Plus className="h-4 w-4" /> Add
        </Button>
      </div>

      {docs.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface-subtle">
          <EmptyState
            icon={FileText}
            title="No documents yet"
            description="Upload or add tenant paperwork — leases, IDs, notices."
          />
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface-subtle">
          {docs.map((doc) => (
            <li
              key={doc.id}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">{doc.name}</p>
                <p className="text-xs text-text-secondary">
                  {doc.kind}
                  {doc.url ? " · linked" : ""}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-red-300 hover:bg-red-500/10"
                onClick={() => remove(doc)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default DocumentsSection;
