import "server-only";
import {
  buildCharge,
  buildDepositApply,
  buildDepositCharge,
  buildDepositHeld,
  buildDepositInterest,
  buildDepositInterestCredit,
  buildDepositTransfer,
  allocateOldestFirst,
} from "@/lib/ledger/postings";
import { createBill } from "@/lib/accounting/bills_server";
import { projectError } from "@/lib/jobs/contract";
import { forProject, forProjectOrAll } from "@/lib/supabase/scope";
import { makeBillingContext } from "./context";
import { isoDate, maxDate, periodLabel, periodOf, round2 } from "./periods";
import { fail, findPosted, postOnce } from "./post";
import { leaseReceivables } from "./receivables";
import {
  DEFAULT_DEPOSIT_KIND,
  DEPOSIT_BANK_TYPE,
  DEPOSIT_OPEN_STATUSES,
  accrualPlan,
  depintKey,
  depintPayKey,
  depositApplyKey,
  depositCashIns,
  depositChargeKey,
  depositDeductionKey,
  depositKindOf,
  depositReceivedKey,
  depositReleaseKey,
  depositTransferKey,
  directDepositCash,
  disposedStatus,
  emptyBalance,
  firstHeldDate,
  fundedPrincipal,
  interestPeriodFor,
  interestRateFor,
  isInterestBearing,
  isOpenDeposit,
  leaseDepositsDue,
  legacyDepintKey,
  monthlyInterest,
  planDisposition,
  settleUndepositedCash,
  summarizeDepositLines,
  sweepRows,
} from "./deposits_math";

// Server-only security deposits on the ledger (CORE-04): bill or record, move to the deposit bank, accrue and pay interest, dispose through AP; every posting is keyed.

const CHUNK = 150;
const BANK_TYPE_KEY = { Trust: "trust_cash", [DEPOSIT_BANK_TYPE]: "deposit_cash", Operating: "operating_cash", Reserve: "operating_cash" };
const NO_DEPOSIT_BANK = "Deposits are held in trust, but there's no active Security deposit bank account, so deposit money stays in the account it was paid into.";

const must = (res, what) => {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
};
const money = (n) => `$${round2(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const metaOf = (row) => (row?.metadata && typeof row.metadata === "object" ? row.metadata : {});

export async function loadDeposit(admin, depositId, projectId) {
  const q = admin.from("security_deposits").select("*").eq("id", depositId);
  const data = must(await (projectId ? forProject(q, projectId) : q).maybeSingle(), "deposit");
  if (!data || data.deleted_at) throw fail("Deposit not found.", 404);
  if (projectId && data.project_id !== projectId) throw fail("That deposit belongs to another project.", 403);
  return data;
}

async function leaseRow(admin, leaseId, projectId) {
  if (!leaseId) return null;
  const data = must(await forProject(admin.from("leases").select("*").eq("id", leaseId), projectId).maybeSingle(), "lease");
  return data && !data.deleted_at ? data : null;
}

// The lease and the leases it renewed (renewal_of_id chain), newest first.
async function leaseChain(admin, leaseId, projectId) {
  const ids = [];
  for (let id = leaseId; id && !ids.includes(id) && ids.length < 20; ) {
    ids.push(id);
    const row = must(await forProject(admin.from("leases").select("renewal_of_id").eq("id", id), projectId).maybeSingle(), "lease chain");
    id = row?.renewal_of_id || null;
  }
  return ids;
}

const dimsOf = (d, lease) => ({
  leaseId: d.lease_id || lease?.id || null,
  tenantId: d.tenant_id || lease?.tenant_id || null,
  unitId: d.unit_id || lease?.unit_id || null,
  propertyId: d.property_id || lease?.property_id || null,
});

const labelOf = (d, lease) => [depositKindOf(d), d.unit || lease?.unit || d.lease_name || lease?.name, d.tenant_name || lease?.tenant_name].filter(Boolean).join(" · ");

async function updateDeposit(admin, d, patch) {
  must(await forProject(admin.from("security_deposits").update(patch), d.project_id).eq("id", d.id), "deposit");
}
async function mergeDepositMeta(admin, id, patch) {
  must(await admin.rpc("merge_meta", { p_table: "security_deposits", p_id: id, p_patch: patch }), "deposit metadata");
}

// The record is on the ledger: link its entry and, if it was Pending, it's Held now (so renewals carry it and activation never bills it again).
async function markOnLedger(admin, d, entryId) {
  const patch = { ...(entryId && d.charge_entry_id !== entryId ? { charge_entry_id: entryId } : {}), ...(d.status === "Pending" ? { status: "Held" } : {}) };
  if (Object.keys(patch).length) await updateDeposit(admin, d, patch);
}

// Cash GL for a bank account: its linked GL, else the system account for its type.
export function cashGlOf(bank, acct) {
  if (bank?.gl_account_id && acct.byId.has(bank.gl_account_id)) return bank.gl_account_id;
  return acct.byKey.get(BANK_TYPE_KEY[bank?.account_type] || "operating_cash")?.id || null;
}

// Banks and cash GLs deposits move between: the active Security deposit bank (if any), the trust bank, and every deposit-cash GL.
export async function depositSetup(admin, ctx, projectId) {
  const banks = must(
    await forProject(admin.from("bank_accounts").select("id, name, account_type, status, gl_account_id, created_at"), projectId).is("deleted_at", null).order("created_at"),
    "bank accounts",
  );
  const acct = await ctx.accounts(projectId);
  const active = banks.filter((b) => b.status === "Active");
  const depositBank = active.find((b) => b.account_type === DEPOSIT_BANK_TYPE) || null;
  const trustBank = active.find((b) => b.account_type === "Trust") || null;
  const depositCashIds = new Set([acct.byKey.get("deposit_cash")?.id, ...banks.filter((b) => b.account_type === DEPOSIT_BANK_TYPE).map((b) => cashGlOf(b, acct))].filter(Boolean));
  return {
    acct,
    banks,
    depositBank,
    trustBank,
    depositCashIds,
    depositBankGl: depositBank ? cashGlOf(depositBank, acct) : acct.byKey.get("deposit_cash")?.id || null,
    trustGl: trustBank ? cashGlOf(trustBank, acct) : acct.byKey.get("trust_cash")?.id || null,
  };
}

// Sweep rules for a deposit (spec: only when the policy holds deposits in trust and a deposit bank exists) → { heldIn, sweeps, warning }.
export async function depositRegime(ctx, setup, deposit, lease) {
  const policies = await ctx.policies(lease || { project_id: deposit.project_id, property_id: deposit.property_id });
  const heldIn = policies.depositHeldIn || "trust";
  const sweeps = heldIn === "trust" && Boolean(setup.depositBank);
  return { heldIn, sweeps, policies, warning: heldIn === "trust" && !setup.depositBank ? NO_DEPOSIT_BANK : "" };
}

// The deposits' tagged ledger lines (ledger_lines_deposit_idx).
async function depositLines(admin, projectId, depositIds) {
  const ids = [...new Set((depositIds || []).filter(Boolean))];
  const lines = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    lines.push(
      ...must(
        await forProject(admin.from("ledger_lines").select("gl_account_id, debit, credit, entry_date, metadata"), projectId).is("deleted_at", null).in("metadata->>depositId", ids.slice(i, i + CHUNK)),
        "deposit lines",
      ),
    );
  }
  return lines;
}

// Per-record balances from tagged lines → Map depositId → { held, interest, cash }.
export async function depositBalances(admin, projectId, depositIds, { acct, depositCashIds, asOf } = {}) {
  return summarizeDepositLines(await depositLines(admin, projectId, depositIds), acct, { depositCashIds, asOf });
}

// Money into deposits with where it landed: payments applied to their charges and their "received" entries' cash lines (depositCashIns).
async function cashInsFor(admin, projectId, setup, deposits) {
  const charged = deposits.filter((d) => d.charge_entry_id);
  const chargeIds = charged.map((d) => d.charge_entry_id);
  const ar = setup.acct.list.filter((a) => a.subtype === "receivable").map((a) => a.id);
  const cashAccts = new Set(setup.acct.list.filter((a) => a.subtype === "cash").map((a) => a.id));
  const arLines = [];
  for (let i = 0; i < chargeIds.length; i += CHUNK) {
    arLines.push(
      ...must(
        await forProject(admin.from("ledger_lines").select("entry_id, applies_to_entry_id, debit, credit"), projectId).in("applies_to_entry_id", chargeIds.slice(i, i + CHUNK)).in("gl_account_id", ar).is("deleted_at", null),
        "deposit payments",
      ),
    );
  }
  const paymentIds = [...new Set(arLines.map((l) => l.entry_id))];
  const entries = new Map();
  const lines = [];
  const ids = [...new Set([...paymentIds, ...chargeIds])];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    for (const e of must(await forProject(admin.from("ledger_entries").select("id, source_type, status, reversal_of, deleted_at, entry_date"), projectId).in("id", chunk), "payments")) entries.set(e.id, e);
    lines.push(
      ...must(await forProject(admin.from("ledger_lines").select("entry_id, entry_date, gl_account_id, bank_account_id, bank_deposit_id, debit, metadata"), projectId).in("entry_id", chunk).is("deleted_at", null), "deposit cash").filter((l) =>
        cashAccts.has(l.gl_account_id),
      ),
    );
  }
  const settled = await settleHeldCash(admin, projectId, setup, lines);
  const charges = new Set(chargeIds);
  return depositCashIns({ deposits: charged, arLines, entries, cashLines: settled.filter((l) => !charges.has(l.entry_id)), receivedLines: settled.filter((l) => charges.has(l.entry_id)) });
}

// Sweep timing (CORE-16): a payment held in 1050 Undeposited Funds moves only once a bank deposit takes it, from that deposit's bank.
async function settleHeldCash(admin, projectId, setup, lines) {
  const undepositedId = setup.acct.byKey.get("undeposited_funds")?.id;
  const depositIds = [...new Set(lines.filter((l) => l.gl_account_id === undepositedId && l.bank_deposit_id).map((l) => l.bank_deposit_id))];
  const deposits = new Map();
  for (let i = 0; i < depositIds.length; i += CHUNK) {
    for (const d of must(await forProject(admin.from("bank_deposits").select("id, status, bank_account_id, deposit_date"), projectId).in("id", depositIds.slice(i, i + CHUNK)).is("deleted_at", null), "bank deposits")) deposits.set(d.id, d);
  }
  const bankGl = new Map(setup.banks.map((b) => [b.id, cashGlOf(b, setup.acct)]));
  return settleUndepositedCash(lines, { undepositedId, deposits, bankGl });
}

// What the resident still owes on each deposit's own charge (as of a date) → Map depositId → unpaid.
async function unpaidCharges(admin, projectId, acct, deposits, asOf) {
  const ar = new Set(acct.list.filter((a) => a.subtype === "receivable").map((a) => a.id));
  const byCharge = new Map(deposits.filter((d) => d.charge_entry_id).map((d) => [d.charge_entry_id, d]));
  const out = new Map(deposits.map((d) => [d.id, 0]));
  const ids = [...byCharge.keys()];
  const upTo = (q) => (asOf ? q.lte("entry_date", asOf) : q);
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const [own, applied] = await Promise.all([
      upTo(forProject(admin.from("ledger_lines").select("entry_id, gl_account_id, debit, credit, applies_to_entry_id, metadata"), projectId).in("entry_id", chunk).is("deleted_at", null)),
      upTo(forProject(admin.from("ledger_lines").select("gl_account_id, debit, credit, applies_to_entry_id"), projectId).in("applies_to_entry_id", chunk).is("deleted_at", null)),
    ]);
    for (const l of must(own, "deposit charges")) {
      const d = byCharge.get(l.entry_id);
      if (!d || !ar.has(l.gl_account_id) || l.applies_to_entry_id || l.metadata?.depositId !== d.id) continue;
      out.set(d.id, round2(out.get(d.id) + Number(l.debit) - Number(l.credit)));
    }
    for (const l of must(applied, "deposit charge payments")) {
      const d = byCharge.get(l.applies_to_entry_id);
      if (!d || !ar.has(l.gl_account_id)) continue;
      out.set(d.id, round2(out.get(d.id) + Number(l.debit) - Number(l.credit)));
    }
  }
  for (const [k, v] of out) out.set(k, Math.max(0, round2(v)));
  return out;
}

// Deposit liability on the lease chain that no deposit record owns (2100 lines without metadata.depositId).
async function untrackedDeposits(admin, d, acct) {
  const liab = acct.byKey.get("security_deposits")?.id;
  if (!liab || !d.lease_id) return 0;
  const chain = await leaseChain(admin, d.lease_id, d.project_id);
  const rows = must(
    await forProject(admin.from("ledger_lines").select("debit, credit, metadata"), d.project_id).eq("gl_account_id", liab).in("lease_id", chain).is("deleted_at", null),
    "lease deposit lines",
  );
  return round2(rows.filter((l) => !l.metadata?.depositId).reduce((s, l) => s + Number(l.credit) - Number(l.debit), 0));
}

// A deposit already on the books without a record link is linked (property.deposit_link_ledger) instead of posted twice; ambiguous leftovers refuse.
async function linkOrRefuse(admin, d, acct) {
  const linked = Number(must(await admin.rpc("deposit_link_ledger", { p_deposit_id: d.id }), "link deposit")) || 0;
  if (linked > 0) {
    const row = await loadDeposit(admin, d.id, d.project_id);
    await markOnLedger(admin, row, row.charge_entry_id);
    return row.charge_entry_id || null;
  }
  const untracked = await untrackedDeposits(admin, d, acct);
  if (Math.abs(untracked) > 0.004) {
    throw fail(`This lease already holds ${money(untracked)} of deposits on the ledger that aren't linked to a deposit record. Reconcile them before posting this deposit.`, 409);
  }
  return null;
}

function assertPostable(d) {
  if (!d.lease_id) throw fail("Link this deposit to a lease first.", 409);
  if (!(round2(d.amount) > 0)) throw fail("Set the deposit amount first.", 409);
  if (!isOpenDeposit(d)) throw fail("This deposit is closed.", 409);
}

// Resume a key already posted for this deposit (re-runs post nothing) → result or null.
async function resumePosted(admin, d, key) {
  const prior = await findPosted(admin, d.project_id, key);
  if (!prior) return null;
  await markOnLedger(admin, d, prior);
  return { entryId: prior, key, amount: round2(d.amount), created: false, kind: "deposit" };
}

// 1 · Bill the deposit through AR: Dr 1200 / Cr 2100, deposit:<id>:charge → { entryId, key, amount, created, kind }.
export async function chargeDeposit(admin, deposit, { actor, ctx, date } = {}) {
  const c = ctx || makeBillingContext(admin);
  const d = deposit;
  assertPostable(d);
  const key = depositChargeKey(d.id);
  const resumed = await resumePosted(admin, d, key);
  if (resumed) return resumed;
  if (d.charge_entry_id) throw fail("This deposit is already on the ledger.", 409);
  const acct = await c.accounts(d.project_id);
  const linked = await linkOrRefuse(admin, d, acct);
  if (linked) return { entryId: linked, key: null, amount: round2(d.amount), created: false, kind: "linked" };
  const lease = await leaseRow(admin, d.lease_id, d.project_id);
  if (!lease) throw fail("The deposit's lease wasn't found.", 404);
  const on = isoDate(date) || (await c.today(d.project_id));
  const res = await postOnce(
    admin,
    d.project_id,
    key,
    (a) => buildDepositCharge({ ...dimsOf(d, lease), depositId: d.id, amount: d.amount, date: on, memo: labelOf(d, lease), sourceId: d.id, metadata: { depositId: d.id, kind: depositKindOf(d) } }, a),
    { acct, createdBy: actor?.id || null },
  );
  await markOnLedger(admin, d, res.entryId);
  await mergeDepositMeta(admin, d.id, { ledger: "billed", billedOn: on });
  return { entryId: res.entryId, key, amount: round2(d.amount), created: res.created, kind: "deposit" };
}

// 4 · Received outside AR (opening balances, takeovers): Dr the bank it landed in / Cr 2100, deposit:<id>:received.
export async function recordDepositReceived(admin, deposit, { actor, ctx, date, bankAccountId } = {}) {
  const c = ctx || makeBillingContext(admin);
  const d = deposit;
  assertPostable(d);
  const key = depositReceivedKey(d.id);
  const resumed = await resumePosted(admin, d, key);
  if (resumed) return resumed;
  if (d.charge_entry_id) throw fail("This deposit is already on the ledger.", 409);
  const setup = await depositSetup(admin, c, d.project_id);
  const linked = await linkOrRefuse(admin, d, setup.acct);
  if (linked) return { entryId: linked, key: null, amount: round2(d.amount), created: false, kind: "linked" };
  const lease = await leaseRow(admin, d.lease_id, d.project_id);
  const regime = await depositRegime(c, setup, d, lease);
  let bank = null;
  if (bankAccountId) {
    bank = setup.banks.find((b) => b.id === bankAccountId && b.status === "Active");
    if (!bank) throw fail("Pick an active bank account.", 400);
  } else if (regime.heldIn === "trust") bank = setup.depositBank || setup.trustBank;
  else bank = setup.banks.find((b) => b.status === "Active" && b.account_type === "Operating") || null;
  const cashGl = bank ? cashGlOf(bank, setup.acct) : setup.acct.byKey.get(regime.heldIn === "trust" ? "trust_cash" : "operating_cash")?.id;
  const on = isoDate(date) || (await c.today(d.project_id));
  const res = await postOnce(
    admin,
    d.project_id,
    key,
    (a) =>
      buildDepositHeld(
        { ...dimsOf(d, lease), depositId: d.id, amount: d.amount, date: on, cashGlAccountId: cashGl, bankAccountId: bank?.id || null, memo: `${labelOf(d, lease)} received`, sourceId: d.id, metadata: { depositId: d.id, kind: depositKindOf(d) } },
        a,
      ),
    { acct: setup.acct, createdBy: actor?.id || null },
  );
  await markOnLedger(admin, d, res.entryId);
  await mergeDepositMeta(admin, d.id, { ledger: "received", receivedOn: on, ...(bank ? { receivedBankAccountId: bank.id } : {}) });
  return { entryId: res.entryId, key, amount: round2(d.amount), created: res.created, kind: "received", warning: regime.warning };
}

// Activation (CORE-01 hook): a record per deposit the lease requires (security, pet), then bill the ones not yet held or billed.
export async function billLeaseDeposits(admin, lease, { actor, ctx } = {}) {
  const c = ctx || makeBillingContext(admin);
  const projectId = lease.project_id;
  const due = leaseDepositsDue(lease);
  const out = { deposits: [], entries: [], warning: "" };
  if (!due.length) return out;
  // The renewal chain counts too: a deposit still open on the lease this one renewed is the same deposit.
  const chain = await leaseChain(admin, lease.id, projectId);
  const existing = must(await forProject(admin.from("security_deposits").select("*"), projectId).in("lease_id", chain).is("deleted_at", null).order("created_at"), "deposits");
  for (const { kind, amount } of due) {
    let row = existing.find((d) => d.lease_id === lease.id && depositKindOf(d) === kind);
    const prior = existing.find((d) => d.lease_id !== lease.id && depositKindOf(d) === kind && isOpenDeposit(d));
    if (!row && prior) {
      out.deposits.push({ id: prior.id, kind, amount: round2(prior.amount), skipped: "held on the lease this one renewed" });
      continue;
    }
    if (!row) {
      const who = [lease.unit || lease.name, kind.toLowerCase()].filter(Boolean).join(" — ");
      row = must(
        await admin
          .from("security_deposits")
          .insert({
            project_id: projectId,
            name: who,
            amount,
            kind,
            lease_id: lease.id,
            lease_name: lease.name || null,
            tenant_id: lease.tenant_id || null,
            tenant_name: lease.tenant_name || null,
            unit_id: lease.unit_id || null,
            unit: lease.unit || null,
            property_id: lease.property_id || null,
            status: "Pending",
            created_by: actor?.id || null,
            metadata: { depositKind: kind, createdOnActivation: true },
          })
          .select("*")
          .single(),
        "deposit",
      );
      existing.push(row);
    }
    // A record already marked Held without a ledger link was collected outside the ledger: never bill it again.
    if (row.charge_entry_id || row.status !== "Pending") {
      out.deposits.push({ id: row.id, kind, amount: round2(row.amount), skipped: row.charge_entry_id ? "on the ledger" : `marked ${row.status}` });
      continue;
    }
    // A deposit that can't bill (e.g. an untracked legacy balance) never undoes the activation; it comes back as a warning.
    try {
      const res = await chargeDeposit(admin, row, { actor, ctx: c });
      out.deposits.push({ id: row.id, kind, amount: res.amount, entryId: res.entryId, created: res.created });
      if (res.key) out.entries.push({ entryId: res.entryId, key: res.key, amount: res.amount, kind: "deposit", created: res.created });
    } catch (e) {
      if (!e?.status) throw e;
      out.deposits.push({ id: row.id, kind, amount: round2(row.amount), skipped: e.message });
      out.warning = `The ${kind.toLowerCase()} wasn't billed: ${e.message}`;
    }
  }
  const setup = await depositSetup(admin, c, projectId);
  out.warning = out.warning || (await depositRegime(c, setup, { project_id: projectId, property_id: lease.property_id }, lease)).warning;
  return out;
}

// "Deposits to transfer": deposit payments and received deposits that landed outside the deposit bank → { bank, rows, total, warning }.
export async function pendingSweeps(admin, projectId, { ctx, depositIds } = {}) {
  const c = ctx || makeBillingContext(admin);
  const setup = await depositSetup(admin, c, projectId);
  if (!setup.depositBank) {
    const heldIn = (await c.policies({ project_id: projectId })).depositHeldIn || "trust";
    return { bank: null, rows: [], total: 0, warning: heldIn === "trust" ? NO_DEPOSIT_BANK : "" };
  }
  let q = forProject(admin.from("security_deposits").select("*"), projectId).is("deleted_at", null).in("status", DEPOSIT_OPEN_STATUSES).not("charge_entry_id", "is", null).is("apply_entry_id", null);
  if (depositIds?.length) q = q.in("id", depositIds);
  const all = must(await q, "deposits");
  const leases = new Map();
  const deposits = [];
  for (const d of all) {
    if (d.lease_id && !leases.has(d.lease_id)) leases.set(d.lease_id, await leaseRow(admin, d.lease_id, d.project_id));
    if ((await depositRegime(c, setup, d, leases.get(d.lease_id))).sweeps) deposits.push(d);
  }
  const candidates = sweepRows({ cashIns: await cashInsFor(admin, projectId, setup, deposits), depositCashIds: setup.depositCashIds, posted: new Set() });
  const posted = new Set();
  const keys = candidates.map((r) => r.key);
  for (let i = 0; i < keys.length; i += CHUNK) {
    for (const e of must(await forProject(admin.from("ledger_entries").select("idempotency_key"), projectId).in("idempotency_key", keys.slice(i, i + CHUNK)), "sweeps")) posted.add(e.idempotency_key);
  }
  const byId = new Map(deposits.map((d) => [d.id, d]));
  const rows = candidates
    .filter((r) => !posted.has(r.key))
    .map((r) => {
      const d = byId.get(r.depositId);
      return { ...r, depositName: d?.name || "Deposit", kind: depositKindOf(d), source: r.kind, tenantName: d?.tenant_name || "", unit: d?.unit || "", leaseId: d?.lease_id || null, fromBankName: setup.banks.find((b) => b.id === r.fromBankAccountId)?.name || "" };
    });
  return { bank: { id: setup.depositBank.id, name: setup.depositBank.name }, rows, total: round2(rows.reduce((s, r) => s + r.amount, 0)), warning: "" };
}

// 3 · Move a deposit's money to the deposit bank: Dr 1020 (deposit bank) / Cr the cash it landed in, one entry per payment or receipt.
export async function sweepDeposit(admin, deposit, { actor, ctx, paymentEntryId } = {}) {
  const c = ctx || makeBillingContext(admin);
  const d = deposit;
  const { bank, rows, warning } = await pendingSweeps(admin, d.project_id, { ctx: c, depositIds: [d.id] });
  if (!bank) throw fail(warning || NO_DEPOSIT_BANK, 409);
  const todo = rows.filter((r) => !paymentEntryId || r.paymentEntryId === paymentEntryId);
  const setup = await depositSetup(admin, c, d.project_id);
  const lease = await leaseRow(admin, d.lease_id, d.project_id);
  const today = await c.today(d.project_id);
  const entries = [];
  for (const r of todo) {
    const res = await postOnce(
      admin,
      d.project_id,
      r.key,
      (a) =>
        buildDepositTransfer(
          {
            ...dimsOf(d, lease),
            depositId: d.id,
            amount: r.amount,
            date: maxDate(today, r.date),
            toGlAccountId: setup.depositBankGl,
            toBankAccountId: bank.id,
            fromGlAccountId: r.fromGlAccountId,
            fromBankAccountId: r.fromBankAccountId,
            memo: `Deposit moved to ${bank.name} · ${labelOf(d, lease)}`,
            sourceId: d.id,
            metadata: { depositId: d.id, paymentEntryId: r.paymentEntryId, sweep: true },
          },
          a,
        ),
      { acct: setup.acct, createdBy: actor?.id || null },
    );
    entries.push({ entryId: res.entryId, key: r.key, amount: r.amount, kind: "sweep", created: res.created });
  }
  return { entries };
}

// 5 · One deposit's interest through `through` (YYYY-MM): each month not yet accrued (24 back at most, the last prorated to `partialTo`), on held-and-paid principal; annual credits each December.
async function accrueDepositInterest(admin, c, d, { through, partialTo = "", setup, lease, actor, commit = true }) {
  const out = { entries: [], pending: 0 };
  if (!isInterestBearing(d)) return out;
  const policies = await c.policies(lease || { project_id: d.project_id, property_id: d.property_id });
  const rate = interestRateFor(d, policies);
  const lines = await depositLines(admin, d.project_id, [d.id]);
  const plan = accrualPlan({ since: firstHeldDate(lines, setup.acct, d.id), through, partialTo });
  if (!plan.length) return out;
  const candidates = plan.flatMap((p) => [depintKey(d.id, p.period), ...(d.lease_id ? [legacyDepintKey(d.lease_id, p.period)] : [])]);
  const used = new Set(must(await forProject(admin.from("ledger_entries").select("idempotency_key"), d.project_id).in("idempotency_key", candidates), "interest keys").map((e) => e.idempotency_key));
  for (const p of plan) {
    const key = depintKey(d.id, p.period);
    if (!used.has(key) && !(d.lease_id && used.has(legacyDepintKey(d.lease_id, p.period))) && rate > 0) {
      const held = summarizeDepositLines(lines, setup.acct, { depositCashIds: setup.depositCashIds, asOf: p.asOf }).get(d.id)?.held || 0;
      const unpaid = (await unpaidCharges(admin, d.project_id, setup.acct, [d], p.asOf)).get(d.id) || 0;
      const principal = fundedPrincipal(held, unpaid);
      const amount = monthlyInterest(principal, rate, p.fraction);
      if (amount > 0 && !commit) out.pending = round2(out.pending + amount);
      else if (amount > 0) {
        const res = await postOnce(
          admin,
          d.project_id,
          key,
          (a) =>
            buildDepositInterest(
              { ...dimsOf(d, lease), depositId: d.id, amount, date: p.asOf, memo: `Deposit interest · ${periodLabel(p.period)}${p.fraction < 1 ? " (to the disposal date)" : ""}`, sourceId: d.id, metadata: { auto: true, depositId: d.id, principal, rate, period: p.period, fraction: p.fraction } },
              a,
            ),
          { acct: setup.acct, createdBy: actor?.id || null },
        );
        out.entries.push({ entryId: res.entryId, key, amount, kind: "interest", created: res.created });
      }
    }
    // The annual credit runs for every December in range, whatever that month accrued.
    if (commit && p.period.endsWith("-12") && p.fraction === 1 && policies.depositInterestPayout === "annual_credit") {
      out.entries.push(...(await payInterest(admin, d, { year: p.period.slice(0, 4), asOf: p.asOf, ctx: c, actor })).entries);
    }
  }
  return out;
}

// 5 · The deposit-interest job: every interest-bearing open deposit through the month before the business date, catching up missed months; ignorePause is for tests and support only.
export async function accrueInterest(admin, { now = new Date(), projectId = null, depositIds = null, actor = null, ignorePause = false } = {}) {
  const res = { processed: 0, created: 0, skipped: 0, errors: [] };
  const c = makeBillingContext(admin, { now });
  let q = forProjectOrAll(admin.from("security_deposits").select("*"), projectId).is("deleted_at", null).eq("interest_bearing", true).in("status", DEPOSIT_OPEN_STATUSES);
  if (depositIds?.length) q = q.in("id", depositIds);
  const all = must(await q, "deposits");
  const byProject = new Map();
  for (const d of all) if (d.project_id) byProject.set(d.project_id, [...(byProject.get(d.project_id) || []), d]);
  for (const [pid, deposits] of byProject) {
    try {
      if (!ignorePause && (await c.settings(pid)).jobsPaused) {
        res.skipped += deposits.length;
        continue;
      }
      const through = interestPeriodFor(await c.today(pid));
      const setup = await depositSetup(admin, c, pid);
      for (const d of deposits) {
        res.processed += 1;
        try {
          const lease = await leaseRow(admin, d.lease_id, d.project_id);
          const out = await accrueDepositInterest(admin, c, d, { through, setup, lease, actor });
          const created = out.entries.filter((e) => e.created).length;
          res.created += created;
          if (!created) res.skipped += 1;
        } catch (e) {
          res.errors.push(projectError(pid, `deposit ${d.name || d.id}: ${e.message}`));
        }
      }
    } catch (e) {
      res.errors.push(projectError(pid, `deposit interest: ${e.message}`));
    }
  }
  return res;
}

// 6 · Interest paid as a credit (policy annual_credit): Dr 2110 / Cr AR (oldest open charges first), depint-pay:<id>:<YYYY>.
export async function payInterest(admin, deposit, { year, asOf, ctx, actor } = {}) {
  const c = ctx || makeBillingContext(admin);
  const d = deposit;
  const key = depintPayKey(d.id, year);
  const prior = await findPosted(admin, d.project_id, key);
  if (prior) return { entries: [{ entryId: prior, key, amount: 0, kind: "interest_credit", created: false }] };
  const setup = await depositSetup(admin, c, d.project_id);
  const on = isoDate(asOf) || `${year}-12-31`;
  const interest = (await depositBalances(admin, d.project_id, [d.id], { acct: setup.acct, depositCashIds: setup.depositCashIds, asOf: on })).get(d.id)?.interest || 0;
  if (!(interest > 0) || !d.lease_id) return { entries: [] };
  const lease = await leaseRow(admin, d.lease_id, d.project_id);
  const { items } = await leaseReceivables(admin, d.project_id, setup.acct, d.lease_id);
  const { allocations } = allocateOldestFirst(items, interest);
  const res = await postOnce(
    admin,
    d.project_id,
    key,
    (a) => buildDepositInterestCredit({ ...dimsOf(d, lease), depositId: d.id, amount: interest, allocations, date: on, memo: `Deposit interest credited · ${year}`, sourceId: d.id, metadata: { depositId: d.id, year } }, a),
    { acct: setup.acct, createdBy: actor?.id || null },
  );
  return { entries: [{ entryId: res.entryId, key, amount: interest, kind: "interest_credit", created: res.created }] };
}

// Co-tenants on the lease (lease_parties role tenant), else the record's tenant: the refund is payable to them jointly.
async function refundPayees(admin, d, lease) {
  const parties = d.lease_id ? must(await forProject(admin.from("lease_parties").select("name, role, is_primary, created_at"), d.project_id).eq("lease_id", d.lease_id).is("deleted_at", null), "lease parties") : [];
  const names = parties
    .filter((p) => (p.role || "tenant") === "tenant" && String(p.name || "").trim())
    .sort((a, b) => Number(Boolean(b.is_primary)) - Number(Boolean(a.is_primary)) || String(a.created_at).localeCompare(String(b.created_at)))
    .map((p) => p.name.trim());
  const fallback = d.tenant_name || lease?.tenant_name || "Resident";
  return [...new Set(names.length ? names : [fallback])];
}

// The refund bill id, claimed on the record once so a re-run reuses it.
async function claimRefundBill(admin, d) {
  if (d.refund_bill_id) return d.refund_bill_id;
  const id = crypto.randomUUID();
  const claimed = must(await forProject(admin.from("security_deposits").update({ refund_bill_id: id }), d.project_id).eq("id", d.id).is("refund_bill_id", null).select("refund_bill_id"), "refund bill");
  return claimed?.length ? id : (await loadDeposit(admin, d.id, d.project_id)).refund_bill_id;
}

// 7c · Refund payable through the CORE-09 bill path: payee tenant (co-tenants jointly), Dr 2100 [+ 2110] / Cr 2000.
async function refundBill(admin, d, lease, plan, { date, setup, regime, actor, version }) {
  const id = await claimRefundBill(admin, d);
  const existing = must(await forProject(admin.from("bills").select("*"), d.project_id).eq("id", id).maybeSingle(), "refund bill");
  if (existing && !existing.deleted_at) return { bill: existing, created: false };
  const payees = await refundPayees(admin, d, lease);
  const joint = payees.join(" & ");
  const liab = setup.acct.byKey.get("security_deposits")?.id;
  const interest = setup.acct.byKey.get("deposit_interest_payable")?.id;
  const lines = [
    { glAccountId: liab, amount: plan.refundHeld, memo: `${depositKindOf(d)} refund`, metadata: { depositId: d.id } },
    { glAccountId: interest, amount: plan.refundInterest, memo: "Deposit interest refund", metadata: { depositId: d.id } },
  ].filter((l) => l.amount > 0);
  const res = await createBill(
    admin,
    {
      id,
      projectId: d.project_id,
      name: `${depositKindOf(d)} refund — ${joint}`,
      payeeType: "tenant",
      tenantId: d.tenant_id || lease?.tenant_id || null,
      payeeName: joint,
      amount: plan.refund,
      billDate: date,
      dueDate: maxDate(date, isoDate(d.return_due)),
      propertyId: d.property_id || lease?.property_id || null,
      unitId: d.unit_id || lease?.unit_id || null,
      category: "Deposit refund",
      reference: payees.length > 1 ? `Payable jointly to ${joint}` : null,
      lines,
      metadata: {
        depositId: d.id,
        leaseId: d.lease_id,
        payeeName: joint,
        payableTo: payees,
        version,
        ...(regime.sweeps && setup.depositBank ? { payFromBankAccountId: setup.depositBank.id } : {}),
      },
    },
    actor,
    { depositRefund: true },
  );
  return { bill: res.bill, created: true, posted: res.posted, pendingApproval: res.pendingApproval, postError: res.postError };
}

// Deposit-bank cash a record holds: its tagged deposit-bank lines plus payments made straight into the deposit bank.
async function depositBankCash(admin, d, setup, balance) {
  const direct = directDepositCash({ cashIns: await cashInsFor(admin, d.project_id, setup, [d]), depositCashIds: setup.depositCashIds }).get(d.id) || 0;
  return round2(balance.cash + direct);
}

// 7a–7e · Dispose a deposit: interest to the disposal date, deductions, apply to open charges, the AP refund bill, the deposit-bank release; commit:false previews, re-runs post nothing (CORE-13 revises with `version`).
export async function disposeDeposit(admin, deposit, { deductions, version = 1, date, commit = true, actor, ctx } = {}) {
  const c = ctx || makeBillingContext(admin);
  const d = deposit;
  const P = d.project_id;
  if (!d.lease_id) throw fail("Link this deposit to a lease first.", 409);
  const disposition = metaOf(d).disposition;
  const resuming = Boolean(disposition?.committedAt) && Number(disposition.version || 1) === Number(version);
  if (!isOpenDeposit(d) && !resuming) throw fail("This deposit is already closed.", 409);
  const setup = await depositSetup(admin, c, P);
  const lease = await leaseRow(admin, d.lease_id, d.project_id);
  const regime = await depositRegime(c, setup, d, lease);
  const on = isoDate(date) || (await c.today(P));
  const list = Array.isArray(deductions) ? deductions : Array.isArray(metaOf(d).deductions) ? metaOf(d).deductions : [];
  const withIds = list.map((x, i) => ({ ...x, id: String(x?.id || `d${i + 1}`) }));
  const balanceOf = async () => (await depositBalances(admin, P, [d.id], { acct: setup.acct, depositCashIds: setup.depositCashIds })).get(d.id) || emptyBalance();
  const keys = [...withIds.map((x) => depositDeductionKey(d.id, x.id, version)), depositApplyKey(d.id, version), depositReleaseKey(d.id, version)];
  const postedKeys = new Set(must(await forProject(admin.from("ledger_entries").select("idempotency_key"), P).in("idempotency_key", keys), "deposit keys").map((e) => e.idempotency_key));
  const applyKey = depositApplyKey(d.id, version);
  const releaseKey = depositReleaseKey(d.id, version);
  const pendingDeductions = resuming ? [] : withIds.filter((x) => !postedKeys.has(depositDeductionKey(d.id, x.id, version)));
  // A committed disposition (or a posted apply) never applies or accrues again; a re-run only finishes what's missing.
  const settled = resuming || postedKeys.has(applyKey);
  const interestDue = settled ? { entries: [], pending: 0 } : await accrueDepositInterest(admin, c, d, { through: periodOf(on), partialTo: on, setup, lease, actor, commit: false });
  let balance = await balanceOf();
  const cash = await depositBankCash(admin, d, setup, balance);
  let items = settled ? [] : (await leaseReceivables(admin, P, setup.acct, d.lease_id)).items;
  const plan = planDisposition({ held: balance.held, interest: round2(balance.interest + interestDue.pending), cash, items, deductions: pendingDeductions, date: on, payFromDepositBank: regime.sweeps });
  const preview = {
    ...plan,
    deductionsPosted: withIds.length - pendingDeductions.length,
    interestToDate: interestDue.pending,
    regime: { heldIn: regime.heldIn, sweeps: regime.sweeps, warning: regime.warning },
    balance: { ...balance, interest: round2(balance.interest + interestDue.pending), cash },
    date: on,
  };
  if (!commit) return { preview, entries: [] };
  if (!(balance.held > 0) && !(balance.interest > 0) && !resuming) {
    throw fail(d.charge_entry_id ? "Nothing is held on the ledger for this deposit." : "This deposit isn't on the ledger yet — bill it or record it received first.", 409);
  }

  const createdBy = actor?.id || null;
  const dims = dimsOf(d, lease);
  const entries = [];
  // Interest up to the disposal date (the final month prorated).
  if (!settled) entries.push(...(await accrueDepositInterest(admin, c, d, { through: periodOf(on), partialTo: on, setup, lease, actor })).entries);
  // 7a · deductions (amounts already billed, like unpaid rent or utilities, post nothing).
  for (const x of plan.deductions) {
    const key = depositDeductionKey(d.id, x.id, version);
    const res = await postOnce(
      admin,
      P,
      key,
      (a) => buildCharge({ ...dims, amount: x.amount, date: on, glAccountId: x.glAccountId || undefined, incomeKey: x.glKey, memo: `Deposit deduction · ${x.label}`, sourceId: d.id, metadata: { depositId: d.id, deductionId: x.id, category: x.category, version } }, a),
      { acct: setup.acct, createdBy },
    );
    entries.push({ entryId: res.entryId, key, amount: x.amount, kind: "deduction", created: res.created });
  }
  // 7b · apply to open charges, oldest first, over the real open items.
  balance = await balanceOf();
  items = settled ? [] : (await leaseReceivables(admin, P, setup.acct, d.lease_id)).items;
  const final = planDisposition({ ...balance, items, deductions: [], date: on, payFromDepositBank: regime.sweeps });
  let applyEntryId = d.apply_entry_id || (postedKeys.has(applyKey) ? await findPosted(admin, P, applyKey) : null);
  if (final.applied > 0) {
    const res = await postOnce(
      admin,
      P,
      applyKey,
      (a) => buildDepositApply({ ...dims, depositId: d.id, heldAmount: final.appliedHeld, interestAmount: final.appliedInterest, allocations: final.allocations, date: on, memo: `${labelOf(d, lease)} applied to charges`, sourceId: d.id, metadata: { depositId: d.id, version } }, a),
      { acct: setup.acct, createdBy },
    );
    applyEntryId = res.entryId;
    entries.push({ entryId: res.entryId, key: applyKey, amount: final.applied, kind: "apply", created: res.created });
  }
  // 7c · refund bill (7d is its payment from the Bills screen); a resumed run reuses the claimed bill.
  let bill = null;
  if (final.refund > 0) {
    bill = await refundBill(admin, d, lease, final, { date: on, setup, regime, actor, version });
    if (bill.bill?.ledger_entry_id) entries.push({ entryId: bill.bill.ledger_entry_id, key: `bill:${bill.bill.id}`, amount: final.refund, kind: "refund_bill", created: Boolean(bill.created && bill.posted) });
  }
  const current = await loadDeposit(admin, d.id, P);
  const billRow = bill?.bill || (current.refund_bill_id ? must(await forProject(admin.from("bills").select("*"), P).eq("id", current.refund_bill_id).maybeSingle(), "refund bill") : null);
  const refund = billRow && !billRow.deleted_at && billRow.status !== "Void" ? round2(billRow.amount) : 0;
  // 7e · deposit-bank cash the refund won't pay out goes back to operating trust (a negative release funds the refund from trust).
  const release = round2((await depositBankCash(admin, d, setup, await balanceOf())) - (regime.sweeps ? refund : 0));
  if (Math.abs(release) >= 0.005 && !postedKeys.has(releaseKey)) {
    const out = release > 0;
    const res = await postOnce(
      admin,
      P,
      releaseKey,
      (a) =>
        buildDepositTransfer(
          {
            ...dims,
            depositId: d.id,
            amount: Math.abs(release),
            date: on,
            toGlAccountId: out ? setup.trustGl : setup.depositBankGl,
            toBankAccountId: out ? setup.trustBank?.id || null : setup.depositBank?.id || null,
            fromGlAccountId: out ? setup.depositBankGl : setup.trustGl,
            fromBankAccountId: out ? setup.depositBank?.id || null : setup.trustBank?.id || null,
            memo: out ? `Deposit applied to charges released to trust · ${labelOf(d, lease)}` : `Deposit refund funded from trust · ${labelOf(d, lease)}`,
            sourceId: d.id,
            metadata: { depositId: d.id, release, version },
          },
          a,
        ),
      { acct: setup.acct, createdBy },
    );
    entries.push({ entryId: res.entryId, key: releaseKey, amount: release, kind: "release", created: res.created });
  }

  // A committed disposition reports what it recorded; a first (or crash-resumed) run reports the ledger as posted.
  if (resuming) return { preview, entries, bill: billRow || null, pendingApproval: false, postError: "", status: d.status, disposition };
  const applyRow = applyEntryId ? must(await forProject(admin.from("ledger_entries").select("total"), P).eq("id", applyEntryId).maybeSingle(), "apply entry") : null;
  const applied = round2(applyRow?.total || 0);
  const status = disposedStatus({ refund, applied });
  const summary = {
    version,
    date: on,
    committedAt: new Date().toISOString(),
    committedBy: actor?.id || null,
    held: preview.balance.held,
    interest: preview.balance.interest,
    deductions: round2(withIds.reduce((s, x) => s + (Number(x.amount) > 0 ? round2(x.amount) : 0), 0)),
    applied,
    refund,
    release,
    balanceOwed: round2(Math.max(0, plan.openBefore + plan.deductions.reduce((s, x) => s + x.amount, 0) - applied)),
    applyEntryId: applyEntryId || null,
    refundBillId: billRow?.id || null,
  };
  await updateDeposit(admin, d, { apply_entry_id: applyEntryId || null, refund_bill_id: billRow?.id || null, status, returned_on: on, refund_amount: refund });
  await mergeDepositMeta(admin, d.id, { disposition: summary });
  return { preview, entries, bill: billRow || null, pendingApproval: Boolean(bill?.pendingApproval), postError: bill?.postError || "", status, disposition: summary };
}

// A deposit record's ledger position for its screen → { held, interest, cash, unpaid, sweeps, regime, refundBill }.
export async function depositStatus(admin, deposit, { ctx } = {}) {
  const c = ctx || makeBillingContext(admin);
  const d = deposit;
  const setup = await depositSetup(admin, c, d.project_id);
  const lease = await leaseRow(admin, d.lease_id, d.project_id);
  const regime = await depositRegime(c, setup, d, lease);
  const balance = (await depositBalances(admin, d.project_id, [d.id], { acct: setup.acct, depositCashIds: setup.depositCashIds })).get(d.id) || emptyBalance();
  const unpaid = (await unpaidCharges(admin, d.project_id, setup.acct, [d], null)).get(d.id) || 0;
  const sweeps = regime.sweeps && isOpenDeposit(d) ? (await pendingSweeps(admin, d.project_id, { ctx: c, depositIds: [d.id] })).rows : [];
  const bill = d.refund_bill_id ? must(await forProject(admin.from("bills").select("id, name, amount, amount_paid, status, approval_status, ledger_entry_id"), d.project_id).eq("id", d.refund_bill_id).maybeSingle(), "refund bill") : null;
  return {
    ...balance,
    cash: await depositBankCash(admin, d, setup, balance),
    unpaid,
    onLedger: Boolean(d.charge_entry_id),
    sweeps,
    regime: { heldIn: regime.heldIn, sweeps: regime.sweeps, warning: regime.warning, depositBank: setup.depositBank ? { id: setup.depositBank.id, name: setup.depositBank.name } : null },
    refundBill: bill,
  };
}

// Renewal (CORE-01 accept): the records moved to the new lease take their liability with them, deposit:<id>:xfer:<newLease>.
export async function transferDepositsToLease(admin, depositIds, fromLease, toLease, { ctx, actor, date } = {}) {
  const c = ctx || makeBillingContext(admin);
  const projectId = toLease.project_id;
  const entries = [];
  if (!depositIds?.length) return entries;
  const acct = await c.accounts(projectId);
  const keys = new Set(["security_deposits", "deposit_interest_payable"].map((k) => acct.byKey.get(k)?.id).filter(Boolean));
  const on = isoDate(date) || (await c.today(projectId));
  for (const id of depositIds) {
    const rows = must(await forProject(admin.from("ledger_lines").select("gl_account_id, debit, credit"), projectId).eq("lease_id", fromLease.id).eq("metadata->>depositId", id).is("deleted_at", null), "deposit lines");
    const per = new Map();
    for (const l of rows) if (keys.has(l.gl_account_id)) per.set(l.gl_account_id, round2((per.get(l.gl_account_id) || 0) + Number(l.credit) - Number(l.debit)));
    const lines = [];
    const side = (L) => ({ leaseId: L.id, tenantId: L.tenant_id || null, unitId: L.unit_id || null, propertyId: L.property_id || null });
    for (const [gl, amt] of per) {
      if (!(amt > 0)) continue;
      lines.push({ glAccountId: gl, debit: amt, ...side(fromLease), metadata: { depositId: id } }, { glAccountId: gl, credit: amt, ...side(toLease), metadata: { depositId: id } });
    }
    if (!lines.length) continue;
    const key = depositTransferKey(id, toLease.id);
    const total = round2(lines.reduce((s, l) => s + (l.debit || 0), 0));
    const res = await postOnce(
      admin,
      projectId,
      key,
      { entry: { date: on, memo: `Deposit carried to the renewal lease · ${toLease.name || ""}`.trim(), sourceType: "adjustment", sourceId: id, ...side(toLease), metadata: { depositId: id, transferredFrom: fromLease.id } }, lines },
      { acct, createdBy: actor?.id || null },
    );
    entries.push({ entryId: res.entryId, key, amount: total, kind: "deposit_transfer", created: res.created });
  }
  return entries;
}

export { DEFAULT_DEPOSIT_KIND };
