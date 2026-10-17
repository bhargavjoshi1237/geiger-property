import { toast } from "sonner";
import {
  BadgeDollarSign,
  CheckCircle2,
  DoorOpen,
  ClipboardCheck,
  ClipboardPen,
  Home,
  PowerOff,
  Power,
  Ban,
  RefreshCw,
  Wand2,
} from "lucide-react";

import { unitTurnsLayer } from "@/lib/supabase/unit_turns";
import { listingsLayer } from "@/lib/supabase/listings";
import { workOrdersLayer } from "@/lib/supabase/work_orders";
import { inspectionsLayer } from "@/lib/supabase/inspections";
import { getUnitType } from "@/lib/supabase/unit_types";
import {
  CATEGORY_OPTIONS,
  PRIORITY_OPTIONS,
} from "@/components/internal/screens/maintenance/shared";
import { INSPECTION_TYPE_OPTIONS } from "@/components/internal/screens/leasing/shared";
import {
  DOWN_REASONS,
  NON_REVENUE_TYPES,
  READY_OPTIONS,
  RENT_REASONS,
  currency,
  todayISO,
} from "./shared";

// Header actions + wizards for the Unit editor. Each finisher persists through
// ctx.commit (columns) / ctx.commitMeta (metadata bag) or another area's layer.

const unitName = (u) => (u.propertyName ? `${u.propertyName} · ${u.label}` : u.label || "Unit");

// "Create listing" — shared by the header action and the Marketing section button.
export const createListingWizard = {
  title: "Create listing",
  description: "Publish this unit as a listing. It starts in the Listings area, ready to syndicate.",
  finishLabel: "Create Listing",
  logSummary: "Created a listing",
  initial: (u) => ({
    name: `${unitName(u)} — ${u.bedrooms ? `${u.bedrooms} bd` : "Studio"}`,
    rent: Number(u.rent) || 0,
    availableDate: u.availableDate || todayISO(),
    status: "Draft",
    headline: u.marketingTitle || "",
  }),
  steps: [
    {
      key: "listing",
      title: "Listing",
      fields: [
        { key: "name", label: "Listing title", type: "text", required: true, full: true },
        { key: "headline", label: "Headline", type: "text", full: true, placeholder: "e.g. Sun-filled corner 2BR" },
        { key: "rent", label: "Advertised rent", type: "currency", required: true },
        { key: "availableDate", label: "Available", type: "date" },
        {
          key: "status",
          label: "Status",
          type: "select",
          options: [
            { value: "Draft", label: "Draft" },
            { value: "Active", label: "Active" },
          ],
        },
      ],
    },
  ],
  finish: async (v, ctx) => {
    const u = ctx.item;
    const row = await listingsLayer.create({
      id: crypto.randomUUID(),
      name: v.name.trim(),
      propertyId: u.propertyId || "",
      propertyName: u.propertyName || "",
      unitId: u.id,
      unit: u.label,
      rent: Number(v.rent) || 0,
      availableDate: v.availableDate || "",
      bedrooms: Number(u.bedrooms) || 0,
      bathrooms: Number(u.bathrooms) || 0,
      status: v.status || "Draft",
      metadata: {
        headline: v.headline || "",
        description: u.marketingDescription || "",
        furnished: Boolean(u.furnished),
        midTermEligible: Boolean(u.midTermEligible),
      },
    });
    if (!row) {
      toast.error("Couldn't create the listing.");
      return false;
    }
    toast.success("Listing created.");
    return row;
  },
};

export const unitActions = [
  {
    key: "changeRent",
    label: "Change market rent",
    icon: BadgeDollarSign,
    wizard: {
      title: "Change market rent",
      description: "Record a new market rent. The change is kept in this unit's rent history.",
      finishLabel: "Update Rent",
      logSummary: "Changed market rent",
      initial: (u) => ({ amount: Number(u.rent) || 0, effectiveDate: todayISO(), reason: "Market adjustment" }),
      steps: [
        {
          key: "rent",
          title: "New rent",
          fields: [
            { key: "amount", label: "New market rent", type: "currency", required: true },
            { key: "effectiveDate", label: "Effective", type: "date", required: true },
            { key: "reason", label: "Reason", type: "select", options: RENT_REASONS },
            { key: "notes", label: "Notes", type: "textarea" },
          ],
          validate: (v) => (Number(v.amount) > 0 ? null : "Enter a rent above zero."),
        },
      ],
      finish: async (v, ctx) => {
        const previous = Number(ctx.item.rent) || 0;
        const amount = Number(v.amount) || 0;
        const entry = {
          id: crypto.randomUUID(),
          effectiveDate: v.effectiveDate,
          amount,
          previous,
          reason: v.reason || "",
          notes: v.notes || "",
          recordedAt: new Date().toISOString(),
        };
        const history = Array.isArray(ctx.item.rentHistory) ? ctx.item.rentHistory : [];
        if (!(await ctx.commit({ rent: amount }))) return false;
        await ctx.commitMeta({ rentHistory: [...history, entry] });
        toast.success(`Market rent set to ${currency(amount)}.`);
        return true;
      },
    },
  },
  {
    key: "markReady",
    label: "Mark ready",
    icon: CheckCircle2,
    showIf: (u) =>
      !["Occupied", "Notice", "Non-revenue"].includes(u.status) && !(u.status === "Vacant" && u.readyStatus === "Ready"),
    run: async (ctx) => {
      if (!(await ctx.commit({ status: "Vacant" }))) return;
      await ctx.commitMeta({ readyStatus: "Ready", readyDate: todayISO() });
      ctx.log("Marked unit ready");
      toast.success("Unit marked ready.");
    },
  },
  {
    key: "markVacant",
    label: "Mark vacant",
    icon: DoorOpen,
    showIf: (u) => ["Occupied", "Notice", "Draft"].includes(u.status),
    wizard: {
      title: "Mark vacant",
      description: "Clears the current occupant from this unit. Ended leases stay in the occupancy history.",
      finishLabel: "Mark Vacant",
      logSummary: "Marked unit vacant",
      initial: () => ({ vacatedOn: todayISO(), readyStatus: "Not ready" }),
      steps: [
        {
          key: "vacate",
          title: "Vacancy",
          fields: [
            { key: "vacatedOn", label: "Vacated on", type: "date", required: true },
            { key: "readyStatus", label: "Ready status", type: "select", options: READY_OPTIONS },
          ],
        },
      ],
      finish: async (v, ctx) => {
        const ok = await ctx.commit({ status: "Vacant", occupantName: "", tenantId: "", leaseStart: "", leaseEnd: "" });
        if (!ok) return false;
        await ctx.commitMeta({ vacatedOn: v.vacatedOn, readyStatus: v.readyStatus || "Not ready" });
        toast.success("Unit marked vacant.");
        return true;
      },
    },
  },
  {
    key: "startTurn",
    label: "Start turn",
    icon: RefreshCw,
    showIf: (u) => u.status !== "Non-revenue",
    wizard: {
      title: "Start a unit turn",
      description: "Creates a make-ready turn in Unit Turns and moves this unit to Make-ready.",
      finishLabel: "Start Turn",
      logSummary: "Started a unit turn",
      initial: (u) => ({
        name: `${u.label} turn`,
        moveOutDate: u.leaseEnd || u.vacatedOn || todayISO(),
        targetReadyDate: "",
        budget: 0,
      }),
      steps: [
        {
          key: "turn",
          title: "Turn",
          fields: [
            { key: "name", label: "Turn name", type: "text", required: true, full: true },
            { key: "moveOutDate", label: "Move-out date", type: "date" },
            { key: "targetReadyDate", label: "Target ready date", type: "date", required: true },
            { key: "budget", label: "Budget", type: "currency" },
          ],
        },
      ],
      finish: async (v, ctx) => {
        const u = ctx.item;
        const row = await unitTurnsLayer.create({
          id: crypto.randomUUID(),
          name: v.name.trim(),
          unitId: u.id,
          unit: u.label,
          propertyId: u.propertyId || "",
          propertyName: u.propertyName || "",
          moveOutDate: v.moveOutDate || "",
          targetReadyDate: v.targetReadyDate || "",
          budget: Number(v.budget) || 0,
          status: "Not started",
        });
        if (!row) {
          toast.error("Couldn't start the turn.");
          return false;
        }
        if (!["Occupied", "Notice"].includes(u.status)) await ctx.commit({ status: "Make-ready" });
        await ctx.commitMeta({ readyStatus: "In progress" });
        toast.success("Turn started.");
        ctx.navigate("turns");
        return true;
      },
    },
  },
  {
    key: "createListing",
    label: "Create listing",
    icon: Home,
    wizard: createListingWizard,
  },
  {
    key: "newWorkOrder",
    label: "New work order",
    icon: ClipboardPen,
    separatorBefore: true,
    wizard: {
      title: "New work order",
      description: "Opens a work order against this unit in Work Orders.",
      finishLabel: "Create Work Order",
      logSummary: "Opened a work order",
      initial: () => ({ category: "General", priority: "Medium" }),
      steps: [
        {
          key: "wo",
          title: "Work order",
          fields: [
            { key: "name", label: "Summary", type: "text", required: true, full: true, placeholder: "e.g. Kitchen sink leaking" },
            { key: "category", label: "Category", type: "select", options: CATEGORY_OPTIONS },
            { key: "priority", label: "Priority", type: "select", options: PRIORITY_OPTIONS },
            { key: "scheduledDate", label: "Scheduled", type: "date" },
            { key: "description", label: "Details", type: "textarea" },
          ],
        },
      ],
      finish: async (v, ctx) => {
        const u = ctx.item;
        const row = await workOrdersLayer.create({
          id: crypto.randomUUID(),
          name: v.name.trim(),
          kind: "work_order",
          unitId: u.id,
          propertyId: u.propertyId || "",
          propertyLabel: unitName(u),
          tenantId: u.tenantId || "",
          tenantName: u.occupantName || "",
          category: v.category || "General",
          priority: v.priority || "Medium",
          scheduledDate: v.scheduledDate || "",
          status: "Open",
          metadata: { description: v.description || "", entryInstructions: u.vendorEntryInstructions || "" },
        });
        if (!row) {
          toast.error("Couldn't create the work order.");
          return false;
        }
        toast.success("Work order created.");
        ctx.navigate("workorders");
        return true;
      },
    },
  },
  {
    key: "scheduleInspection",
    label: "Schedule inspection",
    icon: ClipboardCheck,
    wizard: {
      title: "Schedule inspection",
      finishLabel: "Schedule",
      logSummary: "Scheduled an inspection",
      initial: (u) => ({ name: `${u.label} inspection`, kind: "routine", inspectionDate: todayISO() }),
      steps: [
        {
          key: "inspection",
          title: "Inspection",
          fields: [
            { key: "name", label: "Name", type: "text", required: true, full: true },
            { key: "kind", label: "Type", type: "select", options: INSPECTION_TYPE_OPTIONS },
            { key: "inspectionDate", label: "Date", type: "date", required: true },
            { key: "inspector", label: "Inspector", type: "text" },
          ],
        },
      ],
      finish: async (v, ctx) => {
        const u = ctx.item;
        const row = await inspectionsLayer.create({
          id: crypto.randomUUID(),
          name: v.name.trim(),
          kind: v.kind || "routine",
          unit: unitName(u),
          unitId: u.id,
          propertyId: u.propertyId || "",
          tenantId: u.tenantId || "",
          tenantName: u.occupantName || "",
          inspectionDate: v.inspectionDate,
          inspector: v.inspector || "",
          status: "Scheduled",
        });
        if (!row) {
          toast.error("Couldn't schedule the inspection.");
          return false;
        }
        toast.success("Inspection scheduled.");
        ctx.navigate("inspections");
        return true;
      },
    },
  },
  {
    key: "applyUnitType",
    label: "Apply unit type specs",
    icon: Wand2,
    separatorBefore: true,
    showIf: (u) => Boolean(u.unitTypeId),
    run: async (ctx) => {
      const t = await getUnitType(ctx.item.unitTypeId);
      if (!t) {
        toast.error("Couldn't load the unit type.");
        return;
      }
      const patch = { bedrooms: t.bedrooms, bathrooms: t.bathrooms, deposit: t.deposit };
      if (t.sqft) patch.sqft = t.sqft;
      if (t.floorPlanId) patch.floorPlanId = t.floorPlanId;
      if (!Number(ctx.item.rent) && t.marketRent) patch.rent = t.marketRent;
      if (!(await ctx.commit(patch))) return;
      ctx.log(`Applied unit type ${t.name}`);
      toast.success(`Applied ${t.name} specs.`);
    },
  },
  {
    key: "takeOffline",
    label: "Take offline (down)",
    icon: PowerOff,
    showIf: (u) => u.status !== "Down",
    wizard: {
      title: "Take unit offline",
      description: "Marks the unit Down so it drops out of availability until it's brought back.",
      finishLabel: "Take Offline",
      logSummary: "Took unit offline",
      initial: () => ({ downReason: "Renovation", downSince: todayISO() }),
      steps: [
        {
          key: "down",
          title: "Reason",
          fields: [
            { key: "downReason", label: "Reason", type: "select", options: DOWN_REASONS, required: true },
            { key: "downSince", label: "Offline since", type: "date", required: true },
            { key: "downUntil", label: "Expected back", type: "date" },
            { key: "downNotes", label: "Notes", type: "textarea" },
          ],
        },
      ],
      finish: async (v, ctx) => {
        if (!(await ctx.commit({ status: "Down" }))) return false;
        await ctx.commitMeta({
          downReason: v.downReason,
          downSince: v.downSince,
          downUntil: v.downUntil || "",
          downNotes: v.downNotes || "",
        });
        toast.success("Unit taken offline.");
        return true;
      },
    },
  },
  {
    key: "bringOnline",
    label: "Bring back online",
    icon: Power,
    showIf: (u) => u.status === "Down",
    run: async (ctx) => {
      if (!(await ctx.commit({ status: "Make-ready" }))) return;
      await ctx.commitMeta({ downUntil: todayISO(), readyStatus: "In progress" });
      ctx.log("Brought unit back online");
      toast.success("Unit is back online (Make-ready).");
    },
  },
  {
    key: "makeNonRevenue",
    label: "Make non-revenue",
    icon: Ban,
    showIf: (u) => !u.nonRevenue && u.status !== "Non-revenue",
    wizard: {
      title: "Make non-revenue",
      description: "Excludes this unit from occupancy and rent-roll totals (models, offices, storage…).",
      finishLabel: "Make Non-Revenue",
      logSummary: "Made unit non-revenue",
      initial: () => ({ nonRevenueType: "Model", nonRevenueSince: todayISO() }),
      steps: [
        {
          key: "nr",
          title: "Non-revenue",
          fields: [
            { key: "nonRevenueType", label: "Use", type: "select", options: NON_REVENUE_TYPES, required: true },
            { key: "nonRevenueSince", label: "Since", type: "date", required: true },
            { key: "nonRevenueUntil", label: "Until (expected)", type: "date" },
            { key: "nonRevenueReason", label: "Reason", type: "textarea" },
          ],
        },
      ],
      finish: async (v, ctx) => {
        if (!(await ctx.commit({ status: "Non-revenue" }))) return false;
        await ctx.commitMeta({
          nonRevenue: true,
          nonRevenueType: v.nonRevenueType,
          nonRevenueSince: v.nonRevenueSince,
          nonRevenueUntil: v.nonRevenueUntil || "",
          nonRevenueReason: v.nonRevenueReason || "",
        });
        toast.success("Unit is now non-revenue.");
        return true;
      },
    },
  },
  {
    key: "returnToRevenue",
    label: "Return to revenue",
    icon: CheckCircle2,
    showIf: (u) => Boolean(u.nonRevenue) || u.status === "Non-revenue",
    run: async (ctx) => {
      if (!(await ctx.commit({ status: "Vacant" }))) return;
      await ctx.commitMeta({ nonRevenue: false, nonRevenueUntil: todayISO() });
      ctx.log("Returned unit to revenue");
      toast.success("Unit returned to revenue.");
    },
  },
];
