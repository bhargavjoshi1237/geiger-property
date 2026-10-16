// ChildRecords adapters for leasing child tables. Values whose keys aren't real
// columns of the child layer are folded into the child row's metadata bag so
// nothing a dialog collects is silently dropped.

const SKIP = ["id", "metadata", "createdAt", "createdBy", "projectId"];

function split(layer, values, base = {}) {
  const cols = {};
  const meta = { ...(base.metadata || {}) };
  for (const [k, v] of Object.entries(values)) {
    if (SKIP.includes(k)) continue;
    if (layer.columnKeys.includes(k)) cols[k] = v;
    else meta[k] = v;
  }
  return { ...cols, metadata: meta };
}

// Adapter over a child layer keyed by `parentKey`; `extra(item)` adds link columns on create.
export function layerAdapter(layer, parentKey, { extra, where } = {}) {
  return {
    load: (item) => layer.list({ [parentKey]: item.id, ...(where || {}) }),
    create: (item, values) =>
      layer.create({
        id: crypto.randomUUID(),
        ...split(layer, values),
        ...(extra ? extra(item) : {}),
        [parentKey]: item.id,
      }),
    update: (row, values) => layer.update(row.id, split(layer, values, row)),
    remove: (row) => layer.softDelete(row.id),
  };
}

// Link columns most leasing children carry, copied from the lease.
export const leaseLinks = (lease) => ({
  tenantId: lease.tenantId || "",
  tenantName: lease.tenantName || "",
  unitId: lease.unitId || "",
  unit: lease.unit || "",
  propertyId: lease.propertyId || "",
});
