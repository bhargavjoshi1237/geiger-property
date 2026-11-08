import { readJson } from "@/lib/auth/staff";
import { billingAccess, billingError, entryView } from "@/lib/billing/http";
import { disposeDeposit, loadDeposit } from "@/lib/billing/deposits";

// POST — dispose a deposit (CORE-04 engine for CORE-13): deductions, apply to open charges, AP refund bill, release. commit:false previews. Body { projectId, commit, deductions?, version?, date? }.

export async function POST(request, { params }) {
  const { id } = await params;
  const { projectId, commit, deductions, version, date } = await readJson(request);
  const gate = await billingAccess(request, projectId, "property.accounting.post", "Disposing a deposit posts to the ledger, which your role can't do.");
  if (gate.response) return gate.response;
  try {
    const deposit = await loadDeposit(gate.admin, id, projectId);
    const res = await disposeDeposit(gate.admin, deposit, { actor: gate.auth.user, commit: commit === true, deductions, version: Number(version) || 1, date });
    return Response.json({
      ok: true,
      preview: res.preview,
      entries: entryView(res.entries),
      bill: res.bill ? { id: res.bill.id, name: res.bill.name, amount: Number(res.bill.amount), status: res.bill.status, approvalStatus: res.bill.approval_status, posted: Boolean(res.bill.ledger_entry_id) } : null,
      pendingApproval: res.pendingApproval || false,
      postError: res.postError || "",
      status: res.status || null,
      disposition: res.disposition || null,
    });
  } catch (e) {
    return billingError(e, "Couldn't dispose the deposit.");
  }
}
