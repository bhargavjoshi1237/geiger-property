"use client";

import { useEffect, useState } from "react";
import { Home, Plus } from "lucide-react";

import { DataTable, EmptyState, ListLoading, SectionCard, StatusPill } from "@/components/internal/shared/screen_kit";
import { Button } from "@geiger/ui/button";
import { WizardDialog } from "@/components/internal/shared/wizard_dialog";
import { FieldsForm } from "@/components/internal/screens/entity/fields_form";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { listingsLayer } from "@/lib/supabase/listings";
import { logSystemActivity } from "@/lib/supabase/activity_log";
import { LISTING_STATUS_MAP } from "@/components/internal/screens/marketing/shared";
import { READY_OPTIONS, currency, formatDate } from "../shared";
import { createListingWizard } from "../actions";

// Unit · Availability & marketing — ready state, furnished / mid-term pricing,
// marketing copy, showing instructions, and this unit's listings.

const FIELDS = [
  { key: "availability", label: "Availability", type: "heading" },
  { key: "availableDate", label: "Available on", type: "date", meta: true },
  { key: "readyStatus", label: "Ready status", type: "select", options: READY_OPTIONS, meta: true },
  { key: "readyDate", label: "Ready since", type: "date", meta: true, showIf: (u) => u.readyStatus === "Ready" },
  { key: "removedFromVacancies", label: "Hide from vacancy list", type: "switch", meta: true },
  { key: "furnishing", label: "Furnished & mid-term", type: "heading", hint: "Flex stays for travel nurses, relocations and insurance housing." },
  { key: "furnished", label: "Furnished", type: "switch", meta: true },
  { key: "furnishedPremium", label: "Furnished premium", type: "currency", meta: true, suffix: "/mo", showIf: (u) => Boolean(u.furnished) },
  { key: "furnishingPackage", label: "Furnishing package", type: "text", meta: true, showIf: (u) => Boolean(u.furnished), placeholder: "e.g. Standard 1BR kit" },
  { key: "midTermEligible", label: "Mid-term eligible", type: "switch", meta: true },
  { key: "minStayMonths", label: "Minimum stay", type: "number", meta: true, suffix: "mo", min: 1, showIf: (u) => Boolean(u.midTermEligible) },
  { key: "monthlyFurnishedRate", label: "Monthly furnished rate", type: "currency", meta: true, showIf: (u) => Boolean(u.midTermEligible) },
  { key: "utilitiesBundled", label: "Utilities bundled in rate", type: "switch", meta: true, showIf: (u) => Boolean(u.midTermEligible) },
  { key: "copy", label: "Marketing copy", type: "heading" },
  { key: "marketingTitle", label: "Marketing title", type: "text", meta: true, full: true },
  { key: "marketingDescription", label: "Marketing description", type: "textarea", meta: true },
  { key: "virtualTourUrl", label: "3D / virtual tour", type: "url", meta: true },
  { key: "videoUrl", label: "Video URL", type: "url", meta: true },
  { key: "showings", label: "Showings", type: "heading" },
  { key: "selfShowing", label: "Self-guided tours allowed", type: "switch", meta: true },
  { key: "showingContact", label: "Showing contact", type: "text", meta: true },
  { key: "showingInstructions", label: "Showing instructions", type: "textarea", meta: true },
  { key: "noShowNotes", label: "Do-not-show / no-show notes", type: "textarea", meta: true },
];

export function UnitMarketingSection({ item, onPatch, onCommit, onCommitMeta }) {
  const { openItemInTab } = useWorkspaceUrl();
  const [listings, setListings] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    listingsLayer
      .list({ unitId: item.id })
      .then((r) => alive && setListings(r ?? []))
      .catch(() => alive && setListings([]));
    return () => {
      alive = false;
    };
  }, [item.id]);

  const finish = async (values) => {
    const row = await createListingWizard.finish(values, { item });
    if (!row) return false;
    setListings((prev) => [row, ...(prev || [])]);
    logSystemActivity("unit", item.id, "action", "Created a listing");
    return true;
  };

  const columns = [
    {
      key: "name",
      header: "Listing",
      render: (r) => (
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-foreground">{r.name}</span>
          <span className="text-xs text-text-secondary">Available {formatDate(r.availableDate)}</span>
        </div>
      ),
    },
    { key: "status", header: "Status", render: (r) => <StatusPill status={r.status} map={LISTING_STATUS_MAP} /> },
    {
      key: "rent",
      header: "Rent",
      align: "right",
      className: "text-right font-semibold tabular-nums text-foreground",
      render: (r) => currency(r.rent),
    },
  ];

  return (
    <div className="space-y-5">
      <SectionCard title="Availability & marketing">
        <FieldsForm item={item} fields={FIELDS} onPatch={onPatch} onCommit={onCommit} onCommitMeta={onCommitMeta} />
      </SectionCard>

      <SectionCard
        title="Listings"
        description="Listings advertising this unit. Open one to manage syndication."
        bodyPadding={false}
        action={
          <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> Create Listing
          </Button>
        }
      >
        {listings === null ? (
          <ListLoading label="Loading listings" className="rounded-none border-0 py-10" />
        ) : listings.length ? (
          <DataTable
            columns={columns}
            data={listings}
            getRowKey={(r) => r.id}
            onRowClick={(r) => openItemInTab(r.id, "Listings")}
            className="rounded-none border-0"
          />
        ) : (
          <EmptyState icon={Home} title="Not listed yet" description="Create a listing to start marketing this unit." />
        )}
      </SectionCard>

      <WizardDialog
        open={open}
        onOpenChange={setOpen}
        title={createListingWizard.title}
        description={createListingWizard.description}
        steps={createListingWizard.steps}
        initial={createListingWizard.initial(item)}
        finishLabel={createListingWizard.finishLabel}
        onFinish={finish}
      />
    </div>
  );
}

export default UnitMarketingSection;
