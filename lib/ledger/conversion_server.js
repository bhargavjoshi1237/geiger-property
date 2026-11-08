import "server-only";
import { CONVERSION_CLEARING_KEY, accountLabel, conversionKey, round2 } from "./postings";
import { loadAccountIndex, voidPosted } from "./store";
import {
  CLEARING_ACCOUNT,
  CONVERSION_KINDS,
  DEPOSIT_KINDS,
  bankCashGl,
  bankStarts,
  batchBillingStart,
  billingCutover,
  liveBanks,
  normalizeConversionLine,
  planContext,
  planLine,
  postGate,
  validateBatch,
  voidGate,
} from "./conversion";
import { fail, findPosted, postOnce } from "@/lib/billing/post";
import { DEPOSIT_OPEN_STATUSES, depositKindOf } from "@/lib/billing/deposits_math";
import { BILLING_SETTINGS_KEY, normalizeBillingSettings } from "@/lib/billing/settings";
import { ONBOARDING_SETTING_KEY } from "@/lib/onboarding/steps";
import { forProject } from "@/lib/supabase/scope";

// Server-only opening balances (INTL-04): post in a fixed order under conv:<batchId>:<lineId> with deposit records, bills, starting reconciliations and the billing cutover; void before go-live; every step resumes.

const CHUNK = 150;
const must = (res, what) => {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
};
const money = (n) => `$${round2(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const nowIso = () => new Date().toISOString();

export async function loadBatch(admin, projectId, batchId) {
  const row = must(await forProject(admin.from("conversion_batches").select("*").eq("id", batchId), projectId).maybeSingle(), "batch");
  if (!row || row.deleted_at) throw fail("Opening balance batch not found.", 404);
  return row;
}

export async function loadBatchLines(admin, projectId, batchId) {
  return must(await forProject(admin.from("conversion_lines").select("*").eq("batch_id", batchId), projectId).is("deleted_at", null).order("created_at"), "batch lines");
}

async function readSetting(admin, projectId, key) {
  const rows = must(await forProject(admin.from("settings").select("id, value, deleted_at").eq("key", key), projectId).limit(1), `settings ${key}`);
  return rows?.[0] || null;
}

// Shallow-merge a patch into a project setting (restoring a soft-deleted row).
async function mergeSetting(admin, projectId, key, patch) {
  const row = await readSetting(admin, projectId, key);
  const value = { ...(row && !row.deleted_at ? row.value || {} : {}), ...patch };
  const res = row
    ? await admin.from("settings").update({ value, deleted_at: null }).eq("id", row.id)
    : await admin.from("settings").insert({ project_id: projectId, key, value });
  if (res.error && res.error.code !== "23505") throw new Error(`settings ${key}: ${res.error.message}`);
}

// Live once Setup & Go-live records goLiveAt (INTL-03; INTL-06 adds the readiness check).
export async function projectIsLive(admin, projectId) {
  const row = await readSetting(admin, projectId, ONBOARDING_SETTING_KEY);
  return Boolean(row && !row.deleted_at && row.value?.goLiveAt);
}

// Opening Balance Equity (3950) on demand; the unique (project, system_key) index makes a concurrent insert harmless, and CORE-46 reuses the account.
export async function ensureClearingAccount(admin, projectId, acct) {
  if (acct?.byKey?.has(CONVERSION_CLEARING_KEY)) return acct;
  const { error } = await admin.from("gl_accounts").insert({
    project_id: projectId,
    name: CLEARING_ACCOUNT.name,
    number: CLEARING_ACCOUNT.number,
    account_type: CLEARING_ACCOUNT.accountType,
    subtype: CLEARING_ACCOUNT.subtype,
    is_system: true,
    system_key: CONVERSION_CLEARING_KEY,
    status: "Active",
    description: "Opening balances post against this account; it nets to $0.00 once every balance is in.",
  });
  if (error && error.code !== "23505") throw new Error(`Opening Balance Equity: ${error.message}`);
  return loadAccountIndex(admin, projectId);
}

async function rowsById(admin, projectId, table, columns, ids) {
  const want = [...new Set((ids || []).filter(Boolean))];
  const out = new Map();
  for (let i = 0; i < want.length; i += CHUNK) {
    for (const r of must(await forProject(admin.from(table).select(columns).in("id", want.slice(i, i + CHUNK)), projectId).is("deleted_at", null), table)) out.set(r.id, r);
  }
  return out;
}

// Everything a batch posts against, with each line's lease dimensions read from the lease (never the browser's copy).
async function postingContext(admin, batch, rows) {
  const projectId = batch.project_id;
  const raw = rows.map(normalizeConversionLine);
  const [acct, bankRows, fees, leases, owners, vendors, properties] = await Promise.all([
    loadAccountIndex(admin, projectId),
    forProject(admin.from("bank_accounts").select("id, name, account_type, status, gl_account_id"), projectId).is("deleted_at", null).order("created_at").then((r) => must(r, "bank accounts")),
    readSetting(admin, projectId, "fees_policies"),
    rowsById(admin, projectId, "leases", "id, name, unit, tenant_name, tenant_id, unit_id, property_id, metadata", raw.map((l) => l.leaseId)),
    rowsById(admin, projectId, "owners", "id, name", raw.map((l) => l.ownerId)),
    rowsById(admin, projectId, "vendors", "id, name", raw.map((l) => l.vendorId)),
    rowsById(admin, projectId, "properties", "id, name", raw.map((l) => l.propertyId)),
  ]);
  const problems = [];
  const lines = raw.map((l) => {
    const missing = (label) => problems.push({ lineId: l.id, kind: l.kind, message: `That ${label} isn't in this project.` });
    if (l.ownerId && !owners.has(l.ownerId)) missing("owner");
    if (l.vendorId && !vendors.has(l.vendorId)) missing("vendor");
    if (l.leaseId) {
      const lease = leases.get(l.leaseId);
      if (!lease) missing("lease");
      else return { ...l, tenantId: lease.tenant_id || "", unitId: lease.unit_id || "", propertyId: lease.property_id || "" };
    } else if (l.propertyId && !properties.has(l.propertyId)) missing("property");
    return l;
  });
  const banks = liveBanks(bankRows);
  const describe = (line, fallback) => {
    const lease = leases.get(line.leaseId);
    const who =
      line.kind === "owner_balance" || line.kind === "bank_outstanding"
        ? owners.get(line.ownerId)?.name || properties.get(line.propertyId)?.name
        : line.kind === "bill"
          ? [vendors.get(line.vendorId)?.name, line.ref].filter(Boolean).join(" · ")
          : line.kind === "gl_balance"
            ? properties.get(line.propertyId)?.name
            : [lease?.unit, lease?.tenant_name].filter(Boolean).join(" · ") || lease?.name;
    return [fallback, who].filter(Boolean).join(" · ");
  };
  return { acct, banks, bankRows, lines, problems, leases, owners, vendors, properties, depositHeldIn: fees?.value?.depositHeldIn || "trust", describe };
}

const batchView = (batch) => ({ id: batch.id, cutoverDate: batch.cutover_date, metadata: batch.metadata || {}, name: batch.name });
const ordered = (lines) => [...lines].sort((a, b) => CONVERSION_KINDS.indexOf(a.kind) - CONVERSION_KINDS.indexOf(b.kind));

async function updateLine(admin, line, patch) {
  must(await admin.from("conversion_lines").update(patch).eq("id", line.id), "batch line");
}
const markLine = async (admin, line, entryId, metadata) => {
  if (line.postedEntryId === entryId && !metadata) return;
  await updateLine(admin, line, { posted_entry_id: entryId, ...(metadata ? { metadata: { ...line.metadata, ...metadata } } : {}) });
};

// --- Deposits: a record per opening deposit, linked to its ledger lines so disposal works later ---------------------------

async function leaseChain(admin, projectId, leaseId) {
  const ids = [];
  for (let id = leaseId; id && !ids.includes(id) && ids.length < 20; ) {
    ids.push(id);
    const row = must(await forProject(admin.from("leases").select("renewal_of_id").eq("id", id), projectId).maybeSingle(), "lease chain");
    id = row?.renewal_of_id || null;
  }
  return ids;
}

// 2100 on the lease chain that no deposit record owns (money already on the books).
async function untrackedDeposits(admin, projectId, chain, acct) {
  const liab = acct.byKey.get("security_deposits")?.id;
  if (!liab || !chain.length) return 0;
  const rows = must(await forProject(admin.from("ledger_lines").select("debit, credit, metadata"), projectId).eq("gl_account_id", liab).in("lease_id", chain).is("deleted_at", null), "lease deposit lines");
  return round2(rows.filter((l) => !l.metadata?.depositId).reduce((s, l) => s + Number(l.credit) - Number(l.debit), 0));
}

async function depositRow(admin, projectId, id) {
  const row = must(await forProject(admin.from("security_deposits").select("*").eq("id", id), projectId).maybeSingle(), "deposit");
  return row && !row.deleted_at ? row : null;
}

// The line's deposit record: its own (id = the line's id, or one it adopted), an open off-ledger record of the same kind, else a new one.
async function depositRecordFor(admin, batch, line, c) {
  const projectId = batch.project_id;
  const own = await depositRow(admin, projectId, line.metadata?.depositId || line.id);
  if (own) return own;
  const kind = DEPOSIT_KINDS.includes(line.metadata?.kind) ? line.metadata.kind : DEPOSIT_KINDS[0];
  const chain = await leaseChain(admin, projectId, line.leaseId);
  const open = must(
    await forProject(admin.from("security_deposits").select("*"), projectId).in("lease_id", chain).in("status", DEPOSIT_OPEN_STATUSES).is("deleted_at", null),
    "lease deposits",
  ).filter((d) => depositKindOf(d) === kind);
  if (open.some((d) => d.charge_entry_id)) throw fail(`${c.describe(line, kind)}: this deposit is already on the ledger.`, 409);
  if (open.length > 1) throw fail(`${c.describe(line, kind)}: the lease has ${open.length} open ${kind.toLowerCase()} records — keep one.`, 409);
  const lease = c.leases.get(line.leaseId);
  if (open.length === 1) {
    const d = open[0];
    const previous = { status: d.status, amount: Number(d.amount) || 0, interestBearing: Boolean(d.interest_bearing) };
    const patch = { amount: round2(line.amount), interest_bearing: Boolean(line.metadata?.interestBearing ?? d.interest_bearing), metadata: { ...(d.metadata || {}), conversion: { batchId: batch.id, lineId: line.id, adopted: true } } };
    must(await forProject(admin.from("security_deposits").update(patch), projectId).eq("id", d.id), "deposit");
    await updateLine(admin, line, { metadata: { ...line.metadata, depositId: d.id, adopted: previous } });
    line.metadata = { ...line.metadata, depositId: d.id, adopted: previous };
    return { ...d, ...patch };
  }
  const bank = c.banks.find((b) => b.id === line.bankAccountId);
  const row = {
    id: line.id,
    project_id: projectId,
    name: [kind, lease?.unit, lease?.tenant_name].filter(Boolean).join(" · "),
    lease_id: line.leaseId,
    lease_name: lease?.name || null,
    tenant_id: lease?.tenant_id || null,
    tenant_name: lease?.tenant_name || null,
    unit_id: lease?.unit_id || null,
    unit: lease?.unit || null,
    property_id: lease?.property_id || null,
    status: "Pending",
    amount: round2(line.amount),
    kind,
    interest_bearing: Boolean(line.metadata?.interestBearing),
    held_location: bank?.name || null,
    metadata: { conversion: { batchId: batch.id, lineId: line.id }, ledger: "converted" },
  };
  must(await admin.from("security_deposits").upsert(row, { onConflict: "id", ignoreDuplicates: true }), "deposit");
  return (await depositRow(admin, projectId, line.id)) || row;
}

async function markDepositOnLedger(admin, d, entryId) {
  const patch = { ...(entryId && d.charge_entry_id !== entryId ? { charge_entry_id: entryId } : {}), ...(d.status === "Pending" ? { status: "Held" } : {}) };
  if (Object.keys(patch).length) must(await forProject(admin.from("security_deposits").update(patch), d.project_id).eq("id", d.id), "deposit");
}

async function postDepositLine(admin, batch, line, ctx, c, actor) {
  const projectId = batch.project_id;
  const key = conversionKey(batch.id, line.id);
  if (line.metadata?.linked && line.postedEntryId) return { lineId: line.id, kind: line.kind, key: null, entryId: line.postedEntryId, created: false, linked: true };
  const record = await depositRecordFor(admin, batch, line, c);
  const prior = await findPosted(admin, projectId, key);
  if (!prior) {
    // A deposit already on the books without a record is linked (CORE-04's deposit_link_ledger), never posted twice.
    const untracked = await untrackedDeposits(admin, projectId, await leaseChain(admin, projectId, line.leaseId), ctx.acct);
    if (Math.abs(untracked) > 0.004) {
      const linked = Number(must(await admin.rpc("deposit_link_ledger", { p_deposit_id: record.id }), "link deposit")) || 0;
      const after = linked > 0 ? await depositRow(admin, projectId, record.id) : null;
      if (after?.charge_entry_id) {
        await markLine(admin, line, after.charge_entry_id, { depositId: record.id, linked: true });
        return { lineId: line.id, kind: line.kind, key: null, entryId: after.charge_entry_id, created: false, linked: true };
      }
      if (!line.metadata?.adopted) must(await forProject(admin.from("security_deposits").update({ deleted_at: nowIso() }), projectId).eq("id", record.id), "deposit");
      throw fail(`${c.describe(line, "Deposit")}: the lease already holds ${money(untracked)} of deposits on the ledger that no record owns — reconcile them on the deposit record first.`, 409);
    }
  }
  const p = planLine(line, ctx, { depositId: record.id, sourceId: record.id });
  if (p.error) throw fail(p.error);
  const res = await postOnce(admin, projectId, key, p.built, { acct: ctx.acct, createdBy: actor?.id || null });
  await markDepositOnLedger(admin, record, res.entryId);
  await markLine(admin, line, res.entryId, line.metadata?.depositId === record.id ? null : { depositId: record.id });
  return { lineId: line.id, kind: line.kind, key, entryId: res.entryId, created: res.created, depositId: record.id };
}

// --- Bills: an Approved, unpaid bills row carrying the entry, so AP payments settle it and nothing re-posts it -------------

async function postBillLine(admin, batch, line, ctx, c, actor) {
  const projectId = batch.project_id;
  const key = conversionKey(batch.id, line.id);
  const p = planLine(line, ctx);
  if (p.error) throw fail(p.error);
  const res = await postOnce(admin, projectId, key, p.built, { acct: ctx.acct, createdBy: actor?.id || null });
  const existing = must(await forProject(admin.from("bills").select("id, ledger_entry_id"), projectId).eq("id", line.id).maybeSingle(), "bill");
  const clearing = ctx.acct.byKey.get(CONVERSION_CLEARING_KEY);
  if (!existing) {
    const vendor = c.vendors.get(line.vendorId);
    const property = c.properties.get(line.propertyId);
    must(
      await admin.from("bills").upsert(
        {
          id: line.id,
          project_id: projectId,
          name: line.memo || `Opening bill${line.ref ? ` · ${line.ref}` : ""}`,
          vendor_id: line.vendorId,
          vendor_name: vendor?.name || null,
          property_id: line.propertyId || null,
          property_name: property?.name || null,
          amount: round2(line.amount),
          amount_paid: 0,
          bill_date: line.itemDate || ctx.opening,
          due_date: line.metadata?.dueDate || null,
          reference: line.ref || null,
          status: "Open",
          approval_status: "Approved",
          approver_name: actor?.name || "Opening balances",
          approved_at: nowIso(),
          payee_type: "vendor",
          gl_account_id: clearing?.id || null,
          account: accountLabel(clearing),
          ledger_entry_id: res.entryId,
          metadata: { conversion: { batchId: batch.id, lineId: line.id } },
        },
        { onConflict: "id", ignoreDuplicates: true },
      ),
      "bill",
    );
  } else if (!existing.ledger_entry_id) must(await admin.from("bills").update({ ledger_entry_id: res.entryId }).eq("id", line.id), "bill");
  await markLine(admin, line, res.entryId);
  return { lineId: line.id, kind: line.kind, key, entryId: res.entryId, created: res.created, billId: line.id };
}

async function postPlainLine(admin, batch, line, ctx, actor) {
  const key = conversionKey(batch.id, line.id);
  const p = planLine(line, ctx);
  if (p.error) throw fail(p.error);
  const res = await postOnce(admin, batch.project_id, key, p.built, { acct: ctx.acct, createdBy: actor?.id || null });
  await markLine(admin, line, res.entryId);
  return { lineId: line.id, kind: line.kind, key, entryId: res.entryId, created: res.created };
}

// --- Starting reconciliations: one Finalized row per bank at the old statement, clearing everything but the outstanding halves ------

async function reconcileBanks(admin, batch, results, acct, banks) {
  const projectId = batch.project_id;
  const starts = bankStarts(batchView(batch));
  const entryIds = results.filter((r) => r.entryId && !r.linked).map((r) => r.entryId);
  const out = [];
  for (const [bankId, start] of starts) {
    const bank = banks.find((b) => b.id === bankId);
    if (!bank) continue;
    const gl = bankCashGl(bank, acct);
    const lines = [];
    for (let i = 0; i < entryIds.length; i += CHUNK) {
      lines.push(
        ...must(
          await forProject(admin.from("ledger_lines").select("id, debit, credit, bank_account_id, metadata, reconciliation_id"), projectId).in("entry_id", entryIds.slice(i, i + CHUNK)).eq("gl_account_id", gl).eq("bank_account_id", bankId).is("deleted_at", null),
          "bank lines",
        ),
      );
    }
    const cleared = lines.filter((l) => !l.metadata?.outstanding);
    const clearedBalance = round2(cleared.reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0));
    const found = must(
      await forProject(admin.from("bank_reconciliations").select("*"), projectId).eq("bank_account_id", bankId).eq("metadata->>conversionBatchId", batch.id).is("deleted_at", null).limit(1),
      "reconciliation",
    )[0];
    const rec =
      found ||
      must(
        await admin
          .from("bank_reconciliations")
          .insert({
            project_id: projectId,
            name: `${bank.name} · opening statement ${start.statementDate}`,
            bank_account_id: bankId,
            gl_account_id: gl,
            statement_date: start.statementDate,
            statement_balance: start.statementBalance,
            cleared_balance: clearedBalance,
            difference: round2(start.statementBalance - clearedBalance),
            status: "Finalized",
            finalized_at: nowIso(),
            metadata: { conversion: true, conversionBatchId: batch.id, clearedLineIds: cleared.map((l) => l.id), outstandingLineIds: lines.filter((l) => l.metadata?.outstanding).map((l) => l.id) },
          })
          .select("*")
          .single(),
        "reconciliation",
      );
    const todo = cleared.filter((l) => !l.reconciliation_id).map((l) => l.id);
    for (let i = 0; i < todo.length; i += CHUNK) {
      must(await admin.from("ledger_lines").update({ cleared: true, cleared_on: start.statementDate, reconciliation_id: rec.id }).in("id", todo.slice(i, i + CHUNK)), "clear lines");
    }
    must(await admin.rpc("merge_meta", { p_table: "bank_accounts", p_id: bankId, p_patch: { lastReconciled: start.statementDate, statementBalance: start.statementBalance } }), "bank account");
    out.push({ bankAccountId: bankId, reconciliationId: rec.id, statementDate: start.statementDate, statementBalance: start.statementBalance, cleared: cleared.length, outstanding: lines.length - cleared.length });
  }
  return out;
}

// --- Cutover: billing never reaches back before it; the checklist records it ----------------------------------------------

async function applyCutover(admin, batch, lines, live) {
  const projectId = batch.project_id;
  const view = batchView(batch);
  const start = batchBillingStart(view);
  const billing = await readSetting(admin, projectId, BILLING_SETTINGS_KEY);
  const plan = billingCutover({ current: normalizeBillingSettings(billing && !billing.deleted_at ? billing.value : {}).billingStartsOn, start, live });
  if (plan.project) await mergeSetting(admin, projectId, BILLING_SETTINGS_KEY, { billingStartsOn: plan.project });
  const leaseIds = [...new Set(lines.map((l) => l.leaseId).filter(Boolean))];
  const leases = await rowsById(admin, projectId, "leases", "id, metadata", leaseIds);
  for (const lease of leases.values()) {
    const own = String(lease.metadata?.billingStartsOn || "").slice(0, 10);
    if (!own || own < plan.lease) must(await admin.rpc("merge_meta", { p_table: "leases", p_id: lease.id, p_patch: { billingStartsOn: plan.lease } }), "lease billing start");
  }
  const onboarding = await readSetting(admin, projectId, ONBOARDING_SETTING_KEY);
  if (!(onboarding && !onboarding.deleted_at && onboarding.value?.cutoverDate)) await mergeSetting(admin, projectId, ONBOARDING_SETTING_KEY, { cutoverDate: view.cutoverDate });
  return plan;
}

// --- Post -------------------------------------------------------------------------------------------------------------------

// Post a batch (or finish an interrupted one) → { created, entries, reconciliations, warnings, totals }; `applyCutover: false` leaves billing and checklist settings alone.
export async function postBatch(admin, batch, { actor = null, isAdmin = false, applyCutover: cutover = true } = {}) {
  const projectId = batch.project_id;
  const live = await projectIsLive(admin, projectId);
  const gate = postGate({ live, isAdmin, status: batch.status });
  if (gate) throw fail(gate.message, gate.status);
  const rows = await loadBatchLines(admin, projectId, batch.id);
  const c = await postingContext(admin, batch, rows);
  const view = batchView(batch);
  const v = validateBatch(c.lines, c.acct, { batch: view, banks: c.bankRows, depositHeldIn: c.depositHeldIn });
  const errors = [...c.problems, ...v.errors];
  if (errors.length) {
    throw Object.assign(fail(`Fix ${errors.length === 1 ? "this" : `these ${errors.length}`} before posting: ${errors.slice(0, 3).map((e) => e.message).join(" ")}`, 409), { errors });
  }
  const acct = await ensureClearingAccount(admin, projectId, c.acct);
  const ctx = planContext(view, acct, { banks: c.bankRows, depositHeldIn: c.depositHeldIn, describe: c.describe });
  const results = [];
  for (const line of ordered(c.lines)) {
    if (line.kind === "deposit") results.push(await postDepositLine(admin, batch, line, ctx, c, actor));
    else if (line.kind === "bill") results.push(await postBillLine(admin, batch, line, ctx, c, actor));
    else results.push(await postPlainLine(admin, batch, line, ctx, actor));
  }
  const reconciliations = await reconcileBanks(admin, batch, results, acct, c.banks);
  const totals = { ...v.totals, posted: results.filter((r) => r.entryId).length, linked: results.filter((r) => r.linked).length };
  must(
    await admin
      .from("conversion_batches")
      .update({ status: "Posted", posted_at: batch.posted_at || nowIso(), posted_by: batch.posted_by || actor?.id || null, totals, metadata: { ...(batch.metadata || {}), reconciliations } })
      .eq("id", batch.id),
    "batch",
  );
  const plan = cutover ? await applyCutover(admin, batch, c.lines, live) : { warning: "" };
  return {
    created: results.filter((r) => r.created).length,
    entries: results,
    reconciliations,
    totals,
    warnings: [...v.warnings.map((w) => w.message), plan.warning].filter(Boolean),
  };
}

// --- Void (before go-live only) ------------------------------------------------------------------------------------------------

// Void every entry on its own date, undo the starting reconciliations, take back its deposit records and bills; refuses after payments or a disposal.
export async function voidBatch(admin, batch, { actor = null } = {}) {
  const projectId = batch.project_id;
  const live = await projectIsLive(admin, projectId);
  const rows = (await loadBatchLines(admin, projectId, batch.id)).map(normalizeConversionLine);
  const posted = rows.filter((l) => l.postedEntryId);
  const gate = voidGate({ live, status: batch.status, posted: posted.length });
  if (gate) throw fail(gate.message, gate.status);

  const billLines = rows.filter((l) => l.kind === "bill");
  const bills = await rowsById(admin, projectId, "bills", "id, name, amount_paid, status, metadata", billLines.map((l) => l.id));
  const paid = [...bills.values()].filter((b) => b.metadata?.conversion?.batchId === batch.id && (Number(b.amount_paid) > 0 || ["Paid", "Partially paid"].includes(b.status)));
  if (paid.length) throw fail(`${paid[0].name || "A bill"} has payments — void those first.`, 409);
  const depositLines = rows.filter((l) => l.kind === "deposit");
  const deposits = await rowsById(admin, projectId, "security_deposits", "*", depositLines.map((l) => l.metadata?.depositId || l.id));
  const disposed = [...deposits.values()].filter((d) => d.apply_entry_id || d.refund_bill_id || d.metadata?.disposition?.committedAt);
  if (disposed.length) throw fail(`${disposed[0].name || "A deposit"} has been disposed — reverse that first.`, 409);

  const recs = must(await forProject(admin.from("bank_reconciliations").select("id, metadata"), projectId).eq("metadata->>conversionBatchId", batch.id).is("deleted_at", null), "reconciliations");
  for (const rec of recs) {
    must(await admin.from("ledger_lines").update({ cleared: false, cleared_on: null, reconciliation_id: null }).eq("reconciliation_id", rec.id), "unclear lines");
    must(await admin.from("bank_reconciliations").update({ status: "Undone", metadata: { ...(rec.metadata || {}), undoneAt: nowIso(), undoneBy: actor?.id || null } }).eq("id", rec.id), "reconciliation");
  }

  const memo = `Void: opening balances${batch.name ? ` · ${batch.name}` : ""}`;
  const voids = [];
  for (const line of posted.filter((l) => !l.metadata?.linked)) {
    const entry = must(await forProject(admin.from("ledger_entries").select("id, status, entry_date"), projectId).eq("id", line.postedEntryId).maybeSingle(), "entry");
    if (!entry || entry.status === "void") continue;
    voids.push(await voidPosted(admin, entry.id, { date: entry.entry_date, memo }));
  }

  for (const line of depositLines) {
    const d = deposits.get(line.metadata?.depositId || line.id);
    if (!d) continue;
    if (line.metadata?.linked) {
      const tagged = must(await forProject(admin.from("ledger_lines").select("id, metadata"), projectId).eq("metadata->>depositId", d.id).eq("metadata->>depositLinked", "true"), "linked lines");
      for (const l of tagged) {
        const { depositId: _id, depositLinked: _linked, ...rest } = l.metadata || {};
        must(await admin.from("ledger_lines").update({ metadata: rest }).eq("id", l.id), "unlink deposit");
      }
    }
    const prev = line.metadata?.adopted;
    const patch = prev
      ? { status: prev.status, amount: prev.amount, interest_bearing: prev.interestBearing, charge_entry_id: null, metadata: { ...(d.metadata || {}), conversion: null } }
      : { deleted_at: nowIso() };
    must(await forProject(admin.from("security_deposits").update(patch), projectId).eq("id", d.id), "deposit");
  }
  for (const b of bills.values()) if (b.metadata?.conversion?.batchId === batch.id) must(await admin.from("bills").update({ status: "Void", deleted_at: nowIso() }).eq("id", b.id), "bill");

  must(await admin.from("conversion_batches").update({ status: "Voided", metadata: { ...(batch.metadata || {}), voidedAt: nowIso(), voidedBy: actor?.id || null } }).eq("id", batch.id), "batch");

  // The checklist's cutover goes with the last posted batch.
  const others = must(await forProject(admin.from("conversion_batches").select("id"), projectId).eq("status", "Posted").neq("id", batch.id).is("deleted_at", null).limit(1), "batches");
  const onboarding = await readSetting(admin, projectId, ONBOARDING_SETTING_KEY);
  if (!others.length && onboarding?.value?.cutoverDate === batch.cutover_date) await mergeSetting(admin, projectId, ONBOARDING_SETTING_KEY, { cutoverDate: null });
  return { voided: voids.length, reconciliations: recs.length };
}
