// Owner shares at report time (CORE-08): property lines split by effective-dated property_owners, owner-specific entries belong to their owner, manager-side lines to no owner.

export const OWNER_SOURCE_TYPES = ["distribution", "contribution"];

const day = (v) => (v ? String(v).slice(0, 10) : "");
const START = "0000-01-01";
const norm = (s) => String(s || "").trim().toLowerCase();
const cents = (n) => Math.round((Number(n) || 0) * 100);
const EPS = 1e-9;

const shiftDay = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// Does this entry belong to one owner, so its owner_id counts?
export function isOwnerSpecific(entry) {
  if (!entry) return false;
  const type = entry.sourceType ?? entry.source_type;
  return OWNER_SOURCE_TYPES.includes(type) || Boolean(entry.metadata?.ownerExplicit);
}

// The owner a line belongs to outright ("" for property-level lines); a stray tag on a non-owner entry is ignored.
export function ownerTagOf(line) {
  const id = line?.ownerId || "";
  if (!id) return "";
  return !line.entry || isOwnerSpecific(line.entry) ? id : "";
}

export const isManagerSide = (line) => line?.metadata?.side === "manager";

function normalizeRow(r) {
  const raw = r.ownershipPct ?? r.ownership_pct;
  const pct = raw === null || raw === undefined || raw === "" ? 100 : Number(raw);
  return {
    ownerId: r.ownerId ?? r.owner_id ?? "",
    propertyId: r.propertyId ?? r.property_id ?? "",
    pct: Number.isFinite(pct) ? Math.min(Math.max(pct, 0), 100) : 100,
    startsOn: day(r.startsOn ?? r.starts_on),
    endsOn: day(r.endsOn ?? r.ends_on),
    isPrimary: Boolean(r.isPrimary ?? r.is_primary),
  };
}

// property_owners rows → { rows, byProperty, byOwner } (soft-deleted and incomplete rows dropped).
export function ownershipIndex(rows) {
  const out = { rows: [], byProperty: new Map(), byOwner: new Map() };
  for (const r of rows || []) {
    if (!r || r.deletedAt || r.deleted_at) continue;
    const row = normalizeRow(r);
    if (!row.ownerId || !row.propertyId) continue;
    out.rows.push(row);
    if (!out.byProperty.has(row.propertyId)) out.byProperty.set(row.propertyId, []);
    out.byProperty.get(row.propertyId).push(row);
    if (!out.byOwner.has(row.ownerId)) out.byOwner.set(row.ownerId, []);
    out.byOwner.get(row.ownerId).push(row);
  }
  return out;
}

// An owner's legacy "Properties & Splits" metadata → property_owners-shaped rows (property matched by id, else name).
export function legacyOwnershipRows(owner, properties) {
  const meta = owner?.metadata || {};
  const splits = [meta.splits, meta.properties, meta.propertySplits].find((v) => Array.isArray(v) && v.length) || [];
  const list = Array.isArray(properties) ? properties : [];
  const byId = new Map(list.map((p) => [p.id, p]));
  const byName = new Map(list.map((p) => [norm(p.name), p]));
  return splits
    .map((s) => {
      const prop = byId.get(s?.propertyId) || byName.get(norm(s?.propertyName || s?.name || s?.label));
      const raw = Number(s?.percent ?? s?.pct ?? s?.ownership ?? s?.share);
      return prop ? { ownerId: owner.id, propertyId: prop.id, ownershipPct: raw > 0 ? Math.min(raw, 100) : 100 } : null;
    })
    .filter(Boolean);
}

// Ownership rows for one owner's statement: the property_owners rows, plus the owner's legacy splits when they have none.
export function statementOwnershipRows(owner, propertyOwners, properties) {
  const rows = Array.isArray(propertyOwners) ? propertyOwners : [];
  const has = rows.some((r) => (r.ownerId ?? r.owner_id) === owner?.id && !(r.deletedAt || r.deleted_at));
  return has || !owner ? rows : [...rows, ...legacyOwnershipRows(owner, properties)];
}

// PostgREST `or` filter for an owner's ledger lines: tagged to them, or on any property they've owned.
export function ownerLinesFilter(ownerId, propertyIds = []) {
  const props = [...new Set((propertyIds || []).filter(Boolean))];
  return props.length ? `owner_id.eq.${ownerId},property_id.in.(${props.join(",")})` : `owner_id.eq.${ownerId}`;
}

export const isLiveOn = (row, date) => {
  const d = day(date) || START;
  return (!row.startsOn || row.startsOn <= d) && (!row.endsOn || row.endsOn >= d);
};

// Ownership rows in force for a property on a date (the building block for date-aware owner resolvers).
export const ownersOn = (idx, propertyId, date) => (idx?.byProperty.get(propertyId) || []).filter((r) => isLiveOn(r, date));

// An owner's percentage of a property on a date (0–100; several live rows add up).
export function pctOn(idx, propertyId, ownerId, date) {
  const pct = ownersOn(idx, propertyId, date)
    .filter((r) => r.ownerId === ownerId)
    .reduce((s, r) => s + r.pct, 0);
  return Math.min(pct, 100);
}

// Property ids an owner held at any point in a date range.
export const heldInRange = (idx, ownerId, { from, to } = {}) => [
  ...new Set(
    (idx?.byOwner.get(ownerId) || [])
      .filter((r) => (!r.startsOn || !to || r.startsOn <= to) && (!r.endsOn || !from || r.endsOn >= from))
      .map((r) => r.propertyId),
  ),
];

// Nominal split of a line → [{ ownerId, share, isPrimary }]: owner-specific lines are wholly their owner's, manager-side lines no owner's, property lines by the % in force on the line's date.
export function lineShares(line, idx) {
  if (!line || isManagerSide(line)) return [];
  const tag = ownerTagOf(line);
  if (tag) return [{ ownerId: tag, share: 1, isPrimary: true }];
  if (!line.propertyId) return [];
  const per = new Map();
  for (const r of ownersOn(idx, line.propertyId, line.date)) {
    const cur = per.get(r.ownerId) || { ownerId: r.ownerId, pct: 0, isPrimary: false };
    cur.pct += r.pct;
    cur.isPrimary = cur.isPrimary || r.isPrimary;
    per.set(r.ownerId, cur);
  }
  return [...per.values()].map((o) => ({ ownerId: o.ownerId, share: Math.min(o.pct, 100) / 100, isPrimary: o.isPrimary }));
}

export const ownerShare = (line, ownerId, idx) => lineShares(line, idx).find((s) => s.ownerId === ownerId)?.share || 0;

// Whole cents of one amount across shares by largest remainder (ties: primary, then ownerId); under 100% the leftover cents stay unassigned.
function splitCents(total, shares) {
  if (!total || !shares.length) return { parts: shares.map(() => 0), unassigned: total };
  const sum = shares.reduce((s, x) => s + x.share, 0);
  const full = sum >= 1 - EPS;
  const scale = sum > 1 + EPS ? sum : 1;
  const pool = full ? total : Math.floor(total * sum + EPS);
  const exact = shares.map((x) => (total * x.share) / scale);
  const parts = exact.map((e) => Math.floor(e + EPS));
  let left = pool - parts.reduce((s, p) => s + p, 0);
  const order = shares
    .map((x, i) => ({ i, rem: Math.round((exact[i] - parts[i]) * 1e6), primary: x.isPrimary ? 0 : 1, ownerId: x.ownerId }))
    .sort((a, b) => b.rem - a.rem || a.primary - b.primary || String(a.ownerId).localeCompare(String(b.ownerId)));
  for (let k = 0; left > 0 && k < order.length; k += 1, left -= 1) parts[order[k].i] += 1;
  for (let k = order.length - 1; left < 0 && k >= 0; k -= 1, left += 1) parts[order[k].i] -= 1;
  return { parts, unassigned: total - parts.reduce((s, p) => s + p, 0) };
}

// A line split into whole cents → { owners: [{ ownerId, share, debit, credit }], unassigned: { debit, credit } }; parts always sum to the line.
export function lineAllocation(line, idx) {
  const shares = lineShares(line, idx);
  const dr = splitCents(cents(line?.debit), shares);
  const cr = splitCents(cents(line?.credit), shares);
  return {
    owners: shares.map((s, i) => ({ ownerId: s.ownerId, share: s.share, debit: dr.parts[i] / 100, credit: cr.parts[i] / 100 })),
    unassigned: { debit: dr.unassigned / 100, credit: cr.unassigned / 100 },
  };
}

// One owner's view of the ledger: the lines they have a share of, debit and credit cut to their whole-cent allocation.
export function ownerScopedLines(lines, ownerId, idx) {
  const out = [];
  for (const l of lines || []) {
    const mine = lineAllocation(l, idx).owners.find((o) => o.ownerId === ownerId);
    if (!mine || mine.share <= 0) continue;
    out.push({ ...l, share: mine.share, debit: mine.debit, credit: mine.credit });
  }
  return out;
}

// A property's ownership timeline → [{ from, to, rows }] ("" = open-ended).
function segments(idx, propertyId) {
  const rows = idx?.byProperty.get(propertyId) || [];
  const points = new Set([START]);
  for (const r of rows) {
    if (r.startsOn) points.add(r.startsOn);
    if (r.endsOn) points.add(shiftDay(r.endsOn, 1));
  }
  const sorted = [...points].sort();
  return sorted.map((from, i) => ({
    from: from === START ? "" : from,
    to: i + 1 < sorted.length ? shiftDay(sorted[i + 1], -1) : "",
    rows: rows.filter((r) => isLiveOn(r, from)),
  }));
}

const overlaps = (seg, from, to) => (!to || !seg.from || seg.from <= to) && (!from || !seg.to || seg.to >= from);

// Merge neighbours that carry the same value → [{ from, to, value }].
function runs(list) {
  const out = [];
  for (const s of list) {
    const last = out[out.length - 1];
    if (last && last.value === s.value) last.to = s.to;
    else out.push({ ...s });
  }
  return out;
}

// Ranges where live ownership doesn't total 100% → [{ from, to, total }]; before the first / after the last owner only count where the ledger has activity.
export function ownershipGaps(idx, propertyId, { firstActivity = "", lastActivity = "" } = {}) {
  if (!idx?.byProperty.get(propertyId)?.length) return [];
  const totals = runs(
    segments(idx, propertyId).map((s) => ({ from: s.from, to: s.to, value: Math.round(s.rows.reduce((t, r) => t + r.pct, 0) * 100) / 100 })),
  );
  const first = day(firstActivity);
  const last = day(lastActivity);
  const lead = totals[0];
  if (lead?.value === 0) {
    if (first && (!lead.to || lead.to >= first)) lead.from = lead.from && lead.from > first ? lead.from : first;
    else totals.shift();
  }
  const tail = totals[totals.length - 1];
  if (tail?.value === 0) {
    if (last && (!tail.from || tail.from <= last)) tail.to = tail.to && tail.to < last ? tail.to : last;
    else totals.pop();
  }
  return totals.filter((t) => t.value !== 100).map((t) => ({ from: t.from, to: t.to, total: t.value }));
}

// An owner's percentages of a property across a date range, in date order (e.g. [60, 40] after a change on the 15th).
export function pctHistory(idx, propertyId, ownerId, { from, to } = {}) {
  const list = segments(idx, propertyId)
    .filter((s) => overlaps(s, day(from), day(to)))
    .map((s) => ({ from: s.from, to: s.to, value: Math.min(s.rows.filter((r) => r.ownerId === ownerId).reduce((t, r) => t + r.pct, 0), 100) }));
  return runs(list)
    .filter((r) => r.value > 0)
    .map((r) => r.value);
}

// "60%", or "60% → 40%" when the share changed within the range ("" when the owner held none of it).
export const shareLabel = (pcts) => (pcts || []).map((p) => `${Math.round(p * 100) / 100}%`).join(" → ");
