import { canDecide, isBillGlAccount, isDepositRefundAccount, needsApproval, payeeLabel, payeeTypeOf, postRefusal, prepareBill } from "@/lib/accounting/bills";
import { accountLabel, buildBill } from "@/lib/ledger/postings";
import { loadAccountIndex, postBuilt } from "@/lib/ledger/store";
import { getProjectSetting } from "@/lib/messaging/context";
import { logActivity } from "@/lib/messaging/threads";
import { forProject } from "@/lib/supabase/scope";

// The single server-side bill path (CORE-09); every post uses idempotency key `bill:<id>`, so retries never double-post.

const OPEN = ["open", "partially paid"];
const today = () => new Date().toISOString().slice(0, 10);
const approvalOf = (bill) => String(bill.approval_status || "").toLowerCase();
const isApproved = (bill) => !approvalOf(bill) || ["not required", "approved"].includes(approvalOf(bill));
const byName = (actor) => actor?.name || actor?.email || "Approver";

export async function loadBill(admin, projectId, billId) {
  const { data } = await admin.from("bills").select("*").eq("id", billId).maybeSingle();
  if (!data || data.deleted_at) throw new Error("Bill not found.");
  if (!data.project_id || (projectId && data.project_id !== projectId)) throw new Error("That bill belongs to another project.");
  return data;
}

export async function billApprovalLimit(admin, projectId) {
  const settings = (await getProjectSetting(admin, projectId, "accounting_settings")) || {};
  return Number(settings.billApprovalLimit) || 0;
}

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// A credit balance a deposit refund pays out (CORE-13): tenant AR applied to the credit's entry.
const isCreditRefundLine = (account, line) => account?.systemKey === "accounts_receivable" && Boolean(line.appliesToEntryId);

// Split lines for a bill (metadata.lines): each an expense account, or 2100 / 2110 and AR credit refunds when `refund` (a server-raised deposit refund, CORE-04/13); they must total the bill.
function billLines(bill, acct, { refund = false } = {}) {
  const lines = Array.isArray(bill.metadata?.lines) ? bill.metadata.lines : null;
  if (!lines?.length) return null;
  const out = lines
    .map((l) => ({ glAccountId: l.glAccountId, amount: r2(l.amount), memo: l.memo || "", ...(l.appliesToEntryId ? { appliesToEntryId: l.appliesToEntryId } : {}), ...(l.metadata ? { metadata: l.metadata } : {}) }))
    .filter((l) => l.amount > 0);
  for (const l of out) {
    const account = acct.byId.get(l.glAccountId);
    if (!isBillGlAccount(account) && !(refund && (isDepositRefundAccount(account) || isCreditRefundLine(account, l)))) throw new Error("Pick an expense account for every bill line.");
  }
  if (Math.abs(r2(out.reduce((s, l) => s + l.amount, 0)) - r2(bill.amount)) > 0.004) throw new Error("The bill's lines don't add up to its amount.");
  return out;
}

// A deposit refund is a tenant bill some deposit record claims (refund_bill_id is server-written), so a browser-set flag can't debit 2100 / 2110.
async function isDepositRefundBill(admin, bill) {
  if (!bill.metadata?.depositRefund || payeeTypeOf(bill) !== "tenant") return false;
  const { data, error } = await forProject(admin.from("security_deposits").select("id"), bill.project_id).eq("refund_bill_id", bill.id).is("deleted_at", null).limit(1);
  if (error) throw new Error(error.message);
  return Boolean(data?.length);
}

// Post an approved, open bill to AP (Dr expense / Cr 2000) and stamp ledger_entry_id → { posted, entryId }; tenant / owner payees carry their dimension.
export async function postBillToAp(admin, bill, actor) {
  if (bill.ledger_entry_id) return { posted: false, entryId: bill.ledger_entry_id };
  if (!OPEN.includes(String(bill.status || "").toLowerCase()) || !isApproved(bill)) return { posted: false, entryId: null };
  const acct = await loadAccountIndex(admin, bill.project_id);
  const refund = await isDepositRefundBill(admin, bill);
  const payee = payeeTypeOf(bill);
  const name = payeeLabel(bill);
  const built = buildBill(
    {
      date: bill.bill_date || today(),
      amount: bill.amount,
      glAccountId: bill.gl_account_id || undefined,
      lines: billLines(bill, acct, { refund }) || undefined,
      vendorId: payee === "vendor" ? bill.vendor_id || undefined : undefined,
      tenantId: payee === "tenant" ? bill.tenant_id || undefined : undefined,
      ownerId: payee === "owner" ? bill.owner_id || undefined : undefined,
      leaseId: bill.metadata?.leaseId || undefined,
      propertyId: bill.property_id || undefined,
      unitId: bill.unit_id || undefined,
      jobId: bill.job_id || undefined,
      memo: `Bill: ${bill.name || "Bill"}${name ? ` · ${name}` : ""}`,
      sourceId: bill.id,
      idempotencyKey: `bill:${bill.id}`,
      // An owner payout belongs to that owner outright (CORE-08 keeps owner_id only on owner-specific entries).
      ...(payee === "owner" ? { metadata: { ownerExplicit: true } } : {}),
    },
    acct,
  );
  if (built.error) throw new Error(`Couldn't post the bill to Accounts Payable: ${built.error}`);
  const entryId = await postBuilt(admin, built, { projectId: bill.project_id, createdBy: actor?.id || null });
  const { error } = await admin.from("bills").update({ ledger_entry_id: entryId }).eq("id", bill.id);
  if (error) throw new Error(error.message);
  return { posted: true, entryId };
}

// Default or validate the bill account → { id, label, note }; a missing default falls back to null only for a bill that won't post yet.
function resolveGl(acct, { glAccountId, glKey, willPost = true }) {
  const account = glAccountId ? acct.byId.get(glAccountId) : acct.byKey.get(glKey);
  if (isBillGlAccount(account)) return { id: account.id, label: accountLabel(account), note: "" };
  if (glAccountId) throw new Error("Pick an expense account for this bill.");
  if (!willPost) return { id: null, label: "", note: "No default expense account in the chart; set one before approving." };
  throw new Error("The default expense account is missing from the chart of accounts. Pick an expense account for this bill.");
}

// Create a bill: apply the approval limit, default the GL, copy dimensions, post to AP when no approval is needed; opts.depositRefund is for lib/billing/deposits.js only, never a route body.
export async function createBill(admin, input, actor, { depositRefund = false } = {}) {
  const projectId = input.projectId;
  if (!projectId) throw new Error("projectId is required.");
  let workOrder = null;
  if (input.workOrderId) {
    const { data } = await admin.from("work_orders").select("*").eq("id", input.workOrderId).is("deleted_at", null).maybeSingle();
    if (!data || data.project_id !== projectId) throw new Error("Work order not found.");
    workOrder = data;
  }
  const limit = await billApprovalLimit(admin, projectId);
  const { row, approvalRequired, glKey } = prepareBill({ ...input, billDate: input.billDate || today() }, { approvalLimit: limit, workOrder });
  if (!(row.amount > 0)) throw new Error("Enter an amount above zero.");
  if (row.payee_type === "tenant" && !row.tenant_id) throw new Error("Pick the tenant this bill pays.");
  if (row.payee_type === "owner" && !row.owner_id) throw new Error("Pick the owner this bill pays.");
  const acct = await loadAccountIndex(admin, projectId);
  // Only the deposit service raises a deposit refund; a client body can't mark one.
  if (row.metadata?.depositRefund) row.metadata = Object.fromEntries(Object.entries(row.metadata).filter(([k]) => k !== "depositRefund"));
  if (Array.isArray(input.lines) && input.lines.length) {
    // Split bill (a deposit refund's 2100 / 2110 lines): validated now and again when it posts.
    row.metadata = { ...row.metadata, lines: input.lines };
    if (depositRefund) row.metadata.depositRefund = true;
    const lines = billLines(row, acct, { refund: depositRefund && row.payee_type === "tenant" });
    row.metadata.lines = lines;
    row.gl_account_id = lines[0].glAccountId;
    if (!row.account) row.account = accountLabel(acct.byId.get(lines[0].glAccountId));
  } else {
    const gl = resolveGl(acct, { glAccountId: row.gl_account_id, glKey, willPost: !approvalRequired && row.status === "Open" });
    row.gl_account_id = gl.id;
    if (!row.account) row.account = gl.label;
    if (gl.note) row.metadata = { ...row.metadata, glNote: gl.note };
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

// Open a confirmed draft (intake): apply the limit, default the GL, then post to AP unless it waits for approval.
export async function openBill(admin, bill, actor, patch = {}) {
  const limit = await billApprovalLimit(admin, bill.project_id);
  const amount = Number(patch.amount ?? bill.amount) || 0;
  if (amount <= 0) throw new Error("Add the bill amount first.");
  const pendingApproval = needsApproval(amount, limit);
  const full = { ...patch, amount, status: "Open", approval_status: pendingApproval ? "Pending" : "Not required" };
  // A split bill keeps its lines (checked again when it posts).
  if (!bill.metadata?.lines?.length) {
    const gl = resolveGl(await loadAccountIndex(admin, bill.project_id), { glAccountId: bill.gl_account_id || undefined, glKey: "repairs_maintenance", willPost: !pendingApproval });
    full.gl_account_id = gl.id;
    if (!bill.account && gl.label) full.account = gl.label;
    if (gl.note) full.metadata = { ...(patch.metadata || bill.metadata || {}), glNote: gl.note };
  }
  const { data, error } = await admin.from("bills").update(full).eq("id", bill.id).eq("status", "Draft").select("*").maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { bill, opened: false, posted: false, pendingApproval: false, postError: "" };
  let result = { posted: false, entryId: null };
  let postError = "";
  if (!pendingApproval) {
    try {
      result = await postBillToAp(admin, data, actor);
    } catch (e) {
      postError = e?.message || "Couldn't post the bill to Accounts Payable.";
    }
  }
  return { bill: result.entryId ? { ...data, ledger_entry_id: result.entryId } : data, opened: true, posted: Boolean(result.entryId), pendingApproval, postError };
}

// Approve a pending/rejected bill and post it once; approving again changes nothing.
export async function approveBill(admin, { projectId, billId, actor, note = "", via = "" }) {
  const bill = await loadBill(admin, projectId, billId);
  if (!["pending", "rejected"].includes(approvalOf(bill))) {
    return { ok: true, posted: false, message: `Bill is already ${approvalOf(bill) || "decided"}.` };
  }
  const by = byName(actor);
  const patch = { approval_status: "Approved", approver_name: by, approved_at: new Date().toISOString() };
  if (note) patch.metadata = { ...(bill.metadata || {}), approvalNote: note };
  const { posted } = await postBillToAp(admin, { ...bill, ...patch }, actor);
  const { error } = await admin.from("bills").update(patch).eq("id", bill.id);
  if (error) throw new Error(error.message);
  await logActivity(admin, {
    projectId: bill.project_id,
    ownerType: "bill",
    ownerId: bill.id,
    verb: "action",
    summary: `Approved bill${via ? ` from ${via}` : ""}${posted ? " and posted it to Accounts Payable" : ""}`,
    actorId: actor?.id || null,
    actorName: by,
  });
  return { ok: true, posted, message: posted ? "Bill approved and posted to Accounts Payable." : "Bill approved." };
}

export async function rejectBill(admin, { projectId, billId, actor, note = "", via = "" }) {
  const bill = await loadBill(admin, projectId, billId);
  if (!canDecide(bill)) return { ok: true, message: `Bill is already ${approvalOf(bill) || "decided"}.` };
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
    summary: `Rejected bill${via ? ` from ${via}` : ""}${note ? ` — ${note}` : ""}`,
    actorId: actor?.id || null,
    actorName: by,
  });
  return { ok: true, message: "Bill rejected." };
}

// Post an already-approved bill that never reached AP (the screen's "Post to Accounts Payable" and pay-time catch-up).
export async function postApprovedBill(admin, { projectId, billId, actor }) {
  const bill = await loadBill(admin, projectId, billId);
  const refusal = postRefusal(bill, await billApprovalLimit(admin, bill.project_id));
  if (refusal) throw new Error(refusal);
  if (!OPEN.includes(String(bill.status || "").toLowerCase()) && !bill.ledger_entry_id) throw new Error("Only open bills post to Accounts Payable.");
  const res = await postBillToAp(admin, bill, actor);
  return { ok: true, posted: res.posted, entryId: res.entryId };
}

// Open a draft bill from the screen: same path as intake confirm (limit, default GL, AP post).
export async function openDraftBill(admin, { projectId, billId, actor }) {
  const bill = await loadBill(admin, projectId, billId);
  if (bill.status !== "Draft") return { ok: true, opened: false, message: "This bill is already open." };
  const res = await openBill(admin, bill, actor);
  return { ok: true, ...res, message: res.pendingApproval ? "Bill opened and waiting for approval." : res.posted ? "Bill opened and posted to Accounts Payable." : "Bill opened." };
}
