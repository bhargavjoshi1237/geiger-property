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

// `realClient` lazily builds the real browser client (null when Supabase isn't
// configured) — only its auth is used.
export function createSandboxClient(realClient) {
  const client = {
    from: (table) => new SandboxQuery(table),
    schema: () => client,
    rpc: async () => ({ data: null, error: null }),
    storage: { from: sandboxBucket },
    get auth() {
      return realClient()?.auth ?? signedOutAuth;
    },
  };
  return client;
}
