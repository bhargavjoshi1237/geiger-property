import { URGENT_PRIORITIES, inScope, vendorComplianceRows, workOrderRows } from "@/lib/metrics/helpers";
import { byId, list } from "@/lib/reports/lookups";
import { caseAction, dailyRent, dayOf, daysBetweenIso, fmtDay, hoursSince, money0, names, playbook, plural, report, skipNote, tab } from "./shared";

// Maintenance and compliance detectors: overdue unit turns, urgent or overdue work orders (plus the old
// "Urgent work orders" summary), repeat repairs, and vendors with lapsing COIs or licences on open work.

export const turnOverdue = {
  key: "turn_overdue",
  label: "Unit turn overdue",
  area: "maintenance",
  category: "watch",
  description: "Make-ready turns past their target ready date after the move-out.",
  sources: ["unitTurns", "units", "properties"],
  detect(src, ctx) {
    const units = byId(src.units);
    const turns = list(src.unitTurns).filter((t) => !["Ready", "Leased"].includes(t.status) && inScope(ctx.p, t.propertyId));
    const findings = [];
    for (const t of turns) {
      const target = dayOf(t.targetReadyDate);
      const out = dayOf(t.moveOutDate);
      if (!target || target >= ctx.p.asOf || (out && out > ctx.p.asOf)) continue;
      const late = daysBetweenIso(target, ctx.p.asOf) ?? 0;
      const rent = Number(units.get(t.unitId)?.rent) || 0;
      findings.push({
        key: `turn:${t.id}`,
        title: `${t.unit || "Unit"} turn is ${late} days late`,
        why: `Make-ready was due ${fmtDay(target)}${out ? ` after the ${fmtDay(out)} move-out` : ""} and is still ${String(t.status || "open").toLowerCase()}. Each day costs about ${money0(dailyRent(rent))} in rent.`,
        urgency: late > 7 ? "urgent" : "soon",
        propertyId: t.propertyId,
        impact: Math.round(dailyRent(rent) * late * 100) / 100 || null,
        grain: "record",
        records: [{ type: "unit_turn", id: t.id, label: [t.unit, t.propertyName].filter(Boolean).join(" · ") || "Unit turn" }],
        actions: [tab("Open turn", "Unit Turns", t.id), playbook("vacancy_turn", "Run vacancy turn", "unit", t.unitId ? [t.unitId] : [])],
      });
    }
    const undated = turns.filter((t) => !dayOf(t.targetReadyDate)).length;
    return { findings, examined: turns.length, skipped: undated, note: skipNote(undated, turns.length, "open turns", "no target ready date") };
  },
};

export const workOrderAttention = {
  key: "work_order_attention",
  label: "Work order needs attention",
  area: "maintenance",
  category: "risk",
  description: "Urgent work orders unassigned past the threshold, any work order past due, and the Urgent work orders summary.",
  sources: ["workOrders", "units", "properties"],
  detect(src, ctx) {
    const open = workOrderRows(src, ctx.p).filter((w) => w.open && w.kind !== "request");
    const findings = [];
    for (const w of open) {
      const unassigned = !w.vendorId && !w.technician;
      const hours = hoursSince(w.createdAt, ctx.now);
      const stale = w.priority === "Urgent" && unassigned && hours !== null && hours >= ctx.config.urgentUnassignedHours;
      const overdue = w.due && w.due < ctx.p.asOf;
      if (!stale && !overdue) continue;
      const late = overdue ? daysBetweenIso(w.due, ctx.p.asOf) : 0;
      findings.push({
        key: `wo:${w.id}`,
        title: stale ? `Urgent: "${w.name}" has no one assigned` : `"${w.name}" is ${late} days overdue`,
        why: stale
          ? `Opened ${Math.floor(hours)} hours ago at Urgent priority and still unassigned (limit ${ctx.config.urgentUnassignedHours} hours).`
          : `It was due ${fmtDay(w.due)} and is still ${String(w.status).toLowerCase()}${w.vendorName ? ` with ${w.vendorName}` : ""}.`,
        urgency: stale || late > 7 ? "urgent" : "soon",
        propertyId: w.propertyId,
        impact: w.cost || null,
        grain: "record",
        records: [{ type: "work_order", id: w.id, label: [w.name, w.property].filter(Boolean).join(" · "), amount: w.cost || undefined }],
        actions: [tab(stale ? "Assign a vendor" : "Open work order", "Work Orders", w.id), playbook("wo_sla_watchdog", "Turn on SLA watchdog", "work_order", [w.id])],
        metadata: { reason: stale ? "unassigned" : "overdue", priority: w.priority },
      });
    }
    const hot = open.filter((w) => URGENT_PRIORITIES.includes(w.priority));
    if (hot.length) {
      findings.push({
        key: "summary",
        title: `${plural(hot.length, "urgent or high work order")} open`,
        why: `${names(hot, (w) => w.name)}.`,
        urgency: "urgent",
        impact: null,
        grain: "summary",
        records: hot.map((w) => ({ type: "work_order", id: w.id, label: [w.name, w.property].filter(Boolean).join(" · ") })),
        actions: [tab("Open work orders", "Work Orders"), report("Maintenance report", "Maintenance Report")],
      });
    }
    return { findings, examined: open.length, skipped: 0, note: "" };
  },
};

export const repeatRepairs = {
  key: "repeat_repairs",
  label: "Repeat repairs",
  area: "maintenance",
  category: "watch",
  description: "Several work orders in the same unit and category within the window — a sign of an underlying problem.",
  sources: ["workOrders", "units", "properties"],
  detect(src, ctx) {
    const units = byId(src.units);
    const since = new Date(ctx.now.getTime() - ctx.config.repeatRepairDays * 86400000).toISOString().slice(0, 10);
    const rows = workOrderRows(src, ctx.p).filter((w) => w.unitId && w.created && w.created >= since && w.kind !== "request" && w.status !== "Cancelled");
    const groups = new Map();
    for (const w of rows) {
      const k = `${w.unitId}|${w.category || "General"}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(w);
    }
    const findings = [];
    for (const [k, ws] of groups) {
      if (ws.length < ctx.config.repeatRepairCount) continue;
      const [unitId, category] = k.split("|");
      const unit = units.get(unitId);
      const cost = ws.reduce((s, w) => s + w.cost, 0);
      findings.push({
        key: `unit:${unitId}:${category.toLowerCase()}`,
        title: `${ws.length} ${category.toLowerCase()} repairs in ${unit?.label || "one unit"}`,
        why: `${plural(ws.length, "work order")} for ${category} in ${unit?.label || "this unit"} in ${ctx.config.repeatRepairDays} days${cost ? `, ${money0(cost)} spent` : ""}: ${names(ws, (w) => w.name)}. Consider a permanent fix.`,
        urgency: "routine",
        propertyId: ws[0].propertyId,
        impact: cost || null,
        grain: "record",
        records: [{ type: "unit", id: unitId, label: unit?.label || "Unit" }, ...ws.map((w) => ({ type: "work_order", id: w.id, label: w.name, amount: w.cost || undefined }))],
        actions: [tab("Open unit", "Units", unitId), caseAction()],
      });
    }
    return { findings, examined: rows.length, skipped: 0, note: "" };
  },
};

export const vendorCompliance = {
  key: "vendor_compliance",
  label: "Vendor compliance lapsing",
  area: "compliance",
  category: "risk",
  description: "Vendors with open work whose certificate of insurance or licence is expiring or expired.",
  sources: ["vendors", "compliance", "workOrders", "units", "properties"],
  detect(src, ctx) {
    const openByVendor = new Map();
    for (const w of workOrderRows(src, ctx.p).filter((x) => x.open && x.vendorId)) {
      if (!openByVendor.has(w.vendorId)) openByVendor.set(w.vendorId, []);
      openByVendor.get(w.vendorId).push(w);
    }
    const rows = vendorComplianceRows(src, ctx.p, ctx.config.complianceWindowDays).filter((r) => openByVendor.has(r.vendorId));
    const findings = rows.map((r) => {
      const work = openByVendor.get(r.vendorId);
      const cost = work.reduce((s, w) => s + w.cost, 0);
      const expired = r.state === "expired";
      return {
        key: `vendor:${r.vendorId}:${r.kind.toLowerCase()}`,
        title: `${r.vendor}'s ${r.kind} ${expired ? "has expired" : `expires ${fmtDay(r.endsOn)}`}`,
        why: `${r.vendor} has ${plural(work.length, "open work order")} (${names(work, (w) => w.name, 2)}) and their ${r.kind === "COI" ? "certificate of insurance" : "licence"} ${expired ? `lapsed${r.endsOn ? ` on ${fmtDay(r.endsOn)}` : ""}` : `runs out in ${r.days} days`}.`,
        urgency: expired ? "urgent" : "soon",
        impact: cost || null,
        grain: "record",
        records: [{ type: "vendor", id: r.vendorId, label: r.vendor }, ...work.map((w) => ({ type: "work_order", id: w.id, label: w.name }))],
        actions: [tab("Open vendor", "Vendors", r.vendorId), playbook("vendor_compliance_chase", "Chase the document", "vendor", [r.vendorId])],
      };
    });
    return { findings, examined: list(src.vendors).length, skipped: 0, note: "" };
  },
};

export const MAINTENANCE_DETECTORS = [turnOverdue, workOrderAttention, repeatRepairs, vendorCompliance];
