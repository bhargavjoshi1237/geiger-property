import { recordItemsLayer } from "./record_items";
import { groupByOwner } from "@/lib/compliance";

// Read helpers over `property.record_items` for compliance documents (tenant
// renters insurance, vendor COIs and licenses). Pure: null on failure.

// Every record of one kind owned by one entity type (e.g. tenant insurance_policy).
export const listComplianceItems = (ownerType, kind) => recordItemsLayer.list({ ownerType, kind });

// Map(ownerId → rows) for one owner type + kind; empty Map when the DB is absent.
export async function complianceByOwner(ownerType, kind) {
  return groupByOwner((await listComplianceItems(ownerType, kind)) ?? []);
}
