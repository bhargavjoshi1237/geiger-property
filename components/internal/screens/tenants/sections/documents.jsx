"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FileText, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/internal/shared/screen_kit";
import { DocumentsSection } from "@/components/internal/screens/entity/shared_sections/documents_section";
import { listTenantDocuments, softDeleteTenantDocument } from "@/lib/supabase/tenant_documents";

// Tenant documents — real uploads through the shared polymorphic Documents
// section, plus any older paperwork records kept in `property.tenant_documents`.
export function TenantDocumentsSection(props) {
  const { item } = props;
  const [legacy, setLegacy] = useState([]);

  useEffect(() => {
    let alive = true;
    listTenantDocuments(item.id).then((rows) => alive && setLegacy(rows ?? []));
    return () => {
      alive = false;
    };
  }, [item.id]);

  const remove = async (doc) => {
    const prev = legacy;
    setLegacy((d) => d.filter((x) => x.id !== doc.id));
    if (!(await softDeleteTenantDocument(doc.id))) {
      setLegacy(prev);
      toast.error("Couldn't delete that record.");
    }
  };

  return (
    <div className="space-y-5">
      <DocumentsSection {...props} />
      {legacy.length ? (
        <SectionCard title="Earlier paperwork records" description="Logged before file uploads were available." bodyPadding={false}>
          <ul className="divide-y divide-border">
            {legacy.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <a href={d.url || undefined} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-3">
                  <FileText className="h-4 w-4 shrink-0 text-text-secondary" />
                  <span className="truncate text-sm font-medium text-foreground">{d.name}</span>
                  <span className="text-xs text-text-tertiary">{d.kind}</span>
                </a>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-red-600 dark:text-red-300 hover:bg-red-500/10"
                  onClick={() => remove(d)}
                  aria-label="Delete record"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}
    </div>
  );
}

export default TenantDocumentsSection;
