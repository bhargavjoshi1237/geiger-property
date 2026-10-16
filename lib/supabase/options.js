"use client";

import { listProperties } from "./properties";
import { listUnits } from "./units";
import { listTenants } from "./tenants";
import { leasesLayer } from "./leases";
import { vendorsLayer } from "./vendors";
import { ownersLayer } from "./owners";
import { glAccountsLayer } from "./gl_accounts";
import { prospectsLayer } from "./prospects";
import { workOrdersLayer } from "./work_orders";

// Option loaders for relation pickers (FieldsForm `type: "relation"` and create
// dialogs via loadCreateOptions). Each returns [{ value, label, patch }] where
// `patch` keeps the denormalized display columns in sync with the chosen id.

const unitName = (u, propsById) => {
  const prop = propsById.get(u.propertyId);
  return prop?.name ? `${prop.name} · ${u.label}` : u.label || "Unit";
};

export async function propertyOptions() {
  const rows = (await listProperties()) ?? [];
  return rows.map((p) => ({
    value: p.id,
    label: p.name || "Untitled property",
    patch: { propertyName: p.name || "" },
  }));
}

export async function unitOptions() {
  const [units, props] = await Promise.all([listUnits(), listProperties()]);
  const propsById = new Map((props ?? []).map((p) => [p.id, p]));
  return (units ?? []).map((u) => {
    const prop = propsById.get(u.propertyId);
    return {
      value: u.id,
      label: unitName(u, propsById),
      patch: {
        unit: unitName(u, propsById),
        propertyId: u.propertyId || "",
        propertyName: prop?.name || "",
      },
    };
  });
}

export async function tenantOptions() {
  const rows = (await listTenants()) ?? [];
  return rows.map((t) => ({
    value: t.id,
    label: t.unit ? `${t.name} · ${t.unit}` : t.name || "Tenant",
    patch: { tenantName: t.name || "" },
  }));
}

export async function leaseOptions() {
  const rows = (await leasesLayer.list()) ?? [];
  return rows.map((l) => ({
    value: l.id,
    label: l.name || "Lease",
    patch: {
      leaseName: l.name || "",
      tenantId: l.tenantId || "",
      tenantName: l.tenantName || "",
      unitId: l.unitId || "",
      unit: l.unit || "",
    },
  }));
}

export async function vendorOptions() {
  const rows = (await vendorsLayer.list()) ?? [];
  return rows.map((v) => ({
    value: v.id,
    label: v.specialty ? `${v.name} · ${v.specialty}` : v.name || "Vendor",
    patch: { vendorName: v.name || "" },
  }));
}

export async function ownerOptions() {
  const rows = (await ownersLayer.list()) ?? [];
  return rows.map((o) => ({ value: o.id, label: o.name || "Owner", patch: { ownerName: o.name || "" } }));
}

export async function glAccountOptions() {
  const rows = (await glAccountsLayer.list()) ?? [];
  return rows
    .filter((a) => a.status !== "Inactive")
    .map((a) => {
      const label = a.number ? `${a.number} · ${a.name}` : a.name;
      return { value: label, label, patch: {} };
    });
}

export async function prospectOptions() {
  const rows = (await prospectsLayer.list()) ?? [];
  return rows.map((p) => ({ value: p.id, label: p.name || "Prospect", patch: { prospectName: p.name || "" } }));
}

export async function workOrderOptions() {
  const rows = (await workOrdersLayer.list()) ?? [];
  return rows.map((w) => ({ value: w.id, label: w.name || "Work order", patch: { workOrderLabel: w.name || "" } }));
}
