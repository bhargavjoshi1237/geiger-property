import "server-only";
import { buildBankDeposit, round2, toRpcArgs } from "@/lib/ledger/postings";
import { forProject } from "@/lib/supabase/scope";
import { makeBillingContext } from "./context";
import { cashGlOf, pendingSweeps } from "./deposits";
import { isoDate } from "./periods";
import { fail } from "./post";
import { HOUSING_AUTHORITY, isUuid } from "./payment_rules";
import { MAX_DEPOSIT_ITEMS, bankDepositKey, depositDateProblem, depositLabel, slipTotals } from "./bank_deposits_math";

// Server-only bank deposits (CORE-16): payments waiting in 1050 Undeposited Funds, a deposit that moves them into a bank (Dr bank per property / Cr 1050 per payment, key bankdep:<id>), its void, and the deposit slip.

const CHUNK = 150;
const PAGE = 1000;
const LINE_COLS = "id, entry_id, entry_date, gl_account_id, debit, credit, property_id, unit_id, lease_id, tenant_id, bank_deposit_id, memo, metadata, deleted_at, created_at";

const must = ({ data, error }, what) => {
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
};

async function rowOf(admin, table, id, projectId, cols = "*") {
  if (!isUuid(id)) return null;
  const row = must(await forProject(admin.from(table).select(cols).eq("id", id), projectId).maybeSingle(), table);
  return row && !row.deleted_at ? row : null;
}

// Rows of a project table by id, in chunks → Map id → row.
async function byIds(admin, table, cols, ids, projectId) {
  const out = new Map();
  const want = [...new Set((ids || []).filter(Boolean))];
  for (let i = 0; i < want.length; i += CHUNK) {
    for (const r of must(await forProject(admin.from(table).select(cols).in("id", want.slice(i, i + CHUNK)), projectId), table)) out.set(r.id, r);
  }
  return out;
}

async function allRows(build, what) {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const data = must(await build().order("entry_date").order("id").range(from, from + PAGE - 1), what);
    out.push(...data);
    if (data.length < PAGE) return out;
  }
}

async function setting(admin, projectId, key) {
  const rows = must(await forProject(admin.from("settings").select("value").eq("key", key).is("deleted_at", null), projectId).limit(1), "settings");
  return rows?.[0]?.value || {};
}

// A deposit RPC's Postgres error → a user-facing billing error (23505 taken / reconciled → 409, P0002 → 404, 42501 → 403).
function rpcFail(error) {
  const status = { 23505: 409, P0002: 404, 42501: 403 }[error.code] || 400;
  return fail(String(error.message || "The bank deposit failed.").replace(/^bank_deposit_\w+: /, ""), status);
}

const isLive = (e) => Boolean(e) && e.status === "posted" && !e.reversal_of && !e.deleted_at;

// 1050 lines with their payment's details → items { lineId, entryId, date, amount, method, reference, receiptNo, payerName, lease / tenant / unit / property, live, bankDepositId }.
async function describeLines(admin, projectId, lines) {
  const entries = await byIds(admin, "ledger_entries", "id, entry_date, memo, source_type, status, reversal_of, deleted_at, metadata, created_at", lines.map((l) => l.entry_id), projectId);
  const [tenants, leases, properties] = await Promise.all([
    byIds(admin, "tenants", "id, name", lines.map((l) => l.tenant_id), projectId),
    byIds(admin, "leases", "id, name, unit, tenant_name", lines.map((l) => l.lease_id), projectId),
    byIds(admin, "properties", "id, name", lines.map((l) => l.property_id), projectId),
  ]);
  const receipts = new Map();
  const entryIds = [...entries.keys()];
  for (let i = 0; i < entryIds.length; i += CHUNK) {
    const rows = must(await forProject(admin.from("payment_receipts").select("entry_id, receipt_no").in("entry_id", entryIds.slice(i, i + CHUNK)).is("deleted_at", null), projectId), "receipts");
    for (const r of rows) receipts.set(r.entry_id, r.receipt_no);
  }
  return lines
    .map((l) => {
      const e = entries.get(l.entry_id) || null;
      const m = e?.metadata || {};
      const lease = leases.get(l.lease_id);
      const authority = m.payer === HOUSING_AUTHORITY;
      return {
        lineId: l.id,
        entryId: l.entry_id,
        date: l.entry_date,
        amount: round2(l.debit),
        method: m.method || (e?.source_type === "payment" ? "Payment" : "Other"),
        reference: m.reference || "",
        receiptNo: receipts.get(l.entry_id) || "",
        payerName: authority ? m.payerName || "Housing authority" : tenants.get(l.tenant_id)?.name || lease?.tenant_name || e?.memo || "",
        tenantId: l.tenant_id || null,
        leaseId: l.lease_id || null,
        unitId: l.unit_id || null,
        unitLabel: lease?.unit || "",
        propertyId: l.property_id || null,
        propertyName: properties.get(l.property_id)?.name || "",
        memo: e?.memo || l.memo || "",
        sourceType: e?.source_type || "",
        live: isLive(e),
        bankDepositId: l.bank_deposit_id || null,
        createdAt: e?.created_at || l.created_at || "",
      };
    })
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.createdAt).localeCompare(String(b.createdAt)));
}

const totalOf = (items) => round2(items.reduce((s, i) => s + i.amount, 0));

// Payments still in Undeposited Funds (posted, not voided, in no deposit), oldest first; bankAccountId narrows to that bank's property when it has one.
export async function undepositedItems(admin, projectId, { bankAccountId, propertyId, ctx } = {}) {
  if (!projectId) throw fail("projectId is required.");
  const c = ctx || makeBillingContext(admin);
  const acct = await c.accounts(projectId);
  const und = acct.byKey.get("undeposited_funds")?.id;
  const none = { items: [], total: 0, count: 0 };
  if (!und) return none;
  let scope = propertyId || "";
  if (bankAccountId) {
    const bank = await rowOf(admin, "bank_accounts", bankAccountId, projectId, "id, property_id, deleted_at");
    if (!bank) throw fail("Bank account not found.", 404);
    if (bank.property_id) {
      if (scope && scope !== bank.property_id) return none;
      scope = bank.property_id;
    }
  }
  const lines = await allRows(() => {
    let q = forProject(admin.from("ledger_lines").select(LINE_COLS), projectId).eq("gl_account_id", und).gt("debit", 0).is("bank_deposit_id", null).is("deleted_at", null);
    if (scope) q = q.eq("property_id", scope);
    return q;
  }, "undeposited lines");
  const items = (await describeLines(admin, projectId, lines)).filter((i) => i.live);
  return { items, total: totalOf(items), count: items.length };
}

// What the routes return for a deposit row.
function depositView(d, bank) {
  if (!d) return null;
  const m = d.metadata || {};
  return {
    depositId: d.id,
    status: d.status,
    date: d.deposit_date,
    slipNumber: d.slip_number || "",
    label: depositLabel({ slipNumber: d.slip_number, depositDate: d.deposit_date }),
    total: round2(d.total),
    itemCount: Number(d.item_count) || 0,
    bankAccountId: d.bank_account_id,
    bankName: bank?.name || m.bankName || "",
    entryId: d.ledger_entry_id || null,
    voidEntryId: m.voidEntryId || null,
    source: d.source,
    memo: m.memo || "",
  };
}

// Deposit money the deposited payments paid that now sits outside the deposit bank (CORE-04's queue); nothing is posted here.
async function sweepsFor(admin, ctx, projectId, paymentEntryIds) {
  const want = new Set(paymentEntryIds);
  const { bank, rows } = await pendingSweeps(admin, projectId, { ctx });
  return rows.filter((r) => want.has(r.paymentEntryId)).map((r) => ({ depositId: r.depositId, depositName: r.depositName, paymentEntryId: r.paymentEntryId, amount: r.amount, toBankName: bank?.name || "" }));
}

const itemMemo = (i) => ["Deposited", [i.method, i.reference ? `#${i.reference}` : ""].filter(Boolean).join(" "), i.payerName].filter(Boolean).join(" · ");

// Create a bank deposit from 1050 payment lines → { depositId, entryId, created, total, itemCount, … }.
// input: { projectId, depositId? (client-minted, a retry replays), itemLineIds, bankAccountId, date, slipNumber, memo }.
export async function createDeposit(admin, input, actor, { ctx } = {}) {
  const c = ctx || makeBillingContext(admin);
  const projectId = input?.projectId;
  if (!projectId) throw fail("projectId is required.");
  const depositId = input.depositId ? input.depositId : crypto.randomUUID();
  if (!isUuid(depositId)) throw fail("depositId must be a UUID.");
  const prior = await rowOf(admin, "bank_deposits", depositId, projectId);
  if (prior?.status === "Posted") return { ...depositView(prior), created: false, replay: true, depositSweeps: [], warnings: [] };
  if (prior?.status === "Void") throw fail("That deposit was voided; start a new one.", 409);

  const ids = [...new Set((Array.isArray(input.itemLineIds) ? input.itemLineIds : []).filter(isUuid))];
  if (!ids.length) throw fail("Pick at least one payment to deposit.");
  if (ids.length > MAX_DEPOSIT_ITEMS) throw fail(`A deposit can hold up to ${MAX_DEPOSIT_ITEMS} payments.`);
  const acct = await c.accounts(projectId);
  const und = acct.byKey.get("undeposited_funds")?.id;
  if (!und) throw fail("The chart of accounts has no Undeposited Funds (1050) account.");
  const bank = await rowOf(admin, "bank_accounts", input.bankAccountId, projectId, "id, name, account_type, status, gl_account_id, property_id, deleted_at");
  if (!bank) throw fail(input.bankAccountId ? "Bank account not found." : "Pick the bank account this deposit went into.", input.bankAccountId ? 404 : 400);
  if (bank.status === "Closed") throw fail("That bank account is closed.");
  const bankGl = cashGlOf(bank, acct);
  if (!bankGl || bankGl === und) throw fail("That bank account has no cash GL account.");

  const lines = [];
  for (let i = 0; i < ids.length; i += CHUNK) lines.push(...must(await forProject(admin.from("ledger_lines").select(LINE_COLS), projectId).in("id", ids.slice(i, i + CHUNK)), "deposit lines"));
  if (lines.length !== ids.length) throw fail("A payment in this deposit wasn't found.", 404);
  const taken = lines.find((l) => l.bank_deposit_id && l.bank_deposit_id !== depositId);
  if (taken) {
    const other = await rowOf(admin, "bank_deposits", taken.bank_deposit_id, projectId, "id, slip_number, deposit_date, deleted_at");
    throw fail(`A payment in this deposit is already in ${other ? depositLabel({ slipNumber: other.slip_number, depositDate: other.deposit_date }) : "another bank deposit"}.`, 409);
  }
  if (lines.some((l) => l.deleted_at || l.gl_account_id !== und || !(Number(l.debit) > 0))) throw fail("Only payments waiting in Undeposited Funds can be deposited.");
  const items = await describeLines(admin, projectId, lines);
  if (items.some((i) => !i.live)) throw fail("A payment in this deposit was voided; reload the list and pick again.", 409);

  const date = isoDate(input.date) || (await c.today(projectId));
  const problem = depositDateProblem(date, items);
  if (problem) throw fail(problem);
  const slipNumber = String(input.slipNumber ?? "").trim().slice(0, 60);
  const memo = String(input.memo || "").trim().slice(0, 300);
  const by = { id: actor?.id || null, name: actor?.name || actor?.email || "Staff" };
  const built = buildBankDeposit(
    {
      bankGlAccountId: bankGl,
      bankAccountId: bank.id,
      date,
      slipNumber,
      sourceId: depositId,
      memo: memo || undefined,
      items: items.map((i) => ({ lineId: i.lineId, entryId: i.entryId, amount: i.amount, propertyId: i.propertyId, unitId: i.unitId, leaseId: i.leaseId, tenantId: i.tenantId, memo: itemMemo(i) })),
      metadata: { bankDepositId: depositId, slipNumber, reference: slipNumber ? `Slip ${slipNumber}` : "", itemCount: items.length, bankName: bank.name || "", enteredBy: by },
    },
    acct,
  );
  if (built.error) throw fail(built.error);
  const entryId = crypto.randomUUID();
  const args = toRpcArgs({ ...built, entry: { ...built.entry, id: entryId, idempotencyKey: bankDepositKey(depositId) } }, { projectId, createdBy: actor?.id || null });
  const { data, error } = await admin.rpc("bank_deposit_post", {
    p_deposit: { id: depositId, project_id: projectId, bank_account_id: bank.id, deposit_date: date, slip_number: slipNumber || null, source: "manual", metadata: { ...(memo ? { memo } : {}), bankName: bank.name || "", postedBy: by }, created_by: actor?.id || null },
    p_items: ids,
    p_entry: args.p_entry,
    p_lines: args.p_lines,
  });
  if (error) throw rpcFail(error);
  const created = data === entryId;
  const row = await rowOf(admin, "bank_deposits", depositId, projectId);
  const warnings = [];
  let depositSweeps = [];
  if (created) {
    try {
      depositSweeps = await sweepsFor(admin, c, projectId, items.map((i) => i.entryId));
    } catch (e) {
      console.error("[billing.bank_deposits] deposit transfer check", e);
      warnings.push(`Deposit transfer check: ${e?.message || e}`);
    }
  }
  return { ...depositView(row, bank), entryId: data, created, replay: !created, depositSweeps, warnings };
}

// Void a deposit: its reversal posts and its payments go back to Undeposited Funds → { depositId, voidEntryId, created }.
export async function voidDeposit(admin, input, actor, { ctx } = {}) {
  const c = ctx || makeBillingContext(admin);
  const projectId = input?.projectId;
  if (!projectId) throw fail("projectId is required.");
  const d = await rowOf(admin, "bank_deposits", input.depositId, projectId);
  if (!d) throw fail("Bank deposit not found.", 404);
  if (d.status === "Void") return { ...depositView(d), voidEntryId: d.metadata?.voidEntryId || null, created: false };
  const label = depositLabel({ slipNumber: d.slip_number, depositDate: d.deposit_date });
  // A returned check already took its money back out of this deposit's bank (CORE-17), so voiding the deposit would take it twice.
  const returned = must(await forProject(admin.from("payment_returns").select("id"), projectId).eq("bank_deposit_id", d.id).is("deleted_at", null).limit(1), "returned payments");
  if (returned.length) throw fail(`A check in ${label} came back returned, so this deposit can't be voided.`, 409);
  const date = isoDate(input.date) || (await c.today(projectId));
  const reason = String(input.reason || input.memo || "").trim().slice(0, 200);
  const { data, error } = await admin.rpc("bank_deposit_void", { p_deposit: d.id, p_date: date, p_memo: `Void bank deposit · ${label}${reason ? ` · ${reason}` : ""}` });
  if (error) throw rpcFail(error);
  const after = await rowOf(admin, "bank_deposits", d.id, projectId);
  const by = { id: actor?.id || null, name: actor?.name || actor?.email || "Staff" };
  must(await forProject(admin.from("bank_deposits").update({ metadata: { ...(after?.metadata || {}), voidedBy: by, ...(reason ? { voidReason: reason } : {}) } }), projectId).eq("id", d.id).select("id"), "bank deposit");
  return { ...depositView(after), voidEntryId: data, created: true };
}

// Everything a deposit slip shows: bank, date, slip number, every item (payer, method, check #, amount) and the cash / check totals.
export async function depositSlip(admin, projectId, depositId) {
  if (!projectId) throw fail("projectId is required.");
  const d = await rowOf(admin, "bank_deposits", depositId, projectId);
  if (!d) throw fail("Bank deposit not found.", 404);
  const [bank, company] = await Promise.all([
    rowOf(admin, "bank_accounts", d.bank_account_id, projectId, "id, name, bank_name, last4, account_type, deleted_at"),
    setting(admin, projectId, "company_profile"),
  ]);
  // The entry's 1050 credit lines name their payment lines, so a voided deposit still lists what it held.
  let itemIds = [];
  if (d.ledger_entry_id) {
    const own = must(await forProject(admin.from("ledger_lines").select("credit, metadata").eq("entry_id", d.ledger_entry_id), projectId).is("deleted_at", null), "deposit entry");
    itemIds = own.filter((l) => Number(l.credit) > 0 && l.metadata?.itemLineId).map((l) => l.metadata.itemLineId);
  } else {
    itemIds = must(await forProject(admin.from("ledger_lines").select("id"), projectId).eq("bank_deposit_id", d.id).is("deleted_at", null), "deposit items").map((l) => l.id);
  }
  const lines = [];
  for (let i = 0; i < itemIds.length; i += CHUNK) lines.push(...must(await forProject(admin.from("ledger_lines").select(LINE_COLS), projectId).in("id", itemIds.slice(i, i + CHUNK)), "deposit items"));
  const described = await describeLines(admin, projectId, lines);
  // Checks that came back after this deposit (CORE-17).
  const returns = new Map();
  const paymentIds = [...new Set(described.map((i) => i.entryId))];
  for (let i = 0; i < paymentIds.length; i += CHUNK) {
    const rows = must(await forProject(admin.from("payment_returns").select("payment_entry_id, returned_on, reason"), projectId).in("payment_entry_id", paymentIds.slice(i, i + CHUNK)).is("deleted_at", null), "returned payments");
    for (const r of rows) returns.set(r.payment_entry_id, { returnedOn: r.returned_on, reason: r.reason });
  }
  const items = described.map((i) => ({ ...i, returned: returns.get(i.entryId) || null }));
  const m = d.metadata || {};
  return {
    ...depositView(d, bank),
    returnedCount: items.filter((i) => i.returned).length,
    bank: bank ? { id: bank.id, name: bank.name || "", bankName: bank.bank_name || "", last4: bank.last4 || "", accountType: bank.account_type || "" } : { id: d.bank_account_id, name: m.bankName || "", bankName: "", last4: "", accountType: "" },
    company: { name: company.dba || company.legalName || "", address: [company.address, company.city, company.state, company.zip].filter(Boolean).join(", "), phone: company.phone || "" },
    items,
    totals: slipTotals(items),
    postedBy: m.postedBy?.name || "",
    voidedBy: m.voidedBy?.name || "",
    voidedAt: m.voidedAt || "",
    voidReason: m.voidReason || "",
  };
}
