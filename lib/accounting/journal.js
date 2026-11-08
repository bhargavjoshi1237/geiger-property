import { dayOf } from "@/lib/reports/periods";
import { SOURCE_LABELS } from "@/lib/ledger/postings";

// Accounting-export journal builder (INTL-07), pure and shared with the QuickBooks Online sync (INTL-09).
// Works on normalizeLine / normalizeEntry rows and an account index ({ byId }).

export const PROFILES = [
  { value: "ledger", label: "Whole ledger", hint: "Every posting: the owners' property books and your own, for a self-managing landlord." },
  { value: "company", label: "Management company only", hint: "Your own books: management fees, company expenses and operating cash. Never trust or deposit accounts." },
];

export const CLEARING_KEY = "__trust_clearing";
export const CLEARING_NAME = "Trust Clearing";

const cents = (n) => Math.round((Number(n) || 0) * 100);
const money = (c) => c / 100;
const byIdOf = (accounts) => accounts?.byId || new Map((accounts || []).map((a) => [a.id, a]));
const nameOf = (a) => [a?.number, a?.name].filter(Boolean).join(" ");

// Lines the chosen set of books exports. `company` = non-trust, ownerless lines that are the manager's own (fee side) or carry no property, never equity.
export function selectLines(lines, accounts, { profile = "ledger" } = {}) {
  if (profile !== "company") return [...(lines || [])];
  const byId = byIdOf(accounts);
  return (lines || []).filter((l) => {
    const a = byId.get(l.glAccountId);
    if (!a || a.isTrust || a.accountType === "Equity" || l.ownerId) return false;
    return l.metadata?.side === "manager" || !l.propertyId;
  });
}

// Account name or code in the target tool: the user's mapping, else the format's default.
export function remoteAccount(account, accountMap = {}, defaultName = nameOf) {
  const mapped = account && String(accountMap?.[account.id] ?? "").trim();
  return mapped || (account ? defaultName(account) : "Unknown account");
}

const classOf = (l, { classBy, propertyNames }) => (classBy === "property" && l.propertyId ? propertyNames?.[l.propertyId] || "" : "");
// The random tail of a uuid, as the file's journal number.
const shortRef = (id, n = 10) => String(id || "").replace(/-/g, "").slice(-n).toUpperCase();

function lineOut(l, byId, opts) {
  const a = byId.get(l.glAccountId);
  return {
    accountId: l.glAccountId,
    number: a?.number || "",
    name: a?.name || "Unknown account",
    account: remoteAccount(a, opts.accountMap, opts.defaultName),
    debit: money(cents(l.debit)),
    credit: money(cents(l.credit)),
    className: classOf(l, opts),
    memo: l.memo || "",
  };
}

// Net same-account lines (day granularity) into one debit or credit each.
function netLines(rows) {
  const net = new Map();
  for (const r of rows) {
    const k = `${r.accountId}|${r.className}`;
    const cur = net.get(k) || { ...r, debit: 0, credit: 0, memo: "" };
    cur.debit += cents(r.debit);
    cur.credit += cents(r.credit);
    net.set(k, cur);
  }
  return [...net.values()]
    .map((r) => {
      const d = r.debit - r.credit;
      return { ...r, debit: money(Math.max(d, 0)), credit: money(Math.max(-d, 0)) };
    })
    .filter((r) => r.debit || r.credit);
}

// A journal that does not balance on its own (company profile: the trust side is left out) gets one offsetting line.
function balance(rows, opts) {
  const diff = rows.reduce((s, r) => s + cents(r.debit) - cents(r.credit), 0);
  if (!diff) return rows;
  const clearing = String(opts.accountMap?.[CLEARING_KEY] ?? "").trim() || CLEARING_NAME;
  return [
    ...rows,
    { accountId: CLEARING_KEY, number: "", name: CLEARING_NAME, account: clearing, debit: money(Math.max(-diff, 0)), credit: money(Math.max(diff, 0)), className: "", memo: "Offsets the trust side kept out of this export" },
  ];
}

// → [{ date, ref, memo, lines: [{ accountId, number, name, account, debit, credit, className, memo }] }], sorted by date then ref.
// opts: { granularity: 'entry'|'day', classBy: 'property'|'none', accountMap, defaultName(account), propertyNames: { id: name } }
export function buildJournals(lines, entries, accounts, opts = {}) {
  const byId = byIdOf(accounts);
  const entryMap = entries instanceof Map ? entries : new Map((entries || []).map((e) => [e.id, e]));
  const day = opts.granularity === "day";
  const groups = new Map();
  for (const l of lines || []) {
    if (!cents(l.debit) && !cents(l.credit)) continue;
    const entry = entryMap.get(l.entryId) || l.entry || null;
    const date = dayOf(l.date || entry?.date);
    const key = day ? `${date}|${l.propertyId || ""}` : l.entryId;
    if (!groups.has(key)) groups.set(key, { date, entry, propertyId: l.propertyId || "", entryIds: new Set(), rows: [] });
    const g = groups.get(key);
    g.entryIds.add(l.entryId);
    g.rows.push({ lineNo: l.lineNo || 0, row: lineOut(l, byId, opts) });
  }
  const names = opts.propertyNames || {};
  const journals = [];
  for (const g of groups.values()) {
    const ordered = g.rows.sort((a, b) => a.lineNo - b.lineNo).map((x) => x.row);
    const rows = balance(day ? netLines(ordered) : ordered, opts);
    if (!rows.length) continue;
    if (day) {
      const prop = g.propertyId ? names[g.propertyId] || "Property" : "Company";
      const n = g.entryIds.size;
      journals.push({ date: g.date, ref: `GP-${g.date.replace(/-/g, "")}-${g.propertyId ? shortRef(g.propertyId, 4) : "CO"}`, memo: `Daily summary, ${prop} (${n} ${n === 1 ? "entry" : "entries"})`, lines: rows });
    } else {
      const e = g.entry;
      const memo = e?.memo || SOURCE_LABELS[e?.sourceType] || "Journal entry";
      journals.push({ date: g.date, ref: `GP-${shortRef([...g.entryIds][0])}`, memo: e?.status === "void" ? `${memo} (voided)` : memo, lines: rows });
    }
  }
  // Journal numbers must be unique in the file: a repeat gets a suffix.
  const seen = new Map();
  for (const j of journals) {
    const n = (seen.get(j.ref) || 0) + 1;
    seen.set(j.ref, n);
    if (n > 1) j.ref = `${j.ref}-${n}`;
  }
  return journals.sort((a, b) => a.date.localeCompare(b.date) || a.ref.localeCompare(b.ref));
}

// Debits, credits and whether each journal (and the whole file) balances, in whole cents.
export function journalTotals(journals) {
  let debit = 0;
  let credit = 0;
  let lineCount = 0;
  const unbalanced = [];
  for (const j of journals || []) {
    const d = j.lines.reduce((s, l) => s + cents(l.debit), 0);
    const c = j.lines.reduce((s, l) => s + cents(l.credit), 0);
    if (d !== c) unbalanced.push(j.ref);
    debit += d;
    credit += c;
    lineCount += j.lines.length;
  }
  return { journals: (journals || []).length, lines: lineCount, debit: money(debit), credit: money(credit), balanced: debit === credit && !unbalanced.length, unbalanced };
}

// Debit and credit activity per account across the journals (compare with the Trial Balance).
export function totalsByAccount(journals) {
  const out = new Map();
  for (const j of journals || []) {
    for (const l of j.lines) {
      const cur = out.get(l.accountId) || { accountId: l.accountId, number: l.number, name: l.name, account: l.account, debit: 0, credit: 0 };
      cur.debit += cents(l.debit);
      cur.credit += cents(l.credit);
      out.set(l.accountId, cur);
    }
  }
  return [...out.values()].map((r) => ({ ...r, debit: money(r.debit), credit: money(r.credit) }));
}
