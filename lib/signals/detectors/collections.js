import { computeMetric } from "@/lib/metrics/index";
import { delinquentRows } from "@/lib/metrics/helpers";
import { isoLocal, parseIso } from "@/lib/reports/periods";
import { money, names, playbook, plural, report, tab, workflow } from "./shared";

// Collections detectors: per-tenant delinquency (plus the old Needs Attention "Overdue rent" summary)
// and the month-over-month collection-rate trend.

const late = (rows, ctx) => rows.filter((r) => r.oldestDays > ctx.config.delinquencyGraceDays && r.balance >= ctx.config.minDelinquentBalance);

export const rentDelinquency = {
  key: "rent_delinquency",
  label: "Rent delinquency",
  area: "collections",
  category: "risk",
  description: "Tenants with rent unpaid past the grace period, ranked by balance; one summary plus one signal per tenant.",
  sources: ["ledger", "leases", "tenants", "units", "properties"],
  detect(src, ctx) {
    const all = delinquentRows(src, ctx.p);
    const rows = late(all, ctx);
    const findings = rows.map((r) => {
      const tenantId = r.tenantId;
      const urgent = r.oldestDays > 30;
      return {
        key: r.leaseId ? `lease:${r.leaseId}` : `tenant:${tenantId}`,
        title: `${r.tenant} owes ${money(r.balance)}`,
        why: `${r.tenant}${r.unit ? ` (${r.unit})` : ""} has ${money(r.balance)} unpaid; the oldest charge is ${r.oldestDays} days old (late after ${ctx.config.delinquencyGraceDays}).${r.lastPayment ? ` Last payment ${r.lastPayment}.` : " No payment on record."}`,
        urgency: urgent ? "urgent" : "soon",
        propertyId: r.propertyId,
        impact: r.balance,
        grain: "record",
        records: [
          ...(tenantId ? [{ type: "tenant", id: tenantId, label: r.tenant, amount: r.balance }] : []),
          ...(r.leaseId ? [{ type: "lease", id: r.leaseId, label: [r.tenant, r.unit].filter(Boolean).join(" · ") }] : []),
        ],
        actions: [
          playbook("collections_ladder", "Run collections", "tenant", tenantId ? [tenantId] : []),
          r.leaseId ? tab("Open lease", "Leases", r.leaseId) : tab("Open tenant", "Tenants", tenantId),
          report("Delinquency report", "Delinquency"),
        ],
        metadata: { oldestDays: r.oldestDays, over60: r.b61 + r.b91 },
      };
    });
    if (rows.length) {
      // Impact is the whole delinquent balance (the delinquent_balance metric), so Overview, report and briefing agree.
      const total = Math.round(all.reduce((s, r) => s + r.balance, 0) * 100) / 100;
      const late = rows.reduce((s, r) => s + r.balance, 0);
      const tenantIds = rows.map((r) => r.tenantId).filter(Boolean);
      findings.push({
        key: "summary",
        title: `${plural(rows.length, "tenant")} behind on rent`,
        why: `${money(total)} owed in total${late < total - 0.004 ? `, ${money(late)} of it past the ${ctx.config.delinquencyGraceDays}-day grace period` : ""}: ${names(rows, (r) => r.tenant)}. ${plural(rows.filter((r) => r.oldestDays > 30).length, "account")} more than 30 days late.`,
        urgency: "urgent",
        impact: total,
        grain: "summary",
        records: rows.map((r) => ({ type: r.tenantId ? "tenant" : "lease", id: r.tenantId || r.leaseId, label: [r.tenant, r.unit].filter(Boolean).join(" · "), amount: r.balance })),
        actions: [
          playbook("collections_ladder", "Run collections", "tenant", tenantIds),
          workflow("Run a workflow…", "tenant", tenantIds),
          report("Delinquency report", "Delinquency"),
        ],
      });
    }
    return { findings, examined: all.length, skipped: 0, note: "" };
  },
};

export const collectionRateDrop = {
  key: "collection_rate_drop",
  label: "Collection rate down",
  area: "collections",
  category: "trend",
  description: "Last month's collection rate fell against the month before by more than the threshold.",
  sources: ["ledger", "properties"],
  detect(src, ctx) {
    const d = parseIso(ctx.p.asOf);
    const month = (offset) => ({ from: isoLocal(new Date(d.getFullYear(), d.getMonth() - offset, 1)), to: isoLocal(new Date(d.getFullYear(), d.getMonth() - offset + 1, 0)) });
    const last = month(1);
    const prior = month(2);
    const at = (r) => computeMetric("collection_rate", src, { ...ctx.p, asOf: r.to, from: r.from, to: r.to });
    const billed = computeMetric("rent_billed", src, { ...ctx.p, asOf: last.to, from: last.from, to: last.to })?.value || 0;
    const a = at(last)?.value;
    const b = at(prior)?.value;
    if (a === null || b === null || a === undefined || b === undefined) return { findings: [], examined: 0, skipped: 0, note: "Not enough billing history to compare." };
    const drop = (b - a) * 100;
    if (drop < ctx.config.collectionDropPoints) return { findings: [], examined: 2, skipped: 0, note: "" };
    const label = (r) => parseIso(r.from).toLocaleDateString("en-US", { month: "long" });
    return {
      findings: [
        {
          key: last.from.slice(0, 7),
          title: `Collection rate fell to ${(a * 100).toFixed(0)}% in ${label(last)}`,
          why: `${label(last)} collected ${(a * 100).toFixed(0)}% of what was billed, down ${drop.toFixed(0)} points from ${(b * 100).toFixed(0)}% in ${label(prior)}.`,
          urgency: drop >= 15 ? "urgent" : "soon",
          impact: Math.round((b - a) * billed * 100) / 100,
          grain: "summary",
          records: [],
          actions: [report("Delinquency report", "Delinquency"), tab("Rent collection", "Rent Collection")],
          metadata: { rate: a, previous: b },
        },
      ],
      examined: 2,
      skipped: 0,
      note: "",
    };
  },
};

export const COLLECTIONS_DETECTORS = [rentDelinquency, collectionRateDrop];
