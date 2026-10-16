"use client";

import { listUnits } from "@/lib/supabase/units";
import { workOrdersLayer } from "@/lib/supabase/work_orders";
import { pmSchedulesLayer } from "@/lib/supabase/pm_schedules";
import { logSystemActivity } from "@/lib/supabase/activity_log";
import { advanceDue, buildPmWorkOrders, generatedPatch } from "@/lib/maintenance/pm";
import { actorName } from "./sections/wo_shared";
import { todayString } from "./shared";

// Client-side "Generate now" for preventive schedules — the same rules the
// scheduled job runs (lib/jobs/preventive_work_orders.js), for one schedule.

// Schedule view with the freshest metadata winning over stale spread keys.
export const scheduleView = (item) => ({ ...item, ...(item?.metadata || {}) });

// Create the current occurrence's work orders. Returns { created, failed }.
export async function generateOccurrence(item) {
  const schedule = scheduleView(item);
  const dueDate = schedule.nextDue || todayString();
  let units = [];
  if (schedule.scope === "all_units" && schedule.propertyId) {
    units = ((await listUnits()) ?? [])
      .filter((u) => u.propertyId === schedule.propertyId)
      .map((u) => ({ id: u.id, label: u.label }));
  }
  const inputs = buildPmWorkOrders(schedule, { dueDate, units, actor: await actorName() });
  const created = [];
  let failed = 0;
  for (const input of inputs) {
    const wo = await workOrdersLayer.create({ id: crypto.randomUUID(), ...input });
    if (wo) {
      created.push(wo);
      logSystemActivity("workorder", wo.id, "created", `Generated from preventive schedule "${schedule.name}"`);
    } else failed += 1;
  }
  return { created, failed, dueDate };
}

// Partial that advances the schedule past a generated occurrence.
export function advancePartial(item, created, dueDate) {
  const schedule = scheduleView(item);
  const next = advanceDue(schedule, dueDate);
  return {
    nextDue: next || "",
    status: next ? schedule.status : "Ended",
    metadata: { ...(item.metadata || {}), ...generatedPatch(schedule, created, dueDate) },
  };
}

// Generate + advance a schedule straight through the data layer (list header).
export async function generateAndAdvance(item) {
  const res = await generateOccurrence(item);
  if (!res.created.length) return res;
  const saved = await pmSchedulesLayer.update(item.id, advancePartial(item, res.created, res.dueDate));
  return { ...res, saved: Boolean(saved) };
}
