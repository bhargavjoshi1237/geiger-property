import { prepareBill } from "@/lib/accounting/bills";
import { buildBill } from "@/lib/ledger/postings";
import { loadAccountIndex, postBuilt } from "@/lib/ledger/store";
import { getProjectSetting } from "@/lib/messaging/context";
import { logActivity } from "@/lib/messaging/threads";

// The single server-side bill path (CORE-09): create applies the approval limit and posts to Accounts Payable,
// approve posts once. Every post uses idempotency key `bill:<id>`, so retries and the review queue can never double-post.

const OPEN = ["open", "partially paid"];
const today = () => new Date().toISOString().slice(0, 10);
const approvalOf = (bill) => String(bill.approval_status || "").toLowerCase();
const isApproved = (bill) => !approvalOf(bill) || ["not required", "approved"].includes(approvalOf(bill));
const byName = (actor) => actor?.name || actor?.email || "Approver";

export async function loadBill(admin, projectId, billId) {
  const { data } = await admin.from("bills").select("*").eq("id", billId).maybeSingle();
  if (!data || data.deleted_at) throw new Error("Bill not found.");
  if (projectId && data.project_id && data.project_id !== projectId) throw new Error("That bill belongs to another project.");
  return data;
}

export async function billApprovalLimit(admin, projectId) {
  const settings = (await getProjectSetting(admin, projectId, "accounting_settings")) || {};
  return Number(settings.billApprovalLimit) || 0;
}

async function primaryOwner(admin, propertyId) {
  if (!propertyId) return undefined;
  const { data } = await admin.from("property_owners").select("owner_id, is_primary").eq("property_id", propertyId).is("deleted_at", null);
  return (data || []).find((o) => o.is_primary)?.owner_id || data?.[0]?.owner_id || undefined;
}

// Post an approved, open bill to AP (Dr expense / Cr 2000) and stamp ledger_entry_id → { posted, entryId }.
export async function postBillToAp(admin, bill, actor) {
  if (bill.ledger_entry_id) return { posted: false, entryId: bill.ledger_entry_id };
  if (!OPEN.includes(String(bill.status || "").toLowerCase()) || !isApproved(bill)) return { posted: false, entryId: null };
  const acct = await loadAccountIndex(admin, bill.project_id);
  const built = buildBill(
    {
      date: bill.bill_date || today(),
      amount: bill.amount,
      glAccountId: bill.gl_account_id || undefined,
      vendorId: bill.vendor_id || undefined,
      propertyId: bill.property_id || undefined,
      unitId: bill.unit_id || undefined,
      jobId: bill.job_id || undefined,
      ownerId: await primaryOwner(admin, bill.property_id),
      memo: `Bill: ${bill.name || "Bill"}${bill.vendor_name ? ` · ${bill.vendor_name}` : ""}`,
      sourceId: bill.id,
      idempotencyKey: `bill:${bill.id}`,
    },
    acct,
  );
  if (built.error) throw new Error(`Couldn't post the bill to Accounts Payable: ${built.error}`);
  const entryId = await postBuilt(admin, built, { projectId: bill.project_id, createdBy: actor?.id || null });
  const { error } = await admin.from("bills").update({ ledger_entry_id: entryId }).eq("id", bill.id);
  if (error) throw new Error(error.message);
  return { posted: true, entryId };
}

// Create a bill: apply the approval limit, default the GL, copy dimensions, post to AP when no approval is needed.
export async function createBill(admin, input, actor) {
  const projectId = input.projectId;
  if (!projectId) throw new Error("projectId is required.");
  let workOrder = null;
  if (input.workOrderId) {
    const { data } = await admin.from("work_orders").select("*").eq("id", input.workOrderId).is("deleted_at", null).maybeSingle();
    if (!data || (data.project_id && data.project_id !== projectId)) throw new Error("Work order not found.");
    workOrder = data;
  }
  const limit = await billApprovalLimit(admin, projectId);
  const { row, approvalRequired, glKey } = prepareBill({ ...input, billDate: input.billDate || today() }, { approvalLimit: limit, workOrder });
  if (!(row.amount > 0)) throw new Error("Enter an amount above zero.");
  if (glKey) {
    const acct = await loadAccountIndex(admin, projectId);
    row.gl_account_id = acct.byKey.get(glKey)?.id || null;
  }
  const { data: bill, error } = await admin
    .from("bills")
    .insert({ ...row, project_id: projectId, created_by: actor?.id || null })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  let result = { posted: false, entryId: null };
  let postError = "";
  if (!approvalRequired && row.status === "Open") {
    try {
      result = await postBillToAp(admin, bill, actor);
    } catch (e) {
      postError = e?.message || "Couldn't post the bill to Accounts Payable.";
    }
  }
  const saved = result.entryId ? { ...bill, ledger_entry_id: result.entryId } : bill;
  return { bill: saved, posted: Boolean(result.entryId), pendingApproval: approvalRequired, limit, postError };
}

// Approve a pending/rejected bill and post it once; approving again changes nothing.
export async function approveBill(admin, { projectId, billId, actor, note = "" }) {
  const bill = await loadBill(admin, projectId, billId);
  if (!["pending", "rejected"].includes(approvalOf(bill))) {
    return { ok: true, posted: false, message: `Bill is already ${approvalOf(bill) || "decided"}.` };
  }
  const by = byName(actor);
  const patch = { approval_status: "Approved", approver_name: by, approved_at: new Date().toISOString() };
  if (note) patch.metadata = { ...(bill.metadata || {}), approvalNote: note };
  let posted = false;
  try {
    ({ posted } = await postBillToAp(admin, { ...bill, ...patch }, actor));
  } catch (e) {
    throw new Error(e?.message || "Couldn't post the bill to Accounts Payable.");
  }
  const { error } = await admin.from("bills").update(patch).eq("id", bill.id);
  if (error) throw new Error(error.message);
  await logActivity(admin, {
    projectId: bill.project_id,
    ownerType: "bill",
    ownerId: bill.id,
    verb: "action",
    summary: `Approved bill${posted ? " and posted it to Accounts Payable" : ""}`,
    actorId: actor?.id || null,
    actorName: by,
  });
  return { ok: true, posted, message: posted ? "Bill approved and posted to Accounts Payable." : "Bill approved." };
}

export async function rejectBill(admin, { projectId, billId, actor, note = "" }) {
  const bill = await loadBill(admin, projectId, billId);
  const by = byName(actor);
  const { error } = await admin
    .from("bills")
    .update({ approval_status: "Rejected", approver_name: by, ...(note ? { metadata: { ...(bill.metadata || {}), approvalNote: note } } : {}) })
    .eq("id", bill.id);
  if (error) throw new Error(error.message);
  await logActivity(admin, {
    projectId: bill.project_id,
    ownerType: "bill",
    ownerId: bill.id,
    verb: "action",
    summary: `Rejected bill${note ? ` — ${note}` : ""}`,
    actorId: actor?.id || null,
    actorName: by,
  });
  return { ok: true, message: "Bill rejected." };
}

// Post an already-approved bill that never reached AP (the screen's "Post to Accounts Payable" and pay-time catch-up).
export async function postApprovedBill(admin, { projectId, billId, actor }) {
  const bill = await loadBill(admin, projectId, billId);
  if (!isApproved(bill)) throw new Error("This bill is waiting for approval.");
  if (!OPEN.includes(String(bill.status || "").toLowerCase()) && !bill.ledger_entry_id) throw new Error("Only open bills post to Accounts Payable.");
  const res = await postBillToAp(admin, bill, actor);
  return { ok: true, posted: res.posted, entryId: res.entryId };
}
