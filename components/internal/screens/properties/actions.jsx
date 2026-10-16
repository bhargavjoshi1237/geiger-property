"use client";

import { toast } from "sonner";
import { Archive, ArchiveRestore, DoorOpen, Power, PowerOff, RefreshCw, UserPlus } from "lucide-react";

import { listUnits, createUnit } from "@/lib/supabase/units";
import { updateProperty } from "@/lib/supabase/properties";
import { propertyOwnersLayer, listOwnersOfProperty } from "@/lib/supabase/property_owners";
import { UNIT_STATUS_OPTIONS, currency, todayISO } from "./constants";
import { buildingLoaderFor, loadOwnerOptions, loadUnitTypeOptions } from "./joins";
import { emitRefresh } from "./sections/refresh";

// Header actions shared by the Property / Building / Portfolio editors.

// Activate / Deactivate / Archive / Restore over the status column.
export function lifecycleActions({ singular, inactive = "Inactive", archive = true }) {
  const noun = singular.toLowerCase();
  const setStatus = (status, message) => async (ctx) => {
    if (await ctx.commit({ status })) toast.success(message);
  };
  return [
    {
      key: "activate",
      label: "Activate",
      icon: Power,
      showIf: (i) => !["Active", "Archived"].includes(i.status),
      run: setStatus("Active", `${singular} activated.`),
    },
    {
      key: "deactivate",
      label: "Deactivate",
      icon: PowerOff,
      showIf: (i) => i.status === "Active",
      run: setStatus(inactive, `${singular} deactivated.`),
    },
    ...(archive
      ? [
          {
            key: "restore",
            label: "Restore",
            icon: ArchiveRestore,
            showIf: (i) => i.status === "Archived",
            run: async (ctx) => {
              if (!(await ctx.commit({ status: "Active" }))) return;
              await ctx.commitMeta({ archivedAt: null, archiveReason: "" });
              toast.success(`${singular} restored.`);
            },
          },
          {
            key: "archive",
            label: "Archive",
            icon: Archive,
            danger: true,
            separatorBefore: true,
            showIf: (i) => i.status !== "Archived",
            wizard: {
              title: `Archive ${noun}`,
              description: `Archived ${noun === "property" ? "properties" : `${noun}s`} drop out of active rollups but keep their history. You can restore later.`,
              steps: [
                {
                  key: "confirm",
                  title: "Confirm",
                  fields: [{ key: "reason", label: "Reason", type: "textarea", placeholder: "e.g. Sold, management agreement ended…" }],
                },
              ],
              finishLabel: "Archive",
              logSummary: `Archived ${noun}`,
              finish: async (values, ctx) => {
                if (!(await ctx.commit({ status: "Archived" }))) return false;
                await ctx.commitMeta({ archivedAt: todayISO(), archiveReason: values.reason || "" });
                toast.success(`${singular} archived.`);
                return true;
              },
            },
          },
        ]
      : []),
  ];
}

// --- Add units wizard -----------------------------------------------------------

const unitLabels = (v) => {
  const count = Math.max(0, Math.min(200, Number(v.count) || 0));
  const start = Number(v.startNumber) || 1;
  const step = Number(v.increment) || 1;
  return Array.from({ length: count }, (_, i) => `${v.prefix || ""}${start + i * step}${v.suffix || ""}`);
};

function AddUnitsPreview({ values }) {
  const labels = unitLabels(values);
  const shown = labels.slice(0, 24);
  return (
    <div className="space-y-3 rounded-xl border border-border bg-surface-subtle p-4">
      <p className="text-sm text-foreground">
        Creating <span className="font-semibold">{labels.length}</span> unit{labels.length === 1 ? "" : "s"}
        {values.rent ? ` at ${currency(values.rent)}/mo` : ""}
        {values.bedrooms !== "" && values.bedrooms !== undefined ? ` · ${values.bedrooms} bd` : ""}
        {values.bathrooms ? ` / ${values.bathrooms} ba` : ""}
        {values.sqft ? ` · ${values.sqft} sqft` : ""}.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {shown.map((l) => (
          <span key={l} className="rounded-md border border-border bg-surface-card px-2 py-0.5 text-xs font-medium text-text-secondary">
            {l}
          </span>
        ))}
        {labels.length > shown.length ? (
          <span className="px-1 text-xs text-text-tertiary">+{labels.length - shown.length} more</span>
        ) : null}
      </div>
      <p className="text-xs text-text-tertiary">Labels that already exist on this property are skipped.</p>
    </div>
  );
}

// scope "property" (pick a building) or "building" (units land in this building).
export function makeAddUnitsAction({ scope }) {
  return (item) => {
    const propertyId = scope === "building" ? item.propertyId : item.id;
    return {
      key: "addUnits",
      label: "Add units",
      icon: DoorOpen,
      wizard: {
        title: "Add units",
        description: "Create a batch of units in one go. Fine-tune any of them later from the Units tab.",
        initial: () => ({
          count: 10,
          prefix: "",
          startNumber: 101,
          increment: 1,
          status: "Vacant",
          bedrooms: 1,
          bathrooms: 1,
          buildingId: scope === "building" ? item.id : "",
        }),
        steps: [
          {
            key: "numbering",
            title: "Numbering",
            description: "Units are labelled prefix + number + suffix, e.g. A-101, A-102…",
            fields: [
              { key: "count", label: "How many units", type: "number", required: true, min: 1, max: 200 },
              { key: "startNumber", label: "Start number", type: "number", required: true },
              { key: "prefix", label: "Label prefix", type: "text", placeholder: "e.g. A-" },
              { key: "suffix", label: "Label suffix", type: "text", placeholder: "Optional" },
              { key: "increment", label: "Increment by", type: "number", min: 1 },
              { key: "floor", label: "Floor", type: "text", placeholder: "e.g. 1" },
              ...(scope === "property"
                ? [{ key: "buildingId", label: "Building", type: "relation", load: buildingLoaderFor(propertyId), placeholder: "No building" }]
                : []),
            ],
            validate: (v) => {
              const n = Number(v.count);
              if (!Number.isFinite(n) || n < 1 || n > 200) return "Add between 1 and 200 units at a time.";
              return null;
            },
          },
          {
            key: "specs",
            title: "Specs",
            description: "Picking a unit type fills in its beds, baths, size and market rent.",
            fields: [
              { key: "unitTypeId", label: "Unit type", type: "relation", load: loadUnitTypeOptions, full: true },
              { key: "bedrooms", label: "Bedrooms", type: "number", min: 0 },
              { key: "bathrooms", label: "Bathrooms", type: "number", min: 0, step: 0.5 },
              { key: "sqft", label: "Square feet", type: "number", min: 0 },
              { key: "rent", label: "Market rent", type: "currency" },
              { key: "deposit", label: "Deposit", type: "currency" },
              { key: "status", label: "Initial status", type: "select", options: UNIT_STATUS_OPTIONS },
            ],
          },
          { key: "review", title: "Review", render: ({ values }) => <AddUnitsPreview values={values} /> },
        ],
        finishLabel: "Create units",
        logSummary: "Added units in bulk",
        finish: async (values, ctx) => {
          if (!propertyId) {
            toast.error("Link this building to a property first.");
            return false;
          }
          const existing = ((await listUnits()) || []).filter((u) => u.propertyId === propertyId);
          const taken = new Set(existing.map((u) => String(u.label).toLowerCase()));
          const labels = unitLabels(values).filter((l) => !taken.has(l.toLowerCase()));
          if (!labels.length) {
            toast.error("All of those unit labels already exist.");
            return false;
          }
          const spec = {
            propertyId,
            buildingId: values.buildingId || null,
            unitTypeId: values.unitTypeId || null,
            floor: values.floor || "",
            bedrooms: values.bedrooms,
            bathrooms: values.bathrooms,
            sqft: values.sqft,
            rent: values.rent,
            deposit: values.deposit,
            status: values.status || "Vacant",
          };
          let created = 0;
          for (let i = 0; i < labels.length; i += 10) {
            const batch = labels.slice(i, i + 10);
            const results = await Promise.all(batch.map((label) => createUnit({ ...spec, id: crypto.randomUUID(), label })));
            created += results.filter(Boolean).length;
          }
          if (!created) {
            toast.error("Couldn't create the units.");
            return false;
          }
          const total = existing.length + created;
          if (scope === "property") await ctx.commit({ units: total });
          else await updateProperty(propertyId, { units: total });
          emitRefresh("units", item.id);
          if (scope === "building") emitRefresh("units", propertyId);
          ctx.reload();
          const skipped = unitLabels(values).length - labels.length;
          toast.success(`Created ${created} unit${created === 1 ? "" : "s"}${skipped ? ` · skipped ${skipped} existing` : ""}.`);
          if (created < labels.length) toast.error(`${labels.length - created} units couldn't be saved.`);
          return true;
        },
      },
    };
  };
}

// --- Assign owner wizard ----------------------------------------------------------

export const OWNER_FIELDS = [
  { key: "ownerId", label: "Owner", type: "relation", load: loadOwnerOptions, displayKey: "ownerName", required: true, full: true },
  { key: "ownershipPct", label: "Ownership", type: "percent", required: true, min: 0, max: 100 },
  { key: "isPrimary", label: "Primary owner (receives statements)", type: "switch" },
  { key: "startsOn", label: "Owned since", type: "date" },
  { key: "endsOn", label: "Owned until", type: "date", hint: "Leave blank while they still own it." },
];

// Ensure only one primary owner per property.
export async function demoteOtherPrimaries(propertyId, keepId) {
  const rows = (await listOwnersOfProperty(propertyId)) || [];
  await Promise.all(
    rows.filter((r) => r.isPrimary && r.id !== keepId).map((r) => propertyOwnersLayer.update(r.id, { isPrimary: false })),
  );
}

export const assignOwnerAction = {
  key: "assignOwner",
  label: "Assign owner",
  icon: UserPlus,
  wizard: {
    title: "Assign owner",
    description: "Link an owner from your Owners directory and record their share of this property.",
    initial: () => ({ ownershipPct: 100, startsOn: todayISO(), isPrimary: true }),
    steps: [
      {
        key: "owner",
        title: "Owner",
        fields: OWNER_FIELDS,
        validate: (v) => {
          const p = Number(v.ownershipPct);
          if (!Number.isFinite(p) || p <= 0 || p > 100) return "Ownership must be between 0 and 100%.";
          if (v.endsOn && v.startsOn && v.endsOn < v.startsOn) return "The end date is before the start date.";
          return null;
        },
      },
    ],
    finishLabel: "Assign owner",
    logSummary: "Assigned an owner",
    finish: async (values, ctx) => {
      const row = await propertyOwnersLayer.create({
        id: crypto.randomUUID(),
        ownerId: values.ownerId,
        ownerName: values.ownerName || "",
        propertyId: ctx.item.id,
        propertyName: ctx.item.name,
        ownershipPct: Number(values.ownershipPct) || 0,
        startsOn: values.startsOn || null,
        endsOn: values.endsOn || null,
        isPrimary: Boolean(values.isPrimary),
      });
      if (!row) {
        toast.error("Couldn't assign that owner.");
        return false;
      }
      if (row.isPrimary) await demoteOtherPrimaries(ctx.item.id, row.id);
      emitRefresh("owners", ctx.item.id);
      toast.success(`${values.ownerName || "Owner"} assigned.`);
      ctx.navigate("owners");
      return true;
    },
  },
};

// Recount units from the Units data layer into the property's unit_count column.
export const syncUnitCountAction = {
  key: "syncUnits",
  label: "Sync unit count",
  icon: RefreshCw,
  run: async (ctx) => {
    const units = await listUnits();
    if (!units) {
      toast.error("Couldn't load units.");
      return;
    }
    const count = units.filter((u) => u.propertyId === ctx.item.id).length;
    if (await ctx.commit({ units: count })) toast.success(`Unit count set to ${count}.`);
  },
};
