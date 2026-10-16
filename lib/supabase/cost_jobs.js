import { makeEntityData } from "./entity_factory";

// Data-access layer for Job Costing (owns `property.cost_jobs`): unit turns,
// capital projects and other jobs that bills and ledger lines are tagged to.
export const costJobsLayer = makeEntityData({
  table: "cost_jobs",
  tag: "costJobs",
  fields: [
    { key: "name", col: "name", type: "text" },
    { key: "kind", col: "kind", type: "text", default: "Capital project" },
    { key: "propertyId", col: "property_id", type: "uuid" },
    { key: "propertyName", col: "property_name", type: "text" },
    { key: "unitId", col: "unit_id", type: "uuid" },
    { key: "unit", col: "unit", type: "text" },
    { key: "unitTurnId", col: "unit_turn_id", type: "uuid" },
    { key: "budget", col: "budget", type: "number" },
    { key: "startsOn", col: "starts_on", type: "date" },
    { key: "endsOn", col: "ends_on", type: "date" },
    { key: "status", col: "status", type: "text", default: "Open" },
  ],
});

export const costJobsData = costJobsLayer.data;

// Relation-picker options for tagging bills/expenses to a job.
export async function costJobOptions() {
  const rows = (await costJobsLayer.list()) ?? [];
  return rows
    .filter((j) => j.status !== "Closed")
    .map((j) => ({ value: j.id, label: [j.name, j.propertyName].filter(Boolean).join(" · "), patch: { jobName: j.name } }));
}
