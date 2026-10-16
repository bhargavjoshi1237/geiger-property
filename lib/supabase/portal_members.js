import { makeEntityData } from "./entity_factory";

// Data-access layer for self-service portal access (owns `property.portal_members`):
// one row per tenant / owner / vendor invited to the resident, owner or vendor
// portal. Staff screens read it here; invites and disables go through
// /api/portal/staff/access (lib/portal/staff_api.js) so the email is sent server-side.
export const portalMembersLayer = makeEntityData({
  table: "portal_members",
  tag: "portalMembers",
  fields: [
    { key: "email", col: "email", type: "text" },
    { key: "name", col: "name", type: "text" },
    { key: "role", col: "role", type: "text", default: "resident" },
    { key: "tenantId", col: "tenant_id", type: "uuid" },
    { key: "ownerId", col: "owner_id", type: "uuid" },
    { key: "vendorId", col: "vendor_id", type: "uuid" },
    { key: "status", col: "status", type: "text", default: "invited" },
    { key: "authUserId", col: "auth_user_id", type: "uuid" },
    { key: "invitedAt", col: "invited_at", type: "date" },
    { key: "inviteCount", col: "invite_count", type: "number" },
    { key: "activatedAt", col: "activated_at", type: "date" },
    { key: "lastSeenAt", col: "last_seen_at", type: "date" },
  ],
});

const PARTY_KEY = { tenant: "tenantId", owner: "ownerId", vendor: "vendorId" };

// The live portal membership for one staff record (or null).
export async function getPortalMember(partyType, partyId) {
  const key = PARTY_KEY[partyType];
  if (!key || !partyId) return null;
  const rows = await portalMembersLayer.list({ [key]: partyId });
  return rows?.[0] ?? null;
}

export const listPortalMembers = () => portalMembersLayer.list();
