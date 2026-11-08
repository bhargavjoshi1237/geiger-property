import { CONVERSION_CLEARING_KEY, accountLabel, indexAccounts, round2 } from "./postings";
import { isOwnerSpecific } from "./ownership";
import { addDays, isLocked, lockMessage, monthEnd, shortDate } from "./periods";
import { isIsoDate, parseDate, parseMoney, planContext, planLine, validateBatch, withClearing } from "./conversion";
import { cellText } from "@/lib/import/mapping";
import { serialToIso } from "@/lib/import/xlsx_read";

// Journal entries in and out of files (CORE-46), pure and client-importable: template columns, parseJournalRows (group by entry_ref,
// resolve accounts and dimensions, balance and period-lock checks), journalToRows for export, the opening-balance router onto INTL-04's
// conversion lines, reversal and copy builders, and the idempotency keys. I/O lives in journal_server.js.

export const IMPORT_KINDS = { journal: "journal", opening: "opening_balances" };
export const MAX_IMPORT_ROWS = 5000;
export const DEFAULT_MEMO = "Journal entry";

// Keys: one entry per import row group, one reversal per entry and date (":<n>" once a voided reversal holds the plain key).
export const importKey = (importId, ref) => `jeimp:${importId}:${ref}`;
export const reversalKey = (entryId, date, n = 1) => `jerev:${entryId}:${date}${n > 1 ? `:${n}` : ""}`;

// --- Columns ------------------------------------------------------------------------------------------

const col = (key, label, aliases = [], extra = {}) => ({ key, label, aliases, ...extra });

// Every column an import can map, with the headers AppFolio, Buildium, QuickBooks Online and Yardi Breeze exports use.
export const JOURNAL_COLUMNS = [
  col("entry_ref", "Entry ref", ["ref", "reference", "entry", "entry number", "entry no", "entry #", "journal no", "journal number", "journal #", "journal", "je", "je #", "je no", "je number", "transaction id", "transaction no", "transaction number", "trans #", "trans no", "control", "control #", "control number", "document number", "doc #"]),
  col("date", "Date", ["entry date", "journal date", "transaction date", "txn date", "post date", "posting date", "gl date", "je date", "effective date", "accounting date"], { required: true }),
  col("memo", "Memo", ["entry memo", "journal memo", "entry description", "journal description", "remarks", "notes", "note"]),
  col("account_number", "Account number", ["account", "account no", "account #", "account code", "account name", "gl account", "gl account number", "gl account #", "gl code", "gl", "acct", "acct #", "acct no", "account id"], { required: true }),
  col("debit", "Debit", ["debits", "dr", "debit amount", "debit amt"]),
  col("credit", "Credit", ["credits", "cr", "credit amount", "credit amt"]),
  col("amount", "Amount (signed)", ["net", "net amount", "signed amount", "balance"]),
  col("line_memo", "Line memo", ["line description", "description", "detail", "line notes", "line note", "line detail"]),
  col("property", "Property", ["property name", "property code", "building", "location", "class"]),
  col("unit", "Unit", ["unit #", "unit number", "unit no", "unit name", "suite"]),
  col("owner", "Owner", ["owner name", "rental owner", "rental owner name"]),
  col("vendor", "Vendor", ["vendor name", "payee", "payee name", "supplier"]),
  col("lease", "Lease", ["lease name", "lease id", "lease #", "tenant", "tenant name", "resident", "resident name"]),
];

// Opening balances: one account balance per row as of a date (memo takes "description" too; no entry ref or line memo).
export const OPENING_COLUMNS = JOURNAL_COLUMNS.filter((c) => !["entry_ref", "line_memo"].includes(c.key)).map((c) =>
  c.key === "date" ? { ...c, required: false } : c.key === "memo" ? { ...c, aliases: [...c.aliases, "description", "line memo"] } : c,
);

export const JOURNAL_TEMPLATE_KEYS = ["entry_ref", "date", "memo", "account_number", "debit", "credit", "line_memo", "property", "unit", "owner", "vendor", "lease"];
export const OPENING_TEMPLATE_KEYS = ["date", "account_number", "debit", "credit", "memo", "property", "unit", "owner", "vendor", "lease"];
export const columnsFor = (kind) => (kind === IMPORT_KINDS.opening ? OPENING_COLUMNS : JOURNAL_COLUMNS);

// The template and the export share these columns, so an export imports back as is.
export const JOURNAL_EXPORT_COLUMNS = JOURNAL_TEMPLATE_KEYS.map((key) => ({ header: key, key, type: key === "date" ? "date" : key === "debit" || key === "credit" ? "money" : "text" }));

const EXAMPLE_JOURNAL = [
  ["JE-1001", "2026-10-31", "October water accrual", "5100", "420.00", "", "Water and sewer", "Maple Court", "", "", "City Water", ""],
  ["JE-1001", "2026-10-31", "October water accrual", "1000", "", "420.00", "", "Maple Court", "", "", "", ""],
  ["JE-1002", "2026-10-31", "Reclass gutter repair", "5000", "180.00", "", "", "Maple Court", "2B", "", "", ""],
  ["JE-1002", "2026-10-31", "Reclass gutter repair", "5150", "", "180.00", "", "Maple Court", "", "", "", ""],
];
const EXAMPLE_OPENING = [
  ["2026-10-31", "1000", "25000.00", "", "Operating cash", "", "", "", "", ""],
  ["2026-10-31", "1010", "18500.00", "", "Owner funds held", "Maple Court", "", "Pat Owner", "", ""],
  ["2026-10-31", "1200", "1200.00", "", "October rent", "Maple Court", "2B", "", "", "2B — Jane Doe"],
  ["2026-10-31", "2000", "", "450.00", "INV-1042", "Maple Court", "", "", "Acme Plumbing", ""],
  ["2026-10-31", "3000", "", "44250.00", "Owner equity", "", "", "", "", ""],
];
const csvCell = (v) => (/[",\r\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

// Downloadable template: the header row plus example rows.
export function templateCsv(kind = IMPORT_KINDS.journal) {
  const opening = kind === IMPORT_KINDS.opening;
  const keys = opening ? OPENING_TEMPLATE_KEYS : JOURNAL_TEMPLATE_KEYS;
  return [keys, ...(opening ? EXAMPLE_OPENING : EXAMPLE_JOURNAL)].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

// --- Cells -----------------------------------------------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const norm = (v) =>
  cellText(v)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‐-―]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
const cents = (n) => Math.round((Number(n) || 0) * 100);
const asIndex = (accounts) => (accounts?.byId ? accounts : indexAccounts(accounts || []));
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const fmt = (n) => `${n < 0 ? "-" : ""}$${Math.abs(round2(n)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// A date cell → "YYYY-MM-DD" ("" when unreadable): ISO, US M/D/Y, "31-Oct-2026", "Oct 31, 2026" or an Excel serial.
export function dateOf(v) {
  if (typeof v === "number") return v > 20000 && v < 80000 ? serialToIso(v) : "";
  const s = cellText(v);
  if (!s) return "";
  if (/^\d{5}(\.\d+)?$/.test(s)) return dateOf(Number(s));
  const iso = parseDate(s);
  if (iso) return iso;
  const pad = (n) => String(n).padStart(2, "0");
  const named = (d, m, y) => {
    const i = MONTHS.indexOf(String(m).slice(0, 3).toLowerCase());
    const out = i >= 0 ? `${y}-${pad(i + 1)}-${pad(d)}` : "";
    return isIsoDate(out) ? out : "";
  };
  let m = s.match(/^(\d{1,2})[ -]([a-z]{3,9})\.?[ ,-]+(\d{4})$/i);
  if (m) return named(m[1], m[2], m[3]);
  m = s.match(/^([a-z]{3,9})\.? (\d{1,2}),? (\d{4})$/i);
  return m ? named(m[2], m[1], m[3]) : "";
}

// An amount cell → { value } (blank = 0) or { error }; "$1,200.50", "(75.00)" and "12-" read, fractions of a cent don't.
export function amountOf(v) {
  if (v === null || v === undefined) return { value: 0 };
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return { error: "the amount isn't a number" };
    return Math.abs(v * 100 - Math.round(v * 100)) > 1e-6 ? { error: `${v} has fractions of a cent` } : { value: round2(v) };
  }
  const s = cellText(v);
  if (!s) return { value: 0 };
  const n = parseMoney(s);
  if (!Number.isFinite(n)) return { error: `couldn't read the amount "${s}"` };
  const frac = s.replace(/[^0-9.]/g, "").split(".")[1] || "";
  if (/[1-9]/.test(frac.slice(2))) return { error: `"${s}" has fractions of a cent` };
  return { value: n };
}

// --- Lookups ----------------------------------------------------------------------------------------------

const LIVE_LEASES = new Set(["Active", "Expiring soon", "Month-to-month", "Notice given", "Pending"]);

// Names → ids for one entity: an id, else a unique name; with several matches the only live one wins, else it's ambiguous.
function nameIndex(list, keysOf, label, isLive) {
  const byId = new Map((list || []).map((x) => [String(x.id).toLowerCase(), x]));
  const byName = new Map();
  for (const x of list || []) {
    for (const k of keysOf(x)) {
      const n = norm(k);
      if (!n) continue;
      const hits = byName.get(n) || [];
      if (!hits.includes(x)) hits.push(x);
      byName.set(n, hits);
    }
  }
  return (value, narrow = () => true) => {
    const raw = cellText(value);
    if (!raw) return null;
    if (UUID.test(raw)) {
      const hit = byId.get(raw.toLowerCase());
      return hit ? { item: hit } : { error: `no ${label} has the id ${raw}` };
    }
    const all = byName.get(norm(raw)) || [];
    const hits = all.filter(narrow).length ? all.filter(narrow) : all;
    if (hits.length === 1) return { item: hits[0] };
    if (hits.length > 1) {
      const live = isLive ? hits.filter(isLive) : [];
      if (live.length === 1) return { item: live[0] };
      return { error: `${label} "${raw}" matches ${hits.length} records — use its id` };
    }
    return { error: `unknown ${label} "${raw}"` };
  };
}

// Lookup view models ({ id, name, … }) → resolvers for accounts and each dimension.
export function journalResolvers(accounts, { properties = [], units = [], owners = [], vendors = [], leases = [] } = {}) {
  const acct = asIndex(accounts);
  const propertyName = new Map(properties.map((p) => [p.id, p.name]));
  const accountsList = acct.list || [];
  const byNumber = nameIndex(accountsList.filter((a) => a.number), (a) => [a.number], "account", (a) => a.status !== "Inactive");
  const byName = nameIndex(accountsList, (a) => [a.name, accountLabel(a), a.number ? `${a.number} ${a.name}` : "", a.number ? `${a.number} - ${a.name}` : ""], "account", (a) => a.status !== "Inactive");
  return {
    acct,
    account(value) {
      const raw = cellText(value).replace(/\.0+$/, "");
      if (!raw) return null;
      const first = byNumber(raw);
      if (first?.item) return first;
      const named = byName(raw);
      if (named?.item) return named;
      const lead = raw.match(/^(\d+(?:\.\d+)*)(?=\D|$)/)?.[1];
      const led = lead && lead !== raw ? byNumber(lead) : null;
      if (led?.item) return led;
      return { error: (first?.error || "").includes("matches") ? first.error : `unknown account "${raw}"` };
    },
    property: nameIndex(properties, (p) => [p.name], "property"),
    unit: nameIndex(units, (u) => [u.label, propertyName.get(u.propertyId) ? `${propertyName.get(u.propertyId)} · ${u.label}` : "", propertyName.get(u.propertyId) ? `${propertyName.get(u.propertyId)} - ${u.label}` : ""], "unit"),
    owner: nameIndex(owners, (o) => [o.name, o.email], "owner"),
    vendor: nameIndex(vendors, (v) => [v.name], "vendor"),
    lease: nameIndex(leases, (l) => [l.name, l.tenantName], "lease", (l) => LIVE_LEASES.has(l.status)),
  };
}

// One row's dimensions → { dims, errors }: a lease brings its tenant, unit and property; a unit brings its property.
function rowDimensions(rec, find) {
  const errors = [];
  const dims = { propertyId: "", unitId: "", leaseId: "", tenantId: "", ownerId: "", vendorId: "" };
  const take = (res) => {
    if (res?.error) errors.push(res.error);
    return res?.item || null;
  };
  const property = take(find.property(rec.property));
  if (property) dims.propertyId = property.id;
  const unit = take(find.unit(rec.unit, (u) => !dims.propertyId || u.propertyId === dims.propertyId));
  if (unit) {
    if (dims.propertyId && unit.propertyId && unit.propertyId !== dims.propertyId) errors.push(`unit "${cellText(rec.unit)}" isn't on that property`);
    dims.unitId = unit.id;
    dims.propertyId = dims.propertyId || unit.propertyId || "";
  }
  const lease = take(find.lease(rec.lease, (l) => (!dims.unitId || l.unitId === dims.unitId) && (!dims.propertyId || l.propertyId === dims.propertyId)));
  if (lease) {
    if (dims.propertyId && lease.propertyId && lease.propertyId !== dims.propertyId) errors.push(`the lease "${cellText(rec.lease)}" is on another property`);
    else if (dims.unitId && lease.unitId && lease.unitId !== dims.unitId) errors.push(`the lease "${cellText(rec.lease)}" is for another unit`);
    Object.assign(dims, { leaseId: lease.id, tenantId: lease.tenantId || "", unitId: lease.unitId || dims.unitId, propertyId: lease.propertyId || dims.propertyId });
  }
  const owner = take(find.owner(rec.owner));
  if (owner) dims.ownerId = owner.id;
  const vendor = take(find.vendor(rec.vendor));
  if (vendor) dims.vendorId = vendor.id;
  return { dims, errors };
}

// A row's signed amount (debit-positive) → { value } or { error }; Debit / Credit columns win over a signed Amount.
function signedOf(rec) {
  const d = amountOf(rec.debit);
  const c = amountOf(rec.credit);
  if (d.error || c.error) return { error: d.error || c.error };
  if (d.value && c.value && d.value > 0 && c.value > 0) return { error: "a line is either a debit or a credit, not both" };
  if (d.value || c.value) return { value: round2(d.value - c.value) };
  const a = amountOf(rec.amount);
  return a.error ? a : { value: a.value };
}

// --- Fingerprint -----------------------------------------------------------------------------------------------

// cyrb53: a fast 53-bit string hash, hex.
function hash53(str, seed) {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i += 1) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0");
}

const DIM_KEYS = ["propertyId", "unitId", "leaseId", "ownerId", "vendorId"];

// What makes an imported entry the same entry again: ref, date, memo and every line (account, amounts, memo, dimensions).
export function entryFingerprint(entry) {
  const canon = JSON.stringify([
    entry.ref || "",
    entry.date || "",
    entry.memo || "",
    (entry.lines || []).map((l) => [l.glAccountId, cents(l.debit), cents(l.credit), l.memo || "", ...DIM_KEYS.map((k) => l[k] || "")]),
  ]);
  return `${entry.date}:${cents(entry.total)}:${hash53(canon, 1)}${hash53(canon, 2)}`;
}

// --- Parse ---------------------------------------------------------------------------------------------------

// Records ({ row, entry_ref, date, … }) → { entries, errors, warnings, summary }. Rows group by entry_ref (a blank ref continues the
// previous row's entry; without a ref column, consecutive rows sharing a date and memo do). A group with any problem is blocked; the rest are ready.
export function parseJournalRows(records, accounts, lookups = {}, { lockedThrough = "", hasRef } = {}) {
  const find = journalResolvers(accounts, lookups);
  const list = records || [];
  const useRef = hasRef ?? list.some((r) => cellText(r.entry_ref) !== "");
  const groups = [];
  const byRef = new Map();
  let current = null;
  const newGroup = (ref, autoKey = "") => {
    const g = { ref, autoKey, rows: [], date: "", memo: "", lines: [], errors: [], warnings: [] };
    groups.push(g);
    return g;
  };

  for (const rec of list) {
    const n = rec.row;
    const problems = [];
    const ref = cellText(rec.entry_ref);
    const date = dateOf(rec.date);
    const memo = cellText(rec.memo);
    let group;
    if (useRef) {
      if (ref) {
        group = byRef.get(ref);
        if (!group) {
          group = newGroup(ref);
          byRef.set(ref, group);
        }
        if (ref.length > 100) problems.push("the entry ref is over 100 characters");
      } else if (current) group = current;
      else {
        group = newGroup(`Row ${n}`);
        problems.push("the entry ref is blank");
      }
    } else {
      const key = `${date}|${memo}`;
      group = current && current.autoKey === key ? current : newGroup(`Row ${n}`, key);
    }
    current = group;
    group.rows.push(n);

    if (!cellText(rec.date)) {
      if (!group.date && !useRef) problems.push("the date is blank");
    } else if (!date) problems.push(`couldn't read the date "${cellText(rec.date)}"`);
    else if (!group.date) group.date = date;
    else if (group.date !== date) problems.push(`its date ${date} differs from the entry's ${group.date}`);
    if (memo && !group.memo) group.memo = memo;

    const res = find.account(rec.account_number);
    let account = null;
    if (!res) problems.push("the account number is blank");
    else if (res.error) problems.push(res.error);
    else if (res.item.status === "Inactive") problems.push(`account ${accountLabel(res.item)} is inactive`);
    else account = res.item;

    const amount = signedOf(rec);
    if (amount.error) problems.push(amount.error);
    const { dims, errors: dimErrors } = rowDimensions(rec, find);
    problems.push(...dimErrors);

    if (problems.length) {
      for (const message of problems) group.errors.push({ row: n, ref: group.ref, message: `${message[0].toUpperCase()}${message.slice(1)}.` });
      continue;
    }
    if (!amount.value) {
      group.warnings.push({ row: n, ref: group.ref, message: "No amount — the row is skipped." });
      continue;
    }
    group.lines.push({
      row: n,
      glAccountId: account.id,
      debit: amount.value > 0 ? amount.value : 0,
      credit: amount.value < 0 ? -amount.value : 0,
      memo: cellText(rec.line_memo),
      ...dims,
    });
  }

  const entries = groups.map((g) => {
    if (!g.date && !g.errors.some((e) => /date/.test(e.message))) g.errors.push({ row: g.rows[0], ref: g.ref, message: "The entry has no date." });
    g.memo = g.memo || DEFAULT_MEMO;
    for (const l of g.lines) if (l.memo === g.memo) l.memo = "";
    const dr = round2(g.lines.reduce((s, l) => s + l.debit, 0));
    const cr = round2(g.lines.reduce((s, l) => s + l.credit, 0));
    const span = g.rows.length > 1 ? `rows ${g.rows[0]}–${g.rows[g.rows.length - 1]}` : `row ${g.rows[0]}`;
    if (!g.errors.length) {
      if (g.lines.length < 2) g.errors.push({ row: g.rows[0], ref: g.ref, message: `Entry ${g.ref} (${span}) needs at least two lines with an amount.` });
      else if (cents(dr) !== cents(cr)) g.errors.push({ row: g.rows[0], ref: g.ref, message: `Entry ${g.ref} (${span}) doesn't balance: debits ${fmt(dr)}, credits ${fmt(cr)}.` });
    }
    if (g.date && isLocked(g.date, lockedThrough)) {
      g.errors.push({ row: g.rows[0], ref: g.ref, message: `Entry ${g.ref} is dated ${shortDate(g.date)}, in a closed period. ${lockMessage(lockedThrough)}` });
    }
    const props = [...new Set(g.lines.map((l) => l.propertyId))];
    const entry = {
      ref: g.ref,
      rows: g.rows,
      date: g.date,
      memo: g.memo,
      lines: g.lines,
      total: dr,
      propertyId: props.length === 1 ? props[0] : "",
      ownerExplicit: g.lines.some((l) => l.ownerId),
      errors: g.errors,
      warnings: g.warnings,
      status: g.errors.length ? "blocked" : "ready",
    };
    entry.fingerprint = entryFingerprint(entry);
    return entry;
  });

  const errors = entries.flatMap((e) => e.errors).sort((a, b) => a.row - b.row);
  const warnings = entries.flatMap((e) => e.warnings).sort((a, b) => a.row - b.row);
  return { entries, errors, warnings, summary: summarizeEntries(entries, list.length) };
}

// Counts for the preview: rows, entries, ready, blocked, duplicates and the ready total.
export function summarizeEntries(entries, rows = 0) {
  const ready = entries.filter((e) => e.status === "ready");
  return {
    rows,
    entries: entries.length,
    ready: ready.length,
    blocked: entries.filter((e) => e.status === "blocked").length,
    duplicates: entries.filter((e) => e.status === "duplicate").length,
    total: round2(ready.reduce((s, e) => s + e.total, 0)),
  };
}

// Entries already on the ledger stop being ready: a ref that is a live entry id here (an export of this ledger) or a fingerprint a live entry holds.
export function markDuplicates(entries, { entryIds = new Set(), fingerprints = new Map() } = {}) {
  return entries.map((e) => {
    if (e.status !== "ready") return e;
    if (entryIds.has(String(e.ref).toLowerCase())) return { ...e, status: "duplicate", duplicateOf: e.ref, note: "This entry was exported from this ledger and is already in it." };
    const hit = fingerprints.get(e.fingerprint);
    if (hit) return { ...e, status: "duplicate", duplicateOf: hit.entryId, note: `Already on the ledger${hit.sourceFile ? ` from ${hit.sourceFile}` : ""}${hit.date ? ` (${shortDate(hit.date)})` : ""}.` };
    return e;
  });
}

// A ready entry → the input buildJournal posts, tagged with its import (owner lines make it owner-specific, CORE-08).
export function journalEntryInput(entry, { importId = "", fileName = "" } = {}) {
  return {
    date: entry.date,
    memo: entry.memo || DEFAULT_MEMO,
    propertyId: entry.propertyId || undefined,
    lines: entry.lines.map((l) => ({
      glAccountId: l.glAccountId,
      debit: l.debit,
      credit: l.credit,
      memo: l.memo || undefined,
      propertyId: l.propertyId || null,
      unitId: l.unitId || null,
      leaseId: l.leaseId || null,
      tenantId: l.tenantId || null,
      ownerId: l.ownerId || null,
      vendorId: l.vendorId || null,
    })),
    metadata: {
      importId,
      sourceFile: fileName,
      entryRef: entry.ref,
      importFingerprint: entry.fingerprint,
      ...(entry.ownerExplicit ? { ownerExplicit: true } : {}),
    },
  };
}

// --- Export -------------------------------------------------------------------------------------------------

// Dimension ids → the text the importer resolves back to the same id: a name when it's unique, else the id.
export function dimensionLabels({ properties = [], units = [], owners = [], vendors = [], leases = [] } = {}) {
  const unique = (list, nameOf) => {
    const counts = new Map();
    for (const x of list) counts.set(norm(nameOf(x)), (counts.get(norm(nameOf(x))) || 0) + 1);
    return new Map(list.map((x) => [x.id, nameOf(x) && counts.get(norm(nameOf(x))) === 1 ? nameOf(x) : x.id]));
  };
  const unitById = new Map(units.map((u) => [u.id, u]));
  const perProperty = new Map();
  for (const u of units) perProperty.set(`${u.propertyId}|${norm(u.label)}`, (perProperty.get(`${u.propertyId}|${norm(u.label)}`) || 0) + 1);
  const unitGlobal = unique(units, (u) => u.label);
  return {
    property: unique(properties, (p) => p.name),
    owner: unique(owners, (o) => o.name),
    vendor: unique(vendors, (v) => v.name),
    lease: unique(leases, (l) => l.name),
    // A unit label is enough beside its own property when the label is unique there.
    unit: (id, propertyId) => {
      const u = unitById.get(id);
      if (!u) return id || "";
      if (u.label && propertyId && propertyId === u.propertyId && perProperty.get(`${u.propertyId}|${norm(u.label)}`) === 1) return u.label;
      return unitGlobal.get(id) || id;
    },
  };
}

// Posted entries (with lines) → template rows, one per line, in the import's column order.
export function journalToRows(entries, accounts, names = {}) {
  const acct = asIndex(accounts);
  const labels = names.property ? names : dimensionLabels(names);
  const out = [];
  for (const e of entries || []) {
    const ownerOk = isOwnerSpecific(e);
    const memo = e.memo || DEFAULT_MEMO;
    for (const l of [...(e.lines || [])].sort((a, b) => (a.lineNo || 0) - (b.lineNo || 0))) {
      if (!round2(l.debit) && !round2(l.credit)) continue;
      const a = acct.byId.get(l.glAccountId);
      out.push({
        entry_ref: e.metadata?.entryRef || e.id,
        date: e.date,
        memo,
        account_number: a ? a.number || a.name : l.glAccountId,
        debit: round2(l.debit) || null,
        credit: round2(l.credit) || null,
        line_memo: l.memo && l.memo !== memo ? l.memo : "",
        property: l.propertyId ? labels.property.get(l.propertyId) || l.propertyId : "",
        unit: l.unitId ? labels.unit(l.unitId, l.propertyId) : "",
        owner: ownerOk && l.ownerId ? labels.owner.get(l.ownerId) || l.ownerId : "",
        vendor: l.vendorId ? labels.vendor.get(l.vendorId) || l.vendorId : "",
        lease: l.leaseId ? labels.lease.get(l.leaseId) || l.leaseId : "",
      });
    }
  }
  return out;
}

// --- Reverse and copy ------------------------------------------------------------------------------------------

// Keys a reversible entry may carry: none (manual), imports and recurring entries (CORE-48); every other key belongs to a Geiger flow.
const REVERSIBLE_KEYS = /^(jeimp|recur):/;

// Why an entry can't be reversed on a date ("" when it can).
export function reverseBlock(entry) {
  if (!entry) return "That entry isn't in this project.";
  if (entry.status === "void") return "This entry is void.";
  if (entry.reversalOf) return "This entry reverses a void and can't be reversed.";
  if (entry.metadata?.reverses) return "This entry is itself a reversal — void it to undo it.";
  if (entry.sourceType !== "adjustment") return "Only journal entries can be reversed on a date — void a charge, payment or bill instead.";
  if (entry.idempotencyKey && !REVERSIBLE_KEYS.test(entry.idempotencyKey)) return "Geiger posted this entry for another record — void it instead.";
  return "";
}

// The mirror of an entry dated `date`: debits and credits swap, dimensions stay, lines apply to the original (as ledger_void's do).
export function buildReversal(entry, { date, memo = "", closedThrough = "" } = {}) {
  const text = String(memo || "").trim();
  const lines = (entry.lines || [])
    .filter((l) => round2(l.debit) || round2(l.credit))
    .map((l) => ({
      glAccountId: l.glAccountId,
      debit: round2(l.credit),
      credit: round2(l.debit),
      memo: text || `Reversal: ${l.memo || entry.memo || DEFAULT_MEMO}`,
      propertyId: l.propertyId || null,
      unitId: l.unitId || null,
      leaseId: l.leaseId || null,
      tenantId: l.tenantId || null,
      ownerId: l.ownerId || null,
      vendorId: l.vendorId || null,
      bankAccountId: l.bankAccountId || null,
      jobId: l.jobId || null,
      appliesToEntryId: l.appliesToEntryId || entry.id,
      metadata: l.metadata || {},
    }));
  const metadata = {
    reverses: entry.id,
    ...(entry.metadata?.ownerExplicit ? { ownerExplicit: true } : {}),
    ...(closedThrough ? { closedThrough } : {}),
  };
  const dims = Object.fromEntries(["propertyId", "unitId", "leaseId", "tenantId", "ownerId", "vendorId"].filter((k) => entry[k]).map((k) => [k, entry[k]]));
  return { entry: { date, memo: text || `Reversal: ${entry.memo || DEFAULT_MEMO}`, sourceType: "adjustment", metadata, ...dims }, lines };
}

// A posted entry → the journal dialog's draft (memo, property default, lines with their dimensions); the date is left to the dialog.
export function copyDraft(entry) {
  const memo = entry?.memo || "";
  const ownerOk = isOwnerSpecific(entry);
  const lines = (entry?.lines || [])
    .filter((l) => round2(l.debit) || round2(l.credit))
    .map((l) => ({
      glAccountId: l.glAccountId,
      debit: round2(l.debit) ? String(round2(l.debit)) : "",
      credit: round2(l.credit) ? String(round2(l.credit)) : "",
      memo: l.memo && l.memo !== memo ? l.memo : "",
      propertyId: l.propertyId || "",
      unitId: l.unitId || "",
      leaseId: l.leaseId || "",
      tenantId: l.tenantId || "",
      ownerId: ownerOk ? l.ownerId || "" : "",
      vendorId: l.vendorId || "",
    }));
  const props = [...new Set(lines.map((l) => l.propertyId))];
  return { memo, propertyId: props.length === 1 ? props[0] : "", lines };
}

// The journal dialog's draft → buildJournal input: the property default fills lines without one, dimensions every line shares go on the
// entry, and an owner on any line makes the entry owner-specific (CORE-08), else owners are dropped at posting.
export function manualJournalInput({ date, memo = "", propertyId = "", lines = [] } = {}) {
  const out = lines
    .filter((l) => Number(l.debit) || Number(l.credit))
    .map((l) => ({
      glAccountId: l.glAccountId,
      debit: l.debit,
      credit: l.credit,
      memo: String(l.memo || "").trim() || undefined,
      propertyId: l.propertyId || propertyId || null,
      unitId: l.unitId || null,
      leaseId: l.leaseId || null,
      tenantId: l.tenantId || null,
      ownerId: l.ownerId || null,
      vendorId: l.vendorId || null,
      ...(l.bankAccountId ? { bankAccountId: l.bankAccountId } : {}),
      ...(l.jobId ? { jobId: l.jobId } : {}),
    }));
  const shared = (k) => {
    const values = [...new Set(out.map((l) => l[k] || ""))];
    return values.length === 1 && values[0] ? values[0] : undefined;
  };
  const ownerExplicit = out.some((l) => l.ownerId);
  return {
    date,
    memo: String(memo || "").trim() || DEFAULT_MEMO,
    propertyId: shared("propertyId"),
    unitId: shared("unitId"),
    leaseId: shared("leaseId"),
    tenantId: shared("tenantId"),
    vendorId: shared("vendorId"),
    ...(ownerExplicit ? { ownerId: shared("ownerId"), metadata: { ownerExplicit: true } } : {}),
    lines: out,
  };
}

// --- Opening balances (onto INTL-04's conversion lines) ------------------------------------------------------------

export const isMonthEnd = (d) => isIsoDate(d) && monthEnd(d) === d;
export const cutoverFor = (asOf) => (isIsoDate(asOf) ? addDays(asOf, 1) : "");

// Account balance rows → INTL-04 conversion lines, each against Opening Balance Equity (3950): AR per lease (tenant balance), trust cash
// per owner × property (owner balance), AP per vendor (bill), deposits and prepaid per lease, everything else a GL balance. Deposits and
// tenant credits bring their own cash, so it comes off the file's cash rows on that account. → { lines, errors, notes }.
export function openingLinesFromRows(records, accounts, lookups = {}, { asOf = "", banks = [], depositHeldIn = "trust", newId = () => crypto.randomUUID(), batchId = "" } = {}) {
  const acct = withClearing(asIndex(accounts));
  const find = journalResolvers(acct, lookups);
  const lines = [];
  const errors = [];
  const notes = [];
  const interestRows = [];
  const bankFor = (glId) => {
    const mapped = (banks || []).filter((b) => (b.glAccountId ?? b.gl_account_id) === glId && b.status !== "Closed");
    return mapped.length === 1 ? mapped[0].id : "";
  };

  for (const rec of records || []) {
    const n = rec.row;
    const problems = [];
    const res = find.account(rec.account_number);
    const a = res?.item || null;
    if (!res) problems.push("the account number is blank");
    else if (res.error) problems.push(res.error);
    const amount = signedOf(rec);
    if (amount.error) problems.push(amount.error);
    const date = dateOf(rec.date);
    if (cellText(rec.date) && !date) problems.push(`couldn't read the date "${cellText(rec.date)}"`);
    if (date && asOf && date > asOf) problems.push(`it's dated after the as-of date ${asOf}`);
    const { dims, errors: dimErrors } = rowDimensions(rec, find);
    problems.push(...dimErrors);
    const value = amount.value || 0;
    const fail = (message) => problems.push(message);
    let line = null;
    if (!problems.length && a) {
      const base = { id: newId(), batchId, propertyId: dims.propertyId, unitId: dims.unitId, leaseId: dims.leaseId, tenantId: dims.tenantId, ownerId: "", vendorId: "", bankAccountId: "", glAccountId: "", itemDate: date && date !== asOf ? date : "", memo: cellText(rec.memo), ref: "", postedEntryId: "", metadata: { row: n } };
      if (!value) notes.push({ row: n, message: "Zero balance — skipped." });
      else if (a.systemKey === CONVERSION_CLEARING_KEY) fail("Opening Balance Equity (3950) is the other side of every row — leave it out of the file");
      else if (a.subtype === "receivable") {
        if (!dims.leaseId) fail(`${accountLabel(a)} opens per lease — name the lease`);
        else if (value < 0) fail(`a credit balance on ${accountLabel(a)} belongs on Prepaid Rent (2200) for the lease`);
        else line = { ...base, kind: "tenant_balance", amount: value };
      } else if (a.subtype === "subsidy_receivable") fail(`${accountLabel(a)} can't open from a file — post it as a journal entry against Opening Balance Equity after the import`);
      else if (a.subtype === "payable") {
        if (!dims.vendorId) fail(`${accountLabel(a)} opens per vendor — name the vendor`);
        else if (value > 0) fail(`a debit balance on ${accountLabel(a)} isn't an unpaid bill`);
        else line = { ...base, kind: "bill", vendorId: dims.vendorId, amount: -value, ref: cellText(rec.memo) };
      } else if (a.systemKey === "security_deposits") {
        if (!dims.leaseId) fail("security deposits open per lease — name the lease");
        else if (value > 0) fail("a deposit held is a credit balance");
        else line = { ...base, kind: "deposit", amount: -value, metadata: { row: n, kind: "Security deposit", interest: 0, interestBearing: false } };
      } else if (a.systemKey === "deposit_interest_payable") {
        if (!dims.leaseId) fail("deposit interest opens per lease — name the lease");
        else if (value > 0) fail("interest held is a credit balance");
        else interestRows.push({ row: n, leaseId: dims.leaseId, amount: -value });
      } else if (a.subtype === "deposits") fail(`${accountLabel(a)} isn't supported here — enter it in the opening balances wizard's Deposits step`);
      else if (a.subtype === "prepaid") {
        if (!dims.leaseId) fail(`${accountLabel(a)} opens per lease — name the lease`);
        else if (value > 0) fail(`a prepaid balance is a credit balance`);
        else line = { ...base, kind: "tenant_credit", amount: -value };
      } else if (a.subtype === "cash" && dims.ownerId) {
        line = { ...base, kind: "owner_balance", ownerId: dims.ownerId, amount: value, bankAccountId: bankFor(a.id), metadata: { row: n, account: a.id } };
      } else {
        line = { ...base, kind: "gl_balance", glAccountId: a.id, ownerId: dims.ownerId, vendorId: dims.vendorId, amount: value };
      }
    }
    if (problems.length) for (const m of problems) errors.push({ row: n, message: `${m[0].toUpperCase()}${m.slice(1)}.` });
    else if (line) lines.push(line);
  }

  // Interest held rides on its lease's deposit.
  for (const r of interestRows) {
    const dep = lines.find((l) => l.kind === "deposit" && l.leaseId === r.leaseId);
    if (!dep) errors.push({ row: r.row, message: "Deposit interest needs the lease's security deposit row in the same file." });
    else dep.metadata = { ...dep.metadata, interest: round2((Number(dep.metadata.interest) || 0) + r.amount), interestBearing: true };
  }

  const cutover = cutoverFor(asOf);
  const ctx = planContext({ id: batchId, cutoverDate: cutover }, acct, { banks, depositHeldIn });
  // An owner balance must land on the cash account its row named.
  for (const l of lines.filter((x) => x.kind === "owner_balance")) {
    const p = planLine(l, ctx);
    const cashGl = p.built?.lines.find((x) => acct.byId.get(x.glAccountId)?.subtype === "cash")?.glAccountId;
    if (!p.error && cashGl && cashGl !== l.metadata.account) errors.push({ row: l.metadata.row, message: `No bank account posts to ${accountLabel(acct.byId.get(l.metadata.account))} — link one in Bank Accounts, or put this balance on ${accountLabel(acct.byId.get(cashGl))}.` });
  }
  // Cash the deposits and tenant credits bring in comes off the file's own rows on that cash account.
  const brought = new Map();
  for (const l of lines.filter((x) => x.kind === "deposit" || x.kind === "tenant_credit")) {
    const p = planLine(l, ctx);
    if (p.error) continue;
    for (const bl of p.built.lines) if (bl.debit > 0 && acct.byId.get(bl.glAccountId)?.subtype === "cash") brought.set(bl.glAccountId, round2((brought.get(bl.glAccountId) || 0) + bl.debit));
  }
  for (const [gl, total] of brought) {
    let left = total;
    for (const l of lines.filter((x) => x.kind === "gl_balance" && x.glAccountId === gl && x.amount > 0)) {
      const take = Math.min(left, l.amount);
      l.amount = round2(l.amount - take);
      left = round2(left - take);
      notes.push({ row: l.metadata.row, message: `${fmt(take)} of this ${accountLabel(acct.byId.get(gl))} balance comes in with the deposits and tenant credits${l.amount ? `; ${fmt(l.amount)} posts as its own balance` : ""}.` });
      if (!left) break;
    }
    if (left) notes.push({ row: null, message: `The deposits and tenant credits bring ${fmt(left)} into ${accountLabel(acct.byId.get(gl))} beyond the file's own rows for it, so Opening Balance Equity will be off by that much — check that account's rows.` });
  }
  return { lines: lines.filter((l) => !(l.kind === "gl_balance" && !l.amount)), errors, notes };
}

// Opening rows → the routed lines plus INTL-04's own validation, with every problem tied to its file row.
export function previewOpening(records, accounts, lookups = {}, { asOf = "", banks = [], depositHeldIn = "trust", batchId = "", newId } = {}) {
  const routed = openingLinesFromRows(records, accounts, lookups, { asOf, banks, depositHeldIn, batchId, newId });
  const errors = [...routed.errors];
  if (!isIsoDate(asOf)) errors.unshift({ row: null, message: "Pick the as-of date the balances are from." });
  else if (!isMonthEnd(asOf)) errors.unshift({ row: null, message: `Opening balances are as of a month end — ${monthEnd(asOf)}, not ${asOf}.` });
  const v = validateBatch(routed.lines, accounts, { batch: { id: batchId, cutoverDate: cutoverFor(asOf) }, banks, depositHeldIn });
  const rowOf = (lineId) => routed.lines.find((l) => l.id === lineId)?.metadata?.row ?? null;
  // A bad as-of date is reported once above, not again as INTL-04's cutover check.
  for (const e of v.errors) if (e.lineId || isMonthEnd(asOf)) errors.push({ row: rowOf(e.lineId), message: e.message });
  const warnings = v.warnings.map((w) => ({ row: rowOf(w.lineId), message: w.message }));
  return { lines: routed.lines, errors, warnings, notes: routed.notes, entries: v.entries, clearingNet: v.clearingNet, totals: v.totals, ready: errors.length === 0 && routed.lines.length > 0 };
}
