// Owner shares at report time (CORE-08). Property-level lines stay untagged and each owner's share comes from
// effective-dated property_owners rows; only owner-specific entries (distributions, contributions, journals with
// metadata.ownerExplicit) carry owner_id, and the manager's side of a fee (metadata.side = "manager") is no owner's.
// Pure: rows may be camel (data layers) or snake (raw PostgREST); dates are "YYYY-MM-DD".

export const OWNER_SOURCE_TYPES = ["distribution", "contribution"];

const day = (v) => (v ? String(v).slice(0, 10) : "");
const START = "0000-01-01";

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

// How a line splits across owners → [{ ownerId, share }]: owner-specific lines are wholly their owner's,
// manager-side lines are no owner's, property lines split by the percentages in force on the line's date.
export function lineShares(line, idx) {
  if (!line || isManagerSide(line)) return [];
  const tag = ownerTagOf(line);
  if (tag) return [{ ownerId: tag, share: 1 }];
  if (!line.propertyId) return [];
  const per = new Map();
  for (const r of ownersOn(idx, line.propertyId, line.date)) per.set(r.ownerId, (per.get(r.ownerId) || 0) + r.pct);
  return [...per].map(([ownerId, pct]) => ({ ownerId, share: Math.min(pct, 100) / 100 }));
}

export const ownerShare = (line, ownerId, idx) => lineShares(line, idx).find((s) => s.ownerId === ownerId)?.share || 0;

// One owner's view of the ledger: the lines they have a share of, debit and credit scaled by that share.
export function ownerScopedLines(lines, ownerId, idx) {
  const out = [];
  for (const l of lines || []) {
    const share = ownerShare(l, ownerId, idx);
    if (share <= 0) continue;
    out.push({ ...l, share, debit: (Number(l.debit) || 0) * share, credit: (Number(l.credit) || 0) * share });
  }
  return out;
}

// A property's ownership timeline → [{ from, to, rows }] ("" = open-ended), adjacent equal segments not merged.
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

// Ranges where a property's live ownership doesn't total 100% → [{ from, to, total }]; before the first owner
// and after the last one aren't gaps, an empty stretch between owners is.
export function ownershipGaps(idx, propertyId) {
  const totals = runs(
    segments(idx, propertyId).map((s) => ({ from: s.from, to: s.to, value: Math.round(s.rows.reduce((t, r) => t + r.pct, 0) * 100) / 100 })),
  );
  while (totals.length && totals[0].value === 0) totals.shift();
  while (totals.length && totals[totals.length - 1].value === 0) totals.pop();
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
