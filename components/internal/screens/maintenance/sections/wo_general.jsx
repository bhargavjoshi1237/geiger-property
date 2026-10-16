"use client";

import { useEffect, useMemo, useState } from "react";
import { ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { SectionCard } from "@/components/internal/shared/screen_kit";
import { FieldsForm } from "@/components/internal/screens/entity/sections/factories";
import { listProperties } from "@/lib/supabase/properties";
import { listUnits } from "@/lib/supabase/units";
import { leasesLayer } from "@/lib/supabase/leases";
import { inspectionsLayer } from "@/lib/supabase/inspections";
import { pmSchedulesLayer } from "@/lib/supabase/pm_schedules";
import { unitTurnsLayer } from "@/lib/supabase/unit_turns";
import { tenantOptions, vendorOptions } from "@/lib/supabase/options";
import {
  AREA_OPTIONS,
  CATEGORY_OPTIONS,
  CHANNEL_OPTIONS,
  CONTACT_METHOD_OPTIONS,
  DISPATCH_METHOD_OPTIONS,
  ENTRY_PERMISSION_OPTIONS,
  PRIORITY_OPTIONS,
  SOURCE_OPTIONS,
  TIME_WINDOW_OPTIONS,
  WEEKDAY_OPTIONS,
  WORK_KIND_OPTIONS,
  entryPermissionLabel,
  subcategoryOptions,
} from "../shared";
import { SOURCE_LABEL, usePropertyPolicies } from "./wo_shared";

// Work-order Details, Location, Entry & access and Assignment sections.

const meta = (field) => ({ ...field, meta: true });

// Relation loaders (module-level so pickers load once per mount).
const inspectionLoader = async () =>
  ((await inspectionsLayer.list()) ?? []).map((i) => ({
    value: i.id,
    label: [i.name, i.unit].filter(Boolean).join(" · ") || "Inspection",
    patch: {},
  }));
const scheduleLoader = async () =>
  ((await pmSchedulesLayer.list()) ?? []).map((s) => ({ value: s.id, label: s.name || "Schedule", patch: {} }));
const turnLoader = async () =>
  ((await unitTurnsLayer.list()) ?? []).map((t) => ({ value: t.id, label: t.name || "Unit turn", patch: {} }));
const leaseLoader = async () =>
  ((await leasesLayer.list()) ?? []).map((l) => ({ value: l.id, label: l.name || "Lease", patch: {} }));

const INSPECTION_FIELD = {
  key: "inspectionId",
  label: "From inspection",
  type: "relation",
  load: inspectionLoader,
  showIf: (i) => i.metadata?.source === "inspection" || Boolean(i.inspectionId),
};
const SCHEDULE_FIELD = {
  key: "pmScheduleId",
  label: "Preventive schedule",
  type: "relation",
  load: scheduleLoader,
  showIf: (i) => i.metadata?.source === "pm" || Boolean(i.pmScheduleId),
};
const TURN_FIELD = {
  key: "unitTurnId",
  label: "Unit turn",
  type: "relation",
  load: turnLoader,
  showIf: (i) => i.metadata?.source === "turn" || Boolean(i.unitTurnId),
};

// --- Details -----------------------------------------------------------------

export function DetailsSection({ item, onPatch, onCommit, onCommitMeta }) {
  const fields = [
    { key: "name", label: "Summary", type: "text", full: true, required: true },
    { key: "kind", label: "Type", type: "select", options: WORK_KIND_OPTIONS },
    { key: "priority", label: "Priority", type: "select", options: PRIORITY_OPTIONS },
    { key: "category", label: "Category", type: "select", options: CATEGORY_OPTIONS },
    meta({ key: "subcategory", label: "Subcategory", type: "select", options: subcategoryOptions(item.category) }),
    { key: "source-h", label: "Source", type: "heading", hint: "Where this job came from." },
    meta({ key: "source", label: "Source", type: "select", options: SOURCE_OPTIONS }),
    meta({ key: "reportedBy", label: "Reported by", type: "text", placeholder: "Name" }),
    meta({ key: "reportedOn", label: "Reported on", type: "date" }),
    meta({
      key: "channel",
      label: "Channel",
      type: "select",
      options: CHANNEL_OPTIONS,
      showIf: (i) => ["tenant", "owner"].includes(i.metadata?.source),
    }),
    INSPECTION_FIELD,
    SCHEDULE_FIELD,
    TURN_FIELD,
    { key: "timing-h", label: "Timing & flags", type: "heading" },
    meta({ key: "dueDate", label: "Due date", type: "date", hint: "Counts as overdue once passed." }),
    meta({ key: "slaHours", label: "Response SLA (hours)", type: "number", min: 0 }),
    meta({ key: "emergency", label: "Emergency", type: "switch", hint: "Life-safety or property-damage risk." }),
    meta({ key: "recurringIssue", label: "Recurring issue", type: "switch" }),
    meta({ key: "tenantCaused", label: "Tenant-caused damage", type: "switch", hint: "Flags the job for a chargeback." }),
    meta({ key: "description", label: "Description", type: "textarea", placeholder: "What's wrong, where, and since when…" }),
    meta({ key: "troubleshooting", label: "Troubleshooting so far", type: "textarea" }),
  ];
  return (
    <FieldsForm
      item={item}
      fields={fields}
      onPatch={onPatch}
      onCommit={onCommit}
      onCommitMeta={onCommitMeta}
    />
  );
}

// --- Location ------------------------------------------------------------------

function useLocationOptions(propertyId) {
  const [data, setData] = useState({ properties: [], units: [] });
  useEffect(() => {
    let alive = true;
    Promise.all([listProperties(), listUnits()]).then(([p, u]) => {
      if (alive) setData({ properties: p ?? [], units: u ?? [] });
    });
    return () => {
      alive = false;
    };
  }, []);
  return useMemo(() => {
    const byId = new Map(data.properties.map((p) => [p.id, p]));
    const unitLabel = (u) => {
      const p = byId.get(u.propertyId);
      return p?.name ? `${p.name} · ${u.label}` : u.label || "Unit";
    };
    return {
      propertyName: (id) => byId.get(id)?.name || "",
      // Choosing another property clears the unit (it belongs to the old one).
      properties: async () =>
        data.properties.map((p) => ({ value: p.id, label: p.name || "Property", patch: { propertyLabel: p.name || "", unitId: "" } })),
      // Units narrow to the chosen property; without one, picking a unit sets it.
      units: async () =>
        data.units
          .filter((u) => !propertyId || u.propertyId === propertyId)
          .map((u) => ({
            value: u.id,
            label: unitLabel(u),
            patch: {
              ...(propertyId ? {} : { propertyId: u.propertyId || "" }),
              propertyLabel: unitLabel(u),
              tenantId: u.tenantId || "",
              tenantName: u.occupantName || "",
            },
          })),
    };
  }, [data, propertyId]);
}

export function LocationSection({ item, onPatch, onCommit, onCommitMeta }) {
  const loc = useLocationOptions(item.propertyId);
  // Rebuild relation descriptors only when their option source changes.
  const relations = useMemo(
    () => [
      { key: "propertyId", label: "Property", type: "relation", load: loc.properties, displayKey: "propertyLabel" },
      { key: "unitId", label: "Unit", type: "relation", load: loc.units, displayKey: "propertyLabel" },
      { key: "tenantId", label: "Tenant", type: "relation", load: tenantOptions, displayKey: "tenantName" },
      { key: "leaseId", label: "Lease", type: "relation", load: leaseLoader },
    ],
    [loc],
  );
  const fields = [
    { key: "place-h", label: "Property & unit", type: "heading" },
    ...relations,
    { key: "where-h", label: "Where in the unit", type: "heading" },
    meta({ key: "area", label: "Area", type: "select", options: AREA_OPTIONS }),
    meta({ key: "room", label: "Room / spot", type: "text", placeholder: "e.g. Primary bath, under sink" }),
    meta({ key: "floor", label: "Floor / level", type: "text" }),
    meta({ key: "commonArea", label: "Common area", type: "switch", hint: "Not inside a resident's unit." }),
    { key: "asset-h", label: "Equipment", type: "heading", hint: "The appliance or system being serviced." },
    meta({ key: "asset", label: "Asset / appliance", type: "text", placeholder: "e.g. Water heater" }),
    meta({ key: "assetMake", label: "Make", type: "text" }),
    meta({ key: "assetModel", label: "Model", type: "text" }),
    meta({ key: "assetSerial", label: "Serial #", type: "text" }),
    meta({ key: "underWarranty", label: "Under warranty", type: "switch" }),
    meta({ key: "warrantyProvider", label: "Warranty provider", type: "text", showIf: (i) => Boolean(i.metadata?.underWarranty) }),
    meta({ key: "warrantyExpires", label: "Warranty expires", type: "date", showIf: (i) => Boolean(i.metadata?.underWarranty) }),
    meta({ key: "locationNotes", label: "Location notes", type: "textarea" }),
  ];
  // Keep the display label sensible when the unit is cleared.
  const commit = (partial) => {
    if (partial.unitId === "" && partial.propertyLabel === "") {
      return onCommit({ ...partial, propertyLabel: loc.propertyName(item.propertyId) });
    }
    return onCommit(partial);
  };
  return (
    <FieldsForm item={item} fields={fields} onPatch={onPatch} onCommit={commit} onCommitMeta={onCommitMeta} />
  );
}

// --- Entry & access ----------------------------------------------------------

const ENTRY_FIELDS = [
  meta({ key: "entryPermission", label: "Entry permission", type: "select", options: ENTRY_PERMISSION_OPTIONS }),
  meta({ key: "noticeHours", label: "Notice before entry (hours)", type: "number", min: 0 }),
  meta({ key: "contactMethod", label: "Contact the resident by", type: "select", options: CONTACT_METHOD_OPTIONS }),
  meta({ key: "contactPhone", label: "Resident phone", type: "phone" }),
  meta({ key: "preferredDays", label: "Preferred days", type: "multiselect", options: WEEKDAY_OPTIONS }),
  meta({ key: "preferredTimes", label: "Preferred times", type: "multiselect", options: TIME_WINDOW_OPTIONS }),
  { key: "keys-h", label: "Keys & codes", type: "heading" },
  meta({ key: "keyLocation", label: "Key location", type: "text", placeholder: "e.g. Office key box #14" }),
  meta({ key: "lockboxCode", label: "Lockbox code", type: "text" }),
  meta({ key: "alarmCode", label: "Alarm code", type: "text" }),
  meta({ key: "gateCode", label: "Gate / building code", type: "text" }),
  { key: "pets-h", label: "Pets", type: "heading" },
  meta({ key: "petsPresent", label: "Pets present", type: "switch" }),
  meta({ key: "petsSecured", label: "Pets will be secured", type: "switch", showIf: (i) => Boolean(i.metadata?.petsPresent) }),
  meta({ key: "petDetails", label: "Pet details", type: "text", placeholder: "e.g. Large dog, friendly", showIf: (i) => Boolean(i.metadata?.petsPresent) }),
  meta({ key: "accessNotes", label: "Access notes", type: "textarea" }),
];

export function EntrySection({ item, onPatch, onCommit, onCommitMeta }) {
  const policies = usePropertyPolicies(item.propertyId);
  const policy = policies?.entryPermission;
  const own = item.metadata?.entryPermission;
  // Unset → show the policy default as the current value.
  const view = own || !policy ? item : { ...item, metadata: { ...(item.metadata || {}), entryPermission: policy.value } };
  return (
    <div className="space-y-4">
      <SectionCard>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-4 w-4 text-text-secondary" />
            <div>
              <p className="text-sm font-medium text-foreground">
                Policy default: {policy ? entryPermissionLabel(policy.value) : "Loading…"}
              </p>
              <p className="text-xs text-text-secondary">
                From the {policy ? SOURCE_LABEL[policy.source] : "maintenance policy"} — change it under Settings → Fees & Policies or the property&apos;s Policies tab.
              </p>
            </div>
          </div>
          <Badge variant={own ? "info" : "outline"}>{own ? "Set on this work order" : "Using policy default"}</Badge>
        </div>
      </SectionCard>
      <FieldsForm item={view} fields={ENTRY_FIELDS} onPatch={onPatch} onCommit={onCommit} onCommitMeta={onCommitMeta} />
    </div>
  );
}

// --- Assignment ----------------------------------------------------------------

const ASSIGNMENT_FIELDS = [
  { key: "vendorId", label: "Vendor", type: "relation", load: vendorOptions, displayKey: "vendorName" },
  { key: "technician", label: "Technician", type: "text" },
  meta({ key: "technicianPhone", label: "Technician phone", type: "phone" }),
  meta({ key: "crew", label: "Crew", type: "text" }),
  meta({ key: "coordinator", label: "Internal coordinator", type: "text", placeholder: "Staff member owning this job" }),
  meta({ key: "dispatchMethod", label: "Dispatched via", type: "select", options: DISPATCH_METHOD_OPTIONS }),
  meta({ key: "dispatchedOn", label: "Dispatched on", type: "date" }),
  meta({ key: "vendorAccepted", label: "Vendor accepted", type: "switch" }),
  { key: "sched-h", label: "Schedule", type: "heading" },
  { key: "scheduledDate", label: "Scheduled date", type: "date" },
  meta({ key: "windowStart", label: "Window start", type: "time" }),
  meta({ key: "windowEnd", label: "Window end", type: "time" }),
  meta({ key: "eta", label: "ETA", type: "time" }),
  meta({ key: "estimatedHours", label: "Estimated hours", type: "number", min: 0, step: 0.25 }),
  { key: "terms-h", label: "Terms", type: "heading" },
  meta({ key: "poNumber", label: "PO number", type: "text" }),
  meta({ key: "notToExceed", label: "Not-to-exceed", type: "currency", hint: "Vendor must call before going over." }),
  meta({ key: "assignmentNotes", label: "Instructions for the vendor", type: "textarea" }),
];

export function AssignmentSection({ item, onPatch, onCommit, onCommitMeta }) {
  return (
    <FieldsForm
      item={item}
      fields={ASSIGNMENT_FIELDS}
      onPatch={onPatch}
      onCommit={onCommit}
      onCommitMeta={onCommitMeta}
    />
  );
}
