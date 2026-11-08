import { PLAYBOOKS } from "./index";

// In-product playbook recommendations (ORCH-07, H1 — instead of consultants). Pure: given open signals and a little
// project data, each rule returns a reason only while its condition holds, so a recommendation disappears once
// the cause is gone or the playbook is installed.
//   recommendPlaybooks({ signals, installs, tenants, leases, renewals, workOrders, onlinePayments, now })
//   → [{ playbookKey, title, reason, count }], strongest first.

const DAY = 86400000;
const isoDay = (d) => new Date(d).toISOString().slice(0, 10);
const open = (signals, keys) => (signals || []).filter((s) => keys.includes(s.detectorKey) && ["open", "acknowledged"].includes(s.status || "open"));
const refsCount = (list) => list.reduce((n, s) => n + Math.max(1, Array.isArray(s.recordRefs) ? s.recordRefs.length : 0), 0);
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const RULES = {
  // Tenants arrive with their ledger balance joined (withTenantBalances, CORE-07).
  collections_ladder: ({ tenants }) => {
    const owing = (tenants || []).filter((t) => Number(t.balance) > 0 && t.status !== "Past").length;
    return owing >= 5 ? { count: owing, reason: `${plural(owing, "tenant")} owe rent right now.` } : null;
  },
  renewal_pipeline: ({ leases, renewals, now }) => {
    const today = isoDay(now);
    const until = isoDay(now.getTime() + 90 * DAY);
    const offered = new Set((renewals || []).filter((r) => r.status && r.status !== "Not started").map((r) => r.leaseId));
    const n = (leases || []).filter(
      (l) => ["Active", "Expiring soon"].includes(l.status) && l.termEnd && l.termEnd >= today && l.termEnd <= until && !offered.has(l.id),
    ).length;
    return n ? { count: n, reason: `${plural(n, "lease")} end within 90 days with no renewal offer.` } : null;
  },
  maintenance_intake: ({ workOrders }) => {
    const n = (workOrders || []).filter((w) => w.kind === "request" && ["Submitted", "In review"].includes(w.status)).length;
    return n >= 3 ? { count: n, reason: `${plural(n, "maintenance request")} are waiting for triage.` } : null;
  },
  autopay_failure_recovery: ({ onlinePayments, now }) => {
    const since = now.getTime() - 30 * DAY;
    const n = (onlinePayments || []).filter((p) => p.source === "autopay" && ["failed", "returned"].includes(p.status) && new Date(p.createdAt).getTime() >= since).length;
    return n ? { count: n, reason: `${plural(n, "autopay payment")} failed in the last 30 days.` } : null;
  },
};

// Signal-backed rule: any open signal a playbook answers.
function fromSignals(playbook, signals) {
  if (!playbook.signals?.length) return null;
  const hits = open(signals, playbook.signals);
  if (!hits.length) return null;
  const n = refsCount(hits);
  return { count: n, reason: hits[0].title ? `${hits[0].title}${hits.length > 1 ? ` (+${hits.length - 1} more signal${hits.length === 2 ? "" : "s"})` : ""}` : `${plural(n, "open signal")} this playbook handles.` };
}

export function recommendPlaybooks({ signals = [], installs = [], now = new Date(), ...data } = {}) {
  const installed = new Set((installs || []).filter((i) => i.status !== "removed").map((i) => i.playbookKey));
  const out = [];
  for (const p of PLAYBOOKS) {
    if (installed.has(p.key)) continue;
    const rule = RULES[p.key];
    // Data rules decide where they exist (collections waits for 5+ delinquent tenants); others follow open signals.
    const hit = rule ? rule({ ...data, now }) : fromSignals(p, signals);
    if (hit) out.push({ playbookKey: p.key, title: p.title, ...hit });
  }
  return out.sort((a, b) => b.count - a.count);
}
