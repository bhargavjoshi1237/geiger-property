import { makeEntityData } from "./entity_factory";
import { cancelRentStepApi, createRentStepApi } from "@/lib/billing/api";

// Data layer for a lease's rent schedule (reads `property.lease_rent_steps`); writes go through /api/billing so the server re-projects, syncs leases.rent and trues up.
const base = makeEntityData({
  table: "lease_rent_steps",
  tag: "leaseRentSteps",
  order: { col: "effective_date", ascending: true },
  fields: [
    { key: "leaseId", col: "lease_id", type: "uuid" },
    { key: "effectiveDate", col: "effective_date", type: "date" },
    { key: "amount", col: "amount", type: "number" },
    { key: "changeMode", col: "change_mode", type: "text", default: "amount" },
    { key: "changeValue", col: "change_value", type: "number" },
    { key: "source", col: "source", type: "text", default: "manual" },
    { key: "note", col: "note", type: "text" },
    { key: "status", col: "status", type: "text", default: "active" },
  ],
});

// Active steps of a lease, oldest first.
export const listLeaseRentSteps = (leaseId) => base.list({ leaseId, status: "active" });

// Add a step (or replace one with step.replaces) → { ok, step, rent, entries } | { ok:false, error }.
export async function createLeaseRentStep(leaseId, step) {
  const res = await createRentStepApi(leaseId, step);
  return res.ok ? { ...res, step: base.normalize(res.step) } : res;
}

// Cancel a step → { ok, rent, entries } | { ok:false, error }.
export const cancelLeaseRentStep = (leaseId, stepId) => cancelRentStepApi(leaseId, stepId);

