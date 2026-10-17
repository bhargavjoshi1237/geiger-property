"use client";

import { Ban, ShieldOff } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/internal/shared/screen_kit";
import { FieldsForm } from "@/components/internal/screens/entity/fields_form";
import { TENANT_RESTRICTION_FIELDS, activeRestrictions, formatDate } from "../shared";

// Payment restrictions — what this tenant may not pay with, why, and who set it.
export function PaymentRestrictionsSection({ item, onPatch, onCommit, onCommitMeta, runAction }) {
  const active = activeRestrictions(item);
  const m = item.metadata || {};

  return (
    <div className="space-y-4">
      <SectionCard
        title={active.length ? "Restrictions in effect" : "No restrictions"}
        description={
          active.length
            ? [m.restrictionSetBy && `Set by ${m.restrictionSetBy}`, m.restrictionSetOn && `on ${formatDate(m.restrictionSetOn)}`]
                .filter(Boolean)
                .join(" ") || "Applied to rent collection and the resident portal."
            : "This tenant can pay with any method you accept."
        }
        action={
          <div className="flex gap-2">
            {active.length ? (
              <Button variant="outline" className="border-border bg-surface-card hover:bg-surface-hover" onClick={() => runAction("clearRestrictions")}>
                <ShieldOff className="h-4 w-4" /> Clear
              </Button>
            ) : null}
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => runAction("recordRestriction")}>
              <Ban className="h-4 w-4" /> Record Restriction
            </Button>
          </div>
        }
      >
        {active.length ? (
          <div className="flex flex-wrap gap-1.5">
            {active.map((r) => (
              <Badge key={r.key} variant="danger">
                {r.label}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-sm text-text-secondary">Use “Record restriction” after returned payments or a court order.</p>
        )}
        {m.restrictionReason && active.length ? <p className="mt-3 text-sm text-text-secondary">{m.restrictionReason}</p> : null}
      </SectionCard>

      <SectionCard title="Details">
        <FieldsForm
          item={item}
          fields={TENANT_RESTRICTION_FIELDS}
          onPatch={onPatch}
          onCommit={onCommit}
          onCommitMeta={onCommitMeta}
        />
      </SectionCard>
    </div>
  );
}

export default PaymentRestrictionsSection;
