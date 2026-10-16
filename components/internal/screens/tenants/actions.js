import { toast } from "sonner";
import { Ban, LogOut, MailPlus, Power, ShieldOff, UserPlus } from "lucide-react";

import { leasePartiesLayer } from "@/lib/supabase/lease_parties";
import { leasesLayer } from "@/lib/supabase/leases";
import { createCommunication } from "@/lib/supabase/tenant_communications";
import { getUser } from "@/lib/supabase/user";
import { announceInvite, disablePortalAccess, invitePortalAccess } from "@/lib/portal/staff_api";
import { joinableLeaseOptions } from "@/components/internal/screens/people/options";
import { opts } from "@/components/internal/screens/people/shared";
import { RESTRICTION_KEYS, activeRestrictions, portalStatusOf, todayISO } from "./shared";

// Header actions for the tenant editor (lifecycle wizards + portal toggles).

const ROLE_OPTIONS = [
  { value: "tenant", label: "Tenant (financially responsible)" },
  { value: "cosigner", label: "Co-signer" },
  { value: "guarantor", label: "Guarantor" },
  { value: "occupant", label: "Occupant" },
];

// Record an outbound portal message in the tenant's notifications log (best effort).
const logPortalMessage = (tenantId, subject) =>
  createCommunication({
    id: crypto.randomUUID(),
    tenantId,
    channel: "portal",
    direction: "outbound",
    subject,
    body: "",
    occurredAt: "",
    metadata: { deliveryStatus: "Sent" },
  });

export const tenantActions = [
  {
    key: "invitePortal",
    label: "Invite to portal",
    icon: MailPlus,
    showIf: (t) => portalStatusOf(t) !== "Active",
    // Server creates the portal member, mirrors access onto the tenant, and emails the invite.
    run: async ({ item, reload }) => {
      const email = item.metadata?.portalInviteEmail || item.email;
      if (!email) {
        toast.error("Add an email for this tenant first.");
        return;
      }
      const res = await invitePortalAccess({ partyType: "tenant", partyId: item.id, email });
      if (!announceInvite(res, email)) return;
      if (res.emailed) logPortalMessage(item.id, `Resident portal invitation emailed to ${email}`);
      reload();
    },
  },
  {
    key: "disablePortal",
    label: "Disable portal access",
    icon: Power,
    showIf: (t) => Boolean(t.portalEnabled),
    run: async ({ item, reload }) => {
      const res = await disablePortalAccess({ partyType: "tenant", partyId: item.id });
      if (!res.ok) {
        toast.error(res.error || "Couldn't disable portal access.");
        return;
      }
      toast.success("Portal access disabled.");
      reload();
    },
  },
  {
    key: "addToLease",
    label: "Add to lease",
    icon: UserPlus,
    wizard: {
      title: "Add to lease",
      description: "Put this person on a lease as a tenant, co-signer, guarantor, or occupant.",
      finishLabel: "Add to lease",
      logSummary: "Added to a lease",
      initial: (t) => ({ role: "tenant", responsibilityPct: 100, isPrimary: !t.leaseId, setCurrent: !t.leaseId }),
      steps: [
        {
          key: "lease",
          title: "Lease",
          fields: [
            { key: "leaseId", label: "Lease", type: "relation", load: joinableLeaseOptions, required: true, full: true },
            { key: "role", label: "Role", type: "select", options: ROLE_OPTIONS, required: true },
            {
              key: "responsibilityPct",
              label: "Rent responsibility",
              type: "percent",
              min: 0,
              max: 100,
              showIf: (v) => v.role === "tenant" || v.role === "cosigner",
            },
            { key: "isPrimary", label: "Primary tenant on this lease", type: "switch", showIf: (v) => v.role === "tenant" },
            {
              key: "setCurrent",
              label: "Make this the tenant's current lease",
              type: "switch",
              showIf: (v) => v.role === "tenant",
              hint: "Also links the lease's unit to this tenant.",
            },
          ],
          validate: (v) =>
            Number(v.responsibilityPct) < 0 || Number(v.responsibilityPct) > 100 ? "Responsibility must be 0–100%." : null,
        },
      ],
      finish: async (v, { item, commit, commitMeta }) => {
        const party = await leasePartiesLayer.create({
          id: crypto.randomUUID(),
          leaseId: v.leaseId,
          tenantId: item.id,
          role: v.role,
          name: item.name,
          email: item.email,
          phone: item.phone,
          responsibilityPct: ["tenant", "cosigner"].includes(v.role) ? Number(v.responsibilityPct) || 0 : 0,
          isPrimary: v.role === "tenant" && Boolean(v.isPrimary),
        });
        if (!party) {
          toast.error("Couldn't add this tenant to the lease.");
          return false;
        }
        // Primary tenant: point the lease back at this tenant when it has none.
        if (v.role === "tenant" && v.isPrimary) {
          const lease = await leasesLayer.get(v.leaseId);
          if (lease && !lease.tenantId) await leasesLayer.update(v.leaseId, { tenantId: item.id, tenantName: item.name });
        }
        if (v.role === "tenant" && v.setCurrent) {
          const link = { leaseId: v.leaseId };
          if (v.unitId) Object.assign(link, { unitId: v.unitId, unit: v.unit });
          if (v.propertyId) link.propertyId = v.propertyId;
          await commit(link);
        }
        await commitMeta({ lastLeaseLinkAt: new Date().toISOString() });
        toast.success(`Added to ${v.leaseName || "the lease"} as ${v.role}.`);
        return true;
      },
    },
  },
  {
    key: "recordRestriction",
    label: "Record payment restriction",
    icon: Ban,
    wizard: {
      title: "Record payment restriction",
      description: "Limit how this tenant can pay. Applies to rent collection and the resident portal.",
      finishLabel: "Save restriction",
      logSummary: "Recorded a payment restriction",
      initial: (t) => ({
        ...Object.fromEntries(RESTRICTION_KEYS.map((r) => [r.key, Boolean(t.metadata?.[r.key])])),
        restrictionReason: t.metadata?.restrictionReason || "",
        restrictionSetOn: todayISO(),
      }),
      steps: [
        {
          key: "restriction",
          title: "Restriction",
          fields: [
            ...RESTRICTION_KEYS.map((r) => ({ key: r.key, label: r.label, type: "switch" })),
            { key: "restrictionReason", label: "Reason", type: "textarea", required: true },
            { key: "restrictionSetBy", label: "Set by", type: "text", placeholder: "Defaults to you" },
            { key: "restrictionSetOn", label: "Effective", type: "date", required: true },
            { key: "restrictionReviewOn", label: "Review on", type: "date" },
          ],
          validate: (v) => (RESTRICTION_KEYS.some((r) => v[r.key]) ? null : "Pick at least one restriction."),
        },
      ],
      finish: async (v, { commitMeta, navigate }) => {
        const setBy = v.restrictionSetBy || (await getUser())?.name || "";
        const patch = {
          ...Object.fromEntries(RESTRICTION_KEYS.map((r) => [r.key, Boolean(v[r.key])])),
          restrictionReason: v.restrictionReason,
          restrictionSetBy: setBy,
          restrictionSetOn: v.restrictionSetOn,
          restrictionReviewOn: v.restrictionReviewOn || "",
        };
        const ok = await commitMeta(patch);
        if (ok) {
          toast.success("Payment restriction saved.");
          navigate("restrictions");
        }
        return ok;
      },
    },
  },
  {
    key: "clearRestrictions",
    label: "Clear payment restrictions",
    icon: ShieldOff,
    showIf: (t) => activeRestrictions(t).length > 0,
    run: async ({ commitMeta, log }) => {
      const ok = await commitMeta({
        ...Object.fromEntries(RESTRICTION_KEYS.map((r) => [r.key, false])),
        restrictionClearedOn: todayISO(),
      });
      if (!ok) return;
      log("Cleared payment restrictions");
      toast.success("Payment restrictions cleared.");
    },
  },
  {
    key: "moveToPast",
    label: "Move to past tenant",
    icon: LogOut,
    separatorBefore: true,
    showIf: (t) => t.status !== "Past",
    wizard: {
      title: "Move to past tenant",
      description: "Record the move-out and keep forwarding details for the final statement and deposit return.",
      finishLabel: "Move to past",
      logSummary: "Moved to past tenant",
      initial: (t) => ({
        moveOutDate: t.metadata?.moveOutDate || todayISO(),
        noticeGivenOn: t.metadata?.noticeGivenOn || "",
        moveOutReason: t.metadata?.moveOutReason || "",
        forwardingEmail: t.metadata?.forwardingEmail || t.email || "",
        forwardingPhone: t.metadata?.forwardingPhone || t.phone || "",
        endLease: Boolean(t.leaseId),
        disablePortal: Boolean(t.portalEnabled),
      }),
      steps: [
        {
          key: "moveOut",
          title: "Move-out",
          fields: [
            { key: "moveOutDate", label: "Move-out date", type: "date", required: true },
            { key: "noticeGivenOn", label: "Notice given on", type: "date" },
            {
              key: "moveOutReason",
              label: "Reason",
              type: "select",
              options: opts("Bought a home", "Relocating", "Rent increase", "Unit size", "Eviction", "Lease ended", "Other"),
            },
            { key: "endLease", label: "Set lease end to move-out date", type: "switch" },
            { key: "disablePortal", label: "Disable portal access", type: "switch" },
          ],
        },
        {
          key: "forwarding",
          title: "Forwarding",
          description: "Where to send the final statement and deposit refund.",
          fields: [
            { key: "forwardingEmail", label: "Email", type: "email" },
            { key: "forwardingPhone", label: "Phone", type: "phone" },
            { key: "forwardingLine1", label: "Street address", type: "text", full: true },
            { key: "forwardingCity", label: "City", type: "text" },
            { key: "forwardingState", label: "State", type: "text" },
            { key: "forwardingZip", label: "ZIP code", type: "text" },
          ],
        },
      ],
      finish: async (v, { commit, commitMeta, navigate }) => {
        const cols = { status: "Past" };
        if (v.endLease) cols.leaseEnd = v.moveOutDate;
        if (v.disablePortal) cols.portalEnabled = false;
        const ok = await commit(cols);
        if (!ok) return false;
        const meta = {
          moveOutDate: v.moveOutDate,
          noticeGivenOn: v.noticeGivenOn || "",
          moveOutReason: v.moveOutReason || "",
          forwardingEmail: v.forwardingEmail || "",
          forwardingPhone: v.forwardingPhone || "",
          forwardingLine1: v.forwardingLine1 || "",
          forwardingCity: v.forwardingCity || "",
          forwardingState: v.forwardingState || "",
          forwardingZip: v.forwardingZip || "",
          depositDisposition: "Pending",
        };
        if (v.disablePortal) meta.portalStatus = "Disabled";
        await commitMeta(meta);
        toast.success("Moved to past tenants.");
        navigate("moveOut");
        return true;
      },
    },
  },
];

export default tenantActions;
