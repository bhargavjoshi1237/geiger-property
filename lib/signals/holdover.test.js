import { test } from "node:test";
import assert from "node:assert/strict";
import { leaseHoldover } from "./detectors/leasing";
import { resolveSignalConfig } from "./config";
import { resolveParams } from "@/lib/metrics/helpers";

// CORE-07 Needs Attention: live fixed-term leases past their term end with no accepted renewal (CORE-02 rules).

test("holdover signal: past term with no renewal, not renewed, mtm or ended leases", () => {
  const lease = (id, over) => ({ id, name: id, tenantName: `Tenant ${id}`, propertyId: "p1", status: "Active", termType: "fixed", termStart: "2025-11-01", termEnd: "2026-10-31", rent: 1500, metadata: {}, ...over });
  const src = {
    properties: [{ id: "p1", name: "Harbor Lofts" }],
    units: [],
    renewals: [{ id: "r1", leaseId: "renewed-row", status: "Accepted" }],
    leases: [
      lease("holding", { metadata: { holdover: { since: "2026-11-01" } } }),
      lease("notice", { status: "Notice given" }),
      lease("renewed-row"),
      lease("renewed-lease"),
      lease("successor", { status: "Pending", renewalOfId: "renewed-lease", termStart: "2026-11-01", termEnd: "2027-10-31", metadata: { renewalAcceptedOn: "2026-10-01" } }),
      lease("mtm", { termType: "mtm" }),
      lease("ended", { status: "Ended" }),
      lease("current", { termEnd: "2027-03-31" }),
      lease("elsewhere", { propertyId: "p2" }),
    ],
  };
  const now = new Date("2026-11-08T12:00:00");
  const ctx = { p: resolveParams({ asOf: "2026-11-08", propertyId: "p1" }, now), now, config: resolveSignalConfig({}) };
  const out = leaseHoldover.detect(src, ctx);
  assert.deepEqual(out.findings.map((f) => f.key).sort(), ["lease:holding", "lease:notice"]);
  const f = out.findings.find((x) => x.key === "lease:holding");
  assert.equal(f.metadata.since, "2026-11-01");
  assert.equal(f.metadata.flagged, true);
  assert.equal(f.impact, 1500);
});
