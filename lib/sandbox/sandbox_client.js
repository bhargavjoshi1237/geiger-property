// In-memory stand-in for the Supabase browser client, used only while the landing
// playground's sandbox is on (see sandbox_mode.js). It covers the PostgREST
// surface the data layer uses — from/select/insert/update/upsert/delete, the
// filters, order/limit/range and single/maybeSingle — over a store seeded with a
// sample portfolio. Writes live in the tab only; auth is delegated to the real
// client so the visitor's session is unaffected.

let store = null;
let storePromise = null;
const blobUrls = new Map();

// Load the sample portfolio once, on the first sandboxed query.
async function getStore() {
  if (store) return store;
  if (!storePromise) {
    storePromise = import("./seed").then(({ buildSeed }) => {
      store = buildSeed();
      return store;
    });
  }
  return storePromise;
}

function tableRows(db, table) {
  if (!db.has(table)) db.set(table, []);
  return db.get(table);
}

const clone = (v) => (v === undefined ? v : structuredClone(v));
const nowIso = () => new Date().toISOString();

// ---- filters -------------------------------------------------------------

const same = (a, b) => (a == null || b == null ? a == b : String(a) === String(b));

function compare(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  const na = Number(a);
  const nb = Number(b);
  if (a !== "" && b !== "" && !Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  return String(a).localeCompare(String(b));
}

function likeToRegex(pattern, flags) {
  const escaped = String(pattern).replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped.replace(/%/g, ".*").replace(/_/g, ".")}$`, flags);
}

function contains(value, needle) {
  if (Array.isArray(value)) {
    const list = Array.isArray(needle) ? needle : [needle];
    return list.every((n) => value.some((v) => same(v, n)));
  }
  if (value && typeof value === "object" && needle && typeof needle === "object") {
    return Object.entries(needle).every(([k, v]) => same(value[k], v));
  }
  return false;
}

function test(row, col, op, val) {
  const v = row[col];
  switch (op) {
    case "eq": return same(v, val);
    case "neq": return !same(v, val);
    case "gt": return compare(v, val) > 0;
    case "gte": return compare(v, val) >= 0;
    case "lt": return compare(v, val) < 0;
    case "lte": return compare(v, val) <= 0;
    case "is": return val === null || val === "null" ? v == null : same(Boolean(v), val);
    case "in": return (val || []).some((x) => same(v, x));
    case "like": return likeToRegex(val).test(String(v ?? ""));
    case "ilike": return likeToRegex(val, "i").test(String(v ?? ""));
    case "contains":
    case "cs": return contains(v, val);
    default: return true;
  }
}

// Split on commas that aren't inside parentheses.
function splitTopLevel(str) {
  const parts = [];
  let depth = 0;
  let cur = "";
  for (const ch of str) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur) parts.push(cur);
  return parts;
}

// Parse a PostgREST `or` string (e.g. "project_id.eq.X,project_id.is.null").
function parseOr(expr) {
  return splitTopLevel(expr).map((part) => {
    const [col, op, ...rest] = part.split(".");
    let raw = rest.join(".");
    if (op === "in") raw = raw.replace(/^\(|\)$/g, "").split(",");
    else if (raw === "null") raw = null;
    else if (raw === "true" || raw === "false") raw = raw === "true";
    return (row) => test(row, col, op, raw);
  });
}

// ---- query builder -------------------------------------------------------

function pick(row, cols) {
  if (!cols || cols.trim() === "*") return row;
  const out = {};
  for (const c of cols.split(",").map((s) => s.trim()).filter(Boolean)) out[c] = row[c];
  return out;
}

function withDefaults(row) {
  const ts = nowIso();
  return {
    metadata: {},
    deleted_at: null,
    ...row,
    id: row.id || crypto.randomUUID(),
    created_at: row.created_at || ts,
    updated_at: row.updated_at || ts,
  };
}

class SandboxQuery {
  constructor(table) {
    this.table = table;
    this.op = "select";
    this.cols = "*";
    this.returning = false;
    this.filters = [];
    this.orders = [];
    this.limitN = null;
    this.rangeFrom = null;
    this.rangeTo = null;
    this.mode = "many";
    this.countMode = null;
    this.head = false;
  }

  select(cols = "*", opts = {}) {
    if (this.op === "select") this.cols = cols;
    else this.returning = cols;
    if (opts.count) this.countMode = opts.count;
    if (opts.head) this.head = true;
    return this;
  }

  insert(values) {
    this.op = "insert";
    this.values = values;
    return this;
  }

  update(values) {
    this.op = "update";
    this.values = values;
    return this;
  }

  upsert(values, opts = {}) {
    this.op = "upsert";
    this.values = values;
    this.onConflict = (opts.onConflict || "id").split(",").map((s) => s.trim());
    this.ignoreDuplicates = Boolean(opts.ignoreDuplicates);
    return this;
  }

  delete() {
    this.op = "delete";
    return this;
  }

  filter(col, op, val) {
    this.filters.push((row) => test(row, col, op, val));
    return this;
  }

  eq(col, val) { return this.filter(col, "eq", val); }
  neq(col, val) { return this.filter(col, "neq", val); }
  gt(col, val) { return this.filter(col, "gt", val); }
  gte(col, val) { return this.filter(col, "gte", val); }
  lt(col, val) { return this.filter(col, "lt", val); }
  lte(col, val) { return this.filter(col, "lte", val); }
  is(col, val) { return this.filter(col, "is", val); }
  in(col, vals) { return this.filter(col, "in", vals); }
  like(col, val) { return this.filter(col, "like", val); }
  ilike(col, val) { return this.filter(col, "ilike", val); }
  contains(col, val) { return this.filter(col, "contains", val); }

  not(col, op, val) {
    this.filters.push((row) => !test(row, col, op, val));
    return this;
  }

  match(obj) {
    for (const [k, v] of Object.entries(obj || {})) this.eq(k, v);
    return this;
  }

  or(expr) {
    const tests = parseOr(String(expr || ""));
    this.filters.push((row) => tests.some((t) => t(row)));
    return this;
  }

  order(col, opts = {}) {
    this.orders.push({ col, asc: opts.ascending !== false });
    return this;
  }

  limit(n) {
    this.limitN = n;
    return this;
  }

  range(from, to) {
    this.rangeFrom = from;
    this.rangeTo = to;
    return this;
  }

  single() {
    this.mode = "single";
    return this;
  }

  maybeSingle() {
    this.mode = "maybe";
    return this;
  }

  matches(row) {
    return this.filters.every((f) => f(row));
  }

  async run() {
    const db = await getStore();
    const rows = tableRows(db, this.table);
    let result = [];

    if (this.op === "select") {
      result = rows.filter((r) => this.matches(r));
    } else if (this.op === "insert") {
      const list = (Array.isArray(this.values) ? this.values : [this.values]).map(withDefaults);
      rows.push(...list);
      result = list;
    } else if (this.op === "update") {
      const patch = { ...this.values, updated_at: nowIso() };
      result = rows.filter((r) => this.matches(r));
      for (const r of result) Object.assign(r, clone(patch));
    } else if (this.op === "upsert") {
      for (const value of Array.isArray(this.values) ? this.values : [this.values]) {
        const existing = rows.find((r) => this.onConflict.every((c) => same(r[c], value[c])));
        if (existing) {
          if (!this.ignoreDuplicates) Object.assign(existing, clone(value), { updated_at: nowIso() });
          result.push(existing);
        } else {
          const row = withDefaults(clone(value));
          rows.push(row);
          result.push(row);
        }
      }
    } else if (this.op === "delete") {
      result = rows.filter((r) => this.matches(r));
      db.set(this.table, rows.filter((r) => !result.includes(r)));
    }

    // Writes only return rows when .select() was chained, like PostgREST.
    if (this.op !== "select" && this.returning === false) {
      return { data: null, error: null, count: null, status: 204 };
    }

    for (const { col, asc } of [...this.orders].reverse()) {
      result = [...result].sort((a, b) => (asc ? 1 : -1) * compare(a[col], b[col]));
    }
    const count = result.length;
    if (this.rangeFrom != null) result = result.slice(this.rangeFrom, this.rangeTo + 1);
    if (this.limitN != null) result = result.slice(0, this.limitN);

    const cols = this.op === "select" ? this.cols : this.returning;
    const data = result.map((r) => clone(pick(r, cols)));
    const countOut = this.countMode ? count : null;

    if (this.head) return { data: null, error: null, count: countOut, status: 200 };
    if (this.mode === "single" && data.length !== 1) {
      return {
        data: null,
        error: { code: "PGRST116", message: `Expected 1 row, got ${data.length}` },
        count: countOut,
        status: 406,
      };
    }
    if (this.mode === "maybe" && data.length > 1) {
      return {
        data: null,
        error: { code: "PGRST116", message: `Expected at most 1 row, got ${data.length}` },
        count: countOut,
        status: 406,
      };
    }
    const out = this.mode === "many" ? data : data[0] ?? null;
    return { data: out, error: null, count: countOut, status: 200 };
  }

  then(resolve, reject) {
    return this.run().then(resolve, reject);
  }
}

// ---- storage -------------------------------------------------------------

// Uploads become blob URLs held for the tab; nothing leaves the browser.
function sandboxBucket(bucket) {
  const key = (path) => `${bucket}/${path}`;
  return {
    async upload(path, file) {
      const url = typeof URL !== "undefined" && file instanceof Blob ? URL.createObjectURL(file) : "";
      blobUrls.set(key(path), url);
      return { data: { path }, error: null };
    },
    getPublicUrl(path) {
      return { data: { publicUrl: blobUrls.get(key(path)) || "" } };
    },
    async createSignedUrl(path) {
      return { data: { signedUrl: blobUrls.get(key(path)) || "" }, error: null };
    },
    async remove(paths) {
      for (const p of paths || []) blobUrls.delete(key(p));
      return { data: [], error: null };
    },
    async list(prefix = "") {
      const head = key(prefix);
      const data = [...blobUrls.keys()]
        .filter((k) => k.startsWith(head))
        .map((k) => ({ name: k.slice(head.length).replace(/^\//, "") }));
      return { data, error: null };
    },
  };
}

// ---- client --------------------------------------------------------------

const signedOutAuth = {
  getSession: async () => ({ data: { session: null }, error: null }),
  getUser: async () => ({ data: { user: null }, error: null }),
  onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
};

// --- ledger RPCs (mirror property.ledger_post / ledger_void / ledger_ensure_default_chart) ---

const LEDGER_DIMS = ["property_id", "unit_id", "lease_id", "tenant_id", "owner_id", "vendor_id"];
const LINE_DIMS = [...LEDGER_DIMS, "bank_account_id", "job_id"];

const DEFAULT_CHART = [
  ["operating_cash", "1000", "Operating Cash", "Asset", "cash", false],
  ["trust_cash", "1010", "Trust Cash", "Asset", "cash", true],
  ["deposit_cash", "1020", "Security Deposit Trust Cash", "Asset", "cash", true],
  ["accounts_receivable", "1200", "Accounts Receivable", "Asset", "receivable", false],
  ["subsidy_receivable", "1220", "Housing Assistance Receivable", "Asset", "subsidy_receivable", false],
  ["capital_improvements", "1500", "Capital Improvements", "Asset", "fixed_asset", false],
  ["accounts_payable", "2000", "Accounts Payable", "Liability", "payable", false],
  ["security_deposits", "2100", "Security Deposits Held", "Liability", "deposits", true],
  ["deposit_interest_payable", "2110", "Deposit Interest Payable", "Liability", "deposits", true],
  ["prepaid_rent", "2200", "Prepaid Rent & Tenant Credits", "Liability", "prepaid", false],
  ["owner_equity", "3000", "Owner Equity", "Equity", "equity", false],
  ["owner_contributions", "3100", "Owner Contributions", "Equity", "contribution", false],
  ["owner_distributions", "3200", "Owner Distributions", "Equity", "distribution", false],
  ["rent_income", "4000", "Rental Income", "Income", "income", false],
  ["late_fee_income", "4010", "Late Fee Income", "Income", "income", false],
  ["application_fee_income", "4020", "Application Fee Income", "Income", "income", false],
  ["utility_income", "4030", "Utility Reimbursements", "Income", "income", false],
  ["cam_income", "4040", "CAM Recoveries", "Income", "income", false],
  ["concessions", "4050", "Concessions & Credits", "Income", "contra_income", false],
  ["hap_abatements", "4055", "HAP Abatements", "Income", "contra_income", false],
  ["other_income", "4100", "Other Income", "Income", "income", false],
  ["management_fee_income", "4500", "Management Fee Income", "Income", "income", false],
  ["repairs_maintenance", "5000", "Repairs & Maintenance", "Expense", "expense", false],
  ["utilities", "5100", "Utilities", "Expense", "expense", false],
  ["insurance", "5200", "Insurance", "Expense", "expense", false],
  ["property_taxes", "5300", "Property Taxes", "Expense", "expense", false],
  ["management_fees", "5400", "Management Fees", "Expense", "expense", false],
  ["payroll", "5500", "Payroll", "Expense", "expense", false],
  ["deposit_interest", "5600", "Deposit Interest Expense", "Expense", "expense", false],
  ["turnover", "5700", "Turnover & Make-ready", "Expense", "expense", false],
  ["bad_debt", "5800", "Bad Debt", "Expense", "expense", false],
];

const ledgerError = (message) => ({ data: null, error: { message } });
const cents = (n) => Math.round((Number(n) || 0) * 100);

// Period close (CORE-40), mirroring property.accounting_periods and its lock triggers.
const lockedThrough = (db, projectId) =>
  tableRows(db, "accounting_periods")
    .filter((p) => same(p.project_id, projectId) && p.status === "closed" && !p.deleted_at)
    .map((p) => p.period_end)
    .sort()
    .pop() || null;
const lockError = (date) => ({ data: null, error: { code: "GL001", message: `ledger: period closed through ${date}` } });
const nextDay = (date) => new Date(Date.parse(`${date}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);

function periodClose(db, { p_project, p_period_end, p_checklist = [], p_actor_name = null }) {
  const end = String(p_period_end || "");
  const start = `${end.slice(0, 7)}-01`;
  if (!end || nextDay(end).slice(8) !== "01") return ledgerError("A period closes on the last day of a month.");
  if (end >= nowIso().slice(0, 10)) return ledgerError("That month hasn't ended yet.");
  if ((p_checklist || []).some((c) => c.ok !== true && !String(c.note || "").trim())) return ledgerError("Add a note to every failing check before closing.");
  const locked = lockedThrough(db, p_project);
  if (locked && end <= locked) return ledgerError(`The books are already closed through ${locked}.`);
  if (locked && nextDay(locked) !== start) return ledgerError("Periods close in order: close the month after the last close first.");
  const rows = tableRows(db, "accounting_periods");
  const now = nowIso();
  const event = { action: "closed", at: now, byName: p_actor_name };
  let row = rows.find((r) => same(r.project_id, p_project) && r.period_start === start && r.kind === "month" && !r.deleted_at);
  if (row) Object.assign(row, { status: "closed", closed_at: now, closed_by_name: p_actor_name, checklist: p_checklist, metadata: { ...row.metadata, history: [...(row.metadata?.history || []), event] } });
  else {
    row = { id: crypto.randomUUID(), project_id: p_project, period_start: start, period_end: end, kind: "month", status: "closed", closed_at: now, closed_by_name: p_actor_name, checklist: p_checklist, metadata: { history: [event] }, created_at: now, updated_at: now, deleted_at: null };
    rows.push(row);
  }
  return { data: row.id, error: null };
}

function periodReopen(db, { p_id, p_reason, p_actor_name = null }) {
  const row = tableRows(db, "accounting_periods").find((r) => same(r.id, p_id) && !r.deleted_at);
  if (!row) return ledgerError("accounting_period_reopen: period not found");
  if (!String(p_reason || "").trim()) return ledgerError("Give a reason for reopening the period.");
  if (row.status !== "closed") return ledgerError("This period isn't closed.");
  if (row.period_end !== lockedThrough(db, row.project_id)) return ledgerError("Reopen the latest closed period first.");
  const now = nowIso();
  Object.assign(row, { status: "reopened", reopened_at: now, reopen_reason: String(p_reason).trim(), metadata: { ...row.metadata, history: [...(row.metadata?.history || []), { action: "reopened", at: now, byName: p_actor_name, reason: String(p_reason).trim() }] } });
  return { data: row.id, error: null };
}

function ledgerPost(db, { p_entry: e = {}, p_lines: lines = [] }) {
  const entries = tableRows(db, "ledger_entries");
  if (e.idempotency_key) {
    const dup = entries.find(
      (x) => x.idempotency_key === e.idempotency_key && same(x.project_id, e.project_id) && !x.deleted_at,
    );
    if (dup) return { data: dup.id, error: null };
  }
  const live = lines.filter((l) => cents(l.debit) || cents(l.credit));
  const locked = lockedThrough(db, e.project_id);
  if (locked && (e.entry_date || nowIso().slice(0, 10)) <= locked) return lockError(locked);
  const debit = live.reduce((t, l) => t + cents(l.debit), 0);
  const credit = live.reduce((t, l) => t + cents(l.credit), 0);
  if (!live.length || debit !== credit) return ledgerError("ledger_post: entry is not balanced");
  const now = nowIso();
  const id = e.id || crypto.randomUUID();
  const entry = {
    ...e,
    id,
    entry_date: e.entry_date || now.slice(0, 10),
    status: "posted",
    total: debit / 100,
    metadata: e.metadata || {},
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };
  entries.push(entry);
  const out = tableRows(db, "ledger_lines");
  live.forEach((l, i) => {
    const line = {
      ...l,
      id: crypto.randomUUID(),
      project_id: entry.project_id ?? null,
      entry_id: id,
      entry_date: entry.entry_date,
      line_no: i + 1,
      debit: cents(l.debit) / 100,
      credit: cents(l.credit) / 100,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    };
    for (const k of LEDGER_DIMS) if (!(k in l)) line[k] = entry[k] ?? null;
    for (const k of LINE_DIMS) if (!(k in line)) line[k] = null;
    out.push(line);
  });
  return { data: id, error: null };
}

function ledgerVoid(db, { p_entry_id, p_date, p_memo }) {
  const entries = tableRows(db, "ledger_entries");
  const original = entries.find((x) => same(x.id, p_entry_id) && !x.deleted_at);
  if (!original) return ledgerError("ledger_void: entry not found");
  if (original.status === "void") return ledgerError("ledger_void: entry is already void");
  if (original.reversal_of) return ledgerError("ledger_void: a reversal cannot be voided");
  const locked = lockedThrough(db, original.project_id);
  const date = [p_date || nowIso().slice(0, 10), original.entry_date, locked ? nextDay(locked) : ""].sort().pop();
  const memo = (text) => p_memo || `Void: ${text || ""}`;
  const now = nowIso();
  const id = crypto.randomUUID();
  entries.push({
    ...original,
    id,
    entry_date: date,
    memo: memo(original.memo || original.source_type),
    status: "posted",
    reversal_of: original.id,
    idempotency_key: null,
    // Mirrors property.ledger_void: the reversal keeps ownerExplicit so its owner tags still count (CORE-08).
    metadata: { voidOf: original.id, ...(original.metadata && "ownerExplicit" in original.metadata ? { ownerExplicit: original.metadata.ownerExplicit } : {}) },
    created_at: now,
    updated_at: now,
  });
  const lines = tableRows(db, "ledger_lines");
  for (const l of lines.filter((x) => same(x.entry_id, original.id) && !x.deleted_at)) {
    lines.push({
      ...l,
      id: crypto.randomUUID(),
      entry_id: id,
      entry_date: date,
      debit: l.credit,
      credit: l.debit,
      memo: memo(l.memo),
      applies_to_entry_id: l.applies_to_entry_id || original.id,
      metadata: l.metadata || {},
      created_at: now,
      updated_at: now,
    });
  }
  original.status = "void";
  original.voided_at = now;
  original.metadata = { ...(original.metadata || {}), voidEntryId: id };
  return { data: id, error: null };
}

function ledgerEnsureChart(db, { p_project_id = null }, chart = DEFAULT_CHART) {
  const accounts = tableRows(db, "gl_accounts");
  const scoped = (a) => same(a.project_id, p_project_id) && !a.deleted_at;
  let inserted = 0;
  for (const [key, number, name, type, subtype, trust] of chart) {
    if (accounts.some((a) => scoped(a) && a.system_key === key)) continue;
    // Adopt a same-number custom account only when its subtype agrees; a visible duplicate number beats moving its history into the wrong sub-ledger.
    const match = accounts.find((a) => scoped(a) && !a.system_key && a.number === number && a.account_type === type && (!a.subtype || a.subtype === subtype));
    if (match) {
      Object.assign(match, {
        system_key: key,
        is_system: true,
        is_trust: Boolean(match.is_trust || trust),
        subtype: match.subtype || subtype,
      });
      continue;
    }
    const now = nowIso();
    accounts.push({
      id: crypto.randomUUID(),
      project_id: p_project_id,
      name,
      number,
      account_type: type,
      subtype,
      is_trust: trust,
      is_system: true,
      system_key: key,
      status: "Active",
      metadata: {},
      created_at: now,
      updated_at: now,
      deleted_at: null,
    });
    inserted += 1;
  }
  return { data: inserted, error: null };
}

// The RPCs the data layer calls, served from the in-memory store.
async function sandboxRpc(name, args = {}) {
  if (name === "ledger_post") return ledgerPost(await getStore(), args);
  if (name === "ledger_void") return ledgerVoid(await getStore(), args);
  if (name === "ledger_ensure_default_chart") return ledgerEnsureChart(await getStore(), args);
  if (name === "ledger_ensure_accounts") {
    const chart = (args.p_accounts || []).map((a) => [a.system_key, a.number, a.name, a.account_type, a.subtype, Boolean(a.is_trust)]);
    return ledgerEnsureChart(await getStore(), args, chart);
  }
  if (name === "ledger_locked_through") return { data: lockedThrough(await getStore(), args.p_project), error: null };
  if (name === "accounting_period_close") return periodClose(await getStore(), args);
  if (name === "accounting_period_reopen") return periodReopen(await getStore(), args);
  if (name === "merge_meta") {
    const db = await getStore();
    const row = tableRows(db, args.p_table).find((r) => same(r.id, args.p_id) && !r.deleted_at);
    if (!row) return { data: null, error: null };
    row.metadata = { ...(row.metadata || {}), ...(args.p_patch || {}) };
    row.updated_at = nowIso();
    return { data: clone(row.metadata), error: null };
  }
  return { data: null, error: null };
}

// Shared, read-only reference tables that are the same in every workspace; the
// playground reads them from the real database instead of the sample store.
const REFERENCE_TABLES = new Set(["legal_jurisdictions", "legal_resources"]);

// `realClient` lazily builds the real browser client (null when Supabase isn't
// configured) — its auth and the reference-table reads are used.
export function createSandboxClient(realClient) {
  const client = {
    from: (table) => {
      const real = REFERENCE_TABLES.has(table) ? realClient() : null;
      return real ? real.from(table) : new SandboxQuery(table);
    },
    schema: () => client,
    rpc: sandboxRpc,
    storage: { from: sandboxBucket },
    get auth() {
      return realClient()?.auth ?? signedOutAuth;
    },
  };
  return client;
}
