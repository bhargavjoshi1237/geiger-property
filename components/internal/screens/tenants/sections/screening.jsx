"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Gavel } from "lucide-react";

import { Button } from "@geiger/ui/button";
import { SectionCard } from "@/components/internal/shared/screen_kit";
import { RoleNote } from "@/components/internal/shared/role_gate";
import { FieldsForm } from "@/components/internal/screens/entity/fields_form";
import { usePermission } from "@/context/rbac-context";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { SCREENING_PERMISSIONS } from "@/lib/screening/permissions";
import { applicationsLayer } from "@/lib/supabase/applications";
import { TENANT_SCREENING_FIELDS, formatDate } from "../shared";

// Tenant Screening tab (RISK-02): the screening copied onto the tenant is read-only and needs report access; the decision of
// record lives on the tenant's application (RISK-06), linked here.

const READ_ONLY = TENANT_SCREENING_FIELDS.map((f) => ({
  ...f,
  type: "readonly",
  ...(f.type === "date" ? { format: (v) => (v ? formatDate(v) : "—") } : {}),
}));

export function TenantScreeningSection({ item }) {
  const canView = usePermission(SCREENING_PERMISSIONS.viewReports);
  const { openItemInTab } = useWorkspaceUrl();
  const [apps, setApps] = useState({ key: null, rows: [] });

  useEffect(() => {
    let alive = true;
    applicationsLayer.list({ tenantId: item.id }).then((rows) => alive && setApps({ key: item.id, rows: rows ?? [] }));
    return () => {
      alive = false;
    };
  }, [item.id]);

  const app = apps.key === item.id ? apps.rows[0] : null;

  return (
    <div className="space-y-5">
      <SectionCard
        title="Application decision"
        description="The screening decision of record is kept on the tenant's rental application."
        action={
          app ? (
            <Button variant="outline" className="border-border bg-surface-card hover:bg-surface-hover" onClick={() => openItemInTab(app.id, "Applications", "decision")}>
              <Gavel className="h-4 w-4" /> Open Decision <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          ) : null
        }
      >
        <p className="text-sm text-text-secondary">
          {app ? `${app.decision || "No decision recorded"}${app.metadata?.decidedOn ? ` · ${formatDate(app.metadata.decidedOn)}` : ""}` : "No application is linked to this tenant."}
        </p>
      </SectionCard>
      {canView ? (
        <SectionCard title="Recorded screening" description="Copied from screening when the tenant was added. Read-only: record results on the application.">
          <FieldsForm item={item} fields={READ_ONLY} onPatch={() => {}} onCommit={() => true} />
        </SectionCard>
      ) : (
        <RoleNote>Screening results are protected. Viewing them needs report access.</RoleNote>
      )}
    </div>
  );
}
