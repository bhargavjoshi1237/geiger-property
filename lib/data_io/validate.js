import { isBalanceEntity } from "./import_spec";
import { extKey, planEntry } from "./index";
import { importRowId } from "./ids";
import { normName, parseTyped } from "./values";
import { planBalanceRow, finishBalances } from "./balances";

// Import validation and planning (PLAT-03), pure: mapped rows + the project's records → per-row status, messages and the
// writes a commit makes, in dependency order. The same plan runs at Validate (every row) and at each commit chunk (fresh
// records), so what commits is always re-checked. Row result: { rowNo, status, messages: [{ level, field?, text }],
// ops: [{ op: "insert" | "update", table, id, values, before? }], primary: { table, id, action }, billing?: [leaseId] }.

export const LIVE_LEASE = ["Active", "Expiring soon", "Month-to-month", "Notice given", "Eviction"];
export const DEDUPE = ["skip", "update"];
const ROW_STATUSES = ["valid", "warning", "error", "skipped"];
export { ROW_STATUSES };

const TABLE_LABEL = { properties: "property", units: "unit", owners: "owner", vendors: "vendor", tenants: "tenant", leases: "lease", property_owners: "ownership", lease_parties: "lease party" };
const isLive = (status) => LIVE_LEASE.includes(status);
const blank = (v) => v === null || v === undefined || v === "";
const joinName = (...parts) => parts.map((p) => String(p || "").trim()).filter(Boolean).join(" ");
const lower = (v) => String(v || "").trim().toLowerCase();

// --- Row result ------------------------------------------------------------------------------------

function rowResult(rowNo) {
  const r = { rowNo, messages: [], ops: [], primary: null, billing: [], lines: [] };
  r.error = (text, field) => r.messages.push({ level: "error", text, ...(field ? { field } : {}) });
  r.warn = (text, field) => r.messages.push({ level: "warning", text, ...(field ? { field } : {}) });
  r.info = (text, field) => r.messages.push({ level: "info", text, ...(field ? { field } : {}) });
  r.failed = () => r.messages.some((m) => m.level === "error");
  return r;
}

export function rowStatus(r) {
  if (r.messages.some((m) => m.level === "error")) return "error";
  if (r.primary?.action === "skip" && !r.ops.length && !r.lines.length) return "skipped";
  if (r.messages.some((m) => m.level === "warning")) return "warning";
  return "valid";
}

// Typed values for every mapped field; parse problems become row errors. Custom fields gather in `custom`.
function typed(spec, mapped, r) {
  const values = {};
  const others = {};
  const custom = {};
  for (const fld of spec.fields) {
    const raw = mapped?.[fld.key];
    if (blank(raw)) continue;
    const res = parseTyped(fld.type === "reference" ? "text" : fld.type, raw, fld);
    if (!res.ok) {
      r.error(`${fld.label}: ${res.error}`, fld.key);
      continue;
    }
    if (blank(res.value)) continue;
    if (fld.target === "metadata") custom[fld.key] = res.value;
    else values[fld.key] = res.value;
    if (res.others?.length) others[fld.key] = res.others;
  }
  return { values, others, custom };
}

// Only the keys with a value (an empty cell never wipes a field).
const pick = (v, keys) => Object.fromEntries(keys.filter((k) => !blank(v[k])).map((k) => [k, v[k]]));

const same = (a, b) => {
  if (blank(a) && blank(b)) return true;
  if (typeof a === "number" || typeof b === "number") return Number(a) === Number(b);
  if (typeof a === "boolean" || typeof b === "boolean") return Boolean(a) === Boolean(b);
  return String(a ?? "").slice(0, 10) === String(b ?? "").slice(0, 10) && String(a ?? "") === String(b ?? "").slice(0, String(a ?? "").length);
};

// --- Context ------------------------------------------------------------------------------------------

// c: { jobId, entity, spec, source, options: { dedupe, createMissing, billingStartsOn, … }, today, ix, … }.
function meta(c, r, extra = {}) {
  return { importJobId: c.jobId, importRowNo: r.rowNo, ...extra };
}
const withExt = (c, id) => (id ? { externalIds: { [c.source || "generic"]: String(id).trim() } } : {});

function insert(c, r, table, kind, values, metaExtra = {}) {
  const id = importRowId(c.jobId, r.rowNo, kind);
  const row = { id, ...values, metadata: meta(c, r, metaExtra) };
  r.ops.push({ op: "insert", table, id, values: row });
  return planEntry(c.ix, table, row, { job: c.jobId, rowNo: r.rowNo });
}

// An update of `entry` to `values` (only changed columns); planned rows are patched in place instead.
function update(c, r, entry, values, metaPatch = null) {
  if (entry.planned) {
    Object.assign(entry.row, values);
    if (metaPatch) entry.row.metadata = { ...entry.row.metadata, ...metaPatch };
    return true;
  }
  const changed = Object.fromEntries(Object.entries(values).filter(([k, v]) => !same(v, entry.row[k])));
  if (metaPatch) {
    const cur = entry.row.metadata || {};
    const next = { ...cur, ...metaPatch, ...(metaPatch.externalIds ? { externalIds: { ...(cur.externalIds || {}), ...metaPatch.externalIds } } : {}) };
    if (JSON.stringify(next) !== JSON.stringify(cur)) changed.metadata = next;
  }
  if (!Object.keys(changed).length) return false;
  const before = Object.fromEntries(Object.keys(changed).map((k) => [k, entry.row[k] ?? null]));
  r.ops.push({ op: "update", table: entry.table, id: entry.id, values: changed, before });
  Object.assign(entry.row, changed);
  return true;
}

const ours = (c, r, entry) => entry && entry.job === c.jobId && entry.rowNo === r.rowNo;
const earlierRow = (c, r, entry) => entry && entry.job === c.jobId && entry.rowNo !== r.rowNo && entry.rowNo !== null;

// The row's own record (create / update / skip) for a natural-key match `hit`.
function upsertPrimary(c, r, table, hit, values, metaExtra = {}) {
  if (ours(c, r, hit)) {
    r.primary = { table, id: hit.id, action: "create" };
    return hit;
  }
  if (hit) {
    if (c.options.dedupe === "update") {
      const changed = update(c, r, hit, values, Object.keys(metaExtra).length ? metaExtra : null);
      r.primary = { table, id: hit.id, action: changed ? "update" : "skip" };
      if (!changed) r.info(`Already in Geiger with these details.`);
      return hit;
    }
    r.primary = { table, id: hit.id, action: "skip" };
    r.info(`Already in Geiger — skipped (duplicates: skip).`);
    return hit;
  }
  const entry = insert(c, r, table, table, values, metaExtra);
  r.primary = { table, id: entry.id, action: "create" };
  return entry;
}

// --- Lookups ----------------------------------------------------------------------------------------------

function resolveProperty(c, r, name, { field = "property_id", create = false } = {}) {
  if (blank(name)) return null;
  const hit = c.ix.properties.first("name", normName(name)) || c.ix.properties.first("address", normName(name)) || c.ix.properties.first("ext", extKey(c.source, name));
  if (hit) return hit;
  if (!create) {
    r.error(`Property "${name}" isn't in Geiger — import properties first.`, field);
    return null;
  }
  const created = insert(c, r, "properties", "property", { name: String(name).trim(), status: "Active" });
  r.warn(`Creates property "${name}".`, field);
  return created;
}

function resolveByName(c, r, table, value, label, field, scope = "") {
  if (blank(value)) return null;
  const hit = scope ? c.ix[table].first("scoped", `${scope}|${normName(value)}`) || c.ix[table].first("name", normName(value)) : c.ix[table].first("name", normName(value));
  if (!hit) r.warn(`${label} "${value}" isn't in Geiger — left blank.`, field);
  return hit;
}

function liveLeaseConflict(c, r, unitEntry, start, ignoreId) {
  const others = c.ix.leases.find("unit", unitEntry.id).filter((l) => l.id !== ignoreId && isLive(l.row.status) && String(l.row.term_start || "").slice(0, 10) !== start);
  return others[0] || null;
}

const where = (c, entry) => (entry.planned || entry.job === c.jobId ? `row ${entry.rowNo}` : "in Geiger");

// --- Entity planners ---------------------------------------------------------------------------------------

function planProperties(c, r, v, t) {
  if (!v.name) return r.error("Property name is required.", "name");
  const hit = c.ix.properties.first("name", normName(v.name)) || (v.external_id ? c.ix.properties.first("ext", extKey(c.source, v.external_id)) : null);
  if (earlierRow(c, r, hit)) return r.error(`Same property as row ${hit.rowNo}.`, "name");
  const values = pick(v, ["name", "address", "city", "state", "zip", "type", "status", "year_built", "description"]);
  if (v.portfolio_id) {
    const p = resolveByName(c, r, "portfolios", v.portfolio_id, "Portfolio", "portfolio_id");
    if (p) values.portfolio_id = p.id;
  }
  upsertPrimary(c, r, "properties", hit, values, { ...withExt(c, v.external_id), ...t.custom });
}

function planUnits(c, r, v, t) {
  const property = resolveProperty(c, r, v.property_id, { create: c.options.createMissing });
  if (!v.property_id) r.error("Property is required.", "property_id");
  if (!v.label) r.error("Unit number is required.", "label");
  if (r.failed() || !property) return;
  const hit = c.ix.units.first("label", `${property.id}|${normName(v.label)}`) || (v.external_id ? c.ix.units.first("ext", extKey(c.source, v.external_id)) : null);
  if (earlierRow(c, r, hit)) return r.error(`Same unit as row ${hit.rowNo}.`, "label");
  const values = { ...pick(v, ["label", "floor", "bedrooms", "bathrooms", "sqft", "rent", "deposit", "status"]), property_id: property.id };
  if (v.building_id) {
    const b = resolveByName(c, r, "buildings", v.building_id, "Building", "building_id", property.id);
    if (b) values.building_id = b.id;
  }
  for (const [key, table, label] of [["unit_type_id", "unit_types", "Unit type"], ["floor_plan_id", "floor_plans", "Floor plan"]]) {
    if (!v[key]) continue;
    const hitRef = resolveByName(c, r, table, v[key], label, key);
    if (hitRef) values[key] = hitRef.id;
  }
  if (!hit && !values.status) values.status = "Vacant";
  upsertPrimary(c, r, "units", hit, values, { ...withExt(c, v.external_id), ...t.custom });
}

function contactOthers(t) {
  const out = {};
  if (t.others.email?.length || t.others["tenant.email"]?.length) out.otherEmails = t.others.email || t.others["tenant.email"];
  if (t.others.phone?.length || t.others["tenant.phone"]?.length) out.otherPhones = t.others.phone || t.others["tenant.phone"];
  return out;
}

function planOwners(c, r, v, t) {
  const name = v.name || joinName(v.first_name, v.last_name) || v.company;
  if (!name) return r.error("Owner name is required (or first and last name).", "name");
  const property = v["ownership.property_id"] ? resolveProperty(c, r, v["ownership.property_id"], { field: "ownership.property_id" }) : null;
  if (r.failed()) return;
  let hit = (v.email && c.ix.owners.first("email", lower(v.email))) || (v.external_id && c.ix.owners.first("ext", extKey(c.source, v.external_id))) || c.ix.owners.first("name", normName(name));
  const values = { ...pick(v, ["company", "email", "phone", "management_fee_pct", "payout_method", "tax_id_last4", "since", "status"]), name };
  if (earlierRow(c, r, hit)) {
    // A later row for the same owner only adds another property they own.
    if (!property) return r.error(`Same owner as row ${hit.rowNo}.`, "name");
    r.primary = { table: "owners", id: hit.id, action: "link" };
    r.info(`Same owner as row ${hit.rowNo} — adds ${property.row.name}.`);
  } else hit = upsertPrimary(c, r, "owners", hit, values, { ...withExt(c, v.external_id), ...contactOthers(t), ...t.custom });
  if (!property || !hit) return;
  const pct = v["ownership.ownership_pct"] ?? 100;
  const pair = c.ix.property_owners.first("pair", `${hit.id}|${property.id}`);
  const share = { owner_id: hit.id, owner_name: hit.row.name || name, property_id: property.id, property_name: property.row.name || "", ownership_pct: pct, ...pick(v, ["ownership.starts_on"]) };
  if (v["ownership.starts_on"]) share.starts_on = v["ownership.starts_on"];
  delete share["ownership.starts_on"];
  if (v["ownership.is_primary"] !== undefined) share.is_primary = v["ownership.is_primary"];
  if (pair && !ours(c, r, pair)) {
    if (c.options.dedupe === "update") update(c, r, pair, { ownership_pct: pct, ...(share.starts_on ? { starts_on: share.starts_on } : {}) });
  } else if (!pair) insert(c, r, "property_owners", "ownership", share);
  const total = c.ix.property_owners.find("property", property.id).filter((x) => !x.row.ends_on).reduce((s, x) => s + Number(x.row.ownership_pct || 0), 0);
  if (total > 100.001) r.warn(`${property.row.name} is now owned ${Math.round(total * 100) / 100}% in total.`, "ownership.ownership_pct");
}

function planVendors(c, r, v, t) {
  if (!v.name) return r.error("Vendor name is required.", "name");
  const hit = (v.email && c.ix.vendors.first("email", lower(v.email))) || (v.external_id && c.ix.vendors.first("ext", extKey(c.source, v.external_id))) || c.ix.vendors.first("name", normName(v.name));
  if (earlierRow(c, r, hit)) return r.error(`Same vendor as row ${hit.rowNo}${v.email && hit.row.email === lower(v.email) ? " (same email)" : ""}.`, v.email ? "email" : "name");
  upsertPrimary(c, r, "vendors", hit, pick(v, ["name", "contact_name", "email", "phone", "specialty", "hourly_rate", "insurance_expiry", "status"]), { ...withExt(c, v.external_id), ...contactOthers(t), ...t.custom });
}

// A unit by label within its property (or old-system id); created when the job allows it.
function resolveUnit(c, r, { propertyName, label, ext, unitValues = {} }) {
  let unit = ext ? c.ix.units.first("ext", extKey(c.source, ext)) : null;
  if (unit) return unit;
  if (blank(propertyName)) {
    r.error(ext && !label ? `No unit has the old-system ID "${ext}" — import the units (or rent roll) first.` : "Property is required.", "property_id");
    return null;
  }
  const property = resolveProperty(c, r, propertyName, { create: c.options.createMissing });
  if (!property) return null;
  if (blank(label)) {
    r.error(ext ? `No unit has the old-system ID "${ext}" — import the units (or rent roll) first.` : "Unit is required.", "unit_id");
    return null;
  }
  unit = c.ix.units.first("label", `${property.id}|${normName(label)}`);
  if (unit) return unit;
  if (!c.options.createMissing) {
    r.error(`Unit "${label}" isn't in Geiger at ${property.row.name} — import units first (or turn on Create missing units).`, "unit_id");
    return null;
  }
  r.info(`Creates unit ${label} at ${property.row.name}.`, "unit_id");
  return insert(c, r, "units", "unit", { label: String(label).trim(), property_id: property.id, status: "Vacant", ...unitValues }, withExt(c, ext));
}

function planTenants(c, r, v, t) {
  const name = v.name || joinName(v.first_name, v.last_name);
  if (!name) return r.error("Tenant name is required (or first and last name).", "name");
  const unit = v.unit_id ? resolveUnit(c, r, { propertyName: v.property_id, label: v.unit_id }) : null;
  const property = !unit && v.property_id ? resolveProperty(c, r, v.property_id) : null;
  if (r.failed()) return;
  const byEmail = v.email ? c.ix.tenants.first("email", lower(v.email)) : null;
  const hit = byEmail || (v.external_id && c.ix.tenants.first("ext", extKey(c.source, v.external_id))) || c.ix.tenants.first("nameUnit", `${normName(name)}|${unit?.id || ""}`);
  if (earlierRow(c, r, hit)) return r.error(byEmail ? `Duplicate email ${lower(v.email)} — same as row ${hit.rowNo}.` : `Same tenant as row ${hit.rowNo}.`, byEmail ? "email" : "name");
  const values = { ...pick(v, ["email", "phone", "status"]), name };
  if (unit) Object.assign(values, { unit_id: unit.id, unit: unit.row.label, property_id: unit.row.property_id });
  else if (property) values.property_id = property.id;
  if (!hit && !values.status) values.status = "Current";
  upsertPrimary(c, r, "tenants", hit, values, { ...withExt(c, v.external_id), ...contactOthers(t), ...t.custom });
}

// Lease status from its dates when the file has none.
export function deriveLeaseStatus(v, today) {
  if (v.move_out_date && v.move_out_date <= today) return "Ended";
  if (v.term_start && v.term_start > today) return "Pending";
  if (v.term_end && v.term_end < today) return "Month-to-month";
  return "Active";
}
const tenantStatusFor = (lease) => (["Ended", "Terminated", "Renewed"].includes(lease) ? "Past" : ["Pending", "Draft"].includes(lease) ? "Future" : lease === "Notice given" ? "Notice" : "Current");

function planLeases(c, r, v, t) {
  const tenantName = v["tenant.name"] || joinName(v["tenant.first_name"], v["tenant.last_name"]);
  const hasTenant = Boolean(tenantName || v["tenant.email"]);
  const unitValues = pick({ sqft: v["unit.sqft"], bedrooms: v["unit.bedrooms"], bathrooms: v["unit.bathrooms"], rent: v["unit.rent"] }, ["sqft", "bedrooms", "bathrooms", "rent"]);
  const unit = resolveUnit(c, r, { propertyName: v.property_id, label: v.unit_id, ext: v["unit.external_id"], unitValues });
  if (!unit) return;
  if (!hasTenant) {
    // A vacant unit on a rent roll: the unit is all there is.
    r.primary = { table: "units", id: unit.id, action: ours(c, r, unit) ? "create" : "skip" };
    if (!ours(c, r, unit)) r.info("Vacant unit already in Geiger — nothing to add.");
    return;
  }
  if (!v.term_start) r.error("Lease start is required for a row with a tenant.", "term_start");
  if (blank(v.rent)) r.error("Monthly rent is required for a row with a tenant.", "rent");
  if (v.term_end && v.term_start && v.term_end < v.term_start) r.error("Lease end is before lease start.", "term_end");
  if (v.rent < 0) r.error("Monthly rent can't be negative.", "rent");
  if (r.failed()) return;

  const status = v.status || deriveLeaseStatus(v, c.today);
  const live = isLive(status);
  const name = tenantName || v["tenant.email"];
  const ext = v["tenant.external_id"];
  let tenant =
    (v["tenant.email"] && c.ix.tenants.first("email", lower(v["tenant.email"]))) ||
    (ext && c.ix.tenants.first("ext", extKey(c.source, ext))) ||
    c.ix.tenants.first("nameUnit", `${normName(name)}|${unit.id}`);
  const tenantContact = pick({ email: v["tenant.email"], phone: v["tenant.phone"] }, ["email", "phone"]);
  const tenantMeta = { ...withExt(c, ext), ...contactOthers(t) };

  const start = v.term_start;
  const existing = c.ix.leases.first("unitStart", `${unit.id}|${start}`);
  const leaseValues = {
    ...pick(v, ["rent", "deposit", "term_end", "lease_type", "term_type", "signed_date", "move_in_date", "notice_date", "move_out_date"]),
    term_start: start,
    status,
  };

  // A second tenant on the same unit and start date in this file joins that lease.
  if (existing && earlierRow(c, r, existing)) {
    if (tenant && c.ix.lease_parties.first("pair", `${existing.id}|${tenant.id}`)) return r.error(`Same tenant and lease as row ${existing.rowNo}.`, "tenant.name");
    if (!tenant) tenant = insert(c, r, "tenants", "tenant", { name, ...tenantContact, unit: unit.row.label, unit_id: unit.id, property_id: unit.row.property_id, lease_id: existing.id, lease_start: start, lease_end: v.term_end || null, status: tenantStatusFor(status) }, tenantMeta);
    insert(c, r, "lease_parties", "party", { lease_id: existing.id, tenant_id: tenant.id, role: "tenant", name: tenant.row.name || name, email: tenant.row.email || null, phone: tenant.row.phone || null, is_primary: false });
    r.primary = { table: "lease_parties", id: importRowId(c.jobId, r.rowNo, "party"), action: "create" };
    r.info(`Joins the lease on row ${existing.rowNo} as a co-tenant.`);
    return;
  }

  // Tenant: link an existing one (filling contact details on "update"), else create.
  if (tenant && earlierRow(c, r, tenant)) r.info(`Same tenant as row ${tenant.rowNo}.`);
  else if (tenant && !ours(c, r, tenant) && c.options.dedupe === "update") update(c, r, tenant, tenantContact, Object.keys(tenantMeta).length ? tenantMeta : null);
  if (!tenant) tenant = insert(c, r, "tenants", "tenant", { name, ...tenantContact, unit: unit.row.label, unit_id: unit.id, property_id: unit.row.property_id, status: tenantStatusFor(status) }, tenantMeta);

  if (existing && !ours(c, r, existing)) {
    r.primary = { table: "leases", id: existing.id, action: "skip" };
    // A tenant the lease doesn't name yet joins it as a co-tenant (adding a person is never a duplicate).
    const joins = existing.row.tenant_id !== tenant.id && !c.ix.lease_parties.first("pair", `${existing.id}|${tenant.id}`);
    if (joins) {
      const party = insert(c, r, "lease_parties", "party", { lease_id: existing.id, tenant_id: tenant.id, role: "tenant", name: tenant.row.name || name, email: tenant.row.email || null, phone: tenant.row.phone || null, is_primary: false });
      if (!tenant.row.lease_id) update(c, r, tenant, { lease_id: existing.id, lease_start: start, lease_end: v.term_end || null, status: tenantStatusFor(existing.row.status) });
      r.primary = { table: "lease_parties", id: party.id, action: "create" };
      r.info(`Joins the lease already in Geiger (${existing.row.name || "lease"}) as a co-tenant.`);
    }
    if (c.options.dedupe === "update") {
      // A derived status never overwrites one already in Geiger; only the file's own status does.
      const { status: _derived, ...changes } = leaseValues;
      if (update(c, r, existing, v.status ? { ...changes, status: v.status } : changes, Object.keys(t.custom).length ? t.custom : null) && !joins) r.primary.action = "update";
      else if (!joins) r.info("Lease already in Geiger with these details.");
    } else if (!joins) r.info("Lease already in Geiger — skipped (duplicates: skip).");
    return;
  }
  if (live) {
    const clash = liveLeaseConflict(c, r, unit, start, existing?.id);
    if (clash) return r.error(`Unit ${unit.row.label} already has an active lease (${clash.row.tenant_name || "tenant"}, from ${String(clash.row.term_start || "").slice(0, 10)}, ${where(c, clash)}).`, "unit_id");
  }
  const lease =
    existing ||
    insert(
      c,
      r,
      "leases",
      "lease",
      { ...leaseValues, name: `${unit.row.label} — ${tenant.row.name || name}`, unit: unit.row.label, unit_id: unit.id, property_id: unit.row.property_id, tenant_id: tenant.id, tenant_name: tenant.row.name || name },
      { ...withExt(c, v.external_id), ...t.custom, ...(live && c.options.billingStartsOn ? { billingStartsOn: c.options.billingStartsOn } : {}) },
    );
  r.primary = { table: "leases", id: lease.id, action: "create" };
  if (!existing) insert(c, r, "lease_parties", "party", { lease_id: lease.id, tenant_id: tenant.id, role: "tenant", name: tenant.row.name || name, email: tenant.row.email || null, phone: tenant.row.phone || null, responsibility_pct: 100, is_primary: true });

  // The tenant and unit point at a live (or their only) lease.
  const link = { lease_id: lease.id, unit: unit.row.label, unit_id: unit.id, property_id: unit.row.property_id, lease_start: start, lease_end: v.term_end || null, status: tenantStatusFor(status) };
  if (live || !tenant.row.lease_id) update(c, r, tenant, link);
  if (live && !unit.row.tenant_id) {
    update(c, r, unit, { tenant_id: tenant.id, occupant_name: tenant.row.name || name, lease_start: start, lease_end: v.term_end || null, status: status === "Notice given" ? "Notice" : "Occupied" });
  }
  if (live) r.billing.push(lease.id);
}

const PLANNERS = { properties: planProperties, units: planUnits, owners: planOwners, vendors: planVendors, tenants: planTenants, leases: planLeases };

// --- Entry points ----------------------------------------------------------------------------------------------

// One row → its result (ops added to the context's index so later rows see them).
export function planRow(rec, c) {
  const r = rowResult(rec.rowNo);
  const t = typed(c.spec, rec.mapped || {}, r);
  if (isBalanceEntity(c.entity)) planBalanceRow(c, r, t.values, t);
  else if (!r.failed()) PLANNERS[c.entity](c, r, t.values, t);
  // A typing error leaves nothing to write.
  if (r.failed()) {
    r.ops = [];
    r.lines = [];
    r.billing = [];
  }
  r.status = rowStatus(r);
  return r;
}

// Rows → { results, problems } — problems are job-level (an unbalanced trial balance refuses every row).
export function planRows(records, c) {
  const results = (records || []).map((rec) => planRow(rec, c));
  const problems = isBalanceEntity(c.entity) ? finishBalances(results, c) : [];
  return { results, problems };
}

// Counts by row status.
export function statusCounts(results) {
  const out = { total: results.length, valid: 0, warning: 0, error: 0, skipped: 0 };
  for (const r of results) out[r.status] = (out[r.status] || 0) + 1;
  return out;
}

export const labelOf = (table) => TABLE_LABEL[table] || table;
