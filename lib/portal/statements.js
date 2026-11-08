import { buildStatement, statementMonths } from "@/lib/billing/statements";
import { projectToday } from "@/lib/jobs/business_date";

// Server-only resident statements in the portal (CORE-12): the same buildStatement the office prints and emails, only for the
// member's own leases inside their project; months come back newest first with each one's closing balance.

const MAX_LEASES = 5;

// The resident's leases, current lease first.
const ownLeases = (rc) => [rc.lease, ...rc.leases.filter((l) => l.id !== rc.lease?.id)].filter(Boolean).slice(0, MAX_LEASES);

const leaseLabel = (l, rc) => [rc.property?.name, l.unit ? `Unit ${l.unit}` : "", l.name && !l.unit ? l.name : ""].filter(Boolean).join(" · ") || "Lease";

// [{ leaseId, name, current, months: [{ period, label, closing, toDate }] }] — the current lease always, older ones with activity.
export async function residentStatementList(ctx, rc) {
  const today = await projectToday(ctx.admin, ctx.projectId);
  const out = [];
  for (const lease of ownLeases(rc)) {
    const current = lease.id === rc.lease?.id;
    const months = await statementMonths(ctx.admin, ctx.projectId, lease.id, { today });
    if (months.length || current) out.push({ leaseId: lease.id, name: leaseLabel(lease, rc), current, months });
  }
  return out;
}

// One month's statement for one of the resident's leases (the current one by default), else null.
export async function residentStatement(ctx, rc, { period, leaseId, origin = "" } = {}) {
  const lease = leaseId ? rc.leases.find((l) => l.id === leaseId) : rc.lease;
  if (!lease) return null;
  return buildStatement(ctx.admin, lease.id, { projectId: ctx.projectId, period, origin });
}
