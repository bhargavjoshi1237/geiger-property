"use client";

import { Building2, SlidersHorizontal } from "lucide-react";

import { Badge } from "@geiger/ui/badge";
import { Button } from "@geiger/ui/button";
import { ListLoading, SectionCard } from "@/components/internal/shared/screen_kit";
import { useRbac } from "@/context/rbac-context";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { criteriaHash, describeScreeningCriteria } from "@/lib/screening/criteria_policy";
import { useLoad } from "./common";
import { loadScreeningCriteria } from "../flows";

// Screening criteria per property (RISK-04): the Applications header link, the effective-criteria card and the listing's criteria tab.

const SETTINGS_TAB = "Fees & Policies";
const SOURCE = {
  company: { label: "Company", variant: "outline" },
  property: { label: "Property", variant: "info" },
};

// Header button: Settings → Fees & Policies, scrolled to its Screening criteria card (for roles that can open that page).
export function ScreeningCriteriaLink() {
  const { openTabSection } = useWorkspaceUrl();
  const { canView } = useRbac();
  if (!canView(SETTINGS_TAB)) return null;
  return (
    <Button variant="outline" className="border-border bg-surface-card hover:bg-surface-hover" onClick={() => openTabSection(SETTINGS_TAB, "screening")}>
      <SlidersHorizontal className="h-4 w-4" /> Screening Criteria
    </Button>
  );
}

// Criteria + version for a record (application or listing), keyed on what picks its property.
export function useScreeningCriteria(record) {
  return useLoad(async () => {
    const criteria = await loadScreeningCriteria(record);
    return { ...criteria, hash: await criteriaHash(criteria.resolved) };
  }, [record?.id, record?.propertyId, record?.unitId, record?.listingId]);
}

// The criteria in force, each with where it comes from, plus the published text and links to edit them.
export function ScreeningCriteriaCard({ criteria, title = "Screening criteria", description }) {
  const { openTabSection, openItemInTab } = useWorkspaceUrl();
  if (criteria === undefined) return <ListLoading label="Loading screening criteria" className="py-8" />;
  if (!criteria) return null;
  const rows = describeScreeningCriteria(criteria.resolved);
  const published = criteria.values.publishedCriteriaText;
  const where = criteria.propertyName ? `In force at ${criteria.propertyName}` : "Company criteria (no property linked)";
  return (
    <SectionCard
      title={title}
      description={description || `${where}. Company values apply unless the property overrides them.`}
      action={
        criteria.hash ? (
          <Badge variant="outline" className="font-mono" title="Criteria version. Each decision records the version it used.">
            v·{criteria.hash.slice(0, 8)}
          </Badge>
        ) : null
      }
    >
      <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => (
          <div key={r.key} className="min-w-0">
            <dt className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">{r.label}</dt>
            <dd className="mt-1 flex min-w-0 items-center gap-2 text-sm text-foreground">
              <span className="truncate">{r.value}</span>
              {r.source ? <Badge variant={SOURCE[r.source]?.variant || "outline"}>{SOURCE[r.source]?.label || r.source}</Badge> : null}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-5 border-t border-border pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">Published criteria</p>
          {published ? <Badge variant={SOURCE[criteria.resolved.publishedCriteriaText.source]?.variant}>{SOURCE[criteria.resolved.publishedCriteriaText.source]?.label}</Badge> : null}
        </div>
        {published ? (
          <p className="mt-1.5 whitespace-pre-wrap text-sm text-foreground">{published}</p>
        ) : (
          <p className="mt-1.5 text-sm text-text-secondary">Not written yet. Applicants should see written criteria before they pay a fee.</p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" className="text-text-secondary hover:bg-surface-hover hover:text-foreground" onClick={() => openTabSection(SETTINGS_TAB, "screening")}>
            <SlidersHorizontal className="h-4 w-4" /> Company criteria
          </Button>
          {criteria.propertyId ? (
            <Button variant="ghost" size="sm" className="text-text-secondary hover:bg-surface-hover hover:text-foreground" onClick={() => openItemInTab(criteria.propertyId, "Properties", "screeningPolicy")}>
              <Building2 className="h-4 w-4" /> Property overrides
            </Button>
          ) : null}
        </div>
      </div>
    </SectionCard>
  );
}

// Listing tab: the criteria applicants of this listing are held to, and the text they see before paying a fee.
export function ListingCriteriaSection({ item }) {
  const criteria = useScreeningCriteria(item);
  return (
    <ScreeningCriteriaCard
      criteria={criteria}
      description={
        criteria?.propertyName
          ? `Applicants for this listing are screened on ${criteria.propertyName}'s criteria and see the published text before they pay a fee.`
          : "Link a property to apply its overrides. Applicants see the published text before they pay a fee."
      }
    />
  );
}
