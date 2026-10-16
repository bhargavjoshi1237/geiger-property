// Preventive-maintenance rules shared by the Preventive & Recurring editor
// ("Generate now") and the scheduled job. Pure: plain data + date math, no I/O.
// Schedules are camelCase view models (columns + metadata keys spread).

export const PM_FREQUENCIES = {
  Weekly: { days: 7 },
  Biweekly: { days: 14 },
  Monthly: { months: 1 },
  Bimonthly: { months: 2 },
  Quarterly: { months: 3 },
  "Semi-annually": { months: 6 },
  Annually: { months: 12 },
  Custom: {},
};

// Occurrences per year, for annual cost estimates.
export function occurrencesPerYear(schedule) {
  const f = PM_FREQUENCIES[schedule?.frequency] || PM_FREQUENCIES.Monthly;
  if (schedule?.frequency === "Custom") {
    const n = Math.max(1, Number(schedule.intervalCount) || 1);
    const unit = schedule.intervalUnit || "months";
    return unit === "days" ? 365 / n : unit === "weeks" ? 52 / n : 12 / n;
  }
  return f.days ? 365 / f.days : 12 / f.months;
}

// "YYYY-MM-DD" → local Date (null when invalid).
export function parseDay(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || ""));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

export const toDay = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function step(d, schedule) {
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const custom = schedule?.frequency === "Custom";
  const rule = custom
    ? { [schedule.intervalUnit === "days" ? "days" : schedule.intervalUnit === "weeks" ? "weeks" : "months"]: Math.max(1, Number(schedule.intervalCount) || 1) }
    : PM_FREQUENCIES[schedule?.frequency] || PM_FREQUENCIES.Monthly;
  if (rule.days) next.setDate(next.getDate() + rule.days);
  else if (rule.weeks) next.setDate(next.getDate() + rule.weeks * 7);
  else {
    // Pin to the preferred day of month (else the start date's), clamped to the month's length.
    const day = Number(schedule?.dayOfMonth) || parseDay(schedule?.startDate)?.getDate() || d.getDate();
    next.setDate(1);
    next.setMonth(next.getMonth() + rule.months);
    const last = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
    next.setDate(Math.min(day, last));
  }
  return next;
}

const activeMonthsOf = (schedule) =>
  Array.isArray(schedule?.activeMonths) ? schedule.activeMonths.map(Number).filter(Boolean) : [];

// The occurrence after `from` (defaults to the schedule's next due), honoring
// seasonal months and the end date. "" when the schedule has run out.
export function advanceDue(schedule, from) {
  let d = parseDay(from || schedule?.nextDue) || new Date();
  const months = activeMonthsOf(schedule);
  for (let i = 0; i < 400; i += 1) {
    d = step(d, schedule);
    if (!months.length || months.includes(d.getMonth() + 1)) break;
  }
  const end = parseDay(schedule?.endDate);
  if (end && d > end) return "";
  return toDay(d);
}

// Days to create the work order ahead of its due date.
export const leadDaysOf = (schedule) => Math.max(0, Number(schedule?.leadDays) || 0);

// True when an active schedule's current occurrence should exist by `today`.
export function isOccurrenceDue(schedule, today = toDay(new Date())) {
  if (schedule?.status !== "Active" || !schedule?.nextDue) return false;
  if (schedule.autoGenerate === false) return false;
  const due = parseDay(schedule.nextDue);
  const now = parseDay(today);
  if (!due || !now) return false;
  const start = parseDay(schedule.startDate);
  if (start && now < start) return false;
  const create = new Date(due.getFullYear(), due.getMonth(), due.getDate() - leadDaysOf(schedule));
  return create <= now;
}

const checklistFrom = (steps) =>
  (Array.isArray(steps) ? steps : [])
    .filter((s) => s?.label)
    .map((s) => ({ id: crypto.randomUUID(), label: s.label, done: false }));

// Work-order inputs (camelCase, for workOrdersLayer.create) for one occurrence.
// `units` = [{ id, label }] in the schedule's property, used by the all-units scope.
export function buildPmWorkOrders(schedule, { dueDate, units = [], actor = "Preventive schedule", now = new Date() } = {}) {
  const due = dueDate || schedule.nextDue || toDay(now);
  const propertyName = schedule.propertyName || "";
  const base = {
    name: schedule.name || "Preventive maintenance",
    kind: "work_order",
    status: "Open",
    priority: schedule.priority || "Medium",
    category: schedule.category || "",
    propertyId: schedule.propertyId || "",
    vendorId: schedule.vendorId || "",
    vendorName: schedule.vendorName || "",
    technician: schedule.technician || "",
    scheduledDate: due,
    pmScheduleId: schedule.id,
    pmDueDate: due,
  };
  const offset = Math.max(0, Number(schedule.dueOffsetDays) || 0);
  const dueDay = parseDay(due);
  const metadata = {
    source: "pm",
    pmScheduleName: schedule.name || "",
    dueDate: offset && dueDay ? toDay(new Date(dueDay.getFullYear(), dueDay.getMonth(), dueDay.getDate() + offset)) : due,
    shareWithOwner: Boolean(schedule.shareWithOwner),
    shareWithTenant: Boolean(schedule.notifyTenant),
    notifyTenantOnStatus: Boolean(schedule.notifyTenant),
    approvalRequired: Boolean(schedule.requireApproval),
    description: schedule.instructions || "",
    estimatedHours: Number(schedule.estimatedHours) || 0,
    estimateAmount: Number(schedule.estimatedCost) || 0,
    entryPermission: schedule.entryPermission || "",
    checklist: checklistFrom(schedule.steps),
    statusHistory: [{ id: crypto.randomUUID(), status: "Open", from: "", at: now.toISOString(), by: actor, note: "Generated from preventive schedule" }],
  };
  const assets = Array.isArray(schedule.assets) ? schedule.assets.filter((a) => a?.label) : [];
  if (assets.length) {
    metadata.checklist = [
      ...assets.map((a) => ({ id: crypto.randomUUID(), label: `Service ${a.label}`, done: false })),
      ...metadata.checklist,
    ];
  }

  if (schedule.scope === "all_units" && units.length) {
    return units.map((u) => ({
      ...base,
      unitId: u.id,
      propertyLabel: propertyName ? `${propertyName} · ${u.label}` : u.label,
      metadata: { ...metadata, checklist: metadata.checklist.map((c) => ({ ...c, id: crypto.randomUUID() })) },
    }));
  }
  return [
    {
      ...base,
      unitId: schedule.scope === "property" ? "" : schedule.unitId || "",
      propertyLabel: schedule.scope !== "property" && schedule.unit ? schedule.unit : propertyName,
      metadata,
    },
  ];
}

// camelCase work-order input → snake_case row (server-side inserts).
export function toWorkOrderRow(input, projectId = null) {
  return {
    ...(input.id ? { id: input.id } : {}),
    project_id: projectId,
    name: input.name,
    kind: input.kind,
    status: input.status,
    priority: input.priority,
    category: input.category,
    property_id: input.propertyId || null,
    property_label: input.propertyLabel || "",
    unit_id: input.unitId || null,
    vendor_id: input.vendorId || null,
    vendor_name: input.vendorName || "",
    technician: input.technician || "",
    scheduled_date: input.scheduledDate || null,
    pm_schedule_id: input.pmScheduleId || null,
    pm_due_date: input.pmDueDate || null,
    metadata: input.metadata || {},
  };
}

// The schedule metadata patch after generating an occurrence.
export function generatedPatch(schedule, created, dueDate, now = new Date()) {
  const prior = Array.isArray(schedule.generated) ? schedule.generated : [];
  return {
    lastGenerated: toDay(now),
    generated: [
      ...created.map((w) => ({ id: w.id, label: w.propertyLabel || w.name, date: dueDate })),
      ...prior,
    ].slice(0, 100),
  };
}
