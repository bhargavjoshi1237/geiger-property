import { addDays, expiringLeases, inScope, renewalFor, unitRows, PENDING_APP_STATUSES } from "@/lib/metrics/helpers";
import { byId, list, nameMaps, propertyOf } from "@/lib/reports/lookups";
import { ACTIVE_LEASE_STATUSES } from "@/lib/reports/maps";
import { caseAction, dailyRent, dayOf, daysBetweenIso, fmtDay, hoursSince, money0, names, playbook, plural, report, skipNote, tab } from "./shared";

// Leasing detectors: renewals at risk, leases ending with no offer (plus the old "Expiring leases"
// summary), below-market rent at renewal, long vacancies, waiting applications (plus the old "Pending
// applications" summary) and upcoming moves (the old "Upcoming moves" card).

const tenantOf = (l) => l.tenantName || l.name || "Tenant";
const leaseLabel = (l, units) => [tenantOf(l), units.get(l.unitId)?.label || l.unit].filter(Boolean).join(" · ");

export const renewalAtRisk = {
  key: "renewal_at_risk",
  label: "Renewal at risk",
  area: "leasing",
  category: "risk",
  description: "Leases ending soon whose renewal offer has gone unanswered.",
  sources: ["leases", "renewals", "units", "properties"],
  detect(src, ctx) {
    const units = byId(src.units);
    const leases = expiringLeases(src, ctx.p, ctx.config.renewalAtRiskDays);
    const findings = [];
    for (const l of leases) {
      const r = renewalFor(l, src.renewals);
      const sent = dayOf(r?.offerSentOn);
      if (!r || r.status !== "Offer sent" || !sent) continue;
      const waited = daysBetweenIso(sent, ctx.p.asOf) ?? 0;
      if (waited < ctx.config.renewalNoReplyDays) continue;
      const days = daysBetweenIso(ctx.p.asOf, l.end) ?? 0;
      const rent = Number(l.rent) || 0;
      findings.push({
        key: `lease:${l.id}`,
        title: `${tenantOf(l)} hasn't answered their renewal`,
        why: `The offer went out ${fmtDay(sent)} (${waited} days ago) with no reply, and the lease ends ${fmtDay(l.end)} — ${days} days away. Losing them costs about ${money0(rent * ctx.config.turnoverMonths)} in vacancy and turn.`,
        urgency: days <= 30 ? "urgent" : "soon",
        propertyId: l.propertyId,
        impact: rent * ctx.config.turnoverMonths,
        grain: "record",
        records: [
          { type: "lease", id: l.id, label: leaseLabel(l, units), amount: rent },
          { type: "renewal", id: r.id, label: "Renewal offer" },
        ],
        actions: [tab("Open renewal", "Renewals", r.id), playbook("renewal_pipeline", "Run renewal follow-up", "lease", [l.id]), caseAction()],
        metadata: { daysToEnd: days, offerSentOn: sent },
      });
    }
    return { findings, examined: leases.length, skipped: 0, note: "" };
  },
};

export const leaseExpiringNoOffer = {
  key: "lease_expiring_no_offer",
  label: "Lease ending with no renewal offer",
  area: "leasing",
  category: "watch",
  description: "Active leases ending within the window that have no renewal offer yet; includes the Expiring leases summary.",
  sources: ["leases", "renewals", "units", "properties"],
  detect(src, ctx) {
    const units = byId(src.units);
    const live = list(src.leases).filter((l) => ACTIVE_LEASE_STATUSES.includes(l.status) && inScope(ctx.p, propertyOf(l, units)));
    const noEnd = live.filter((l) => !dayOf(l.termEnd) && l.status !== "Month-to-month").length;
    const rows = expiringLeases(src, ctx.p, ctx.config.expiringNoOfferDays).filter((l) => {
      const r = renewalFor(l, src.renewals);
      return !r || r.status === "Not started";
    });
    const findings = rows.map((l) => {
      const days = daysBetweenIso(ctx.p.asOf, l.end) ?? 0;
      const rent = Number(l.rent) || 0;
      return {
        key: `lease:${l.id}`,
        title: `${tenantOf(l)}'s lease ends ${fmtDay(l.end)} with no offer`,
        why: `${leaseLabel(l, units)} ends in ${days} days and no renewal offer has been made. Offering early protects ${money0(rent)} a month.`,
        urgency: days <= 30 ? "urgent" : days <= 60 ? "soon" : "routine",
        propertyId: l.propertyId,
        impact: rent * ctx.config.turnoverMonths,
        grain: "record",
        records: [{ type: "lease", id: l.id, label: leaseLabel(l, units), amount: rent }],
        actions: [
          { type: "wizard", label: "Offer renewal", key: "renew", recordType: "lease", recordIds: [l.id], itemId: l.id },
          playbook("renewal_pipeline", "Start renewal pipeline", "lease", [l.id]),
        ],
        metadata: { daysToEnd: days },
      };
    });
    if (rows.length) {
      const soon = rows.filter((l) => (daysBetweenIso(ctx.p.asOf, l.end) ?? 99) <= 60);
      findings.push({
        key: "summary",
        title: `${plural(rows.length, "lease")} ending without a renewal offer`,
        why: `${names(rows, tenantOf)} — ${plural(soon.length, "lease")} within 60 days.`,
        urgency: soon.length ? "soon" : "routine",
        impact: rows.reduce((s, l) => s + (Number(l.rent) || 0), 0) * ctx.config.turnoverMonths,
        grain: "summary",
        records: rows.map((l) => ({ type: "lease", id: l.id, label: leaseLabel(l, units), amount: Number(l.rent) || 0 })),
        actions: [playbook("renewal_pipeline", "Start renewal pipeline", "lease", rows.map((l) => l.id)), tab("Open renewals", "Renewals")],
      });
    }
    return { findings, examined: live.length, skipped: noEnd, note: skipNote(noEnd, live.length, "leases", "no end date") };
  },
};

export const belowMarketRent = {
  key: "below_market_rent",
  label: "Below-market rent at renewal",
  area: "leasing",
  category: "opportunity",
  description: "Leases coming up for renewal whose rent is below market by more than the threshold.",
  sources: ["leases", "renewals", "units", "properties"],
  detect(src, ctx) {
    const units = byId(src.units);
    const window = Number(ctx.policies?.renewalNoticeDays) || 90;
    const rows = expiringLeases(src, ctx.p, window + 30);
    let noMarket = 0;
    const findings = [];
    for (const l of rows) {
      const market = Number(l.marketRent) || Number(units.get(l.unitId)?.rent) || 0;
      const rent = Number(l.rent) || 0;
      if (!market || !rent) {
        noMarket += 1;
        continue;
      }
      const gap = market - rent;
      if (gap <= 0 || (gap / market) * 100 < ctx.config.belowMarketPct) continue;
      const r = renewalFor(l, src.renewals);
      if (r && ["Accepted", "Declined", "Moving out"].includes(r.status)) continue;
      findings.push({
        key: `lease:${l.id}`,
        title: `${tenantOf(l)} pays ${money0(gap)} below market`,
        why: `Rent is ${money0(rent)} against a market rent of ${money0(market)} (${((gap / market) * 100).toFixed(0)}% below). The lease ends ${fmtDay(l.end)}, so the renewal can close the gap — worth ${money0(gap * 12)} a year.`,
        urgency: "routine",
        propertyId: l.propertyId,
        impact: gap * 12,
        grain: "record",
        records: [{ type: "lease", id: l.id, label: leaseLabel(l, units), amount: rent }],
        actions: [
          { type: "wizard", label: "Offer renewal at market", key: "renew", recordType: "lease", recordIds: [l.id], itemId: l.id, initial: { proposedRent: market } },
          report("Rent comparables", "Rent Comparables"),
        ],
        metadata: { market, rent },
      });
    }
    return { findings, examined: rows.length, skipped: noMarket, note: skipNote(noMarket, rows.length, "leases", "no market or lease rent") };
  },
};

export const vacantTooLong = {
  key: "vacant_too_long",
  label: "Unit vacant too long",
  area: "leasing",
  category: "risk",
  description: "Vacant units empty for longer than the threshold; impact is the rent lost so far.",
  sources: ["units", "leases", "properties"],
  detect(src, ctx) {
    const vacant = unitRows(src, ctx.p).filter((u) => u.vacant);
    const unknown = vacant.filter((u) => u.days === null).length;
    const findings = vacant
      .filter((u) => u.days !== null && u.days > ctx.config.vacantDays)
      .map((u) => ({
        key: `unit:${u.id}`,
        title: `${u.label} at ${u.property} vacant ${u.days} days`,
        why: `Empty since ${fmtDay(u.since)} at ${money0(u.rent)} a month — about ${money0(dailyRent(u.rent) * u.days)} in lost rent so far.`,
        urgency: u.days > ctx.config.vacantDays * 2 ? "urgent" : "soon",
        propertyId: u.propertyId,
        impact: Math.round(dailyRent(u.rent) * u.days * 100) / 100,
        grain: "record",
        records: [{ type: "unit", id: u.id, label: `${u.label} · ${u.property}`, amount: u.rent }],
        actions: [tab("Open unit", "Units", u.id), playbook("vacancy_turn", "Run vacancy turn", "unit", [u.id]), report("Occupancy report", "Occupancy & Vacancy")],
        metadata: { days: u.days },
      }));
    return { findings, examined: vacant.length, skipped: unknown, note: skipNote(unknown, vacant.length, "vacant units", "no previous lease end") };
  },
};

export const applicationPending = {
  key: "application_pending",
  label: "Application waiting",
  area: "leasing",
  category: "opportunity",
  description: "Applications waiting on a decision longer than the threshold; includes the Pending applications summary.",
  sources: ["applications", "units", "properties"],
  detect(src, ctx) {
    const units = byId(src.units);
    const pending = list(src.applications).filter((a) => PENDING_APP_STATUSES.includes(a.status) && inScope(ctx.p, a.propertyId || units.get(a.unitId)?.propertyId || ""));
    const label = (a) => [a.name || "Applicant", units.get(a.unitId)?.label || a.unit].filter(Boolean).join(" · ");
    const findings = [];
    for (const a of pending) {
      const hours = hoursSince(a.appliedOn || a.createdAt, ctx.now);
      if (hours === null || hours < ctx.config.applicationPendingHours) continue;
      const rent = Number(units.get(a.unitId)?.rent) || 0;
      findings.push({
        key: `application:${a.id}`,
        title: `${a.name || "An applicant"} has waited ${Math.floor(hours / 24)} days for a decision`,
        why: `Applied ${fmtDay(a.appliedOn || a.createdAt)} for ${units.get(a.unitId)?.label || a.unit || "a unit"} and is still ${a.status.toLowerCase()}. Good applicants move on within days.`,
        urgency: hours > 96 ? "soon" : "routine",
        propertyId: a.propertyId || units.get(a.unitId)?.propertyId || "",
        impact: rent || null,
        grain: "record",
        records: [{ type: "application", id: a.id, label: label(a), amount: rent || undefined }],
        actions: [tab("Review application", "Applications", a.id)],
      });
    }
    if (pending.length) {
      findings.push({
        key: "summary",
        title: `${plural(pending.length, "application")} awaiting a decision`,
        why: `${names(pending, (a) => a.name || "Applicant")} — screening or review isn't finished.`,
        urgency: "routine",
        impact: null,
        grain: "summary",
        records: pending.map((a) => ({ type: "application", id: a.id, label: label(a) })),
        actions: [tab("Open applications", "Applications")],
      });
    }
    return { findings, examined: pending.length, skipped: 0, note: "" };
  },
};

export const upcomingMoves = {
  key: "upcoming_moves",
  label: "Upcoming moves",
  area: "leasing",
  category: "watch",
  description: "Move-ins and move-outs in the next 30 days that aren't complete (the old Needs Attention card).",
  sources: ["moves", "units", "properties"],
  detect(src, ctx) {
    const until = addDays(ctx.p.asOf, ctx.config.upcomingMoveDays);
    const n = nameMaps(src);
    const moves = list(src.moves).filter((m) => {
      const d = dayOf(m.moveDate);
      return d && d >= ctx.p.asOf && d <= until && m.status !== "Complete" && m.status !== "Cancelled" && inScope(ctx.p, m.propertyId);
    });
    if (!moves.length) return { findings: [], examined: 0, skipped: 0, note: "" };
    const ins = moves.filter((m) => m.kind !== "out").length;
    return {
      findings: [
        {
          key: "summary",
          title: `${plural(moves.length, "move")} in the next ${ctx.config.upcomingMoveDays} days`,
          why: `${plural(ins, "move-in")} and ${plural(moves.length - ins, "move-out")}: ${names(moves, (m) => m.tenantName || m.name)}. Confirm keys, inspections and deposits.`,
          urgency: moves.some((m) => (daysBetweenIso(ctx.p.asOf, m.moveDate) ?? 99) <= 7) ? "soon" : "routine",
          impact: null,
          grain: "summary",
          records: moves.map((m) => ({ type: "move", id: m.id, label: [m.kind === "out" ? "Move-out" : "Move-in", m.tenantName, n.unit.get(m.unitId) || m.unit].filter(Boolean).join(" · ") })),
          actions: [tab("Open moves", "Move-ins & Move-outs")],
        },
      ],
      examined: moves.length,
      skipped: 0,
      note: "",
    };
  },
};

export const LEASING_DETECTORS = [renewalAtRisk, leaseExpiringNoOffer, belowMarketRent, vacantTooLong, applicationPending, upcomingMoves];
