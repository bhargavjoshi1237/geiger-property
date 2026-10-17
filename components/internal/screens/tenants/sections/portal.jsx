"use client";

import { MailPlus, Power, RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SectionCard, StatusPill } from "@/components/internal/shared/screen_kit";
import { FieldsForm } from "@/components/internal/screens/entity/fields_form";
import { InfoNotice, MiniStat } from "@/components/internal/screens/people/notice";
import { PORTAL_STATUS_MAP, formatDateTime } from "@/components/internal/screens/people/shared";
import { portalAddress } from "@/lib/portal/staff_api";
import { portalStatusOf } from "../shared";

const PERMISSION_FIELDS = [
  { key: "portalInviteEmail", label: "Login email", type: "email", meta: true, hint: "Defaults to the tenant's email." },
  { key: "portalAllowPayments", label: "Pay rent online", type: "switch", meta: true },
  { key: "portalAllowRequests", label: "Submit maintenance requests", type: "switch", meta: true },
  { key: "portalAllowDocuments", label: "View documents", type: "switch", meta: true },
  { key: "portalAllowMessages", label: "Message the office", type: "switch", meta: true },
  { key: "portalShowLedger", label: "Show ledger & balance", type: "switch", meta: true },
];

// Resident portal access (portal_enabled / portal_last_seen + invite state in metadata).
export function TenantPortalSection({ item, onPatch, onCommit, onCommitMeta, runAction }) {
  const status = portalStatusOf(item);
  const m = item.metadata || {};

  return (
    <div className="space-y-4">
      <InfoNotice>
        Invited residents sign in at <span className="text-foreground">{portalAddress()}</span> with a one-time link sent to
        their login email. The resident portal must be switched on in Settings → Branding &amp; Portals.
      </InfoNotice>

      <SectionCard
        title="Access"
        action={
          <div className="flex flex-wrap gap-2">
            {item.portalEnabled ? (
              <Button variant="outline" className="border-border bg-surface-card hover:bg-surface-hover" onClick={() => runAction("disablePortal")}>
                <Power className="h-4 w-4" /> Disable
              </Button>
            ) : null}
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => runAction("invitePortal")}>
              {status === "Invited" ? <RotateCw className="h-4 w-4" /> : <MailPlus className="h-4 w-4" />}
              {status === "Invited" ? "Resend Invite" : "Invite to Portal"}
            </Button>
          </div>
        }
      >
        <div className="grid gap-x-6 gap-y-5 sm:grid-cols-3">
          <MiniStat label="Status">
            <StatusPill status={status} map={PORTAL_STATUS_MAP} />
          </MiniStat>
          <MiniStat label="Invited">{formatDateTime(m.portalInvitedAt)}</MiniStat>
          <MiniStat label="Last seen">{formatDateTime(item.portalLastSeen)}</MiniStat>
        </div>
      </SectionCard>

      <SectionCard title="Permissions" description="What this resident can do in the portal.">
        <FieldsForm item={item} fields={PERMISSION_FIELDS} onPatch={onPatch} onCommit={onCommit} onCommitMeta={onCommitMeta} />
      </SectionCard>
    </div>
  );
}

export default TenantPortalSection;
