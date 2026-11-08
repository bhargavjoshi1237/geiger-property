// Pure renewal helpers shared by the server renewal path (lib/billing/renewal.js onRenewalAccepted); no I/O.

// Lease metadata keys a renewal carries to the new lease (HOUS-01 adds the housing-assistance keys here).
export const CARRY_META = [
  "policyOverrides",
  "utilities",
  "landlord",
  "address",
  "clauses",
  "insuranceRequired",
  "insuranceMinLiability",
  "renewalOption",
  "noticeDays",
  "petDeposit",
  "premises",
];

const day = (v) => (v ? String(v).slice(0, 10) : null);

// The renewed lease row (snake_case, Pending) for an old lease row and an accepted renewal row; renewalAcceptedOn makes it bill from its start.
export function renewalLeaseRow(old, renewal, { id, createdBy = null, acceptedOn = null } = {}) {
  const meta = old.metadata && typeof old.metadata === "object" ? old.metadata : {};
  const carried = Object.fromEntries(CARRY_META.filter((k) => k in meta).map((k) => [k, meta[k]]));
  const newStart = day(renewal.new_start);
  return {
    id,
    project_id: old.project_id || renewal.project_id || null,
    name: `${old.name || "Lease"} (renewal${newStart ? ` ${newStart.slice(0, 4)}` : ""})`,
    unit: old.unit || null,
    unit_id: old.unit_id || null,
    tenant_id: old.tenant_id || null,
    tenant_name: old.tenant_name || null,
    property_id: old.property_id || null,
    rent: renewalRent(old, renewal),
    deposit: Number(old.deposit) || 0,
    term_start: newStart,
    term_end: day(renewal.new_end),
    lease_type: old.lease_type || "residential",
    term_type: "fixed",
    move_in_date: day(old.move_in_date) || day(old.term_start),
    template_id: old.template_id || null,
    renewal_of_id: old.id,
    status: "Pending",
    created_by: createdBy,
    metadata: { ...carried, renewalId: renewal.id, renewedFromName: old.name || "", ...(acceptedOn ? { renewalAcceptedOn: acceptedOn } : {}) },
  };
}

// The new term's monthly rent: the agreed proposal, else the offer, else today's rent.
export const renewalRent = (old, renewal) =>
  Number(renewal.proposed_rent) || Number(renewal.offered_rent) || Number(old.rent) || 0;
