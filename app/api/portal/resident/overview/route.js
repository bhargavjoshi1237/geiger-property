import { listAnnouncements } from "@/lib/portal/common";
import { portalJson, todayISO } from "@/lib/portal/http";
import {
  homeView,
  listInsurance,
  listRequests,
  residentContext,
  residentLedger,
  residentPayments,
  residentPermissions,
} from "@/lib/portal/resident";
import { withPortal } from "@/lib/portal/session";

// GET — resident dashboard: home, balance + recent ledger, requests, notices, insurance.
export const GET = withPortal(
  async (ctx) => {
    const rc = await residentContext(ctx);
    const permissions = residentPermissions(ctx);
    const [ledger, requests, announcements, insurance, payments] = await Promise.all([
      residentLedger(ctx, rc),
      listRequests(ctx),
      listAnnouncements(ctx, { propertyId: rc.property?.id, buildingId: rc.buildingId }),
      listInsurance(ctx),
      residentPayments(ctx),
    ]);
    const today = todayISO();
    const current = insurance.policies.find((p) => p.status !== "Cancelled" && p.endsOn >= today) || null;
    return portalJson({
      home: homeView(rc),
      permissions,
      ledger: {
        source: ledger.source,
        balance: ledger.balance,
        credit: ledger.credit,
        recent: permissions.ledger ? ledger.rows.slice(0, 6) : [],
        openCharges: ledger.openCharges.length,
      },
      requests: { open: requests.filter((r) => r.open).length, recent: requests.slice(0, 3) },
      announcements: announcements.slice(0, 3),
      insurance: { required: insurance.required, current },
      autopay: payments.autopay,
    });
  },
  { role: "resident" },
);
