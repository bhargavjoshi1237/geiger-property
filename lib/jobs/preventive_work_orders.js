import { emptyResult } from "./contract";
import {
  advanceDue,
  buildPmWorkOrders,
  generatedPatch,
  isOccurrenceDue,
  parseDay,
  toDay,
  toWorkOrderRow,
} from "@/lib/maintenance/pm";

// Scheduled job: create the work orders for every active preventive schedule
// whose occurrence is due (next due minus lead days), then advance next due.
// Idempotent: the work_orders (pm_schedule_id, pm_due_date, unit) unique index
// rejects a repeat insert, and an advanced schedule is no longer due.

const CLOSED = ["Completed", "Cancelled", "Rejected", "Converted"];
const ACTOR = "Preventive scheduler";

const normalizeSchedule = (r) => ({
  ...(r.metadata && typeof r.metadata === "object" ? r.metadata : {}),
  id: r.id,
  projectId: r.project_id ?? null,
  name: r.name ?? "",
  propertyId: r.property_id ?? "",
  propertyName: r.property_name ?? "",
  unitId: r.unit_id ?? "",
  unit: r.unit ?? "",
  category: r.category ?? "",
  frequency: r.frequency ?? "Monthly",
  nextDue: r.next_due ?? "",
  vendorId: r.vendor_id ?? "",
  vendorName: r.vendor_name ?? "",
  estimatedCost: Number(r.estimated_cost) || 0,
  status: r.status ?? "Active",
  metadata: r.metadata || {},
});

// Next occurrence strictly after today, so a long-missed schedule doesn't flood.
function nextAfter(schedule, today) {
  let next = advanceDue(schedule, schedule.nextDue);
  for (let i = 0; next && parseDay(next) <= parseDay(today) && i < 500; i += 1) {
    next = advanceDue(schedule, next);
  }
  return next;
}

// `projectId` narrows a staff "Run now" to one project (plus legacy unscoped rows).
async function runPreventiveWorkOrders({ admin, now = new Date(), projectId = null }) {
  const result = emptyResult();
  if (!admin) {
    result.errors.push("admin client not configured");
    return result;
  }
  const today = toDay(now);
  let query = admin.from("pm_schedules").select("*").eq("status", "Active").is("deleted_at", null);
  if (projectId) query = query.or(`project_id.eq.${projectId},project_id.is.null`);
  const { data: rows, error } = await query;
  if (error) {
    result.errors.push(`pm_schedules: ${error.message}`);
    return result;
  }

  for (const row of rows || []) {
    const schedule = normalizeSchedule(row);
    if (!isOccurrenceDue(schedule, today)) {
      result.skipped += 1;
      continue;
    }
    result.processed += 1;
    const dueDate = schedule.nextDue;
    const created = [];
    let skippedOpen = false;

    try {
      // Optionally hold off while the previous occurrence is still open.
      if (schedule.skipIfOpen) {
        const { data: open } = await admin
          .from("work_orders")
          .select("id, status")
          .eq("pm_schedule_id", schedule.id)
          .is("deleted_at", null);
        skippedOpen = (open || []).some((w) => !CLOSED.includes(w.status));
      }

      if (!skippedOpen) {
        let units = [];
        if (schedule.scope === "all_units" && schedule.propertyId) {
          const { data: unitRows } = await admin
            .from("units")
            .select("id, label")
            .eq("property_id", schedule.propertyId)
            .is("deleted_at", null);
          units = unitRows || [];
        }
        const inputs = buildPmWorkOrders(schedule, { dueDate, units, actor: ACTOR, now });
        for (const input of inputs) {
          const { data: wo, error: insertError } = await admin
            .from("work_orders")
            .insert(toWorkOrderRow({ ...input, id: crypto.randomUUID() }, schedule.projectId || projectId))
            .select("id, name, property_label")
            .single();
          if (insertError) {
            if (insertError.code === "23505") result.skipped += 1;
            else result.errors.push(`${schedule.name}: ${insertError.message}`);
            continue;
          }
          created.push({ id: wo.id, name: wo.name, propertyLabel: wo.property_label });
          result.created += 1;
          await admin.from("activity").insert({
            project_id: schedule.projectId || projectId,
            owner_type: "workorder",
            owner_id: wo.id,
            verb: "created",
            summary: `Generated from preventive schedule "${schedule.name}"`,
            actor_name: ACTOR,
            metadata: { system: true },
          });
        }
      } else {
        result.skipped += 1;
      }

      // Advance the schedule (ends it when the end date has passed).
      const next = nextAfter(schedule, today);
      const meta = {
        ...schedule.metadata,
        ...(created.length ? generatedPatch(schedule, created, dueDate, now) : {}),
        ...(skippedOpen ? { lastSkipped: today } : {}),
      };
      const { error: updateError } = await admin
        .from("pm_schedules")
        .update({ next_due: next || null, status: next ? "Active" : "Ended", metadata: meta })
        .eq("id", schedule.id);
      if (updateError) result.errors.push(`${schedule.name}: ${updateError.message}`);
    } catch (e) {
      result.errors.push(`${schedule.name}: ${e?.message || e}`);
    }
  }
  return result;
}

export const preventiveWorkOrdersJob = {
  key: "preventive-work-orders",
  label: "Preventive work orders",
  description: "Creates work orders for preventive & recurring schedules as they come due and advances each schedule's next due date.",
  schedule: "0 6 * * *",
  intervalMinutes: 1440,
  run: runPreventiveWorkOrders,
};

export default preventiveWorkOrdersJob;
