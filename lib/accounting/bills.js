// Pure bill preparation shared by every bill-creation path (CORE-09): approval limit, default GL, dimension copy.

export const BILL_GL_KEYS = { repairs: "repairs_maintenance", turnover: "turnover", capital: "capital_improvements" };

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const text = (v) => String(v ?? "").trim();

// Default chart key for a work order's bill: turns → turnover, capital work → capital improvements, else repairs.
export function workOrderGlKey(wo = {}) {
  const meta = wo.metadata || {};
  const label = `${text(wo.category)} ${text(meta.expenseType)} ${text(meta.billType)}`.toLowerCase();
  if (wo.unitTurnId || wo.unit_turn_id || /turn|make.?ready/.test(label)) return BILL_GL_KEYS.turnover;
  if (/capital|improvement|renovat/.test(label)) return BILL_GL_KEYS.capital;
  return BILL_GL_KEYS.repairs;
}

const BILL_GL_ALLOWED = Object.values(BILL_GL_KEYS);
export const allowedBillGlKey = (key) => (BILL_GL_ALLOWED.includes(key) ? key : null);
// Bills debit an Expense account, or a fixed/capital asset; never cash, receivables, deposits or other current assets.
export const isBillGlAccount = (account) =>
  Boolean(account) &&
  (account.accountType === "Expense" || (account.accountType === "Asset" && (account.subtype === "fixed_asset" || account.systemKey === BILL_GL_KEYS.capital)));

const approvalOf = (bill) => String(bill?.approval_status ?? bill?.approvalStatus ?? "").toLowerCase();

// Why an approved-looking bill can't post yet: still pending/rejected, or edited above the limit since it was approved as not required.
export function postRefusal(bill, limit) {
  const a = approvalOf(bill);
  if (a === "pending" || a === "rejected") return "This bill is waiting for approval.";
  if ((!a || a === "not required") && needsApproval(bill?.amount, limit)) return "This bill is over the approval limit and needs approval before it posts.";
  return null;
}

// Only a pending bill can be rejected; anything else was already decided.
export const canDecide = (bill) => approvalOf(bill) === "pending";

// Over the limit (when one is set) waits for approval; otherwise no approval is needed.
export const needsApproval = (amount, limit) => Number(limit) > 0 && round2(amount) > Number(limit);

// Build the bills row for a new bill → { row, approvalRequired, glKey }; glKey is set only when no GL account was given.
export function prepareBill(input = {}, { approvalLimit = 0, workOrder = null } = {}) {
  const amount = round2(Math.abs(Number(input.amount) || 0));
  const wo = workOrder || null;
  const approvalRequired = String(input.approvalStatus || "").toLowerCase() === "pending" || needsApproval(amount, approvalLimit);
  const glAccountId = input.glAccountId || null;
  const glKey = glAccountId ? null : allowedBillGlKey(input.glKey) || (wo ? workOrderGlKey(wo) : BILL_GL_KEYS.repairs);
  const row = {
    ...(input.id ? { id: input.id } : {}),
    name: text(input.name) || "Bill",
    vendor_id: input.vendorId || wo?.vendor_id || wo?.vendorId || null,
    vendor_name: text(input.vendorName) || wo?.vendor_name || wo?.vendorName || "",
    property_id: input.propertyId || wo?.property_id || wo?.propertyId || null,
    property_name: text(input.propertyName) || wo?.property_label || wo?.propertyLabel || "",
    unit_id: input.unitId || wo?.unit_id || wo?.unitId || null,
    job_id: input.jobId || wo?.metadata?.jobId || null,
    work_order_id: input.workOrderId || wo?.id || null,
    gl_account_id: glAccountId,
    account: text(input.account),
    category: text(input.category) || wo?.category || null,
    reference: text(input.reference) || null,
    amount,
    amount_paid: 0,
    bill_date: input.billDate || null,
    due_date: input.dueDate || null,
    status: ["Open", "Draft"].includes(input.status) ? input.status : "Open",
    approval_status: approvalRequired ? "Pending" : "Not required",
    metadata: input.metadata || {},
  };
  return { row, approvalRequired, glKey };
}
