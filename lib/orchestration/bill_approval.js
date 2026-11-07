import { buildBill } from "@/lib/ledger/postings";
import { loadAccountIndex, postBuilt } from "@/lib/ledger/store";
import { logActivity } from "@/lib/messaging/threads";

// Server-side bill decisions for the review queue (CORE-47 slice). Mirrors the bill screen's Approve wizard
// (components/internal/screens/accounting/bills.jsx): approving an open bill posts it to Accounts Payable with the
// same idempotency key (`bill:<id>`), so approving here and on the bill screen can never post twice. The
// bill_review_sync trigger then resolves the approval item with the approver's name.

const OPEN = ["open", "partially paid"];
const today = () => new Date().toISOString().slice(0, 10);

async function loadBill(admin, projectId, billId) {
  const { data } = await admin.from("bills").select("*").eq("id", billId).maybeSingle();
  if (!data || data.deleted_at) throw new Error("Bill not found.");
  if (projectId && data.project_id && data.project_id !== projectId) throw new Error("That bill belongs to another project.");
  return data;
}

async function primaryOwner(admin, propertyId) {
  if (!propertyId) return undefined;
  const { data } = await admin.from("property_owners").select("owner_id, is_primary").eq("property_id", propertyId).is("deleted_at", null);
  return (data || []).find((o) => o.is_primary)?.owner_id || data?.[0]?.owner_id || undefined;
}

export async function approveBill(admin, { projectId, billId, actor, note = "" }) {
  const bill = await loadBill(admin, projectId, billId);
  if (!["pending", "rejected"].includes(String(bill.approval_status || "").toLowerCase())) {
    return { ok: true, message: `Bill is already ${String(bill.approval_status || "decided").toLowerCase()}.` };
  }
  const by = actor?.name || actor?.email || "Approver";
  const patch = { approval_status: "Approved", approver_name: by, approved_at: new Date().toISOString() };
  let posted = false;
  if (!bill.ledger_entry_id && OPEN.includes(String(bill.status || "").toLowerCase())) {
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
    patch.ledger_entry_id = await postBuilt(admin, built, { projectId: bill.project_id, createdBy: actor?.id || null });
    posted = true;
  }
  if (note) patch.metadata = { ...(bill.metadata || {}), approvalNote: note };
  const { error } = await admin.from("bills").update(patch).eq("id", bill.id);
  if (error) throw new Error(error.message);
  await logActivity(admin, {
    projectId: bill.project_id,
    ownerType: "bill",
    ownerId: bill.id,
    verb: "action",
    summary: `Approved bill from the Review Queue${posted ? " and posted it to Accounts Payable" : ""}`,
    actorId: actor?.id || null,
    actorName: by,
  });
  return { ok: true, message: posted ? "Bill approved and posted to Accounts Payable." : "Bill approved." };
}

export async function rejectBill(admin, { projectId, billId, actor, note = "" }) {
  const bill = await loadBill(admin, projectId, billId);
  const by = actor?.name || actor?.email || "Approver";
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
    summary: `Rejected bill from the Review Queue${note ? ` — ${note}` : ""}`,
    actorId: actor?.id || null,
    actorName: by,
  });
  return { ok: true, message: "Bill rejected." };
}
