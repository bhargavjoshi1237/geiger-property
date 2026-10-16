"use client";

import { useEffect, useState } from "react";

import { getUser, getUserCached } from "@/lib/supabase/user";
import { getSetting } from "@/lib/supabase/settings";
import { getProperty } from "@/lib/supabase/properties";
import { resolvePolicies } from "@/lib/policies";

// Work-order editor helpers: status-history bookkeeping and the effective
// maintenance policies for the work order's property.

export const metaOf = (item, key) => item?.metadata?.[key] ?? item?.[key];
export const listMeta = (item, key) => {
  const v = metaOf(item, key);
  return Array.isArray(v) ? v : [];
};

export async function actorName() {
  const u = getUserCached() || (await getUser());
  return u?.name || "You";
}

// One commit partial that moves `item` to `next` and appends a statusHistory
// entry (plus start/complete stamps) so the column and its history land together.
export async function statusPartial(item, next, { note = "", meta = {} } = {}) {
  const by = await actorName();
  const at = new Date().toISOString();
  const history = listMeta(item, "statusHistory");
  const entry = { id: crypto.randomUUID(), status: next, from: item.status || "", at, by, note };
  const metadata = { ...(item.metadata || {}), ...meta, statusHistory: [entry, ...history].slice(0, 100) };
  if (next === "In progress" && !metadata.startedAt) metadata.startedAt = at;
  if (next === "Completed" && !metadata.completedDate) metadata.completedDate = at.slice(0, 10);
  if (next !== "Completed" && item.status === "Completed") metadata.reopenedAt = at;
  return { status: next, metadata };
}

// Wrap a section's onCommit so a status edit records history too.
export const withStatusHistory = (item, onCommit) => async (partial) => {
  if ("status" in partial && partial.status !== item.status) {
    const sp = await statusPartial(item, partial.status, { meta: partial.metadata || {} });
    return onCommit({ ...partial, ...sp });
  }
  return onCommit(partial);
};

// Effective policies ({ key: { value, source } }) for a property, or null while loading.
export function usePropertyPolicies(propertyId) {
  const [state, setState] = useState({ key: null, value: null });
  useEffect(() => {
    let alive = true;
    Promise.all([getSetting("fees_policies", {}), propertyId ? getProperty(propertyId) : null]).then(
      ([company, property]) => {
        if (alive) setState({ key: propertyId || "", value: resolvePolicies({ company: company || {}, property }) });
      },
    );
    return () => {
      alive = false;
    };
  }, [propertyId]);
  return state.key === (propertyId || "") ? state.value : null;
}

export async function loadPropertyPolicies(propertyId) {
  const [company, property] = await Promise.all([
    getSetting("fees_policies", {}),
    propertyId ? getProperty(propertyId) : null,
  ]);
  return resolvePolicies({ company: company || {}, property });
}

export const SOURCE_LABEL = { company: "company default", property: "property override", lease: "lease" };
